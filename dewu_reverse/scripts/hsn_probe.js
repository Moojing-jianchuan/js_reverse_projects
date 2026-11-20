// 验证 hsn 是否与请求体/密文相关
const crypto = require('crypto');
const md5 = b => crypto.createHash('md5').update(b).digest('hex');

const cases = [
  {
    name: 'accepted-125',
    hsn: '22a9ecc6cb12ec7d0e8bdf53bc34efce',
    data: 'df74e6521fc1ea3752eddb701c5453b8w6pQfDwFVsKmEsKMw7bCslrCjcKFPsO7w4hIGsO7w4bDs8O6wozDusKOZsKELBfCj8OATQVyw5PCujoKIlDDj8Ktw7PDvcO6Hyt6NsKIL8Ohw5LDqQZ/ClJPwpnDg8KhwpBFSMOOw4HDsMKsw6PCjsK9aAR0wow9JsOeLMKwwo8RNlQwHsOMaB7CkcKNe8OKU1HCqsOswpjCs8KHw6RFLGbDkMOiWB53USTDtHPCgcKKwr3Cs2fDhMKNPMOn'
  },
  {
    name: 'rejected-283',
    hsn: '9ccee896d2c6f9a598d78000b96453df',
    data: 'c536d0639fb2f24e2526ed558c463cf4w6pQfDwFVsKmEsKMwqDDpQ3Dn8OWOsO+wpxPHcO4wpLDtsO/w5/CrcKONMKEK0HDnMOES1R3w5LCtTlbJQfDj8Ktw7PDvcO6Hyt6NsKIL8Ohw5LDqQZ/ClJPwprDicKhwpBFSMOOw4HDsMKsw6PCjsK9aAR0wow9JsOeLMKwwo8RNlQwHsOMaB7CkcKNe8OKU1HCqsOswpjCs8KHw6RFLGbDkMOiWB53USTDtHPCgcKKwr3Cs2fDhMKNPMOn'
  },
  {
    name: 'probe-279',
    hsn: '9ccee896d2c6f9a598d78000b96453df',
    data: '39a54d55570301b0b6476dee5a7ce7e3w6pQfDwFVsKmEsKMwqDCsAjCi8OXOsKow45OHMO5w4TDtMKuwonDuMOYMsOVeEHCjcOFTFNxw5PCvT4OJwTDj8Ktw7PDvcO6Hyt6NsKIL8Ohw5LDqQZ4EkQLw4/CncOow7xARMKLwp7Cj8O1wqzDnMOmPk0FwpUmJMKZRcOrw4FYNghrRsKULwrCrcKPbcOGRSbDvsO6woPCosOAw7ITLXvDmsK5OR5vS3HCjXTCg8KKw7rDtA=='
  }
];

for (const c of cases) {
  const full = JSON.stringify({ data: c.data });
  const cands = {
    'md5(data)': md5(c.data),
    'md5(fullbody)': md5(full),
    'md5(b64part)': md5(c.data.slice(32)),
    'md5(hexpart)': md5(c.data.slice(0, 32)),
    'md5(hex+b64)': md5(c.data)
  };
  console.log('\n##', c.name, 'hsn=', c.hsn);
  for (const [k, v] of Object.entries(cands)) console.log('  ', k, v, v === c.hsn ? '<== MATCH' : '');
}
