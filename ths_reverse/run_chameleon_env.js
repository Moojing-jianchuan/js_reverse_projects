const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.resolve(__dirname, "..");
const SKILL_ENV_DIR = path.join(ROOT, ".cursor", "skills", "js-env-patcher", "env");
const TARGET_JS = path.join(__dirname, "chameleon.1.7.min.1775727.js");

const ENV_MODULES = [
  "core/ProxyMonitor.js",
  "bom/navigator.js",
  "bom/location.js",
  "bom/storage.js",
  "bom/window.js",
  "bom/performance.js",
  "dom/event.js",
  "dom/document.js",
  "dom/elements.js",
  "timer/timeout.js",
];

function loadModule(context, relPath) {
  const absPath = path.join(SKILL_ENV_DIR, relPath);
  const code = fs.readFileSync(absPath, "utf-8");
  vm.runInContext(code, context, { filename: relPath, timeout: 60000 });
}

function bootstrap() {
  const sandbox = {
    console,
    setTimeout: (fn, delay) => 0,
    setInterval: (fn, delay) => 0,
    clearTimeout: () => {},
    clearInterval: () => {},
    atob: (str) => Buffer.from(str, "base64").toString("binary"),
    btoa: (str) => Buffer.from(str, "binary").toString("base64"),
    XMLHttpRequest: class XMLHttpRequest {
      constructor() {
        this.bdmsInvokeList = [];
      }
      open() {}
      send() {}
      setRequestHeader() {}
      getResponseHeader() {
        return null;
      }
      getAllResponseHeaders() {
        return "";
      }
      addEventListener() {}
      removeEventListener() {}
    },
  };

  sandbox.window = sandbox;
  sandbox.global = sandbox;
  sandbox.globalThis = sandbox;
  sandbox.self = sandbox;

  const context = vm.createContext(sandbox);
  for (const mod of ENV_MODULES) loadModule(context, mod);
  return context;
}

function buildProbe(context) {
  return vm.runInContext(
    `(() => ({
      hasTA: typeof TA === "object",
      taMethods: typeof TA === "object" && TA ? Object.keys(TA).length : 0,
      hasStorage: typeof storage !== "undefined",
      hasThsClog: typeof _thsclog === "function",
      hexinV: (() => {
        try {
          if (typeof storage !== "undefined" && storage && typeof storage.get === "function") {
            const v = storage.get("v");
            if (v) return v;
          }
        } catch (_) {}
        try {
          if (typeof localStorage !== "undefined" && localStorage) {
            const v = localStorage.getItem("ths_v");
            if (v) return v;
          }
        } catch (_) {}
        try {
          if (typeof document !== "undefined" && document && typeof document.cookie === "string") {
            const m = document.cookie.match(/(?:^|;\\s*)v=([^;]+)/);
            if (m && m[1]) return decodeURIComponent(m[1]);
          }
        } catch (_) {}
        return null;
      })()
    }))()`,
    context
  );
}

function getHexinV() {
  const context = bootstrap();
  const code = fs.readFileSync(TARGET_JS, "utf-8");
  vm.runInContext(code, context, {
    filename: "chameleon.1.7.min.1775727.js",
    timeout: 60000,
  });
  const probe = buildProbe(context);
  return probe.hexinV || "";
}

function run() {
  const context = bootstrap();
  const code = fs.readFileSync(TARGET_JS, "utf-8");
  vm.runInContext(code, context, {
    filename: "chameleon.1.7.min.1775727.js",
    timeout: 60000,
  });
  const probe = buildProbe(context);

  console.log("[run_chameleon_env] execute success");
  console.log(JSON.stringify(probe, null, 2));
}

if (require.main === module) {
  run();
}

module.exports = { run, getHexinV };
