// feilin_find.js — search the decoded feilin076 pools for method-name fragments
// that belong to the AliyunCaptcha instance (initEmbed / initFloat / initPopup …).
const f = require('../work/feilin076_pools.json');
const RE = /init|Emb|Float|Popup|element|Captcha/i;
const hits = [];
for (const pl of f.pools) {
  if (!pl.entries) continue;
  for (const e of pl.entries) {
    if (e.best && RE.test(e.best.s)) hits.push([pl.decoderOff, e.index, e.best.key, e.best.s]);
  }
}
console.log('hits', hits.length);
for (const h of hits) console.log(`  dec@${h[0]} idx=${h[1]} key=${h[2]} ${JSON.stringify(h[3])}`);
