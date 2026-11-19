// 假设：data = magic(3) + 混淆( base64(deflate(json)) )
// 用已知 deflate 与 data 逐字节对照，求 keystream/映射
const fs = require('fs');
const zlib = require('zlib');

const samples = [
  { deflateB64: 'eJzdlU1PHDEMhv9KNec52E78hcSNIwfa0ko9IpZFK7pqtdAvAf+9ieOAqNRbq0o9zT528ia2353ZIthGxEzrdkPOsBXZMhStcInIm/vl/HBxeXO6u71bju6X/eVytAjpqtVXIiqyvlphWZe7nmjP/Zf2RKy5wj0WPDxHyOBpz1Xu+dxFi6/KsFKx2jYI41hfXDtKGVgROio3tIaEHS3FaykNFSCxdilFSuQupVQTRTq2EgZqZJvqQPOOAuMghn6QKo1LMsZBllJM1NFTigs3NLDcWwMJci9bx5IVsQRWTrReoHFWxB4oPlDiGmbZHMFQ9jIO6oOBB4dsjpRA1MTaK3KaUtKVvWJmNZCzIolruEhm4xquNrHf2T37rNARAbLRioMxxZQ8mFJNKwWXlFPmYM5mq4z9QsmGwTr1fKyfYzcY7FmaoYTnMNtk0RdEypZbheCSPTfGFx416XpS6ziemo3Dgzl8KtF20TyOStQnnuVRSd/VmefggjMvdVpt6A3rydN+C7YcK9UxdYDJ2PtnmFZt/4KwQS8n9Grx8BDNPHe3msLMR30229esH+OEOvOO4ZRZL0M/z8usl6N+53lfptivcz/HfN1xro/6mz/mhVn42RAR0LGilhmwERCYgZy5Tg2BYSrnGaAypp6uaf4fNihTQ6o+zzlWtJHGm2j/NV9F+1/eb//aCPafGYH/ghHik/AHjPDyKxUrCvpqgj3QRLE55OZ2OGW7G8/bu4vD3flu375lqF7bRMRcCzyu48v59jf5dXl/ddhtf7xItU8Vt+Yu388+9WNQuzlvP+42VyNAYC1wcbhuv8+uX7+zkw9np282u5Nvx8fL40/1fLnm' },
  { dataB64: 'JRMnTw8hGgExLw4LRRRHM2f9T1RBBQUzRA8ACk22Mu5xcnlYE7FtagNXfKhfKBEWx69sdCOBMWudhOn3gMhxEYVH9RwAAlYXdCcldXNSA3wUQDsGPQdFTNF5HHkLa0b5VSmWFcYfFulVTmMAdWsiyxl7R4pqwRB1JVK5TL8EmLdPeCB/NiFvUBNcHGhxVFZCPFAV/ma9eDwZEG8WySxXDFIOnwIsnyAV3Vh0SXsCVBdhbmRLSC2iCzWUjztuSYQLVA57EGR3MFhxSXbkUloOL2IZItB7Gxo3tgFWeRkQuTxfrlBNuzgYqWBl6V5NVAuXJykujXI7DUcoKjAPLVZhUEwlayhcNhtalmIsd78lMCEKYllIYVASIztTXhuoLjVrV1wp8VAhRvUd8wCAyRlSTu4xNdoUCr+gk3VJ4GKddm2lFF4IAwV2a3xJulEiKEAYZmQ4JvgGYfNRumlG3cJzVbJmaT5Jwz1z2hFqFkVgE5cVCCYJd8xKYD3ystuM0aR+IXgmPddgZRgRJBcYY/wjND00XS5caXltCQ0kSxoEn2dgfcQYQU3dpt1CQAY4ei9siboJS1RBy316Ora3Wr0bz39JGG5JaSgDDSVHe55bdDtdexw1YKlCNysAJhs+aQcqMmJ2BRd8e4kVtKxcRWl4SokkF1w2cRfhZIPxUDxjA68gaBVkEYtBciYbRlE8WBbqMUtSOnfEPB4IUHGMLycIQz4es2sYSjk1fBp0B0x69SEMEgUNIXcSWOAQ9qLVUuTh4FMWVVlITzpueTw5dTpmn2o8NS3mmyDJPyRVMSAxHsfyuUNIKX0G4fnZZn4EcGoqEGh8ZZoEpV1hYUKqZYRXMChGvToHV1xpLgZoRyF/UclVnooeLWkyRFMcHlqjRd5VbRo4Gp5SX18KWxg9OGFvaiVcHicnAAOuH0N1NJHi+Jw11todbSJkVCRoSd1RTVgyayhTcnNJACMbTkFOFFY/M0lncx96ZSxSV5jTyCked9eVVy7MDnp5eD4nopk3awbRIG1DTEsKFHkMaFYkB2ftAuN+Ge+3MU27fR4pBzyqQXE3zBndNnx2JTtjWARUsW9NzYWu5Us2D/uvfF8eaFkryhAYS1sfRBpMcxZabRADC30iLBIi' },
];

const comp = Buffer.from(samples[0].deflateB64, 'base64');
const data = Buffer.from(samples[1].dataB64, 'base64');
const json = zlib.inflateSync(comp);
console.log('deflate', comp.length, 'json', json.length, 'data', data.length);
const S = comp.toString('base64'); // 标准 base64 长度 852
console.log('std base64 len', S.length, 'data-3', data.length - 3);

const T = data.slice(3);
function compare(label, A, B) {
  const n = Math.min(A.length, B.length);
  const x = Buffer.alloc(n);
  for (let i = 0; i < n; i++) x[i] = A[i] ^ B[i];
  const h = new Array(256).fill(0); for (const b of x) h[b]++;
  let ent = 0; for (const c of h) if (c) { const p = c / x.length; ent -= p * Math.log2(p); }
  console.log(`${label}: n=${n} xorEntropy=${ent.toFixed(2)} head=${x.slice(0, 16).toString('hex')} distinct=${new Set(x).size}`);
  // 差分（减法）
  const y = Buffer.alloc(n); for (let i = 0; i < n; i++) y[i] = (B[i] - A[i] + 256) & 0xff;
  const h2 = new Array(256).fill(0); for (const b of y) h2[b]++;
  let ent2 = 0; for (const c of h2) if (c) { const p = c / y.length; ent2 -= p * Math.log2(p); }
  console.log(`   subEntropy=${ent2.toFixed(2)} distinct=${new Set(y).size} head=${y.slice(0, 16).toString('hex')}`);
  return x;
}
const sBuf = Buffer.from(S, 'latin1');
console.log('--- T vs S[0:]'); compare('T^S', T, sBuf.slice(0, T.length));
console.log('--- T vs S[3:]'); compare('T^S3', T, sBuf.slice(3, 3 + T.length));
if (comp.length === T.length) compare('T^comp', T, comp);
