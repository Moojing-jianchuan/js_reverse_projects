// scope.js — parse a bundle, build scope tree, resolve identifiers, print call sites
// usage: node scope.js <bundle> <identName>
const fs = require('fs');
const acorn = require('acorn');
const walk = require('acorn-walk');

const file = process.argv[2];
const target = process.argv[3];
const src = fs.readFileSync(file, 'utf8');
const t0 = Date.now();
const ast = acorn.parse(src, { ecmaVersion: 2022, sourceType: 'script', allowReturnOutsideFunction: true, allowAwaitOutsideFunction: true, allowHashBang: true });
console.error(`parsed in ${Date.now() - t0} ms`);

// ---- build scope tree -------------------------------------------------------
function Scope(node, parent) {
  this.node = node;
  this.parent = parent;
  this.names = new Map(); // name -> {kind, node}
  this.children = [];
  if (parent) parent.children.push(this);
}
const rootScope = new Scope(ast, null);

function declare(scope, name, kind, node) {
  if (!scope.names.has(name)) scope.names.set(name, { kind, node });
}
function hoist(scope, node) {
  // Collect var / top-level function declarations for one function scope.
  // Never descend into nested function bodies (their decls belong to them).
  (function rec(n, topLevel) {
    if (!n || typeof n.type !== 'string') return;
    switch (n.type) {
      case 'FunctionDeclaration':
        if (n.id) declare(scope, n.id.name, 'function', n);
        return; // do not descend
      case 'FunctionExpression':
      case 'ArrowFunctionExpression':
        return;
      case 'VariableDeclaration':
        if (n.kind === 'var') n.declarations.forEach(d => {
          walk.simple(d.id, { Identifier(id) { declare(scope, id.name, 'var', n); } });
        });
        break;
      case 'ClassDeclaration':
        if (n.id) declare(scope, n.id.name, 'class', n);
        break;
    }
    for (const k of Object.keys(n)) {
      if (k === 'type' || k === 'start' || k === 'end' || k === 'loc') continue;
      const v = n[k];
      if (Array.isArray(v)) { for (const x of v) if (x && typeof x.type === 'string') rec(x, false); }
      else if (v && typeof v === 'object' && typeof v.type === 'string') rec(v, false);
    }
  })(node, true);
}
function buildScopes(node, scope) {
  // create child scopes for functions; register params + let/const/function decls
  walk.ancestor(node, {}, []);
}
// Simpler: manual recursive walk
const scopeOf = new Map(); // node -> scope that the node belongs to

function handleFunction(fn, parentScope) {
  const s = new Scope(fn, parentScope);
  scopeOf.set(fn, s);
  fn.params.forEach(p => walk.simple(p, { Identifier(id) { declare(s, id.name, 'param', fn); } , AssignmentPattern(ap){ walk.simple(ap.left, {Identifier(id){declare(s,id.name,'param',fn);}}); }}));
  hoist(s, fn.body);
  visit(fn.body, s);
}
function visit(node, scope) {
  if (!node || typeof node.type !== 'string') return;
  const t = node.type;
  if (t === 'FunctionDeclaration' || t === 'FunctionExpression' || t === 'ArrowFunctionExpression') {
    handleFunction(node, t === 'FunctionDeclaration' ? scope : scope);
    return;
  }
  if (t === 'BlockStatement' || t === 'Program') {
    const s = t === 'BlockStatement' ? new Scope(node, scope) : scope;
    scopeOf.set(node, s);
    for (const st of node.body) {
      if (st.type === 'VariableDeclaration' && st.kind !== 'var') {
        st.declarations.forEach(d => walk.simple(d.id, { Identifier(id) { declare(s, id.name, st.kind, st); } }));
      }
      if (st.type === 'ClassDeclaration' && st.id) declare(s, st.id.name, 'class', st);
    }
    node.body.forEach(st => visit(st, s));
    return;
  }
  if (t === 'CatchClause') {
    const s = new Scope(node, scope);
    if (node.param) walk.simple(node.param, { Identifier(id) { declare(s, id.name, 'catch', node); } });
    visit(node.body, s);
    return;
  }
  if (t === 'ForStatement' || t === 'ForInStatement' || t === 'ForOfStatement') {
    const s = new Scope(node, scope);
    scopeOf.set(node, s);
    const left = node.left || node.init;
    if (left && left.type === 'VariableDeclaration' && left.kind !== 'var') {
      left.declarations.forEach(d => walk.simple(d.id, { Identifier(id) { declare(s, id.name, left.kind, left); } }));
    }
    for (const k of Object.keys(node)) {
      const v = node[k];
      if (Array.isArray(v)) v.forEach(x => x && visit(x, s));
      else if (v && typeof v === 'object' && v.type) visit(v, s);
    }
    return;
  }
  for (const k of Object.keys(node)) {
    if (k === 'type' || k === 'start' || k === 'end' || k === 'loc') continue;
    const v = node[k];
    if (Array.isArray(v)) { for (const x of v) if (x && typeof x.type === 'string') visit(x, scope); }
    else if (v && typeof v === 'object' && typeof v.type === 'string') visit(v, scope);
  }
}
scopeOf.set(ast, rootScope);
hoist(rootScope, ast);
visit(ast, rootScope);

function resolve(name, scope) {
  let s = scope;
  while (s) { if (s.names.has(name)) return s; s = s.parent; }
  return null;
}

// ---- find references --------------------------------------------------------
const refs = [];
walk.ancestor(ast, {
  Identifier(node, state, ancestors) {
    const parent = ancestors[ancestors.length - 2];
    if (!parent) return;
    if (parent.type === 'MemberExpression' && parent.property === node && !parent.computed) return;
    if (parent.type === 'Property' && parent.key === node && !parent.computed) return;
    if (parent.type === 'VariableDeclarator' && parent.id === node) return;
    if (parent.type === 'FunctionDeclaration' && parent.id === node) return;
    if (parent.type === 'FunctionExpression' && parent.id === node) return;
    if (parent.type === 'ClassDeclaration' && parent.id === node) return;
    if (parent.type === 'LabeledStatement' || parent.type === 'BreakStatement' || parent.type === 'ContinueStatement') return;
    // find innermost scope node
    let owner = null;
    for (let i = ancestors.length - 1; i >= 0; i--) {
      if (scopeOf.has(ancestors[i])) { owner = scopeOf.get(ancestors[i]); break; }
    }
    if (!owner) owner = rootScope;
    if (node.name !== target) return;
    const sc = resolve(node.name, owner);
    refs.push({ node, owner, resolved: sc, ancestors });
  }
});

console.log(`refs to '${target}': ${refs.length}`);
for (const r of refs) {
  const where = r.resolved ? (r.resolved.node.type + '@' + r.resolved.node.start) : 'GLOBAL';
  const call = r.ancestors[r.ancestors.length - 2];
  const isCall = call && call.type === 'CallExpression' && call.callee === r.node;
  const line = src.slice(0, r.node.start).split('\n').length;
  console.log(`  off=${r.node.start} resolvedTo=${where} callSite=${isCall ? 'yes' : 'no'} depth=${r.ancestors.length}`);
  if (isCall) console.log('     args: ' + call.arguments.map(a => src.slice(a.start, Math.min(a.end, a.start + 80)).replace(/\s+/g, ' ')).join(' | '));
}
