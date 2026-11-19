(function () {
  "use strict";
  try { if (window.__tgLoaded) return; } catch (e) {}
  function diag(reason) {
    try { window.__tgDiag = reason; } catch (e) {}
  }
  var CUR = document.currentScript || (function () {
    var list = document.getElementsByTagName("script");
    return list[list.length - 1];
  })();
  function clipStr(value, max) {
    var s = String(value == null ? "" : value);
    return s.length <= max ? s : s.slice(0, max);
  }
  function stripUrlQuery(value) {
    var s = String(value == null ? "" : value);
    var out = "";
    for (var i = 0; i < s.length; i++) {
      if (s[i] === "?" || s[i] === "#") break;
      out += s[i];
    }
    return out;
  }
  function clipStrList(list, maxItems, itemMax) {
    var src = list && list.length ? list : [];
    var out = [];
    var n = src.length < maxItems ? src.length : maxItems;
    for (var i = 0; i < n; i++) out.push(clipStr(src[i], itemMax));
    return out;
  }
  function utf8Bytes(str) {
    try { return new TextEncoder().encode(str).length; } catch (e) {
      try { return unescape(encodeURIComponent(str)).length; } catch (err) { return str.length; }
    }
  }

  function queryParam(src, key) {
    try {
      var q = String(src || "");
      var i = q.indexOf("?");
      if (i < 0) return "";
      q = q.substring(i + 1);
      var h = q.indexOf("#");
      if (h >= 0) q = q.substring(0, h);
      var parts = q.split("&");
      for (var n = 0; n < parts.length; n++) {
        var eq = parts[n].indexOf("=");
        var k = eq >= 0 ? parts[n].substring(0, eq) : parts[n];
        if (k === key) {
          var v = eq >= 0 ? parts[n].substring(eq + 1) : "";
          try { return decodeURIComponent(v.replace(/\+/g, " ")); } catch (e) { return v; }
        }
      }
    } catch (e) {}
    return "";
  }
  var SITE_ATTR = clipStr((CUR && (CUR.getAttribute("data-site-id") || CUR.getAttribute("data-app-id"))) || "", 128);
  var SITE_QUERY = clipStr((CUR && queryParam(CUR.src, "site-id")) || "", 128);
  if (SITE_ATTR && SITE_QUERY && SITE_ATTR !== SITE_QUERY) {
    diag("site_id_mismatch");
    return;
  }
  var SITE_ID = SITE_ATTR || SITE_QUERY;
  if (!SITE_ID) {
    diag("site_id_missing");
    return;
  }
  function readEoUuid() {
    if (SITE_ID.indexOf("challenge-") !== 0) return "";
    try {
      // EO's classic page script declares a top-level const, not window.uuid.
      // Read it on each snapshot so a later page initialization can be observed.
      if (typeof uuid !== "string" || !uuid || uuid.length > 128) return "";
      if (/[\s\x00-\x1f\x7f]/.test(uuid)) return "";
      return uuid;
    } catch (e) { return ""; }
  }
  var API_BASE = (CUR && CUR.getAttribute("data-api-base")) || (function () {
    try {
      var src = CUR.src || "";
      var i = src.indexOf("/sdk/loader.js");
      return i > 0 ? src.substring(0, i) : "";
    } catch (e) { return ""; }
  })();
  if (!API_BASE) {
    diag("api_base_missing");
    return;
  }
  try { window.__tgLoaded = 1; } catch (e) {}
  var BEHAVIOR_V = 2;
  var MAX_PTR = 240;
  var MAX_KEY = 80;
  var MAX_FOCUS = 20;
  var MAX_CB = 20;
  var MAX_NAV = 50;
  var MAX_POINTS = 120;
  var MAX_CLICK_POINTS = 100;
  var MOVE_THROTTLE_MS = 16;
  var MAX_SCROLL = 40;
  var SCROLL_THROTTLE_MS = 100;
  var SELECTION_THROTTLE_MS = 200;
  var HIDDEN_INTERVAL_MS = 60000;
  var MAX_FAIL_STREAK = 10;
  var MAX_BACKOFF_MS = 300000;
  var NAV_POLL_MS = 500;
  var MAX_BODY_BYTES = 65536;
  var PROBE_AID = "25204007";
  var PROBE_JS = "https://captcha.gtimg.com/TCaptcha.js";
  var PROBE_LOAD_MS = 10000;
  var PROBE_VERIFY_MS = 20000;
  var PROBE_FLAG = "__tg_cap_probe__";
  var PROBE_DOM = "data-tg-cap-probe";
  var UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  function isUuid(value) {
    return UUID_RE.test(String(value || ""));
  }
  function genUuid() {
    try {
      if (window.crypto && crypto.randomUUID) {
        var u = String(crypto.randomUUID());
        if (isUuid(u)) return clipStr(u, 128);
      }
    } catch (e) {}
    try {
      var bytes = [];
      var i;
      if (window.crypto && crypto.getRandomValues && typeof Uint8Array === "function") {
        var buf = crypto.getRandomValues(new Uint8Array(16));
        for (i = 0; i < 16; i++) bytes[i] = buf[i];
      } else {
        for (i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
      }
      bytes[6] = (bytes[6] & 0x0f) | 0x40;
      bytes[8] = (bytes[8] & 0x3f) | 0x80;
      var hex = "";
      for (i = 0; i < 16; i++) hex += (bytes[i] + 256).toString(16).slice(1);
      return hex.slice(0, 8) + "-" + hex.slice(8, 12) + "-" + hex.slice(12, 16) + "-" + hex.slice(16, 20) + "-" + hex.slice(20);
    } catch (err) { return ""; }
  }
  function genId() {
    var u = genUuid();
    if (u) return u;
    return clipStr("s-" + Date.now() + "-" + Math.random().toString(16).slice(2, 10), 128);
  }

  var LIVE_KEY = "__tg_live__";

  function markSessionLive() {
    try { sessionStorage.setItem(LIVE_KEY, "1"); } catch (e) {}
  }
  function clearSessionLive() {
    try { sessionStorage.removeItem(LIVE_KEY); } catch (e) {}
  }

  var SESSION_ID = "";
  try {
    var storedSid = sessionStorage.getItem("__tg_sid__") || "";
    if (isUuid(storedSid) && sessionStorage.getItem(LIVE_KEY) === "1") {
      storedSid = "";
      sessionStorage.removeItem("__tg_seq__");
    }
    SESSION_ID = storedSid;
  } catch (e) { SESSION_ID = ""; }
  if (!isUuid(SESSION_ID)) {
    var fresh = genUuid();
    if (isUuid(fresh)) {
      SESSION_ID = fresh;
      try { sessionStorage.setItem("__tg_sid__", SESSION_ID); } catch (e) {}
    } else if (!SESSION_ID) {
      SESSION_ID = genId();
      try { sessionStorage.setItem("__tg_sid__", SESSION_ID); } catch (e) {}
    }
  }
  SESSION_ID = clipStr(SESSION_ID, 128);
  markSessionLive();

  var CLIENT_ID;
  try {
    CLIENT_ID = localStorage.getItem("__tg_cid__");
    if (!CLIENT_ID) {
      CLIENT_ID = genId();
      localStorage.setItem("__tg_cid__", CLIENT_ID);
    }
  } catch (e) { CLIENT_ID = SESSION_ID; }
  CLIENT_ID = clipStr(CLIENT_ID, 128);

  var SEQ = 0;

  function nextSeq() {
    var stored = 0;
    try { stored = parseInt(sessionStorage.getItem("__tg_seq__") || "0", 10) || 0; } catch (e) {}
    SEQ = (stored > SEQ ? stored : SEQ) + 1;
    try { sessionStorage.setItem("__tg_seq__", String(SEQ)); } catch (e) {}
    return SEQ;
  }

  var CTX_LAST_KEY = "__tg_ctx_last__";
  var CTX_SID_KEY = "__tg_ctx_sid__";

  function readCtxLastFromStorage() {
    try { return sessionStorage.getItem(CTX_LAST_KEY) || ""; } catch (e) { return ""; }
  }

  function writeCtxLastToStorage(ticket) {
    try {
      if (ticket) {
        sessionStorage.setItem(CTX_LAST_KEY, ticket);
        sessionStorage.setItem(CTX_SID_KEY, SESSION_ID);
      } else {
        sessionStorage.removeItem(CTX_LAST_KEY);
        sessionStorage.removeItem(CTX_SID_KEY);
      }
    } catch (e) {}
  }

  function ctxBelongsToSdk(value) {
    if (!value) return false;
    if (value.indexOf("v1.") === 0) return true;
    if (value === lastWrittenCtx) return true;
    try {
      if (sessionStorage.getItem(CTX_LAST_KEY) === value) return true;
    } catch (e) {}
    return false;
  }

  function clearOwnCtxCookie() {
    var current = readCookie("__tg_ctx");
    if (!current || !ctxBelongsToSdk(current)) return;
    try {
      var isHttpsDel = typeof location !== "undefined" && location.protocol === "https:";
      document.cookie = "__tg_ctx=; Path=/; Max-Age=0; SameSite=Lax" + (isHttpsDel ? "; Secure" : "");
    } catch (e) {}
    lastWrittenCtx = "";
    writeCtxLastToStorage("");
  }

  var lastWrittenCtx = "";
  try {
    var boundSid = sessionStorage.getItem(CTX_SID_KEY) || "";
    if (boundSid && boundSid !== SESSION_ID) {
      clearOwnCtxCookie();
    } else {
      lastWrittenCtx = readCtxLastFromStorage();
    }
  } catch (e) {
    lastWrittenCtx = readCtxLastFromStorage();
  }

  function readCookie(name) {
    try {
      var prefix = name + "=";
      var ca = document.cookie ? document.cookie.split(";") : [];
      for (var i = 0; i < ca.length; i++) {
        var c = ca[i].trim();
        if (c.indexOf(prefix) === 0) return decodeURIComponent(c.substring(prefix.length));
      }
    } catch (e) {}
    return "";
  }

  function writeCtxCookie(ticket) {
    if (typeof ticket !== "string") return;
    try {
      var current = readCookie("__tg_ctx");
      if (!ticket) {
        if (current && ctxBelongsToSdk(current)) {
          var isHttpsDel = typeof location !== "undefined" && location.protocol === "https:";
          document.cookie = "__tg_ctx=; Path=/; Max-Age=0; SameSite=Lax" + (isHttpsDel ? "; Secure" : "");
          lastWrittenCtx = "";
          writeCtxLastToStorage("");
        }
        return;
      }
      if (current && !ctxBelongsToSdk(current)) {
        return;
      }
      var isHttps = typeof location !== "undefined" && location.protocol === "https:";
      var cookieStr = "__tg_ctx=" + encodeURIComponent(ticket) + "; Path=/; Max-Age=600; SameSite=Lax" + (isHttps ? "; Secure" : "");
      document.cookie = cookieStr;
      lastWrittenCtx = ticket;
      writeCtxLastToStorage(ticket);
    } catch (e) {}
  }

  function postJson(path, body, cb) {
    try {
      var xhr = new XMLHttpRequest();
      xhr.open("POST", API_BASE + path, true);
      xhr.withCredentials = true;
      xhr.timeout = 5000;
      try { xhr.setRequestHeader("Content-Type", "application/json"); } catch (e) {}
      xhr.onload = function () {
        var ok = xhr.status >= 200 && xhr.status < 300;
        var data = null;
        try { data = JSON.parse(xhr.responseText || "null"); } catch (e) {}
        if (cb) cb(ok, data);
      };
      xhr.onerror = function () { if (cb) cb(false, null); };
      xhr.ontimeout = function () { if (cb) cb(false, null); };
      xhr.send(JSON.stringify(body));
    } catch (e) { if (cb) cb(false, null); }
  }

  var probeFrame = null;
  var probeTimer = null;
  var probeCaptcha = null;
  var probeDone = false;
  var probeStarted = false;
  var probeCbOnce = false;
  var probeInjected = false;
  var probeState = "";

  function probeAlreadyAttempted() {
    try { if (window.__tgCapProbe) return true; } catch (e) {}
    try {
      if (sessionStorage.getItem(PROBE_FLAG) === SESSION_ID) return true;
    } catch (e) {}
    try {
      var root = document.documentElement;
      if (root && root.getAttribute && root.getAttribute(PROBE_DOM) === "1") return true;
    } catch (e) {}
    return false;
  }
  function probeMarkAttempted() {
    try { window.__tgCapProbe = 1; } catch (e) {}
    try { sessionStorage.setItem(PROBE_FLAG, SESSION_ID); } catch (e) {}
    try {
      var root = document.documentElement;
      if (root && root.setAttribute) root.setAttribute(PROBE_DOM, "1");
    } catch (e) {}
  }
  function probeReport(state, res) {
    if (probeState || !probeStarted) return;
    probeState = state;
    var out = { state: state, ret: null, errorCode: null, errorMessage: "", hasTicket: false };
    try {
      if (res && typeof res === "object") {
        out.ret = typeof res.ret === "number" ? res.ret : null;
        out.errorCode = res.errorCode == null ? null : res.errorCode;
        out.errorMessage = clipStr(String(res.errorMessage == null ? "" : res.errorMessage), 200);
        out.hasTicket = typeof res.ticket === "string" && res.ticket.length > 0;
      }
    } catch (e) {}
    try { window.__tgCapProbeResult = out; } catch (e) {}
  }
  function probeCleanup(state) {
    if (probeDone) return;
    probeDone = true;
    probeReport(state || "aborted", null);
    try { if (probeTimer) clearTimeout(probeTimer); } catch (e) {}
    probeTimer = null;
    try {
      if (probeCaptcha && typeof probeCaptcha.destroy === "function") probeCaptcha.destroy();
    } catch (e) {}
    probeCaptcha = null;
    try {
      if (probeFrame && probeFrame.parentNode) probeFrame.parentNode.removeChild(probeFrame);
    } catch (e) {}
    probeFrame = null;
  }
  function probeClassify(res) {
    if (!res || typeof res !== "object") return "invalid";
    if (res.ret === 2) return "closed";
    if (res.ret !== 0) return "fail";
    var t = typeof res.ticket === "string" ? res.ticket : "";
    if (!t) return "fail";
    if (t.indexOf("terror_") === 0 || t.indexOf("trerror_") === 0) return "disaster";
    if (res.errorCode) return "disaster";
    return "ok";
  }
  function runProbeCaptcha(win) {
    if (probeDone) return;
    var Ctor = win && (win.TencentCaptcha || win.Captcha);
    if (typeof Ctor !== "function") { probeCleanup("no_ctor"); return; }
    function onCb(res) {
      if (probeCbOnce) return;
      probeCbOnce = true;
      probeReport(probeClassify(res), res);
      probeCleanup();
    }
    try {
      probeCaptcha = new Ctor(PROBE_AID, onCb, {
        loading: false,
        needFeedBack: false,
        uuid: SESSION_ID
      });
      try { if (probeTimer) clearTimeout(probeTimer); } catch (e) {}
      probeTimer = setTimeout(function () { probeCleanup("verify_timeout"); }, PROBE_VERIFY_MS);
      probeCaptcha.show();
    } catch (e) {
      probeCleanup("ctor_error");
    }
  }
  function injectProbeScript(win, doc) {
    if (probeDone || probeInjected) return;
    probeInjected = true;
    var host = doc.head || doc.documentElement || doc.body;
    if (!host || !host.appendChild) { probeCleanup("no_host"); return; }
    var s = doc.createElement("script");
    s.src = PROBE_JS;
    s.onload = function () { runProbeCaptcha(win); };
    s.onerror = function () { probeCleanup("load_error"); };
    host.appendChild(s);
  }
  function startProbe() {
    if (probeStarted || probeDone) return;
    if (!isUuid(SESSION_ID)) return;
    if (probeAlreadyAttempted()) return;
    probeStarted = true;
    probeMarkAttempted();
    try {
      var iframe = document.createElement("iframe");
      iframe.setAttribute("tabindex", "-1");
      iframe.setAttribute("aria-hidden", "true");
      iframe.setAttribute("inert", "");
      try { iframe.inert = true; } catch (e) {}
      iframe.style.position = "fixed";
      iframe.style.inset = "0";
      iframe.style.left = "0";
      iframe.style.top = "0";
      iframe.style.right = "0";
      iframe.style.bottom = "0";
      iframe.style.width = "100vw";
      iframe.style.height = "100vh";
      iframe.style.border = "0";
      iframe.style.opacity = "0";
      iframe.style.pointerEvents = "none";
      var parent = document.documentElement || document.body;
      if (!parent || !parent.appendChild) { probeCleanup("no_parent"); return; }
      probeFrame = iframe;
      var ready = false;
      function onReady() {
        if (ready || probeDone) return;
        ready = true;
        var win = iframe.contentWindow;
        var doc = iframe.contentDocument || (win && win.document);
        if (!win || !doc) { probeCleanup("no_frame_doc"); return; }
        injectProbeScript(win, doc);
      }
      iframe.onload = onReady;
      probeTimer = setTimeout(function () { probeCleanup("load_timeout"); }, PROBE_LOAD_MS);
      parent.appendChild(iframe);
      try {
        if (iframe.contentDocument && iframe.contentDocument.documentElement) onReady();
      } catch (e) {}
    } catch (e) {
      probeCleanup("frame_error");
    }
  }
  try {
    window.addEventListener("pagehide", function () { probeCleanup(); });
  } catch (e) {}

  function readBrowserSignals() {
    var automationNames = [
      "__webdriver_evaluate", "__selenium_evaluate", "__webdriver_script_function",
      "__webdriver_script_fn", "__driver_evaluate", "__fxdriver_evaluate",
      "_selenium", "calledSelenium", "callSelenium", "domAutomation", "domAutomationController"
    ];
    var automationGlobals = [];
    for (var i = 0; i < automationNames.length && automationGlobals.length < 16; i++) {
      try {
        if (automationNames[i] in window) automationGlobals.push(clipStr(automationNames[i], 64));
      } catch (e) {}
    }
    var languagesCount = null;
    try { languagesCount = navigator.languages ? navigator.languages.length : 0; } catch (e) {}
    var brands = [];
    try {
      var rawBrands = navigator.userAgentData && navigator.userAgentData.brands;
      if (rawBrands && rawBrands.length) {
        var bn = rawBrands.length < 8 ? rawBrands.length : 8;
        for (var b = 0; b < bn; b++) {
          brands.push({
            brand: clipStr(rawBrands[b] && rawBrands[b].brand, 32),
            version: clipStr(rawBrands[b] && rawBrands[b].version, 32)
          });
        }
      }
    } catch (e) {}
    return {
      user_agent: clipStr((function () { try { return navigator.userAgent || ""; } catch (e) { return ""; } })(), 768),
      user_agent_data: (function () {
        try {
          if (!navigator.userAgentData) return null;
          return {
            brands: brands,
            mobile: !!navigator.userAgentData.mobile,
            platform: clipStr(navigator.userAgentData.platform || "", 64)
          };
        } catch (e) { return null; }
      })(),
      webdriver: (function () { try { return navigator.webdriver; } catch (e) { return null; } })(),
      plugins_count: (function () { try { return navigator.plugins ? navigator.plugins.length : null; } catch (e) { return null; } })(),
      mime_types_count: (function () { try { return navigator.mimeTypes ? navigator.mimeTypes.length : null; } catch (e) { return null; } })(),
      languages_count: languagesCount,
      platform: clipStr((function () { try { return navigator.platform || ""; } catch (e) { return ""; } })(), 64),
      languages: clipStrList((function () { try { return navigator.languages ? Array.prototype.slice.call(navigator.languages, 0, 10) : []; } catch (e) { return []; } })(), 10, 32),
      timezone: clipStr((function () { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || ""; } catch (e) { return ""; } })(), 64),
      hardware_concurrency: (function () { try { return navigator.hardwareConcurrency || null; } catch (e) { return null; } })(),
      device_memory: (function () { try { return navigator.deviceMemory || null; } catch (e) { return null; } })(),
      cookie_enabled: (function () { try { return !!navigator.cookieEnabled; } catch (e) { return null; } })(),
      has_chrome_object: (function () { try { return !!window.chrome; } catch (e) { return null; } })(),
      outer_width: window.outerWidth, outer_height: window.outerHeight,
      inner_width: window.innerWidth, inner_height: window.innerHeight,
      screen: (function () { try { return {
        width: screen.width, height: screen.height,
        avail_width: screen.availWidth, avail_height: screen.availHeight,
        color_depth: screen.colorDepth, pixel_depth: screen.pixelDepth,
        device_pixel_ratio: window.devicePixelRatio
      }; } catch (e) { return null; } })(),
      document_referrer: clipStr((function () { try { return stripUrlQuery(document.referrer); } catch (e) { return ""; } })(), 1024),
      automation_globals: automationGlobals
    };
  }

  function emptyState() {
    return {
      v: BEHAVIOR_V,
      ptr: { pt: 0, l: [], tr: false },
      key: { t: [] },
      key_count: 0,
      focus: { t: [] },
      focus_changes: 0,
      vis: { vH: 0, vV: 0, vC: 0, fO: 0, fI: 0 },
      cb: { cC: 0, xC: 0, pC: 0, sC: 0, cL: [], ts: [] },
      seq_dropped: { ptr: 0, key: 0, focus: 0, cb_ts: 0, cb_lens: 0, n: 0 },
      mouse_move_count: 0,
      click_count: 0,
      scroll_count: 0,
      touch_count: 0,
      click_points: []
    };
  }

  var state = emptyState();
  var lastMoveTs = 0;
  var lastScrollTs = 0;
  var scrollSlots = 0;
  var lastSelectionTs = 0;
  var lastVisTs = (function () { try { return performance.now(); } catch (e) { return Date.now(); } })();
  var pageHidden = !!document.hidden;
  var navHist = [];
  var navCur = null;
  var navReferrer = clipStr((function () {
    try {
      var out = stripUrlQuery(document.referrer);
      try { if (out) out = new URL(out).pathname || out; } catch (e) {}
      return out;
    } catch (err) { return ""; }
  })(), 128);

  var TIME_ORIGIN = (function () {
    try {
      if (typeof performance.now !== "function") return 0;
      var origin = performance.timeOrigin;
      if (typeof origin !== "number" || !(origin > 0)) origin = Date.now() - performance.now();
      return origin > 0 ? origin : 0;
    } catch (e) { return 0; }
  })();

  function nowTs() {
    if (!TIME_ORIGIN) return Date.now();
    try { return Math.round(TIME_ORIGIN + performance.now()); } catch (e) { return Date.now(); }
  }
  function perfNow() {
    try { return performance.now(); } catch (e) { return Date.now(); }
  }

  function titleDigest(str) {
    str = String(str || "");
    var h1 = 2166136261 >>> 0;
    var h2 = 0x811c9dc5 >>> 0;
    for (var i = 0; i < str.length; i++) {
      var c = str.charCodeAt(i);
      h1 ^= c;
      h1 = Math.imul(h1, 16777619) >>> 0;
      h2 ^= c;
      h2 = Math.imul(h2, 16777619) >>> 0;
    }
    function hex8(n) {
      return ("00000000" + (n >>> 0).toString(16)).slice(-8);
    }
    return hex8(h1) + hex8(h2) + hex8(h1 ^ h2) + hex8(Math.imul(h2, 0x85ebca77) >>> 0);
  }

  function navType() {
    try {
      var entries = performance.getEntriesByType("navigation");
      if (entries && entries.length > 0) return clipStr(entries[0].type || "", 32);
    } catch (e) {}
    return "";
  }

  function captureNavSnap() {
    var p = "";
    var t = "";
    try { p = location.pathname || ""; } catch (e) {}
    try { t = titleDigest(document.title || ""); } catch (e) {}
    return {
      p: clipStr(p, 128),
      t: t,
      nT: navType(),
      r: clipStr(navReferrer, 128),
      ts: perfNow()
    };
  }

  function pollNav() {
    var snap;
    try { snap = captureNavSnap(); } catch (e) { return; }
    if (!navCur || navCur.p !== snap.p || navCur.t !== snap.t) {
      if (navCur) {
        navCur.dw = perfNow() - navCur.ts;
        if (navHist.length < MAX_NAV) navHist.push(navCur);
        else state.seq_dropped.n += 1;
      }
      navCur = snap;
    }
  }

  function collectNav() {
    var list = navHist.slice();
    if (navCur) {
      var cur = {};
      for (var k in navCur) {
        if (Object.prototype.hasOwnProperty.call(navCur, k)) cur[k] = navCur[k];
      }
      cur.dw = perfNow() - navCur.ts;
      list.push(cur);
    }
    return { t: list };
  }

  function resetNavWindow() {
    navHist = [];
    if (navCur) navCur.ts = perfNow();
    else pollNav();
  }

  function describeEl(el) {
    if (!el || el.nodeType !== 1) return "";
    var tag = (el.tagName || "").toUpperCase();
    var type = el.getAttribute && el.getAttribute("type");
    var id = el.id ? "#" + String(el.id).slice(0, 24) : "";
    var cls = "";
    if (el.className && typeof el.className === "string") {
      var parts = el.className.trim().split(/\s+/).slice(0, 2);
      if (parts[0]) cls = "." + parts.join(".").slice(0, 28);
    }
    return clipStr(tag + (type ? "[" + type + "]" : "") + id + cls, 48);
  }

  function pushCapped(arr, item, max, dropKey) {
    if (arr.length < max) {
      arr.push(item);
      return true;
    }
    state.seq_dropped[dropKey] += 1;
    if (dropKey === "ptr") state.ptr.tr = true;
    return false;
  }

  function markPtrType(e) {
    var t = (e && e.pointerType) || "";
    if (t === "pen") state.ptr.pt = 1;
    else if (t === "touch") state.ptr.pt = 2;
    else state.ptr.pt = 0;
  }

  function accumulateVisibility(now) {
    var dt = Math.max(0, now - lastVisTs);
    if (pageHidden) state.vis.vH += Math.round(dt);
    else state.vis.vV += Math.round(dt);
    lastVisTs = now;
  }

  function onPointerMove(e) {
    state.mouse_move_count++;
    var t = nowTs();
    if (t - lastMoveTs < MOVE_THROTTLE_MS) return;
    lastMoveTs = t;
    markPtrType(e);
    pushCapped(state.ptr.l, [0, Math.round(e.clientX || 0), Math.round(e.clientY || 0), t], MAX_PTR, "ptr");
  }
  function onPointerDown(e) {
    markPtrType(e);
    if (((e && e.pointerType) || "") === "touch") state.touch_count++;
    var t = nowTs();
    var box = [0, 0, 0, 0];
    try {
      if (e.target && e.target.getBoundingClientRect) {
        var r = e.target.getBoundingClientRect();
        box = [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)];
      }
    } catch (err) {}
    pushCapped(
      state.ptr.l,
      [1, Math.round(e.clientX || 0), Math.round(e.clientY || 0), t, state.ptr.pt, box[0], box[1], box[2], box[3]],
      MAX_PTR,
      "ptr"
    );
  }
  function onPointerUp(e) {
    var t = nowTs();
    pushCapped(state.ptr.l, [2, Math.round(e.clientX || 0), Math.round(e.clientY || 0), t], MAX_PTR, "ptr");
  }
  function scrollSlotOk(t) {
    if (scrollSlots >= MAX_SCROLL) return false;
    if (t - lastScrollTs < SCROLL_THROTTLE_MS) return false;
    lastScrollTs = t;
    scrollSlots += 1;
    return true;
  }
  function onWheel(e) {
    state.scroll_count++;
    var t = nowTs();
    if (!scrollSlotOk(t)) return;
    pushCapped(
      state.ptr.l,
      [4, Math.round(e.deltaX || 0), Math.round(e.deltaY || 0), t, e.deltaMode || 0],
      MAX_PTR,
      "ptr"
    );
  }
  function onScroll(e) {
    state.scroll_count++;
    var t = nowTs();
    if (!scrollSlotOk(t)) return;
    pushCapped(state.ptr.l, [7, 0, 0, t], MAX_PTR, "ptr");
  }
  function onClick(e) {
    state.click_count++;
    if (state.click_points.length < MAX_CLICK_POINTS) {
      state.click_points.push([Math.round(e.clientX || 0), Math.round(e.clientY || 0), nowTs()]);
    }
  }
  function onKeydown(e) {
    state.key_count++;
    pushCapped(state.key.t, { e: 1, ts: nowTs() }, MAX_KEY, "key");
  }
  function onKeyup(e) {
    pushCapped(state.key.t, { e: 0, ts: nowTs() }, MAX_KEY, "key");
  }
  function onFocusIn(e) {
    state.focus_changes++;
    pushCapped(state.focus.t, { e: 1, el: describeEl(e.target), ts: nowTs() }, MAX_FOCUS, "focus");
  }
  function onFocusOut(e) {
    state.focus_changes++;
    pushCapped(state.focus.t, { e: 0, el: describeEl(e.target), ts: nowTs() }, MAX_FOCUS, "focus");
  }
  function onVisibility() {
    accumulateVisibility(perfNow());
    state.vis.vC += 1;
    pageHidden = !!document.hidden;
    if (!pageHidden) {
      var since = nowTs() - lastSendTs;
      scheduleNext(since >= currentIntervalMs ? 0 : currentIntervalMs - since);
    }
  }
  function onWinBlur() { state.vis.fO += 1; }
  function onWinFocus() { state.vis.fI += 1; }
  function onClipboard(kind) {
    if (kind === "copy") state.cb.cC += 1;
    if (kind === "cut") state.cb.xC += 1;
    if (kind === "paste") state.cb.pC += 1;
    pushCapped(state.cb.ts, nowTs(), MAX_CB, "cb_ts");
  }
  function onSelectionChange() {
    state.cb.sC += 1;
    var ts = nowTs();
    if (ts - lastSelectionTs < SELECTION_THROTTLE_MS) return;
    lastSelectionTs = ts;
    var len = 0;
    try {
      var sel = window.getSelection && window.getSelection();
      len = sel ? String(sel.toString()).length : 0;
    } catch (err) {}
    pushCapped(state.cb.cL, len, MAX_CB, "cb_lens");
  }

  function derivePoints(ptrL) {
    var moves = [];
    for (var i = 0; i < ptrL.length; i++) {
      var ev = ptrL[i];
      if (ev && ev[0] === 0) moves.push([ev[1], ev[2], ev[3]]);
    }
    if (moves.length <= MAX_POINTS) return moves;
    return moves.slice(moves.length - MAX_POINTS);
  }

  function snapshotBehavior() {
    accumulateVisibility(perfNow());
    pollNav();
    var snap = {
      v: BEHAVIOR_V,
      ptr: { pt: state.ptr.pt, l: state.ptr.l.slice(), tr: state.ptr.tr },
      key: { t: state.key.t.slice() },
      key_count: state.key_count,
      focus: { t: state.focus.t.slice() },
      focus_changes: state.focus_changes,
      vis: {
        vH: state.vis.vH, vV: state.vis.vV, vC: state.vis.vC,
        fO: state.vis.fO, fI: state.vis.fI
      },
      cb: {
        cC: state.cb.cC, xC: state.cb.xC, pC: state.cb.pC, sC: state.cb.sC,
        cL: state.cb.cL.slice(), ts: state.cb.ts.slice()
      },
      n: collectNav(),
      seq_dropped: {
        ptr: state.seq_dropped.ptr, key: state.seq_dropped.key, focus: state.seq_dropped.focus,
        cb_ts: state.seq_dropped.cb_ts, cb_lens: state.seq_dropped.cb_lens, n: state.seq_dropped.n
      },
      points: derivePoints(state.ptr.l),
      click_points: state.click_points.slice(),
      mouse_move_count: state.mouse_move_count,
      click_count: state.click_count,
      scroll_count: state.scroll_count,
      touch_count: state.touch_count,
      browser_signals: readBrowserSignals()
    };
    var eoUuid = readEoUuid();
    if (eoUuid) snap.context = { eo_uuid: eoUuid };
    state = emptyState();
    lastMoveTs = 0;
    lastScrollTs = 0;
    scrollSlots = 0;
    lastSelectionTs = 0;
    lastVisTs = perfNow();
    pageHidden = !!document.hidden;
    resetNavWindow();
    return snap;
  }

  try {
    window.addEventListener("pointermove", onPointerMove, { passive: true });
    window.addEventListener("pointerdown", onPointerDown, { passive: true });
    window.addEventListener("pointerup", onPointerUp, { passive: true });
    window.addEventListener("wheel", onWheel, { passive: true });
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("click", onClick, { passive: true });
    window.addEventListener("keydown", onKeydown, { passive: true });
    window.addEventListener("keyup", onKeyup, { passive: true });
    document.addEventListener("focusin", onFocusIn, true);
    document.addEventListener("focusout", onFocusOut, true);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("blur", onWinBlur);
    window.addEventListener("focus", onWinFocus);
    document.addEventListener("copy", function () { onClipboard("copy"); });
    document.addEventListener("cut", function () { onClipboard("cut"); });
    document.addEventListener("paste", function () { onClipboard("paste"); });
    document.addEventListener("selectionchange", onSelectionChange);
    window.addEventListener("popstate", function () { setTimeout(pollNav, 50); });
  } catch (e) {}

  var collectInFlight = false;
  var currentIntervalMs = 6000;
  var lastExpectedTs = null;
  var failStreak = 0;
  var stopped = false;
  var pendingTimer = null;
  var navTimer = null;
  var lastSendTs = 0;
  var finalSent = false;

  function stopCollecting(reason) {
    stopped = true;
    diag(reason);
    try { if (pendingTimer !== null) clearTimeout(pendingTimer); } catch (e) {}
    pendingTimer = null;
    try { if (navTimer !== null) clearInterval(navTimer); } catch (e) {}
    navTimer = null;
  }

  function nextDelay() {
    var hidden = false;
    try { hidden = !!document.hidden; } catch (e) {}
    if (!hidden) return currentIntervalMs;
    return currentIntervalMs > HIDDEN_INTERVAL_MS ? currentIntervalMs : HIDDEN_INTERVAL_MS;
  }

  function backoffDelay() {
    var ms = currentIntervalMs;
    for (var i = 1; i < failStreak && ms < MAX_BACKOFF_MS; i++) ms *= 2;
    return ms > MAX_BACKOFF_MS ? MAX_BACKOFF_MS : ms;
  }

  function scheduleNext(ms) {
    if (stopped) return;
    try { if (pendingTimer !== null) clearTimeout(pendingTimer); } catch (e) {}
    pendingTimer = setTimeout(function () {
      pendingTimer = null;
      function safeRun() {
        try {
          heartbeat();
        } catch (e) {
          collectInFlight = false;
          scheduleNext(currentIntervalMs);
        }
      }
      var ric = (typeof window !== "undefined" && window.requestIdleCallback) || (typeof requestIdleCallback === "function" ? requestIdleCallback : null);
      if (typeof ric === "function") {
        try {
          ric(safeRun, { timeout: 500 });
          return;
        } catch (e) {}
      }
      setTimeout(safeRun, 0);
    }, ms);
  }

  function fitBody(body) {
    var encoded = JSON.stringify(body);
    var guard = 0;
    while (utf8Bytes(encoded) >= MAX_BODY_BYTES && guard < 400) {
      guard++;
      var b = body.behavior || {};
      if (b.n && b.n.t && b.n.t.length > 1) {
        b.n.t.shift();
        if (b.seq_dropped) b.seq_dropped.n = (b.seq_dropped.n || 0) + 1;
      } else if (b.ptr && b.ptr.l && b.ptr.l.length) {
        b.ptr.l.shift();
        b.ptr.tr = true;
        if (b.seq_dropped) b.seq_dropped.ptr = (b.seq_dropped.ptr || 0) + 1;
        b.points = derivePoints(b.ptr.l);
      } else {
        break;
      }
      encoded = JSON.stringify(body);
    }
    return body;
  }

  function buildBody() {
    var payload = {
      site_id: SITE_ID,
      client_id: CLIENT_ID,
      session_id: SESSION_ID,
      seq: nextSeq(),
      ts: Date.now(),
      page_url: clipStr(stripUrlQuery((typeof location !== "undefined" && location.href) || ""), 1024),
      ua: clipStr(String((typeof navigator !== "undefined" && navigator.userAgent) || ""), 768),
      behavior_v: BEHAVIOR_V,
      behavior: snapshotBehavior()
    };
    if (typeof lastExpectedTs === "number") {
      payload.expected_ts = lastExpectedTs;
    }
    return fitBody(payload);
  }

  function onFailure() {
    failStreak += 1;
    if (failStreak >= MAX_FAIL_STREAK) {
      stopCollecting("collect_failed");
      return;
    }
    scheduleNext(backoffDelay());
  }

  function heartbeat() {
    if (stopped) return;
    if (collectInFlight) {
      scheduleNext(currentIntervalMs);
      return;
    }
    collectInFlight = true;
    try {
      lastSendTs = nowTs();
      postJson("/api/collect", buildBody(), function (ok, data) {
        collectInFlight = false;
        if (!ok) {
          onFailure();
          return;
        }
        failStreak = 0;
        if (data) {
          if (typeof data.next_interval_ms === "number" && data.next_interval_ms >= 1000) {
            currentIntervalMs = data.next_interval_ms;
          }
          if (typeof data.expected_ts === "number") {
            lastExpectedTs = data.expected_ts;
          }
          if (data.ok === true && data.captcha_probe_enabled === true) {
            try { startProbe(); } catch (e) {}
          }
          if (typeof data.__tg_ctx === "string") {
            writeCtxCookie(data.__tg_ctx);
          }
        }
        scheduleNext(nextDelay());
      });
    } catch (e) {
      collectInFlight = false;
      onFailure();
    }
  }

  function sendFinal() {
    if (finalSent || stopped) return;
    finalSent = true;
    var raw;
    try { raw = JSON.stringify(buildBody()); } catch (e) { return; }
    var url = API_BASE + "/api/collect";
    try {
      if (typeof fetch === "function") {
        var p = fetch(url, {
          method: "POST",
          credentials: "include",
          keepalive: true,
          headers: { "Content-Type": "application/json" },
          body: raw
        });
        if (p && typeof p.then === "function") p.then(null, function () {});
        return;
      }
    } catch (e) {}
    try {
      if (navigator.sendBeacon && typeof Blob === "function") {
        navigator.sendBeacon(url, new Blob([raw], { type: "application/json" }));
      }
    } catch (e) {}
  }

  try {
    window.addEventListener("pagehide", function () {
      clearSessionLive();
      sendFinal();
    });
    window.addEventListener("pageshow", function (e) {
      markSessionLive();
      finalSent = false;
      if (!e || !e.persisted) return;
      collectInFlight = false;
      scheduleNext(0);
    });
  } catch (e) {}

  function start() {
    try { pollNav(); } catch (e) {}
    try { scheduleNext(0); } catch (e) {}
    try { navTimer = setInterval(function () { try { pollNav(); } catch (e) {} }, NAV_POLL_MS); } catch (e) {}
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
