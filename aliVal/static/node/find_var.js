// find_var.js — locate the enclosing function of an offset, print its params and every
// assignment/use of a given identifier inside it.
// usage: node find_var.js <bundle> <offset> <ident>
const fs = require('fs');
const acorn = require('acorn');
const [file, offArg, ident] = process.argv.slice(2);
const off = parseInt(offArg, 10);
const src = fs.readFileSync(file, 'utf8');
const ast = acorn.parse(src, { ecmaVersion: 2022, sourceType: 'script', allowReturnOutsideFunction: true });

let target = null;
(function walk(n, stack) {
  if (!n || typeof n.type !== 'string') return;
  if (n.start <= off && off < n.end) {
    if (n.type === 'FunctionDeclaration' || n.type === 'FunctionExpression' || n.type === 'ArrowFunctionExpression') target = n;
    for (const k of Object.keys(n)) {
      if (['type', 'start', 'end', 'loc'].includes(k)) continue;
      const v = n[k];
      if (Array.isArray(v)) { for (const x of v) if (x && typeof x.type === 'string') walk(x, stack); }
      else if (v && typeof v === 'object' && typeof v.type === 'string') walk(v, stack);
    }
  }
})(ast, []);

if (!target) { console.log('no enclosing function'); process.exit(0); }
console.log(`enclosing function: ${target.type} ${target.id ? target.id.name : '(anon)'} @ [${target.start},${target.end})`);
console.log('params:', target.params.map(p => src.slice(p.start, p.end)).join(', '));

const body = src.slice(target.start, target.end);
const re = new RegExp('(^|[^A-Za-z0-9_$.])' + ident + '(?![A-Za-z0-9_$])', 'g');
let m;
const hits = [];
while ((m = re.exec(body))) hits.push({ rel: m.index + m[1].length, abs: target.start + m.index + m[1].length });
console.log(`\nuses of '${ident}': ${hits.length}`);
for (const h of hits.slice(0, 40)) {
  console.log(`  @${h.abs}: ${body.slice(Math.max(0, h.rel - 110), h.rel + 90).replace(/\n/g, ' ')}`);
}
