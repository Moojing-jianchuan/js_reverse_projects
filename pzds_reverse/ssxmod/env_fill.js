'use strict';

/**
 * env_fill.js
 *
 * 职责：
 * 1. 监控 1.js 实际访问了哪些环境对象、属性、方法。
 * 2. 吐出缺失项、set/call 路径、cookie/storage 写入。
 * 3. 生成 env_log.txt，作为下一轮完善 env_patch.js 的依据；默认不向控制台输出任何诊断日志。
 *
 * 注意：
 * - 本脚本必须在 env_patch.js 之后、1.js 之前加载。
 * - 本脚本只诊断，不负责补环境。
 * - 不会把缺失对象自动补成 {}，避免掩盖真实缺失点。
 * - 默认不代理 window 根对象，避免破坏 window === globalThis；但会监控常见 window 标量属性。
 *   如果必须监控 window.xxx，可设置 ENV_FILL_PROXY_WINDOW=1。
 */

(function installEnvFillDiagnostics() {
  if (globalThis.__ENV_FILL_INSTALLED__) return;

  const fs = require('fs');
  const path = require('path');

  const DEFAULT_LOG_PATH = 'D:\\downloads\\cache\\js_reverse\\pzds_reverse\\ssxmod\\env_log.txt';
  const LOG_PATH = process.env.ENV_LOG_PATH
    ? path.resolve(process.env.ENV_LOG_PATH)
    : DEFAULT_LOG_PATH;

  const MAX_PRINT = Number(process.env.ENV_FILL_MAX_PRINT || 3);
  const TRACE_GET = process.env.ENV_FILL_TRACE_GET === '1';
  const TRACE_ALL = process.env.ENV_FILL_TRACE_ALL === '1';
  const PROXY_WINDOW = process.env.ENV_FILL_PROXY_WINDOW === '1';

  function writeLine(line) {
    try {
      fs.appendFileSync(LOG_PATH, line + '\n', 'utf8');
    } catch (e) {
      // 日志失败不能影响 1.js 运行。
    }
  }

  function writeOnlyFile(line) {
    try {
      fs.appendFileSync(LOG_PATH, line + '\n', 'utf8');
    } catch (e) {}
  }

  try {
    fs.mkdirSync(path.dirname(LOG_PATH), { recursive: true });
    fs.writeFileSync(
      LOG_PATH,
      [
        '===== ENV FILL LOG START =====',
        'time=' + new Date().toISOString(),
        'cwd=' + process.cwd(),
        'node=' + process.version,
        'workflow=env_patch.js -> env_fill.js -> 1.js',
        ''
      ].join('\n') + '\n',
      'utf8'
    );
  } catch (e) {
    console.error('[ENV-FILL][LOG-INIT-FAILED]', e && e.message || e);
  }

  Object.defineProperty(globalThis, '__ENV_FILL_INSTALLED__', {
    value: true,
    configurable: false,
    enumerable: false,
    writable: false
  });

  const rawToProxy = new WeakMap();
  const proxyToRaw = new WeakMap();

  const stats = {
    get: Object.create(null),
    set: Object.create(null),
    call: Object.create(null),
    missing: Object.create(null),
    has: Object.create(null),
    desc: Object.create(null),
    error: Object.create(null),
    rootMissing: Object.create(null),
    cookieSets: [],
    storageSets: [],
    callsOfInterest: []
  };

  const importantPattern = /cookie|storage|localStorage|sessionStorage|ssxmod|itna|navigator|plugins|mimeTypes|userAgent|screen|width|height|devicePixelRatio|canvas|getContext|toDataURL|webgl|matchMedia|currentScript|referrer|location|href|Date|Math|random|performance|font|document|window|chrome|CSS|Image|Audio|XMLHttpRequest|fetch|WebGL|Canvas|Element|Event|Observer|crypto|permission|connection|indexedDB|openDatabase|speech|Notification|Worker|URL|Blob|FormData/i;

  function inc(bucket, key) {
    key = String(key);
    bucket[key] = (bucket[key] || 0) + 1;
    return bucket[key];
  }

  function shortValue(value) {
    const t = typeof value;
    if (value === null) return 'null';
    if (t === 'undefined') return 'undefined';
    if (t === 'string') {
      const s = value.length > 180 ? value.slice(0, 180) + '...(len=' + value.length + ')' : value;
      return JSON.stringify(s);
    }
    if (t === 'number' || t === 'boolean' || t === 'bigint') return String(value);
    if (t === 'function') return '[Function ' + (value.name || 'anonymous') + ']';
    try {
      return Object.prototype.toString.call(value);
    } catch (_) {
      return '[' + t + ']';
    }
  }

  function shortArgs(args) {
    return Array.prototype.slice.call(args, 0, 6).map(shortValue).join(', ');
  }

  function shouldPrint(kind, pathName, count) {
    if (TRACE_ALL) return count <= MAX_PRINT;
    if (kind === 'get' && !TRACE_GET && !importantPattern.test(pathName)) return false;
    return count <= MAX_PRINT;
  }

  function log(kind, pathName, extra) {
    const bucket = stats[kind] || (stats[kind] = Object.create(null));
    const count = inc(bucket, pathName);
    const line = `[ENV-FILL-${kind.toUpperCase()}] ${pathName}${extra ? ' ' + extra : ''}`;
    // 环境访问日志只写入 env_log.txt，不输出到控制台。
    writeOnlyFile(line);
  }

  function rawThis(value) {
    return proxyToRaw.get(value) || value;
  }

  /**
   * Proxy invariant 保护：
   * 如果目标对象有不可配置且不可写的数据属性，Proxy get trap 必须返回原始值，不能返回代理包装值。
   * 典型场景：Element.prototype、Document.prototype 等构造函数 prototype 属性。
   */
  function mustReturnRawDescriptorValue(target, property) {
    try {
      const d = Reflect.getOwnPropertyDescriptor(target, property);
      return !!(d && 'value' in d && d.configurable === false && d.writable === false);
    } catch (_) {
      return false;
    }
  }

  function isProxyUnsafe(value) {
    if (!value) return true;
    if (value === globalThis.process) return true;
    if (value === console) return true;
    if (value === module || value === require) return true;
    if (value instanceof Promise) return true;
    return false;
  }

  function proxify(value, pathName) {
    const t = typeof value;
    if ((t !== 'object' && t !== 'function') || value === null) return value;
    if (isProxyUnsafe(value)) return value;

    if (rawToProxy.has(value)) return rawToProxy.get(value);

    const handler = t === 'function' ? functionHandler(pathName) : objectHandler(pathName);

    let proxy;
    try {
      proxy = new Proxy(value, handler);
    } catch (e) {
      log('error', pathName, 'proxy-failed=' + shortValue(e && e.message));
      return value;
    }

    rawToProxy.set(value, proxy);
    proxyToRaw.set(proxy, value);
    return proxy;
  }

  function objectHandler(basePath) {
    return {
      get(target, property, receiver) {
        if (property === '__ENV_FILL_RAW__') return target;
        if (property === '__ENV_FILL_PATH__') return basePath;

        const propName = typeof property === 'symbol' ? property.toString() : String(property);
        const pathName = basePath + '.' + propName;

        let value;
        try {
          value = Reflect.get(target, property, receiver);
        } catch (e) {
          log('error', pathName, 'get-throw=' + shortValue(e && e.message));
          return undefined;
        }

        if (typeof property !== 'symbol') {
          if (value === undefined) {
            log('missing', pathName, '=> undefined');
          } else {
            log('get', pathName, '=> ' + typeof value + ' ' + shortValue(value));
          }
        }

        if (mustReturnRawDescriptorValue(target, property)) return value;
        return proxify(value, pathName);
      },

      set(target, property, value, receiver) {
        const propName = typeof property === 'symbol' ? property.toString() : String(property);
        const pathName = basePath + '.' + propName;

        log('set', pathName, '<= ' + typeof value + ' ' + shortValue(value));

        if (basePath === 'document' && propName === 'cookie') {
          const raw = String(value);
          stats.cookieSets.push(raw);
          const m = raw.match(/^([^=;]+)=([^;]*)/);
          if (m) {
            writeLine(`[ENV-FILL-COOKIE-SET] key=${m[1]} valueLen=${m[2].length} preview=${m[2].slice(0, 220)}`);
          } else {
            writeLine('[ENV-FILL-COOKIE-SET] raw=' + raw.slice(0, 220));
          }
        }

        try {
          return Reflect.set(target, property, value, receiver);
        } catch (e) {
          log('error', pathName, 'set-throw=' + shortValue(e && e.message));
          return false;
        }
      },

      has(target, property) {
        const propName = typeof property === 'symbol' ? property.toString() : String(property);
        const pathName = basePath + '.' + propName;
        let ret = false;
        try { ret = Reflect.has(target, property); } catch (_) {}
        log('has', pathName, '=> ' + ret);
        return ret;
      },

      getOwnPropertyDescriptor(target, property) {
        const propName = typeof property === 'symbol' ? property.toString() : String(property);
        const pathName = basePath + '.' + propName;
        let ret;
        try { ret = Reflect.getOwnPropertyDescriptor(target, property); } catch (_) { ret = undefined; }
        log('desc', pathName, '=> ' + (ret ? 'found' : 'missing'));
        return ret;
      }
    };
  }

  function functionHandler(basePath) {
    return {
      apply(target, thisArg, args) {
        const argsText = shortArgs(args);
        log('call', basePath, '(' + argsText + ')');

        if (/localStorage\.setItem|sessionStorage\.setItem/i.test(basePath)) {
          const key = args && args.length ? String(args[0]) : '';
          const val = args && args.length > 1 ? String(args[1]) : '';
          stats.storageSets.push({ path: basePath, key, valueLength: val.length, preview: val.slice(0, 220) });
          writeLine(`[ENV-FILL-STORAGE-SET] ${basePath} key=${key} valueLen=${val.length} preview=${val.slice(0, 220)}`);
        }

        if (importantPattern.test(basePath)) {
          stats.callsOfInterest.push({
            path: basePath,
            args: Array.prototype.slice.call(args, 0, 4).map(shortValue)
          });
        }

        try {
          const result = Reflect.apply(target, rawThis(thisArg), Array.prototype.map.call(args, rawThis));
          return proxify(result, basePath + '()');
        } catch (e) {
          log('error', basePath, 'call-throw=' + shortValue(e && e.message));
          throw e;
        }
      },

      get(target, property, receiver) {
        if (property === '__ENV_FILL_RAW__') return target;
        if (property === '__ENV_FILL_PATH__') return basePath;

        const propName = typeof property === 'symbol' ? property.toString() : String(property);
        const pathName = basePath + '.' + propName;

        let value;
        try {
          value = Reflect.get(target, property, receiver);
        } catch (e) {
          log('error', pathName, 'get-throw=' + shortValue(e && e.message));
          return undefined;
        }

        if (typeof property !== 'symbol') {
          if (value === undefined) log('missing', pathName, '=> undefined');
          else log('get', pathName, '=> ' + typeof value + ' ' + shortValue(value));
        }

        if (mustReturnRawDescriptorValue(target, property)) return value;
        return proxify(value, pathName);
      },

      set(target, property, value, receiver) {
        const propName = typeof property === 'symbol' ? property.toString() : String(property);
        const pathName = basePath + '.' + propName;
        log('set', pathName, '<= ' + typeof value + ' ' + shortValue(value));
        try {
          return Reflect.set(target, property, value, receiver);
        } catch (e) {
          log('error', pathName, 'set-throw=' + shortValue(e && e.message));
          return false;
        }
      }
    };
  }

  function installRoot(name) {
    if (name === 'window' && !PROXY_WINDOW) {
      writeLine('[ENV-FILL] window root proxy skipped to preserve window===globalThis. Set ENV_FILL_PROXY_WINDOW=1 if needed.');
      return;
    }

    if (!(name in globalThis)) {
      stats.rootMissing[name] = 1;
      writeLine('[ENV-FILL-ROOT-MISSING] ' + name);
      return;
    }

    const raw = globalThis[name];
    if (!raw || (typeof raw !== 'object' && typeof raw !== 'function')) {
      writeLine('[ENV-FILL-ROOT-SKIP] ' + name + ' type=' + typeof raw);
      return;
    }

    const proxy = proxify(raw, name);

    try {
      Object.defineProperty(globalThis, name, {
        value: proxy,
        configurable: true,
        enumerable: true,
        writable: true
      });
    } catch (e) {
      writeLine('[ENV-FILL-ROOT-WARN] cannot proxy globalThis.' + name + ': ' + (e && e.message || e));
    }

    try {
      if (globalThis.window && typeof globalThis.window === 'object' && name !== 'window') {
        Object.defineProperty(globalThis.window, name, {
          value: proxy,
          configurable: true,
          enumerable: true,
          writable: true
        });
      }
    } catch (_) {}

    writeLine('[ENV-FILL-ROOT] monitoring ' + name);
  }

  const roots = [
    // Core browser objects
    'document',
    'navigator',
    'location',
    'screen',
    'history',
    'localStorage',
    'sessionStorage',
    'performance',
    'crypto',

    // Common window/global APIs often used by fingerprint scripts
    'Image',
    'Audio',
    'XMLHttpRequest',
    'fetch',
    'Headers',
    'Request',
    'Response',
    'URL',
    'URLSearchParams',
    'Blob',
    'File',
    'FileReader',
    'FormData',
    'DOMParser',
    'XMLSerializer',
    'MutationObserver',
    'ResizeObserver',
    'IntersectionObserver',
    'Event',
    'CustomEvent',
    'MouseEvent',
    'KeyboardEvent',
    'TouchEvent',
    'EventTarget',
    'HTMLElement',
    'Element',
    'Node',
    'Document',
    'HTMLDocument',
    'HTMLCanvasElement',
    'CanvasRenderingContext2D',
    'WebGLRenderingContext',
    'WebGL2RenderingContext',
    'Storage',
    'Location',
    'Navigator',
    'PluginArray',
    'MimeTypeArray',
    'Plugin',
    'MimeType',
    'CSS',
    'chrome',
    'speechSynthesis',
    'indexedDB',
    'openDatabase',
    'Notification',
    'Worker',
    'SharedWorker',
    'requestAnimationFrame',
    'cancelAnimationFrame',
    'requestIdleCallback',
    'cancelIdleCallback',
    'setTimeout',
    'setInterval',
    'clearTimeout',
    'clearInterval',
    'atob',
    'btoa',
    'TextEncoder',
    'TextDecoder',
    'getComputedStyle',
    'matchMedia'
  ];

  if (PROXY_WINDOW) roots.unshift('window');

  for (const name of roots) installRoot(name);

  /**
   * 不代理整个 window 的情况下，额外监控高价值 window/global 标量属性。
   * 这样可以捕获 window.devicePixelRatio、window.innerWidth 等读取，
   * 同时尽量不破坏 window === globalThis。
   */
  const windowScalarProps = [
    'innerWidth',
    'innerHeight',
    'outerWidth',
    'outerHeight',
    'devicePixelRatio',
    'screenX',
    'screenY',
    'screenLeft',
    'screenTop',
    'pageXOffset',
    'pageYOffset',
    'scrollX',
    'scrollY',
    'name',
    'status',
    'closed',
    'opener',
    'frames',
    'length',
    'origin',
    'isSecureContext',
    'crossOriginIsolated',
    'clientInformation'
  ];

  function monitorGlobalScalar(prop) {
    if (!(prop in globalThis)) return;

    let current;
    let desc;
    try {
      desc = Object.getOwnPropertyDescriptor(globalThis, prop);
      current = globalThis[prop];
    } catch (_) {
      return;
    }

    if (desc && desc.configurable === false) return;
    if (typeof current === 'function' || (current && typeof current === 'object')) return;

    try {
      Object.defineProperty(globalThis, prop, {
        configurable: true,
        enumerable: desc ? !!desc.enumerable : true,
        get() {
          log('get', 'window.' + prop, '=> ' + typeof current + ' ' + shortValue(current));
          return current;
        },
        set(v) {
          log('set', 'window.' + prop, '<= ' + typeof v + ' ' + shortValue(v));
          current = v;
        }
      });
      writeOnlyFile('[ENV-FILL-WINDOW-SCALAR] monitoring window.' + prop);
    } catch (e) {
      writeOnlyFile('[ENV-FILL-WINDOW-SCALAR-WARN] ' + prop + ' ' + (e && e.message || e));
    }
  }

  for (const prop of windowScalarProps) monitorGlobalScalar(prop);

  function topEntries(bucket, limit) {
    return Object.entries(bucket || {})
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit || 100)
      .map(([pathName, count]) => ({ path: pathName, count }));
  }

  let printed = false;
  function summary(options) {
    options = options || {};
    const data = {
      logPath: LOG_PATH,
      missing: topEntries(stats.missing, 160),
      set: topEntries(stats.set, 100),
      call: topEntries(stats.call, 160),
      error: topEntries(stats.error, 100),
      rootMissing: stats.rootMissing,
      cookieSets: stats.cookieSets.map((s) => {
        const m = String(s).match(/^([^=;]+)=([^;]*)/);
        return m ? { key: m[1], valueLength: m[2].length, preview: m[2].slice(0, 220) } : { raw: String(s).slice(0, 220) };
      }),
      storageSets: stats.storageSets,
      callsOfInterest: stats.callsOfInterest.slice(-100)
    };

    const block = [
      '',
      '===== ENV FILL SUMMARY =====',
      'reason=' + (options.reason || 'summary'),
      JSON.stringify(data, null, 2),
      '===== ENV FILL SUMMARY END =====',
      ''
    ].join('\n');

    writeOnlyFile(block);

    // 诊断 summary 只写入 env_log.txt，不输出到控制台。
    if (options.print && !printed) {
      printed = true;
    }

    return data;
  }

  Object.defineProperty(globalThis, '__ENV_FILL_SUMMARY__', {
    value: summary,
    configurable: true,
    enumerable: false,
    writable: false
  });

  Object.defineProperty(globalThis, '__ENV_FILL_LOG_PATH__', {
    value: LOG_PATH,
    configurable: true,
    enumerable: false,
    writable: false
  });

  process.once('exit', () => {
    try { summary({ print: true, reason: 'process_exit' }); } catch (_) {}
  });

  writeLine('[ENV-FILL] diagnostics installed. Log file: ' + LOG_PATH);
  writeLine('[ENV-FILL] workflow: env_patch.js -> env_fill.js -> 1.js');
})();
