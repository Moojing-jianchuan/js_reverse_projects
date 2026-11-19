// cmp_blob.mjs — prove eks == window[TDC_NAME] baked into the served tdc.js
import fs from 'node:fs';

const body = fs.readFileSync('samples/capture2/124_tdcjs.body.txt', 'utf8');
const nameM = body.match(/window\.TDC_NAME\s*=\s*"([^"]+)"/);
const name = nameM[1];
const start = body.indexOf('window.' + name + '=');
const q1 = body.indexOf("'", start);
const q2 = body.indexOf("'", q1 + 1);
const blob = body.slice(q1 + 1, q2);
console.log('TDC_NAME =', name, ' blob len =', blob.length);

const meta = JSON.parse(fs.readFileSync('samples/capture2/128_verify.meta.json', 'utf8'));
const eks = new URLSearchParams(meta.postData).get('eks');
console.log('eks len =', eks.length);
console.log('IDENTICAL =', blob === eks);
console.log('blob head =', blob.slice(0, 64));
console.log('eks  head =', eks.slice(0, 64));
let diff = -1;
for (let i = 0; i < Math.min(blob.length, eks.length); i++) if (blob[i] !== eks[i]) { diff = i; break; }
console.log('first diff at', diff);
