// feilin_pools.js — extract every string-pool decoder in feilin076 (table hex, XOR key,
// index offset, pool entries) and decode all entries by brute-forcing the per-index key.
//
// usage: node feilin_pools.js <bundle> <outJson>
const fs = require('fs');

const bundle = process.argv[2];
const outJson = process.argv[3] || '../work/feilin076_pools.json';
const src = fs.readFileSync(bundle, 'utf8');

// ---- 1) locate every `indexOf(K^X.charCodeAt(0))` decoder -------------------
const re = /indexOf\((\d+)\^(\w+)\.charCodeAt\(0\)\)/g;
const decoders = [];
let m;
while ((m = re.exec(src))) {
  const key = parseInt(m[1], 10);
  const off = m.index;
  // table hex: the nearest preceding `="<hex>"` with length>64
  const back = src.slice(Math.max(0, off - 1200), off);
  const tm = [...back.matchAll(/="([0-9a-f]{64,})"/g)].pop();
  if (!tm) continue;
  const tableHex = tm[1];
  // pool array + index offset: look back for `n=[...]` and `[x-=N]`
  const back2 = src.slice(Math.max(0, off - 6000), off);
  const offM = [...back2.matchAll(/\[(\w+)-=(\d+)\]/g)].pop();
  // pool literal: the last array of quoted strings before the decoder
  const arrM = [...back2.matchAll(/=\[((?:"(?:[^"\\]|\\.)*"\s*,\s*){5,}"(?:[^"\\]|\\.)*")\]/g)].pop();
  decoders.push({
    decoderOff: off, key, tableHex,
    tableBytes: tableHex.length / 2,
    indexOffset: offM ? parseInt(offM[2], 10) : null,
    indexVar: offM ? offM[1] : null,
    poolLiteralOff: arrM ? src.indexOf(arrM[1], Math.max(0, off - 6000)) : null,
    pool: arrM ? JSON.parse('[' + arrM[1] + ']') : null,
  });
}
console.log('decoders found:', decoders.length);

// ---- 2) decode --------------------------------------------------------------
function alphabetOf(tableHex, xorKey) {
  const A = tableHex.match(/.{1,2}/g).map(h => parseInt(h, 16));
  return A.map(v => String.fromCharCode(xorKey ^ v)).join('');
}
function makeDecoder(tableHex, xorKey) {
  const ALPHA = alphabetOf(tableHex, xorKey);
  return function (text, key) {
    const out = []; let e = 0, u = 0;
    for (const ch of text) {
      const r = ALPHA.indexOf(ch);
      if (r < 0) continue;
      e = u % 4 ? 64 * e + r : r; u++;
      if ((u % 4) !== 1) out.push(((e >> ((-2 * u) & 6)) & 0xff) ^ key);
    }
    try { return new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(out)); }
    catch (e2) { return Buffer.from(out).toString('latin1'); }
  };
}
const GOOD = /^[\x20-\x7e\u4e00-\u9fa5]+$/;
const corpus = new Set();
for (const f of [bundle, '../bundles/pe.081.a2ede546e341a1b9.js', '../bundles/AliyunCaptcha.js']) {
  for (const mm of fs.readFileSync(f, 'utf8').matchAll(/[A-Za-z_$][A-Za-z0-9_$]{1,40}/g)) corpus.add(mm[0]);
}
function score(s) {
  if (!s || !GOOD.test(s)) return -1e6;
  let sc = s.length;
  if (corpus.has(s)) sc += 120;
  if (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(s)) sc += 25;
  const odd = (s.match(/[^A-Za-z0-9_$\s.:\-/\u4e00-\u9fa5]/g) || []).length;
  return sc - odd * 4;
}

const pools = [];
for (const d of decoders) {
  if (!d.pool) { pools.push({ ...d, decoded: null, note: 'pool literal not located' }); continue; }
  const dec = makeDecoder(d.tableHex, d.key);
  const alpha = alphabetOf(d.tableHex, d.key);
  const entries = d.pool.map((enc, i) => {
    const cands = [];
    for (let k = 0; k < 256; k++) {
      const s = dec(enc, k);
      if (!s) continue;
      cands.push({ key: k, s, sc: score(s) });
    }
    cands.sort((a, b) => b.sc - a.sc);
    return { index: i + (d.indexOffset || 0), encoded: enc, best: cands[0] || null, top: cands.slice(0, 3) };
  });
  pools.push({
    decoderOff: d.decoderOff, key: d.key, indexOffset: d.indexOffset,
    alphabet: alpha, alphabetDistinct: new Set(alpha).size,
    poolSize: d.pool.length, entries,
  });
}
const totalEntries = pools.reduce((a, p) => a + (p.entries ? p.entries.length : 0), 0);
const highConf = pools.reduce((a, p) => a + (p.entries ? p.entries.filter(e => e.best && e.top[1] && e.best.sc - e.top[1].sc > 40).length : 0), 0);
fs.writeFileSync(outJson, JSON.stringify({ decoders: decoders.length, totalEntries, highConf, pools }, null, 1));
console.log(`pools=${pools.length} entries=${totalEntries} highConfidence=${highConf} -> ${outJson}`);

// ---- 3) interesting strings -------------------------------------------------
const interesting = [];
const WANT = /^(fromCharCode|charCodeAt|charAt|String|Array|map|join|split|push|length|slice|substr|substring|replace|toString|apply|call|random|floor|btoa|atob|Uint8Array|data|certifyId|sceneId|deviceToken|enc|key|nonce)$/;
for (const p of pools) {
  if (!p.entries) continue;
  for (const e of p.entries) {
    if (e.best && WANT.test(e.best.s)) interesting.push({ decoder: p.decoderOff, index: e.index, key: e.best.key, s: e.best.s });
  }
}
console.log('\ninteresting entries:');
for (const it of interesting) console.log(`  decoder@${it.decoder} idx=${it.index} key=${it.key} ${JSON.stringify(it.s)}`);
