'use strict';

/**
 * hook_join.js
 * 在 1.js 加载前 hook Array.prototype.join，捕获 ssxmod_itna2 编码前 payload。
 */

if (globalThis.__HOOK_JOIN_INSTALLED__) return;
globalThis.__HOOK_JOIN_INSTALLED__ = true;

globalThis.__ITNA2_CAPTURE__ = { dM4: null, sub16: null, gArr: null, uArr: null, eArr: null };

var rawJoin = Array.prototype.join;
var LOG = globalThis.__ITNA2_CAPTURE__;

Array.prototype.join = function (sep) {
  var arr = this;
  var result = rawJoin.call(arr, sep);

  try {
    if (sep === '^' && Array.isArray(arr)) {
      var len = arr.length;
      // dM.slice(0,4): [seed, version, ts, counter]
      if (len === 4 && typeof arr[1] === 'string' && arr[1].indexOf('websdk') !== -1) {
        LOG.dM4 = { seed: arr[0], version: arr[1], ts: arr[2], counter: arr[3], joined: result };
      }
      // sub-array: [kM.a, ... Gr] — 16 elements
      if (len === 16 && arr[0] === 'P') {
        // Force kM.O = 0 (Gl keyboard counter) to match browser.
        // Keyup injection increments Gl→1, but browser has Gl=0 on first load.
        // We re-join with arr[6]=0 to fix the encoded value without losing e.len=1.
        var kMO_orig = String(arr[6]);
        if (kMO_orig !== '0') {
          arr[6] = '0';
          result = rawJoin.call(arr, sep);  // re-join with fixed kM.O
        }
        LOG.sub16 = {
          kMa: String(arr[0]), kMj: String(arr[1]), kMg_joined: String(arr[2] || ''), kMS: String(arr[3]),
          kMu_joined: String(arr[4] || ''), kMe_joined: String(arr[5] || ''), kMO: String(arr[6]),
          kMO_orig: kMO_orig,
          GR: String(arr[7]), Gf: String(arr[8]), Gi: String(arr[9]), A8: String(arr[10]),
          GY: String(arr[11]), Gp: String(arr[12]), kMc: String(arr[13]), Gn: String(arr[14]), Gr: String(arr[15]),
          joined: result
        };
        if (LOG.sub16.kMg_joined) LOG.sub16.kMg_len = LOG.sub16.kMg_joined.split('|').length;
        if (LOG.sub16.kMu_joined) LOG.sub16.kMu_len = LOG.sub16.kMu_joined.split('|').filter(function(x){return x!=='';}).length;
        if (LOG.sub16.kMe_joined) LOG.sub16.kMe_len = LOG.sub16.kMe_joined.split('|').filter(function(x){return x!=='';}).length;
        if (LOG.dM4) {
          LOG.fullPayload = LOG.dM4.joined + '^' + LOG.sub16.joined;
          LOG.fullPayloadLen = LOG.fullPayload.length;
        }
      }
    }
    // Full itna payload: outer array of 8 elements joined with "^"
    // [dM_joined, behavior_joined, dK_joined, Gi, A8, dh_joined, GE(dl), dL_joined]
    if (sep === '^' && len === 8 && typeof result === 'string' && result.indexOf('websdk') >= 0) {
      LOG.fullItnaPayload = result;
      LOG.fullItnaLen = result.length;
    }
    // kM.g / kM.u / kM.e internal join("|")
    if (sep === '|' && Array.isArray(arr) && arr.length > 0) {
      var first = String(arr[0] || '');
      if (first.indexOf('+') !== -1 && first.indexOf('+') !== first.lastIndexOf('+')) {
        if (!LOG.gArr) {
          LOG.gArr = arr;
          LOG.gArrLen = arr.length;
        } else if (!LOG.uArr && first.length > 0) {
          LOG.uArr = arr;
          LOG.uArrLen = arr.length;
        }
      }
    }
  } catch (e) {
    // silent
  }

  return result;
};

console.log('[HOOK_JOIN] installed');
