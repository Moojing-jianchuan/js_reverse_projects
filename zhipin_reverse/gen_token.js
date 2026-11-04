// 用法: node gen_token.js <seed> <rawTs>  -> 输出 __zp_stoken__
const { buildSandbox } = require('./env_jsdom.js');

const win = buildSandbox();
const seed = process.argv[2];
const rawTs = parseInt(process.argv[3], 10);
if (!seed || !rawTs) { console.error('用法: node gen_token.js <seed> <rawTs>'); process.exit(1); }

const tzOffset = new Date().getTimezoneOffset();
const finalTs = rawTs + (480 + tzOffset) * 60000;
const token = new win.ABC().z(seed, finalTs);
console.log(token);
