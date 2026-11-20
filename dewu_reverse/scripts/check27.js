'use strict';
const pceptor = require('../src/pceptor_loader');
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const api = pceptor.load({ sk: 'S', shumeiid: 'M' });
  await sleep(300);
  console.log('[scripts]', JSON.stringify(api.env.scripts));
  console.log('[fun]', typeof api.sandbox.fun, api.sandbox.fun && Object.getOwnPropertyNames(Object.getPrototypeOf(api.sandbox.fun)));
  console.log('[console]', api.env.consoleLog.slice(0, 8));
  console.log('[globals]', api.sdk.globals.join(','));
  process.exit(0);
})();
