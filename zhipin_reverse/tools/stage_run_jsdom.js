// 用法: node tools/stage_run_jsdom.js <seed> <ts> <out.json> [sdk]
const fs = require('fs');
const path = require('path');
const { buildSandbox } = require(path.join(__dirname, '..', 'env_jsdom.js'));

const [seed, tsStr, outFile, sdkArg] = process.argv.slice(2);
const root = path.join(__dirname, '..');
const sdk = sdkArg || path.join(root, 'config', '_sdk_6d66a65a.inst.js');
const prelude = fs.readFileSync(path.join(__dirname, 'prelude_stage.js'), 'utf8');
const src = fs.readFileSync(sdk, 'utf8');
const probe = process.env.ZP_PROBE_READS === '1' ? 'window.__PROBE_READS=true;\n' : '';

const win = buildSandbox(probe + prelude + '\n' + src, {
  url: 'https://www.zhipin.com/web/passport/zp/security.html',
  preEval: process.env.ZP_PRE_EVAL || '',
});

const tz = new Date().getTimezoneOffset();
const token = String(new win.ABC().z(seed, parseInt(tsStr, 10) + (480 + tz) * 60000));
const out = {
  len: token.length,
  head: token.slice(0, 60),
  log: win.__stageLog || [],
  api: win.__apiLog || [],
  env: win.__envSnap || {},
  reads: win.__readLog || [],
  big: win.__bigArrays || {},
};
fs.writeFileSync(outFile, JSON.stringify(out));
console.log('jsdom stages:', out.log.length, 'api:', out.api.length, 'token len:', token.length);
