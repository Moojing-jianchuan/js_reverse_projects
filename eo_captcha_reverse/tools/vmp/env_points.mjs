// env_points.mjs — 角色驱动的帧感知抽象解释：产出环境访问点（属性名 + 路径 + 字节码偏移）
//  输入: <insJson> <outJson>
//  用法: node tools/vmp/env_points.mjs src/_vmp/cur.disasm.ins.json src/_vmp/cur.envpoints.json
import fs from 'node:fs';

const [insFile, outJson] = process.argv.slice(2);
const list = JSON.parse(fs.readFileSync(insFile, 'utf8'));
const byIp = new Map(list.map(i => [i.ip, i]));
const ips = list.map(i => i.ip);

const TERMINAL = new Set(['RET', 'RET_POP', 'THROW']);
const S = v => ({ t: 'str', v });
const R = p => ({ t: 'ref', p });
const show = v => (!v ? '?' : v.t === 'str' ? JSON.stringify(v.v) : v.p);

let reg = new Map();
let prevEnd = -1;
const hits = [];

function reset() {
  reg = new Map();
  reg.set(0, R('window'));        // 每个 VM 帧的 A[0] = window（引导实参第 3 个）
  reg.set(1, R('<consts>'));      // A[1] = 常量池 [void 0, null, 0x9e3779b9, 0x13c6ef3720, 0.75, …]
  reg.set(6, R('<bytecode>'));    // A[6] = 自身字节码数组
}
reset();

for (const ip of ips) {
  if (prevEnd !== -1 && ip !== prevEnd) reset();
  const cur = byIp.get(ip);
  const { op, role, ops } = cur;
  const get = r => reg.get(r);
  const set = (r, v) => { if (Number.isInteger(r) && r >= 0 && r < 0x800) reg.set(r, v); };
  const app = (r, c) => {
    const e = get(r);
    if (e && e.t === 'str') set(r, S(e.v + String.fromCharCode(c)));
    else set(r, undefined);
  };
  const readHit = (baseR, keyR, destR) => {
    const base = get(baseR), key = get(keyR);
    if (!key || key.t !== 'str') { set(destR, undefined); return; }
    const path = base && base.t === 'ref' ? base.p + '.' + key.v : '?.' + key.v;
    hits.push({ ip, op, key: key.v, path, base: show(base) });
    set(destR, base && base.t === 'ref' ? R(path) : undefined);
  };

  switch (role) {
    case 'STR_INIT': set(ops[0], S('')); break;
    case 'STR_APP': app(ops[0], ops[1]); break;
    case 'STR_APP2': app(ops[0], ops[1]); app(ops[2], ops[3]); break;
    case 'STR_INIT_APP': set(ops[0], S('')); app(ops[1], ops[2]); break;
    case 'STR_APP_THEN_OBJ': app(ops[0], ops[1]); set(ops[2], undefined); set(ops[3], S('')); break;
    case 'STR_APP_THEN_READ': app(ops[0], ops[1]); readHit(ops[3], ops[4], ops[2]); break;
    case 'STR_APP_THEN_WRITE': {
      app(ops[0], ops[1]);
      const base = get(ops[2]), key = get(ops[3]);
      if (key && key.t === 'str') hits.push({ ip, op, key: key.v, path: (base && base.t === 'ref' ? base.p + '.' + key.v : '?.' + key.v) + '=', base: show(base), write: true });
      break;
    }
    case 'STR_APP_THEN_REENTRY': app(ops[0], ops[1]); break;
    case 'PROP_READ_DYN': readHit(ops[1], ops[2], ops[0]); break;
    case 'PROP_READ_IMM': {
      const base = get(ops[1]);
      const path = base && base.t === 'ref' ? base.p + '[' + ops[2] + ']' : null;
      if (path) hits.push({ ip, op, key: '[' + ops[2] + ']', path, base: show(base), indexed: true });
      set(ops[0], path ? R(path) : undefined);
      break;
    }
    case 'PROP_WRITE_DYN': {
      const base = get(ops[0]), key = get(ops[1]);
      if (key && key.t === 'str') hits.push({ ip, op, key: key.v, path: (base && base.t === 'ref' ? base.p + '.' + key.v : '?.' + key.v) + '=', base: show(base), write: true });
      break;
    }
    default:
      for (const r of ops) if (Number.isInteger(r) && r < 0x800) set(r, undefined);
  }
  if (TERMINAL.has(role)) { prevEnd = ip + cur.len; reset(); continue; }
  prevEnd = ip + cur.len;
}

console.log('[env] property accesses with recovered key =', hits.length);
const byRoot = new Map();
let unresolved = 0;
for (const h of hits) {
  if (!h.path || !h.path.startsWith('window.')) { unresolved++; continue; }
  const seg = h.path.slice(7).split(/[.[]/)[0];
  if (!byRoot.has(seg)) byRoot.set(seg, []);
  byRoot.get(seg).push(h);
}
console.log('[env] resolved to window.<x> =', hits.length - unresolved, '| base unresolved =', unresolved);
const ENV_ROOTS = ['navigator', 'screen', 'document', 'performance', 'localStorage', 'sessionStorage',
  'AudioContext', 'webkitAudioContext', 'OfflineAudioContext', 'crypto', 'location', 'history', 'RTCPeerConnection'];
for (const k of [...byRoot.keys()].sort()) console.log('  window.' + k, '→', byRoot.get(k).length, 'sites', ENV_ROOTS.includes(k) ? '' : '(非标准根)');

const byKey = new Map();
for (const h of hits) {
  if (!byKey.has(h.key)) byKey.set(h.key, { count: 0, ips: [], paths: new Set() });
  const e = byKey.get(h.key);
  e.count++; if (e.ips.length < 12) e.ips.push(h.ip);
  if (h.path) e.paths.add(h.path);
}
const out = {
  totalHits: hits.length, unresolved,
  roots: Object.fromEntries([...byRoot.entries()].map(([k, v]) => [k, v.length])),
  byRoot: Object.fromEntries([...byRoot.entries()].map(([k, v]) => [k, v.map(h => ({ ip: h.ip, key: h.key, path: h.path, write: !!h.write }))])),
  byKey: Object.fromEntries([...byKey.entries()].sort().map(([k, e]) => [k, { count: e.count, ips: e.ips, paths: [...e.paths].slice(0, 4) }])),
  hits,
};
fs.writeFileSync(outJson, JSON.stringify(out, null, 1));
console.log('[env] distinct property keys =', byKey.size);
console.log('[out]', outJson);
