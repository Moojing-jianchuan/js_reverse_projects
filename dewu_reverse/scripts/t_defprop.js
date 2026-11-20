const vm = require('vm');
const sb = { console };
sb.window = sb; sb.globalThis = sb;
const ctx = vm.createContext(sb);
const t = (src) => { try { return vm.runInContext(src, ctx); } catch (e) { return 'THROW ' + e.message; } };
console.log('global undefined:', t('(function(){ try{ Object.defineProperty(globalThis, undefined, {get(){return 1}}); return "ok" }catch(e){ return "ERR: "+e.message } })()'));
console.log('plain:', t('(function(){ try{ var o={}; Object.defineProperty(o, undefined, {get(){return 1}}); return "ok" }catch(e){ return "ERR: "+e.message } })()'));
console.log('desc:', t('JSON.stringify(Object.getOwnPropertyDescriptor(globalThis, "undefined"))'));
console.log('keys of global with undefined:', t('Object.getOwnPropertyNames(globalThis).filter(function(k){return k==="undefined"})'));
