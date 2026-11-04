const crypto = require('crypto');

const KEY_SECRET = '222aiJodos2938JDdosko2djd82sf0';

// Aliyun percent encoding (Ar function)
function ar(s) {
  return encodeURIComponent(s)
    .replace(/\+/g, '%20')
    .replace(/\*/g, '%2A')
    .replace(/%7E/g, '~');
}

// The captured InitCaptcha params (raw values)
const params = {
  AaduaneId: '111jdk439dJJIjd023823201',
  SignatureMethod: 'HMAC-SHA1',
  SignatureVersion: '1.0',
  Format: 'JSON',
  Timestamp: '2026-08-27T09:47:23Z',
  Version: '2023-03-05',
  Action: 'InitCaptcha',
  SceneId: 'vollz84f',
  Language: 'cn',
  Mode: 'embed',
  DeviceData: 'byAgDBTTWK6iQ63aLnMRvywYbJ50c453wUz9CdNf4pWB+H4EOu7koqzwbASi1Zy3sWCm2jwwwiPUQHhhx5AUIUGuizY9NadaDGYiM90yjbrYiQI7cR2+MG6l9pYCb5KEfvJ/K6ek8QWgZCnss1zWnnLBU6k2E3HLDpLb78vCTTdCd+Jhfq1uJhANXNELJodm',
  SignatureNonce: '11a56ac6-01ff-4473-97d4-e4cfbe80aba7',
};
const expectedSig = 'pOPR6amfTocqp0dBOYyxmL1lKqc=';

// Build canonical query string: sorted keys, ar(key)=ar(value), joined by &
const keys = Object.keys(params).sort();
const cqs = keys.map(k => ar(k) + '=' + ar(params[k])).join('&');

// StringToSign = POST & %2F & ar(canonicalQueryString)  (double percent-encoding)
const sts = 'POST' + '&' + '%2F' + '&' + ar(cqs);

const sig = crypto.createHmac('sha1', KEY_SECRET + '&').update(sts).digest('base64');

console.log('canonical query string:', cqs.slice(0, 120) + '...');
console.log('StringToSign:', sts.slice(0, 120) + '...');
console.log('computed signature:', sig);
console.log('expected signature:', expectedSig);
console.log('MATCH:', sig === expectedSig);
