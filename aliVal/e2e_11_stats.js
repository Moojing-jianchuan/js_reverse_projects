// e2e_11_stats.js — 解出刚抓到的 cvp：mm 点数 / flag 集合 / xPos / slidePos / 位移对齐检查
const fs = require('fs');
const path = require('path');
const { decodeData } = require('./e2e_05_decode');

const f = path.join(__dirname, 'static', 'work', 'e2e', 'cvp_live.json');
if (!fs.existsSync(f)) { console.log('[stats] no cvp_live.json'); process.exit(1); }
const rec = JSON.parse(fs.readFileSync(f, 'utf8'));
const cvp = rec.cvp;
if (!cvp || !cvp.data) { console.log('[stats] cvp missing data'); process.exit(1); }
const d = decodeData(cvp.data);
if (!d.payload) { console.log('[stats] decode fail:', d.err); process.exit(1); }
const j = d.payload.json, T = j.TrackList;
const mm = (T.mm || '').split('|').filter(Boolean).map(s => s.split(','));
const mp = (T.mp || '').split('|').filter(Boolean).map(s => s.split(','));
const ys = mm.map(p => +p[1]);
const dts = mm.slice(1).map((p, i) => +p[2] - +mm[i][2]);
const out = {
  certifyId: cvp.certifyId, dataLen: cvp.data.length,
  mmN: mm.length, mpN: mp.length,
  mmFlags: [...new Set(mm.map(p => p[3]))], mpFlags: [...new Set(mp.map(p => p[3]))],
  mc5: T.mc.split(',')[4], mu5: T.mu.split(',')[4],
  xPos: j.xPos, slidePos: j.slidePos, xPosX25: +(j.xPos * 2.5).toFixed(1),
  movement: (+T.mu.split(',')[0]) - (+T.mc.split(',')[0]),
  dragMs: (+T.mu.split(',')[2]) - (+T.mc.split(',')[2]),
  dtMin: Math.min(...dts), dtMax: Math.max(...dts), dtAvg: +(dts.reduce((a, b) => a + b, 0) / dts.length).toFixed(1),
  yRange: [Math.min(...ys), Math.max(...ys)],
  arg: j.arg,
};
console.log('[stats] ' + JSON.stringify(out));
