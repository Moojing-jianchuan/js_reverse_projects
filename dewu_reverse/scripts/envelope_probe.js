const crypto = require('crypto');
const md5 = b => crypto.createHash('md5').update(b).digest('hex');
const salt = '048a9c4943398714b356a696503d2d36';

const samples = [
  {
    name: 'probe-279(sign=000..0,pickRuleId=1)',
    plain: JSON.stringify({ sign: '00000000000000000000000000000000', pickRuleId: 1, pageNum: 1, pageSize: 24, filterUnbid: true, showCspu: true }),
    hex: '39a54d55570301b0b6476dee5a7ce7e3',
    b64: 'w6pQfDwFVsKmEsKMwqDCsAjCi8OXOsKow45OHMO5w4TDtMKuwonDuMOYMsOVeEHCjcOFTFNxw5PCvT4OJwTDj8Ktw7PDvcO6Hyt6NsKIL8Ohw5LDqQZ4EkQLw4/CncOow7xARMKLwp7Cj8O1wqzDnMOmPk0FwpUmJMKZRcOrw4FYNghrRsKULwrCrcKPbcOGRSbDvsO6woPCosOAw7ITLXvDmsK5OR5vS3HCjXTCg8KKw7rDtA=='
  },
  {
    name: 'click-283(pickRuleId=644443)',
    plain: JSON.stringify({ sign: '0e5d10fb111f2afef6ac0a1776187e23', pickRuleId: 644443, pageNum: 1, pageSize: 24, filterUnbid: true, showCspu: true }),
    hex: 'c536d0639fb2f24e2526ed558c463cf4',
    b64: 'w6pQfDwFVsKmEsKMwqDDpQ3Dn8OWOsO+wpxPHcO4wpLDtsO/w5/CrcKONMKEK0HDnMOES1R3w5LCtTlbJQfDj8Ktw7PDvcO6Hyt6NsKIL8Ohw5LDqQZ/ClJPwprDicKhwpBFSMOOw4HDsMKsw6PCjsK9aAR0wow9JsOeLMKwwo8RNlQwHsOMaB7CkcKNe8OKU1HCqsOswpjCs8KHw6RFLGbDkMOiWB53USTDtHPCgcKKwr3Cs2fDhMKNPMOn'
  }
];

function real(b64) {
  const buf = Buffer.from(b64, 'base64');
  const t = buf.toString('utf8');
  const o = Buffer.alloc(t.length);
  for (let i = 0; i < t.length; i++) o[i] = t.charCodeAt(i) & 0xff;
  return o;
}

for (const s of samples) {
  const r = real(s.b64);
  const p = Buffer.from(s.plain, 'latin1');
  console.log('\n###', s.name);
  console.log('plainLen', p.length, 'cipherLen', r.length);
  const cands = {
    'md5(plain)': md5(p),
    'md5(plain+salt)': md5(Buffer.concat([p, Buffer.from(salt)])),
    'md5(salt+plain)': md5(Buffer.concat([Buffer.from(salt), p])),
    'md5(b64)': md5(s.b64),
    'md5(cipherLatin1)': md5(r.toString('latin1')),
    'md5(cipherHex)': md5(r.toString('hex')),
    'md5(plain)+salt?': md5(Buffer.from(md5(p) + salt))
  };
  for (const [k, v] of Object.entries(cands)) console.log(' ', k, v, v === s.hex ? ' <== MATCH' : '');
  if (p.length === r.length) {
    const ks = Buffer.alloc(p.length);
    for (let i = 0; i < p.length; i++) ks[i] = p[i] ^ r[i];
    console.log('  keystream:', ks.toString('hex'));
  }
}
