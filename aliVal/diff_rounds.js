// 两轮差分：nonce 是否固定 + enc 差异是否与 deflate 差异 4/3 局部对应
const fs = require('fs');
const zlib = require('zlib');

const r1 = { deflate: 'eJztk89KBDEMxl9Feh4k6TRpIngTvIgoiuBxXbs66KDsrv9Q391kpgU9CD6Ap/TrL5mvfO0UKoxXy3KNUiinlLhfRuKyoAIcgd/D+XqxvDsaNtuw9x7GZdgLHHOXk3aoot1OB6ELW9+3Oj5Z1cpjYmq8VP7o833lCLGDD6ZYJZJLbjSKS2k0gUttlHqTGRtln83NGbPP5tSookuqNMLUnCu1bpfSaFSTAo0mNxJslHxW+kbZjSQ1Km4k3KhOs7nSfvIVrbRHN1JotPc0NDaaaI5ufK7ZjT+zn9L5j/KvUX58e5ZsEsGKMJq2XNACvtvMQa+GuW62i/X2fBjt7WLWlJCg16hkxDtQge0eInTKfiGmpgWYOYKAx76bmdT/KxYQmrrDZzf/U2e/fv6irIfV20+UMFsU4fXkwU9J6ue7H67LrBHFNhbrG1uXt5en44Pbo8PLB7o83d8Pn1/+POOy',
  data: 'JRMnXwxcAgQ7Lw4LVQJHNk7yfp49FBh7YzQ0ED5IDfg4iEyb4KN0Gh57AKZR3hkzNUJqBiiDC2Ovng0Qgckc2HckLVBuKAdyHG3edyMRbkM3PCwaNSZtde40b5opQjDoWTJVGARwDeUOSpIfXpcEil26TWV6st9hAj22baASkbZReMdmP3Q7Z3ITRz1JRCYt4UobEDyuZSYdDSlMCGNqJ012Tg55djgCLXN6djIMcxp7aiAuVNz1D/NytyZ9arABbno4HWRDGVqbQgogX3hyA2gXC99oRSAqUiwrViZ1UCpNpHFFlcYBikpx7gNXSAOIFz4JTUgcaFs+BM13OmGpVicecxaxAQNQdBksFXInF0UnXWs+fF0jDQwHZCuzQydTbVguEFlHT9Qc6R210y4+oiPiIvYZLOz7gmooG7T0RmlNHbgAQB1Pe1tOpg4mGnhLYFpALCcRef01fJRd3zFJaZ1dRAFJwiVKzfVLFgl3ObMWLyFyOTNPNTDEpzSG/5F/JWV5CTUAUCEpMDo/Tv8CRTc5Jzc7TGcFLeMtbzkRqktgfA0zEWMpV+IOdBPlRgILrqsbd1JizE62V7eOFWEBz2ZkDWFXjFMSGAlDGEYyM1NnEDoh' };
const r2 = { deflate: 'eJzllF1LwzAUhv+K5DpIzmmSkwx2IYJ4IThxirfdl5RZlK3zg23/3ZM1QbvGe0UoTZ6ehzRpXw6RLic4N8aT5gtLMzML46hUqqRyorZivCqny6tq3YjBVtRTMRAWSbItwQPJE6l2xw+EFE0Qeaw3PPpYx8KbVJ/H+ktYsIh1VUBY7gsxoMGIWmfQJtlQBl2Sre8gqYA+yQ77SJBk3nUf05lAuS6GF/GXjIiQQZPkosggJVlTBl2Sje+jU0km6GI4kYMkO53BIsmeMqijzCfMoI0yYpFBSnJhMuiTrH0fvUqyxQxiksn0MMSsfo05q4+D28nZX4yd/5Wxw38fu923dmcZQVkrnQWJmv8lcBiX6zaUi6od1025asZVzT0RyGsNRmmDvF2xDgZ4ZTmzqKS3IbxMh0nIKXcfJYHcqSHQ6OLdHXSxl233vv1x/fv5qlp8HJXIkpXiffQctml82OBTNZu3DOD4Qbl65Pk1nm1G5xejh8vp3c3bcCj2n2HXaOI=' };
const r2data = 'JRMnRw9SGgVAeQITRRSxMx4eskD5fT9UQTslLk1YLgNYaWKb87N5TCBVEp9XMyca4XtkenW2Mxu9+M0KtMgf329B9ENwE2FpEWUgfXZfBmk+T1QgThsZS+sxaWdyWVHeo8G6RcBWOvQOS5QKiUkH9FuFnmp+wjRpBydEYpgjectJhSZtMnRSCRFRRwtAvxskNUQi2QezZkU/ZR15JgxWAzVXkxMWhQpaMXxiZWcBU8Vfd3w1ZMSHIA2euiNwjHImai8HdD56FnFfIS4YM1svBU10BPAqVxk6RwFbSjteZC42QkhhmCQbkk+G3xNwZxmyPwdqY2kEYVocb9IRf3Fydyw7dwledCJaaVtJb1t4bQsbXlZSQl0mCTlaVwNYKQZlDJxJD1E4aOT77iH0vhIAXNni+xsZK466/IsbBbu0G2CsanUfJT6ICQFIpVQ3ayp1Inha8B9MWchVXIliJcxmcpNKXAhvHjBVHeRhPhAmEYZwRhh+Ju8jASX0g9vULv96DnpGCdl8BFg4BwcychldUjY/WFAsfjQNAgkoWwAjoUYzeB4qXEUOvfApaTvLbAlVjFEoNo2ZCG57BthHUrkh5V9ydWQuVTolLTc6LVh2cFxZEDdEQ5IARAg/Th80V2kuNX4AIzx3W3BSsZ10LlUxcEMmWkMqKPItWmcpPBNRLeI=';

const d1 = Buffer.from(r1.deflate, 'base64');
const d2 = Buffer.from(r2.deflate, 'base64');
const j1 = zlib.inflateSync(d1).toString('utf8');
const j2 = zlib.inflateSync(d2).toString('utf8');
console.log('deflate1', d1.length, 'json1', j1.length, 'nonce1', j1.slice(0, 32));
console.log('deflate2', d2.length, 'json2', j2.length, 'nonce2', j2.slice(0, 32));
console.log('nonce 相同:', j1.slice(0, 32) === j2.slice(0, 32));

const e1 = Buffer.from(r1.data, 'base64').slice(3);
const e2 = Buffer.from(r2data, 'base64').slice(3);
console.log('enc1', e1.length, 'enc2', e2.length);

// 共同前缀比较（deflate 与 enc）
const n = Math.min(d1.length, d2.length);
let firstDiff = -1;
for (let i = 0; i < n; i++) if (d1[i] !== d2[i]) { firstDiff = i; break; }
console.log('deflate 首个差异字节位置:', firstDiff, '/', n);
const m = Math.min(e1.length, e2.length);
let eDiff = [];
for (let i = 0; i < m; i++) if (e1[i] !== e2[i]) { eDiff.push(i); if (eDiff.length > 20) break; }
console.log('enc 差异位置(前20):', eDiff);
console.log('enc 前 24 字节 e1:', e1.slice(0, 24).toString('hex'));
console.log('enc 前 24 字节 e2:', e2.slice(0, 24).toString('hex'));
// 4/3 映射：deflate 位置 p -> enc 位置约 p*4/3
if (firstDiff >= 0) console.log('按 4/3 映射，deflate 首差应对应 enc 位置约:', Math.floor(firstDiff * 4 / 3));
