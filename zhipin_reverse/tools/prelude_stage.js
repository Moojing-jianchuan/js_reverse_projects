// 两路（浏览器 / jsdom）共用的 prelude：确定性随机 + 阶段日志 + API 调用序列
(() => {
  // 1) 确定性 Math.random（mulberry32, 固定种子）
  var __s = 12345 >>> 0;
  Math.random = function () {
    __s |= 0; __s = (__s + 0x6D2B79F5) | 0;
    var t = Math.imul(__s ^ (__s >>> 15), 1 | __s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  function d(v) {
    try {
      if (v === null) return 'null';
      if (v === undefined) return 'undefined';
      var t = typeof v;
      if (t === 'number' || t === 'boolean') return t + ':' + String(v);
      if (t === 'string') return 's:' + v.length + ':' + v.slice(0, 32);
      if (Array.isArray(v)) return 'a:' + v.length + ':' + JSON.stringify(v.slice(0, 8));
      if (t === 'function') return 'fn';
      return 'o:' + Object.keys(v).slice(0, 6).join(',');
    } catch (e) { return 'err'; }
  }
  window.__d = d;

  // 2) 阶段日志（供 169 点插桩调用）
  window.__stageLog = [];
  window.__bigArrays = {};
  window.__trace = function (p, args, ret) {
    try {
      if (window.__stageLog.length >= 5000) return;
      window.__stageLog.push({ p: p, a: Array.prototype.map.call(args, d), r: d(ret) });
      // 大数组核对用：只保留前 4000 项，避免日志膨胀
      if (ret && typeof ret === 'object' && typeof ret.length === 'number' && ret.length > 500) {
        try {
          window.__bigArrays[p] = Array.prototype.slice.call(ret, 0, 4000);
          if (window.__captureStacks) window.__bigStacks[p] = String(new Error().stack).slice(0, 700);
        } catch (e) {}
      }
    } catch (e) {}
  };

  // 3) API 调用序列（用于定位两路第一个不同的调用）；s = 调用发生时的阶段序号
  window.__apiLog = [];
  window.__api = function (name, args, ret) {
    try {
      if (window.__apiLog.length >= 3000) return;
      window.__apiLog.push({
        n: name,
        s: (window.__stageLog || []).length,
        a: Array.prototype.map.call(args, d),
        r: d(ret),
      });
    } catch (e) {}
  };
  window.__wrap = function (obj, key, name) {
    try {
      var orig = obj && obj[key];
      if (typeof orig !== 'function') return;
      obj[key] = function () {
        var ret;
        try { ret = orig.apply(this, arguments); } finally { /* 记录已执行 */ }
        window.__api(name || key, arguments, ret);
        return ret;
      };
      // 保留原生 toString 外观
      try { Object.defineProperty(obj[key], 'name', { value: orig.name }); } catch (e) {}
    } catch (e) {}
  };

  // 3.5 属性读探针（可选）：记录 stage 期间读了哪些环境属性
  window.__readLog = [];
  if (window.__PROBE_READS) {
  window.__watch = function (obj, names, prefix) {
    for (const name of names) {
      try {
        const desc = Object.getOwnPropertyDescriptor(obj, name);
        let val;
        if (desc && desc.get) {
          val = desc.get.call(obj);
        } else if (desc && 'value' in desc) {
          val = desc.value;
        } else {
          val = obj[name];
        }
        Object.defineProperty(obj, name, {
          get: function () {
            try {
              if (window.__readLog.length < 4000) {
                window.__readLog.push({
                  k: (prefix || '') + name,
                  s: (window.__stageLog || []).length,
                  v: d(val),
                });
              }
            } catch (e) {}
            return val;
          },
          set: function (v) { val = v; },
          configurable: true,
          enumerable: false,
        });
      } catch (e) {}
    }
  };
  window.__watch(navigator, ['userAgent', 'platform', 'language', 'languages', 'hardwareConcurrency',
    'maxTouchPoints', 'webdriver', 'cookieEnabled', 'doNotTrack', 'pdfViewerEnabled', 'deviceMemory',
    'vendor', 'productSub', 'appVersion', 'appName', 'product', 'oscpu', 'buildID'], 'nav.');
  window.__watch(screen, ['width', 'height', 'availWidth', 'availHeight', 'colorDepth', 'pixelDepth'], 'screen.');
  window.__watch(window, ['innerWidth', 'innerHeight', 'outerWidth', 'outerHeight', 'screenX', 'screenY',
    'devicePixelRatio', 'scrollX', 'scrollY'], 'win.');
  window.__watch(window, ['chrome'], 'win.');
  // document / storage / performance / 插件表
  window.__watch(document, ['cookie', 'readyState', 'domain', 'title', 'referrer', 'characterSet',
    'compatMode', 'hidden', 'visibilityState', 'designMode', 'contentType'], 'doc.');
  window.__watch(navigator.plugins, ['length'], 'plugins.');
  window.__watch(navigator.mimeTypes, ['length'], 'mimeTypes.');
  window.__watch(localStorage, ['length'], 'local.');
  window.__watch(sessionStorage, ['length'], 'session.');
  window.__wrap(localStorage, 'getItem', 'local.getItem');
  window.__wrap(localStorage, 'setItem', 'local.setItem');
  window.__wrap(sessionStorage, 'getItem', 'session.getItem');
  window.__wrap(performance, 'now', 'perf.now');
  window.__wrap(Date, 'now', 'Date.now');
  window.__wrap(document, 'hasFocus', 'doc.hasFocus');
  // 原型 getter 探针：SDK 若走 Navigator.prototype 取值也能被记录
  (function () {
    const NP = Object.getPrototypeOf(navigator);
    const names = ['plugins', 'mimeTypes', 'userAgent', 'platform', 'hardwareConcurrency',
      'maxTouchPoints', 'webdriver', 'language', 'languages'];
    for (const name of names) {
      try {
        const d = Object.getOwnPropertyDescriptor(NP, name);
        if (!d || !d.get) continue;
        Object.defineProperty(NP, name, {
          get: function () {
            let v;
            try { v = d.get.call(this); } catch (e) { v = undefined; }
            try {
              if (window.__readLog.length < 4000) {
                window.__readLog.push({ k: 'proto.' + name, s: (window.__stageLog || []).length, v: d0(v) });
              }
            } catch (e) {}
            return v;
          },
          configurable: true,
        });
      } catch (e) {}
    }
    function d0(v) { return window.__d ? window.__d(v) : String(v); }
  })();
  }
  // 探针默认关闭：定义自有 getter 会改变属性枚举，扰动 token；需要时先设 window.__PROBE_READS = true

  window.__wrap(window, 'getComputedStyle', 'getComputedStyle');
  window.__wrap(window, 'matchMedia', 'matchMedia');
  // 4) 环境快照（SDK 打分用的环境项，逐项对比两路）
  window.__envSnap = (function () {
    const s = {};
    const put = (k, fn) => { try { s[k] = fn(); } catch (e) { s[k] = 'ERR'; } };
    const nav = navigator;
    put('ua', () => nav.userAgent);
    put('platform', () => nav.platform);
    put('language', () => nav.language);
    put('languages', () => (nav.languages || []).join(','));
    put('hardwareConcurrency', () => nav.hardwareConcurrency);
    put('maxTouchPoints', () => nav.maxTouchPoints);
    put('webdriver', () => nav.webdriver);
    put('cookieEnabled', () => nav.cookieEnabled);
    put('doNotTrack', () => nav.doNotTrack);
    put('pdfViewerEnabled', () => nav.pdfViewerEnabled);
    put('deviceMemory', () => nav.deviceMemory);
    put('vendor', () => nav.vendor);
    put('productSub', () => nav.productSub);
    put('appVersion', () => nav.appVersion);
    put('appName', () => nav.appName);
    put('product', () => nav.product);
    put('oscpu', () => nav.oscpu);
    put('buildID', () => nav.buildID);
    put('plugins.length', () => nav.plugins.length);
    put('plugins.names', () => Array.from(nav.plugins).map((p) => p.name).join('|'));
    put('mimeTypes.length', () => nav.mimeTypes.length);
    put('userAgentData', () => (nav.userAgentData ? JSON.stringify(nav.userAgentData.brands) : 'none'));
    put('connection', () => (nav.connection ? nav.connection.effectiveType : 'none'));
    put('screen', () => [screen.width, screen.height, screen.availWidth, screen.availHeight, screen.colorDepth, screen.pixelDepth].join('x'));
    put('window', () => [innerWidth, innerHeight, outerWidth, outerHeight, screenX, screenY, devicePixelRatio].join('x'));
    put('chrome', () => typeof window.chrome);
    put('Notification', () => (window.Notification ? window.Notification.permission : 'none'));
    put('AudioContext', () => typeof window.AudioContext);
    put('RTCPeerConnection', () => typeof window.RTCPeerConnection);
    put('WebGLRenderingContext', () => typeof window.WebGLRenderingContext);
    put('doc.hasFocus', () => document.hasFocus());
    put('doc.readyState', () => document.readyState);
    put('doc.visibilityState', () => document.visibilityState);
    put('doc.hidden', () => document.hidden);
    put('doc.characterSet', () => document.characterSet);
    put('doc.compatMode', () => document.compatMode);
    put('doc.referrer', () => document.referrer);
    put('doc.title', () => document.title);
    put('doc.domain', () => document.domain);
    put('doc.cookie', () => document.cookie.length);
    put('body.offsetHeight', () => document.body ? document.body.offsetHeight : -1);
    put('body.clientHeight', () => document.body ? document.body.clientHeight : -1);
    put('localStorage.length', () => localStorage.length);
    put('sessionStorage.length', () => sessionStorage.length);
    put('isSecureContext', () => window.isSecureContext);
    put('CSS2Properties', () => typeof window.CSS2Properties);
    put('fn.toString', () => document.createElement.toString());
    put('toStringTag.doc', () => Object.prototype.toString.call(document));
    put('perf.timing', () => (performance.timing ? Object.keys(performance.timing).length : -1));
    return s;
  })();
  if (window.CanvasRenderingContext2D) {
    window.__wrap(window.CanvasRenderingContext2D.prototype, 'fillText', 'ctx.fillText');
    window.__wrap(window.CanvasRenderingContext2D.prototype, 'measureText', 'ctx.measureText');
  }
  // toDataURL：记录返回值，供采集真实 canvas 指纹
  try {
    var __origDataUrl = window.HTMLCanvasElement.prototype.toDataURL;
    window.HTMLCanvasElement.prototype.toDataURL = function () {
      var ret = __origDataUrl.apply(this, arguments);
      window.__api('canvas.toDataURL', arguments, ret);
      window.__lastCanvas = ret;
      return ret;
    };
  } catch (e) {}
  // getContext：同时把返回的 gl 实例方法也包上（jsdom 的假 webgl 是自有属性，原型包装无效）
  try {
    var __origGetContext = window.HTMLCanvasElement.prototype.getContext;
    window.HTMLCanvasElement.prototype.getContext = function () {
      var ret = __origGetContext.apply(this, arguments);
      window.__api('canvas.getContext', arguments, ret);
      if (ret && !ret.__wrapped) {
        try { window.__wrap(ret, 'getParameter', 'gl.getParameter'); } catch (e) {}
        try { window.__wrap(ret, 'getExtension', 'gl.getExtension'); } catch (e) {}
        try { Object.defineProperty(ret, '__wrapped', { value: true }); } catch (e) {}
      }
      return ret;
    };
  } catch (e) {}
  if (window.WebGLRenderingContext) {
    var glProto = window.WebGLRenderingContext.prototype;
    window.__wrap(glProto, 'getParameter', 'gl.getParameter');
    window.__wrap(glProto, 'getExtension', 'gl.getExtension');
  }
  if (window.AudioContext) window.__wrap(window, 'AudioContext', 'new AudioContext');
  if (window.OfflineAudioContext) window.__wrap(window, 'OfflineAudioContext', 'new OfflineAudioContext');
})();
