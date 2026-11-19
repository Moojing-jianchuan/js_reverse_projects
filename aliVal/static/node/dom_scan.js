// dom_scan.js — for a list of DOM / visibility / size tokens, report every hit with the
// innermost enclosing function (name if resolvable, else its offset range).
// usage: node dom_scan.js <bundle> [<bundle> ...]
const fs = require('fs');
const acorn = require('acorn');

const TOKENS = [
  'createElement', 'appendChild', 'insertBefore', 'replaceChild', 'removeChild',
  'insertAdjacentHTML', 'innerHTML', 'className', 'setAttribute', 'classList',
  'querySelector', 'querySelectorAll', 'getElementById', 'getBoundingClientRect',
  'visibilityState', 'hidden', 'readyState', 'clientWidth', 'clientHeight',
  'offsetWidth', 'devicePixelRatio', 'IntersectionObserver', 'ResizeObserver',
  'MutationObserver', 'requestAnimationFrame', 'documentElement', 'body',
  'certifyId', 'CertifyId', 'getInstance', 'AliyunCaptcha', 'mode', 'embed', 'element', 'button',
  'styleSheets', 'adoptedStyleSheets', 'importNode', 'adoptNode', 'attachShadow',
];

for (const file of process.argv.slice(2)) {
  const src = fs.readFileSync(file, 'utf8');
  const ast = acorn.parse(src, { ecmaVersion: 2022, sourceType: 'script', allowReturnOutsideFunction: true });

  // ---- build function range table --------------------------------------------
  const fns = [];
  (function walk(n) {
    if (!n || typeof n.type !== 'string') return;
    if (n.type === 'FunctionDeclaration' || n.type === 'FunctionExpression' || n.type === 'ArrowFunctionExpression') {
      let name = null;
      if (n.id && n.id.name) name = n.id.name;
      fns.push({ start: n.start, end: n.end, name, type: n.type });
    }
    for (const k of Object.keys(n)) {
      if (['type', 'start', 'end', 'loc'].includes(k)) continue;
      const v = n[k];
      if (Array.isArray(v)) { for (const x of v) if (x && typeof x.type === 'string') walk(x); }
      else if (v && typeof v === 'object' && typeof v.type === 'string') walk(v);
    }
  })(ast);
  // also record `X = function` / `X[...] = function` assignment names
  (function walk2(n) {
    if (!n || typeof n.type !== 'string') return;
    if (n.type === 'AssignmentExpression' && n.right && (n.right.type === 'FunctionExpression' || n.right.type === 'ArrowFunctionExpression')) {
      const hit = fns.find(f => f.start === n.right.start);
      if (hit) hit.name = src.slice(n.left.start, Math.min(n.left.end, n.left.start + 40));
    }
    for (const k of Object.keys(n)) {
      if (['type', 'start', 'end', 'loc'].includes(k)) continue;
      const v = n[k];
      if (Array.isArray(v)) { for (const x of v) if (x && typeof x.type === 'string') walk2(x); }
      else if (v && typeof v === 'object' && typeof v.type === 'string') walk2(v);
    }
  })(ast);
  fns.sort((a, b) => (a.end - a.start) - (b.end - b.start));

  function enclosing(off) {
    let best = null;
    for (const f of fns) {
      if (f.start <= off && off < f.end) { best = f; break; }  // smallest wins (sorted asc by size)
    }
    return best;
  }

  console.log(`\n######## ${file}  (${src.length} chars, ${fns.length} function nodes)`);
  for (const tok of TOKENS) {
    const re = new RegExp(tok.replace(/[$]/g, '\\$'), 'g');
    const hits = [];
    let m;
    while ((m = re.exec(src))) hits.push(m.index);
    if (!hits.length) continue;
    // group by enclosing function
    const groups = new Map();
    for (const h of hits) {
      const f = enclosing(h);
      const key = f ? `${f.start}-${f.end} ${f.name || '(anon)'}` : 'TOP';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(h);
    }
    const parts = [...groups.entries()].map(([k, v]) => `${v.length}x @${k}`);
    console.log(`  ${tok.padEnd(20)} ${hits.length}  ->  ${parts.join(' | ')}`);
  }
}
