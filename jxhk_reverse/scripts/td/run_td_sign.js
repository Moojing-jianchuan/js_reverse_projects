/**
 * 在 Node 中加载 deob.final.js 并调用 _fmOpt.sign({ path })。
 *
 * 用法:
 *   node scripts/td/run_td_sign.js [path]
 *   node scripts/td/run_td_sign.js --location path/to/custom.json /api/foo
 *   未传 --location 时: 默认读 config/location.juneyaoair.json（与 run_td_blackbox 一致），否则 href 为 https://www.juneyaoair.com/
 *   node scripts/td/run_td_sign.js --dump /api/foo   # 吐环境 -> data/env_access_log.json
 *   node scripts/td/run_td_sign.js --verbose         # 放行 SDK 内 console.log（反调试探针会刷屏）
 */

"use strict";

const fs = require("fs");
const path = require("path");
const {
  buildTrustDecisionVmContext,
  runTdScriptInVm,
  waitForTdSignReady,
} = require("./trustdecision_node_env.js");
const { resolveTdLocation, DEFAULT_HREF } = require("./resolve_td_location.js");

const args = process.argv.slice(2);
let envDump = false;
let verboseConsole = false;
let locationFile = null;
const rest = [];
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === "--dump" || a === "-d") envDump = true;
  else if (a === "--verbose" || a === "-v") verboseConsole = true;
  else if (a === "--location" || a === "-l") {
    locationFile = args[i + 1];
    if (!locationFile) {
      console.error("Missing path after --location");
      process.exit(1);
    }
    i += 1;
  } else rest.push(a);
}

const signPath = rest[0] || "/";

const { location: locationObj, resolvedPath: resolvedLocationPath } = resolveTdLocation(locationFile);
if (resolvedLocationPath) {
  console.error("[td-sign] location:", resolvedLocationPath);
} else {
  console.error("[td-sign] location: (无 JSON) 使用默认 href", DEFAULT_HREF);
}

const dumpSink = envDump ? [] : null;
const ctx = buildTrustDecisionVmContext({
  ...(locationObj ? { location: locationObj } : { href: DEFAULT_HREF }),
  interfaceProtection: true,
  envDump: !!dumpSink,
  dumpSink: dumpSink || undefined,
  verboseConsole,
});

const scriptPath = path.join(__dirname, "..", "..", "sdk", "deob.final.js");
const code = fs.readFileSync(scriptPath, "utf8");

process.on("unhandledRejection", (reason) => {
  console.error("[unhandledRejection]", reason);
});

runTdScriptInVm(code, ctx, 120000);

waitForTdSignReady(ctx, 20000, 20)
  .then(() => {
    const out = ctx._fmOpt.sign({ path: signPath });
    console.log(JSON.stringify(out, null, 2));
    if (dumpSink && dumpSink.length) {
      const outDump = path.join(__dirname, "..", "..", "data", "env_access_log.json");
      fs.writeFileSync(outDump, JSON.stringify(dumpSink, null, 2), "utf8");
      console.error("[env-dump] wrote", outDump, "entries:", dumpSink.length);
    }
  })
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  });
