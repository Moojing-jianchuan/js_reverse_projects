// 解码 headers 中的 adi/ltk/sk，与已知 keystream 对比
const samples = {
  req70: {
    adi: 'MzJjNDU2MGEyOWQwNjU2ZGBsOWEW54FsKBwoXDk03CosO1cgLCtS3CukXCilXDvHbDhHTDhMKfKMKz',
    ltk: 'AMOMwprDtMOmJsKiw6zDscKuIMOVwrPCoMOGfMOmwpbCkMKnNjjCl37DmMOmL8K8LA3Cv3TDminDg8ODw54fcsKeQWzDnMKGw5TDvsO6w7zDn8K5',
    sk: ''
  },
  req125: {
    adi: 'f7g-Hfi3gp2C6Q8zlIuj7gw5x6wr95XALDnANDYMKYwrQ7w5DDksKGwobCgMKVFcOYw6XDhS9lSnzDnAjDrHB3SMKRbMKmwpgew4DDpWXDrA==',
    ltk: 'AMOMwprDtMOmJsKiw6zDscKuIMOVwrPCoMOGfMOmwpbCkMKnNjjCl37DnsOkL8K8LA3Cv3TDminDg8ODw54fcsKeQWzDnMKGw5TDvsO6w7zDn8K5',
    sk: 'YOUR_SK_HERE'
  },
  req283: {
    adi: 'f7g-Hfi3gp2C6Q8zlIuj7gw5x6wr95XALDnANDYMKYwrQ7w5DDksKGwobCgMKVE8OYw6TDhShlSnzDnAjDrHB3SMKRbMKmwpgew4DCtWHCo8K7wppENMOTw4TCgw==',
    ltk: 'AMOMwprDtMOmJsKiw6zDscKuIMOVwrPCoMOGfMOmwpbCkMKnNjjCl3rDksOiL8K8LA3Cv3TDminDg8ODw54fcsKeQWzDnMKGw5TDvsO6w7zDn8K5',
    sk: 'YOUR_SK_HERE'
  }
};

function decodeMojibakeB64(b64) {
  const buf = Buffer.from(b64.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
  let t;
  try { t = new TextDecoder('utf-8', { fatal: true }).decode(buf); } catch (e) { return { raw: buf, utf8fail: true }; }
  const o = Buffer.alloc(t.length);
  for (let i = 0; i < t.length; i++) o[i] = t.charCodeAt(i) & 0xff;
  return { raw: buf, latin1: o };
}

const ks = Buffer.from('91720f5562388428ae908038bbe70a98fe7e2cc9f4c49eb9c8e802e54871bdf57c6341e38d0e3e1734ed81d18d937c402843e44aa8b6cb3c493e667baefa8db23529a9a4bed98eac87592856fc5c41bb7fd9f574146e022ae04a78f8e10faf2104c48ef1d7a5de315e13b5ce7a6d1f3e53b700f1ff9f89', 'hex');

for (const [n, s] of Object.entries(samples)) {
  console.log('\n===', n);
  for (const k of ['adi', 'ltk', 'sk']) {
    if (!s[k]) { console.log(' ', k, '(empty)'); continue; }
    const d = decodeMojibakeB64(s[k]);
    const body = d.latin1 || d.raw;
    console.log(' ', k, 'b64len', s[k].length, 'bytes', d.raw.length, 'latin1len', d.latin1 ? d.latin1.length : '-');
    console.log('    latin1:', JSON.stringify(body.toString('latin1').slice(0, 60)));
    console.log('    hex   :', body.toString('hex').slice(0, 80));
    // 在 sk 里找 keystream 前 8 字节
    const idx = body.indexOf(ks.slice(0, 8));
    if (idx >= 0) console.log('    >>> 含 keystream 前8字节 @', idx);
  }
}
console.log('\nkeystream(前64):', ks.slice(0, 64).toString('hex'));
console.log('keystream latin1:', JSON.stringify(ks.toString('latin1')));
