// Retry wrapper: tdc_key3 cannot extract ~1 in 6 builds, so re-run with a fresh session.
// e76 exit codes: 0 = passed, 3 = key extraction failed, 2 = verify rejected, 1 = setup error.
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const root = process.cwd();
const maxTries = Number(process.argv[2] || 4);

for (let i = 1; i <= maxTries; i++) {
  console.log(`=== attempt ${i} / ${maxTries} ===`);
  const r = spawnSync(process.execPath, [path.join(root, 'scripts', 'e76_online_vm.mjs')], {
    cwd: root,
    stdio: 'inherit',
    timeout: 300000,
  });
  const code = r.status;
  if (code === 0) {
    console.log(`=== PASSED on attempt ${i} ===`);
    process.exit(0);
  }
  if (code === 3) console.log('  (key3 could not extract this build -> retry with a fresh session)');
  else if (code === 2) console.log('  (verify rejected -> retry)');
  else console.log('  (attempt failed with code ' + code + ' -> retry)');
}
console.log(`=== gave up after ${maxTries} attempts ===`);
process.exit(1);
