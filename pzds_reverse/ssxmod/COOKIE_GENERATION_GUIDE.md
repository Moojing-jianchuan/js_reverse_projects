# ssxmod_itna / ssxmod_itna2 Cookie 生成链路文档

## 一、文件职责

| 文件 | 职责 |
|------|------|
| `1.js` | WAF SDK 原始加密代码（JSVMP），从浏览器提取 |
| `1_ast.js` | `1.js` 的 AST 反混淆版本，可读但变量名仍混淆 |
| `env_patch.js` | 浏览器环境模拟，在 1.js 加载前补齐 window/document/navigator 等 API |
| `env_fill.js` | 只读诊断层，监控 1.js 访问了哪些环境属性，写入 `env_log.txt` |
| `run_with_env.js` | 入口：按 `env_patch → env_fill → 1.js` 顺序加载，注入行为事件，dump cookie |
| `canvas_toDataURL.txt` | 预采集的 canvas fingerprint，启动时 hash 校验防止篡改 |
| `ssxmod_gen.py` | Python 侧调用 `node run_with_env.js` 并解析输出 |
| `NODE_BROWSER_DIFF_REPORT.md` | Node vs Browser 逐字段对齐历史 |

## 二、调用链路

```
test.py
  └─ ssxmod_gen.generate_ssxmod_cookies()
       └─ subprocess: node run_with_env.js
            ├─ require('./env_patch.js')     # 1. 安装浏览器环境
            ├─ require('./env_fill.js')      # 2. 安装诊断代理
            ├─ require('./1.js')             # 3. 执行 WAF SDK（同步）
            ├─ (async) injectBehavior()       # 4. 异步注入行为事件（35ms×24 条 mousemove + keyup）
            └─ setTimeout(dump, 1500)         # 5. 读取 cookie/storage 并输出
```

## 三、Payload 结构

Gg.x 编码前的原始 payload 由 `^` 分隔的多段组成：

### 3.1 ssxmod_itna（环境摘要，16 段）

```
seed^websdk-2.3.18d^ts^counter^kD|flags^locale^tz^kb|ky^AuDims^platFields^canvas^...
^P^g.len^u.len^e.len
^dK[0]^vendor^cores^DOMcounts^dK[4]
^Gi^A8
^dh[0]^dh[1]^dh[2]
^GE(dl)
^dL[0]^dL[1]^dL[2]^dL[3]^dL[4]^dL[5]^dL[6]^dL[7]
```

拼接代码（1_ast.js:938-939）：
```js
[dM.join('^'), [kM.a, kM.g.length, kM.u.length, kM.e.length].join('^'),
 dK.join('^'), Gi, A8, dh.join('^'), GE(dl), dL.join('^')].join('^')
```

### 3.2 ssxmod_itna2（行为明细，16 段）

```
dM[0]^dM[1]^dM[2]^dM[3]
^P^j^g.join('|')^S^u.join('|')^e.join('|')^O^GR^Gf^Gi^A8^GY^Gp^c^Gn^Gr
```

拼接代码（1_ast.js:944-945）：
```js
'1-' + Gg.x(dM.slice(0,4).join('^') + '^' + [kM.a, kM.j, kM.g.join('|'), kM.S,
  kM.u.join('|'), kM.e.join('|'), kM.O, GR, Gf, Gi, A8, GY, Gp, kM.c, Gn, Gr].join('^'), true)
```

### 3.3 字段来源速查

| 字段 | 变量 | 含义 | 来源 |
|------|------|------|------|
| seed | dM[0] | localStorage `__00b204e9800998__` | `AA()` (1_ast.js:949) |
| version | dM[1] | SDK 版本 | 硬编码 `websdk-2.3.18d` |
| ts | dM[2] | 启动时间戳 | `new Date().getTime()` (1_ast.js:53) |
| counter | dM[3] | 事件驱动计数器 | 每次 AG() 调用 `dM[3]++` |
| kD\|flags | dM[4] | 环境位掩码 | `dZ(kv)` 检测 webdriver/phantom 等 |
| locale | dM[5] | 语言 | `navigator.language` |
| tz | dM[6] | 时区偏移 | `new Date().getTimezoneOffset()` |
| kb\|ky | dM[7] | 浏览器特性位掩码 | 24 项检测结果（见五） |
| **Au() dims** | dM[8] | 屏幕/视口 12 字段 | `function Au()` (1_ast.js:987) |
| behavior.a | kM.a | 设备类型 | `'P'` (PC) 或 `'M'` (Mobile) |
| behavior.g | kM.g | mousemove 轨迹 | Gb 数组，每项 `dx+dy+deltaT` |
| behavior.u | kM.u | mousedown/mouseup | GP 数组 |
| behavior.e | kM.e | 键盘/输入事件 | GI 数组，每项 `typeCode+deltaT` |
| dK[0] | dK[0] | env detect | `416` (Chrome 正常值) |
| dK[4] | dK[4] | script hash | `dX(dB.src)` — 当前 script 标签 URL 的 hash |
| dh[0] | dh[0] | proto hash | `dX('[object WindowProperties]')` |
| dL[3] | dL[3] | Image test | `-1`（webdriver 检测为 false 时跳过） |

## 四、关键函数（1_ast.js 行号）

### 4.1 Au() — 屏幕/视口采集（:987）

```js
function Au() {
  return [
    screen.width,      // AT(kD.width, 0)
    screen.height,     // AT(kD.height, 0)
    innerWidth,        // Ag() = innerWidth || clientWidth
    innerHeight,       // innerHeight || clientHeight
    screenTop||screenY,
    screenLeft||screenX,
    matchMedia("min-device-width"),   // -1 if dt=false
    matchMedia("min-device-height"),
    outerWidth,
    outerHeight,
    pageXOffset,
    pageYOffset
  ].join('|');
}
```

**⚠️ 关键**：`innerWidth`/`innerHeight` 不等于 `screen.width`/`screen.height`，这是区分真实浏览器和 headless 的重要特征。Node 环境必须设置非全屏值。

### 4.2 A7() — 行为采集（:888）

```js
function A7() {
  return {
    a: 'P',           // PC 模式
    g: Gb,            // mousemove 轨迹数组
    u: GP,            // mousedown/mouseup 数组
    e: GI,            // 键盘事件数组
    O: Gl,            // 键盘事件计数
    j: GX,            // touch start 时间 delta
    S: A3,            // touch move Y
    c: A2,            // mousedown 计数
  };
}
```

### 4.3 A4 — mousemove handler（:847）

```js
A4 = dD(function(kZ) {       // dD = throttle(30ms)
  kZ = GN(kZ);
  if (Gy > 100) {            // buffer > 100 条时合并首条
    Gb[1] = merge(Gb[1], Gb[0]);
    Gb.shift();
  }
  Gy++;
  var dx = pageX - GU;       // 坐标增量
  var dy = pageY - Gw;
  var dt = Date.now() - Gv;  // 时间增量
  Gb.push([dx, dy, dt].join('+'));
  AG();                       // 触发 cookie 重生成
  GU = pageX; Gw = pageY; Gv += dt;
}, 30);                        // ← 30ms 节流！
```

### 4.4 dD — 节流函数（:77）

```js
function dD(fn, delay) {
  let lastTime = 0;
  return function() {
    var now = Date.now();
    if (now - lastTime >= delay) {  // 前置边缘触发
      lastTime = now;
      fn.apply(this, arguments);
    }
  };
}
```

**⚠️ 这是行为注入的核心瓶颈**：
- A4 throttle = 30ms → 事件间隔必须 ≥30ms 才会被采集
- AG debounce = 60ms → 连续触发 cookie 刷新时需 ≥60ms 间隔

### 4.5 GC — Cookie 写入（:459）

```js
function GC(name, value, expires, domain) {
  dR.cookie = name + '=' + value + ";expires=" + expires + ";path=/;domain=" + domain;
}
```

domain = `G9()` 返回 `.pzds.com`（不带前导点则取 host）。

### 4.6 GO — localStorage 写入（:743）

```js
function GO(key, value, ttl) {
  value = GS(value, ttl);  // 加 TTL 编码
  localStorage.setItem(key, value);
}
```

### 4.7 AA — localStorage seed 生成（:949）

```js
function AA() {
  var seed = GE(dI);  // 先读现有值
  if (!seed) {
    seed = dX(randomInt + '|' + d, 0, 1) + 'a' + d.toString(16);
    GO(dI, seed, 15552000000);  // 180 天 TTL
  }
  return seed;
}
```

seed 格式：`dX(randomInt|startTime) + 'a' + startTimeHex`

### 4.8 dB — 当前 script 定位（:59）

```js
var dB = (function() {
  var kZ = document.currentScript;
  if (!kZ) {
    for (var scripts = dR.getElementsByTagName("script"), i = 0; i < scripts.length; i++)
      if ("6cc076e6727a87d6" == scripts[i].getAttribute('id')) {
        kZ = scripts[i]; break;
      }
  }
  return kZ;
})();
```

**⚠️ dK[4] 由 dB.src 决定**：
- 浏览器：`document.currentScript` 为 null，fallback 搜索失败，但 dB 指向了 jQuery CDN script 标签 → hash=jQuery URL → **3726056879**
- Node env_patch.js：`document.currentScript` 被设为指向 jQuery URL 的 script → hash=**3726056879**（已对齐）

## 五、kb bitmask 逐位对照（24 位）

| bit | 检测条件 | 所在位置 |
|-----|---------|---------|
| 0 | `!![].copyWithin` | Array.prototype |
| 1 | `!![].includes` | Array.prototype |
| 2 | `window.hasOwnProperty("Touch")` | globalThis sync |
| 3 | `window.hasOwnProperty("Proxy")` | globalThis sync |
| 4 | `Symbol.match` exists | env_patch |
| 5 | `Function.name` | env_patch |
| 6 | `Object.values` | env_patch |
| 7 | `OfflineAudioContext.prototype.hasOwnProperty("close")` | 移除 close |
| 8 | (unused) | — |
| 9 | `''.padStart` | String.prototype |
| 10 | `PointerEvent.prototype.getCoalescedEvents` | env_patch |
| 11 | (unused) | — |
| 12 | `"BudgetService" in window` | 无 |
| 13 | `canvas.getAttributeNames` | env_patch |
| 14 | `performance.timeOrigin` | env_patch |
| 15 | `Intl.PluralRules` | env_patch |
| 16 | `window.hasOwnProperty("getMatchedCSSRules")` | 已移除 |
| 17 | `window.hasOwnProperty("PerformanceServerTiming")` | env_patch |
| 18 | `!![].values` | Array.prototype |
| 19 | `window.hasOwnProperty("BigInt")` | globalThis sync |
| 20 | `document.wasDiscarded` | env_patch |
| 21 | `matchMedia !== null` | env_patch |
| 22 | `clientInformation === navigator` | env_patch getter |
| 23 | `getEntries(currentScript.src).length > 0` | env_patch |

## 六、行为事件注入策略

### 6.1 时序要求

```
SDK 初始化（同步）
  │
  ├─ G2("mousemove", A4)
  │   └─ dR.addEventListener("mousemove", A4, true)
  │       └─ env_patch hook 注入 1 条 mousemove（立即触发 dD 前置边缘）
  │            → Gb.length = 1, AG() fires
  │
  ├─ G2("keyup", GQ)
  │   └─ env_patch hook 不做注入（避免与 run_with_env 重复）
  │
  ▼ 1.js 加载完成
  │
run_with_env.js 异步链启动（t≈0）
  │
  ├─ setTimeout 0ms:   mousemove #2,  Gb.length=2
  ├─ setTimeout 35ms:  mousemove #3,  Gb.length=3
  ├─ ...
  ├─ setTimeout 840ms: mousemove #25, Gb.length=25
  │   └─ AG() fires (60ms debounce after #24)
  │
  ├─ setTimeout 940ms: keyup dispatch (100ms 延迟避开 AG debounce)
  │   └─ GI.length=1, AG() fires → e.len=1
  │
  └─ setTimeout 1500ms: dump cookies
```

### 6.2 关键常量

| 常量 | 值 | 说明 |
|------|---|------|
| mousemove 总量 | 25 | 1 (env_patch 兜底) + 24 (run_with_env 异步) |
| 异步间隔 | 35ms | 必须 > dD throttle 的 30ms |
| keyup 延迟 | 100ms | 必须 > AG debounce 的 60ms |
| keyup 数量 | 1 | 浏览器的 e.len=1 |
| mousedown/mouseup | 0 | 浏览器 u.len=0 |

### 6.3 为什么同步循环无效

```js
// ❌ 错误：dD throttle 30ms 只放过第 1 条
for (i = 0; i < 25; i++) {
  doc.dispatchEvent(new MouseEvent('mousemove', {...}));
}
// → Gb.length = 1

// ✅ 正确：每条事件间隔 ≥35ms
var i = 0;
function next() {
  if (i >= 25) return;
  doc.dispatchEvent(makeEvent(i));
  i++;
  setTimeout(next, 35);
}
// → Gb.length = 25
```

## 七、env_patch.js 关键模拟点

| 模拟项 | 行号 | 值 | 说明 |
|--------|------|---|------|
| document.currentScript.src | 554 | jQuery CDN URL | dK[4] 对齐浏览器 |
| innerWidth | 993 | 1904 | ≠ screen.width（1920） |
| innerHeight | 993 | 937 | ≠ screen.height（1080） |
| outerHeight | 993 | 1080 | = screen.height |
| pageYOffset | 994 | 0 | 未滚动 |
| window 原型链 | 1047-1060 | Window→WindowProperties→EventTarget | dh[0] 对齐 |
| webdriver | 719-722 | NavigatorProto getter | hasOwnProperty=false |
| plugins/mimeTypes | 648-662 | plain object（非 Array） | Array.isArray=false |
| canvas toDataURL | 488-508 | 预采集文件 | hash 校验防篡改 |
| speechSynthesis | 909-965 | 22 voices（含 Google） | dL[0] 对齐 |
| Event/MouseEvent | 143-229 | 自建类 | instanceof 检测 |
| hasOwnProperty sync | 1041-1045 | globalThis → windowObj | kb bit 2/3/19 |

## 八、常见调试方法

### 8.1 查看原始 payload（Gg.x 编码前）

```bash
cd ssxmod && node -e "
var allJoins = [];
var _orig = Array.prototype.join;
Array.prototype.join = function(sep) {
  var r = _orig.call(this, sep);
  if (sep === '^' && r.length > 40) allJoins.push(r);
  return r;
};
require('./env_patch.js'); require('./1.js');
setTimeout(() => { allJoins.forEach((j,i) => console.log('[JOIN_'+i+']', j)); }, 2000);
"
```

### 8.2 快速验证行为字段

```bash
cd ssxmod && node -e "
// ...同上 hook...
setTimeout(() => {
  allJoins.forEach(j => {
    var i = j.indexOf('^P^');
    if (i >= 0 && j.indexOf('en-US') >= 0) console.log(j.substring(i+1, i+20));
  });
}, 2000);
"
```

### 8.3 浏览器侧验证（js-reverse MCP）

```js
// inject_before_load 注入 hook:
(function() {
  var _orig = EventTarget.prototype.addEventListener;
  window.__AUDIT__ = { calls: [], mm_handlers: 0, mm_details: [] };
  EventTarget.prototype.addEventListener = function(type, fn, opts) {
    if (type === 'mousemove' && this === document && opts === true) {
      var orig = fn;
      fn = function(ev) {
        window.__AUDIT__.mm_handlers++;
        window.__AUDIT__.mm_details.push({
          ts: ev.timeStamp, cx: ev.clientX, cy: ev.clientY, trusted: ev.isTrusted
        });
        return orig.call(this, ev);
      };
    }
    window.__AUDIT__.calls.push({ type, target: String(this), capture: !!opts });
    return _orig.call(this, type, fn, opts);
  };
})();
```

### 8.4 浏览器断点捕获原始 payload

在 js-reverse MCP 中设置断点：
```
set_breakpoint_on_text("dD(function", urlFilter="jsvm_all")
```
断点命中后 evaluate `kM` 变量即可获得完整原始 payload。

## 九、版本演进关键节点

| 版本 | 突破 | 对齐率 |
|------|------|--------|
| v3 | dK[0] 416, webdriver 移至原型链 | 81% |
| v4 | Event instanceof, behavior 自动注入 | 88% |
| v5 | plugins Array.isArray, ky bits | 92% |
| v6 | dh[0] proto hash, 3 层假原型 | 96% |
| v7 | kb\|ky 完全对齐, dK[4] WAF SDK URL | 96% |
| **v8** | **dK[4]→jQuery URL, 异步行为注入, viewport 非全屏** | **97%** |

## 十、已知剩余差异

| 差异 | Node | Browser | 影响 |
|------|------|---------|------|
| matchMedia dims | 1920\|1080 | -1\|-1 | dt 标志导致 Au() 内 matchMedia 计算差异 |
| dL[3] Image test | -1 | 0 | webdriver 检测路径不同 |
| cookie 长度 | itna=449, itna2=204 | itna=466, itna2=283 | 行为细节密度不同 |
