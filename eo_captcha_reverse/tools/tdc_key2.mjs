#!/usr/bin/env node
// tools/tdc_key2.mjs — 腾讯天御 tdc.js：XTEA 密钥「枚举 + 自证」提取器
//
// 用法：
//   node tools/tdc_key2.mjs <tdc.js> --selfcheck          # 在本机 VM 里跑同一份 tdc.js 取 collect，自证解出
//   node tools/tdc_key2.mjs <tdc.js> <collect.txt|.json>  # 直接解一个已有 collect
//
// 与 tools/tdc_key.mjs 的区别（根因）：
//   1) oracle 换了：不是「猜明文是 JSON」，而是「同一份 tdc.js 在本地 VM 跑出的 collect 必须被解成合法 JSON」；
//   2) key 候选来源加了「运行期 REGS 里真实出现的 4 元整数数组」，不再只靠字节码静态 recipe；
//   3) S（key 附加常量）的位置模式从写死的 [s,0,t,0] 改成「4 个位置 × 有符号盐 × 至多 N 个非零」全排列枚举；
//   4) 命中后打印「这个词/常量从哪来、按什么规则拼成 EK」的可解释链条。
//
// 纯本地：不联网、不装依赖；只读 tdc.js 与已有的反汇编产物；patch 只在内存里做。

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { ensureDisasm, extractKeyCandidates } from './tdc_key.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const DELTA = 0x9e3779b9;

/* ------------------------------------------------------------------ */
/* CLI                                                                 */
/* ------------------------------------------------------------------ */

function parseArgs(argv) {
  const out = { file: null, collect: null, selfcheck: false, rounds: [32], sample: 8, maxSalt: 2, fallback: true };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--selfcheck') out.selfcheck = true;
    else if (a === '--rounds') out.rounds = a.split('=')[1] || argv[++i];
    else if (a === '--sample') out.sample = Number(argv[++i]);
    else if (a === '--max-salt') out.maxSalt = Number(argv[++i]);
    else if (a === '--no-fallback') out.fallback = false;
    else if (!out.file) out.file = a;
    else if (!out.collect) out.collect = a;
  }
  if (typeof out.rounds === 'string') out.rounds = out.rounds.split(',').map(Number);
  return out;
}

/* ------------------------------------------------------------------ */
/* XTEA（32 轮、ECB、8B 块、(v0,v1) 小端 u32、sum 在两半之间 += delta）  */
/* ------------------------------------------------------------------ */

const f = v => ((((v << 4) ^ (v >>> 5)) + v) | 0);

function xteaDecryptBlock(v0, v1, k, rounds) {
  let sum = (DELTA * rounds) | 0;
  for (let i = 0; i < rounds; i++) {
    v1 = (v1 - (f(v0) ^ ((sum + k[(sum >>> 11) & 3]) | 0))) | 0;
    sum = (sum - DELTA) | 0;
    v0 = (v0 - (f(v1) ^ ((sum + k[sum & 3]) | 0))) | 0;
  }
  return [v0 >>> 0, v1 >>> 0];
}

function xteaEncryptBlock(v0, v1, k, rounds) {
  let sum = 0;
  for (let i = 0; i < rounds; i++) {
    v0 = (v0 + (f(v1) ^ ((sum + k[sum & 3]) | 0))) | 0;
    sum = (sum + DELTA) | 0;
    v1 = (v1 + (f(v0) ^ ((sum + k[(sum >>> 11) & 3]) | 0))) | 0;
  }
  return [v0 >>> 0, v1 >>> 0];
}

function decryptBuffer(buf, ek, rounds, swap = false) {
  const out = Buffer.alloc(buf.length & ~7);
  for (let o = 0; o + 8 <= out.length; o += 8) {
    let a = buf.readUInt32LE(o), b = buf.readUInt32LE(o + 4);
    if (swap) [a, b] = [b, a];
    const [x, y] = xteaDecryptBlock(a, b, ek, rounds);
    if (swap) { out.writeUInt32LE(y, o); out.writeUInt32LE(x, o + 4); }
    else { out.writeUInt32LE(x, o); out.writeUInt32LE(y, o + 4); }
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* collect 读入                                                         */
/* ------------------------------------------------------------------ */

function readCollectFile(file) {
  const raw = fs.readFileSync(file, 'utf8');
  const pick = s => {
    let t = s.trim();
    try { t = decodeURIComponent(t); } catch { }
    t = t.replace(/\s+/g, '');
    return Buffer.from(t, 'base64');
  };
  if (raw.trim().startsWith('{') || raw.trim().startsWith('[')) {
    // dumped_*.json：优先取 "collect":"..." 字段，否则按行找第一条 base64
    const m = raw.match(/"(?:collect|data|tdc_collect)"\s*:\s*"([A-Za-z0-9+/=%_-]{64,})"/);
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
/* 运行期取样：patch dispatcher，采样 REGS 里的 4 元整数数组            */
/* ------------------------------------------------------------------ */

function patchDispatcher(src) {
  const reAll = /switch\((_0x[0-9a-f]+)\[(\+\+)?(_0x[0-9a-f]+)(\+\+)?\]\)/g;
  let m, sw = null, REGS = null;
  while ((m = reAll.exec(src))) {
    const CODE = m[1];
    const re = new RegExp('[,;]\\s*(_0x[0-9a-f]+)=\\[[^\\]]{0,200}this,arguments[^\\]]{0,200}' + CODE + ',0x0\\]');
    const rm = src.match(re);
    if (rm) { sw = m; REGS = rm[1]; break; }
  }
  if (!sw) return null;
  const CODE = sw[1], IPV = sw[3];
  const patched = 'switch(globalThis.__TH&&globalThis.__TH(' + IPV + '+1,' + REGS + '),' + CODE + '['
    + (sw[2] || '') + IPV + (sw[4] || '') + '])';
  return { src: src.replace(sw[0], patched), CODE, REGS };
}

async function runVmAndHarvest(tdcFile, sample) {
  const { buildEnv } = await import(pathToFileUrl(path.join(ROOT, 'scripts', 'env.mjs')));
  const original = fs.readFileSync(tdcFile, 'utf8');
  const patched = patchDispatcher(original);
  const keyArrays = new Map();   // sig -> { words, ip, count }
  let steps = 0;

  const w = buildEnv();
  w.__TH = (ip, regs) => {
    steps++;
    if (steps % sample) return 0;
    try {
      for (let i = 0; i < regs.length; i++) {
        const v = regs[i];
        if (!Array.isArray(v) || v.length !== 4) continue;
        if (typeof v[0] !== 'number' || typeof v[1] !== 'number' || typeof v[2] !== 'number' || typeof v[3] !== 'number') continue;
        if (![0, 1, 2, 3].every(j => Number.isInteger(v[j]) && Math.abs(v[j]) < 2 ** 32)) continue;
        const words = v.map(x => x | 0);
        const sig = words.map(x => x >>> 0).join(',');
        const e = keyArrays.get(sig);
        if (e) e.count++;
        else keyArrays.set(sig, { words, ip, count: 1 });
      }
    } catch { }
    return 0;
  };

  const ctx = vm.createContext(w);
  vm.runInContext(patched ? patched.src : original, ctx, { filename: path.basename(tdcFile), timeout: 120000 });
  await new Promise(r => setTimeout(r, 700));
  const collect = w.TDC.getData(true);
  const buf = Buffer.from(decodeURIComponent(collect), 'base64');
  return { keyArrays: [...keyArrays.values()].sort((a, b) => b.count - a.count), buf, steps, patched: !!patched };
}

function pathToFileUrl(p) { return new URL('file://' + p.replace(/\\/g, '/')).href; }

/* ------------------------------------------------------------------ */
/* 盐候选：反汇编里 ARITH 的大立即数（100000..1e7）                      */
/* ------------------------------------------------------------------ */

function saltCandidates(insFile) {
  const ins = JSON.parse(fs.readFileSync(insFile, 'utf8'));
  const hist = new Map();
  const sites = new Map();
  for (const x of ins) {
    if (!/ARITH/.test(String(x.role))) continue;
    for (let t = 1; t < x.ops.length; t++) {
      const v = x.ops[t];
      if (!Number.isFinite(v) || v < 100000 || v > 10000000) continue;
      hist.set(v, (hist.get(v) || 0) + 1);
      if (!sites.has(v)) sites.set(v, []);
      if (sites.get(v).length < 4) sites.get(v).push(x.ip);
    }
  }
  return [...hist.entries()].sort((a, b) => b[1] - a[1]).map(([v, n]) => ({ value: v, count: n, ips: sites.get(v) }));
}

/* ------------------------------------------------------------------ */
/* 候选组合：4 个位置，每位 ∈ {0} ∪ (盐×±)，至多 maxSalt 个非零          */
/* ------------------------------------------------------------------ */

function saltCombos(salts, maxNonZero) {
  const vals = [0];
  for (const s of salts) { vals.push(s); vals.push(-s); }
  const out = [];
  const rec = (i, cur, nz) => {
    if (i === 4) { out.push(cur.slice()); return; }
    for (const v of vals) {
      const n = nz + (v !== 0 ? 1 : 0);
      if (n > maxNonZero) continue;
      cur.push(v); rec(i + 1, cur, n); cur.pop();
    }
  };
  rec(0, [], 0);
  return out;
}

/* ------------------------------------------------------------------ */
/* 判据                                                                */
/* ------------------------------------------------------------------ */

function headScore(bytes) {
  // 明文头部 8B 是否像 JSON 起点
  if (bytes[0] !== 0x7b && bytes[0] !== 0x5b) return 0;
  let pr = 0, punct = 0;
  for (const b of bytes.subarray(0, 8)) {
    if (b >= 0x20 && b < 0x7f) pr++;
    if (b === 0x22 || b === 0x3a || b === 0x2c || b === 0x7b || b === 0x5d || b === 0x5b) punct++;
  }
  return pr >= 7 && punct >= 2 ? pr + punct : 0;
}

function tryJson(buf) {
  const txt = buf.toString('utf8').replace(/\u0000+$/, '');
  try {
    const obj = JSON.parse(txt);
    return { ok: true, txt, obj };
  } catch (e) { return { ok: false, txt, err: e.message }; }
}

function verifyFull(ct, ek, rounds, swap) {
  const pt = decryptBuffer(ct, ek, rounds, swap);
  const p = tryJson(pt);
  return { pt, ...p };
}

/* ------------------------------------------------------------------ */
/* 主流程                                                              */
/* ------------------------------------------------------------------ */

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.file) {
    console.error('用法: node tools/tdc_key2.mjs <tdc.js> --selfcheck [--rounds 32] [--sample 8] [--max-salt 2]');
    console.error('      node tools/tdc_key2.mjs <tdc.js> <collect.txt|collect.json>');
    process.exit(2);
  }
  const tdcFile = path.resolve(args.file);
  if (!fs.existsSync(tdcFile)) { console.error('找不到 ' + tdcFile); process.exit(2); }
  console.log(`[1/5] build: ${path.basename(tdcFile)}  ${fs.statSync(tdcFile).size} bytes`);

  // 反汇编产物 + 盐候选
  const dis = ensureDisasm(tdcFile);
  if (!dis.file) { console.error('卡在第 1 层（反汇编）：' + (dis.error || '未生成')); process.exit(3); }
  const salts = saltCandidates(dis.file);
  console.log(`[2/5] 反汇编 ${path.relative(ROOT, dis.file)}；S 候选（ARITH 大立即数）${salts.length} 个：`);
  for (const s of salts.slice(0, 8)) console.log(`      S=${s.value}  出现 ${s.count} 次  站点 ip ${s.ips.join(',')}`);

  // 静态 key 词（作为补充候选 + 可解释性）
  let staticWords = [];
  try {
    const ins = JSON.parse(fs.readFileSync(dis.file, 'utf8'));
    staticWords = extractKeyCandidates(ins).slice(0, 8).map(c => c.word);
    console.log(`      静态 charCodeAt 打包候选词 ${staticWords.length} 个：${staticWords.map(w => '0x' + w.toString(16)).join(' ')}`);
  } catch (e) { console.log('      静态词提取失败：' + e.message); }

  // 取 collect：key 候选始终来自"跑一遍 VM"，collect 可以外部指定（自证 or 解真包）
  let ct, runInfo = null;
  console.log('[3/5] 在本机 VM 里跑同一份 tdc.js（key 候选 + 自证数据源）');
  runInfo = await runVmAndHarvest(tdcFile, args.sample);
  console.log(`      dispatcher ${runInfo.patched ? '已插桩' : '未插桩(仅静态候选)'}；采样到 ${runInfo.keyArrays.length} 个 4 元整数数组；VM collect ${runInfo.buf.length} 字节 / ${runInfo.buf.length / 8} 块`);
  for (const k of runInfo.keyArrays.slice(0, 6)) {
    console.log(`      key候选 ip=${k.ip} x${k.count}  [${k.words.join(', ')}]`);
  }
  if (args.collect) {
    ct = readCollectFile(path.resolve(args.collect));
    console.log(`      外部 collect: ${args.collect}  ${ct.length} 字节 / ${ct.length / 8} 块`);
  } else {
    ct = runInfo.buf;
  }
  if (!ct || ct.length < 16) { console.error('collect 太短'); process.exit(4); }

  // 候选 key（运行期优先）
  const keyCands = runInfo.keyArrays
    .filter(k => k.words.some(w => w !== 0))
    .map(k => ({ words: k.words, from: `runtime ip=${k.ip} x${k.count}` }));

  const saltVals = salts.slice(0, 6).map(s => s.value);
  const roundsList = (Array.isArray(args.rounds) ? args.rounds : [32]);

  /* ---- 分级枚举：先用运行期 key + 标准参数；失败再放宽维度 ---- */
  const stages = [];
  stages.push({ name: '① 运行期 key × S 位置 × 端序', keys: keyCands, combos: saltCombos(saltVals, args.maxSalt), rounds: roundsList, offsets: [0] });
  if (args.fallback) {
    stages.push({ name: '② + 8B 内偏移 0..7 × 轮数 16/24/48/64', keys: keyCands, combos: saltCombos(saltVals, args.maxSalt), rounds: [16, 24, 32, 48, 64], offsets: [0, 1, 2, 3, 4, 5, 6, 7] });
    const tuples = [];
    const W = staticWords.slice(0, 10);
    for (const a of W) for (const b of W) if (b !== a) for (const c of W) if (c !== a && c !== b) for (const d of W) if (d !== a && d !== b && d !== c) tuples.push([a, b, c, d]);
    if (tuples.length) {
      stages.push({
        name: '③ 静态 charCodeAt 打包词四元组（' + W.length + ' 词 → ' + tuples.length + ' 序）× S 位置 × 端序',
        keys: tuples.map(t => ({ words: t, from: 'static pack' })),
        combos: saltCombos(saltVals, args.maxSalt), rounds: [32], offsets: [0],
      });
    }
  }

  const t0 = Date.now();
  let found = null, tried = 0;
  const b0 = ct.readUInt32LE(0), b1 = ct.readUInt32LE(4);

  outer:
  for (const st of stages) {
    console.log(`[4/5] ${st.name}：key ${st.keys.length} × S ${st.combos.length} × 轮 ${st.rounds.join('/')} × 端序 2 × 偏移 ${st.offsets.length}`);
    for (const kc of st.keys) {
      for (const sp of st.combos) {
        const ek = kc.words.map((w, i) => (w + sp[i]) | 0);
        for (const rounds of st.rounds) {
          for (const swap of [false, true]) {
            for (const off of st.offsets) {
              tried++;
              const body = off ? ct.subarray(off) : ct;
              const x0 = off ? body.readUInt32LE(0) : b0;
              const x1 = off ? body.readUInt32LE(4) : b1;
              const [x, y] = swap ? xteaDecryptBlock(x1, x0, ek, rounds) : xteaDecryptBlock(x0, x1, ek, rounds);
              const head = Buffer.alloc(8);
              if (swap) { head.writeUInt32LE(y, 0); head.writeUInt32LE(x, 4); }
              else { head.writeUInt32LE(x, 0); head.writeUInt32LE(y, 4); }
              if (!headScore(head)) continue;
              const v = verifyFull(body, ek, rounds, swap);
              if (v.ok) { found = { stage: st.name, kc, sp, ek, rounds, swap, off, v, ctBody: body }; break outer; }
            }
          }
        }
      }
    }
  }

  if (!found) {
    console.log(`      试了 ${tried} 组，${((Date.now() - t0) / 1000).toFixed(1)}s，没有一组能把 collect 解成 JSON`);
    console.log('      已排除的维度清单：');
    for (const st of stages) {
      console.log(`        ${st.name}：${st.keys.length * st.combos.length * st.rounds.length * 2 * st.offsets.length} 组`);
    }
    console.log('        key 候选：' + keyCands.map(k => '[' + k.words.join(',') + '](' + k.from + ')').join(' '));
    console.log('        S 组合：' + saltCombos(saltVals, args.maxSalt).length + ' 种（位置 0-3 × 至多 ' + args.maxSalt + ' 个非零 × 盐 ' + saltVals.join('/') + ' ±）');
    process.exit(5);
  }

  /* ---------------- 输出 ---------------- */
  const { kc, sp, ek, rounds, swap, v } = found;
  console.log(`[5/5] 命中（${tried} 组 / ${((Date.now() - t0) / 1000).toFixed(1)}s）`);
  console.log(`  key 四字      : [${kc.words.join(', ')}]      ← ${kc.from}`);
  console.log(`  S(附加常量)   : [${sp.join(', ')}]  ← 非零位取自反汇编 ARITH 大立即数`);
  for (let i = 0; i < 4; i++) {
    if (!sp[i]) continue;
    const hit = salts.find(s => s.value === Math.abs(sp[i]));
    console.log(`    位 ${i}: ${kc.words[i]} + ${sp[i]} = ${ek[i]}   (盐 ${Math.abs(sp[i])} 的站点 ip ${hit ? hit.ips.join(',') : '?'})`);
  }
  console.log(`  EK = key + S  : [${ek.join(', ')}]`);
  const kb = Buffer.alloc(16);
  ek.forEach((x, i) => kb.writeUInt32LE(x >>> 0, i * 4));
  console.log(`  EK 字节       : ${kb.toString('hex')}`);
  console.log(`  参数          : XTEA / ${rounds} 轮 / ECB / 8B 块 / (v0,v1)=小端 u32${swap ? '（已交换 v0/v1）' : ''} / sum 在两半之间 += delta`);

  const pt = v.pt;
  const head = pt.subarray(0, 120).toString('latin1').replace(/[^\x20-\x7e]/g, '·');
  console.log(`  明文头 120B   : ${head}`);
  const cd = v.obj && Array.isArray(v.obj.cd) ? v.obj.cd.length : -1;
  console.log(`  明文          : ✓ 合法 JSON，${Buffer.byteLength(v.txt)} 字节，顶层键 [${Object.keys(v.obj).join(', ')}]，cd 槽 ${cd}`);
  const pad = pt.length - Buffer.byteLength(v.txt);
  console.log(`  长度补齐      : ${pad} 字节 \\0（collect ${ct.length}B = 明文 ${Buffer.byteLength(v.txt)}B + ${pad}B）`);

  console.log('\n  OK');
  console.log(JSON.stringify({ key: kc.words, S: sp, EK: ek, rounds, swap, cd, bytes: Buffer.byteLength(v.txt) }, null, 1));
  if (process.env.TDC_OUT) {
    fs.writeFileSync(process.env.TDC_OUT, JSON.stringify(v.obj, null, 1));
    console.log('  已写出: ' + process.env.TDC_OUT);
  }
}

if (process.argv[1] && /tdc_key2\.mjs$/i.test(process.argv[1])) main();

export { xteaDecryptBlock, xteaEncryptBlock, decryptBuffer, saltCandidates, saltCombos, patchDispatcher };
