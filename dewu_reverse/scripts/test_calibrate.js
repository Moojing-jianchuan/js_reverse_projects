// 校验 calibrateKeystream()
const L = require('../src/preinforce_loader.js');

(async () => {
  console.log('模板顶层键:', Object.keys(L.callPlainTemplate()).join(','));

  const ks = L.getKeystream();
  const cal0 = await L.calibrateKeystream('', { pad: 0 });
  let same = 0;
  for (let i = 0; i < Math.min(ks.length, cal0.length); i++) if (ks[i] === cal0[i]) same++;
  console.log('标定(sk="") vs 内置 keystream: 相同', same, '/', Math.min(ks.length, cal0.length), '| 标定长度', cal0.length);

  const ksA = await L.calibrateKeystream('A'.repeat(96), { pad: 0 });
  console.log('标定(sk=96A) ks8:', ksA.slice(0, 8).toString('hex'), '| 长度', ksA.length);

  const ksB = await L.calibrateKeystream('B'.repeat(96), { pad: 0 });
  console.log('标定(sk=96B) ks8:', ksB.slice(0, 8).toString('hex'), '| 长度', ksB.length);

  const plain = L.callPlainTemplate();
  const body = L.buildCaptchaBody(plain, ksA);
  console.log('用 sk=96A 的 ks 加密模板: d.len', body.d.length, '| 解密往返一致:', L.decryptD(body.d, ksA) === JSON.stringify(plain));
  console.log('用错 ks(内置) 解同一条 d 是否也能解出可读 JSON:',
    (() => { try { JSON.parse(L.decryptD(body.d)); return 'YES(不应该)'; } catch (e) { return 'NO(符合预期)'; } })());
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
