// 纯算法层自检：任意明文往返 + verify 形态 + 与 SDK 常量对照
const L = require('../src/preinforce_loader.js');

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('PASS ', name, extra || ''); }
  else { fail++; console.log('FAIL ', name, extra || ''); }
}

// 1) 往返（多种长度，覆盖 verify 量级）
for (const n of [8, 200, 1301, 3500, 9000]) {
  const p = 'A'.repeat(Math.max(0, n - 22)) + '|tail-marker-1234567';
  const d = L.buildD(p);
  ok('roundtrip len=' + p.length, L.decryptD(d) === p, 'd.len=' + d.length);
}

// 2) 长度关系：len(d) = 4*ceil(utf8len/3)
{
  const p = 'x'.repeat(1000);
  const d = L.buildD(p);
  const raw = Buffer.from(d, 'base64');
  const s = raw.toString('utf8');
  ok('base64 层长度关系', d.length === 4 * Math.ceil(raw.length / 3) && s.length === 1000, 'raw=' + raw.length + ' cipher=' + s.length);
}

// 3) sign 规则
{
  const d = 'test-d-value';
  const crypto = require('crypto');
  const expect = crypto.createHash('md5').update('d' + d + '048a9c4943398714b356a696503d2d36', 'utf8').digest('hex');
  ok('sign 规则', L.signD(d) === expect, L.signD(d));
}

// 4) verify 形态（sessionID + datav3）能加能解
{
  const verifyPlain = JSON.stringify({
    sessionID: 'abc123', bcv: '1.3.1.20260331', type: 2,
    c: 'v=1.3.1.20260331|rest=12|vrest=0|vreqt=0|sqt=0|ojst=0', webp: 0,
    data: JSON.stringify({ yt: 2, dua: 'UA' }),
    datav3: '0,0|1,1|2,2', datav3Fail: '', cRestStart: 1763600000000
  });
  const body = L.buildCaptchaBody(verifyPlain);
  ok('verify 形态往返', L.decryptD(body.d) === verifyPlain, 'plain=' + verifyPlain.length + ' d=' + body.d.length);
}

// 5) 超长明文要报错而不是静默截断
{
  let threw = false;
  try { L.buildD('Z'.repeat(20000)); } catch (e) { threw = /keystream/.test(String(e.message)); }
  ok('超长明文显式报错', threw);
}

// 6) 模板可用
{
  const t = L.callPlainTemplate();
  const body = L.buildCaptchaBody(t);
  const back = JSON.parse(L.decryptD(body.d));
  ok('call 模板可加密可解析', Object.keys(back).join(',') === 'bcv,type,c,webp,data', 'd=' + body.d.length);
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
