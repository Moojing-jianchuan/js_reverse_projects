/**
 * 脱敏：把仓库里硬编码的真实会话凭据替换成占位符（提交前必须跑一次）
 *
 * 覆盖：
 *   sk / s_sk        —— 92 字符、以 9UDg 开头的设备会话令牌
 *   shumeiid / dwsm  —— 2026 + 10 位时间 + 48 位 hex 的设备指纹
 *   sessionid        —— 36 字符 UUID 风格（'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx' 变体）
 *
 * 用法:
 *   node scripts/sanitize_secrets.js --dry      只报告会改哪些文件
 *   node scripts/sanitize_secrets.js            就地替换
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DRY = process.argv.includes('--dry');
const EXT = new Set(['.js', '.py', '.json', '.md']);

const RULES = [
  { name: 'sk', re: /9UDg[A-Za-z0-9+/]{80,100}/g, rep: 'YOUR_SK_HERE' },
  { name: 'shumeiid/dwsm', re: /2026\d{10}[0-9a-f]{48}/g, rep: 'YOUR_SHUMEIID_HERE' },
  { name: 'sessionid', re: /\b[A-Za-z0-9]{9}-[A-Za-z0-9]{4}-[A-Za-z0-9]{4}-[A-Za-z0-9]{4}-[A-Za-z0-9]{12,20}\b/g, rep: 'YOUR_SESSIONID_HERE' },
];

const SKIP_DIRS = new Set(['node_modules', '.git', '__pycache__', 'artifacts', 'data', 'unpacked']);

let changed = 0, scanned = 0;
const hits = {};

function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (!SKIP_DIRS.has(e.name)) walk(p);
      continue;
    }
    if (!EXT.has(path.extname(e.name))) continue;
    scanned++;
    let s = fs.readFileSync(p, 'utf8');
    let touched = false;
    for (const r of RULES) {
      const m = s.match(r.re);
      if (m) {
        hits[r.name] = (hits[r.name] || 0) + m.length;
        if (!DRY) s = s.replace(r.re, r.rep);
        touched = true;
      }
    }
    if (touched) {
      changed++;
      console.log(`  ${DRY ? '[would]' : '[done] '} ${path.relative(ROOT, p)}`);
      if (!DRY) fs.writeFileSync(p, s, 'utf8');
    }
  }
}

console.log(DRY ? '=== DRY RUN ===' : '=== SANITIZE ===');
walk(ROOT);
console.log(`\n扫描 ${scanned} 个文件，命中 ${changed} 个`);
console.log('命中明细:', JSON.stringify(hits));
if (DRY) console.log('\n去掉 --dry 再跑一次即可就地替换');
