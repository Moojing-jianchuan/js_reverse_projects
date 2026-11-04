const { buildSandbox } = require('./env_jsdom.js');

const win = buildSandbox();
const genToken = (seed, ts) => new win.ABC().z(seed, ts);

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:152.0) Gecko/20100101 Firefox/152.0';
const JOBLIST = 'https://www.zhipin.com/wapi/zpgeek/search/joblist.json';
const BODY = 'page=1&pageSize=15&city=101040100&position=100101&expectInfo=&query=&multiSubway=&multiBusinessDistrict=&jobType=&salary=&experience=&degree=&industry=&scale=&stage=&scene=1&encryptExpectId=';
function genTraceId() {
  const chars = '0123456789abcdef';
  let id = 'F-';
  for (let i = 0; i < 20; i++) id += chars[Math.floor(Math.random() * 16)];
  return id;
}
const HEADERS = {
  'User-Agent': UA,
  'Content-Type': 'application/x-www-form-urlencoded',
  'Origin': 'https://www.zhipin.com',
  'Referer': 'https://www.zhipin.com/web/geek/jobs',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'zh-CN,zh;q=0.9',
  'x-requested-with': 'XMLHttpRequest',
  'traceid': genTraceId(),
};

async function getSeed() {
  const resp = await fetch(JOBLIST, { method: 'POST', headers: HEADERS, body: BODY });
  const json = await resp.json();
  return json.zpData;  // { seed, ts, name }
}

async function fetchJobs(token) {
  const resp = await fetch(JOBLIST, {
    method: 'POST',
    headers: { ...HEADERS, 'Cookie': `__zp_stoken__=${encodeURIComponent(token)}` },
    body: BODY,
  });
  return await resp.json();
}

async function main() {
  const zpData = await getSeed();
  console.log('[seed]', JSON.stringify(zpData));
  if (!zpData || !zpData.seed) { console.log('未拿到 seed'); return; }

  const tzOffset = new Date().getTimezoneOffset();
  const finalTs = parseInt(zpData.ts) + (480 + tzOffset) * 60000;
  const token = genToken(zpData.seed, finalTs);
  console.log('[token] len:', token.length);

  const jobJson = await fetchJobs(token);
  console.log('[jobs] code:', jobJson.code, 'message:', jobJson.message);
  if (jobJson.zpData && jobJson.zpData.jobList) {
    console.log('[jobs] 成功拿到', jobJson.zpData.jobList.length, '条职位');
  } else {
    console.log('[jobs] 响应:', JSON.stringify(jobJson).slice(0, 300));
  }
}

main().catch(e => console.error('[ERR]', e.message));
