import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import { buildEnv, createContext } from './env.mjs';

const root = process.cwd();
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:152.0) Gecko/20100101 Firefox/152.0';
const TARGET = 'https://blog.51cto.com/u_16213614/14723924';
const preMeta = JSON.parse(fs.readFileSync(path.join(root, 'samples', 'capture2', '119_prehandle.meta.json'), 'utf8'));
const extract = (b, re) => { const m = b.match(re); return m ? m[1] : null; };
const randDigits = (n) => { let s = String(1 + Math.floor(Math.random() * 8)); while (s.length < n) s += Math.floor(Math.random() * 10); return s; };
const solvePow = (prefix, target, maxIter = 80000000) => {
  const t0 = Date.now();
  for (let i = 0; i < maxIter; i++) if (crypto.createHash('md5').update(prefix + i).digest('hex') === target) return { nonce: i, ms: Math.max(1, Date.now() - t0) };
  return null;
};

// 1. prehandle
const url = new URL(preMeta.url);
url.searchParams.set('deviceID', randDigits(10));
url.searchParams.set('uuid', randDigits(20));
{ const kp = crypto.generateKeyPairSync('x25519'); url.searchParams.set('ec_pub', kp.publicKey.export({ type: 'spki', format: 'der' }).subarray(-32).toString('base64')); }
url.searchParams.set('callback', '_aq_' + Math.floor(Math.random() * 900000 + 100000));
const preRes = await fetch(url.toString(), { headers: { 'user-agent': UA, accept: '*/*', referer: 'https://blog.51cto.com/' } });
const preBody = await preRes.text();
const sess = extract(preBody, /"sess":"([^"]*)"/);
const prefix = extract(preBody, /"pow_cfg":\{"prefix":"([^"]*)"/);
const md5t = extract(preBody, /"pow_cfg":\{"prefix":"[^"]*","md5":"([^"]*)"/);
const tdcPath = (extract(preBody, /"tdc_path":"([^"]*)"/) || '').replace(/\\\//g, '/');
const deviceID = url.searchParams.get('deviceID');
console.log('[1] prehandle', preRes.status, 'sess', sess && sess.slice(0, 12), 'prefix', prefix);
if (!sess || !tdcPath) process.exit(1);

// the SDK carries "1;<sid>" in its payload; the sid comes from the prehandle URL
const sidParam = url.searchParams.get('sid');
console.log('[1b] sid =', sidParam);

// 2. current tdc.js
const tdcRes = await fetch('https://captcha.eo.qq.com' + tdcPath, { headers: { 'user-agent': UA, referer: 'https://captcha.eo.gtimg.com/' } });
const tdcSrc = await tdcRes.text();
fs.writeFileSync(path.join(root, 'samples', 'online_tdc.js'), tdcSrc);
const nameM = tdcSrc.match(/window\.TDC_NAME\s*=\s*"([^"]+)"/);
const eksM = nameM ? tdcSrc.match(new RegExp('window\\.' + nameM[1] + "='([^']+)'")) : null;
const eks = eksM ? eksM[1] : null;
console.log('[2] tdc.js', tdcRes.status, tdcSrc.length, 'eks', eks && eks.length);

// 3. run it in our sandbox — the VM encrypts with its own key
const w = buildEnv();
w.globalThis = w;
if (sidParam) w.TCaptchaSid = sidParam;   // <- the one slot the server actually validates
const __tdcUrl = tdcRes.url || 'https://captcha.eo.qq.com/tdc.js';
const __ctx = createContext(w, __tdcUrl).ctx;
vm.runInContext(tdcSrc, __ctx, { filename: __tdcUrl, timeout: 40000 });
await new Promise(r => setTimeout(r, 1200));
const collect0 = decodeURIComponent(w.TDC.getData(true));
console.log('[3] local collect', collect0.length, '(flag;sid slot still 0;…)');

// 3b. fix the ONE slot the server validates: "0;<sid>" -> "1;<sid>"
// The flag bit is set to 1 by the real browser and flipping it to 0 gets errorCode=12.
let collect = collect0;
try {
  const { execFileSync } = await import('node:child_process');
  let keyOut = '';
  const tdcFile = path.join(root, 'samples', 'online_tdc.js');
  try {
    keyOut = execFileSync(process.execPath, [path.join(root, 'tools', 'tdc_key3.mjs'), tdcFile, '--selfcheck'], { encoding: 'utf8', cwd: root, timeout: 300000 });
  } catch (e) { keyOut = (e.stdout || '') + (e.stderr || ''); }
  const ekM = keyOut.match(/"EK":\s*\[([0-9,\s]+)\]/);
  const EK = ekM ? ekM[1].split(',').map(s => Number(s.trim())) : null;
  if (EK) {
    const D = 0x9e3779b9;
    const xdec = (buf) => {
      const out = Buffer.alloc(buf.length);
      for (let off = 0; off + 8 <= buf.length; off += 8) {
        let v0 = buf.readUInt32LE(off), v1 = buf.readUInt32LE(off + 4);
        let sum = (D * 32) >>> 0;
        for (let i = 0; i < 32; i++) {
          v1 = (v1 - ((((v0 << 4) ^ (v0 >>> 5)) + v0) ^ (sum + EK[(sum >>> 11) & 3]))) >>> 0;
          sum = (sum - D) >>> 0;
          v0 = (v0 - ((((v1 << 4) ^ (v1 >>> 5)) + v1) ^ (sum + EK[sum & 3]))) >>> 0;
        }
        out.writeUInt32LE(v0 >>> 0, off);
        out.writeUInt32LE(v1 >>> 0, off + 4);
      }
      return out;
    };
    const xenc = (buf) => {
      const out = Buffer.alloc(buf.length);
      for (let off = 0; off + 8 <= buf.length; off += 8) {
        let v0 = buf.readUInt32LE(off), v1 = buf.readUInt32LE(off + 4);
        let sum = 0;
        for (let i = 0; i < 32; i++) {
          v0 = (v0 + ((((v1 << 4) ^ (v1 >>> 5)) + v1) ^ (sum + EK[sum & 3]))) >>> 0;
          sum = (sum + D) >>> 0;
          v1 = (v1 + ((((v0 << 4) ^ (v0 >>> 5)) + v0) ^ (sum + EK[(sum >>> 11) & 3]))) >>> 0;
        }
        out.writeUInt32LE(v0 >>> 0, off);
        out.writeUInt32LE(v1 >>> 0, off + 4);
      }
      return out;
    };
    const plain = xdec(Buffer.from(collect0, 'base64')).toString('utf8').replace(/\0+$/, '');
    const j = JSON.parse(plain);
    const fixedSlots = [];
    for (let i = 0; i < j.cd.length; i++) {
      const v = j.cd[i];
      // 1) "<flag>;<sid>" -> "1;<prehandle sid>"
      if (typeof v === 'string' && /^[01];\d+$/.test(v)) {
        const want = '1;' + (sidParam || v.split(';')[1]);
        if (v !== want) { j.cd[i] = want; fixedSlots.push(i + ':' + v + '->' + want); }
        continue;
      }
      // 2) "top" -> "iframe" (the SDK runs inside the widget iframe)
      if (v === 'top') { j.cd[i] = 'iframe'; fixedSlots.push(i + ':top->iframe'); continue; }
      // 3) automation score 22 -> 0
      if (v === 22) { j.cd[i] = 0; fixedSlots.push(i + ':22->0'); continue; }
      // 4) the "3" counter the real browser reports as 0
      if (v === 3) { j.cd[i] = 0; fixedSlots.push(i + ':3->0'); continue; }
    }
    console.log('[3b] fixed slots:', fixedSlots.join(', ') || '(none)');
    if (fixedSlots.length) globalThis.__keyOk = true;
    const rebuilt = Buffer.from(JSON.stringify(j), 'utf8');
    const padded = Buffer.concat([rebuilt, Buffer.alloc((8 - (rebuilt.length % 8)) % 8)]);
    collect = xenc(padded).toString('base64');
    console.log('[3b] collect (slots fixed)', collect.length);
  } else {
    console.log('[3b] key extraction failed, sending unfixed');
  }
} catch (e) {
  console.log('[3b] flag fix error:', e.message);
}

// 4. verify
const solved = solvePow(prefix, md5t);
console.log('[4] pow nonce', solved && solved.nonce, 'ms', solved && solved.ms);
const body = new URLSearchParams({
  collect, tlg: String(collect.length), eks, sess,
  ans: '[{"elem_id":0,"type":"DynAnswerType_TIME","data":""}]',
  deviceID,
  pow_answer: prefix + (solved ? solved.nonce : 0),
  pow_calc_time: String(solved ? solved.ms : 1),
});
const vRes = await fetch('https://captcha.eo.qq.com/cap_union_new_verify', {
  method: 'POST',
  headers: {
    'user-agent': UA, accept: 'application/json, text/javascript, */*; q=0.01',
    'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
    origin: 'https://captcha.eo.gtimg.com', referer: 'https://captcha.eo.gtimg.com/',
  },
  body: body.toString(),
});
const vBody = await vRes.text();
console.log('[5] verify', vRes.status, vBody.slice(0, 260));
fs.writeFileSync(path.join(root, 'samples', 'online_vm_verify.json'), JSON.stringify({ collect, vBody }, null, 1));
let p = null; try { p = JSON.parse(vBody); } catch (e) {}
if (p && p.errorCode === '0' && p.ticket) {
  console.log('*** TICKET', p.ticket.slice(0, 40));
  const page = await fetch(TARGET, { headers: { 'user-agent': UA, cookie: 'EO-Bot-Captcha-Token=' + p.ticket } });
  const html = await page.text();
  console.log('    target', page.status, 'len', html.length, 'captcha=', /Security Verification/.test(html));
  fs.writeFileSync(path.join(root, 'samples', 'online_target.html'), html);
  process.exit(0);
}
// exit codes let a wrapper retry with a fresh session when the build is unextractable
if (!globalThis.__keyOk) process.exit(3);   // key3 could not extract this build
process.exit(2);                            // verify rejected
