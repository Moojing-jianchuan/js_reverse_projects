/**
 * 同盾 / TrustDecision fp JS（deob.final.js）在 Node.js vm 中的最小浏览器补环境。
 * 依据对 deob.final.js 的静态引用与试运行整理：location、storage、document 骨架、
 * navigator 常用字段、WebAssembly、performance 等为硬依赖；canvas/WebGL 此处返回 null
 * 时 Wasm 签名链仍可跑通（指纹项会降级为占位，不影响 sign 接口成功）。
 */

"use strict";

const vm = require("vm");
const http = require("http");
const https = require("https");
const { URL: NodeURL } = require("url");
const { performance: nodePerformance } = require("perf_hooks");
const crypto = require("crypto");

/**
 * 从同盾 fp JSON 响应里尽量取出 tokenId（即业务里的 blackBox）。
 * @param {unknown} obj
 * @returns {string|null}
 */
function pickTokenIdFromFpResponse(obj) {
  if (!obj || typeof obj !== "object") return null;
  const o = /** @type {Record<string, unknown>} */ (obj);
  if (typeof o.tokenId === "string" && o.tokenId) return o.tokenId;
  const r = o.result;
  if (r && typeof r === "object" && typeof /** @type {any} */ (r).tokenId === "string") {
    return /** @type {any} */ (r).tokenId;
  }
  const d = o.data;
  if (d && typeof d === "object" && typeof /** @type {any} */ (d).tokenId === "string") {
    return /** @type {any} */ (d).tokenId;
  }
  return null;
}

/**
 * Node 版 XMLHttpRequest，供 SDK POST fpHost+jsonUrl（body: data=…）换 tokenId。
 * @param {object} ctx vm 全局（需已有 navigator、location）
 */
function createNodeXmlHttpRequest(ctx) {
  function XMLHttpRequest() {
    const self = this;
    self.readyState = 0;
    self.status = 0;
    self.statusText = "";
    self.responseText = "";
    self._method = "GET";
    self._url = "";
    self._headers = /** @type {Record<string, string>} */ ({});
    self.onreadystatechange = null;
    self.onerror = null;
    self.withCredentials = false;

    self.open = function open(method, url, _async) {
      self._method = String(method || "GET").toUpperCase();
      self._url = String(url);
      self.readyState = 1;
    };

    self.setRequestHeader = function setRequestHeader(k, v) {
      self._headers[String(k)] = String(v);
    };

    self.send = function send(body) {
      const base = (ctx.location && ctx.location.href) || "https://localhost/";
      let u;
      try {
        u = new NodeURL(self._url, base);
      } catch (e) {
        self.readyState = 4;
        self.status = 0;
        ctx.__tdFpError = "invalid URL: " + String(e && e.message ? e.message : e);
        if (typeof self.onreadystatechange === "function") self.onreadystatechange();
        return;
      }

      const lib = u.protocol === "http:" ? http : https;
      const defaultPort = u.protocol === "http:" ? 80 : 443;
      const ua =
        (ctx.navigator && ctx.navigator.userAgent) ||
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36";

      const headers = Object.assign(
        {
          "User-Agent": ua,
          Accept: "*/*",
          Host: u.host || u.hostname,
        },
        self._headers,
      );

      const opts = {
        protocol: u.protocol,
        hostname: u.hostname,
        port: u.port || defaultPort,
        path: (u.pathname || "/") + (u.search || ""),
        method: self._method,
        headers,
      };

      self.readyState = 2;
      const req = lib.request(opts, (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const buf = Buffer.concat(chunks);
          self.readyState = 4;
          self.status = res.statusCode || 0;
          self.statusText = res.statusMessage || "";
          self.responseText = buf.toString("utf8");
          ctx.__tdLastFpStatus = self.status;
          ctx.__tdLastFpBody = self.responseText.slice(0, 8000);
          if (self.status === 200) {
            try {
              const j = JSON.parse(self.responseText);
              ctx.__tdLastFpJson = j;
              const tid = pickTokenIdFromFpResponse(j);
              if (tid) ctx.__tdBlackBox = tid;
            } catch (_) {
              ctx.__tdLastFpJson = null;
            }
          }
          if (typeof self.onreadystatechange === "function") {
            self.onreadystatechange();
          }
        });
      });

      req.on("error", (err) => {
        self.readyState = 4;
        self.status = 0;
        ctx.__tdFpError = String(err && err.message ? err.message : err);
        if (typeof self.onerror === "function") self.onerror();
        if (typeof self.onreadystatechange === "function") self.onreadystatechange();
      });

      const payload = body == null ? "" : typeof body === "string" ? body : Buffer.from(body);
      if (payload.length) req.write(payload);
      req.end();
    };
  }

  return XMLHttpRequest;
}

/**
 * @typedef {Object} TdEnvOptions
 * @property {string} [partner]
 * @property {string} [appName]
 * @property {string} [appKey] 缺省为空；换 blackBox 时须与页面一致（或通过 CLI/环境变量传入）
 * @property {string} [sdkVersion] 缺省 4.2.1（与 deob.final.js 内 OQOoOQ 一致）
 * @property {string} [channel]
 * @property {boolean} [interfaceProtection]
 * @property {string} [href] 仅 href；若传 `location` 则以其中的 `href` 为准
 * @property {Record<string, unknown>} [location] 浏览器 Location 快照（含 ancestorOrigins）
 * @property {boolean} [envDump]
 * @property {unknown[]} [dumpSink]
 * @property {boolean} [verboseConsole]
 * @property {boolean} [useRealXhr] 为 true 时用 Node http(s) 发 fp 请求，便于拿到 tokenId（blackBox）
 */

function memoryStorage() {
  const _ = Object.create(null);
  return {
    _,
    length: 0,
    clear() {
      for (const k of Object.keys(_)) delete _[k];
    },
    getItem(k) {
      return Object.prototype.hasOwnProperty.call(_, k) ? _[k] : null;
    },
    setItem(k, v) {
      _[String(k)] = String(v);
    },
    removeItem(k) {
      delete _[String(k)];
    },
    key() {
      return null;
    },
  };
}

/** deob.final.js 内 OQOoOQ["cacheKeyBlackbox"] 默认；可用环境变量 TD_CACHE_KEY_BLACKBOX 覆盖 */
const TD_DEFAULT_CACHE_KEY_BLACKBOX = "79F05CA5AF1CAE77";

/**
 * fp 响应里 result 常为加密串时，明文 tokenId 在 SDK 内 Wasm 解密后经 oOQoQo 写入
 * localStorage.setItem(cacheKeyBlackbox, tokenId)（见 deob.final.js）；XHR 层拿不到，此处挂钩补 ctx.__tdBlackBox。
 * @param {Record<string, unknown>} ctx
 * @param {{ setItem: (k: string, v: string) => void }} storage
 */
function hookTdBlackBoxLocalStorage(ctx, storage) {
  const key =
    (process.env.TD_CACHE_KEY_BLACKBOX && String(process.env.TD_CACHE_KEY_BLACKBOX).trim()) ||
    TD_DEFAULT_CACHE_KEY_BLACKBOX;
  const orig = storage.setItem.bind(storage);
  storage.setItem = function setItem(k, v) {
    orig(k, v);
    if (String(k) === key && typeof v === "string" && v.length > 0) {
      ctx.__tdBlackBox = v;
    }
  };
}

function makeLocation(href) {
  let u;
  try {
    u = new URL(href);
  } catch {
    u = new URL("https://www.example.com/");
  }
  return {
    href: u.href,
    protocol: u.protocol,
    hostname: u.hostname,
    host: u.host,
    port: u.port || "",
    pathname: u.pathname,
    search: u.search,
    hash: u.hash,
    origin: u.origin,
    assign() {},
    replace() {},
    reload() {},
    toString() {
      return u.href;
    },
  };
}

/**
 * 使用浏览器复制的 location JSON，或与 `href` 二选一。
 * `ancestorOrigins` 为 `{}` 时会补成带 `length` 的类 DOMStringList 桩，避免 SDK 读 `length` 异常。
 * @param {TdEnvOptions} opt
 */
function buildLocation(opt) {
  const o = opt || {};
  if (!o.location || typeof o.location !== "object") {
    return makeLocation(o.href || "https://www.example.com/app");
  }

  const href = String(o.location.href || o.href || "https://www.example.com/");
  let u;
  try {
    u = new URL(href);
  } catch {
    u = new URL("https://www.example.com/");
  }

  const fromUrl = {
    protocol: u.protocol,
    host: u.host,
    hostname: u.hostname,
    port: u.port || "",
    pathname: u.pathname,
    search: u.search,
    hash: u.hash,
    origin: u.origin,
    href,
  };

  const user = /** @type {Record<string, unknown>} */ ({ ...o.location });
  const merged = { ...fromUrl, ...user, href: user.href != null ? String(user.href) : href };

  const ao = merged.ancestorOrigins;
  if (ao && typeof ao === "object" && typeof ao.length === "number") {
    merged.ancestorOrigins = ao;
  } else {
    merged.ancestorOrigins = Object.assign(
      {
        length: 0,
        item() {
          return null;
        },
        contains() {
          return false;
        },
      },
      ao && typeof ao === "object" ? ao : {},
    );
  }

  merged.assign =
    typeof merged.assign === "function"
      ? merged.assign
      : function assign() {};
  merged.replace =
    typeof merged.replace === "function"
      ? merged.replace
      : function replace() {};
  merged.reload =
    typeof merged.reload === "function"
      ? merged.reload
      : function reload() {};
  merged.toString = function toString() {
    return String(merged.href);
  };

  return merged;
}

function wrapEnvDump(target, name, sink) {
  if (!target || typeof target !== "object") return target;
  return new Proxy(target, {
    get(t, p, receiver) {
      const path = `${name}.${String(p)}`;
      let v;
      try {
        v = Reflect.get(t, p, receiver);
      } catch (e) {
        sink.push({ op: "get-throw", path, err: String(e && e.message ? e.message : e) });
        throw e;
      }
      if (v === undefined && !Reflect.has(t, p)) {
        sink.push({ op: "missing-get", path });
      }
      return v;
    },
    set(t, p, value, receiver) {
      sink.push({ op: "set", path: `${name}.${String(p)}`, valueType: typeof value });
      return Reflect.set(t, p, value, receiver);
    },
    has(t, p) {
      return Reflect.has(t, p);
    },
  });
}

/**
 * @param {TdEnvOptions} [options]
 * @returns {object} vm 沙箱 global 对象（即 window）
 */
function buildTrustDecisionVmContext(options) {
  const opt = options || {};
  const loc = buildLocation(opt);
  const dumpSink = opt.envDump ? opt.dumpSink || [] : null;

  const ls = memoryStorage();
  const ss = memoryStorage();

  const mkCanvas = () => ({
    style: {},
    width: 300,
    height: 150,
    getContext() {
      return null;
    },
    contentWindow: null,
    toDataURL() {
      return "data:image/png;base64,xx";
    },
    remove() {},
  });

  const bodyEl = {
    appendChild() {},
    removeChild() {},
  };

  const quietConsole = Object.assign({}, console, {
    log(...args) {
      if (opt.verboseConsole === true) {
        console.log.apply(console, args);
      }
    },
  });

  const scriptHostStub = {
    async: true,
    src: "",
    type: "text/javascript",
    parentNode: {
      insertBefore() {},
      removeChild() {},
    },
  };

  const rawDocument = {
    currentScript: { src: "https://static.trustdecision.com/v3/td.js" },
    cookie: "",
    URL: loc.href,
    location: loc,
    documentElement: { clientWidth: 1920, clientHeight: 937 },
    body: bodyEl,
    createElement(tag) {
      const t = String(tag).toLowerCase();
      if (t === "iframe") {
        return {
          id: "",
          width: 0,
          height: 0,
          style: {},
          frameElement: null,
          contentWindow: {
            console: quietConsole,
            screen: { width: 800, height: 600 },
            Object,
          },
        };
      }
      if (t === "canvas") return mkCanvas();
      if (t === "span" || t === "div") {
        return { style: {}, innerHTML: "", offsetWidth: 10, offsetHeight: 10 };
      }
      if (t === "a") return { href: "#" };
      if (t === "button") return {};
      if (t === "script") return { async: true, src: "", parentNode: { removeChild() {} } };
      if (t === "td_ua") return { style: {}, offsetWidth: 1, offsetHeight: 1 };
      return { style: {} };
    },
    createEvent() {
      return {};
    },
    getElementsByTagName(name) {
      const n = String(name).toLowerCase();
      if (n === "body") return [bodyEl];
      if (n === "script") return [scriptHostStub];
      return [];
    },
    getElementById() {
      return null;
    },
  };

  const rawNavigator = {
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    platform: "Win32",
    vendor: "Google Inc.",
    appVersion: "5.0",
    productSub: "20030107",
    language: "zh-CN",
    languages: ["zh-CN", "zh"],
    cookieEnabled: true,
    webdriver: false,
    hardwareConcurrency: 8,
    deviceMemory: 8,
    onLine: true,
    maxTouchPoints: 0,
    pdfViewerEnabled: true,
    plugins: { length: 0, item() { return null; } },
    mimeTypes: { length: 0, item() { return null; } },
    javaEnabled() {
      return false;
    },
    sendBeacon() {
      return true;
    },
    storage: {
      estimate() {
        return Promise.resolve({ quota: 1e10, usage: 1e6 });
      },
    },
    userAgentData: {
      mobile: false,
      platform: "Windows",
      brands: [
        { brand: "Chromium", version: "120" },
        { brand: "Google Chrome", version: "120" },
        { brand: "Not-A.Brand", version: "99" },
      ],
      getHighEntropyValues() {
        return Promise.resolve({
          platformVersion: "15.0.0",
          fullVersionList: [
            { brand: "Chromium", version: "120.0.6099.109" },
            { brand: "Google Chrome", version: "120.0.6099.109" },
            { brand: "Not-A.Brand", version: "99.0.0.0" },
          ],
        });
      },
    },
  };

  const document = dumpSink ? wrapEnvDump(rawDocument, "document", dumpSink) : rawDocument;
  const navigator = dumpSink ? wrapEnvDump(rawNavigator, "navigator", dumpSink) : rawNavigator;

  const ctx = {
    console: quietConsole,
    Date,
    Math,
    JSON,
    Promise,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    TextEncoder,
    TextDecoder,
    Uint8Array,
    Uint32Array,
    Int8Array,
    Int32Array,
    Float32Array,
    Float64Array,
    ArrayBuffer,
    DataView,
    RegExp,
    Error,
    TypeError,
    ReferenceError,
    SyntaxError,
    RangeError,
    Symbol,
    Array,
    Object,
    String,
    Number,
    Boolean,
    Function,
    parseInt,
    parseFloat,
    isNaN,
    isFinite,
    encodeURIComponent,
    decodeURIComponent,
    Reflect,
    Map,
    Set,
    WeakMap,
    WeakSet,
    Proxy,
    Intl,
  };

  ctx.globalThis = ctx;
  ctx.window = ctx;
  ctx.self = ctx;
  ctx.name = "";

  ctx.addEventListener = function () {};
  ctx.removeEventListener = function () {};
  ctx.dispatchEvent = function () {
    return true;
  };

  ctx.location = loc;
  ctx.history = { length: 1, pushState() {}, replaceState() {} };
  ctx.screen = {
    width: 1920,
    height: 1080,
    availWidth: 1920,
    availHeight: 1040,
    colorDepth: 24,
    pixelDepth: 24,
    orientation: { type: "landscape-primary" },
  };
  ctx.innerWidth = 1920;
  ctx.innerHeight = 937;
  ctx.outerWidth = 1920;
  ctx.outerHeight = 1040;
  ctx.screenX = 0;
  ctx.screenY = 0;
  ctx.devicePixelRatio = 1;
  ctx.chrome = {};
  ctx.indexedDB = null;

  ctx.Image = function Image() {};

  ctx.performance = {
    now() {
      return nodePerformance.now();
    },
    timing: { navigationStart: Date.now() - 1000 },
    timeOrigin: Date.now() - 1000,
  };

  ctx.crypto = crypto.webcrypto;
  ctx.atob = (s) => Buffer.from(String(s), "base64").toString("binary");
  ctx.btoa = (s) => Buffer.from(String(s), "binary").toString("base64");

  ctx.WebAssembly = WebAssembly;
  ctx.URL = NodeURL;

  if (opt.useRealXhr === true) {
    ctx.XMLHttpRequest = createNodeXmlHttpRequest(ctx);
  } else {
    ctx.XMLHttpRequest = function XHR() {
      this.open = function () {};
      this.send = function () {};
      this.setRequestHeader = function () {};
      this.readyState = 4;
      this.status = 200;
      this.responseText = "{}";
    };
  }

  ctx.RTCPeerConnection = null;
  ctx.webkitRTCPeerConnection = null;
  ctx.mozRTCPeerConnection = null;

  ctx.document = document;
  ctx.navigator = navigator;

  ctx.localStorage = ls;
  ctx.sessionStorage = ss;
  hookTdBlackBoxLocalStorage(ctx, ls);

  ctx.HTMLElement = function HTMLElement() {};
  ctx.HTMLCanvasElement = function HTMLCanvasElement() {};
  ctx.Navigator = function Navigator() {};
  ctx.Screen = function Screen() {};
  ctx.Window = function Window() {};

  ctx._fmOpt = {
    partner: opt.partner != null ? opt.partner : "jxhk",
    appName: opt.appName != null ? opt.appName : "jxhk_web",
    appKey: opt.appKey != null ? opt.appKey : "",
    sdkVersion: opt.sdkVersion != null ? opt.sdkVersion : "4.2.1",
    channel: opt.channel != null ? opt.channel : "web",
    interfaceProtection: opt.interfaceProtection !== false,
    storage: {
      localStorage: ls,
      sessionStorage: ss,
    },
  };

  if (dumpSink) {
    ctx.__envDumpSink = dumpSink;
  }

  return ctx;
}

/**
 * @param {string} code deob.final.js 全文
 * @param {object} ctx buildTrustDecisionVmContext 返回值
 * @param {number} [timeoutMs]
 */
function runTdScriptInVm(code, ctx, timeoutMs) {
  vm.runInNewContext(code, ctx, {
    filename: "deob.final.js",
    timeout: timeoutMs || 120000,
  });
}

/**
 * 轮询等待 Wasm 初始化完成后安装 _fmOpt.sign（interfaceProtection 为 true 时）。
 * @param {object} ctx
 * @param {number} [maxWaitMs]
 * @param {number} [intervalMs]
 * @returns {Promise<void>}
 */
function waitForTdSignReady(ctx, maxWaitMs, intervalMs) {
  const max = maxWaitMs || 15000;
  const step = intervalMs || 25;
  const start = Date.now();
  return new Promise((resolve, reject) => {
    function tick() {
      try {
        if (ctx._fmOpt && typeof ctx._fmOpt.sign === "function") {
          resolve();
          return;
        }
      } catch (e) {
        reject(e);
        return;
      }
      if (Date.now() - start > max) {
        reject(new Error("waitForTdSignReady: 超时，仍未发现 _fmOpt.sign"));
        return;
      }
      setTimeout(tick, step);
    }
    tick();
  });
}

/**
 * 等待 SDK 发起 fp 请求后写入的 `ctx.__tdBlackBox`（明文 tokenId），或超时。
 * @param {object} ctx
 * @param {number} [maxWaitMs]
 * @param {number} [intervalMs]
 */
function waitForTdBlackBox(ctx, maxWaitMs, intervalMs) {
  const max = maxWaitMs || 60000;
  const step = intervalMs || 100;
  const start = Date.now();
  return new Promise((resolve, reject) => {
    function tick() {
      try {
        if (ctx.__tdBlackBox && typeof ctx.__tdBlackBox === "string") {
          resolve(ctx.__tdBlackBox);
          return;
        }
      } catch (e) {
        reject(e);
        return;
      }
      if (Date.now() - start > max) {
        reject(
          new Error(
            "waitForTdBlackBox: 超时。可检查 ctx.__tdLastFpStatus / __tdLastFpJson / __tdFpError",
          ),
        );
        return;
      }
      setTimeout(tick, step);
    }
    tick();
  });
}

module.exports = {
  buildTrustDecisionVmContext,
  buildLocation,
  runTdScriptInVm,
  waitForTdSignReady,
  waitForTdBlackBox,
  pickTokenIdFromFpResponse,
  memoryStorage,
  wrapEnvDump,
};
