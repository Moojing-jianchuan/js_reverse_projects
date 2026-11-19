# ENV_FIX_REPORT — `scripts/env_candidate.mjs` 六项环境保真度修复

> 纯离线：`node scripts/env_selftest.mjs` / `node scripts/env_regress.mjs` 全程不发任何 HTTP 请求、不启动浏览器，
> 只用 Node 内置 `zlib` / `crypto` / `vm`。`scripts/env.mjs`、`scripts/e2*.mjs`、`scripts/e3*.mjs` 一字未改。
> 逐项断言：`scripts/env_selftest.mjs` → **51/51 全绿（exit 0）**
> 回归数据：`samples/env_regress.json`

## 0. 结论

`scripts/env_candidate.mjs` 是 `scripts/env.mjs` 的副本，只改六处；行为差异全部可自证，且 `samples/cur_tdc.js`
（浏览器实际执行过的那份字节）在候选环境下 `TDC.getData(true)` **不报错**，`collect` 长度 `4204`、`eks` `352`，
与基线 `env.mjs` **完全一致**（连跑 3 次稳定）。

| # | 项目 | 修复前 | 修复后 | 自证 |
| --- | --- | --- | --- | --- |
| 1 | `canvas.toDataURL` | 恒返回固定 300×150 PNG（`samples/canvas_real_dataurl.txt`），与 `canvas.width/height` 无关 | 由 `canvas.width/height` 驱动，`zlib.deflateSync` 自拼 IHDR/IDAT/IEND + CRC32 查表 | 300×150 / 240×60 / 37×11 三种尺寸 IHDR 与实际像素字节全对；同尺寸逐字节稳定 |
| 2 | `measureText` | `s.length*7.3125+1.5`，与 `ctx.font` 无关 | 解析 `ctx.font`（pt→px ×96/72 等），按 10px 基线实测值线性缩放 | 10px=90.02083（Firefox 实测），11pt=132.031，18pt=216.050，比值=1.636364 |
| 3 | `getContext('webgl2')` | 返回 1.0 stub（VERSION=WebGL 1.0，29 扩展） | 独立 2.0 stub（VERSION=WebGL 2.0、GLSL ES 3.00、16 扩展、2.0 专有 API/常量） | VERSION/扩展列表/`createVertexArray` 等与 1.0 明确不同；`getExtension` 未支持项返回 `null` |
| 4 | `getComputedStyle().getPropertyValue` | 恒 `''` | 先解析元素 `style`（含 `setProperty`/camelCase），再落 Firefox 初始值 | `style.setProperty('color','red')` → `'red'`；未设样式元素 → `rgb(0, 0, 0)`/`block`/`visible` |
| 5 | `performance.now()` | `process.hrtime` 绝对量（实测 156,068,684 ms，≈43h 进程 uptime） | 模块加载时的 `process.hrtime.bigint()` 为页面原点 | 新环境首次调用 **4.075 ms**；`Date.now()-timeOrigin-now()=0.075 ms`；25ms 睡眠后增长 27.4ms |
| 6 | `screen` 尺寸证据冲突 | FP 1366×768，`harden()` 再硬写 2048×1152/1104，与 inner/outer 混用 | 保留 **2048×1152**（iframe 实测优先），inner 330×70、outer 2048×1104、dpr 1.25 由 FP 统一派生 | `inner ≤ outer ≤ avail ≤ screen` 且 `screen.h-outer.h=48`（仅上下边框） |

---

## 1. `canvas.toDataURL` 与画布尺寸脱钩

**改前**（`env.mjs:218-221`）

```js
toDataURL(type) { trace('canvas.toDataURL', type); return FP.canvasDataUrl || 'data:image/png;base64,iVBOR…'; }
```

- 无论 `canvas.width/height` 是多少都返回同一串 5282 字符的 300×150 PNG。
- `samples/env_gap.json` 里这条被标 `suspicious-value`：把 canvas 改成 240×60 后返回的仍是 IHDR=300×150，
  说明"像素/尺寸"与画布状态完全脱钩 —— 真机不可能出现。

**改后**（`env_candidate.mjs` §#1 + `canvasProto.toDataURL`）

1. 新增模块级 PNG 编码器：`CRC_TABLE`（256 项查表）→ `crc32()` → `pngChunk()` → `encodePng(w,h)`。
   IHDR = 8bit / colorType 2(RGB) / deflate / 无隔行；扫描线 filter 全 0；RGB 按 `x`、`y` 与 `x+y` 三个梯度合成，
   **只依赖宽高**，所以同尺寸逐字节确定、不同尺寸必然不同。`pngDataUrl()` 按尺寸 memo。
2. `toDataURL` 取 `this.width/this.height`（缺省回落 300×150），尺寸驱动出图。
3. 附加保真：`canvas.setAttribute('width'|'height', v)` 现在会反射到元素属性（真 DOM 行为），
   避免 SDK 走 attribute 路径时尺寸被吞掉。
4. **一处有意保留**：`300×150`（SDK 实际使用的默认尺寸，见 §7 追踪）仍返回录制下来的 iframe 原始 PNG
   （`FP.canvasDataUrl`，`useRecordedCanvasPng` 可关）。理由：那一档是浏览器真机字节，丢掉纯属自降保真；
   其余所有尺寸都走自拼编码器。

**自证**（`node scripts/env_selftest.mjs`，全部 PASS）

```
#1 300x150 dataURL is a legal PNG            -> IHDR 300x150, colorType=6, chunks=IHDR/IDAT/deBG/IEND, 5282 chars
#1 240x60 dataURL is a legal PNG             -> IHDR 240x60, colorType=2, 54390 chars
#1 different canvas sizes give different dataURLs  -> crc300=ce776f9 crc240=30d23908
#1 same canvas size is byte-stable across instances
#1 IDAT payload matches the declared size    -> raw=180150/43260 bytes, expected 180150/43260
#1 generated PNG is our RGB encoder (recorded 300x150 blob is RGBA)  -> 240x60 colorType=2
#1 odd size 37x11 also encodes exactly        -> IHDR 37x11
#1 setAttribute(width,height) reflects into the element -> 120x60
```

校验方式不依赖被测代码：自测脚本自带独立 CRC32 表，逐 chunk 验 `crc32(type+data)`、验 chunk 顺序
（`IHDR` 首 / `IEND` 尾）、`zlib.inflateSync(IDAT)` 后按 `colorType` 折算通道数核对
`(w*ch+1)*h` 字节数。

**预期影响**：`toDataURL` 不再是常量指纹；不同尺寸会产出不同 `dataURL`（长度/哈希都变），
`ClientJS` 类 canvas 指纹从"死值"变成"随画布状态变化"。当前构建里 SDK 只用 300×150 一档，
所以 `collect` 长度不变（§7）。

---

## 2. `measureText` 与 `ctx.font` 无关

**改前**：`env.mjs:199` 与 `env.mjs:545-549` 两处实现，都是 `width = s.length*7.3125 + (len?1.5:0)`，
只对 4 个硬编码字符串查表，**完全不看 `ctx.font`**。`env_gap` 反证：同一文本在 10px 与 100px 下宽度相同，
而真机是 10 倍关系（`samples/env_bundle.json#canvas.measure_text`：14px Arial=224.9 / 16px serif=239.8 …）。

**改后**：`parseFontPx(font)` + `measureTextMetrics(text, font)`，两处调用点（`make2d.measureText` 与
`harden()` 里的二次补丁）共用同一实现，顺带消除了原本"两套 measureText"的分裂。

- 字号解析：`px/pt/pc/in/cm/mm/em/rem/ex/ch/%/vw/vh` 全部换算（**pt ×96/72**），裸数字按 px，缺省 10px
  （canvas 默认字体就是 `10px sans-serif`）。
- 宽度：以 Firefox 实测的 10px 基线为锚点线性缩放 —— `'mmmmmmmmmmlli' = 90.02083587646484 @10px`；
  未实测过的文本按 `s.length * 7.3125`（沿用旧常数，保持数量级一致），整条曲线只随 `px` 缩放。
- 同 `actualBoundingBox*` / `fontBoundingBox*` 一并按同一系数缩放（旧实现里 ascent/descent 是常量）。

**自证**

```
#2 pt is converted to px (x96/72)                -> 11pt=14.6667px, 18pt=24.0000px
#2 10px baseline keeps the Firefox measurement    -> width=90.02083587646484
#2 11pt and 18pt give different widths            -> 11pt=132.031, 18pt=216.050
#2 width scales linearly with the font size       -> ratio=1.636364 vs 1.636364   (= 24 / 14.6667)
#2 a different family alone still yields the scaled width -> monospace=90.02083587646484
#2 width grows with text length                   -> len2=14.625, len12=210.600
#2 unknown text still scales with font size
```

**预期影响**：`measureText` 从"长度×常数"变成 `f(字号, 文本)`。当前这份 `cur_tdc.js` 构建
**一次都没调 `measureText`**（§7 trace：`2d.measureText=0`），所以对本次 `collect` 无影响；
`env_gap` 里读到 `measureText` 的是另一份构建（`browser_tdc.js`），修复对那份生效。

---

## 3. `getContext('webgl2')` 返回 1.0 stub

**改前**：`env.mjs:215` → `if (kind === 'webgl' || … || kind === 'webgl2') return glStub;`
即 2.0 与 1.0 是**同一个对象**：`VERSION="WebGL 1.0"`、29 个扩展、没有 `createVertexArray/createQuery/…`。
`env_gap` 判定 `suspicious-value`（基线：`WebGL 2.0` + 16 扩展）。

**改后**：`makeGlStub(kind)` 参数化，导出两条互相独立的上下文：

- 常量表：`glConst`（1.0）与 `gl2Const`（1.0 + 2.0 专有 enum：`MAX_SAMPLES 0x8d57`、`MAX_3D_TEXTURE_SIZE 0x8073`、
  `MAX_ARRAY_TEXTURE_LAYERS 0x88ff`、`MAX_DRAW_BUFFERS 0x8824`、`MAX_UNIFORM_BLOCK_SIZE 0x8a30`、
  `MAX_ELEMENT_INDEX 0x8d6b`、`MIN/MAX_PROGRAM_TEXEL_OFFSET`、`MAX_SERVER_WAIT_TIMEOUT` …）。
- `getParameter`：1.0 走 `webglParams1`，2.0 走 `webglParams2`（覆盖 VERSION/GLSL + 全部 2.0 专有常量，
  取值来自 `samples/env_bundle.json#webgl.webgl2.max_samples=8` 与 ANGLE/NVIDIA 同档常见上限）。
- 扩展：1.0 = 29 项（基线原值不动），2.0 = `env_bundle.json#webgl.webgl2.extensions` 的 **16 项**；
  2.0 上 `getExtension(未支持项)` 返回 `null`（真引擎语义；1.0 分支保持原样，避免动 SDK 的 shader 探针路径）。
- 2.0 独有 API 面：`createVertexArray/bindVertexArray/deleteVertexArray/isVertexArray`、
  `createQuery/beginQuery/endQuery/getQueryParameter`、`createSampler/bindSampler/samplerParameter*`、
  `createTransformFeedback/transformFeedbackVaryings`、`texStorage2D/3D`、`texImage3D/texSubImage3D`、
  `drawArraysInstanced/vertexAttribDivisor`、`bindBufferBase/Range`、`fenceSync/clientWaitSync/getSyncParameter`、
  `drawBuffers/clearBuffer*`、`blitFramebuffer/renderbufferStorageMultisample/getInternalformatParameter` …。
- 身份：每个 canvas 懒建一个 2.0 上下文并缓存（`this.__gl2`），`gl2.canvas === canvas`；
  与 1.0 单例**不是同一对象**。

**自证**

```
#3 webgl2 VERSION is "WebGL 2.0"                    -> webgl1="WebGL 1.0", webgl2="WebGL 2.0"
#3 webgl2 SHADING_LANGUAGE_VERSION is GLSL ES 3.00  -> webgl1="WebGL GLSL ES 1.0"
#3 webgl1 stays 1.0
#3 webgl2 context is not the webgl1 object
#3 webgl2 identity is stable per canvas
#3 webgl2 context.canvas points back at its canvas
#3 webgl2 extension list differs from webgl1         -> webgl1=29, webgl2=16
#3 webgl2 extension count is in the 16-18 baseline band -> 16 extensions
#3 webgl2-only params answer baseline values          -> MAX_SAMPLES=8, MAX_3D_TEXTURE_SIZE=2048
#3 webgl2 exposes the 2.0 entry points               -> createVertexArray/createQuery/createSampler/texStorage2D/fenceSync present
#3 webgl1 does not expose the 2.0 entry points
#3 unsupported extension answers null on webgl2
#3 webgl2 is registered as native code
```

**预期影响**：`getContext('webgl2')` 的 `VERSION`/`getSupportedExtensions().length`/2.0 API 探测三路读数
全部与 1.0 区分开。当前构建未调用 `webgl2`（§7），不影响本次 `collect`；对探测 2.0 的构建直接消除该缺口。

---

## 4. `getComputedStyle().getPropertyValue` 恒 `''`

**改前**（`env.mjs:476-483`）：`getComputedStyle` 返回 `{ getPropertyValue(){return ''}, … length:0 }`；
元素 `style` 也只是普通 `{}`（没有 `setProperty`）。`env_gap` 判定 `suspicious-value`
（基线 `display="block"`、`color="rgb(0, 0, 0)"`）。

**改后**

- `makeStyle()`：CSSStyleDeclaration 形状的 Proxy（存储用 kebab 键）。
  `style.color='red'`、`style.backgroundColor='rgb(1,2,3)'`、`style.setProperty('color','red')`、
  `style.getPropertyValue('color')` 命中同一个槽位；另有 `getPropertyPriority()`、`removeProperty()`、
  `item(i)`、`length`、`cssText`（可读可写）。所有方法登记进 `NATIVE_FNS`，
  `Function.prototype.toString` 一律回 `[native code]`（否则一行源码就是机器指纹）。
- 每个元素（含 `documentElement` / `body` / `head` / 每个 canvas）各自一份 style，不再共享引用。
- `getComputedStyle(el)`：先查该元素的 inline 值 → 再落 Firefox 初始值表（`CSS_DEFAULTS`：
  `color=rgb(0, 0, 0)`、`display=block`（行内标签/`CANVAS` 为 `inline`）、`visibility=visible`、
  `background-color=rgba(0, 0, 0, 0)`、`font-family=serif`、`font-size=16px`、`cursor=auto`、`opacity=1` …），
  未知属性才回 `''`；`getPropertyPriority()` 恒 `''`（inline `!important` 目前不记录值，只保证语义正确）。

**自证**

```
#4 setProperty(color,red) is visible via getPropertyValue -> got "red"
#4 getPropertyPriority() is ""
#4 inline style survives a camelCase assignment
#4 unstyled element falls back to the Firefox initial values -> color=rgb(0, 0, 0), display=block
#4 a known CSS property is never an empty string -> color=rgb(0, 0, 0), display=block, visibility=visible, font-family=serif, font-size=16px, cursor=auto, opacity=1
#4 style.setProperty is exposed as native code
#4 body keeps its own computed color
#4 per-element inline styles do not bleed
```

**预期影响**：`getComputedStyle(el).getPropertyValue('color')` 从 `''` 变成 `rgb(0, 0, 0)`（本构建真实读了
2 次 `color`，见 §7）。这是本次唯一会被 `cur_tdc.js` 直接读到的改动 —— `collect` 长度仍不变（§7）。

---

## 5. `performance.now()` 用 hrtime 当页面时钟

**改前**（`env.mjs:278`）：`now: () => Number(process.hrtime.bigint() / 1000n) / 1000`，
是**进程/系统启动以来的毫秒数**。实测 `env.mjs` 的 `now()` = **156,068,684 ms（≈43 小时）**，
而 `Date.now()-timeOrigin` 只有几秒 —— 与 `env_gap` 记录的 37546 倍量级错位同源
（真机语义：`0 ≤ performance.now() ≤ 页面年龄`）。

**改后**

```js
const PAGE_HR0 = process.hrtime.bigint();   // 模块加载 = 页面创建
const PAGE_WALL0 = Date.now();
export function pageAgeMs() { return Number(process.hrtime.bigint() - PAGE_HR0) / 1e6; }
```

- `performance.now()` 返回自 `PAGE_HR0` 的毫秒：新环境首次调用 ~0–50ms，之后按真实单调速率增长。
- `performance.timeOrigin = PAGE_WALL0`，于是 `Date.now() - timeOrigin == performance.now()`
  **按构造成立**（旧实现两者差 37546 倍）。
- `performance.timing` 同步重写（`env_gap` #18）：`navigationStart === timeOrigin`，
  事件偏移按"页面年龄"等比压缩后落盘（`scale = min(1, age/4.2)`），保证**没有任何 timing 字段晚于 `now()`**。
  这是 #5 的必然副作用：`now()` 被要求 ≈0–50ms 时，不可能同时宣称 1.2s 的加载时间线；此处选择"时钟与时间线自洽"。

**自证**

```
#5 performance.now() first call < 200ms              -> now()=4.075ms, build took 3ms
#5 performance.now() is not process uptime           -> pageAgeMs()=5.398
#5 Date.now()-timeOrigin == performance.now()        -> drift=0.075ms, timeOrigin=1794993810438
#5 timeOrigin == performance.timing.navigationStart  -> nav=1794993810438
#5 performance.now() grows monotonically             -> delta over 25ms sleep = 27.446ms
#5 page timeline stays inside the page age           -> 1794993810438 <= … <= 1794993810442
```

**预期影响**：时间戳类字段从"绝对 uptime"变成"页面相对时间"，`performance.now()`/`timeOrigin`/`timing`
三者自洽。本构建的 `collect` 走的是 `Date.now()`（`env_gap` §6：pin `performance.now` 对块漂移无影响），
所以长度不变。

---

## 6. `screen` 尺寸证据冲突 —— 保留 2048×1152

**冲突原文**：`env.mjs:319` 的注释声称基线来自 `samples/baseline_iframe.json`
（inner 330×70 / outer 2048×1104 / screen 2048×1152 / dpr 1.25），但**该文件在仓库里不存在**；
仓库里唯一的 `compare_env` 实测包 `samples/env_bundle.json` 是**主 frame**：screen 1536×864、
avail 1536×816、outer 1536×816、dpr 1.25。两者不可能同为真（dpr 都是 1.25）。

**判定：iframe 实测优先，保留 2048×1152。** 理由写在 `env_candidate.mjs` 的 FP 注释里，摘要：

1. TDC 只跑在 330×70 的 widget iframe 里（`scripts/eo-frame.js@192508` 的尺寸表
   `eo_pc:{height:70,width:330,btn_width:298}`），它读到的 `screen` 是**它所在显示器的**尺寸；
   被 iframe 记录到的 2048×1152 才是 SDK 侧证据。
2. `env_bundle.json` 是 camoufox `compare_env` 对**主 frame**导出的，主 frame 与 iframe 的窗口几何本就不同
   （`innerWidth=1522` vs `330`），拿主 frame 的 screen 覆盖 iframe 的 screen 属于跨 frame 串味。
3. `samples/env_gap.json#screen.*` 的 `suspicious-value` 判定是"本地 2048 vs 主 frame 1536"，
   并未证明 iframe 侧是错的 —— 属于证据不足，而非反证。

**改后**：`FP.screen = {2048,1152, availWidth 2048, availHeight 1104, dpr 1.25}`、
`FP.win = {outerWidth 2048, outerHeight 1104, innerWidth 330, innerHeight 70}`，
`harden()` 不再"先建后硬写"（删掉原 `screen.width=2048` 那一串覆盖），
`innerWidth/innerHeight/outerWidth/outerHeight/devicePixelRatio/screen.*` **统一由 FP 派生**；
`matchMedia` 的视口比较也改成读 `FP.win`，不再散落魔法数 330/70。

**自洽关系**（自测断言）：

```
#6 screen is 2048x1152 (iframe measurement kept) -> 2048x1152
#6 screen.avail is 2048x1104
#6 inner is 330x70 (widget iframe)               -> 330x70
#6 outer is 2048x1104
#6 devicePixelRatio is 1.25
#6 inner <= outer <= avail <= screen             -> inner 330x70 <= outer 2048x1104 <= avail 2048x1104 <= screen 2048x1152
#6 outer fills the screen width (48px vertical chrome only)
```

即：窗口宽=屏宽=2048；可用高 1104 = 屏高 1152 − 48（上下边框/任务栏槽）；外框 2048×1104 = 可用区；
内容区 330×70 是 iframe 视口；dpr 1.25 全程一致。

---

## 7. 回归：`samples/cur_tdc.js` on `env_candidate.mjs`

`node scripts/env_regress.mjs`（离线；同一进程里先跑基线 `env.mjs` 再跑候选，避免环境差异）：

```
tdc.js bytes          264504
env.mjs   collect     4204 (eks 352, 983ms)
candidate collect     4204 (eks 352, 975ms)
delta                 0
first performance.now() mjs/candidate   156068684.4 / 1961.5
webgl 1.0/2.0         WebGL 1.0 / WebGL 2.0 | ext 29 / 16
measureText 18pt      216.0500061035156 (env.mjs 90.02083587646484)
png 240x60 chars      54390 | 300x150 5282
computed color        "red"
cube trace env.mjs    createElement=158 offsetWidth=125 canvas.getContext=7 gl.getParameter=4 2d.fillText=3 gl.getExtension=3 new OfflineAudioContext=2 2d.getImageData=1 startRendering=1 canvas.toDataURL=1
cube trace candidate  createElement=159 offsetWidth=125 canvas.getContext=8 gl.getParameter=4 2d.fillText=3 gl.getExtension=3 new OfflineAudioContext=2 2d.getImageData=1 startRendering=1 canvas.toDataURL=1
```

- **不报错**：`TDC.getData(true)` 正常返回，`getInfo().info` 长度 352 不变。
- **`collect` 长度 4204，与基线一致**；连跑 3 次基线/候选都是 4204/352，结构稳定。
  （`collect` 是加密码文，逐字节内容每轮不同属正常；此处只比结构与长度。）
- trace 只有 `canvas.getContext` 多 1 次（159/8 vs 158/7）：多出来的是 `harden()` 预热 webgl2 上下文的那一次
  `createElement('canvas').getContext('webgl2')`，发生在 SDK 执行之前，SDK 侧读数不受影响。
- 本构建真实读到的只有：`canvas.toDataURL`（300×150 → 仍返回录制的真机 PNG，故长度未变）、
  `getComputedStyle(...).getPropertyValue('color')`（现在回 `rgb(0, 0, 0)` 而非 `''`）、
  `gl.getParameter` / `gl.getExtension` / OfflineAudioContext 若干。
  **`measureText` 与 `getContext('webgl2')` 在这份构建里调用次数为 0**（另一份 `browser_tdc.js` 才读它们）。
- `samples/env_regress.json` 保存了完整对比（含两个环境的关键字段快照）。

---

## 8. 没改的项目及原因

| 项目 | 证据/等级 | 不改的理由 |
| --- | --- | --- |
| `localStorage`/`sessionStorage`/`document.cookie` 空壳 | `env_gap` #7/#15 `missing` | 要把 `TDC_itoken` 读写做成命名空间 + cookie jar，属于**状态机层面**的改动，会改变 SDK 分支与 `collect` 内容；与本次六项正交，单独立项做才有回归意义 |
| `matchMedia` 语义（`min-width:1px` 恒 false） | `env_gap` #1 `suspicious-value`（影响 37.5） | 只做了"接上 FP.win"这一步（#6 自洽需要）；采样 `pointer/hover/color-scheme` 的完整语义未动，避免一次改两件事 |
| `document.body/documentElement.clientWidth/Height = 1281×624` | `env_gap` §4 推断项 | 与 `innerWidth 330×70` 矛盾，但属布局不变量；改动面涉及滚动条/`clientTop` 等一整组，未在六项内 |
| `gl.MAX_VERTEX_UNIFORM_VECTORS=4096`（基线 4095） | `env_gap` §4 | 属 webgl1 参数微调，改了会动 1.0 指纹而 #3 只要求 2.0 独立；留待专门对齐 |
| `navigator.plugins[*].mimeTypes` / `mimeTypes.suffixes` 缺项 | `env_gap` #20/#21 | 需按 `env_bundle.json` 重建双向引用结构，不在六项内 |
| `AudioContext` 与 `OfflineAudioContext` 同体（实时 44100 vs 基线 48000） | `env_gap` #23 | 拆分实时/离线上下文会影响 `startRendering` 的音频指纹路径（本构建 `startRendering=1`），风险高于收益，单独立项 |
| `toDataURL('image/jpeg')` 仍返回 PNG 字节；`toBlob` 仍 `cb(null)` | 本次实现限制 | Node 内置没有 JPEG 编码器；要真做只能自写量化/DCT，与 `zlib` 约束不符。当前 SDK 调用 `toDataURL(undefined)`，不触发 |
| `getShaderPrecisionFormat` 的 INT 分支 | `env_bundle.json#webgl.shader_precision` | 原实现已对 `HIGH/MEDIUM/LOW_INT` 返回 `{0,31,30}`、浮点返回 `{23,127,127}`，与基线一致，无需改（`env_gap` 里那条异常来自另一份读取路径） |
| `navigator.deviceMemory` 删除、`harden()` 的 native toString | 已在 `env.mjs` 完成 | 沿用，未触碰 |
| `script` 目录里的临时探针 `_probe_*.mjs` / `_baseline_local_collect.mjs` | 本次工作产生的临时脚本 | 结论已写进本报告，临时脚本已删除，避免污染 scripts/ |

---

## 9. 复现方式

```bat
cd D:\ds_work\js_reverse_projects\eo_captcha_reverse
node scripts/env_selftest.mjs      :: 51/51 全绿，exit 0；纯离线
node scripts/env_regress.mjs       :: collect 4204 / eks 352，纯离线
```

产物：

- `scripts/env_candidate.mjs` —— 六项修复的副本环境（`env.mjs` 保持只读）
- `scripts/env_selftest.mjs` —— 逐项断言（自带 PNG 解析器/CRC32，不复用被测实现）
- `scripts/env_regress.mjs` —— `cur_tdc.js` 双环境回归
- `samples/env_regress.json` —— 回归原始数据
