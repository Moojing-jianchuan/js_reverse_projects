/**
 * 复现同盾 blackBox（服务端返回的 tokenId）：需真实 POST fp 接口，故开启 useRealXhr。
 *
 * 用法:
 *   node scripts/td/run_td_blackbox.js
 *   node scripts/td/run_td_blackbox.js --location path/to/custom.json
 *   node scripts/td/run_td_blackbox.js --appKey 站点上的key
 *   location 默认: config/location.juneyaoair.json；其次环境变量 TD_LOCATION_FILE；均无则用 https://www.juneyaoair.com/
 *   默认 _fmOpt: partner=jxhk, appName=jxhk_web, sdkVersion=4.2.1；appKey 可用 --appKey 或环境变量 TD_APP_KEY
 *
 * 说明: partner/appKey 须与站点 _fmOpt 一致，否则 fp 可能返回非 000。若 result 为加密串，
 * SDK 会用 Wasm OoOO00 解密后再取 tokenId，此时仅 __tdLastFpJson / __tdLastFpBody 有值。
 */

"use strict";

const fs = require("fs");
const path = require("path");
const {
  buildTrustDecisionVmContext,
  runTdScriptInVm,
  waitForTdSignReady,
  pickTokenIdFromFpResponse,
} = require("./trustdecision_node_env.js");
const { resolveTdLocation, DEFAULT_HREF } = require("./resolve_td_location.js");

const args = process.argv.slice(2);
let locationFile = null;
let partner = null;
let appKey = null;
let appName = null;
let channel = null;
const rest = [];

for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === "--location" || a === "-l") {
    locationFile = args[++i];
    if (!locationFile) {
      console.error("Missing path after --location");
      process.exit(1);
    }
  } else if (a === "--partner") partner = args[++i];
  else if (a === "--appKey") appKey = args[++i];
  else if (a === "--appName") appName = args[++i];
  else if (a === "--channel") channel = args[++i];
  else rest.push(a);
}

const { location: locationObj, resolvedPath: resolvedLocationPath } = resolveTdLocation(locationFile);
if (resolvedLocationPath) {
  console.error("[td-blackbox] location:", resolvedLocationPath);
} else {
  console.error("[td-blackbox] location: (无 JSON) 使用默认 href", DEFAULT_HREF);
}

const ctx = buildTrustDecisionVmContext({
  ...(locationObj ? { location: locationObj } : { href: DEFAULT_HREF }),
  interfaceProtection: true,
  useRealXhr: true,
  verboseConsole: process.env.TD_VERBOSE === "1",
  partner: partner || undefined,
  appKey: appKey || process.env.TD_APP_KEY || undefined,
  appName: appName || undefined,
  channel: channel || undefined,
});

const scriptPath = path.join(__dirname, "..", "..", "sdk", "deob.final.js");
const code = fs.readFileSync(scriptPath, "utf8");

process.on("unhandledRejection", (reason) => {
  console.error("[unhandledRejection]", reason);
});

runTdScriptInVm(code, ctx, 180000);

const maxBb = Number(process.env.TD_BLACKBOX_WAIT_MS || 90000);

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

waitForTdSignReady(ctx, 25000, 30)
  .then(async () => {
    const deadline = Date.now() + maxBb;
    while (Date.now() < deadline) {
      if (ctx.__tdBlackBox && typeof ctx.__tdBlackBox === "string") {
        return ctx.__tdBlackBox;
      }
      if (
        ctx.__tdLastFpStatus === 200 &&
        ctx.__tdLastFpJson &&
        typeof ctx.__tdLastFpJson === "object"
      ) {
        const j = /** @type {any} */ (ctx.__tdLastFpJson);
        const c = j.code;
        if (c != null && String(c) !== "000" && !pickTokenIdFromFpResponse(ctx.__tdLastFpJson)) {
          return null;
        }
        if (
          String(c) === "000" &&
          typeof j.result === "string" &&
          j.result.length > 0 &&
          !pickTokenIdFromFpResponse(ctx.__tdLastFpJson)
        ) {
          return null;
        }
      }
      await sleep(150);
    }
    return null;
  })
  .then((bb) => {
    const out = {
      blackBox: bb,
      fpHttpStatus: ctx.__tdLastFpStatus,
      fpError: ctx.__tdFpError || null,
      fpResponse: ctx.__tdLastFpJson != null ? ctx.__tdLastFpJson : undefined,
    };
    const j = ctx.__tdLastFpJson;
    if (
      !bb &&
      j &&
      typeof j === "object" &&
      /** @type {any} */ (j).code === "000" &&
      typeof /** @type {any} */ (j).result === "string"
    ) {
      out.note =
        "fp 已 000 成功，result 为加密串；明文 tokenId 由 SDK 内 Wasm 解密，Node 侧 XHR 无法直接得到 blackBox，可在浏览器 getDeviceInfo 或 Hook oOQoQo 取 tokenId。";
    }
    console.log(JSON.stringify(out, null, 2));
    if (!out.blackBox) {
      process.exitCode = 1;
    }
  })
  .catch((e) => {
    console.error(String(e && e.message ? e.message : e));
    const diag = {
      signReady: !!(ctx._fmOpt && typeof ctx._fmOpt.sign === "function"),
      fpHttpStatus: ctx.__tdLastFpStatus,
      fpError: ctx.__tdFpError || null,
      fpResponse: ctx.__tdLastFpJson != null ? ctx.__tdLastFpJson : undefined,
      fpBodyPreview:
        typeof ctx.__tdLastFpBody === "string"
          ? ctx.__tdLastFpBody.slice(0, 800)
          : null,
    };
    console.error(JSON.stringify(diag, null, 2));
    process.exitCode = 1;
  });
