const fs = require('fs');
const zlib = require('zlib');
const b64 = fs.readFileSync('config/sample_deflate.b64', 'utf8').trim();
const j = zlib.inflateSync(Buffer.from(b64, 'base64')).toString('utf8');
console.log('json len', j.length);
console.log('prefix32:', j.slice(0, 32));
const obj = JSON.parse(j.slice(32));
console.log('top keys:', Object.keys(obj));
const tl = obj.TrackList || {};
console.log('TrackList keys:', Object.keys(tl));
for (const [k, v] of Object.entries(tl)) {
  if (typeof v === 'string' && v.length > 120) console.log(`  ${k}: (${v.length}) ${v.slice(0, 160)} ... ${v.slice(-80)}`);
  else console.log(`  ${k}:`, JSON.stringify(v));
}
