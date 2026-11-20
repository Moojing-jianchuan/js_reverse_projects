/**
 * 探查 pyuntu.js 暴露的 dewuCap / yd_md5 —— 判断 captcha 的 d / sign 是否出自这里
 * 用法: node scripts/probe_yuntu_api.js
 */
const fs = require('fs');
const path = require('path');
const { createEnv } = require('../src/env_patch');

const ROOT = path.resolve(__dirname, '..');
const env = createEnv({ blockNetwork: true, traceReads: false });

const code = fs.readFileSync(path.join(ROOT, 'artifacts/js/pyuntu.js'), 'utf8');
env.evalSource(code, 'pyuntu.js');
const w = env.window;

function describe(name) {
  const v = w[name];
  if (v === undefined) return { name, type: 'undefined' };
  const t = typeof v;
  const out = { name, type: t };
  if (t === 'function') {
    out.length = v.length;
    out.name = v.name;
    out.src = String(v).replace(/\s+/g, ' ').slice(0, 220);
    out.ownProps = Object.getOwnPropertyNames(v).filter(k => !['length', 'name', 'prototype', 'caller', 'arguments'].includes(k));
  } else if (t === 'object' && v) {
    out.ownProps = Object.getOwnPropertyNames(v).slice(0, 40);
    out.keys = Object.keys(v).slice(0, 40);
    out.ctor = v.constructor && v.constructor.name;
    out.src = String(v.constructor || '').replace(/\s+/g, ' ').slice(0, 160);
  } else {
    out.value = String(v).slice(0, 120);
  }
  return out;
}

const names = ['dewuCap', 'yd_md5', 'jsdVipUserMark', 'base64js'];
for (const n of names) console.log(JSON.stringify(describe(n), null, 1));

// yd_md5 是否是 md5？用已知向量对拍（得物自己的盐）
if (typeof w.yd_md5 === 'function') {
  const crypto = require('crypto');
  const cases = ['abc', '', 'filterUnbidtruepageNum1pageSize24pickRuleId644443showCsputrue048a9c4943398714b356a696503d2d36'];
  for (const c of cases) {
    let got;
    try { got = w.yd_md5(c); } catch (e) { got = 'THROW: ' + e.message; }
    const expect = crypto.createHash('md5').update(c, 'utf8').digest('hex');
    console.log(`yd_md5(${JSON.stringify(c.slice(0, 30))}) = ${got}  ${got === expect ? '== md5 ✅' : '!= md5 (expect ' + expect + ')'}`);
  }
}

// dewuCap 上有什么方法可调
if (w.dewuCap && typeof w.dewuCap === 'object') {
  const cap = w.dewuCap;
  const proto = Object.getPrototypeOf(cap);
  console.log('\ndewuCap proto props:', proto ? Object.getOwnPropertyNames(proto) : null);
  for (const k of Object.getOwnPropertyNames(cap)) {
    const v = cap[k];
    console.log(' dewuCap.' + k, '=', typeof v, typeof v === 'function' ? `(len ${v.length}) ` + String(v).replace(/\s+/g, ' ').slice(0, 150) : JSON.stringify(String(v)).slice(0, 120));
  }
}

env.dispose();
