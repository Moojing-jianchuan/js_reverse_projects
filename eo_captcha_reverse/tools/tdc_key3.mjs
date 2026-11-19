#!/usr/bin/env node
// tools/tdc_key3.mjs — 腾讯天御 tdc.js：XTEA 密钥提取器（**运行期优先，不依赖静态反汇编**）
//
// 用法：
//   node tools/tdc_key3.mjs <tdc.js> --selfcheck               # 本地 VM 跑同一份 build 出 collect，自证
//   node tools/tdc_key3.mjs <tdc.js> --collect <collect.txt>   # 解一份外部 collect（浏览器真包）
//   node tools/tdc_key3.mjs <tdc.js> --diag                    # 只做 helper 识别诊断（定位 bytecode.mjs 失败点）
//
// 为什么要有 v3（相对 tdc_key2）：
//   tdc_key2 的盐候选来自 `tools/vmp/bytecode.mjs` 产出的反汇编（"ARITH 大立即数"）。
//   那条链在部分 build 上断两处：
//     (a) bytecode.mjs 用「函数体里出现标准 base64 字母表字面量」识别 base64 助手；
//         新 build 把字母表提到共享字符串对象（`{'mDAJd':'ABCDEF...'}`）里，函数体内不再出现，
//         b64Hit = NOT FOUND → 直接抛 'helper identification failed'（第 82 行）。
//     (b) 即使解码成功，opcode 角色分类（opcodes.mjs 的 role()）在新 build 上会大面积退化成
//         ARITH/STR_APP（strings reconstructed 0），"ARITH 大立即数"就不再等于盐候选。
//
//   v3 的做法：**两样原料都不要静态产物，全从运行期拿**
//     1) patch dispatcher，在 `switch(CODE[++IP])` 前插入 hook；
//     2) key 候选 = REGS 里真实出现的 4 元 32bit 整数数组；
//     3) 盐候选 = REGS 里那条**字节码 int 流**本身（dispatcher 读的就是它）中 1e5..1e7 的整数；
//        —— 这等价于（且是超集于）"ARITH 的大立即数"，因为它就是它的来源；
//     4) 位置 × 有符号盐 × 至多 N 个非零 全排列，key[i] + S[i] = EK；
//     5) oracle = 同一份 build 的 VM 输出（自证）或外部 collect，明文头部必须是 `{"cd":[`。
//
// 纯本地：不联网、不装依赖、不写 tdc.js；patch 只在内存里做。
// 不修改 scripts/env.mjs / tools/tdc_key.mjs / tools/tdc_key2.mjs / tools/vmp/*（只 import 复用）。

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { patchDispatcher, xteaDecryptBlock, decryptBuffer } from './tdc_key2.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const toUrl = p => new URL('file://' + path.join(ROOT, p).replace(/\\/g, '/')).href;

// 明文头部恒定前缀：{"cd":[   （三份 build 全部成立；cd 是定长槽数组）
const PLAIN_PREFIX = Buffer.from('{"cd":[');

/* ------------------------------------------------------------------ */
/* CLI                                                                 */
/* ------------------------------------------------------------------ */

function parseArgs(argv) {
  const out = {
    file: null, collect: null, selfcheck: false, diag: false,
    rounds: [32], sample: 8, maxSalt: 2, saltCap: 60, saltCap3: 16, quiet: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--selfcheck') out.selfcheck = true;
    else if (a === '--diag') out.diag = true;
    else if (a === '--collect') out.collect = argv[++i];
    else if (a.startsWith('--collect=')) out.collect = a.slice(10);
    else if (a === '--rounds') out.rounds = String(argv[++i]).split(',').map(Number);
    else if (a === '--sample') out.sample = Number(argv[++i]);
    else if (a === '--max-salt') out.maxSalt = Number(argv[++i]);
    else if (a === '--salt-cap') out.saltCap = Number(argv[++i]);
    else if (a === '--quiet') out.quiet = true;
    else if (!out.file) out.file = a;
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* collect 读入（base64 / URL-encoded / 包在 JSON 里）                  */
/* ------------------------------------------------------------------ */

function readCollectFile(file) {
  const raw = fs.readFileSync(file, 'utf8');
  const pick = s => {
    let t = String(s).trim();
    try { t = decodeURIComponent(t); } catch { }
    t = t.replace(/\s+/g, '');
    if (!/^[A-Za-z0-9+/=_-]+$/.test(t)) t = t.replace(/[^A-Za-z0-9+/=_-]/g, '');
    t = t.replace(/-/g, '+').replace(/_/g, '/');
    return Buffer.from(t, 'base64');
  };
  if (raw.trim().startsWith('{') || raw.trim().startsWith('[')) {
    const m = raw.match(/"(?:collect|data|tdc_collect|response_body)"\s*:\s*"([A-Za-z0-9+/=%_-]{64,})"/);
    if (m) return pick(m[1]);
    for (const line of raw.split(/\r?\n/)) {
      const t = line.trim();
      if (/^[A-Za-z0-9+/=%_-]{64,}$/.test(t)) return pick(t);
    }
    throw new Error('JSON 里没找到 base64 collect 行');
  }
  return pick(raw);
}

/* ------------------------------------------------------------------ */
/* 运行期取样：REGS 里的 4 元数组（key 候选） + int 流大整数（盐候选）    */
/* ------------------------------------------------------------------ */

async function harvest(tdcFile, sample) {
  const { buildEnv } = await import(toUrl('scripts/env.mjs'));
  const original = fs.readFileSync(tdcFile, 'utf8');
  const patched = patchDispatcher(original);
  const arrays = new Map();     // sig -> {words, ip, count}
  const ints = new Map();       // value -> count
  let steps = 0, streamIdx = -1, streamLen = 0, streamHarvested = false;

  const w = buildEnv();
  w.__TH = (ip, regs) => {
    steps++;
    // int 流只刮一次（它整个运行期不变）
    if (!streamHarvested) {
      for (let i = 0; i < regs.length; i++) {
        const v = regs[i];
        if (Array.isArray(v) && v.length > 200) { streamIdx = i; streamLen = v.length; break; }
      }
      if (streamIdx >= 0) {
        const arr = regs[streamIdx];
        for (let j = 0; j < arr.length; j++) {
          const n = arr[j];
          if (typeof n === 'number' && Number.isInteger(n) && n >= 100000 && n <= 10000000) {
            ints.set(n, (ints.get(n) || 0) + 1);
          }
        }
        streamHarvested = true;
      }
    }
    if (steps % sample) return 0;
    try {
      for (let i = 0; i < regs.length; i++) {
        const v = regs[i];
        if (!Array.isArray(v) || v.length < 4) continue;
        // Some builds keep the key inside a longer array (key + padding/handlers), so scan
        // contiguous 4-word windows — but cap the work: long arrays and many windows made the
        // VM exceed its time budget on some builds.
        if (v.length > 64) continue;
        const windows = Math.min(v.length - 3, 12);
        for (let s = 0; s < windows; s++) {
          const w4 = [v[s], v[s + 1], v[s + 2], v[s + 3]];
          if (!w4.every(x => Number.isInteger(x) && Math.abs(x) < 2 ** 32)) continue;
          const words = w4.map(x => x | 0);
          const sig = words.map(x => x >>> 0).join(',');
          const e = arrays.get(sig);
          if (e) e.count++; else arrays.set(sig, { words, ip, count: 1 });
        }
      }
    } catch { }
    return 0;
  };

  const ctx = vm.createContext(w);
  vm.runInContext(patched ? patched.src : original, ctx, { filename: path.basename(tdcFile), timeout: 240000 });
  await new Promise(r => setTimeout(r, 700));
  const collect = w.TDC.getData(true);
  const buf = Buffer.from(decodeURIComponent(collect), 'base64');
  return {
    arrays: [...arrays.values()].sort((a, b) => b.count - a.count),
    ints: [...ints.entries()].sort((a, b) => b[1] - a[1]),
    buf, steps, patched: !!patched, streamIdx, streamLen,
  };
}

/* ------------------------------------------------------------------ */
/* 候选组合                                                            */
/* ------------------------------------------------------------------ */

function saltCombos(pool, maxNonZero) {
  const vals = [0];
  for (const s of pool) { vals.push(s); vals.push(-s); }
  const out = [];
  (function rec(i, cur, nz) {
    if (i === 4) { out.push(cur.slice()); return; }
    for (const v of vals) {
      const n = nz + (v !== 0 ? 1 : 0);
      if (n > maxNonZero) continue;
      cur.push(v); rec(i + 1, cur, n); cur.pop();
    }
  })(0, [], 0);
  return out;
}

function countCombos(k, maxNonZero) {
  // k 个盐 → 每位 2k+1 个取值；非零位 ≤ m
  let n = 0, C = 1;
  for (let j = 0; j <= maxNonZero; j++) {
    if (j > 4) break;
    if (j > 0) C = C * (4 - j + 1) / j;   // 位置选择数
    n += C * (2 * k) ** j;
  }
  return Math.round(n);
}

/* ------------------------------------------------------------------ */
/* oracle                                                              */
/* ------------------------------------------------------------------ */

function blockPreview(ct, ek, rounds, swap, off = 0) {
  const body = off ? ct.subarray(off) : ct;
  if (body.length < 8) return null;
  const a = body.readUInt32LE(0), b = body.readUInt32LE(4);
  const [x, y] = swap ? xteaDecryptBlock(b, a, ek, rounds) : xteaDecryptBlock(a, b, ek, rounds);
  const head = Buffer.alloc(8);
  if (swap) { head.writeUInt32LE(y, 0); head.writeUInt32LE(x, 4); } else { head.writeUInt32LE(x, 0); head.writeUInt32LE(y, 4); }
  return head;
}

function tryJson(buf) {
  const txt = buf.toString('utf8').replace(/\u0000+$/, '');
  try { return { ok: true, txt, obj: JSON.parse(txt) }; }
  catch (e) { return { ok: false, txt, err: e.message }; }
}

/* ------------------------------------------------------------------ */
/* 主流程                                                              */
/* ------------------------------------------------------------------ */

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.file) {
    console.error('用法: node tools/tdc_key3.mjs <tdc.js> --selfcheck');
    console.error('      node tools/tdc_key3.mjs <tdc.js> --collect <collect.txt>');
    console.error('      node tools/tdc_key3.mjs <tdc.js> --diag');
    console.error('  可选: --rounds 32 --sample 8 --max-salt 2 --salt-cap 40 --quiet');
    process.exit(2);
  }
  const tdcFile = path.resolve(args.file);
  if (!fs.existsSync(tdcFile)) { console.error('找不到 ' + tdcFile); process.exit(2); }

  if (args.diag) return diag(tdcFile, args);

  const t0 = Date.now();
  console.log(`[1/4] build: ${path.basename(tdcFile)}  ${fs.statSync(tdcFile).size} bytes`);

  /* ---- 运行期取样（key + 盐候选 + 自证数据源，一次 VM 全拿） ---- */
  console.log('[2/4] 跑 VM：patch dispatcher → 采样 REGS 的 4 元整数数组（key） + 字节码 int 流大整数（盐）');
  let h;
  const tv = Date.now();
  try { h = await harvest(tdcFile, args.sample); }
  catch (e) {
    console.error('      ✗ VM 阶段失败（不是候选空间问题）：' + (e && e.message ? e.message.split('\n')[0] : e));
    process.exit(4);
  }
  if (!h.patched) {
    console.error('      ✗ dispatcher 未识别（patchDispatcher 返回 null）：这份 build 的 dispatch 形态超出现有正则');
    process.exit(4);
  }
  console.log(`      dispatcher 已插桩；${h.steps} 步；int 流 REGS[${h.streamIdx}] len=${h.streamLen}；` +
    `4 元数组 ${h.arrays.length} 个；盐候选 ${h.ints.length} 个（1e5..1e7）；VM 阶段耗时 ${((Date.now() - tv) / 1000).toFixed(1)}s`);

  let ct;
  if (args.collect) {
    ct = readCollectFile(path.resolve(args.collect));
    console.log(`[3/4] 外部 collect: ${args.collect}  ${ct.length} 字节 / ${ct.length / 8} 块` +
      `  (同 build VM 自产 collect ${h.buf.length} 字节，仅供参考)`);
  } else {
    ct = h.buf;
    console.log(`[3/4] 自证 collect（同一份 build 的 VM 输出）：${ct.length} 字节 / ${ct.length / 8} 块`);
  }
  if (!ct || ct.length < 16) { console.error('      ✗ collect 太短'); process.exit(4); }

  const keys = h.arrays.filter(a => a.words.some(w => w !== 0));
  if (!keys.length) { console.error('      ✗ 没采到任何 4 元整数数组（key 候选为 0，卡在 VM 取样）'); process.exit(4); }
  for (const k of keys.slice(0, 6)) console.log(`      key 候选 ip=${k.ip} x${k.count}  [${k.words.join(', ')}]`);

  const saltAll = h.ints.filter(([v]) => v !== 0);
  const pool = saltAll.slice(0, args.saltCap).map(([v]) => v);
  const pool3 = saltAll.slice(0, args.saltCap3).map(([v]) => v);
  console.log(`      盐候选 top${args.saltCap}: ${pool.slice(0, 10).join(' ')}${pool.length > 10 ? ' …' : ''}`);

  /* ---- 分级枚举 ---- */
  const levels = [];
  const words = [...new Set(keys.flatMap(k => k.words))].slice(0, 8);

  levels.push({ name: 'L0 无盐（EK=key） × 32 轮 × 端序', keys, combos: [[0, 0, 0, 0]], rounds: args.rounds, offsets: [0] });
  if (args.maxSalt >= 1) levels.push({ name: `L1 至多 1 个非零盐（${pool.length} 盐 ±）`, keys, combos: saltCombos(pool, 1), rounds: args.rounds, offsets: [0] });
  if (args.maxSalt >= 2) levels.push({ name: `L2 至多 2 个非零盐（${pool.length} 盐 ±）`, keys, combos: saltCombos(pool, 2), rounds: args.rounds, offsets: [0] });
  if (args.maxSalt >= 3) levels.push({ name: `L3 至多 3 个非零盐（${pool3.length} 盐 ±）`, keys, combos: saltCombos(pool3, 3), rounds: args.rounds, offsets: [0] });
  levels.push({
    name: 'L4 无盐 × 轮数 16/24/32/48/64 × 8B 内偏移 0..7',
    keys, combos: [[0, 0, 0, 0]], rounds: [16, 24, 32, 48, 64], offsets: [0, 1, 2, 3, 4, 5, 6, 7],
  });
  if (words.length >= 4) {
    const tuples = [];
    for (const a of words) for (const b of words) for (const c of words) for (const d of words) tuples.push([a, b, c, d]);
    levels.push({ name: `L5 位置词池交叉（${words.length} 词 → ${tuples.length} 四元组）`, keys: tuples.map(t => ({ words: t, ip: -1, count: 0 })), combos: [[0, 0, 0, 0]], rounds: args.rounds, offsets: [0] });
  }

  const t1 = Date.now();
  let found = null, tried = 0, prefixPass = 0;
  const stats = [];
  outer:
  for (const lv of levels) {
    const n = lv.keys.length * lv.combos.length * lv.rounds.length * 2 * lv.offsets.length;
    if (!args.quiet) console.log(`[4/4] ${lv.name}：${n} 组  = key ${lv.keys.length} × S ${lv.combos.length} × 轮 ${lv.rounds.length} × 端序 2 × 偏移 ${lv.offsets.length}`);
    const lt = Date.now();
    for (const kc of lv.keys) {
      for (const sp of lv.combos) {
        const ek = kc.words.slice();
        if (sp[0] || sp[1] || sp[2] || sp[3]) for (let i = 0; i < 4; i++) ek[i] = (ek[i] + sp[i]) | 0;
        for (const rounds of lv.rounds) {
          for (const swap of [false, true]) {
            for (const off of lv.offsets) {
              tried++;
              const head = blockPreview(ct, ek, rounds, swap, off);
              if (!head || !head.subarray(0, PLAIN_PREFIX.length).equals(PLAIN_PREFIX)) continue;
              prefixPass++;
              const body = off ? ct.subarray(off) : ct;
              const pt = decryptBuffer(body, ek, rounds, swap);
              const v = tryJson(pt);
              if (v.ok && v.obj && Array.isArray(v.obj.cd)) {
                found = { lv: lv.name, kc, sp, ek, rounds, swap, off, v, pt, ctBody: body };
                stats.push({ name: lv.name, n, hit: true, ms: Date.now() - lt });
                break outer;
              }
            }
          }
        }
      }
    }
    stats.push({ name: lv.name, n, hit: false, ms: Date.now() - lt });
    if (!args.quiet) console.log(`        该级跑完 ${n} 组，未命中（${((Date.now() - lt) / 1000).toFixed(1)}s）`);
  }

  if (!found) {
    console.log(`\n  ✗ 未命中：共试 ${tried} 组 / ${((Date.now() - t1) / 1000).toFixed(1)}s，明文前缀 ${PLAIN_PREFIX} 通过 ${prefixPass} 次`);
    console.log('  每级候选数量（已排除 = 全量跑完且无一通过前缀 oracle）：');
    for (const s of stats) console.log(`    ${s.hit ? '✓ 命中' : '✗ 已排除'}  ${String(s.n).padStart(9)} 组  ${s.ms}ms  ${s.name}`);
    console.log('  仍在候选空间内的方向（未展开）：');
    console.log(`    · 盐取值超出 top${args.saltCap}（本次只取 1e5..1e7 且按执行次数排序，共 ${saltAll.length} 个）→ 加大 --salt-cap`);
    console.log(`    · 非零位 > ${args.maxSalt} → 加大 --max-salt（代价 ~ (2k)^m）`);
    console.log(`    · key 候选池外的 4 元数组（本 build 只采到 ${h.arrays.length} 个）→ 减小 --sample 或提高采样密度`);
    console.log('  卡点判定：VM 已产出 collect（' + ct.length + 'B），说明**不卡 VM**，卡在候选空间。');
    process.exit(5);
  }

  /* ---------------- 输出 ---------------- */
  const { kc, sp, ek, rounds, swap, off, v, pt } = found;
  console.log(`[命中] ${tried} 组 / ${((Date.now() - t1) / 1000).toFixed(1)}s  （${found.lv}）`);
  console.log(`  key 四字    : [${kc.words.join(', ')}]   ← REGS ip=${kc.ip} x${kc.count}`);
  console.log(`  S 位置修正  : [${sp.join(', ')}]`);
  for (let i = 0; i < 4; i++) {
    if (!sp[i]) continue;
    const src = h.ints.find(([x]) => x === Math.abs(sp[i]));
    console.log(`    位 ${i}: ${kc.words[i]} + ${sp[i]} = ${ek[i]}   (盐 ${Math.abs(sp[i])} 在字节码 int 流中出现 ${src ? src[1] : '?'} 次)`);
  }
  console.log(`  EK          : [${ek.join(', ')}]`);
  const kb = Buffer.alloc(16);
  ek.forEach((x, i) => kb.writeUInt32LE(x >>> 0, i * 4));
  console.log(`  EK 字节     : ${kb.toString('hex')}`);
  console.log(`  参数        : XTEA / ${rounds} 轮 / ECB / 8B 块 / (v0,v1) 小端 u32${swap ? '（已交换 v0/v1）' : ''}` +
    `${off ? ' / collect 内偏移 ' + off : ''} / sum 在两半之间 += delta`);
  console.log(`  明文头 120B : ${pt.subarray(0, 120).toString('latin1').replace(/[^\x20-\x7e]/g, '·')}`);
  const cdb = v.obj.cd.length;
  console.log(`  明文        : ✓ 合法 JSON，${Buffer.byteLength(v.txt)} 字节，顶层键 [${Object.keys(v.obj).join(', ')}]，cd 槽 ${cdb}`);
  console.log(`  长度补齐    : ${pt.length - Buffer.byteLength(v.txt)} 字节 \\0（collect ${ct.length}B）`);

  console.log('\n  OK');
  console.log(JSON.stringify({ EK: ek, key: kc.words, S: sp, rounds, swap, offset: off, cd: cdb, bytes: Buffer.byteLength(v.txt) }, null, 1));
  if (process.env.TDC_OUT) {
    fs.writeFileSync(process.env.TDC_OUT, JSON.stringify(v.obj, null, 1));
    console.log('  已写出: ' + process.env.TDC_OUT);
  }
}

/* ------------------------------------------------------------------ */
/* --diag：复现 helper 识别失败点，并给出修好的签名                      */
/* ------------------------------------------------------------------ */

async function diag(tdcFile, args) {
  const name = path.basename(tdcFile).replace(/\.js$/i, '');
  const outDir = path.join(ROOT, 'src', '_vmp');
  fs.mkdirSync(outDir, { recursive: true });
  const folded = path.join(outDir, `${name}.folded.js`);
  if (!fs.existsSync(folded)) {
    const { execFileSync } = await import('node:child_process');
    console.log('[diag] 折叠源码（tools/vmp/strings.mjs --fold）…');
    execFileSync(process.execPath, [path.join(ROOT, 'tools', 'vmp', 'strings.mjs'), tdcFile,
      path.join(outDir, `${name}.strings.json`), '--fold', folded], { stdio: 'inherit', cwd: ROOT });
  }
  const { createRequire } = await import('node:module');
  const require = createRequire(import.meta.url);
  const acorn = require('D:/ds_work/dsh-src/node_modules/.pnpm/acorn@8.17.0/node_modules/acorn/dist/acorn.js');
  const src = fs.readFileSync(folded, 'utf8');
  const ast = acorn.parse(src, { ecmaVersion: 2022, sourceType: 'script', allowReturnOutsideFunction: true });
  const funcs = [], vars = new Map();
  (function walk(n) {
    if (!n || typeof n.type !== 'string') return;
    if ((n.type === 'FunctionDeclaration' || n.type === 'FunctionExpression') && n.id) funcs.push({ name: n.id.name, text: src.slice(n.start, n.end) });
    if (n.type === 'VariableDeclarator' && n.id.type === 'Identifier' && n.init) vars.set(n.id.name, n.init);
    for (const k of Object.keys(n)) { const v = n[k]; if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v.type === 'string') walk(v); }
  })(ast);

  const oldSig = {
    rangeHit: funcs.find(f => /=\[\],_0x[0-9a-f]+=0x0;while\(/.test(f.text)),
    b64Hit: funcs.find(f => /ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789/.test(f.text)),
    zigHit: funcs.find(f => />>0x1/.test(f.text)),
    decHit: funcs.find(f => /Int8Array/.test(f.text)),
  };
  console.log('[diag] bytecode.mjs 原签名（函数体内出现字母表字面量）：');
  for (const [k, v] of Object.entries(oldSig)) console.log(`   ${k.padEnd(9)} = ${v ? v.name : 'NOT FOUND'}`);
  const failed = Object.entries(oldSig).filter(([k, v]) => !v && k !== 'zigHit').map(([k]) => k);
  console.log(`   第 82 行抛错条件命中：${failed.length ? failed.join(', ') : '（无，原签名其实可用）'}`);

  // 新签名：base64 助手 = 引用「base 表变量」的那个具名函数
  let tblName = null;
  const rangeName = oldSig.rangeHit && oldSig.rangeHit.name;
  for (const [n, init] of vars) {
    const t = src.slice(init.start, init.end);
    if (/concat/.test(t) && rangeName && t.includes(rangeName) && t.length < 4000) { tblName = n; break; }
  }
  console.log(`[diag] 新签名：base 表变量 = ${tblName || 'NOT FOUND'}`);
  let b64New = null;
  if (tblName) {
    const re = new RegExp('\\b' + tblName + '\\[');
    b64New = funcs.find(f => re.test(f.text) && /charCodeAt|replace/.test(f.text)) || null;
  }
  console.log(`   b64Hit(new, 引用 base 表变量) = ${b64New ? b64New.name : 'NOT FOUND'}`);
  // 字母表字面量在哪
  const litIdx = src.indexOf('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789');
  if (litIdx >= 0) {
    const win = src.slice(Math.max(0, litIdx - 90), litIdx + 70).replace(/\s+/g, '');
    console.log(`   字母表字面量位置 ${litIdx}，所在语境：${win}`);
    const inFn = funcs.find(f => { const s = src.indexOf(f.text); return litIdx >= s && litIdx < s + f.text.length; });
    console.log(`   是否落在某个"具名函数体"内：${inFn ? '是（' + inFn.name + '）' : '否 → 所以 funcs.find(...) 匹配不到'}`);
  }
  console.log('\n  结论：b64 助手识别不能依赖"字母表字面量在函数体内"，改为"谁引用了 base 表变量"。');
}

if (process.argv[1] && /tdc_key3\.mjs$/i.test(process.argv[1])) main();
