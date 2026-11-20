// 临时：keystream 与 sk / dwsm 的关系矩阵
const fs = require('fs');
const path = require('path');
const { createEnv } = require('../src/env_patch');
const { createCapProbe } = require('../src/dewu_cap_probe');
const ROOT = path.resolve(__dirname, '..');

const CASES = [
  ['sk0 空', {}],
  ['sk-A 64hex', { sk: 'a'.repeat(64) }],
  ['sk-B 64hex', { sk: 'b'.repeat(64) }],
  ['sk-C 92hex(真机长度)', { sk: 'c'.repeat(92) }],
  ['dwsm-only', { dwsm: 'D'.repeat(42) }],
  ['sk+DW', { sk: 'a'.repeat(64), dwsm: 'D'.repeat(42) }],
];

(async () => {
  const rows = [];
  for (const [tag, seed] of CASES) {
    const env = createEnv({ blockNetwork: true, seedStorage: seed });
    const probe = createCapProbe(env);
    probe.installPreLoad();
    env.evalSource(fs.readFileSync(path.join(ROOT, 'artifacts/js/pyuntu.js'), 'utf8'), 'pyuntu.js');
    probe.installPostLoad();
    await probe.call({});
    const a = probe.analyze();
    const row = {
      tag, seed: Object.keys(seed).join('+') || 'none',
      cipherLen: a.cipherLen, dLen: a.dLen,
      ksHex: a.keystream ? a.keystream.toString('hex') : null,
      ksHead: a.keystreamHeadHex,
      plaintextHasSk: a.plaintext ? JSON.parse(JSON.parse(a.plaintext).data).sk : null,
    };
    rows.push(row);
    console.log(tag.padEnd(24), 'cipher', String(a.cipherLen).padStart(5), 'ks', a.keystreamHeadHex.slice(0, 16),
      '| data.sk len', row.plaintextHasSk ? row.plaintextHasSk.length : '?');
    env.dispose();
  }

  // ks 两两比较（取公共前缀比）
  console.log('\n=== keystream 两两相同字节比例（公共前缀） ===');
  for (let i = 0; i < rows.length; i++) {
    for (let j = i + 1; j < rows.length; j++) {
      if (!rows[i].ksHex || !rows[j].ksHex) continue;
      const a = Buffer.from(rows[i].ksHex, 'hex'); const b = Buffer.from(rows[j].ksHex, 'hex');
      const n = Math.min(a.length, b.length);
      let eq = 0; for (let k = 0; k < n; k++) if (a[k] === b[k]) eq++;
      console.log('  ' + rows[i].tag.padEnd(22) + ' vs ' + rows[j].tag.padEnd(22) + (eq / n * 100).toFixed(1) + '% (' + eq + '/' + n + ')');
    }
  }
  fs.writeFileSync(path.join(ROOT, 'artifacts/cap_d_ks_matrix.json'), JSON.stringify(rows, null, 1), 'utf8');
  console.log('\n已存 artifacts/cap_d_ks_matrix.json');
})();
