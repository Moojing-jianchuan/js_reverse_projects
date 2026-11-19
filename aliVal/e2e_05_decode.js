// e2e_05_decode.js — armour 逆变换：把历史 data 样本解回 payload（用于扩大样本量做几何反推）
// armour 正向：out[i] = ((c + e + r[e]) - (a + r[a])) ^ (r[e]+r[a]) ^ r[(r[e]+r[a])&63]，然后 e=(e+1)&63
// 逆变换：c = ((out ^ r[(r[e]+r[a])&63] ^ (r[e]+r[a])) + (a + r[a]) - e - r[e]) & 0xff
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { ARMOUR_TABLE, ARMOUR_SEED } = require('./feilin_data');

const MASK63 = 63;
function swap3xor(a, i, j) { a[i] ^= a[j]; a[j] ^= a[i]; a[i] ^= a[j]; }

function unarmour(bytes, seed = ARMOUR_SEED) {
  const r = ARMOUR_TABLE.slice();
  const n = String(seed);
  for (let i = 0, t = 0; i < r.length; i++) {
    t = ((((i + t) + r[i] + r[t]) >> 1) + n.charCodeAt(i % n.length)) & MASK63;
    if (i !== t) swap3xor(r, i, t);
  }
  const out = Buffer.alloc(bytes.length);
  let e = 0, a = 0;
  for (let i = 0; i < bytes.length; i++) {
    a = ((e ^ a) + (r[e] ^ r[a])) & MASK63;
    if (e !== a) swap3xor(r, e, a);
    const k = (r[e] + r[a]) & MASK63;
    let m = bytes[i] ^ r[k] ^ (r[e] + r[a]);
    m = ((m + (a + r[a]) - e - r[e]) & 0xff);
    out[i] = m;
    e = (e + 1) & MASK63;
  }
  return out;
}

function decodeData(dataB64) {
  const raw = Buffer.from(dataB64, 'base64');
  const magic = [...raw.slice(0, 3)].map(x => x.toString(16).padStart(2, '0')).join(' ');
  const T = unarmour(raw).toString('latin1');
  let payload = null, err = null;
  try {
    const plain = zlib.inflateSync(Buffer.from(T, 'base64')).toString('utf8');
    payload = { nonce: plain.slice(0, 32), json: JSON.parse(plain.slice(32)), plainLen: plain.length };
  } catch (e) { err = e.message; }
  return { magic, Tlen: T.length, Thead: T.slice(0, 8), payload, err };
}

function summarize(p) {
  const j = p.json, T = j.TrackList;
  const mm = (T.mm || '').split('|').filter(Boolean).map(s => s.split(','));
  const first = mm[0], last = mm[mm.length - 1];
  const mu = (T.mu || '').split(',');
  return {
    xPos: j.xPos, slidePos: j.slidePos, arg: j.arg,
    dt: j.VerifyTime - j.TrackStartTime,
    mmN: mm.length,
    mmFirstX: first && +first[0], mmLastX: last && +last[0],
    muX: +mu[0],
    movement_mu_mc: mu[0] ? +(mu[0] - (+T.mc.split(',')[0])) : null,
    ratio_movement_over_slidePos: mu[0] && +j.slidePos ? +(((mu[0] - (+T.mc.split(',')[0])) / (+j.slidePos)).toFixed(3)) : null,
    si: T.si,
  };
}

module.exports = { unarmour, decodeData, summarize };

if (require.main === module) {
  const files = [
    'config/data_from_page.txt', 'config/browser_data.txt', 'config/browser_data_valid.txt',
    'config/data_fresh.txt', 'config/data_sample.txt', 'config/data_stack.json',
  ];
  for (const f of files) {
    if (!fs.existsSync(f)) continue;
    const raw = fs.readFileSync(f, 'utf8');
    let candidates = [];
    const trimmed = raw.trim();
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      // JSON：把所有看起来像 base64 data 的长字符串收集起来
      const walk = v => {
        if (typeof v === 'string') { if (v.length > 400 && /^[A-Za-z0-9+/=]+$/.test(v)) candidates.push(v); }
        else if (Array.isArray(v)) v.forEach(walk);
        else if (v && typeof v === 'object') Object.values(v).forEach(walk);
      };
      try { walk(JSON.parse(trimmed)); } catch (e) { }
    } else {
      if (/^[A-Za-z0-9+/=]+$/.test(trimmed)) candidates.push(trimmed);
    }
    console.log('\n########', f, '| candidates', candidates.length);
    for (const c of candidates) {
      const r = decodeData(c);
      console.log('  len', c.length, 'magic', r.magic, 'T', r.Tlen, r.Thead + '…', r.err ? ('ERR ' + r.err) : '');
      if (r.payload) console.log('  ->', JSON.stringify(summarize(r.payload)));
    }
  }
}
