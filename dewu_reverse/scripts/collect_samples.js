/**
 * 采样：为报告生成"输入 -> 输出"对拍样本（全离线）
 * 输出 artifacts/samples/pceptor_samples.json
 */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const pceptor = require('../src/pceptor_loader');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const md5 = s => crypto.createHash('md5').update(s, 'utf8').digest('hex');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'artifacts/samples/pceptor_samples.json');
const URL_INFO = 'https://app.dewu.com/api/v1/h5/commodity-pick-interfaces/pc/pick-rule-result/feeds/info';
const URL_OTHER = 'https://app.dewu.com/api/v1/h5/OTHER/path';
const SK = 'YOUR_SK_HERE';
const DWSM = 'YOUR_SHUMEIID_HERE';
const PLAIN = JSON.stringify({ sign: '0e5d10fb111f2afef6ac0a1776187e23', pickRuleId: 644443, pageNum: 1, pageSize: 24, filterUnbid: true, showCspu: true });

function real(b64) {
  const buf = Buffer.from(String(b64).replace(/-/g, '+').replace(/_/g, '/'), 'base64');
  const t = buf.toString('utf8');
  const o = Buffer.alloc(t.length);
  for (let i = 0; i < t.length; i++) o[i] = t.charCodeAt(i) & 0xff;
  return o;
}

/** 从 scripts/envelope_probe.js 里取抓包样本，避免手抄 */
function capturedSamples() {
  const src = fs.readFileSync(path.join(ROOT, 'scripts/envelope_probe.js'), 'utf8');
  const blocks = [...src.matchAll(/plain:\s*JSON\.stringify\((\{[^)]*\})\)[\s\S]*?hex:\s*'([0-9a-f]{32})'[\s\S]*?b64:\s*'([A-Za-z0-9+/=]+)'/g)];
  return blocks.map(m => ({ plainExpr: m[1], hex: m[2], b64: m[3] }));
}

(async () => {
  const out = { generatedAt: new Date().toISOString(), env: { node: process.version, sdk: 'artifacts/unpacked/pceptor.000.eval.js' } };
  const api = pceptor.load({ sk: SK, shumeiid: DWSM });
  await sleep(150);

  /* ---------- A. XHR 拦截 ---------- */
  out.A_xhr = [];
  for (const c of [
    { label: 'A1 POST/feeds-info body={"a":1}', url: URL_INFO, body: '{"a":1}' },
    { label: 'A2 POST/feeds-info body=""', url: URL_INFO, body: '' },
    { label: 'A3 POST/OTHER body={"a":1}', url: URL_OTHER, body: '{"a":1}' },
  ]) {
    const r = await api.getHeadersFor({ url: c.url, method: 'POST', bodyText: c.body });
    out.A_xhr.push({
      label: c.label,
      input: { url: c.url, method: 'POST', bodyText: c.body },
      output: { url: r.url, method: r.method, headers: r.headers, body: r.body },
    });
  }

  /* ---------- B. header 生成 ---------- */
  const dw = api.sandbox.dw;
  const safe = fn => { try { return String(fn()); } catch (e) { return '<throw ' + e.message + '>'; } };
  out.B_headers = {
    sources: {
      'dw.getSk()': safe(() => dw.getSk()),
      'dw.getSM()': safe(() => dw.getSM()),
      'dw.getLtk()': safe(() => dw.getLtk()),
      'localStorage.yuntuSession': api.state().storage.yuntuSession,
      'localStorage.dwsm': api.state().storage.dwsm,
      'document.cookie': api.state().cookie,
    },
    hsnByBody: [],
    adiSamples: [],
  };
  for (const body of ['', '{"a":1}', '{"b":1}', '{"a":12}', '{"a":"xx"}']) {
    const r = await api.getHeadersFor({ url: URL_INFO, method: 'POST', bodyText: body });
    out.B_headers.hsnByBody.push({
      body, bodyLen: body.length, hsn: r.headers.hsn, adi: r.headers.adi,
      ltk: r.headers.ltk, sessionid: r.headers.sessionid, shumeiid: r.headers.shumeiid, skt: r.headers.skt,
    });
  }
  const adi = out.B_headers.hsnByBody[0].adi || '';
  out.B_headers.adiSamples.push({ adi, b64DecodedUtf8: Buffer.from(adi, 'base64').toString('utf8'), len: adi.length });

  /* ---------- C. body 加密 / 响应解密 ---------- */
  const enc = await api.encryptBody(PLAIN, { url: URL_INFO });
  const caps = capturedSamples();
  const cap = caps[1] || caps[0] || { hex: '', b64: '' };
  const capCipher = real(cap.b64);
  const pbuf = Buffer.from(PLAIN, 'latin1');
  const ksLen = Math.min(pbuf.length, capCipher.length);
  const ks = Buffer.alloc(ksLen);
  for (let i = 0; i < ksLen; i++) ks[i] = pbuf[i] ^ capCipher[i];

  out.C_encrypt = {
    local: { input: PLAIN, md5: md5(PLAIN), mode: enc.mode, hex: enc.hex, encrypted: enc.encrypted, bodyText: enc.bodyText, headers: enc.headers },
    fun110: [],
    capturedSample: {
      note: '线上抓包既有结论（scripts/envelope_probe.js）：hex32 = md5(明文)，密文与明文等长，同一会话 keystream 固定',
      plain: PLAIN,
      hex: cap.hex,
      hexMatchesMd5: md5(PLAIN) === cap.hex,
      b64: cap.b64,
      plainLen: pbuf.length,
      cipherLen: capCipher.length,
      keystreamHex: ks.toString('hex'),
      keystreamMatchesKnown: ks.toString('hex').startsWith('91720f5562388428'),
    },
  };

  const fun = api.sandbox.fun;
  if (fun && fun.Fun110) {
    for (const [label, args] of [
      ['4 arg POST (no keyMap)', [PLAIN, 'post', '', true]],
      ['4 arg GET  (no keyMap)', [PLAIN, 'get', '', true]],
      ['2 arg', [PLAIN, 'post']],
    ]) {
      try {
        const r = fun.Fun110(...args);
        out.C_encrypt.fun110.push({
          label,
          fields: Object.keys(r || {}),
          a: String(r.a).slice(0, 48) + '...' + ' (len ' + String(r.a).length + ')',
          b: r.b,
          c: r.c,
          dEqualsInput: String(r.d) === PLAIN,
          dHead: String(r.d).slice(0, 48),
          e: String(r.e).slice(0, 48) + '...' + ' (len ' + String(r.e).length + ')',
        });
      } catch (e) { out.C_encrypt.fun110.push({ label, error: String(e.message) }); }
    }
  }

  const resp = await api.decryptResponse('eyJjb2RlIjoyMDB9', { url: URL_INFO, bodyText: PLAIN });
  out.C_response = { input: 'eyJjb2RlIjoyMDB9', changed: resp.changed, plaintext: resp.plaintext, trace: resp.trace };

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(out, null, 2));
  console.log('[written]', OUT);
  console.log('[A]', out.A_xhr.map(x => x.label + ' -> hsn=' + x.output.headers.hsn).join('\n    '));
  console.log('[B] hsn/len:', JSON.stringify(out.B_headers.hsnByBody.map(x => [x.bodyLen, x.hsn])));
  console.log('[B] adi:', JSON.stringify(out.B_headers.adiSamples[0]));
  console.log('[C] mode=', enc.mode, '| cap hex==md5?', out.C_encrypt.capturedSample.hexMatchesMd5,
    '| lens', out.C_encrypt.capturedSample.plainLen + '/' + out.C_encrypt.capturedSample.cipherLen,
    '| ks ok?', out.C_encrypt.capturedSample.keystreamMatchesKnown);
  console.log('[C] fun110 fields:', JSON.stringify(out.C_encrypt.fun110.map(f => [f.label, f.fields, f.c])));
  console.log('[C] resp changed=', resp.changed);
  process.exit(0);
})().catch(e => { console.error('ERR', e); process.exit(2); });
