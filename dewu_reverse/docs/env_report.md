# 得物 PC 端风控 SDK（preinforce2 / pceptor / pyuntu）Node 环境复现报告

- 工程：`D:\ds_work\js_reverse_projects\dewu_reverse`
- 运行时：Node v24.13.0 + jsdom 29.1.1（**全程无浏览器**，浏览器侧数据一律取自既有基线 bundle）
- 基线：`artifacts/env_baseline/dewu_env_bundle.json`（Camoufox / Firefox 152 / Windows，2026-11-20 采集）
- 交付：`src/env_patch.js`、`scripts/verify_env.js`、`scripts/load_sdks.js`、`scripts/scan_env_refs.js`、本文
- 原始文件未改动：`artifacts/js/`、`artifacts/unpacked/` 只读

## 0. 结论摘要

| 项目 | 结果 |
|---|---|
| 三 SDK 加载（各自独立沙箱） | **全部不抛异常**：preinforce2 85ms / pceptor 100ms / pyuntu 102ms |
| 三 SDK 单沙箱顺序加载（贴页面顺序） | **全部不抛异常** |
| 环境自检 | `node scripts/verify_env.js` → **35/35 项通过** |
| 挂载全局 | preinforce2 → `fun / base64js / jsdVipUserMark` ✅ 与预期一致<br>pceptor → `_yundunxhr / base64js / dw / fetch(覆盖)` ✅ 与预期一致<br>pyuntu → `regeneratorRuntime / dewuCap / yd_md5 / base64js / jsdVipUserMark`（比预期多，见 §3） |
| jsdom 未实现告警 | 0 条（canvas/iframe 的实现已被补丁接住，或收进 buffer） |
| 仍缺的真实状态 | `localStorage` 的 7 个 key 只有名字没有值 → 见 §6「待主会话取证」 |

> 注意一个反直觉事实：**裸 jsdom 也「不抛异常」**（`node scripts/load_sdks.js --raw` 三个都 OK），
> 但裸 jsdom 下 `navigator.plugins.length=0`、`screen.width=0`、`canvas.getContext('2d')=null`、
> `document.hasFocus()=false` —— 不抛异常 ≠ 值是浏览器值。
> 所以本项目验收分两层：**加载层**（不抛）+ **读值层**（35 项与基线逐项对齐）。

---

## 1. 六步法执行记录

| 步骤 | 做了什么 | 产物 |
|---|---|---|
| ① 确认入口 | 三个 SDK 都是 JS DUN PROTECT eval-VM，已自解码到 `artifacts/unpacked/`。解混淆后挖出口：preinforce2 全文件 **0 次** `document` 引用（纯计算 + `window.navigator/screen/XHR`）；pceptor/pyuntu 大量 DOM/canvas 引用 | `scripts/scan_env_refs.js` |
| ② 采基线 | 不新采（浏览器实例被主会话占用），直接用 `dewu_env_bundle.json`：navigator 37 项、screen 13 项、window metrics 14 项、document 8 项、CSS 383 属性、canvas dataURL(7078B)+measureText、webgl 参数/29 扩展/精度、audio、storage key 名、时区 | bundle |
| ③ 采 jsdom | `scripts/verify_env.js` 里的 `makeRaw()`（同参数、无补丁），把 35 个检测点在同一脚本里跑一遍 | 表格「jsdom 原值」列 |
| ④ 读值差异 | 见 §2 补丁清单表；典型差异：UA 是 `Mozilla/5.0 (win32) … jsdom/29`、`vendor="Apple Computer, Inc."`、`productSub=20030107`（Chrome 语义）、screen 全 0、inner 1024×768、dpr 1、`hasFocus()=false`、`readyState=loading`、`createElement.toString()` 直接吐 jsdom 源码、canvas/webgl/audio 全缺 | 表格 |
| ⑤ 打补丁 | `src/env_patch.js`：markNative → 全量原型扫描 → nav/screen/window/document/布局/canvas/webgl/audio/CSS/misc/网络/Node 特征 → 收尾再扫 | 106 条 patchLog |
| ⑥ 内部验证 | `verify_env.js` 35 项全通过；`load_sdks.js` 三 SDK 加载 + 张榜 + 读值 trace | 表格 + §3 |

---

## 2. 补丁清单（检测点 → 基线值 → jsdom 原值 → 补法）

「证据」列：**S** = 运行期 trace 抓到实读；**G** = 解混淆源码 grep 命中；**F** = 已知事实/抛错位置；**Y** = 仅保险。

| # | 检测点 | 基线值(Camoufox) | jsdom 原值 | 补法（`src/env_patch.js`） | 证据 |
|---|---|---|---|---|---|
| 1 | `Function.prototype.toString(fn)` | `function createElement() {\n    [native code]\n}`（**Firefox 多行**） | `createElement(localName) {\n  const esValue = …` 完整 jsdom 源码 | `createNativePatcher()`：WeakSet 标记 + jsdom 源码正则 + V8 native 串改写，全部输出 Gecko 多行格式 | G(5)、F |
| 2 | `Object.prototype.toString.toString()` | 含 `native code` | 含（V8 单行） | 同上，`/\[native code\]/` 命中即改写成 Gecko 格式 | G、F(pceptor) |
| 3 | `navigator.sendBeacon.toString()` | `function sendBeacon(){…[native code]…}` | `undefined`（jsdom 没实现 sendBeacon） | 补 stub 并 markNative | G(pceptor)、F |
| 4 | `navigator.userAgent` | `Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:152.0) Gecko/20100101 Firefox/152.0` | `Mozilla/5.0 (win32) AppleWebKit/537.36 … jsdom/29.1.1` | Navigator.prototype getter，值取自 bundle | **S**(preinforce2×5、pceptor×4、pyuntu×4)、G |
| 5 | `navigator.platform` | `Win32` | `""` | 同上 | G(pceptor 判 iPad/iPhone/iPod) |
| 6 | `navigator.oscpu` | `Windows NT 10.0; Win64; x64` | `undefined` | 新增 prototype getter（Firefox 独有） | Y |
| 7 | `navigator.vendor / productSub` | `""` / `20100101` | `Apple Computer, Inc.` / `20030107`（Chrome 语义，与 Gecko 矛盾） | 对齐 | Y（矛盾很硬） |
| 8 | `navigator.appVersion / appName / product` | `5.0 (Windows)` / `Netscape` / `Gecko` | `4.0` / `Netscape` / `Gecko` | 对齐 appVersion | Y |
| 9 | `navigator.hardwareConcurrency` | `32` | `32`（jsdom 恰好相同） | 显式锁定，防随机器变化 | Y |
| 10 | `navigator.webdriver` | `false` | `undefined` | prototype getter | Y |
| 11 | `navigator.plugins` | 5 个 PDF Viewer，可 `item/namedItem/迭代` | `length=0`，无 item | `buildPluginTree()` 造完整 PluginArray/Plugin/MimeType 三层对象树 | **S**(pyuntu×1)、Y |
| 12 | `navigator.mimeTypes` | 2 个（application/pdf、text/pdf） | `length=0` | 同上 | Y |
| 13 | `navigator.doNotTrack` | 字符串 `"unspecified"` | `undefined`（不是 null） | prototype getter | Y |
| 14 | `navigator.pdfViewerEnabled / maxTouchPoints / globalPrivacyControl / languages …` | `true / 0 / false / ["zh-CN","zh"]` | `undefined` | 逐项对齐 | Y |
| 15 | `navigator.connection` | `NetworkInformation` | `undefined` | 空壳 + `Symbol.toStringTag='NetworkInformation'` + effectiveType/downlink/rtt | Y |
| 16 | `navigator.permissions/gpu/locks/storage/credentials/clipboard/wakeLock/login/…` | 各自接口对象 | 全 `undefined` | 13 个接口空壳（带正确 toStringTag + addEventListener） | Y |
| 17 | `navigator.userAgentData / deviceMemory / getBattery` | **不存在**（Firefox 无） | 不存在 | **明确保持缺失**（补了反而制造 Chrome 特征） | F |
| 18 | `screen.width/height/availWidth/availHeight/colorDepth/pixelDepth` | `1920/1080/1920/1032/24/24` | `0/0/0/0/24/24` | Screen.prototype getter | **S**(pceptor screen.width/height)、G |
| 19 | `screen.orientation.type` | `landscape-primary` | `undefined` | 补 ScreenOrientation 空壳 | Y |
| 20 | `window.innerWidth/innerHeight/outerWidth/outerHeight` | `1906/969/1920/1032` | `1024/768/1024/768` | window getter | **S**(三份都读)、G |
| 21 | `window.devicePixelRatio` | `1.25` | `1` | window getter | **S**(三份都读)、G(pceptor 指纹字段 dpr) |
| 22 | `window.screenX/screenY/isSecureContext/crossOriginIsolated/scrollX/Y` | `0/0/true/false/0/0` | 部分缺 | window getter | **S**(三份都读 screenX/screenY/isSecureContext) |
| 23 | `document.compatMode` | `CSS1Compat` | `CSS1Compat`（一致） | 显式锁定（SDK 用它选 documentElement 还是 body） | **S**(pceptor/pyuntu)、G |
| 24 | `document.documentElement.clientWidth/clientHeight` | `1906/969` | `0/0` | `patchLayout()`：documentElement/body 直接返回 innerWidth/innerHeight | **S**、G、F |
| 25 | `document.hasFocus()` | `true` | `false` | Document.prototype 方法替换 | Y |
| 26 | `document.readyState / visibilityState / hidden / characterSet / contentType / designMode / dir` | `complete/visible/false/UTF-8/text/html/off/""` | `loading/…` | Document.prototype getter（**不挂实例**，避免自有属性数量暴露） | **S**(contentType 三份都读)、Y |
| 27 | `Object.prototype.toString.call(document)` | `[object HTMLDocument]` | `[object Document]` | `Document.prototype[Symbol.toStringTag]` getter 按实例判 HTMLDocument/XMLDocument | Y |
| 28 | `element.offsetWidth/offsetHeight/clientWidth/clientHeight` | 按 style 实测（styled div = 100×100） | 全 `0`（jsdom 无排版） | Element **和** HTMLElement 两处原型同时补（jsdom 把 client\* 挂 Element、offset\* 挂 HTMLElement，只补一处会被遮住） | Y |
| 29 | `element.getBoundingClientRect()` | `{0,0,100,100}` | 全 0 | 同上，视口元素返回 innerWidth/innerHeight | G(pyuntu 算 canvas 缩放)、Y |
| 30 | `canvas.getContext('2d')` | 真 2D 上下文 | `Not implemented` + 返回 `null` | 自制 2D 上下文：绘图方法 no-op，`measureText` 走基线回放 | **S**(pceptor)、G |
| 31 | `canvas.toDataURL()` | 7078 字符 PNG，sha256 `47d0c3a8…d8de2` | 报 "Not implemented" | **基线回放**：无条件返回 bundle 里那串 dataURL | **S**(pceptor)、G |
| 32 | `ctx.measureText('14px Arial')` | `224.8958282470703` | 无 ctx | 基线回放 + 按文本长度线性缩放 | G |
| 33 | `canvas.getContext('webgl')` → `getParameter(VENDOR/RENDERER/VERSION/…)` | `Mozilla` / `ANGLE (NVIDIA, GeForce GTX 980 D3D11 …)` / `WebGL 1.0` | `null` | 基线回放：参数表 + 29 个扩展 + `WEBGL_debug_renderer_info` + shader precision + context attributes | G(pceptor)、Y |
| 34 | `gl.getSupportedExtensions()` | 29 个 | 无 | 回放列表 | G |
| 35 | `<style>` 插入 + `sheet.insertRule` + `getComputedStyle` | 383 个 CSS 属性有真实初始值 | `<style>` 可插入、insertRule 可用，但 `getComputedStyle` 只回 `auto`/空 | `<style>`/insertRule 用 jsdom 原生（实测可用）；`getComputedStyle` 用 bundle 的 383 属性值覆盖，保留 getPropertyValue/item/length | **S**(pyuntu)、G、F（pyuntu 曾在自制 vm 里报 "Couldn't find a style target"） |
| 36 | `window.AudioContext / OfflineAudioContext` | sampleRate 48000 / offline 44100 | `undefined` | 基线回放空壳（含 createOscillator 等节点、startRendering） | Y（三份源码 grep 命中 **0** 次） |
| 37 | `Date` 时区 | offset `-480`、`Asia/Shanghai` | 跟随机器 | `createEnv` 内 `process.env.TZ=bundle.timing.timezone`（实测 win32+node24 运行期生效；`{timezone:false}` 可关） | Y |
| 38 | `window.process / require / Buffer / global / module` | 无 | 无 | 显式 delete（防将来注入泄漏） | Y |
| 39 | `XMLHttpRequest / fetch` | 存在且会真发包 | 存在且会真发包（危险） | `blockNetwork`（默认开）：`send` 只记录不发，`fetch` 返回空 200，绝不污染服务端 | **S**(preinforce2 加载即 `post https://dav.dewu.com/cost`) |

> 完整 106 条补丁明细：`node scripts/verify_env.js --log`

---

## 3. 三 SDK 加载结果

命令：`node scripts/load_sdks.js`（每个 SDK 一个干净沙箱，`traceReads: true`）

```
[OK  ] preinforce2.js      85ms  新增全局 3 个 / 覆盖 0 个 / jsdom告警 0 / 拦截请求 1
        新增: base64js, fun, jsdVipUserMark
        实际读值: navigator.userAgent×5, window.devicePixelRatio×3, window.innerWidth×3, window.innerHeight×3,
                 window.outerWidth×3, window.outerHeight×3, window.screenX×3, window.screenY×3,
                 window.isSecureContext×3, document.contentType×3, XHR.send×1
[OK  ] pceptor.js         100ms  新增全局 5 个 / 覆盖 1 个 / jsdom告警 0 / 拦截请求 0
        新增: _yundunxhr, base64js, dw, fetch, jsdVipUserMark      覆盖: XMLHttpRequest
        实际读值: document.cookie×6, document.createElement×4, document.getElementsByTagName×4,
                 navigator.userAgent×4, Storage.getItem×4, window.devicePixelRatio×3, window.innerWidth×3,
                 window.innerHeight×3, window.outerWidth×3, window.outerHeight×3, window.screenX×3,
                 window.screenY×3, window.isSecureContext×3, URLSearchParams.get×2, Storage.setItem×2,
                 document.contentType×1, document.compatMode×1, canvas.getContext×1, canvas.toDataURL×1,
                 screen.width×1, screen.height×1, window.setTimeout×1
[OK  ] pyuntu.js          102ms  新增全局 5 个 / 覆盖 0 个 / jsdom告警 0 / 拦截请求 0
        新增: base64js, dewuCap, jsdVipUserMark, regeneratorRuntime, yd_md5
        实际读值: document.contentType×7, document.createElement×6, window.innerWidth×4,
                 document.getElementsByTagName×4, navigator.userAgent×4, window.devicePixelRatio×3,
                 window.innerHeight×3, window.outerWidth×3, window.outerHeight×3, window.screenX×3,
                 window.screenY×3, window.isSecureContext×3, URLSearchParams.get×2, document.compatMode×1,
                 document.querySelector×1, Storage.getItem×1, Storage.setItem×1, navigator.plugins×1
结论：三个 SDK 全部加载完成，无异常
```

### 3.1 单沙箱顺序加载（`--seq`，贴页面真实顺序 preinforce2 → pceptor → pyuntu）

同样全部 OK。最终 window 新增：`_yundunxhr, base64js, dewuCap, dw, fetch, fun, jsdVipUserMark, regeneratorRuntime, yd_md5`；覆盖：`XMLHttpRequest`（被 pceptor 劫持）。

### 3.2 与预期的对照

| SDK | 预期张榜 | 实测 | 判定 |
|---|---|---|---|
| preinforce2 | `fun/base64js/jsdVipUserMark` | 完全一致 | ✅ |
| pceptor | `_yundunxhr/base64js` | `_yundunxhr/base64js` + `dw` + 覆盖 `fetch`/`XMLHttpRequest` | ✅（多出的是它自己挂的 `dw` 和拦截器） |
| pyuntu | `regeneratorRuntime` 或更多 | `regeneratorRuntime` + `dewuCap` + `yd_md5` + `base64js` + `jsdVipUserMark` | ✅ |

### 3.3 顺手拿到的证据

- **preinforce2 加载完成即发一次上报**：`post https://dav.dewu.com/cost`（被 `blockNetwork` 拦下，只记录）。这是该 SDK 的上报端点，后续做「喂入-截出」从这里接。
- pceptor 会覆盖 `XMLHttpRequest` 并挂 `_yundunxhr`（自己的 XHR 封装），同时覆盖 `fetch` → 双通道拦截，与技能文档里「XHR + fetch 双通道」的判定一致。
- pyuntu 会建 `<style>`、读写 `localStorage('yuntuSession')`、读 `navigator.plugins`（长度参与设备指纹）。

---

## 4. 哪些字段是「SDK 一定会读的」，哪些只是保险

判定分三档，依据写死在括号里。

### 4.1 铁定会读（运行期 trace 抓到 + 源码 grep 命中）

| 字段 | 谁读 | 加载阶段读次数 |
|---|---|---|
| `navigator.userAgent` | 三份都读 | preinforce2 ×5、pceptor ×4、pyuntu ×4 |
| `window.innerWidth/innerHeight/outerWidth/outerHeight/screenX/screenY/isSecureContext/devicePixelRatio` | 三份都读（preinforce2 的 smid 指纹逐项做存在性三元） | 各 ×2~×3 |
| `document.contentType` | 三份都读 | ×3 / ×1 / ×7 |
| `document.compatMode` | pceptor、pyuntu（选 `documentElement` 还是 `body` 取视口） | ×1 |
| `document.documentElement.clientWidth/clientHeight` | pceptor、pyuntu | 视口尺寸路径 |
| `navigator.platform` | pceptor（`indexOf('iPad'/'iPhone'/'iPod')`） | 条件分支内 |
| `screen.width/height` | preinforce2（存在性）、pceptor | ×1 |
| `canvas.getContext('2d')` + `canvas.toDataURL()` | pceptor（画弧/文字后取指纹） | ×1 |
| `document.cookie` | pceptor | ×6 |
| `localStorage.getItem / setItem` | pceptor（`sk`/`isRe`）、pyuntu（`yuntuSession`/`sk`） | pceptor ×4/×2、pyuntu ×1/×1 |
| `URLSearchParams.get('…')`（含 `withInMini`） | pceptor、pyuntu | ×2 |
| `navigator.plugins` | pyuntu | ×1 |
| `Object.prototype.toString.toString()` / `WebSocket.toString()` / `navigator.sendBeacon.toString()` 的 `native code` 判定 | pceptor（原生性自检） | 加载期 |
| `XMLHttpRequest` 构造 + `send` | preinforce2、pceptor | ×1 |

### 4.2 大概率会读（源码 grep 命中，但加载阶段未触发，在出值/定时/上报路径里）

`screen.availWidth/availHeight/pixelDepth/colorDepth`、`document.referrer/title/readyState`、`element.getBoundingClientRect`（pyuntu 的 canvas 缩放比）、`document.hasFocus`、`Math.random`、`Date.now`。

### 4.3 只是补了保险（源码 grep 命中 0 次 / 当前版本没走那条路）

- `AudioContext / OfflineAudioContext / audio 指纹`：三份源码命中 **0** 次。
- `navigator.permissions / gpu / locks / storage / credentials / clipboard / wakeLock / login / mediaSession / userActivation / mediaCapabilities / serviceWorker / mediaDevices / geolocation`：命中 0 次，只给带正确 `Symbol.toStringTag` 的空壳。
- `navigator.oscpu / buildID / vendorSub`、`screen.orientation`、`document.fonts`、`window.visualViewport`、`window.Notification / RTCPeerConnection`：命中 0~1 次。
- `document.all`（undetectable）：命中 0 次，**故意没补**（要做到 `typeof === 'undefined'` 且活索引不可删，需要 `node --allow-natives-syntax` 的 `%GetUndetectable()`，成本高且当前无证据）。

> 反过来有两项是**故意保持缺失**的：`window.chrome`、`navigator.userAgentData`。基线（Firefox）里它们不存在，补上等于主动暴露 Chrome 特征。

---

## 5. 仍未消除的差异（诚实清单）

| # | 差异 | 影响 | 现状/原因 |
|---|---|---|---|
| 1 | `canvas.getImageData` 像素 | 若 SDK 走「像素数组」而不是 dataURL 做指纹，值不等于真机 | 基线只存了 dataURL + measureText，没存像素矩阵；现在是**由坐标确定性推导的伪像素**（同坐标恒定，保证多次运行稳定）。pceptor 确实调了 `getImageData(216,16,1,1)`，这条是**真实风险点**，见 §6-1 |
| 2 | `canvas.toDataURL` 是无条件回放 | 同一页面里不同尺寸/不同内容的画布会拿到**同一串** dataURL | 当前 SDK 只在 240×60 画布上取一次，没有交叉校验；若改版加「两块画布指纹必须不同」就会穿帮 |
| 3 | WebGL `MAX_VIEWPORT_DIMS` / `ALIASED_LINE_WIDTH_RANGE` / `ALIASED_POINT_SIZE_RANGE` | 三个参数不等于真机 | 基线这三项捕获为 `null`（Float32Array 没被序列化），现给典型值 `[16384,16384] / [1,1] / [1,1024]`。`readPixels` 返回 null（没有真 GL） |
| 4 | audio 指纹 `35.749972093850374` | 无法复现 | 基线只存标量结果，没存 5000 个样本/算法参数；现在 `startRendering` 给确定性伪数据。当前 SDK 未读 |
| 5 | `getComputedStyle` 对所有元素返回同一套 383 个值 | 若 SDK 比较「不同元素布局值是否互不相同」会穿帮 | 基线只采了一个元素的 computed style |
| 6 | iframe 子窗口 | pceptor 会 `createElement('iframe')` + `setAttribute('src')` + append 到 documentElement，jsdom 不做导航，子窗口 navigator/原型没补 | 加载阶段不抛错、不影响当前值；若要 `contentWindow` 指纹需补（技能文档 §1.1 有模板） |
| 7 | `document` 自有属性/原型描述符形状 | 若 SDK 统计 `Object.getOwnPropertyNames(document).length` 会差 | bundle 不含 document 描述符快照；补丁已全挂在 `Document.prototype`（不在实例上造自有属性），但未逐项对齐 |
| 8 | `performance.timing / navigation`、`history.length`、`window.name` | 未补 | 三份源码命中 0 次 |
| 9 | `localStorage` 7 个 key 的值 | `localStorage.getItem('sk')` 返回 null（真机 92 字符） | 基线只记 key 名与长度，没有值（`storage.note` 明确写了） |
| 10 | `Intl` locale | `zh-CN` vs 基线 `zh-Hans-CN` | ICU（Windows/Node）与 Firefox 的差异，属系统性差异，未强行改 |
| 11 | `createEnv` 会改进程级 `process.env.TZ` | 同进程其他代码也受影响 | 刻意为之（对齐 `-480`）；`createEnv({timezone:false})` 可关 |

---

## 6. 待主会话取证（需要浏览器；本会话按约束不碰浏览器实例）

按优先级排，每条写清「采什么、采了补哪里」。

1. **canvas 像素矩阵（最高优先，对应残余差异 #1）**
   在真机页面用与 pceptor 相同的绘制序列画到 240×60 画布，采 `ctx.getImageData(0,0,240,60).data` 的 base64 或 sha256，
   以及**单独**采 `ctx.getImageData(216,16,1,1).data` 的 4 个字节。
   → 补 `patchCanvas()` 里的 `fakePixels()`，让像素分支也变成回放。
2. **多元素 `getComputedStyle`**：`documentElement` / `body` / 一个 `width:100px` 的 div 各采一遍关键属性（width/height/display/position/visibility/transform/overflow）。
   → 让 `patchCSS()` 按元素类型分支，而不是全元素同一套值。
3. **`document` / `navigator` 描述符快照**：`Object.getOwnPropertyNames(document)` + 每个 key 的 `{enumerable, configurable, hasGetter}`；navigator 同理（区分「原型 getter」与「实例自有」）。
   → 对齐形状（残余差异 #7）。
4. **iframe 子窗口环境**：页面里新建 iframe 后采 `iframe.contentWindow.navigator.userAgent`、`String(iframe.contentWindow.constructor)`、`String(iframe.contentDocument.createElement)`。
   → 决定是否启用 `patchIframeChildRealms`（技能文档 §1.1 模板）。
5. **`localStorage` 实值**：`sk`(92)、`yuntuSession`(40)、`dwsm`(62)、`DUOTELUUID`(50)、`isRe`(1)、`scene_h5UserId`(36)、`_l_KPLiPs`(42) 的真实内容。
   → `createEnv({seedStorage: {sk: '…', …}})` 直接注入（接口已留好）。
6. **`performance.timing / navigation`、`history.length`、`window.name`** 的基线值（残余差异 #8）。
7. **WebGL 的 `MAX_VIEWPORT_DIMS` / `ALIASED_*` 真实 Float32Array**（残余差异 #3），以及 `readPixels(0,0,1,1)` 的 4 字节。
8. **audio 指纹原始样本**：`OfflineAudioContext` 渲染后的前 5000 个 float（或直接给 SDK 侧算指纹的代码片段）。
9. **`https://dav.dewu.com/cost` 的真实请求形态**：完整 URL query、header 名（尤其签名头）、body 结构。
   → preinforce2 加载即打这个点，是后续「喂入-截出」的落点。
10. **`withInMini` 的真实 URL 形态**：确认页面 URL 是否带 query（当前基线是 `https://www.dewu.com/`，无 search）。

---

## 7. 用法

### 7.1 模块 API

```js
const fs = require('fs');
const { createEnv } = require('./src/env_patch');

// 默认读 artifacts/env_baseline/dewu_env_bundle.json，url = https://www.dewu.com/
const env = createEnv();                       // 选项见下
try {
  // 在 jsdom 的 window 域里 eval（SDK 看到的 Function/Object 都是该域的原生对象）
  env.evalSource(fs.readFileSync('artifacts/js/pceptor.js', 'utf8'), 'pceptor.js');

  console.log(env.globals());                  // { added: [...], changed: [...] }（对比补丁完成时的快照）
  console.log(env.netLog);                     // 被拦下的请求 [{method,url,size}]
  console.log(env.jsdomNotices);               // jsdom "Not implemented" 告警（已收进 buffer）
  console.log(env.storageMissing);             // 有 key 名但没有值的站点状态
} finally {
  env.dispose();                               // 关 window，释放 dom
}
```

`createEnv(options)` 选项：

| 选项 | 默认 | 说明 |
|---|---|---|
| `bundlePath` | `artifacts/env_baseline/dewu_env_bundle.json` | 换一份基线就换环境（新旧基线对比很方便） |
| `url` | `https://www.dewu.com/` | 影响 `document.URL/domain/referrer` |
| `blockNetwork` | `true` | `XHR.send` 只记录不发、`fetch` 回空 200；出值阶段必须保持 true |
| `timezone` | `true` | 是否把 `process.env.TZ` 设成基线时区（进程级副作用） |
| `seedStorage` | `{}` | `{ sk: '…', yuntuSession: '…' }` 注入 localStorage 真实值 |
| `traceReads` | `false` | 装读值计数器，之后 `env.readCounts()` 看 SDK 实际读了什么（重新包装 getter，有轻微开销） |

返回对象：`{ dom, window, document, navigator, screen, bundle, evalSource(code, filename), globals(extraSkip), readCounts(), patchLog, netLog, jsdomNotices, storageMissing, bootSnapshot, dispose() }`

### 7.2 脚本

```bash
node scripts/verify_env.js            # 35 项 基线 vs jsdom原值 vs 补后值 对比表（PASS/FAIL）
node scripts/verify_env.js --log      # 附带 106 条 patchLog
node scripts/verify_env.js --sdk      # 表格 + 三 SDK 加载验收
node scripts/load_sdks.js             # 三 SDK 各自独立沙箱加载 + 张榜 + 读值 trace
node scripts/load_sdks.js --seq       # 单沙箱顺序加载（贴页面顺序）
node scripts/load_sdks.js --raw       # 对照组：裸 jsdom（定位「加载阶段就致命」的点）
node scripts/load_sdks.js --one pyuntu.js
node scripts/scan_env_refs.js         # 从解混淆源码里挖环境读值点（静态证据）
```

### 7.3 加检测点的方法

1. 在 `scripts/verify_env.js` 的 `CHECKS` 里加一条：`{ id, how, note, base: () => 基线值, run: (w) => 实测值, shape?: (v) => bool }`。
   `base` 能用 `bval(bundle.xxx)` 就用，保证基线单一来源。
2. 在 `src/env_patch.js` 对应 patch 函数里加补丁，**必须过 `native.markNative()`**，否则 `toString()` 会漏。
3. 跑 `node scripts/verify_env.js`，PASS 才算完。
4. 若新补的是「SDK 会读的」，把 `installReadTrace()` 的观测点列表一起加上，这样 `load_sdks.js` 能给出运行期证据。

### 7.4 硬性约定

- 不改 `artifacts/js/`、`artifacts/unpacked/`（原始件）。
- 补丁顺序固定：`markNative` → `scanAll` → 逐项补 → 收尾 `scanAll`。**markNative 必须最先**，晚于任何补丁都会留下非原生表面。
- 原生性输出统一 **Firefox 多行格式**（`function name() {\n    [native code]\n}`）；Camoufox 是 Gecko，用 Chrome 单行格式等于自报家门。
- `blockNetwork` 出值阶段保持开启；要抓真实请求走主会话的浏览器，不要在 Node 里发。
