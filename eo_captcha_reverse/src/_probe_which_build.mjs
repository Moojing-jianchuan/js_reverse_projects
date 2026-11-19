import fs from 'node:fs';
import { decryptBuffer } from '../tools/tdc_key2.mjs';

const EKs = {
  mix: [1364487746, 1096240964, 1682399563, 1700026214],
  cur: [1347505518, 1262969173, 1397384810, 1179739983],
  cap11: [1799514436, 1197630312, 1650806373, 1164071495],
};
const files = process.argv.slice(2);
for (const f of files) {
  if (!fs.existsSync(f)) { console.log(f, 'MISSING'); continue; }
  const raw = fs.readFileSync(f, 'utf8').trim();
  let t = raw;
  try { t = decodeURIComponent(raw); } catch { }
  t = t.replace(/\s+/g, '');
  if (!/^[A-Za-z0-9+/=_-]+$/.test(t)) { console.log(f, 'not base64-ish'); continue; }
  const buf = Buffer.from(t.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
  const line = [f.padEnd(34), ('len=' + buf.length).padEnd(10)];
  let best = null;
  for (const [n, ek] of Object.entries(EKs)) {
    const s = decryptBuffer(buf, ek, 32, false).toString('latin1');
    if (s.startsWith('{"cd":')) best = n + ' *** MATCH ***';
  }
  console.log(...line, best || 'no-match');
}
