const fs = require('fs');
const fe = fs.readFileSync('config/feilin075.js', 'utf8');
for (const pos of [442117, 534540, 619335]) {
  console.log(`\n===== @${pos} =====`);
  console.log(fe.slice(Math.max(0, pos - 900), pos + 300));
}
