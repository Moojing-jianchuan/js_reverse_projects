// tdc_key.mjs — 从腾讯天御 tdc.js 静态提取 XTEA 密钥并解密 collect
//
//   node tools/tdc_key.mjs <tdc.js> [collect.txt|collect.json]
//
// 全部本地离线：只读 tdc.js + 已有的反汇编产物；不联网、不开浏览器、不装依赖。
// 依赖（已存在则直接复用，缺失时用 tools/vmp/*.mjs 现场生成）：
//   src/_vmp/<build>.disasm.ins.json   指令流（含 role 语义标签）
//
// 关键结论（详见 src/TDC_KEY_FINDINGS.md）：
//   1) 加密是 XTEA，32 轮，ECB，8 字节/块，(v0,v1) 为小端 u32；
//   2) key 数组 = 4 个 32 位字，来源是「4 个字节码字符码 + 常量偏移」按 (c+K)<<(8*i) 拼出；
//   3) 代码把 key 索引分支成多份内联副本，每份给 key[i] 追加一个常量 S[i]，等价于有效密钥 EK[i]=key[i]+S[i]，
//      S 形如 [s0,0,s2,0]（与第三方成熟实现日志里的 offsets=(460573,0,197394,0) 同构）；
//   4) 因此解密 = 标准 XTEA 解密，密钥用 EK。
//
// 顺序/常量的最终消歧用「解密结果必须是 JSON」这个 oracle 完成（24 排列 × S 候选），不写死。

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const VMP = path.join(ROOT, 'tools', 'vmp');

const DELTA = 0x9e3779b9;

/* ------------------------------------------------------------------ */
/* 0. 反汇编产物准备                                                    */
/* ------------------------------------------------------------------ */

function buildKeyName(tdcPath) {
  return path.basename(tdcPath).replace(/\.js$/i, '');
}

function ensureDisasm(tdcPath) {
  const name = buildKeyName(tdcPath);
  const cand = [
    path.join(ROOT, 'src', '_vmp', `${name}.disasm.ins.json`),
    path.join(ROOT, 'src', '_vmp', `${name.toLowerCase()}.disasm.ins.json`),
  ];
  for (const c of cand) if (fs.existsSync(c)) return { file: c, built: false };

  // 现场生成：strings → bytecode → opcodes → disasm（复用子任务脚本，不改动）
  const outDir = path.join(ROOT, 'src', '_vmp');
  fs.mkdirSync(outDir, { recursive: true });
  const folded = path.join(outDir, `${name}.folded.js`);
  const stringsJson = path.join(outDir, `${name}.strings.json`);
  const bcJson = path.join(outDir, `${name}.bytecode.json`);
  const opJson = path.join(outDir, `${name}.opcodes.json`);
  const disJson = path.join(outDir, `${name}.disasm.json`);
  const insJson = path.join(outDir, `${name}.disasm.ins.json`);
  if (fs.existsSync(insJson)) return { file: insJson, built: true };
  const run = (script, args) => {
    execFileSync(process.execPath, [path.join(VMP, script), ...args], { stdio: 'inherit', cwd: ROOT });
  };
  try {
    if (!fs.existsSync(folded)) run('strings.mjs', [tdcPath, stringsJson, '--fold', folded]);
    if (!fs.existsSync(bcJson)) run('bytecode.mjs', [folded, tdcPath, bcJson]);
    if (!fs.existsSync(opJson)) run('opcodes.mjs', [folded, opJson]);
    if (!fs.existsSync(disJson)) run('disasm.mjs', [bcJson, opJson, disJson]);
    if (!fs.existsSync(insJson)) {
      // disasm.mjs 在部分版本里直接产出 .ins.json
      const alt = disJson.replace(/\.disasm\.json$/, '.disasm.ins.json');
      if (fs.existsSync(alt)) return { file: alt, built: true };
      return { file: null, built: true, error: `反汇编未生成（缺 ${path.basename(insJson)}）` };
    }
    return { file: insJson, built: true };
  } catch (e) {
    return { file: null, built: true, error: '反汇编流水线失败：' + String(e.message || e).split('\n')[0] };
  }
}

/* ------------------------------------------------------------------ */
/* 1. 反汇编上的字符串重建（用于识别 charCodeAt 调用点）                 */
/* ------------------------------------------------------------------ */

function reconstructStrings(ins) {
  const strs = new Map();         // reg -> string
  const readAt = new Map();       // ip -> {objReg, keyStr}
  const snapshots = new Map();    // reg -> [{ip, val}]
  const push = (reg, val, ip) => {
    if (!snapshots.has(reg)) snapshots.set(reg, []);
    const a = snapshots.get(reg);
    if (a.length > 800) a.shift();
    a.push({ ip, val });
  };
  // STR_APP2/STR_APP：字符码落在奇数下标（每 (目标寄存器, 字符码) 一对，可有 1~3 对）
  const codesOf = o => {
    const out = [];
    for (let i = 1; i < o.length; i += 2) if (Number.isFinite(o[i])) out.push(String.fromCharCode(o[i]));
    return out.join('');
  };
  for (const x of ins) {
    const op = x.role, o = x.ops;
    if (op === 'STR_INIT') { strs.set(o[0], ''); push(o[0], '', x.ip); }
    else if (op === 'STR_APP2' || op === 'STR_APP') {
      const s = (strs.get(o[0]) || '') + codesOf(o);
      strs.set(o[0], s); push(o[0], s, x.ip);
    } else if (op === 'STR_INIT_APP') { const s = String.fromCharCode(o[1]); strs.set(o[0], s); push(o[0], s, x.ip); }
    else if (op === 'STR_APP_THEN_READ' || op === 'STR_APP_THEN_REENTRY') {
      const r = o[0];
      const s = (strs.get(r) || '') + String.fromCharCode(o[1]);
      strs.set(r, s); push(r, s, x.ip);
      // [strReg, chr, dest, objReg, keyReg]
      const objReg = o[3], keyReg = o[4];
      if (objReg != null) readAt.set(x.ip, { objReg, keyStr: strs.get(keyReg) });
    } else if (op === 'PROP_READ_DYN' || op === 'PROP_READ_DYN_N' || op === 'PROP_WRITE_DYN') {
      // [dest, objReg, keyReg]
      readAt.set(x.ip, { objReg: o[1], keyStr: strs.get(o[2]) });
    } else if (op === 'CALL') {
      const t = o[2];
      if (strs.has(t)) readAt.set(x.ip, { objReg: t, keyStr: '<callThis>' });
    }
  }
  return { readAt, snapshots };
}

/* ------------------------------------------------------------------ */
/* 2. 密钥候选：charCodeAt 打包点 → (4 字符, 常量) → 32 位字             */
/* ------------------------------------------------------------------ */

function lastStringBefore(snapshots, reg, ip) {
  const a = snapshots.get(reg);
  if (!a) return null;
  let best = null;
  for (const e of a) if (e.ip < ip) best = e;
  return best ? best.val : null;
}

function extractKeyCandidates(ins) {
  const { readAt, snapshots } = reconstructStrings(ins);
  const idx = new Map(ins.map((x, i) => [x.ip, i]));
  const cands = new Map(); // word -> {count, sites:[{ip,chars,K,by}]}

  const add = (word, ip, chars, K, by) => {
    const w = word >>> 0;
    if (!cands.has(w)) cands.set(w, { count: 0, sites: [] });
    const e = cands.get(w);
    e.count++;
    if (e.sites.length < 6) e.sites.push({ ip, chars, K, by });
  };

  for (let i = 0; i < ins.length; i++) {
    const x = ins[i];
    // 定位 charCodeAt 读取点（两种写法：PROP_READ_DYN / STR_APP_THEN_READ）
    if (x.role !== 'PROP_READ_DYN' && x.role !== 'STR_APP_THEN_READ' && x.role !== 'PROP_READ_DYN_N') continue;
    const note = readAt.get(x.ip);
    if (!note || note.keyStr !== 'charCodeAt') continue;

    // 紧随其后的 CALL：this = 被逐字符读取的字符串
    let ci = -1;
    for (let k = i + 1; k <= i + 4 && k < ins.length; k++) if (ins[k].role === 'CALL') { ci = k; break; }
    if (ci < 0) continue;
    const call = ins[ci];
    const strReg = call.ops[2];

    // 往后找到 LOAD_IMM 8（8*i 的步子 = 打包特征），顺路收集常量候选
    let eightIdx = -1;
    const nums = new Set();
    for (let k = ci + 1; k <= ci + 12 && k < ins.length; k++) {
      const y = ins[k];
      if (y.role === 'LOAD_IMM' && y.ops[1] === 8) { eightIdx = k; break; }
      for (let t = 1; t < y.ops.length; t++) {
        const v = y.ops[t];
        if (Number.isFinite(v) && Math.abs(v) <= 64) nums.add(v);
      }
    }
    if (eightIdx < 0) continue;
    // 打包尾部必须是「移位 + 或累加」
    let tailOk = false;
    for (let k = eightIdx + 1; k <= eightIdx + 5 && k < ins.length - 1; k++) {
      if (ins[k].role === 'BITOP' && ins[k + 1].role === 'BITOP' && ins[k + 1].ops[0] === ins[k + 1].ops[1]) { tailOk = true; break; }
    }
    if (!tailOk) continue;

    // 取该字符串寄存器在此刻的值的尾部 4 字符（每份拷贝就是「4 字符一组」）
    const s = lastStringBefore(snapshots, strReg, call.ip);
    let chars = null;
    if (s != null && s.length >= 4) chars = [...s.slice(-4)].map(c => c.charCodeAt(0));
    if (!chars) {
      const acc = [];
      for (let k = ci - 1; k >= Math.max(0, ci - 26); k--) {
        const y = ins[k];
        if ((y.role === 'STR_APP2' || y.role === 'STR_APP') && y.ops[0] === strReg) {
          if (y.role === 'STR_APP2') acc.unshift(y.ops[1], y.ops[3]); else acc.unshift(y.ops[1]);
        }
        if (y.role === 'STR_INIT' && y.ops[0] === strReg) break;
      }
      if (acc.length >= 4) chars = acc.slice(-4);
    }
    if (!chars) continue;

    // K 候选：同一段 4 字符会被不同内联副本用不同偏移复用 ⇒ 正负都试
    const Ks = new Set([0]);
    for (const v of nums) { Ks.add(v); Ks.add(-v); }
    for (const K of Ks) {
      const w = ((chars[0] + K) & 255) | (((chars[1] + K) & 255) << 8) | (((chars[2] + K) & 255) << 16) | (((chars[3] + K) & 255) << 24);
      add(w, x.ip, chars, K, 'pack');
    }
  }
  return [...cands.entries()].map(([w, e]) => ({ word: w >>> 0, ...e })).sort((a, b) => b.count - a.count);
}

/* ------------------------------------------------------------------ */
/* 3. S（key 附加常量）候选                                             */
/* ------------------------------------------------------------------ */

function extractSaltCandidates(ins) {
  const seen = new Map();
  for (const x of ins) {
    if (x.role !== 'ARITH') continue;
    for (let k = 1; k < x.ops.length; k++) {
      const v = x.ops[k];
      if (!Number.isFinite(v)) continue;
      if (v >= 1000 && v <= 100000000) seen.set(v, (seen.get(v) || 0) + 1);
    }
  }
  const arr = [...seen.entries()].sort((a, b) => b[1] - a[1]).map(e => e[0]);
  return [0, ...arr];
}

/* ------------------------------------------------------------------ */
/* 4. XTEA（32 轮，sum 在两半之间 +delta）                              */
/* ------------------------------------------------------------------ */

const f = v => ((((v << 4) ^ (v >>> 5)) + v) | 0);

function xteaEncrypt(v0, v1, k) {
  let sum = 0;
  for (let i = 0; i < 32; i++) {
    v0 = (v0 + (f(v1) ^ ((sum + k[sum & 3]) | 0))) | 0;
    sum = (sum + DELTA) | 0;
    v1 = (v1 + (f(v0) ^ ((sum + k[(sum >>> 11) & 3]) | 0))) | 0;
  }
  return [v0 >>> 0, v1 >>> 0];
}

function xteaDecrypt(v0, v1, k) {
  let sum = (DELTA * 32) | 0;
  for (let i = 0; i < 32; i++) {
    v1 = (v1 - (f(v0) ^ ((sum + k[(sum >>> 11) & 3]) | 0))) | 0;
    sum = (sum - DELTA) | 0;
    v0 = (v0 - (f(v1) ^ ((sum + k[sum & 3]) | 0))) | 0;
  }
  return [v0 >>> 0, v1 >>> 0];
}

function decryptBuffer(buf, ek) {
  const out = Buffer.alloc(buf.length);
  for (let o = 0; o + 8 <= buf.length; o += 8) {
    const a = buf.readUInt32LE(o), b = buf.readUInt32LE(o + 4);
    const [x, y] = xteaDecrypt(a, b, ek);
    out.writeUInt32LE(x, o);
    out.writeUInt32LE(y, o + 4);
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* 5. 打分                                                             */
/* ------------------------------------------------------------------ */

function jsonness(bytes) {
  // 只看前 64 字节：JSON 明文立刻能辨认
  let score = 0;
  const n = Math.min(bytes.length, 64);
  for (let i = 0; i < n; i++) {
    const b = bytes[i];
    if (b === 0x7b || b === 0x5b) score += 3;          // { [
    else if (b === 0x22 || b === 0x3a || b === 0x2c) score += 2; // " : ,
    else if (b >= 0x20 && b < 0x7f) score += 1;
    else if (b === 0) score -= 1;
    else score -= 3;
  }
  return score;
}

function tryParse(buf) {
  const txt = buf.toString('utf8').replace(/\u0000+$/, '');
  try { return { ok: true, txt, obj: JSON.parse(txt) }; } catch (e) { return { ok: false, txt, err: e.message }; }
}

/* ------------------------------------------------------------------ */
/* 6. 主流程                                                           */
/* ------------------------------------------------------------------ */

function readCollect(file) {
  const raw = fs.readFileSync(file, 'utf8');
  let s = raw.trim();
  if (s.startsWith('{') || s.startsWith('[')) {
    // dumped_*.json：按行取第一条 base64
    for (const line of raw.split(/\r?\n/)) {
      const t = line.trim();
      if (/^[A-Za-z0-9+/=_%-]{64,}$/.test(t)) return decodeCollect(t);
    }
    throw new Error('JSON 里没找到 base64 collect 行');
  }
  return decodeCollect(s);
}

function decodeCollect(s) {
  let t = s;
  try { t = decodeURIComponent(t); } catch { /* 可能已解码 */ }
  t = t.replace(/\s+/g, '');
  return Buffer.from(t, 'base64');
}

function main() {
  const [tdcArg, collectArg] = process.argv.slice(2);
  if (!tdcArg) {
    console.error('用法: node tools/tdc_key.mjs <tdc.js> [collect.txt|dumped.json]');
    process.exit(2);
  }
  const tdcPath = path.resolve(tdcArg);
  if (!fs.existsSync(tdcPath)) {
    console.error(`卡在第 0 层：找不到 ${tdcPath}`);
    process.exit(2);
  }

  console.log(`[1/5] 反汇编产物`);
  const { file: insFile, error } = ensureDisasm(tdcPath);
  if (!insFile) {
    console.error(`  卡在第 1 层（反汇编）：${error || '未生成'}`);
    process.exit(3);
  }
  const ins = JSON.parse(fs.readFileSync(insFile, 'utf8'));
  console.log(`  ${path.relative(ROOT, insFile)}  ${ins.length} 条指令`);

  console.log(`[2/5] 静态提取 key 候选`);
  const cands = extractKeyCandidates(ins);
  const multi = cands.filter(c => c.count >= 2);
  console.log(`  候选 ${cands.length} 个，其中重复出现(>=2 份内联副本) ${multi.length} 个：`);
  for (const c of cands.slice(0, 10)) {
    console.log(`   0x${c.word.toString(16).padStart(8, '0')} ${String(c.word).padStart(10)} x${c.count} sites=${c.sites.slice(0, 3).map(s => s.ip).join(',')}`);
  }
  const salts = extractSaltCandidates(ins);
  console.log(`  S 常量候选 ${salts.length} 个: ${salts.slice(0, 8).join(', ')}`);

  // 收集端（可选）
  let ct = null;
  if (collectArg) {
    const cf = path.resolve(collectArg);
    if (fs.existsSync(cf)) {
      ct = readCollect(cf);
      console.log(`[3/5] collect: ${path.relative(ROOT, cf)}  ${ct.length} 字节 / ${ct.length / 8} 块`);
    } else {
      console.log(`[3/5] 找不到 collect 文件 ${cf}，只做 key 提取`);
    }
  } else {
    console.log('[3/5] 未提供 collect，只做 key 提取');
  }

  const pool = (multi.length >= 4 ? multi : cands).slice(0, 6);
  const poolAll = cands.map(c => c.word);
  if (poolAll.length < 4) {
    console.error('卡在第 2 层（key）：候选不足 4 个，模式没对上');
    process.exit(4);
  }

  // 组合：4 词（有序）× S 候选对；用「明文必须是 JSON」作 oracle
  let found = null;
  if (ct && ct.length >= 16) {
    console.log('[4/5] 用「明文必须是 JSON」作 oracle 消歧顺序与 S');
    const a0 = ct.readUInt32LE(0), b0 = ct.readUInt32LE(4);
    const nz = salts.filter(s => s !== 0).slice(0, 3);
    const pairs = [];
    for (const s of nz) for (const t of nz) if (s !== t) pairs.push([s, 0, t, 0]);
    for (const s of nz) { pairs.push([s, 0, 0, 0]); pairs.push([0, 0, s, 0]); }
    pairs.push([0, 0, 0, 0]);
    const n = poolAll.length;
    console.log(`  候选词 ${n} 个 × 有序四元组 ${n * (n - 1) * (n - 2) * (n - 3)} × S 组合 ${pairs.length}`);
    const t0 = Date.now();
    let best = { score: -1e9 }, tried = 0;

    const stage1 = (v0, v1, k) => {
      const [x, y] = xteaDecrypt(v0, v1, k);
      const head = Buffer.alloc(8);
      head.writeUInt32LE(x, 0); head.writeUInt32LE(y, 0 + 4);
      return head;
    };
    const plausible = head => {
      if (head[0] !== 0x7b && head[0] !== 0x5b) return false;
      let pr = 0, punct = 0;
      for (const b of head) {
        if (b >= 0x20 && b < 0x7f) pr++;
        if (b === 0x22 || b === 0x3a || b === 0x2c || b === 0x7b || b === 0x5d) punct++;
      }
      return pr >= 7 && punct >= 2;
    };

    outer:
    for (const sp of pairs) {
      for (let a = 0; a < n; a++) for (let b = 0; b < n; b++) {
        if (b === a) continue;
        for (let c = 0; c < n; c++) {
          if (c === a || c === b) continue;
          for (let d = 0; d < n; d++) {
            if (d === a || d === b || d === c) continue;
            const k = [(poolAll[a] + sp[0]) | 0, poolAll[b] | 0, (poolAll[c] + sp[2]) | 0, poolAll[d] | 0];
            tried++;
            const head = stage1(a0, b0, k);
            if (!plausible(head)) continue;
            // 复核：整段解密 + JSON
            const all = decryptBuffer(ct, k);
            const p = tryParse(all);
            if (p.ok) {
              found = { ek: k, sp, words: [poolAll[a], poolAll[b], poolAll[c], poolAll[d]], pt: all, parsed: p };
              break outer;
            }
            const sc = jsonness(all);
            if (sc > best.score) best = { score: sc, ek: k, sp, words: [poolAll[a], poolAll[b], poolAll[c], poolAll[d]] };
          }
        }
      }
      console.log(`  S=[${sp.join(',')}] 试完，累计 ${tried} 组，${((Date.now() - t0) / 1000).toFixed(1)}s`);
    }
    if (!found) {
      console.log(`  共尝试 ${tried} 组，未命中（最佳分 ${best.score}）`);
      if (best.score > 200) found = best;
    }
  } else if (!ct) {
    found = { ek: poolAll.slice(0, 4), sp: [0, 0, 0, 0], words: poolAll.slice(0, 4), unverified: true };
  }

  if (!found) {
    console.error('卡在第 3 层（解密）：没有一组 key 能解出可读明文 —— 已排除 24 种词序与全部 S 候选');
    process.exit(5);
  }

  console.log('[5/5] 结果');
  console.log(`  build        : ${path.basename(tdcPath)}`);
  console.log(`  key(原始 4 字): [${found.words.join(', ')}]`);
  console.log(`  S(附加常量)   : [${found.sp.join(', ')}]`);
  console.log(`  EK=key+S     : [${found.ek.join(', ')}]`);
  const kb = Buffer.alloc(16);
  found.ek.forEach((v, i) => kb.writeUInt32LE(v >>> 0, i * 4));
  console.log(`  EK 字节      : ${kb.toString('hex')}`);
  console.log(`  参数         : XTEA / 32 轮 / ECB / 8B 块 / (v0,v1)=小端 u32 / sum 在两半之间 +=delta`);

  if (!ct) {
    console.log('  明文         : （未提供 collect，跳过）');
    return;
  }

  const pt = found.pt || decryptBuffer(ct, found.ek);
  const parsed = found.parsed || tryParse(pt);
  const head = pt.subarray(0, 120).toString('latin1').replace(/[^\x20-\x7e]/g, '·');
  console.log(`  明文头 120B  : ${head}`);
  if (parsed.ok) {
    console.log(`  明文         : ✓ 合法 JSON，${Buffer.byteLength(parsed.txt)} 字节，顶层键 [${Object.keys(parsed.obj).join(', ')}]`);
    if (process.env.TDC_OUT) {
      fs.writeFileSync(process.env.TDC_OUT, JSON.stringify(parsed.obj, null, 1));
      console.log(`  已写出       : ${process.env.TDC_OUT}`);
    }
  } else {
    const tail = parsed.txt.slice(-40).replace(/\u0000+$/, '');
    console.log(`  明文         : 部分可读但 JSON.parse 失败（${parsed.err.slice(0, 80)}）`);
    console.log(`  尾部         : ${JSON.stringify(tail)}`);
    console.log(`  判读         : 若头部是 JSON 且尾部只有 \\0 填充，说明长度补齐；否则可能是二次编码/压缩`);
  }
}

if (process.argv[1] && /tdc_key\.mjs$/i.test(process.argv[1])) main();

export { ensureDisasm, extractKeyCandidates, extractSaltCandidates, xteaDecrypt, xteaEncrypt, decryptBuffer, readCollect };
