/**
 * 在原始 unpacked 源码里按标识符编号定位关键代码，输出偏移 + 片段（写报告用）
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const s = fs.readFileSync(path.join(ROOT, 'artifacts/unpacked/pceptor.000.eval.js'), 'utf8');

const needles = [
  ["XMLHttpRequest=function", 'XHR 包装器构造函数'],
  ["window[\uF8DE", null],
  ['\uF8DE188220617,headers', null],
  ['55132', 'closure getSk'],
  ['63908', 'dw class'],
  ['227781', 'hsn 赋值'],
  ['89690', 'webSk URL'],
  ['120167', '响应解密函数'],
  ['161970', '会话上报 161970'],
  ['38126', 'CryptoJS 模块'],
  ['105711', 'sign 函数'],
  ['192447', 'webSk 请求体构造'],
  ['259290', 'URL 白名单判定'],
  ['63166', 'POST 判定'],
  ['96564', 'body 变量'],
];
for (const [needle, label] of needles) {
  if (!needle) continue;
  let i = -1; const hits = [];
  while ((i = s.indexOf(needle, i + 1)) !== -1) hits.push(i);
  console.log(`\n### ${label || needle}  needle=${JSON.stringify(needle)}  hits=${hits.length}  offsets=${hits.slice(0, 6).join(',')}`);
  for (const h of hits.slice(0, 2)) {
    console.log('   @' + h + ': ' + JSON.stringify(s.slice(Math.max(0, h - 80), h + 120)));
  }
}
