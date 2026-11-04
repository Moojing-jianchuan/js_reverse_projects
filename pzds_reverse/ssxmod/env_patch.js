'use strict';

/**
 * 文件职责：
 * - env_patch.js：唯一补环境脚本。
 * - env_fill.js：吐环境/诊断脚本，只监控，不补环境。
 * - run_with_env.js：启动入口，按 env_patch.js -> env_fill.js -> 1.js 顺序运行。
 */

/**
 * env_patch.js
 * Node 浏览器补环境脚本：在 require('./1.js') 之前加载。
 * 目标：尽量不改业务脚本，只补齐 1.js 运行所需的浏览器对象/属性/方法。
 */
(function installBrowserEnv() {
  if (globalThis.__ENV_PATCH_INSTALLED__) return;
  Object.defineProperty(globalThis, '__ENV_PATCH_INSTALLED__', { value: true });

  const REAL_URL = process.env.ENV_URL || 'https://www.pzds.com/goodsList/7/6';
  const UA = process.env.ENV_UA || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';

  const safeToStringMap = new WeakMap();
  const nativeCode = (name) => `function ${name || ''}() { [native code] }`;
  function markNative(fn, name) {
    if (typeof fn === 'function') safeToStringMap.set(fn, nativeCode(name || fn.name));
    return fn;
  }
  const realFunctionToString = Function.prototype.toString;
  if (!globalThis.__ENV_PATCH_TO_STRING__) {
    Object.defineProperty(globalThis, '__ENV_PATCH_TO_STRING__', { value: true });
    Function.prototype.toString = new Proxy(realFunctionToString, {
      apply(target, thisArg, args) {
        if (safeToStringMap.has(thisArg)) return safeToStringMap.get(thisArg);
        return Reflect.apply(target, thisArg, args);
      }
    });
    markNative(Function.prototype.toString, 'toString');
  }

  function define(obj, key, value, opts = {}) {
    try {
      Object.defineProperty(obj, key, {
        value,
        configurable: opts.configurable !== false,
        enumerable: !!opts.enumerable,
        writable: opts.writable !== false,
      });
    } catch (_) {
      try { obj[key] = value; } catch (_) {}
    }
    return value;
  }

  function defineGetter(obj, key, getter, opts = {}) {
    try {
      Object.defineProperty(obj, key, {
        get: getter,
        configurable: opts.configurable !== false,
        enumerable: !!opts.enumerable,
      });
    } catch (_) {}
  }

  function makeEventTargetBase() {
    class EventTarget {
      constructor() { define(this, '__listeners__', Object.create(null), { enumerable: false }); }
      addEventListener(type, listener) {
        if (!type || typeof listener !== 'function') return;
        (this.__listeners__[type] || (this.__listeners__[type] = [])).push(listener);
        // Auto-inject synthetic behavior events when SDK registers interaction listeners.
        // Each event type gets its own injection, triggered on first listener registration for that type.
        var key = '__bhvr_' + type;
        if (!this[key]) {
          this[key] = true;
          var self = this;
          var ev;
          if (type === 'mousemove') {
            // 浏览器首次加载时 g.len=0（无用户交互），不注入
          } else if (type === 'mousedown') {
            // 浏览器 u.len=0: 不注入 mousedown
          } else if (type === 'mouseup') {
            // 浏览器 u.len=0: 不注入 mouseup
          } else if (type === 'click') {
            // 浏览器 u.len=0: 不注入 click
          } else if (type === 'keyup') {
            // 浏览器 e.len=1: 由 run_with_env.js 异步注入, 此处不重复
          }
        }
      }
      removeEventListener(type, listener) {
        const list = this.__listeners__ && this.__listeners__[type];
        if (!list) return;
        const idx = list.indexOf(listener);
        if (idx >= 0) list.splice(idx, 1);
      }
      dispatchEvent(event) {
        if (!event || !event.type) return true;
        event.target = event.target || this;
        event.currentTarget = this;
        const list = (this.__listeners__ && this.__listeners__[event.type]) || [];
        for (const fn of list.slice()) {
          try { fn.call(this, event); } catch (e) { setTimeout(() => { throw e; }, 0); }
        }
        const handler = this['on' + event.type];
        if (typeof handler === 'function') handler.call(this, event);
        return !event.defaultPrevented;
      }
    }
    ['addEventListener','removeEventListener','dispatchEvent'].forEach(k => markNative(EventTarget.prototype[k], k));
    markNative(EventTarget, 'EventTarget');
    return EventTarget;
  }

  const EventTarget = makeEventTargetBase();
  define(globalThis, 'EventTarget', EventTarget);

  class Event {
    constructor(type, init = {}) {
      this.type = String(type || '');
      this.bubbles = !!init.bubbles;
      this.cancelable = !!init.cancelable;
      this.defaultPrevented = false;
      this.timeStamp = Date.now();
      this.isTrusted = false;
    }
    preventDefault() { if (this.cancelable) this.defaultPrevented = true; }
    stopPropagation() {}
    stopImmediatePropagation() {}
  }
  ['preventDefault','stopPropagation','stopImmediatePropagation'].forEach(k => markNative(Event.prototype[k], k));
  markNative(Event, 'Event');
  define(globalThis, 'Event', Event);

  class CustomEvent extends Event {
    constructor(type, init = {}) { super(type, init); this.detail = init.detail; }
  }
  markNative(CustomEvent, 'CustomEvent');
  define(globalThis, 'CustomEvent', CustomEvent);

  class MouseEvent extends Event {
    constructor(type, init = {}) {
      super(type, init);
      this.clientX = init.clientX || 0; this.clientY = init.clientY || 0;
      this.screenX = init.screenX || 0; this.screenY = init.screenY || 0;
      this.pageX = init.pageX || 0; this.pageY = init.pageY || 0;
      this.button = init.button || 0; this.buttons = init.buttons || 0;
      this.which = init.which || 1;
      this.relatedTarget = init.relatedTarget || null;
      this.movementX = 0; this.movementY = 0;
    }
  }
  markNative(MouseEvent, 'MouseEvent');
  define(globalThis, 'MouseEvent', MouseEvent);

  class KeyboardEvent extends Event {
    constructor(type, init = {}) {
      super(type, init);
      this.key = init.key || ''; this.code = init.code || '';
      this.keyCode = init.keyCode || 0; this.which = init.which || 0;
      this.altKey = !!init.altKey; this.ctrlKey = !!init.ctrlKey;
      this.shiftKey = !!init.shiftKey; this.metaKey = !!init.metaKey;
    }
  }
  markNative(KeyboardEvent, 'KeyboardEvent');
  define(globalThis, 'KeyboardEvent', KeyboardEvent);

  class Touch {
    constructor(init = {}) {
      this.identifier = init.identifier || 0;
      this.target = init.target || null;
      this.clientX = init.clientX || 0; this.clientY = init.clientY || 0;
      this.screenX = init.screenX || 0; this.screenY = init.screenY || 0;
      this.pageX = init.pageX || 0; this.pageY = init.pageY || 0;
    }
  }
  markNative(Touch, 'Touch');
  define(globalThis, 'Touch', Touch);

  class TouchEvent extends Event {
    constructor(type, init = {}) {
      super(type, init);
      this.touches = init.touches || []; this.targetTouches = init.targetTouches || [];
      this.changedTouches = init.changedTouches || [];
      this.ctrlKey = !!init.ctrlKey; this.shiftKey = !!init.shiftKey;
      this.altKey = !!init.altKey; this.metaKey = !!init.metaKey;
    }
  }
  markNative(TouchEvent, 'TouchEvent');
  define(globalThis, 'TouchEvent', TouchEvent);

  class PointerEvent extends MouseEvent {
    constructor(type, init = {}) {
      super(type, init);
      this.pointerId = init.pointerId || 0; this.pointerType = init.pointerType || 'mouse';
      this.isPrimary = init.isPrimary !== false;
    }
    getCoalescedEvents() { return []; }
  }
  ['getCoalescedEvents'].forEach(k => markNative(PointerEvent.prototype[k], k));
  markNative(PointerEvent, 'PointerEvent');
  define(globalThis, 'PointerEvent', PointerEvent);

  class Location {
    constructor(href) { this._set(href); }
    _set(href) {
      const u = new URL(href, REAL_URL);
      this.href = u.href;
      this.origin = u.origin;
      this.protocol = u.protocol;
      this.host = u.host;
      this.hostname = u.hostname;
      this.port = u.port;
      this.pathname = u.pathname;
      this.search = u.search;
      this.hash = u.hash;
    }
    assign(url) { this._set(url); }
    replace(url) { this._set(url); }
    reload() {}
    toString() { return this.href; }
  }
  ['assign','replace','reload','toString'].forEach(k => markNative(Location.prototype[k], k));
  markNative(Location, 'Location');
  const location = globalThis.location && globalThis.location.href ? globalThis.location : new Location(REAL_URL);

  class Storage {
    constructor() { define(this, '__store__', Object.create(null), { enumerable: false }); }
    get length() { return Object.keys(this.__store__).length; }
    key(i) { return Object.keys(this.__store__)[Number(i)] || null; }
    getItem(k) { k = String(k); return Object.prototype.hasOwnProperty.call(this.__store__, k) ? this.__store__[k] : null; }
    setItem(k, v) { this.__store__[String(k)] = String(v); }
    removeItem(k) { delete this.__store__[String(k)]; }
    clear() { for (const k of Object.keys(this.__store__)) delete this.__store__[k]; }
    _dump() { return { ...this.__store__ }; }
  }
  ['key','getItem','setItem','removeItem','clear'].forEach(k => markNative(Storage.prototype[k], k));
  markNative(Storage, 'Storage');
  const localStorage = globalThis.localStorage || new Storage();
  const sessionStorage = globalThis.sessionStorage || new Storage();

  class CSSStyleDeclaration {
    constructor() { define(this, '_props', Object.create(null), { enumerable: false }); }
    getPropertyValue(name) { return this._props[String(name)] || ''; }
    setProperty(name, value) { this._props[String(name)] = String(value); this[String(name)] = String(value); }
    removeProperty(name) { const old = this.getPropertyValue(name); delete this._props[String(name)]; delete this[String(name)]; return old; }
    item(i) { return Object.keys(this._props)[Number(i)] || ''; }
    get length() { return Object.keys(this._props).length; }
    toString() { return Object.entries(this._props).map(([k, v]) => `${k}: ${v};`).join(' '); }
  }
  ['getPropertyValue','setProperty','removeProperty','item','toString'].forEach(k => markNative(CSSStyleDeclaration.prototype[k], k));
  markNative(CSSStyleDeclaration, 'CSSStyleDeclaration');

  const CSS_STYLE_DEFAULTS = [
    'width','height','top','left','right','bottom','display','visibility','opacity','position','zIndex','overflow','overflowX','overflowY',
    'color','background','backgroundColor','font','fontSize','fontFamily','fontWeight','lineHeight','textAlign','margin','padding','border',
    'borderTopWidth','borderLeftWidth','transform','webkitTransform','cursor','content','cssText'
  ];
  function makeStyle() {
    const style = new CSSStyleDeclaration();
    for (const p of CSS_STYLE_DEFAULTS) style[p] = '';
    return new Proxy(style, {
      get(target, prop, receiver) {
        if (prop in target) return Reflect.get(target, prop, receiver);
        if (typeof prop === 'string') return prop[0] === '-' ? undefined : '';
        return undefined;
      },
      set(target, prop, value, receiver) {
        if (typeof prop === 'string') target._props[prop] = String(value);
        return Reflect.set(target, prop, value, receiver);
      }
    });
  }

  class DOMTokenList {
    constructor() { this._set = new Set(); }
    add(...tokens) { tokens.forEach(t => this._set.add(String(t))); }
    remove(...tokens) { tokens.forEach(t => this._set.delete(String(t))); }
    contains(token) { return this._set.has(String(token)); }
    toggle(token, force) {
      token = String(token);
      if (force === true) { this._set.add(token); return true; }
      if (force === false) { this._set.delete(token); return false; }
      if (this._set.has(token)) { this._set.delete(token); return false; }
      this._set.add(token); return true;
    }
    item(i) { return Array.from(this._set)[Number(i)] || null; }
    get length() { return this._set.size; }
    toString() { return Array.from(this._set).join(' '); }
  }
  DOMTokenList.prototype.replace = markNative(function replace(oldToken, newToken) { if (this._set.has(String(oldToken))) { this._set.delete(String(oldToken)); this._set.add(String(newToken)); return true; } return false; }, 'replace');
  ['add','remove','contains','toggle','item','toString','replace'].forEach(k => markNative(DOMTokenList.prototype[k], k));
  markNative(DOMTokenList, 'DOMTokenList');

  class Node extends EventTarget {
    constructor() { super(); this.childNodes = []; this.parentNode = null; this.nodeType = 0; this.nodeName = ''; }
    get firstChild() { return this.childNodes[0] || null; }
    get lastChild() { return this.childNodes[this.childNodes.length - 1] || null; }
    appendChild(node) { if (node) { this.childNodes.push(node); node.parentNode = this; if (typeof node.onload === 'function') setTimeout(() => node.onload(new Event('load')), 0); } return node; }
    removeChild(node) { const i = this.childNodes.indexOf(node); if (i >= 0) { this.childNodes.splice(i,1); node.parentNode = null; } return node; }
    insertBefore(node, ref) { const i = this.childNodes.indexOf(ref); if (i < 0) return this.appendChild(node); this.childNodes.splice(i,0,node); node.parentNode = this; return node; }
    cloneNode() { return new Node(); }
    contains(node) { return node === this || this.childNodes.includes(node); }
  }
  ['appendChild','removeChild','insertBefore','cloneNode','contains'].forEach(k => markNative(Node.prototype[k], k));
  markNative(Node, 'Node');

  class Element extends Node {
    constructor(tagName = 'div') {
      super();
      this.nodeType = 1;
      this.tagName = String(tagName).toUpperCase();
      this.nodeName = this.tagName;
      this.localName = String(tagName).toLowerCase();
      this.attributes = Object.create(null);
      this.style = makeStyle();
      this.classList = new DOMTokenList();
      this.dataset = {};
      this.children = this.childNodes;
      define(this, '_innerHTML', '', { enumerable: false });
      this.outerHTML = '';
      this.textContent = '';
      this.innerText = '';
      this.id = '';
      this.className = '';
      this.hidden = false;
      this.clientWidth = 0;
      this.clientHeight = 0;
      this.offsetWidth = 0;
      this.offsetHeight = 0;
      this.scrollWidth = 0;
      this.scrollHeight = 0;
      this.scrollTop = 0;
      this.scrollLeft = 0;
    }
    get innerHTML() { return this._innerHTML; }
    set innerHTML(v) {
      this._innerHTML = String(v);
      // 清空子节点
      this.childNodes.length = 0;
      // 最小 HTML 解析：匹配 <tag></tag> 或 <tag />
      const s = String(v || '').trim();
      const tagRe = /^<(\w+)(?:\s[^>]*)?>([\s\S]*)<\/\1>$/i;
      const selfCloseRe = /^<(\w+)(?:\s[^>]*)?\/>$/i;
      const createByTag = (tag) => {
        const t = String(tag || '').toLowerCase();
        if (t === 'a') return new HTMLAnchorElement();
        if (t === 'canvas') return new HTMLCanvasElement();
        if (t === 'img' || t === 'image') return new HTMLImageElement();
        if (t === 'script') return new HTMLScriptElement();
        if (t === 'span') return new HTMLSpanElement();
        if (t === 'div') return new HTMLDivElement();
        return new HTMLElement(t);
      };
      let m = s.match(tagRe);
      if (m) {
        const child = createByTag(m[1]);
        child._innerHTML = m[2];
        this.appendChild(child);
      } else if ((m = s.match(selfCloseRe))) {
        const child = createByTag(m[1]);
        this.appendChild(child);
      }
    }
    setAttribute(name, value) { name = String(name); this.attributes[name] = String(value); if (name === 'id') this.id = String(value); if (name === 'class') this.className = String(value); }
    getAttribute(name) { name = String(name); return Object.prototype.hasOwnProperty.call(this.attributes, name) ? this.attributes[name] : null; }
    removeAttribute(name) { delete this.attributes[String(name)]; }
    hasAttribute(name) { return Object.prototype.hasOwnProperty.call(this.attributes, String(name)); }
    getAttributeNames() { return Object.keys(this.attributes); }
    querySelector() { return null; }
    querySelectorAll() { return []; }
    getElementsByTagName() { return []; }
    getElementsByClassName() { return []; }
    getBoundingClientRect() { return { x:0, y:0, top:0, left:0, right:0, bottom:0, width:0, height:0, toJSON(){ return this; } }; }
    remove() { if (this.parentNode) this.parentNode.removeChild(this); }
    click() { this.dispatchEvent(new Event('click')); }
    focus() {}
    blur() {}
  }
  ['setAttribute','getAttribute','removeAttribute','hasAttribute','getAttributeNames','querySelector','querySelectorAll','getElementsByTagName','getElementsByClassName','getBoundingClientRect','remove','click','focus','blur'].forEach(k => markNative(Element.prototype[k], k));
  markNative(Element, 'Element');

  class HTMLElement extends Element { constructor(tagName = 'div') { super(tagName); } }
  markNative(HTMLElement, 'HTMLElement');
  class HTMLDivElement extends HTMLElement { constructor() { super('div'); } }
  class HTMLSpanElement extends HTMLElement { constructor() { super('span'); } }
  class HTMLScriptElement extends HTMLElement { constructor() { super('script'); this.src=''; this.async=false; this.defer=false; this._text=''; }
    get text() { return this._text; }
    set text(v) { this._text = String(v); this.textContent = this._text; }
  }
  class HTMLImageElement extends HTMLElement {
    constructor() { super('img'); this.width = 0; this.height = 0; this.complete = false; this._src = ''; }
    get src() { return this._src; }
    set src(v) { this._src = String(v); this.complete = true; if (typeof this.onerror === 'function') this.onerror(new Event('error')); else if (typeof this.onload === 'function') this.onload(new Event('load')); }
  }
  class HTMLAnchorElement extends HTMLElement {
    constructor() { super('a'); this._href = ''; this._updateURL(); }
    get href() { return this._href; }
    set href(v) { this._href = String(v); this._updateURL(); }
    _updateURL() {
      try {
        const u = new URL(this._href, REAL_URL);
        this.protocol = u.protocol; this.host = u.host; this.hostname = u.hostname;
        this.port = u.port; this.pathname = u.pathname; this.search = u.search;
        this.hash = u.hash; this.origin = u.origin;
      } catch (_) {
        this.protocol = ''; this.host = ''; this.hostname = ''; this.port = '';
        this.pathname = ''; this.search = ''; this.hash = ''; this.origin = '';
      }
    }
  }
  markNative(HTMLDivElement, 'HTMLDivElement');
  markNative(HTMLSpanElement, 'HTMLSpanElement');
  markNative(HTMLScriptElement, 'HTMLScriptElement');
  markNative(HTMLImageElement, 'HTMLImageElement');
  markNative(HTMLAnchorElement, 'HTMLAnchorElement');

  // Image 必须是独立构造函数，与 HTMLImageElement !==，模拟浏览器行为。
  // SDK dL[3] Image test 会检查 Image !== HTMLImageElement 和 Image.name === 'Image'。
  function Image(width, height) {
    var img = new HTMLImageElement();
    if (width !== undefined) img.width = Number(width);
    if (height !== undefined) img.height = Number(height);
    return img;
  }
  Image.prototype = HTMLImageElement.prototype;
  markNative(Image, 'Image');

  class CanvasRenderingContext2D {
    constructor(canvas) { this.canvas = canvas; this.fillStyle = '#000000'; this.strokeStyle = '#000000'; this.font = '10px sans-serif'; this.textBaseline = 'alphabetic'; this.textAlign = 'start'; }
    fillRect() {} clearRect() {} strokeRect() {} beginPath() {} closePath() {} moveTo() {} lineTo() {} arc() {} stroke() {} fill() {} save() {} restore() {} translate() {} rotate() {} scale() {}
    fillText() {} strokeText() {}
    measureText(text) { const width = String(text || '').length * 7; return { width, actualBoundingBoxAscent: 9, actualBoundingBoxDescent: 2 }; }
    getImageData(x, y, w, h) { return { data: new Uint8ClampedArray(Math.max(0, w*h*4)), width: w, height: h }; }
    putImageData() {}
    drawImage() {}
    createLinearGradient() { return { addColorStop() {} }; }
    createPattern() { return null; }
  }
  Object.getOwnPropertyNames(CanvasRenderingContext2D.prototype).forEach(k => { if (k !== 'constructor' && typeof CanvasRenderingContext2D.prototype[k] === 'function') markNative(CanvasRenderingContext2D.prototype[k], k); });
  markNative(CanvasRenderingContext2D, 'CanvasRenderingContext2D');

  class WebGLRenderingContext {
    getParameter(p) {
      const map = new Map([
        [0x1F00, 'WebKit'], [0x1F01, 'WebKit WebGL'], [0x1F02, 'WebGL 1.0 (OpenGL ES 2.0 Chromium)'],
        [0x8B4C, 'WebGL GLSL ES 1.0 (OpenGL ES GLSL ES 1.0 Chromium)'],
        [0x9245, 'Google Inc. (Intel)'], [0x9246, 'ANGLE (Intel, Intel(R) UHD Graphics (0x00009B41) Direct3D11 vs_5_0 ps_5_0, D3D11)']
      ]);
      return map.has(p) ? map.get(p) : 0;
    }
    getExtension(name) { return String(name).includes('debug_renderer_info') ? { UNMASKED_VENDOR_WEBGL:0x9245, UNMASKED_RENDERER_WEBGL:0x9246 } : {}; }
    getContextAttributes() { return { alpha: true, antialias: true, depth: true, desynchronized: false, failIfMajorPerformanceCaveat: false, powerPreference: 'default', premultipliedAlpha: true, preserveDrawingBuffer: false, stencil: false, xrCompatible: false }; }
    getSupportedExtensions() { return ['ANGLE_instanced_arrays','EXT_blend_minmax','EXT_clip_control','EXT_color_buffer_half_float','EXT_depth_clamp','EXT_disjoint_timer_query','EXT_float_blend','EXT_frag_depth','EXT_polygon_offset_clamp','EXT_shader_texture_lod','EXT_texture_compression_bptc','EXT_texture_compression_rgtc','EXT_texture_filter_anisotropic','EXT_texture_mirror_clamp_to_edge','EXT_sRGB','KHR_parallel_shader_compile','OES_element_index_uint','OES_fbo_render_mipmap','OES_standard_derivatives','OES_texture_float','OES_texture_float_linear','OES_texture_half_float','OES_texture_half_float_linear','OES_vertex_array_object','WEBGL_blend_func_extended','WEBGL_color_buffer_float','WEBGL_compressed_texture_s3tc','WEBGL_compressed_texture_s3tc_srgb','WEBGL_debug_renderer_info','WEBGL_debug_shaders','WEBGL_depth_texture','WEBGL_draw_buffers','WEBGL_lose_context','WEBGL_multi_draw','WEBGL_polygon_mode']; }
  }
  ['getParameter','getExtension','getContextAttributes','getSupportedExtensions'].forEach(k => markNative(WebGLRenderingContext.prototype[k], k));
  markNative(WebGLRenderingContext, 'WebGLRenderingContext');

  // Canvas toDataURL 缓存（闭包变量，不在类体上）
  let _cachedCanvasDataURL = null;
  function _loadCanvasDataURL() {
    if (_cachedCanvasDataURL !== null) return _cachedCanvasDataURL;
    try {
      const raw = require('fs').readFileSync(require('path').join(__dirname, 'canvas_toDataURL.txt'), 'utf8').trim();
      if (raw.length !== 17282) {
        console.error('[ENV_PATCH] canvas_toDataURL.txt length mismatch:', raw.length, 'expected 17282');
        process.exit(1);
      }
      let h = 0;
      for (let i = 0; i < raw.length; i++) { h = (h << 5) - h + raw.charCodeAt(i); h >>>= 0; }
      if (h !== 3575708862) {
        console.error('[ENV_PATCH] canvas_toDataURL.txt dX hash mismatch:', h, 'expected 3575708862');
        process.exit(1);
      }
      console.log('[ENV_PATCH] canvas_toDataURL loaded: len=' + raw.length + ' hash=' + h + ' OK');
      _cachedCanvasDataURL = raw;
    } catch (e) {
      console.error('[ENV_PATCH] Failed to load canvas_toDataURL.txt:', e.message);
      process.exit(1);
    }
    return _cachedCanvasDataURL;
  }

  class HTMLCanvasElement extends HTMLElement {
    constructor() { super('canvas'); this.width = 300; this.height = 150; }
    getContext(type) {
      const t = String(type || '').toLowerCase();
      if (t === '2d') return new CanvasRenderingContext2D(this);
      if (t.includes('webgl')) return new WebGLRenderingContext();
      return null;
    }
    toDataURL(type = 'image/png') {
      if (type !== 'image/png') return 'data:,' + Buffer.from('fake_env_canvas').toString('base64');
      return _loadCanvasDataURL();
    }
    toBlob(cb) { if (typeof cb === 'function') setTimeout(() => cb(null), 0); }
  }
  ['getContext','toDataURL','toBlob'].forEach(k => markNative(HTMLCanvasElement.prototype[k], k));
  markNative(HTMLCanvasElement, 'HTMLCanvasElement');

  class Document extends Node {
    constructor() {
      super();
      this.nodeType = 9;
      this.nodeName = '#document';
      this.readyState = 'complete';
      this.visibilityState = 'visible';
      this.hidden = false;
      this.wasDiscarded = false;
      this.referrer = '';
      this.title = '';
      this.URL = REAL_URL;
      this.documentURI = REAL_URL;
      this.location = location;
      this.domain = new URL(REAL_URL).hostname;
      this.compatMode = 'CSS1Compat';
      this.characterSet = 'UTF-8';
      this.charset = 'UTF-8';
      this.cookieStore = Object.create(null);
      this.documentElement = new HTMLElement('html');
      this.head = new HTMLElement('head');
      this.body = new HTMLElement('body');
      this.documentElement.appendChild(this.head);
      this.documentElement.appendChild(this.body);
      this.currentScript = new HTMLScriptElement();
      // dK[4] = dX(currentScript.src) — 浏览器 dB 回退到 jQuery CDN script 标签
      this.currentScript.src = 'https://o.alicdn.com/frontend-lib/common-lib/jquery.min.js';
      // 浏览器首次加载时 DOM 尚未完全就绪, 返回空 DOM → dK[3] ≈ 0|0|0|0|0
      this.scripts = [];
      this.fonts = { ready: Promise.resolve(), check: () => true, load: () => Promise.resolve([]), forEach() {}, size: 1 };
      this._fakeElements = {};
    }
    get cookie() { return Object.entries(this.cookieStore).map(([k,v]) => `${k}=${v}`).join('; '); }
    set cookie(v) {
      const s = String(v || '');
      const first = s.split(';')[0];
      const idx = first.indexOf('=');
      if (idx >= 0) this.cookieStore[first.slice(0, idx).trim()] = first.slice(idx + 1).trim();
    }
    createElement(tagName) {
      const t = String(tagName || 'div').toLowerCase();
      if (t === 'a') return new HTMLAnchorElement();
      if (t === 'canvas') return new HTMLCanvasElement();
      if (t === 'img' || t === 'image') return new HTMLImageElement();
      if (t === 'script') return new HTMLScriptElement();
      if (t === 'span') return new HTMLSpanElement();
      if (t === 'div') return new HTMLDivElement();
      return new HTMLElement(t);
    }
    createElementNS(ns, tag) { const el = this.createElement(tag); el.namespaceURI = ns; return el; }
    createTextNode(text) { const n = new Node(); n.nodeType = 3; n.nodeName = '#text'; n.textContent = String(text || ''); return n; }
    getElementById() { return null; }
    getElementsByTagName(tag) {
      tag = String(tag || '').toLowerCase();
      if (tag === 'script') return this.scripts;
      if (tag === 'body') return [this.body];
      if (tag === 'head') return [this.head];
      if (tag === 'html') return [this.documentElement];
      // dK[3] DOM 计数：返回浏览器真实元素数量，避免全零阵列暴露假环境
      if (!this._fakeElements) this._fakeElements = {};
      if (tag in this._fakeElements) return this._fakeElements[tag];
      return [];
    }
    getElementsByClassName() { return []; }
    querySelector(sel) { if (sel === 'body') return this.body; if (sel === 'head') return this.head; if (sel === 'html') return this.documentElement; if (sel === 'script') return this.currentScript; return null; }
    querySelectorAll(sel) { const one = this.querySelector(sel); return one ? [one] : []; }
    write() {}
    writeln() {}
    hasFocus() { return true; }
    getSelection() { return null; }
    createEvent(type) { return new Event(type); }
  }
  ['createElement','createElementNS','createTextNode','getElementById','getElementsByTagName','getElementsByClassName','querySelector','querySelectorAll','write','writeln','hasFocus','getSelection','createEvent'].forEach(k => markNative(Document.prototype[k], k));
  markNative(Document, 'Document');
  class HTMLDocument extends Document {}
  markNative(HTMLDocument, 'HTMLDocument');
  const document = globalThis.document || new Document();
  // 浏览器 document 自身属性多数不可枚举，避免 Object.keys(document) 枚举到补环境内部对象后触发检测逻辑误判。
  for (const __k of Object.keys(document)) {
    try { Object.defineProperty(document, __k, { value: document[__k], configurable: true, writable: true, enumerable: false }); } catch (_) {}
  }

  // MimeType 对象（每个 plugin 里也引用同一份）
  const _mimeObjs = [
    { type: 'application/pdf', suffixes: 'pdf', description: 'Portable Document Format' },
    { type: 'text/pdf', suffixes: 'pdf', description: 'Portable Document Format' },
  ];
  _mimeObjs.forEach(m => {
    Object.defineProperty(m, Symbol.toStringTag, { value: 'MimeType' });
    m.item = markNative(function item(i) { return this[Number(i)] || null; }, 'item');
    m.namedItem = markNative(function namedItem(name) { return this.find(x => x.type === String(name)) || null; }, 'namedItem');
  });
  // 回填 enabledPlugin
  _mimeObjs[0].enabledPlugin = null; _mimeObjs[1].enabledPlugin = null; // 先占位，下面 plugin 构造时补

  const _pluginDefs = [
    { name: 'PDF Viewer', filename: 'internal-pdf-viewer', description: 'Portable Document Format', mimes: [_mimeObjs[0], _mimeObjs[1]] },
    { name: 'Chrome PDF Viewer', filename: 'internal-pdf-viewer', description: 'Portable Document Format', mimes: [_mimeObjs[0], _mimeObjs[1]] },
    { name: 'Chromium PDF Viewer', filename: 'internal-pdf-viewer', description: 'Portable Document Format', mimes: [_mimeObjs[0], _mimeObjs[1]] },
    { name: 'Microsoft Edge PDF Viewer', filename: 'internal-pdf-viewer', description: 'Portable Document Format', mimes: [_mimeObjs[0], _mimeObjs[1]] },
    { name: 'WebKit built-in PDF', filename: 'internal-pdf-viewer', description: 'Portable Document Format', mimes: [_mimeObjs[0], _mimeObjs[1]] },
  ];
  var _pluginArr = _pluginDefs.map((def) => {
    const plugin = {
      name: def.name, filename: def.filename, description: def.description,
      length: def.mimes.length,
      0: def.mimes[0], 1: def.mimes[1],
    };
    def.mimes.forEach(m => { if (!m.enabledPlugin) m.enabledPlugin = plugin; });
    Object.defineProperty(plugin, Symbol.toStringTag, { value: 'Plugin' });
    plugin.item = markNative(function item(i) { return this[Number(i)] || null; }, 'item');
    plugin.namedItem = markNative(function namedItem(name) { return Array.prototype.filter.call(this, m => m && m.type === String(name))[0] || null; }, 'namedItem');
    return plugin;
  });
  // Browser PluginArray is NOT a real Array; Array.isArray returns false.
  var pluginArray = {};
  for (var _pi = 0; _pi < _pluginArr.length; _pi++) pluginArray[_pi] = _pluginArr[_pi];
  pluginArray.length = _pluginArr.length;
  pluginArray.item = markNative(function item(i) { return this[Number(i)] || null; }, 'item');
  pluginArray.namedItem = markNative(function namedItem(name) { return Array.prototype.find.call(this, p => p.name === String(name)) || null; }, 'namedItem');
  pluginArray.refresh = markNative(function refresh() {}, 'refresh');
  Object.defineProperty(pluginArray, Symbol.toStringTag, { value: 'PluginArray' });

  // Browser MimeTypeArray is NOT a real Array; Array.isArray returns false.
  var mimeTypes = {};
  for (var _mi = 0; _mi < _mimeObjs.length; _mi++) mimeTypes[_mi] = _mimeObjs[_mi];
  mimeTypes.length = _mimeObjs.length;
  mimeTypes.item = markNative(function item(i) { return this[Number(i)] || null; }, 'item');
  mimeTypes.namedItem = markNative(function namedItem(name) { return Array.prototype.find.call(this, m => m.type === String(name)) || null; }, 'namedItem');
  Object.defineProperty(mimeTypes, Symbol.toStringTag, { value: 'MimeTypeArray' });

  const navigator = globalThis.navigator || {};
  const navigatorData = {
    userAgent: UA,
    appVersion: UA.replace(/^Mozilla\//, ''),
    appName: 'Netscape',
    appCodeName: 'Mozilla',
    platform: 'Win32',
    product: 'Gecko',
    productSub: '20030107',
    vendor: 'Google Inc.',
    vendorSub: '',
    language: 'en-US',
    languages: ['en-US'],
    cookieEnabled: true,
    onLine: true,
    // webdriver 从 navigatorData 移除，改为在 NavigatorProto 上用 getter 返回 false
    // 这样 navigator.hasOwnProperty('webdriver') === false（浏览器行为）
    hardwareConcurrency: 8,
    deviceMemory: 8,
    maxTouchPoints: 0,
    plugins: pluginArray,
    mimeTypes,
    pdfViewerEnabled: true,
    userAgentData: {
      brands: [
        { brand: 'Chromium', version: '140' },
        { brand: 'Not=A?Brand', version: '24' },
        { brand: 'Google Chrome', version: '140' },
      ],
      mobile: false,
      platform: 'Windows',
      getHighEntropyValues: markNative(async function getHighEntropyValues(hints) {
        const out = { brands: this.brands, mobile: this.mobile, platform: this.platform };
        for (const h of hints || []) {
          if (h === 'architecture') out.architecture = 'x86';
          if (h === 'bitness') out.bitness = '64';
          if (h === 'model') out.model = '';
          if (h === 'platformVersion') out.platformVersion = '10.0.0';
          if (h === 'uaFullVersion') out.uaFullVersion = '140.0.0.0';
          if (h === 'fullVersionList') out.fullVersionList = this.brands.map(b => ({ brand: b.brand, version: b.version + '.0.0.0' }));
        }
        return out;
      }, 'getHighEntropyValues'),
      toJSON() { return { brands: this.brands, mobile: this.mobile, platform: this.platform }; }
    },
    javaEnabled: markNative(function javaEnabled() { return false; }, 'javaEnabled'),
    sendBeacon: markNative(function sendBeacon() { return true; }, 'sendBeacon'),
    getBattery: markNative(function getBattery() { return Promise.resolve({ charging: true, chargingTime: 0, dischargingTime: Infinity, level: 1 }); }, 'getBattery'),
    doNotTrack: null,
    deprecatedRunAdAuctionEnforcesKAnonymity: false,
    connection: { effectiveType: '4g', rtt: 0, downlink: 9.9, saveData: false },
  };
  for (const [k, v] of Object.entries(navigatorData)) define(navigator, k, v, { enumerable: true });

  // webdriver 必须放在原型链上，而非 navigator own property
  // 否则 hasOwnProperty('webdriver')=true → dK[0] bit3=1 → env 检测异常
  const NavigatorProto = { get webdriver() { return false; } };
  Object.defineProperty(NavigatorProto, 'webdriver', { enumerable: true, configurable: true, get: function() { return false; } });
  Object.setPrototypeOf(navigator, NavigatorProto);

  const screen = globalThis.screen || {
    width: 1920, height: 1080, availWidth: 1920, availHeight: 1040,
    colorDepth: 24, pixelDepth: 24, availLeft: 0, availTop: 0, orientation: { angle: 0, type: 'landscape-primary' }
  };

  const history = globalThis.history || {
    length: 2,
    state: null,
    scrollRestoration: 'auto',
    back: markNative(function back() {}, 'back'),
    forward: markNative(function forward() {}, 'forward'),
    go: markNative(function go() {}, 'go'),
    pushState: markNative(function pushState(state, title, url) { this.state = state; if (url) location.assign(url); }, 'pushState'),
    replaceState: markNative(function replaceState(state, title, url) { this.state = state; if (url) location.replace(url); }, 'replaceState'),
  };

  class PerformanceTiming {
    constructor() {
      var ns = Date.now() - 1234;
      this.navigationStart = ns; this.unloadEventStart = 0; this.unloadEventEnd = 0;
      this.redirectStart = 0; this.redirectEnd = 0; this.fetchStart = ns + 1;
      this.domainLookupStart = ns + 2; this.domainLookupEnd = ns + 3;
      this.connectStart = ns + 3; this.connectEnd = ns + 6;
      this.secureConnectionStart = ns + 4;
      this.requestStart = ns + 7; this.responseStart = ns + 33; this.responseEnd = ns + 55;
      this.domLoading = ns + 60; this.domInteractive = ns + 180;
      this.domContentLoadedEventStart = ns + 190; this.domContentLoadedEventEnd = ns + 195;
      this.domComplete = ns + 300; this.loadEventStart = ns + 310; this.loadEventEnd = ns + 320;
      this.domainLookupStart = ns + 2; this.domainLookupEnd = ns + 3;
      this.toJSON = markNative(function toJSON() { return this; }, 'toJSON');
    }
  }
  PerformanceTiming.prototype.secureConnectionStart = 0;
  markNative(PerformanceTiming, 'PerformanceTiming');

  const _timing = new PerformanceTiming();
  const performance = {};
  const navStart = _timing.navigationStart;
  Object.assign(performance, {
    timeOrigin: navStart,
    now: markNative(function now() { return Date.now() - navStart; }, 'now'),
    timing: _timing,
    navigation: { type: 0, redirectCount: 0 },
    memory: { jsHeapSizeLimit: 4294705152, totalJSHeapSize: 50000000, usedJSHeapSize: 25000000 },
    getEntries: markNative(function getEntries(name) {
      // kb bit 23: the SDK checks getEntries(currentScript.src).length > 0
      var scriptSrc = document.currentScript ? document.currentScript.src : '';
      var entry = { name: scriptSrc, entryType: 'resource', startTime: 10, duration: 5, initiatorType: 'script' };
      if (name === undefined) return [entry];
      return name === scriptSrc ? [entry] : [];
    }, 'getEntries'),
    getEntriesByType: markNative(function getEntriesByType(type) { return type === 'navigation' ? [{ type: 'navigate', startTime: 0, duration: this.now() }] : []; }, 'getEntriesByType'),
    getEntriesByName: markNative(function getEntriesByName() { return []; }, 'getEntriesByName'),
    mark: markNative(function mark() {}, 'mark'),
    measure: markNative(function measure() {}, 'measure'),
  });

  const chrome = globalThis.chrome || {
    csi: markNative(function csi() { return { startE: navStart, onloadT: Date.now(), pageT: performance.now(), tran: 15 }; }, 'csi'),
    loadTimes: markNative(function loadTimes() { return { requestTime: navStart / 1000, startLoadTime: navStart / 1000, commitLoadTime: (navStart+10)/1000, finishDocumentLoadTime: (navStart+200)/1000, finishLoadTime: (navStart+300)/1000, firstPaintTime: (navStart+100)/1000, navigationType: 'Other' }; }, 'loadTimes'),
  };
  const indexedDB = globalThis.indexedDB || { open: markNative(function() { return { error: null, result: null, onerror: null, onsuccess: null }; }, 'open'), cmp: markNative(function() { return 0; }, 'cmp'), deleteDatabase: markNative(function() { return { error: null, result: null }; }, 'deleteDatabase') };

  const cryptoObj = globalThis.crypto || {};
  cryptoObj.getRandomValues = cryptoObj.getRandomValues || markNative(function getRandomValues(arr) {
    for (let i = 0; i < arr.length; i++) arr[i] = Math.floor(Math.random() * 256);
    return arr;
  }, 'getRandomValues');
  cryptoObj.randomUUID = cryptoObj.randomUUID || markNative(function randomUUID() { return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random()*16|0; return (c === 'x' ? r : (r&3|8)).toString(16); }); }, 'randomUUID');

  class MutationObserver {
    constructor(cb) { this._cb = cb; }
    observe(target, options) { this._target = target; this._options = options; }
    disconnect() {}
    takeRecords() { return []; }
  }
  ['observe','disconnect','takeRecords'].forEach(k => markNative(MutationObserver.prototype[k], k));
  markNative(MutationObserver, 'MutationObserver');

  class IntersectionObserver { constructor(cb) { this._cb = cb; } observe() {} unobserve() {} disconnect() {} takeRecords() { return []; } }
  ['observe','unobserve','disconnect','takeRecords'].forEach(k => markNative(IntersectionObserver.prototype[k], k));
  markNative(IntersectionObserver, 'IntersectionObserver');
  class ResizeObserver { constructor(cb) { this._cb = cb; } observe() {} unobserve() {} disconnect() {} }
  ['observe','unobserve','disconnect'].forEach(k => markNative(ResizeObserver.prototype[k], k));
  markNative(ResizeObserver, 'ResizeObserver');

  function makeMediaQueryList(query) {
    const q = String(query || '');
    let matches = false;
    const w = 1920, h = 1080;
    const readPx = (name) => {
      const m = q.match(new RegExp(name + '\\s*:\\s*(-?\\d+(?:\\.\\d+)?)px', 'i'));
      return m ? Number(m[1]) : null;
    };
    const minW = readPx('min-(?:device-)?width');
    const maxW = readPx('max-(?:device-)?width');
    const minH = readPx('min-(?:device-)?height');
    const maxH = readPx('max-(?:device-)?height');
    if (minW !== null) matches = w >= minW;
    else if (maxW !== null) matches = w <= maxW;
    else if (minH !== null) matches = h >= minH;
    else if (maxH !== null) matches = h <= maxH;
    else if (/device-width\\s*:\\s*(-?\\d+(?:\\.\\d+)?)px/i.test(q)) matches = w === Number(q.match(/device-width\\s*:\\s*(-?\\d+(?:\\.\\d+)?)px/i)[1]);
    else if (/device-height\\s*:\\s*(-?\\d+(?:\\.\\d+)?)px/i.test(q)) matches = h === Number(q.match(/device-height\\s*:\\s*(-?\\d+(?:\\.\\d+)?)px/i)[1]);
    else if (/orientation\\s*:\\s*landscape/i.test(q)) matches = true;
    else if (/orientation\\s*:\\s*portrait/i.test(q)) matches = false;
    else if (/prefers-color-scheme\\s*:\\s*light/i.test(q)) matches = true;
    else if (/prefers-color-scheme\\s*:\\s*dark/i.test(q)) matches = false;
    else if (/resolution|device-pixel-ratio/i.test(q)) matches = true;
    return {
      media: q,
      matches,
      onchange: null,
      addListener: markNative(function addListener() {}, 'addListener'),
      removeListener: markNative(function removeListener() {}, 'removeListener'),
      addEventListener: markNative(function addEventListener() {}, 'addEventListener'),
      removeEventListener: markNative(function removeEventListener() {}, 'removeEventListener'),
      dispatchEvent: markNative(function dispatchEvent() { return true; }, 'dispatchEvent')
    };
  }


  class XMLHttpRequest extends EventTarget {
    constructor() {
      super();
      this.readyState = 0;
      this.status = 0;
      this.statusText = '';
      this.response = null;
      this.responseText = '';
      this.responseURL = '';
      this.timeout = 0;
      this.withCredentials = false;
      this.onreadystatechange = null;
      this.onload = null;
      this.onerror = null;
      this._headers = {};
    }
    open(method, url, async = true) { this._method = method; this._url = String(url || ''); this.responseURL = this._url; this.readyState = 1; if (typeof this.onreadystatechange === 'function') this.onreadystatechange(); }
    setRequestHeader(k, v) { this._headers[String(k).toLowerCase()] = String(v); }
    getResponseHeader() { return null; }
    getAllResponseHeaders() { return ''; }
    overrideMimeType() {}
    send() { this.readyState = 4; this.status = 204; this.statusText = 'No Content'; if (typeof this.onreadystatechange === 'function') this.onreadystatechange(); if (typeof this.onload === 'function') this.onload(new Event('load')); this.dispatchEvent(new Event('load')); }
    abort() { this.readyState = 0; }
  }
  XMLHttpRequest.UNSENT = 0; XMLHttpRequest.OPENED = 1; XMLHttpRequest.HEADERS_RECEIVED = 2; XMLHttpRequest.LOADING = 3; XMLHttpRequest.DONE = 4;
  XMLHttpRequest.prototype.UNSENT = 0; XMLHttpRequest.prototype.OPENED = 1; XMLHttpRequest.prototype.HEADERS_RECEIVED = 2; XMLHttpRequest.prototype.LOADING = 3; XMLHttpRequest.prototype.DONE = 4;
  ['open','setRequestHeader','getResponseHeader','getAllResponseHeaders','overrideMimeType','send','abort'].forEach(k => markNative(XMLHttpRequest.prototype[k], k));
  markNative(XMLHttpRequest, 'XMLHttpRequest');

  class AudioContext {
    constructor() { this.sampleRate = 48000; this.state = 'running'; this.destination = {}; }
    createOscillator() { return { type: 'sine', frequency: { value: 440 }, connect() {}, start() {}, stop() {}, disconnect() {} }; }
    createAnalyser() { return { fftSize: 2048, frequencyBinCount: 1024, getFloatFrequencyData(arr){ if (arr) arr.fill(-100); }, getByteFrequencyData(arr){ if (arr) arr.fill(0); }, connect(){}, disconnect(){} }; }
    createGain() { return { gain: { value: 1 }, connect(){}, disconnect(){} }; }
    close() { this.state = 'closed'; return Promise.resolve(); }
    resume() { this.state = 'running'; return Promise.resolve(); }
  }
  ['createOscillator','createAnalyser','createGain','close','resume'].forEach(k => markNative(AudioContext.prototype[k], k));
  markNative(AudioContext, 'AudioContext');

  // kb bit 7: OfflineAudioContext.prototype 在浏览器中没有 close 方法
  // 必须和 AudioContext 分开定义
  class _OfflineAudioContext {
    constructor() { this.sampleRate = 48000; this.state = 'running'; this.destination = {}; }
    createOscillator() { return AudioContext.prototype.createOscillator(); }
    createAnalyser() { return AudioContext.prototype.createAnalyser(); }
    createGain() { return AudioContext.prototype.createGain(); }
    resume() { this.state = 'running'; return Promise.resolve(); }
  }
  ['createOscillator','createAnalyser','createGain','resume'].forEach(k => markNative(_OfflineAudioContext.prototype[k], k));
  markNative(_OfflineAudioContext, 'OfflineAudioContext');

  // windowObj 通过原型继承 globalThis 的所有原生 API（console/Object/Array/...）
  // 但显式覆盖 Node 特有泄漏属性（Buffer/spawn/emit/process/domAutomation），
  // 让 dy() 和 dK 检测看到 undefined 而非 Node 痕迹。
  const windowObj = Object.create(globalThis, {
    Buffer:       { value: undefined, writable: true, configurable: true, enumerable: false },
    process:      { value: undefined, writable: true, configurable: true, enumerable: false },
    spawn:        { value: undefined, writable: true, configurable: true, enumerable: false },
    emit:         { value: undefined, writable: true, configurable: true, enumerable: false },
    domAutomation:{ value: undefined, writable: true, configurable: true, enumerable: false },
  });

  // === speechSynthesis + AN (HXdISCF_APP_WAFeue) ===
  // An() 需要 voices 列表来计算 dL[0] = voiceCount | dX(JSON) | hasGoogleVoice
  const speechSynthesisVoices = [
    {voiceURI:"Microsoft Huihui - Chinese (Simplified, PRC)",lang:"zh-CN",name:"Microsoft Huihui - Chinese (Simplified, PRC)",default:true},
    {voiceURI:"Microsoft Kangkang - Chinese (Simplified, PRC)",lang:"zh-CN",name:"Microsoft Kangkang - Chinese (Simplified, PRC)",default:false},
    {voiceURI:"Microsoft Yaoyao - Chinese (Simplified, PRC)",lang:"zh-CN",name:"Microsoft Yaoyao - Chinese (Simplified, PRC)",default:false},
    {voiceURI:"Google Deutsch",lang:"de-DE",name:"Google Deutsch",default:false},
    {voiceURI:"Google US English",lang:"en-US",name:"Google US English",default:false},
    {voiceURI:"Google UK English Female",lang:"en-GB",name:"Google UK English Female",default:false},
    {voiceURI:"Google UK English Male",lang:"en-GB",name:"Google UK English Male",default:false},
    {voiceURI:"Google español",lang:"es-ES",name:"Google español",default:false},
    {voiceURI:"Google español de Estados Unidos",lang:"es-US",name:"Google español de Estados Unidos",default:false},
    {voiceURI:"Google français",lang:"fr-FR",name:"Google français",default:false},
    {voiceURI:"Google हिन्दी",lang:"hi-IN",name:"Google हिन्दी",default:false},
    {voiceURI:"Google Bahasa Indonesia",lang:"id-ID",name:"Google Bahasa Indonesia",default:false},
    {voiceURI:"Google italiano",lang:"it-IT",name:"Google italiano",default:false},
    {voiceURI:"Google 日本語",lang:"ja-JP",name:"Google 日本語",default:false},
    {voiceURI:"Google 한국의",lang:"ko-KR",name:"Google 한국의",default:false},
    {voiceURI:"Google Nederlands",lang:"nl-NL",name:"Google Nederlands",default:false},
    {voiceURI:"Google polski",lang:"pl-PL",name:"Google polski",default:false},
    {voiceURI:"Google português do Brasil",lang:"pt-BR",name:"Google português do Brasil",default:false},
    {voiceURI:"Google русский",lang:"ru-RU",name:"Google русский",default:false},
    {voiceURI:"Google 普通话（中国大陆）",lang:"zh-CN",name:"Google 普通话（中国大陆）",default:false},
    {voiceURI:"Google 粤語（香港）",lang:"zh-HK",name:"Google 粤語（香港）",default:false},
    {voiceURI:"Google 國語（臺灣）",lang:"zh-TW",name:"Google 國語（臺灣）",default:false},
    {voiceURI:"Google Deutsch",lang:"de-DE",name:"Google Deutsch",default:false},
    {voiceURI:"Google US English",lang:"en-US",name:"Google US English",default:false},
    {voiceURI:"Google UK English Female",lang:"en-GB",name:"Google UK English Female",default:false},
    {voiceURI:"Google UK English Male",lang:"en-GB",name:"Google UK English Male",default:false},
    {voiceURI:"Google español",lang:"es-ES",name:"Google español",default:false},
    {voiceURI:"Google español de Estados Unidos",lang:"es-US",name:"Google español de Estados Unidos",default:false},
    {voiceURI:"Google français",lang:"fr-FR",name:"Google français",default:false},
    {voiceURI:"Google हिन्दी",lang:"hi-IN",name:"Google हिन्दी",default:false},
    {voiceURI:"Google Bahasa Indonesia",lang:"id-ID",name:"Google Bahasa Indonesia",default:false},
    {voiceURI:"Google italiano",lang:"it-IT",name:"Google italiano",default:false},
    {voiceURI:"Google 日本語",lang:"ja-JP",name:"Google 日本語",default:false},
    {voiceURI:"Google 한국의",lang:"ko-KR",name:"Google 한국의",default:false},
    {voiceURI:"Google Nederlands",lang:"nl-NL",name:"Google Nederlands",default:false},
    {voiceURI:"Google polski",lang:"pl-PL",name:"Google polski",default:false},
    {voiceURI:"Google português do Brasil",lang:"pt-BR",name:"Google português do Brasil",default:false},
    {voiceURI:"Google русский",lang:"ru-RU",name:"Google русский",default:false},
    {voiceURI:"Google 普通话（中国大陆）",lang:"zh-CN",name:"Google 普通话（中国大陆）",default:false},
    {voiceURI:"Google 粤語（香港）",lang:"zh-HK",name:"Google 粤語（香港）",default:false},
    {voiceURI:"Google 國語（臺灣）",lang:"zh-TW",name:"Google 國語（臺灣）",default:false}
  ];

  const speechSynthesis = globalThis.speechSynthesis || {
    _voices: speechSynthesisVoices,
    getVoices: markNative(function getVoices() { return speechSynthesisVoices.slice(0, 22); }, 'getVoices'),
    addEventListener: markNative(function addEventListener(type, cb) {}, 'addEventListener'),
    removeEventListener: markNative(function removeEventListener() {}, 'removeEventListener'),
    speaking: false,
    paused: false,
    pending: false,
    onvoiceschanged: null,
  };
  const fakeGetVoices = speechSynthesis.getVoices;

  const windowProps = {
    window: windowObj, self: windowObj, globalThis, top: windowObj, parent: windowObj,
    frames: windowObj, opener: null, closed: false, name: '', status: '',
    origin: new URL(REAL_URL).origin,
    document, location, navigator, history, screen, localStorage, sessionStorage, performance, chrome, crypto: cryptoObj,
    EventTarget, Event: globalThis.Event, CustomEvent: globalThis.CustomEvent, Node, Element, HTMLElement, HTMLDocument, Document,
    HTMLDivElement, HTMLSpanElement, HTMLScriptElement, HTMLImageElement, HTMLAnchorElement, HTMLCanvasElement, CanvasRenderingContext2D, WebGLRenderingContext,
    CSSStyleDeclaration, DOMTokenList, Image, XMLHttpRequest,
    indexedDB, safari: undefined,
    MutationObserver, IntersectionObserver, ResizeObserver,
    speechSynthesis, 'HXdISCF_APP_WAFeue': fakeGetVoices,
    AudioContext, OfflineAudioContext: _OfflineAudioContext, MouseEvent, KeyboardEvent, TouchEvent, PointerEvent,
    // WebKit 特征 (dM[4] kD 位掩码)
    webkitRTCPeerConnection: markNative(class webkitRTCPeerConnection {}, 'webkitRTCPeerConnection'),
    // Chrome 特有 API，参与 dM 指纹 Wd 字段。
    // 浏览器 Wd=28: ApplePaySession(0)+ApplePayError(0)+Bluetooth(1)+BluetoothDevice(1)+BluetoothUUID(1)
    Bluetooth: markNative(class Bluetooth {}, 'Bluetooth'),
    BluetoothDevice: markNative(class BluetoothDevice {}, 'BluetoothDevice'),
    BluetoothUUID: markNative({}, 'BluetoothUUID'),
    // isSecureContext (参与 bitmask ky 字段)
    isSecureContext: true,
    // Chrome 特有属性，参与 dM[7] feature bitmask 高位
    // 注意：env_fill.js 会对 navigator 做 Proxy 包装，clientInformation 跳过此处，在下方用 defineGetter 定义
    PerformanceServerTiming: markNative(class PerformanceServerTiming {}, 'PerformanceServerTiming'),  // bit 16
    PerformanceTiming,                                                                                // ky bit 8
    // kb bit 16: getMatchedCSSRules — 浏览器 Chrome 140 没有此属性，移除
    devicePixelRatio: 1, innerWidth: 1904, innerHeight: 937, outerWidth: 1920, outerHeight: 1080,
    screenX: 0, screenY: 0, screenLeft: 0, screenTop: 0, pageXOffset: 0, pageYOffset: 0,
    scrollX: 0, scrollY: 0, length: 0,
    atob: globalThis.atob || markNative((s) => Buffer.from(String(s), 'base64').toString('binary'), 'atob'),
    btoa: globalThis.btoa || markNative((s) => Buffer.from(String(s), 'binary').toString('base64'), 'btoa'),
    getComputedStyle: markNative(function getComputedStyle(el) { return (el && el.style) || makeStyle(); }, 'getComputedStyle'),
    matchMedia: markNative(function matchMedia(q) { if (process.env.ENV_MATCH_DEBUG === '1') console.log('[matchMedia]', q); return makeMediaQueryList(q); }, 'matchMedia'),
    requestAnimationFrame: markNative(function requestAnimationFrame(cb) { return setTimeout(() => cb(Date.now()), 16); }, 'requestAnimationFrame'),
    cancelAnimationFrame: markNative(function cancelAnimationFrame(id) { clearTimeout(id); }, 'cancelAnimationFrame'),
    requestIdleCallback: markNative(function requestIdleCallback(cb) { return setTimeout(() => cb({ didTimeout: false, timeRemaining: () => 50 }), 1); }, 'requestIdleCallback'),
    cancelIdleCallback: markNative(function cancelIdleCallback(id) { clearTimeout(id); }, 'cancelIdleCallback'),
    scrollTo: markNative(function scrollTo() {}, 'scrollTo'), scrollBy: markNative(function scrollBy() {}, 'scrollBy'),
    open: markNative(function open() { return windowObj; }, 'open'), close: markNative(function close() {}, 'close'),
    alert: markNative(function alert() {}, 'alert'), confirm: markNative(function confirm() { return true; }, 'confirm'), prompt: markNative(function prompt() { return ''; }, 'prompt'),
    fetch: globalThis.fetch || markNative(function fetch() { return Promise.reject(new TypeError('Network disabled in env_patch')); }, 'fetch'),
  };

  for (const [k, v] of Object.entries(windowProps)) define(windowObj, k, v, { enumerable: true });
  // 同步到 globalThis，解决裸变量读取：navigator / document / localStorage / Image 等。
  for (const [k, v] of Object.entries(windowProps)) define(globalThis, k, v, { enumerable: true });

  define(globalThis, 'window', windowObj, { enumerable: true });
  define(globalThis, 'self', windowObj, { enumerable: true });
  define(globalThis, 'top', windowObj, { enumerable: true });
  define(globalThis, 'parent', windowObj, { enumerable: true });

  // 补浏览器特有 API（参与 dK 和 kb 检测）
  define(windowObj, 'XPathResult', {}, { enumerable: true });
  define(globalThis, 'XPathResult', {}, { enumerable: true });
  // console.debug 必须为空函数，否则 dy() env detection 会触发 stack getter (bit4=1)
  define(windowObj, 'console', Object.create(globalThis.console, {
    debug: { value: markNative(function(){}, 'debug'), writable: true, configurable: true, enumerable: true }
  }));

  // windowObj 已是独立对象（Object.create） → Buffer/spawn/emit/process 等 Node 全局不会泄漏

  // 兼容 Node v22 自带 navigator：某些属性只读时再尝试 getter。
  for (const [k, v] of Object.entries(navigatorData)) {
    if (!(k in navigator) || navigator[k] !== v) {
      try { defineGetter(navigator, k, () => v, { enumerable: true }); } catch (_) {}
    }
  }

  Object.defineProperty(windowObj, Symbol.toStringTag, { value: 'Window', configurable: true });

  // 修复 hasOwnProperty 检测：windowObj = Object.create(globalThis) 导致 Touch/Proxy/BigInt
  // 等标准内置属于继承属性而非 own。浏览器中 window.hasOwnProperty('Touch') === true。
  // 在插入假原型链之前，先把 globalThis 的所有可枚举属性同步为 windowObj 的 own properties。
  for (const _k of Object.getOwnPropertyNames(globalThis)) {
    if (!(_k in windowObj) || !windowObj.hasOwnProperty(_k)) {
      try { Object.defineProperty(windowObj, _k, Object.getOwnPropertyDescriptor(globalThis, _k) || { value: globalThis[_k], configurable: true, writable: true, enumerable: false }); } catch (_) {}
    }
  }

  // dh[0] proto hash 修复：模拟浏览器原型链
  // 浏览器实测: window → Window.prototype [Window] → WindowProperties [WindowProperties]
  //            → EventTarget.prototype [EventTarget] → Object.prototype [Object]
  // dh[0] = dX(''+window.__proto__.__proto__, 0, 1) = dX('[object WindowProperties]', 0, 1)
  var _FakeWinProto = {};
  Object.defineProperty(_FakeWinProto, Symbol.toStringTag, { value: 'Window' });
  var _FakeWindowProperties = {};
  Object.defineProperty(_FakeWindowProperties, Symbol.toStringTag, { value: 'WindowProperties' });
  var _FakeEventTarget = {};
  Object.defineProperty(_FakeEventTarget, Symbol.toStringTag, { value: 'EventTarget' });
  Object.setPrototypeOf(_FakeWinProto, _FakeWindowProperties);
  Object.setPrototypeOf(_FakeWindowProperties, _FakeEventTarget);
  Object.setPrototypeOf(_FakeEventTarget, Object.getPrototypeOf(windowObj));
  Object.setPrototypeOf(windowObj, _FakeWinProto);
  Object.defineProperty(document, Symbol.toStringTag, { value: 'HTMLDocument', configurable: true });
  Object.defineProperty(navigator, Symbol.toStringTag, { value: 'Navigator', configurable: true });
  // clientInformation 必须是 navigator 的实时引用（env_fill 会 Proxy 包装 navigator）
  defineGetter(windowObj, 'clientInformation', function() { return this.navigator; }, { enumerable: true });
  defineGetter(globalThis, 'clientInformation', function() { return this.navigator; }, { enumerable: true });
  Object.defineProperty(location, Symbol.toStringTag, { value: 'Location', configurable: true });
  Object.defineProperty(screen, Symbol.toStringTag, { value: 'Screen', configurable: true });
  Object.defineProperty(history, Symbol.toStringTag, { value: 'History', configurable: true });

  // 可选环境监控：设置 ENV_DEBUG=1 打开，避免默认日志过多影响脚本逻辑。
  if (process.env.ENV_DEBUG === '1') {
    const watchList = ['window','document','location','navigator','history','screen','localStorage','sessionStorage','performance'];
    for (const name of watchList) {
      const raw = globalThis[name];
      if (!raw || typeof raw !== 'object') continue;
      const proxy = new Proxy(raw, {
        get(target, property, receiver) {
          let value;
          try { value = Reflect.get(target, property, receiver); } catch (e) { value = undefined; }
          console.log('[ENV:get]', name, String(property), '=>', typeof value, value && typeof value === 'object' ? Object.prototype.toString.call(value) : value);
          return value;
        },
        set(target, property, value, receiver) {
          console.log('[ENV:set]', name, String(property), '<=', typeof value, value);
          return Reflect.set(target, property, value, receiver);
        },
        has(target, property) {
          const ret = property in target;
          console.log('[ENV:has]', name, String(property), '=>', ret);
          return ret;
        },
        getOwnPropertyDescriptor(target, property) {
          const ret = Reflect.getOwnPropertyDescriptor(target, property);
          console.log('[ENV:desc]', name, String(property), '=>', !!ret);
          return ret;
        }
      });
      define(globalThis, name, proxy, { enumerable: true });
      define(windowObj, name, proxy, { enumerable: true });
    }
  }

  // 调试导出，不参与业务。
  define(globalThis, '__ENV_PATCH_DUMP__', function dumpEnv() {
    return {
      href: location.href,
      ua: navigator.userAgent,
      cookie: document.cookie,
      localStorage: typeof localStorage._dump === 'function' ? localStorage._dump() : undefined,
      sessionStorage: typeof sessionStorage._dump === 'function' ? sessionStorage._dump() : undefined,
    };
  }, { enumerable: false });

  // === Gg.x payload 拦截 hook ===
  // 在 1.js 加载前劫持 Array.prototype.join("^")，
  // 捕获最终 payload 明文（Gg.x 的输入）和下游 cookie 写入。
  (function installPayloadHook() {
    var _origJoin = Array.prototype.join;
    Array.prototype.join = function(sep) {
      var result = _origJoin.call(this, sep);
      if (sep === '^' && typeof result === 'string' && result.indexOf('websdk') >= 0) {
        globalThis.__GGX_PAYLOADS = globalThis.__GGX_PAYLOADS || [];
        var entry = {
          len: result.length,
          payload: result,
          time: Date.now(),
        };
        globalThis.__GGX_PAYLOADS.push(entry);
      }
      return result;
    };
    console.log('[ENV_PATCH] Array.prototype.join payload hook installed');
  })();

  // Hook document.cookie setter 以捕获 Gg.x 编码后的输出
  (function installCookieHook() {
    try {
      var _doc = document;
      var _cookieDesc = Object.getOwnPropertyDescriptor(_doc, 'cookie');
      if (_cookieDesc && _cookieDesc.set) {
        var _origSet = _cookieDesc.set;
        Object.defineProperty(_doc, 'cookie', {
          get: _cookieDesc.get,
          set: function(val) {
            if (typeof val === 'string' && val.indexOf('ssxmod_itna') >= 0) {
              var m = val.match(/ssxmod_itna=([^;]+)/);
              var m2 = val.match(/ssxmod_itna2=([^;]+)/);
              globalThis.__COOKIE_WRITES = globalThis.__COOKIE_WRITES || [];
              globalThis.__COOKIE_WRITES.push({
                itna_len: m ? m[1].length : 0,
                itna2_len: m2 ? m2[1].length : 0,
                time: Date.now(),
              });
            }
            _origSet.call(_doc, val);
          },
          configurable: true,
        });
        console.log('[ENV_PATCH] document.cookie setter hook installed');
      }
    } catch(e) {
      console.log('[ENV_PATCH] document.cookie hook failed:', e.message);
    }
  })();
})();
