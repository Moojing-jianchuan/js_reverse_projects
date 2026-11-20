/**
 * 探针 2：fun.constructor / Fun110 / Fun99 的 arity、源码片段、试调用结果。
 */
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const { makeSandbox, ROOT } = require('./sandbox_factory.js');

const code = fs.readFileSync(path.join(ROOT, 'artifacts/js/preinforce2.js'), 'utf8');
const trace = { reads: [], calls: [] };
const sb = makeSandbox({ trace, uaFamily: 'chrome' });
const ctx = vm.createContext(sb);
vm.runInContext(code, ctx, { filename: 'preinforce2.js', timeout: 30000 });
console.log('[OK] loaded; trace calls during load:', trace.calls.length);

const fun = sb.fun;
console.log('fun proto:', Object.getOwnPropertyNames(Object.getPrototypeOf(fun)));
for (const k of ['Fun110', 'Fun99']) {
  const f = fun[k];
  console.log('\n===== fun.%s =====', k);
  console.log('typeof', typeof f, '| name', f && f.name, '| arity', f && f.length);
  const s = String(f);
  console.log('src len', s.length);
  console.log('src head:', s.slice(0, 500));
}

function tryCall(label, fn) {
  const before = trace.calls.length;
  try {
    const r = fn();
    let desc;
    if (typeof r === 'string') desc = 'string len=' + r.length + ' ' + JSON.stringify(r.slice(0, 160));
    else if (r === undefined) desc = 'undefined';
    else if (r && typeof r === 'object') desc = 'object keys=' + JSON.stringify(Object.keys(r)).slice(0, 200);
    else desc = typeof r + ' ' + String(r).slice(0, 160);
    console.log('\n>> ' + label + ' -> ' + desc);
    const newCalls = trace.calls.slice(before);
    const idx = newCalls.findIndex(c => c.api === 'JSON.stringify');
    if (idx >= 0) console.log('   JSON.stringify captured, len', newCalls[idx].len, 'preview:', newCalls[idx].preview.slice(0, 400));
    console.log('   calls:', newCalls.length, newCalls.slice(0, 12).map(c => c.api).join(','));
    return r;
  } catch (e) {
    console.log('\n>> ' + label + ' -> THROW ' + (e && e.constructor && e.constructor.name) + ': ' + String(e && e.message).slice(0, 300));
    if (e && e.stack) console.log('   stack:', String(e.stack).split('\n').slice(0, 4).join(' | ').slice(0, 300));
    return undefined;
  }
}

tryCall('Fun110()', () => fun.Fun110());
tryCall('Fun99()', () => fun.Fun99());
tryCall('Fun110({})', () => fun.Fun110({}));
tryCall('Fun99({})', () => fun.Fun99({}));
tryCall('Fun110("")', () => fun.Fun110(''));
tryCall('Fun99("")', () => fun.Fun99(''));
tryCall('Fun110({a:1})', () => fun.Fun110({ a: 1 }));
tryCall('Fun99({a:1})', () => fun.Fun99({ a: 1 }));
