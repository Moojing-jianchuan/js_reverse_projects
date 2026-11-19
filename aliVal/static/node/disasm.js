// disasm.js — disassembler for the pe.* stack-machine VM.
// usage: node disasm.js <bundle> <program:F|H> [from] [to]
const fs = require('fs');
const acorn = require('acorn');

const [file, prog, fromArg, toArg] = process.argv.slice(2);
const src = fs.readFileSync(file, 'utf8');
const ast = acorn.parse(src, { ecmaVersion: 2022, sourceType: 'script', allowReturnOutsideFunction: true });
const arrs = {};
(function w(n) {
  if (!n || typeof n.type !== 'string') return;
  if (n.type === 'VariableDeclarator' && n.id.type === 'Identifier' && n.init && n.init.type === 'ArrayExpression')
    arrs[n.id.name] = { node: n.init, els: n.init.elements };
  for (const k of Object.keys(n)) {
    if (['type', 'start', 'end', 'loc'].includes(k)) continue;
    const v = n[k];
    if (Array.isArray(v)) { for (const x of v) if (x && typeof x.type === 'string') w(x); }
    else if (v && typeof v === 'object' && typeof v.type === 'string') w(v);
  }
})(ast);

function valOf(el) {
  if (!el) return undefined;
  if (el.type === 'Literal') return el.value;
  if (el.type === 'UnaryExpression' && el.operator === '-' && el.argument.type === 'Literal') return -el.argument.value;
  if (el.type === 'UnaryExpression' && el.operator === '!' && el.argument.type === 'Literal') return !el.argument.value;
  return undefined;
}
const code = arrs[prog].els.map(valOf);
const poolName = prog.toUpperCase() === 'F' ? 'q' : 'X';
const pool = arrs[poolName].els.map(valOf);

// opcode table: [name, operands(...kinds), pushFlag]
// kind: 'v' = raw value, 'p' = pool index, 'j' = jump target, 'f' = push flag
const T = {
  0: ['DECLARE_LOCAL', 'p', null],
  1: ['USHR', null, 'f'],
  2: ['LT', null, 'f'],
  3: ['NEW_OBJECT', null, null],
  4: ['DIV', null, 'f'],
  5: ['LOAD_LOCAL', 'p', 'f'],
  6: ['PUSH_CONST', 'p', null],
  7: ['THROW', null, null],
  8: ['SUB', null, 'f'],
  9: ['MUL', null, 'f'],
  10: ['DELETE', null, 'f'],
  11: ['GE', null, 'f'],
  12: ['CONCAT', 'v', 'f'],
  13: ['DUP', null, null],
  14: ['POP_N', 'v', 'f'],
  15: ['DEC', 'v', 'f'],
  16: ['POP', null, null],
  17: ['TRY', 'j', 'j', 'j', 'j'],
  18: ['NEQ_STRICT', null, 'f'],
  19: ['CALL_OR_JUMP', 'j'],
  20: ['SHL', null, 'f'],
  21: ['RETURN', 'v'],
  22: ['NEQ', null, 'f'],
  23: ['IN', null, 'f'],
  24: ['NOT', null, 'f'],
  25: ['JMP_IF_FALSE', 'j'],
  26: ['MOD', null, 'f'],
  27: ['MAKE_FUNC', 'j', 'v'],
  28: ['LOAD_MEMBER', null, 'f'],
  29: ['SHR', null, 'f'],
  30: ['INC', 'v', 'f'],
  31: ['CALL_IF_DEFINED', 'j'],
  32: ['INSTANCEOF', null, 'f'],
  33: ['NEW_APPLY', 'v', 'f'],
  34: ['ADD', null, 'f'],
  35: ['JMP', 'j'],
  36: ['EQ', null, 'f'],
  37: ['SEQ', null, 'f'],
  38: ['XOR', null, 'f'],
  39: ['STORE_MEMBER', 'f'],
  40: ['STORE_SPREAD', 'v'],
  41: ['BREAK', null],
  42: ['OR', null, 'f'],
  43: ['TYPEOF', null, 'f'],
  44: ['BITNOT', null, 'f'],
  45: ['PUSH_WINDOW', null],
  46: ['XOR', null, 'f'],
  47: ['AND', null, 'f'],
  48: ['PUSH_UNDEFINED', 'f'],
  49: ['LE', null, 'f'],
  50: ['STORE_MEMBER2', 'f'],
  51: ['NEW_ARRAY', 'v', 'f'],
  52: ['GT', null, 'f'],
  53: ['SWITCH', 'v'],
  54: ['JMP_IF_TRUE', 'j'],
  55: ['METHOD_CALL', 'v', 'f'],
  56: ['PUSH_SCOPE', null],
};

const from = fromArg ? parseInt(fromArg, 10) : 0;
const to = toArg ? parseInt(toArg, 10) : Math.min(code.length, from + 400);

let pc = 0;
const out = [];
let desync = 0;
while (pc < code.length) {
  const start = pc;
  const op = code[pc++];
  const spec = T[op];
  if (!spec) { out.push({ pc: start, text: `  ?? unknown opcode ${op}` }); desync++; if (desync > 5) break; continue; }
  const [name, ...rest] = spec;
  const ops = [];
  for (const kind of rest) {
    if (kind === null) continue;
    const v = code[pc++];
    if (kind === 'p') ops.push(`#${v}(${JSON.stringify(pool[v])})`);
    else if (kind === 'j') ops.push(`@${v}`);
    else if (kind === 'f') ops.push(v ? 'push' : '-');
    else ops.push(String(v));
  }
  out.push({ pc: start, text: `  ${String(start).padStart(5)}  ${name} ${ops.join(' ')}`.trimEnd() });
}
for (const o of out) {
  if (o.pc >= from && o.pc < to) console.log(o.text);
}
console.log(`\n# program ${prog}: ${code.length} words, ${out.length} decoded instructions, desync=${desync}`);
if (desync === 0) console.log('# decode is clean (pc walked the whole array) => opcode table is correct');
else console.log('# !! desync => opcode operand layout wrong somewhere');
