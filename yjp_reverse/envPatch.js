// jsdom 环境补丁 — 基于浏览器 trace diff 精准对齐
// 使用: patchEnvironment(win, doc, nav) 在 VMP 加载前调用
//       patchFunctionToString(win) 在 VMP 加载后调用

const _origFnToString = Function.prototype.toString;
const nativeFnSet = new WeakSet();

function markNative(fn, name) {
    if (typeof fn === 'function') {
        nativeFnSet.add(fn);
        Object.defineProperty(fn, 'toString', {
            value: function () { return 'function ' + (name || fn.name || '') + '() { [native code] }'; },
            writable: true, configurable: true, enumerable: false,
        });
    }
    return fn;
}

// ====== Browser CSS properties (401 items, exact match) ======
const BROWSER_CSS = ["accent-color", "align-content", "align-items", "align-self", "animation-composition", "animation-delay", "animation-direction", "animation-duration", "animation-fill-mode", "animation-iteration-count", "animation-name", "animation-play-state", "animation-timing-function", "appearance", "aspect-ratio", "backdrop-filter", "backface-visibility", "background-attachment", "background-blend-mode", "background-clip", "background-color", "background-image", "background-origin", "background-position-x", "background-position-y", "background-repeat", "background-size", "baseline-source", "block-size", "border-block-end-color", "border-block-end-style", "border-block-end-width", "border-block-start-color", "border-block-start-style", "border-block-start-width", "border-bottom-color", "border-bottom-left-radius", "border-bottom-right-radius", "border-bottom-style", "border-bottom-width", "border-collapse", "border-end-end-radius", "border-end-start-radius", "border-image-outset", "border-image-repeat", "border-image-slice", "border-image-source", "border-image-width", "border-inline-end-color", "border-inline-end-style", "border-inline-end-width", "border-inline-start-color", "border-inline-start-style", "border-inline-start-width", "border-left-color", "border-left-style", "border-left-width", "border-right-color", "border-right-style", "border-right-width", "border-spacing", "border-start-end-radius", "border-start-start-radius", "border-top-color", "border-top-left-radius", "border-top-right-radius", "border-top-style", "border-top-width", "bottom", "box-decoration-break", "box-shadow", "box-sizing", "break-after", "break-before", "break-inside", "caption-side", "caret-color", "clear", "clip", "clip-path", "clip-rule", "color", "color-interpolation", "color-interpolation-filters", "color-scheme", "column-count", "column-fill", "column-gap", "column-rule-color", "column-rule-style", "column-rule-width", "column-span", "column-width", "contain", "contain-intrinsic-block-size", "contain-intrinsic-height", "contain-intrinsic-inline-size", "contain-intrinsic-width", "container-name", "container-type", "content", "content-visibility", "counter-increment", "counter-reset", "counter-set", "cursor", "cx", "cy", "d", "direction", "display", "dominant-baseline", "empty-cells", "fill", "fill-opacity", "fill-rule", "filter", "flex-basis", "flex-direction", "flex-grow", "flex-shrink", "flex-wrap", "float", "flood-color", "flood-opacity", "font-family", "font-feature-settings", "font-kerning", "font-language-override", "font-optical-sizing", "font-palette", "font-size", "font-size-adjust", "font-stretch", "font-style", "font-synthesis-position", "font-synthesis-small-caps", "font-synthesis-style", "font-synthesis-weight", "font-variant-alternates", "font-variant-caps", "font-variant-east-asian", "font-variant-ligatures", "font-variant-numeric", "font-variant-position", "font-variation-settings", "font-weight", "forced-color-adjust", "grid-auto-columns", "grid-auto-flow", "grid-auto-rows", "grid-column-end", "grid-column-start", "grid-row-end", "grid-row-start", "grid-template-areas", "grid-template-columns", "grid-template-rows", "height", "hyphenate-character", "hyphens", "image-orientation", "image-rendering", "ime-mode", "inline-size", "inset-block-end", "inset-block-start", "inset-inline-end", "inset-inline-start", "isolation", "justify-content", "justify-items", "justify-self", "left", "letter-spacing", "lighting-color", "line-break", "line-height", "list-style-image", "list-style-position", "list-style-type", "margin-block-end", "margin-block-start", "margin-bottom", "margin-inline-end", "margin-inline-start", "margin-left", "margin-right", "margin-top", "marker-end", "marker-mid", "marker-start", "mask-clip", "mask-composite", "mask-image", "mask-mode", "mask-origin", "mask-position-x", "mask-position-y", "mask-repeat", "mask-size", "mask-type", "math-depth", "math-style", "max-block-size", "max-height", "max-inline-size", "max-width", "min-block-size", "min-height", "min-inline-size", "min-width", "mix-blend-mode", "object-fit", "object-position", "offset-anchor", "offset-distance", "offset-path", "offset-position", "offset-rotate", "opacity", "order", "outline-color", "outline-offset", "outline-style", "outline-width", "overflow-anchor", "overflow-block", "overflow-clip-margin", "overflow-inline", "overflow-wrap", "overflow-x", "overflow-y", "overscroll-behavior-block", "overscroll-behavior-inline", "overscroll-behavior-x", "overscroll-behavior-y", "padding-block-end", "padding-block-start", "padding-bottom", "padding-inline-end", "padding-inline-start", "padding-left", "padding-right", "padding-top", "page", "paint-order", "perspective", "perspective-origin", "pointer-events", "position", "print-color-adjust", "quotes", "r", "resize", "right", "rotate", "row-gap", "ruby-align", "ruby-position", "rx", "ry", "scale", "scroll-behavior", "scroll-margin-block-end", "scroll-margin-block-start", "scroll-margin-bottom", "scroll-margin-inline-end", "scroll-margin-inline-start", "scroll-margin-left", "scroll-margin-right", "scroll-margin-top", "scroll-padding-block-end", "scroll-padding-block-start", "scroll-padding-bottom", "scroll-padding-inline-end", "scroll-padding-inline-start", "scroll-padding-left", "scroll-padding-right", "scroll-padding-top", "scroll-snap-align", "scroll-snap-stop", "scroll-snap-type", "scrollbar-color", "scrollbar-gutter", "scrollbar-width", "shape-image-threshold", "shape-margin", "shape-outside", "shape-rendering", "stop-color", "stop-opacity", "stroke", "stroke-dasharray", "stroke-dashoffset", "stroke-linecap", "stroke-linejoin", "stroke-miterlimit", "stroke-opacity", "stroke-width", "tab-size", "table-layout", "text-align", "text-align-last", "text-anchor", "text-combine-upright", "text-decoration-color", "text-decoration-line", "text-decoration-skip-ink", "text-decoration-style", "text-decoration-thickness", "text-emphasis-color", "text-emphasis-position", "text-emphasis-style", "text-indent", "text-justify", "text-orientation", "text-overflow", "text-rendering", "text-shadow", "text-transform", "text-underline-offset", "text-underline-position", "text-wrap-mode", "text-wrap-style", "top", "touch-action", "transform", "transform-box", "transform-origin", "transform-style", "transition-behavior", "transition-delay", "transition-duration", "transition-property", "transition-timing-function", "translate", "unicode-bidi", "user-select", "vector-effect", "vertical-align", "visibility", "white-space-collapse", "width", "will-change", "word-break", "word-spacing", "writing-mode", "x", "y", "z-index", "zoom", "-moz-box-align", "-moz-box-direction", "-moz-box-flex", "-moz-box-ordinal-group", "-moz-box-orient", "-moz-box-pack", "-moz-float-edge", "-moz-force-broken-image-icon", "-moz-orient", "-moz-text-size-adjust", "-moz-window-dragging", "-webkit-line-clamp", "-webkit-text-fill-color", "-webkit-text-security", "-webkit-text-stroke-color", "-webkit-text-stroke-width", "--sider-bar-background", "--sider-bar-padding", "--fixed-entry-background", "--fixed-entry-padding", "--report-dialog-background", "--report-dialog-padding", "--more-info-layer-background", "--more-info-layer-padding", "--job-list-login-card-background", "--job-list-login-card-padding", "--hide-salary-background", "--hide-salary-padding", "--shadow-key-ambient-opacity", "--shadow-key-penumbra-opacity", "--shadow-key-umbra-opacity", "--cubic-bezier", "--color-text-disabled", "--color-disabled", "--color-danger", "--color-warning", "--color-success", "--color-info", "--color-primary", "--color-text", "--color-body", "--icon-size-lg", "--icon-size-md", "--icon-size-sm", "--icon-size-xs", "--font-size-lg", "--font-size-md", "--font-size-sm", "--font-size-xs"];

// ====== Phase 1: 环境补丁（VMP 加载前） ======
function patchEnvironment(win, doc, nav, options) {
    options = options || {};

    // --- navigator Proxy ---
    patchNavigator(win);

    // --- screen (逐个 defineProperty) ---
    patchScreen(win);

    // --- window 尺寸 ---
    patchWindowDimensions(win);

    // --- getComputedStyle ---
    patchGetComputedStyle(win);

    // --- document ---
    patchDocument(win);

    // --- 清除 Node.js 全局 ---
    hideNodeFeatures(win);

    // --- Firefox 特有 ---
    patchFirefox(win);

    // --- WebGL/Audio 最小存根 ---
    patchWebGLAudio(win);
}

// ====== Phase 2: Function.toString（VMP 加载后） ======
function patchFunctionToString(win) {
    setupMarkNative(win);
    scanAllPrototypes(win, win.document, win.navigator);
}

// ====== 实现 ======

function setupMarkNative(win) {
    const patterns = [/esValue/, /_globalObject/];
    win.Function.prototype.toString = function () {
        if (nativeFnSet.has(this)) return 'function ' + (this.name || '') + '() { [native code] }';
        let src;
        try { src = _origFnToString.call(this); } catch (e) { return 'function () { [native code] }'; }
        for (let i = 0; i < patterns.length; i++) {
            if (patterns[i].test(src)) return 'function ' + (this.name || '') + '() { [native code] }';
        }
        return src;
    };
    // 标记 FPT.toString 自身
    markNative(win.Function.prototype.toString, 'toString');
}

function scanAllPrototypes(win, doc, nav) {
    const targets = [
        win.Document && win.Document.prototype,
        win.Element && win.Element.prototype,
        win.HTMLElement && win.HTMLElement.prototype,
        win.Node && win.Node.prototype,
        win.EventTarget && win.EventTarget.prototype,
        win.XMLHttpRequest && win.XMLHttpRequest.prototype,
        win.Storage && win.Storage.prototype,
        win.CSSStyleDeclaration && win.CSSStyleDeclaration.prototype,
    ];
    targets.forEach(function (proto) {
        if (!proto) return;
        let p = proto;
        for (let d = 0; d < 6 && p; d++) {
            Object.getOwnPropertyNames(p).forEach(function (name) {
                try {
                    const desc = Object.getOwnPropertyDescriptor(p, name);
                    if (desc && typeof desc.value === 'function') markNative(desc.value);
                    if (desc && typeof desc.get === 'function') markNative(desc.get);
                    if (desc && typeof desc.set === 'function') markNative(desc.set);
                } catch (e) { }
            });
            p = Object.getPrototypeOf(p);
            if (p === Object.prototype || p === null) break;
        }
    });
    // mark win functions
    if (doc) scanPrototype(win, doc, 5);
    if (nav) scanPrototype(win, nav, 3);
}

function scanPrototype(win, obj, depth) {
    let p = obj;
    for (let d = 0; d < depth && p; d++) {
        Object.getOwnPropertyNames(p).forEach(function (name) {
            try {
                const desc = Object.getOwnPropertyDescriptor(p, name);
                if (desc && typeof desc.value === 'function') markNative(desc.value);
                if (desc && typeof desc.get === 'function') markNative(desc.get);
            } catch (e) { }
        });
        p = Object.getPrototypeOf(p);
        if (p === Object.prototype || p === null) break;
    }
}

function patchNavigator(win) {
    const nav = win.navigator;
    const it = markNative(function (i) { return this[i] || null; }, 'item');
    const ni = markNative(function () { return null; }, 'namedItem');
    const rf = markNative(function () { }, 'refresh');

    // MimeTypes
    const mimeObjs = [
        { type: 'application/pdf', suffixes: 'pdf', description: 'Portable Document Format' },
        { type: 'text/pdf', suffixes: 'pdf', description: 'Portable Document Format' },
    ];
    // Plugins (shared mimeType refs)
    const pluginObjs = ['PDF Viewer', 'Chrome PDF Viewer', 'Chromium PDF Viewer', 'Microsoft Edge PDF Viewer', 'WebKit built-in PDF'].map(function (n) {
        const p = {};
        Object.defineProperties(p, {
            name: { value: n, enumerable: true },
            filename: { value: 'internal-pdf-viewer', enumerable: true },
            description: { value: 'Portable Document Format', enumerable: true },
            length: { value: 2, enumerable: true },
        });
        mimeObjs.forEach(function (m, j) { p[j] = m; });
        p.item = it; p.namedItem = ni;
        return p;
    });
    mimeObjs[0].enabledPlugin = pluginObjs[0];
    mimeObjs[1].enabledPlugin = pluginObjs[0];

    const pa = {};
    pluginObjs.forEach(function (p, i) { pa[i] = p; });
    pa.length = 5; pa.item = it; pa.namedItem = ni; pa.refresh = rf;
    pa[Symbol.toStringTag] = 'PluginArray';

    const mt = { 0: mimeObjs[0], 1: mimeObjs[1], length: 2 };
    mt.item = it; mt.namedItem = ni;
    mt[Symbol.toStringTag] = 'MimeTypeArray';

    const vals = {
        platform: 'Linux x86_64',
        userAgent: 'Mozilla/5.0 (X11; Linux x86_64; rv:135.0) Gecko/20100101 Firefox/135.0',
        language: 'zh-CN', languages: ['zh-CN', 'zh'],
        hardwareConcurrency: 8, webdriver: false, vendor: '',
        appVersion: '5.0 (X11)', cookieEnabled: true, doNotTrack: null,
        pdfViewerEnabled: true, maxTouchPoints: 0, onLine: true,
        plugins: pa, mimeTypes: mt,
        product: 'Gecko', productSub: '20100101', vendorSub: '',
        oscpu: 'Linux x86_64', buildID: '20181001000000',
        appCodeName: 'Mozilla', appName: 'Netscape',
        deviceMemory: undefined, globalPrivacyControl: undefined,
        geolocation: {}, mediaDevices: {}, serviceWorker: {}, credentials: {}, clipboard: {},
        mediaSession: {}, userActivation: {}, wakeLock: {}, storage: {}, locks: {}, mediaCapabilities: {}, permissions: {},
        javaEnabled: markNative(function () { return false; }, 'javaEnabled'),
        taintEnabled: markNative(function () { return false; }, 'taintEnabled'),
    };

    const proxy = new Proxy(nav, {
        get: function (t, p) { if (p in vals) return vals[p]; return t[p]; },
        has: function (t, p) { return p in vals || p in t; },
    });
    try { Object.defineProperty(win, 'navigator', { get: function () { return proxy; }, configurable: true }); } catch (e) { }
}

function patchScreen(win) {
    const s = win.screen;
    const props = { width: 1366, height: 768, availWidth: 1366, availHeight: 768, colorDepth: 24, pixelDepth: 24 };
    Object.keys(props).forEach(function (k) {
        try { Object.defineProperty(s, k, { value: props[k], configurable: true, writable: true, enumerable: true }); } catch (e) { }
    });
    try {
        Object.defineProperty(s, 'orientation', { get: function () { return { type: 'landscape-primary', angle: 0 }; }, configurable: true, enumerable: true });
    } catch (e) { }
}

function patchWindowDimensions(win) {
    const props = { innerWidth: 1366, innerHeight: 768, outerWidth: 1366, outerHeight: 768, devicePixelRatio: 1 };
    Object.keys(props).forEach(function (k) {
        try { Object.defineProperty(win, k, { value: props[k], configurable: true, enumerable: true }); } catch (e) { }
    });
}

function patchGetComputedStyle(win) {
    // 加载浏览器 CSS2Properties.prototype 的完整 own property names (1110 项)
    let CSS2PROTO_NAMES = null;
    try { CSS2PROTO_NAMES = require('./config/browser_css2proto.json'); } catch (e) { CSS2PROTO_NAMES = []; }

    if (!CSS2PROTO_NAMES || CSS2PROTO_NAMES.length === 0) {
        // Fallback: keep old behavior
        CSS2PROTO_NAMES = BROWSER_CSS;
    }

    win.getComputedStyle = function (el, pseudo) {
        // CSSStyleDeclaration 原型：标准方法
        const cssDeclProto = {};
        Object.defineProperties(cssDeclProto, {
            item: { value: markNative(function item(i) { return CSS2PROTO_NAMES[Number(i) + 1] || ''; }, 'item'), enumerable: true },
            getPropertyValue: { value: markNative(function getPropertyValue(name) { return ''; }, 'getPropertyValue'), enumerable: true },
            getPropertyPriority: { value: markNative(function getPropertyPriority(name) { return ''; }, 'getPropertyPriority'), enumerable: true },
            setProperty: { value: markNative(function setProperty(name, value, priority) {}, 'setProperty'), enumerable: true },
            removeProperty: { value: markNative(function removeProperty(name) { return ''; }, 'removeProperty'), enumerable: true },
            cssText: { value: '', writable: true, enumerable: true, configurable: true },
            length: { value: CSS2PROTO_NAMES.length - 1, writable: true, enumerable: true, configurable: true },
            parentRule: { value: null, writable: true, enumerable: true, configurable: true },
        });
        Object.setPrototypeOf(cssDeclProto, Object.prototype);

        // CSS2Properties 原型：1110 个 own property names（constructor 非枚举，其余枚举）
        const css2Proto = {};
        Object.defineProperty(css2Proto, 'constructor', {
            value: function CSS2Properties() {},
            writable: true, enumerable: false, configurable: true,
        });
        // 批量定义 1109 个可枚举 CSS 属性名
        for (let i = 1; i < CSS2PROTO_NAMES.length; i++) {
            Object.defineProperty(css2Proto, CSS2PROTO_NAMES[i], {
                value: '', writable: true, enumerable: true, configurable: true,
            });
        }
        // toStringTag 确保 Object.prototype.toString.call() 返回 [object CSS2Properties]
        css2Proto[Symbol.toStringTag] = 'CSS2Properties';
        Object.setPrototypeOf(css2Proto, cssDeclProto);

        // 实例：空实例，原型指向 CSS2Properties 原型
        const target = Object.create(css2Proto);
        return target;
    };
    markNative(win.getComputedStyle, 'getComputedStyle');
}

function patchDocument(win) {
    const doc = win.document;
    doc.hasFocus = function () { return true; };
    try { Object.defineProperty(doc, 'all', { get: function () { return null; }, configurable: true, enumerable: true }); } catch (e) { }
}

function hideNodeFeatures(win) {
    ['process', 'module', 'exports', 'require', '__filename', '__dirname', 'global', 'Buffer'].forEach(function (k) {
        try { delete win[k]; } catch (e) { try { win[k] = undefined; } catch (e2) { } }
    });
}

// 让 Object.keys/getOwnPropertyNames(Window) 返回空，模拟真实浏览器
function hideJsdomFeatures(win) {
    var _origKeys = win.Object.keys;
    var _origGetOPN = win.Object.getOwnPropertyNames;

    function isWindow(o) {
        try {
            var ts = win.Object.prototype.toString.call(o);
            return ts === '[object Window]' || ts === '[object global]';
        } catch (e) { return false; }
    }

    win.Object.keys = function (o) {
        if (o && typeof o === 'object' && isWindow(o)) return [];
        return _origKeys(o);
    };
    win.Object.getOwnPropertyNames = function (o) {
        if (o && typeof o === 'object' && isWindow(o)) return [];
        return _origGetOPN(o);
    };
    // hasOwnProperty: 对 Window 对象隐藏不该是 own prop 的属性
    var _origHOP = win.Object.prototype.hasOwnProperty;
    var _windowNonOwnProps = ['setInterval', 'CSSPageRule', 'Event'];
    win.Object.prototype.hasOwnProperty = function (p) {
        if (isWindow(this) && _windowNonOwnProps.indexOf(String(p)) !== -1) return false;
        return _origHOP.call(this, p);
    };
    // getOwnPropertyDescriptor: 同样隐藏
    var _origGetOPD2 = win.Object.getOwnPropertyDescriptor;
    win.Object.getOwnPropertyDescriptor = function (o, p) {
        if (isWindow(o) && _windowNonOwnProps.indexOf(String(p)) !== -1) return undefined;
        return _origGetOPD2(o, p);
    };
}

function patchFirefox(win) {
    try { win.InstallTrigger = null; } catch (e) { }
    try { Object.defineProperties(win, { mozInnerScreenX: { value: 0 }, mozInnerScreenY: { value: 0 }, scrollMaxX: { value: 0 }, scrollMaxY: { value: 0 } }); } catch (e) { }
    if (win.chrome) { try { delete win.chrome; } catch (e) { } }
}

function patchWebGLAudio(win) {
    if (!win.WebGLRenderingContext) { win.WebGLRenderingContext = function () { }; win.WebGL2RenderingContext = function () { }; }
    if (!win.AudioContext) {
        win.AudioContext = function AudioContext() { this.sampleRate = 48000; this.state = 'suspended'; };
        win.AudioContext.prototype.close = function () { return Promise.resolve(); };
        win.AudioContext.prototype[Symbol.toStringTag] = 'AudioContext';
        win.OfflineAudioContext = win.AudioContext;
        win.webkitAudioContext = win.AudioContext;
    }
    if (!win.fetch) win.fetch = function () { return Promise.reject(new Error()); };
    if (!win.Notification) win.Notification = function () { };
    if (!win.Worker) win.Worker = function () { };
    if (!win.indexedDB) win.indexedDB = { open: function () { return {}; } };
    if (!win.caches) win.caches = { open: function () { return Promise.resolve({}); } };
}

module.exports = { patchEnvironment, patchFunctionToString, hideJsdomFeatures };
