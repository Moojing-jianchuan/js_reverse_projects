// 用法: node gen_token2.js <sdkFile> <seed> <rawTs> [pageUrl] -> 输出 __zp_stoken__
// 环境变量：ZP_SCRIPT_TAG=1 用 <script> 标签注入；ZP_COOKIES='{"k":"v"}' 预置 document.cookie
const fs = require('fs');
const { buildSandbox } = require('./env_jsdom.js');

const [sdkFile, seed, rawTsStr, pageUrl] = process.argv.slice(2);
if (!sdkFile || !seed || !rawTsStr) {
  console.error('用法: node gen_token2.js <sdkFile> <seed> <rawTs> [pageUrl]');
  process.exit(1);
}
let cookies = {};
try {
  cookies = JSON.parse(process.env.ZP_COOKIES || '{}');
} catch (e) {
  cookies = {};
}
const win = buildSandbox(fs.readFileSync(sdkFile, 'utf8'), { url: pageUrl, cookies });
const tzOffset = new Date().getTimezoneOffset();
const finalTs = parseInt(rawTsStr, 10) + (480 + tzOffset) * 60000;
console.log(new win.ABC().z(seed, finalTs));
