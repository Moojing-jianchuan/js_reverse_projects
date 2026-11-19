// Global key inventory captured from the real widget iframe (Camoufox, 282 own keys).
// The SDK can read Object.keys(window); our sandbox only had 64, which is a dead giveaway.
export const BROWSER_GLOBAL_KEYS = `0|1|close|stop|focus|blur|open|alert|confirm|prompt|print|postMessage|captureEvents|releaseEvents|getSelection|getComputedStyle|matchMedia|moveTo|moveBy|resizeTo|resizeBy|scroll|scrollTo|scrollBy|getDefaultComputedStyle|scrollByLines|scrollByPages|updateCommands|find|dump|setResizable|requestIdleCallback|cancelIdleCallback|setFontSpacingSeed|setAudioFingerprintSeed|setFontList|setSpeechVoices|setTimezone|setWebRTCIPv4|setWebRTCIPv6|setNavigatorPlatform|setNavigatorOscpu|setNavigatorHardwareConcurrency|setNavigatorUserAgent|setScreenDimensions|setScreenColorDepth|setWebGLVendor|setWebGLRenderer|requestAnimationFrame|cancelAnimationFrame|reportError|btoa|atob|setTimeout|clearTimeout|setInterval|clearInterval|queueMicrotask|createImageBitmap|structuredClone|fetch|self|name|history|navigation|customElements|locationbar|menubar|personalbar|scrollbars|statusbar|toolbar|status|closed|event|frames|length|opener|parent|frameElement|navigator|clientInformation|external|screen|innerWidth|innerHeight|scrollX|pageXOffset|scrollY|pageYOffset|screenLeft|screenTop|screenX|screenY|outerWidth|outerHeight|performance|mozInnerScreenX|mozInnerScreenY|devicePixelRatio|scrollMaxX|scrollMaxY|fullScreen|ondevicemotion|ondeviceorientation|ondeviceorientationabsolute|InstallTrigger|visualViewport|cookieStore|originAgentCluster|documentPictureInPicture|crypto|onabort|onblur|onfocus|oncancel|onauxclick|onbeforeinput|onbeforematch|onbeforetoggle|oncanplay|oncanplaythrough|onchange|onclick|onclose|oncontentvisibilityautostatechange|oncontextlost|oncontextmenu|oncommand|oncontextrestored|oncopy|oncuechange|oncut|ondblclick|ondrag|ondragend|ondragenter|ondragexit|ondragleave|ondragover|ondragstart|ondrop|ondurationchange|onemptied|onended|onformdata|oninput|oninvalid|onkeydown|onkeypress|onkeyup|onload|onloadeddata|onloadedmetadata|onloadstart|onmousedown|onmouseenter|onmouseleave|onmousemove|onmouseout|onmouseover|onmouseup|onwheel|onpaste|onpause|onplay|onplaying|onprogress|onratechange|onreset|onresize|onscroll|onscrollend|onsecuritypolicyviolation|onseeked|onseeking|onselect|onslotchange|onstalled|onsubmit|onsuspend|ontimeupdate|onvolumechange|onwaiting|onselectstart|onselectionchange|ontoggle|onpointercancel|onpointerdown|onpointerup|onpointermove|onpointerout|onpointerover|onpointerenter|onpointerleave|onpointerrawupdate|ongotpointercapture|onlostpointercapture|onmozfullscreenchange|onmozfullscreenerror|onanimationcancel|onanimationend|onanimationiteration|onanimationstart|ontransitioncancel|ontransitionend|ontransitionrun|ontransitionstart|onwebkitanimationend|onwebkitanimationiteration|onwebkitanimationstart|onwebkittransitionend|onerror|speechSynthesis|onafterprint|onbeforeprint|onbeforeunload|onhashchange|onlanguagechange|onmessage|onmessageerror|onoffline|ononline|onpagehide|onpageshow|onpopstate|onrejectionhandled|onstorage|onunhandledrejection|onunload|ongamepadconnected|ongamepaddisconnected|localStorage|origin|crossOriginIsolated|isSecureContext|indexedDB|caches|scheduler|trustedTypes|sessionStorage|window|document|location|top`.split('|');

// values that must be real (not undefined), keyed by name
export function browserGlobalDefault(k, w) {
  if (/^on[a-z]/.test(k)) return null;
  if (/^set[A-Z]/.test(k)) return function () {};
  switch (k) {
    case 'length': return 1;
    case 'frames': return w;
    case 'window': case 'self': case 'globalThis': return w;
    case 'clientInformation': return w.navigator;
    case 'closed': return false;
    case 'opener': return null;
    case 'status': return '';
    case 'name': return 'https://captcha.eo.qq.com|https://captcha.eo.gtimg.com/static';
    case 'event': return undefined;
    case 'origin': return 'https://captcha.eo.gtimg.com';
    case 'crossOriginIsolated': return false;
    case 'fullScreen': return false;
    case 'scrollX': case 'pageXOffset': case 'scrollY': case 'pageYOffset': return 0;
    case 'scrollMaxX': case 'scrollMaxY': return 0;
    case 'screenLeft': case 'screenTop': case 'screenX': case 'screenY': return 0;
    case 'mozInnerScreenX': case 'mozInnerScreenY': return 0;
    case 'history': return { length: 1, state: null, scrollRestoration: 'auto', pushState() {}, replaceState() {}, back() {}, forward() {}, go() {} };
    case 'navigation': return { currentEntry: { index: 0, url: 'https://captcha.eo.gtimg.com/static/template/widget_ele_eo.e349d149.html', key: 'k1' }, entries: () => [{ index: 0 }], addEventListener() {}, removeEventListener() {} };
    case 'customElements': return { define() {}, get() { return undefined; }, whenDefined: () => Promise.resolve(), upgrade() {} };
    case 'visualViewport': return { width: 330, height: 70, offsetLeft: 0, offsetTop: 0, pageLeft: 0, pageTop: 0, scale: 1, addEventListener() {}, removeEventListener() {} };
    case 'cookieStore': return { get: () => Promise.resolve(null), getAll: () => Promise.resolve([]), set() { return Promise.resolve(); }, delete() { return Promise.resolve(); }, addEventListener() {} };
    case 'originAgentCluster': return false;
    case 'documentPictureInPicture': return { window: null, requestWindow: () => Promise.resolve(null) };
    case 'InstallTrigger': return { install() {} };
    case 'external': return { AddSearchProvider() {}, IsSearchProviderInstalled() {} };
    case 'speechSynthesis': return { speak() {}, cancel() {}, pause() {}, resume() {}, getVoices: () => [], speaking: false, pending: false, paused: false };
    case 'indexedDB': return { open: () => ({ addEventListener() {}, onsuccess: null, onerror: null }), deleteDatabase: () => ({}), cmp() { return 0; }, databases: () => Promise.resolve([]) };
    case 'caches': return { open: () => Promise.resolve({ match: () => Promise.resolve(undefined), addAll: () => Promise.resolve() }), keys: () => Promise.resolve([]), has: () => Promise.resolve(false), delete: () => Promise.resolve(false) };
    case 'scheduler': return { postTask: () => Promise.resolve(), yield: () => Promise.resolve() };
    case 'trustedTypes': return { createPolicy: () => ({ createHTML: (s) => s, createScript: (s) => s, createScriptURL: (s) => s }), getPolicyNames: () => [] };
    case 'locationbar': case 'menubar': case 'personalbar': case 'scrollbars': case 'statusbar': case 'toolbar': return { visible: true };
    case 'requestIdleCallback': return function (cb) { return setTimeout(() => cb({ didTimeout: false, timeRemaining: () => 50 }), 1); };
    case 'cancelIdleCallback': return function (id) { clearTimeout(id); };
    case 'requestAnimationFrame': return function (cb) { return setTimeout(() => cb(Date.now()), 16); };
    case 'cancelAnimationFrame': return function (id) { clearTimeout(id); };
    case 'reportError': return function () {};
    case 'structuredClone': return function (v) { return JSON.parse(JSON.stringify(v === undefined ? null : v)); };
    case 'fetch': return function () { return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve(''), json: () => Promise.resolve({}) }); };
    case 'matchMedia': return function (q) { return { matches: false, media: String(q), addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} }; };
    case 'getSelection': return function () { return { toString: () => '', rangeCount: 0, getRangeAt() { return null; }, removeAllRanges() {} }; };
    case 'scrollByLines': case 'scrollByPages': case 'moveTo': case 'moveBy': case 'resizeTo': case 'resizeBy': case 'scroll': case 'scrollTo': case 'scrollBy': case 'print': case 'find': case 'dump': case 'setResizable': case 'updateCommands': case 'captureEvents': case 'releaseEvents': case 'alert': case 'confirm': case 'prompt': return function () { return undefined; };
    case 'open': return function () { return null; };
    case 'close': case 'stop': case 'focus': case 'blur': return function () {};
    default: return undefined;
  }
}
