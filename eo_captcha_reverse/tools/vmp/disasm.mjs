// disasm.mjs — 字节码反汇编（角色驱动，跨 build 可用）
//  输入: <bytecodeJson> <opcodesJson> <outJson>
//  输出: <outJson> 摘要 + <outJson 去 .json>.ins.json 指令表（含 role）
import fs from 'node:fs';

const [bcFile, opFile, outJson] = process.argv.slice(2);
const bc = JSON.parse(fs.readFileSync(bcFile, 'utf8'));
const opTable = JSON.parse(fs.readFileSync(opFile, 'utf8'));
const a = bc.ints;
const entry = bc.entry;
const N = a.length;

const roleByOp = new Map();
const ARITY = new Map();
const VAR = new Map();          // JMP_IF 的两种操作数长度
for (const r of opTable.opcodes) {
  roleByOp.set(r.op, r.role);
  ARITY.set(r.op, r.incs);
  if (r.role === 'JMP_IF') VAR.set(r.op, [r.incs - 2, r.incs - 1]);
}
const opsOfRole = (role) => new Set([...roleByOp.entries()].filter(([, v]) => v === role).map(([k]) => k));
const TERMINAL = new Set([...opsOfRole('RET'), ...opsOfRole('RET_POP'), ...opsOfRole('THROW')]);
const JMP_OPS = opsOfRole('JMP');
const CALLPUSH_OPS = opsOfRole('CALL_PUSH');
const isOp = v => Number.isInteger(v) && roleByOp.has(v);

// ---------------- 反汇编 ----------------
const ins = new Map();
const covered = new Set();
const jumps = [];
const queue = [entry];
let ambiguous = 0;

function sweep(startIp) {
  let ip = startIp;
  while (Number.isInteger(ip) && ip >= 0 && ip < N && !ins.has(ip) && isOp(a[ip])) {
    const op = a[ip];
    let arity, len;
    if (VAR.has(op)) {
      const cands = VAR.get(op).filter(k => ip + 1 + k < N && isOp(a[ip + 1 + k]));
      arity = cands.length ? cands[0] : VAR.get(op)[0];
      if (cands.length > 1) ambiguous++;
    } else arity = ARITY.get(op);
    len = 1 + arity;
    ins.set(ip, { op, role: roleByOp.get(op), ops: a.slice(ip + 1, ip + 1 + arity), len });
    for (let k = 0; k < len; k++) covered.add(ip + k);
    if (JMP_OPS.has(op)) { const t = ip + len + a[ip + 1]; jumps.push({ ip, kind: 'jmp', target: t }); ip = t; continue; }
    if (CALLPUSH_OPS.has(op)) {
      // push 返回地址：操作数里有一个相对偏移（取最后一个操作数）
      const off = a[ip + arity];
      jumps.push({ ip, kind: 'call', target: ip + len + off });
      ip = ip + len; continue;
    }
    if (TERMINAL.has(op)) break;
    ip = ip + len;
  }
}
while (queue.length) sweep(queue.pop());
for (let p = 0; p < N; p++) if (!covered.has(p)) sweep(p);

console.log('[disasm] entry', entry, 'instructions', ins.size, 'coverage', (100 * covered.size / N).toFixed(1) + '%',
  'ambiguous JMP_IF', ambiguous, 'jumps', jumps.length);
console.log('[disasm] opcodes seen', new Set([...ins.values()].map(v => v.op)).size, '/', opTable.opcodes.length);

// ---------------- 字符串重建（线性近似，帧间断点处重置） ----------------
const STR_INIT = opsOfRole('STR_INIT'), STR_APP = opsOfRole('STR_APP'), STR_APP2 = opsOfRole('STR_APP2');
const STR_INIT_APP = opsOfRole('STR_INIT_APP'), A_READ = opsOfRole('STR_APP_THEN_READ');
const A_WRITE = opsOfRole('STR_APP_THEN_WRITE'), A_OBJ = opsOfRole('STR_APP_THEN_OBJ');
const A_CALL = opsOfRole('STR_APP_THEN_REENTRY');
const PR_DYN = opsOfRole('PROP_READ_DYN'), PR_IMM = opsOfRole('PROP_READ_IMM'), PW_DYN = opsOfRole('PROP_WRITE_DYN');

const strings = new Map();   // reg → {s, since}
const found = new Map();     // string → first ip
const ips = [...ins.keys()].sort((x, y) => x - y);
let prevEnd = -1;
let reg = new Map();
const kill = (r) => { if (Number.isInteger(r)) reg.delete(r); };
const app = (r, c) => {
  const e = reg.get(r);
  if (e && typeof e.s === 'string') e.s += String.fromCharCode(c);
  else reg.delete(r);
};

for (const ip of ips) {
  if (prevEnd !== -1 && ip !== prevEnd) reg = new Map();     // 段间断点 = 新帧
  const cur = ins.get(ip);
  const { op, role, ops } = cur;
  if (STR_INIT.has(op)) reg.set(ops[0], { s: '' });
  else if (STR_APP.has(op)) app(ops[0], ops[1]);
  else if (STR_APP2.has(op)) { app(ops[0], ops[1]); app(ops[2], ops[3]); }
  else if (STR_INIT_APP.has(op)) { reg.set(ops[0], { s: '' }); app(ops[1], ops[2]); }
  else if (A_READ.has(op)) { app(ops[0], ops[1]); kill(ops[2]); }
  else if (A_WRITE.has(op)) { app(ops[0], ops[1]); }
  else if (A_OBJ.has(op)) { app(ops[0], ops[1]); reg.delete(ops[2]); reg.set(ops[3], { s: '' }); }
  else if (A_CALL.has(op)) { app(ops[0], ops[1]); }
  else if (PR_DYN.has(op) || PR_IMM.has(op)) reg.delete(ops[0]);
  else for (const r of ops) kill(r);

  for (const [, e] of reg) {
    if (typeof e.s === 'string' && e.s.length >= 3 && /^[\x20-\x7e]+$/.test(e.s) && !found.has(e.s)) found.set(e.s, ip);
  }
  prevEnd = ip + cur.len;
}
console.log('[disasm] strings reconstructed', found.size);

fs.writeFileSync(outJson.replace(/\.json$/, '.ins.json'), JSON.stringify(
  [...ins.entries()].sort((x, y) => x[0] - y[0]).map(([i, v]) => ({ ip: i, op: v.op, role: v.role, ops: v.ops, len: v.len }))));
fs.writeFileSync(outJson, JSON.stringify({
  entry, totalInts: N, instructions: ins.size,
  coveragePct: +(100 * covered.size / N).toFixed(2), ambiguousJmpIf: ambiguous, jumps: jumps.length,
  opcodeCount: opTable.opcodes.length,
  strings: Object.fromEntries([...found.entries()]),
}, null, 1));
console.log('[out]', outJson, '+', outJson.replace(/\.json$/, '.ins.json'));
