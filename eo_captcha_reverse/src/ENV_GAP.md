# ENV_GAP：EdgeOne/天御 TDC `collect` 的环境缺口分析（纯本地）

> 生成方式：`node scripts/e31_env_reads_full.mjs && node scripts/env_probe.mjs && node scripts/e32_env_gap.mjs`
> 全程不发网络请求、不启动浏览器；所有结论绑定 `samples/` 下的证据文件。
> 结构化数据见 [env_gap.json](../samples/env_gap.json)、实读清单见 [env_reads_full.json](../samples/env_reads_full.json)。

## 0. 一句话结论

服务端 `errorCode=12` 的可疑来源不是算法而是**六类可测的环境缺口**：
(a) 时钟不自洽（`performance.now()` 比页面年龄大 **37546 倍**）；
(b) 图形指纹退化成常量（`getShaderPrecisionFormat` 恒返回同一组值、`webgl2` 返回 1.0、`toDataURL` 与画布尺寸脱钩）；
(c) 会话状态容器缺失（`localStorage/sessionStorage/cookie` 全是空壳，浏览器里实有 7 个键 + 5 个 cookie）；
(d) 媒体查询恒 false（`matchMedia` 被读 15 次全 false，连 `min-width:1px` 都 false）；
(e) 屏幕几何对不上（本地 2048×1152 / 外框 2048×1104，基线 1536×864 / 1536×816）；
(f) 若干原生字段直接 undefined（`isSecureContext`、`history`、`baseLatency/outputLatency`、`gl.bindBuffer`）。

判定规模：**135 个实读键**全部过了一遍，其中
`missing=16`、`wrong-type=2`、`suspicious-value=19`、`extra=1`、`ok=33`、`unknown=91`。

按**实读键**统计（`samples/env_gap.json#readKeyIndex`，135 键逐一对应）：
`missing=8`、`wrong-type=2`、`suspicious-value=13`、`extra=1`、`ok=20`、`unknown=91`。

## 1. 证据链与口径

| 证据 | 角色 | 说明 |
| --- | --- | --- |
| `samples/env_reads_full.json` | 实读清单 | e31 用 `samples/tdc_envwl_full.js`（白名单从 180 键扩到 584 项）跑 `buildEnv()`，得 135 个键 + 次数 + 取值 + undefined 占比 |
| `samples/env_bundle.json` | 浏览器基线 | camoufox `compare_env` 导出；**主 frame**，尺寸类不可直接照抄（SDK 跑在 330×70 的 widget iframe 里） |
| `scripts/eo-frame.js@192508` | iframe 尺寸 | 尺寸表 `eo_pc:{height:70,width:330,btn_width:298}` → `innerWidth/innerHeight=330/70` 是对的 |
| `samples/dumped_font_widths.json` + `samples/tdc_font_families.json` | 字体度量 | 136 个查询族 **136/136** 有实录宽度（这条是补齐的） |
| `samples/canvas_real_dataurl.txt` / `canvas_pixels.bin` | 画布 | 实录 300×150 PNG（5282 字符）；基线自身是 240×60（7078 字符） |
| `samples/env_probe.json` | 自变块收敛 | 见 §6 |
| `samples/env_storage_calls.json` | storage/cookie 实调 | 包一层 getItem/setItem/cookie 后跑 `cur_tdc.js`：真正用的是 `TDC_itoken`（local+session+cookie），不是 `__tg_*` |

判定等级：`missing` / `wrong-type` / `suspicious-value` / `extra` / `ok` / `unknown`。
`extra` 是本次新增的一档：**基线里根本没有这个键，本地却塞了进来**（Firefox 未实现的 API）。
没有基线的键一律 `unknown`，不猜。

**证据冲突（必须写清楚）**：`scripts/env.mjs:319` 的注释声称"基线来自 `samples/baseline_iframe.json`：inner 330×70、outer 2048×1104、screen 2048×1152、dpr 1.25"，
但**该文件在仓库里不存在**，而唯一实测基线 `samples/env_bundle.json` 给的是 screen 1536×864 / avail 1536×816 / outer 1536×816 / dpr 1.25。
两者不可能同时对（dpr 都是 1.25）。本报告以 `env_bundle.json` 为准，并把这一条标成 `suspicious-value`；
如果主会话确实手里有那份 iframe 基线，需要把它补进 `samples/` 再复核。

## 2. 实读清单（e31）

- 白名单从 e25 的 180 项扩到 584 项，实读键从 86 个（`samples/tdc_env_reads.json`）涨到 **135 个**（`samples/env_reads_full.json`）。
- 日志未触及 CAP：entries=4016 / cap=20000，所以没有因截断丢键（`filteredOrDropped=7061165` 是被白名单滤掉的事件，不是丢失）。
- 高频键前 10：`toString`(1505)、`length`(1004)、`style`(256)、`createElement`(157)、`appendChild`(147)、`removeChild`(129)、`offsetWidth`(124)、`width`(123)、`offsetHeight`(103)、`height`(102)。
- 说明：本仓库的 `samples/tdc_instrumented.js` 是 **`browser_tdc.js`（TDC_NAME=BCibae…）** 的插桩版，而 `e30` 做块对齐用的是 `cur_tdc.js`（TDC_NAME=OUjbOm…）。两份是不同构建，实读清单来自前者 —— 键名集合可作为代表，但**逐键次数**未必等于后者。

## 3. 缺口判定（只列实读且判定异常，按影响=次数×严重度排序）

| # | 影响 | 等级 | 键 | 实读 | 本地现值 | 基线值 | 证据 | 改法 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 37.5 | suspicious-value | `window.matchMedia` | 15 | array(len=3) | browser: matchMedia("(min-width: 1px)").matches === true（必然为真的查询） | derived:CSS 媒体查询语义 + env_bundle.css.values 有 383 个真实属性；本地对 min-width:1px / max-width:99999px / prefers-reduced-motion:no-preference 全部返回 [false,false,false]；SDK 读 matchMedia 15 次、读 matches 10 次，全部拿到 false。env.mjs:406 恒返回 matches:false。 | 按查询解析真实求值：min-width/max-width 用 innerWidth 比较、prefers-* 用固定值 true/false、orientation 用 innerWidth>innerHeight；matches 只对真正不匹配的查询为 false。 |
| 2 | 30 | suspicious-value | `performance.now` | 12 | 150185927.66 | browser: 0 ≤ performance.now() ≤ 页面年龄（毫秒级，几十~几万） | derived:browser semantics（env_bundle 未直采 performance.now）；本地 performance.now()=150185927.7ms，而 Date.now()-timeOrigin=4000ms，比值 37546×；env.mjs:255 用 process.hrtime 当 performance.now，量级是"系统开机以来"，浏览器不可能超过页面年龄。 | w.performance.now = () => (Date.now() - w.performance.timeOrigin) + 单调小抖动；并把 timeOrigin 设为"页面导航"时刻（见 performance.timing 项）。 |
| 3 | 30 | suspicious-value | `gl.getShaderPrecisionFormat` | 12 | object([object Object]) | 基线：HIGH_FLOAT=[127,127,23]，HIGH_INT=[31,30,0]（顶点/片段都一样，但 INT 类明显不同） | samples/env_bundle.json#webgl.shader_precision（12 组）；本地 4 组实测 {"VS_HIGH_FLOAT":"23,127,127","VS_HIGH_INT":"23,127,127","FS_HIGH_FLOAT":"23,127,127","FS_HIGH_INT":"23,127,127"}；env.mjs:155 对所有 shaderType/precisionType 恒返回 {23,127,127}，INT 类应是 [31,30,0]。SDK 读 getShaderPrecisionFormat 12 次。 | 按 (shaderType, precisionType) 查表：FLOAT→(23,127,127)，INT→(0,31,30)（用 bundle 的 12 组原值）。 |
| 4 | 15 | suspicious-value | `HTMLCanvasElement.getContext("webgl2")` | 6 | "WebGL 1.0" (len=9) | webgl2: version "WebGL 2.0"，16 个扩展；webgl1: 29 个扩展 | samples/env_bundle.json#webgl.webgl2.{version,extensions} / webgl.{extensions,extension_count}；本地 getContext("webgl2") 返回的是同一个 1.0 stub：VERSION="WebGL 1.0"，扩展数 29（与 webgl1 相同）。 | 为 webgl2 单独一份 stub（VERSION="WebGL 2.0"、扩展列表用 bundle 的 16 项、带 texStorage2D 等 2.0 方法）。 |
| 5 | 12 | wrong-type | `navigator.gpu` | 4 | "[object Object]" (len=15) | GPU（Object.prototype.toString → [object GPU]） | samples/env_bundle.json#navigator.gpu.value = {"__t":"GPU"}；本地 [object Object]，基线 [object GPU]。方法也在：基线 requestAdapter/getPreferredCanvasFormat 为原生函数。 | 给 gpu 对象加 Symbol.toStringTag = "GPU"，并把 requestAdapter/getPreferredCanvasFormat 注册进 nativeFns。 |
| 6 | 9 | wrong-type | `navigator.storage` | 3 | "[object Object]" (len=15) | StorageManager（[object StorageManager]） | samples/env_bundle.json#navigator.storage.value = {"__t":"StorageManager"}；本地 [object Object]，基线 [object StorageManager]。 | 给 storage 对象加 Symbol.toStringTag = "StorageManager"。 |
| 7 | 6 | missing | `localStorage/sessionStorage.getItem` | 2 | null | localStorage 键：__tg_cid__(36 字符), captcha_webworker_supported(1)；sessionStorage：__tg_live__, __tg_sid__(36), __tg_seq__, __tg_ctx_last__(246), __tg_ctx_sid__(36) | samples/env_bundle.json#storage.localStorage.keys / sessionStorage.keys（主 frame 的 blog.51cto.com 源，与 widget iframe 的 captcha.eo.qq.com 源不同，键名不可照搬）；本地 getItem 恒返回 null（env.mjs:259 是空壳且 setItem 是 no-op）。实测这份构建真正用的是 TDC_itoken 而不是 __tg_*：把 getItem/setItem 包一层记录后跑 cur_tdc.js 得到 getItem=[local:TDC_itoken, session:TDC_itoken]、setItem=[local:TDC_itoken=21 字节, session:TDC_itoken=21 字节]（sample | 换成 Map 支持的 Storage（getItem/setItem/removeItem/key/length），保证 TDC_itoken 往返；再按需预置 __tg_cid__/__tg_sid__/__tg_seq__/__tg_ctx_last__/__tg_ctx_sid__（旧 __tg_* 构建会用，长度按基线）。 |
| 8 | 6 | missing | `gl.bindBuffer` | 2 | "undefined" (len=9) | function（WebGLRenderingContext 原生方法） | derived:基线 webgl 可用（env_bundle.webgl.available=true）+ 本地实读 undefined；本地 typeof gl.bindBuffer === undefined；SDK 读到 bindBuffer 2 次、值全是 undefined（samples/env_reads_full.json），随后调用会抛 TypeError 被内部 try/catch 吞掉，指纹直接降级。glStub 还缺 vertexAttribPointer / enableVertexAttribArray / pixelStorei / drawElements / texParame | 把 glStub 补齐：bindBuffer/bufferData/vertexAttribPointer/enableVertexAttribArray/pixelStorei/drawElements/getUniformLocation 等一律返回合法占位（数字 0 / 空对象），并与 native toString 一致。 |
| 9 | 6 | missing | `OfflineAudioContext.baseLatency/outputLatency` | 2 | array(len=2) | baseLatency=0, outputLatency=0 | samples/env_bundle.json#audio.{base_latency,output_latency}；本地 baseLatency/outputLatency 均为 undefined（env.mjs:268 起的 OfflineAudioContext 未定义），SDK 读 baseLatency 2 次、outputLatency 1 次都是 undefined。 | 在 OfflineAudioContext 上定义 baseLatency=0、outputLatency=0（getter + native toString）。 |
| 10 | 5 | suspicious-value | `screen.width` | 123（键名 width 被 screen/canvas/div 共用，属合并计数） | 2048 | 1536 [number] | samples/env_bundle.json#screen.width；本地 2048 vs 基线 1536（samples/env_bundle.json#screen.width）；'width' 实读值里 2048 出现 2 次（samples/env_reads_full.json#width.valueCounts），说明 screen.width 确实被读到 | FP.screen.width 改 1536，并删掉 harden() 里 env.mjs:391 的 `screen.width=2048; screen.height=1152; availWidth=2048; availHeight=1104` 覆盖。 |
| 11 | 5 | suspicious-value | `screen.height` | 102（键名 height 合并计数） | 1152 | 864 [number] | samples/env_bundle.json#screen.height；本地 1152 vs 基线 864（samples/env_bundle.json#screen.height）；'height' 实读值里 1152 出现 2 次 → screen.height 被读到 | FP.screen.height 改 864，同上删掉 harden() 的 1152 覆盖。 |
| 12 | 5 | suspicious-value | `getComputedStyle().getPropertyValue` | 2 | "" (len=0) | "block" (len=5) [string] | samples/env_bundle.json#css.values（383 项）；本地 getComputedStyle(...).getPropertyValue("display")=""（恒空串），env.mjs:431 的 stub 只有空实现；SDK 读 getPropertyValue 2 次。 | 用 env_bundle.css.values 建表返回真实值（至少 display/visibility/color/background-color/font-family/font-size/pointer-events/user-select/appearance），并支持 getPropertyPriority、length、item(i)。 |
| 13 | 3 | missing | `window.isSecureContext` | 1 | undefined | true [boolean] | samples/env_bundle.json#window.metrics.isSecureContext；本地 undefined vs 基线 true（samples/env_bundle.json#window.metrics.isSecureContext） | w.isSecureContext = true（https 页面恒为 true，且 SDK 读 1 次）。 |
| 14 | 3 | missing | `window.history` | 1 | undefined | History（length=1） | samples/env_bundle.json#window.history_length；本地 undefined vs 基线 1（samples/env_bundle.json#window.history_length） | w.history = { length: 1, state: null, scrollRestoration: "auto", pushState(){}, replaceState(){}, back(){}, forward(){}, go(){} }（并给 Symbol.toStringTag="History"）。 |
| 15 | 3 | missing | `document.cookie` | 1 | "" (len=0) | 主 frame 存在 5 个 cookie 名：[path, __tst_status, EO_Bot_Ssid, path, __tg_ctx]（源不同，仅作形状参考） | samples/env_bundle.json#storage.cookie_names；本地 document.cookie=""（空串）。SDK 读 cookie 1 次；实测（samples/env_storage_calls.json，把 cookie 换成可观测 getter/setter 后跑 cur_tdc.js）：读 1 次（拿到空串）+ 写 1 次 `TDC_itoken=1230875332%3A…; expires=…; path=`。本地是普通数据属性，写什么就存什么，不会像浏览器那样把多条 name=value 合并成 "; " 串。 | 实现最小 cookie jar：setter 解析 `k=v; expires=…; path=…` 写入 map，getter 按 "k1=v1; k2=v2" 拼回（含 path 过滤）；初始可为空，但要保证读回自己写过的 TDC_itoken。 |
| 16 | 3 | missing | `gl.isContextLost` | 1 | "undefined" (len=9) | function，返回 false | derived:WebGL 原生 API（本地实读 undefined）；本地 typeof gl.isContextLost === undefined；SDK 读到 1 次 undefined。 | glStub.isContextLost = () => false（并 mark 为 native）。 |
| 17 | 3 | missing | `AudioContext.close` | 1 | "undefined" (len=9) | function，返回 Promise<undefined> | derived:Web Audio 原生 API（本地实读 undefined）；本地 typeof close === undefined；SDK 读到 close 1 次 undefined —— 说明它走了 AudioContext 分支却调不到 close()。 | OfflineAudioContext/AudioContext 上补 close()/resume()/suspend()（返回已 resolve 的 Promise）。 |
| 18 | 2.5 | suspicious-value | `performance.timing.*` | 1 | 1794988070710 | browser: navigationStart == timeOrigin，且 performance.now() 与之单调自洽 | derived:自洽性（env_bundle 无 performance.timing 段）；本地 navigationStart=1794988070710、timeOrigin=1794988070710 相等（这一条本身 OK），但 performance.now() 与两者差 37546×；事件时间戳与 timing 段属于两套时钟。另外整段 timing 由 buildEnv 时 Date.now()-4000 现算（env.mjs:453 起的 timing 段），每次构建都变 —— samples/env_probe.json 里 "pin build- | 把 timeOrigin/timing 固定为"页面加载时刻"常量（或从基线 env_bundle 反推），performance.now 改为 Date.now()-timeOrigin。 |
| 19 | 2.5 | suspicious-value | `screen.availHeight` | 1 | 1104 | 816 [number] | samples/env_bundle.json#screen.availHeight；本地 1104 vs 基线 816（samples/env_bundle.json#screen.availHeight）；availHeight 实读值 1104（1 次）→ 本地的 availHeight 直接被写进 payload | FP.screen.availHeight 改 816（harden 里 1104 的覆盖一起删）。 |
| 20 | 2.5 | suspicious-value | `navigator.plugins[*].mimeTypes` | 1 | undefined | 每个 plugin 带 mimeTypes 数组（PDF Viewer → application/pdf + text/pdf） | samples/env_bundle.json#navigator.plugins.value[0].mimeTypes（2 项）；本地 plugin[0] 的键只有 ["name","filename","description","length"]，没有 mimeTypes；基线每个插件挂了 2 个 mimetype。 | 在 FP.nav.plugins 里补 mimeTypes 数组，并在 makeEnv 时把 enabledPlugin 反向指回插件（双向引用）。 |
| 21 | 2.5 | suspicious-value | `navigator.mimeTypes[*].suffixes` | 1 | array(len=3) | {type:"application/pdf", suffixes:"pdf", description:"Portable Document Format"} | samples/env_bundle.json#navigator.mimeTypes.value[0]；本地 [type,suffixes,description]=["application/pdf","",""]，suffixes/description 为空串；基线分别是 "pdf" 与 "Portable Document Format"。 | 把 FP.nav.mimes 改成 [{type:"application/pdf",suffixes:"pdf",description:"Portable Document Format"},{type:"text/pdf",…}]。 |
| 22 | 2.5 | suspicious-value | `canvas.toDataURL` | 1 | "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAASwAAACWCAYAAABkW7XSAAAPE0lEQVR4Xu…" (len=5282) | 基线 dataURL：300×150 之外的 240×60 PNG，7078 字符，sha256=461b25e87e96b1f4… | samples/env_bundle.json#canvas.{data_url_length,data_url,data_url_sha256,size}；本地返回固定字符串（5282 字符，PNG IHDR=300×150）；把 canvas 改成 240×60 后仍返回同一串（IHDR 依旧 300×150），说明 toDataURL 与画布尺寸/绘制内容完全脱钩。基线实测尺寸 240×60、长度 7078。 | toDataURL 至少按 this.width/this.height + 记录过的像素生成对应 PNG（IHDR 必须等于画布尺寸），并按 type 返回 image/png 或 image/jpeg 前缀；理想做法是用 canvas_pixels.bin 真实回放。 |
| 23 | 2.5 | suspicious-value | `AudioContext.sampleRate` | 1 | 44100 | 实时 AudioContext sample_rate=48000；离屏 offline_sample_rate=44100 | samples/env_bundle.json#audio.{sample_rate,offline_sample_rate}；本地 w.AudioContext === w.OfflineAudioContext（env.mjs:309），new AudioContext().sampleRate=44100；基线的实时上下文是 48000Hz。任何"实时上下文 44100"的读数都与基线不符。 | 把 AudioContext 与 OfflineAudioContext 拆开：实时上下文默认 sampleRate=48000、state="running"、maxChannelCount=2。 |
| 24 | 1.5 | extra | `navigator.deviceMemory` | 1 | 8 | 基线 navigator 上不存在该键（Firefox 未实现） | samples/env_bundle.json#navigator（键表无 deviceMemory）；本地 navigator.deviceMemory=8，而 env_bundle 的 navigator 键表里没有 deviceMemory → Firefox 上 "deviceMemory" in navigator === false。 | 删掉 w.navigator.deviceMemory（或至少使其不可枚举、且 typeof 为 undefined）。 |

## 4. 未读但便宜的补齐项（readCount=0，属"对得上才不会露"的字段）

| 等级 | 键 | 本地现值 | 基线值 | 证据 | 改法 |
| --- | --- | --- | --- | --- | --- |
| suspicious-value | `screen.availWidth` | 2048 | 1536 [number] | samples/env_bundle.json#screen.availWidth | FP.screen.availWidth 改 1536（harden 里 2048 的覆盖一起删）。 |
| suspicious-value | `window.outerWidth` | 2048 | 1536 [number] | samples/env_bundle.json#window.metrics.outerWidth | 外层窗口尺寸改 1536×816（harden 里 env.mjs:387 的 2048/1104 覆盖删掉）；outerWidth 对 iframe 而言等于顶层窗口，不能自造。 |
| suspicious-value | `window.outerHeight` | 1104 | 816 [number] | samples/env_bundle.json#window.metrics.outerHeight | 同上，改 816。 |
| suspicious-value | `document.body.clientWidth` | 1281 | browser: 布局视口宽度必须 ≤ innerWidth | derived:布局不变量（env_bundle.document 未采 clientWidth） | body/documentElement 的 clientWidth/clientHeight 应跟随 iframe 视口（330×70 减去滚动条），或直接取 innerWidth/innerHeight。 |
| missing | `appCodeName` | undefined | "Mozilla" (len=7) [string] | samples/env_bundle.json#navigator.appCodeName | w.navigator.appCodeName = 'Mozilla'（Firefox 恒此值，env.mjs:95 的 navigator 字面量漏了）。 |
| missing | `product` | undefined | "Gecko" (len=5) [string] | samples/env_bundle.json#navigator.product | w.navigator.product = 'Gecko'。 |
| missing | `doNotTrack` | undefined | "unspecified" (len=11) [string] | samples/env_bundle.json#navigator.doNotTrack | w.navigator.doNotTrack = 'unspecified'（Firefox 未设置 DNT 时的字面值）。 |
| missing | `navigator.pdfViewerEnabled` | undefined | true [boolean] | samples/env_bundle.json#navigator.pdfViewerEnabled | w.navigator.pdfViewerEnabled = true（与 5 个 PDF 插件一致）。 |
| missing | `navigator.globalPrivacyControl` | undefined | false [boolean] | samples/env_bundle.json#navigator.globalPrivacyControl | w.navigator.globalPrivacyControl = false。 |
| missing | `document.designMode` | undefined | "off" (len=3) [string] | samples/env_bundle.json#window.document.designMode | 把本地值改成基线值（或在 env.mjs 里补齐该字段） |
| missing | `document.dir` | undefined | "" (len=0) [string] | samples/env_bundle.json#window.document.dir | 把本地值改成基线值（或在 env.mjs 里补齐该字段） |
| suspicious-value | `CanvasRenderingContext2D.measureText` | array(len=2) | browser: 同一文本在 10px 与 100px 下宽度差 10 倍（基线 measure_text 按 font 分档：14px Arial=224.9、16px serif=239.8 …） | samples/env_bundle.json#canvas.measure_text（按 font 键）; 反证=samples/env_bundle.json#canvas.measure_text 各档宽度互不相同 | measureText 宽度 = f(字体族, 字号, 文本)：以 dumped_font_widths 的 per-family 宽度为基线，按 font 的 px 线性缩放，并对实际BoundingBox* 用同一系数。 |
| suspicious-value | `gl.MAX_VERTEX_UNIFORM_VECTORS` | 4096 | 4095 [number] | samples/env_bundle.json#webgl.parameters.MAX_VERTEX_UNIFORM_VECTORS | 把本地值改成基线值（或在 env.mjs 里补齐该字段） |
| missing | `gl.getContextAttributes` | object([object Object]) | {alpha:true,antialias:true,depth:true,failIfMajorPerformanceCaveat:false,powerPreference:"default",premultipliedAlpha:true,preserveDrawingBuffer:false,stencil:false} | samples/env_bundle.json#webgl.context_attributes | getContextAttributes 返回上面这一组固定值（含 powerPreference 字符串）。 |

## 5. 已对齐（`ok`，实读过的）

- `window.innerWidth`：330（iframe 场景：基线 1522 是主 frame，SDK 跑在 330×70 的 widget iframe 里，330 才对）
- `window.innerHeight`：70（同上：70 是 iframe 高度，基线 705 是主 frame）
- `offsetWidth(fontFamily)`：array(len=3)
- `userAgent`："Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:152.0) Gecko/20100101 Firefox/152.0" (len=80)
- `gl.VENDOR/RENDERER`：array(len=2)
- `appVersion`："5.0 (Windows)" (len=13)
- `navigator.userAgentData`：undefined
- `document.hidden`：false
- `webgl.extensions`：29
- `screen.orientation`："landscape-primary" (len=17)
- `navigator.plugins.length`：5
- `appName`："Netscape" (len=8)
- `platform`："Win32" (len=5)
- `vendor`："" (len=0)
- `navigator.languages`："en-US,en" (len=8)
- `navigator.hardwareConcurrency`：32
- `navigator.cookieEnabled`：true
- `navigator.webdriver`：false
- `navigator.connection`：undefined
- `document.characterSet`："UTF-8" (len=5)
- `document.readyState`："complete" (len=8)

## 6. 自变块收敛实测（`scripts/env_probe.mjs` → `samples/env_probe.json`）

口径：8 字节一块（与 `e12/e30` 一致），**每个配置跑 3 个全新 env 实例**，取两两之间出现过差异的块并集；`sameInstance` 列是"同一实例连续两次 getData"的差异块数（会命中 SDK 自身缓存，明显偏小，不能当收敛指标）。

| 配置 | 自变块（并集） | 三对两两差异 | 同实例内 | performance.now() |
| --- | --- | --- | --- | --- |
| baseline (no pin) | 53 | 51 / 9 / 53 | 3 | 148533480.349 |
| pin Date.now | 48 | 48 / 48 / 5 | 1 | 148535268.3 |
| pin performance.now | 53 | 9 / 52 / 53 | 2 | 1234.5 |
| pin Math.random | 8 | 5 / 8 / 8 | 3 | 148539361.398 |
| pin crypto.getRandomValues | 10 | 9 / 10 / 7 | 3 | 148541715.14 |
| pin Date ctor+now | 2 | 1 / 2 / 2 | 1 | 148543961.685 |
| pin Date.now+Math.random | 3 | 2 / 3 / 3 | 1 | 148546354.388 |
| pin performance.now+Math.random | 8 | 5 / 8 / 8 | 3 | 1234.5 |
| pin crypto+Math.random | 8 | 5 / 8 / 7 | 3 | 148550659.583 |
| pin all four | 3 | 3 / 3 / 0 | 1 | 1234.5 |
| pin all four + Date ctor | 0 | 0 / 0 / 0 | 1 | 1234.5 |
| pin build-clock only | 10 | 10 / 10 / 10 | 3 | 148557219.615 |
| pin all four + build-clock | 3 | 3 / 3 / 3 | 2 | 1234.5 |

- 基线自变块 **53** 块（≈400 字节 / 50 块，与主会话观察一致；e30 记录为 52）。
- **只钉 `Math.random` → 8 块**；`Date.now+Math.random` → 3 块。
- **钉 `performance.now` 完全没有效果（53 → 53）**：这份 SDK 的时间戳不走 `performance.now`。
- **四个全钉 → 3 块（残留 `2,149,279`）；再把 `Date` 构造函数也钉死 → 0 块（完全可复现）**。

**块归属（钉死某源后消失的块，相对基线 53 块）**

| 钉死的源 | 消失块数 | 消失的块（连续区间折叠） |
| --- | --- | --- |
| Math.random | 45 | 276-278(3) 280-321(42) |
| crypto.getRandomValues | 43 | 278 280-321(42) |
| Date.now() | 5 | 158 378-381(4) |
| Date 构造函数（new Date()） | 51 | 2 149 158 278-321(44) 378-381(4) |
| buildEnv 构建时刻（timing/timeOrigin） | 43 | 276 280-321(42) |

读法：
- **块 276–321（46 块）是"时间种子的伪随机区"**：钉 `Math.random`、钉 `crypto.getRandomValues`、钉构建时刻、钉 `Date` 构造函数，任一个都能消掉其中大部分 —— 说明它是被某个时间量播过种的伪随机填充，而不是纯 `Math.random`。
- **块 158、378–381（5 块）是真时间戳**：只有钉 `Date.now()` 才消掉。
- **块 2、149、279（3 块）只有钉 `Date` 构造函数（`new Date()`）才消掉**：`samples/cur_tdc.js` 里 2 处 `new Date`。
- 钉 `performance.now` 对任何块都无影响 → 可以用它来验证"哪些块与 perf 时钟无关"。

**给主会话的收敛组合**：钉 `Math.random` + `Date.now` + `new Date()`（Date 构造函数）+ `crypto.getRandomValues` + 构建时钟 ⇒ 自变块 53 → 0。
若只想用最小改动：**只钉 `Date` 构造函数（含 now）** 就能从 53 降到 2。

## 7. 复现

```powershell
cd D:\ds_work\js_reverse_projects\eo_captcha_reverse
node scripts/e31_env_reads_full.mjs      # 产出 samples/tdc_envwl_full.js + env_reads_full.json
node scripts/env_probe.mjs               # 产出 samples/env_probe.json（钉源收敛实测）
node scripts/e32_env_gap.mjs             # 产出 samples/env_gap.json + src/ENV_GAP.md
```

约束遵守情况：未改 `scripts/env.mjs`、`scripts/e2*.mjs`、`scripts/e30_mutation_map.mjs`；未发任何网络请求（没有 prehandle/verify）。

## 8. 未验证清单（`unknown`，共 91 项）

其中 73 项是**泛型 API 名**（`toString/length/createElement/appendChild/…`，不是环境值），逐条列没有意义，只在 `samples/env_gap.json` 留档。
下面列剩下 **18 项"环境语义类但基线没采"** 的键 —— 这些是下一步值得让浏览器侧补采的：

- `matches`（实读 10）：实读 10 次（undefined 占比 0），samples/env_reads_full.json 有本地取值；env_bundle 未采该字段 → 未验证。
- `performance`（实读 9）：实读 9 次（undefined 占比 0），samples/env_reads_full.json 有本地取值；env_bundle 未采该字段 → 未验证。
- `localStorage`（实读 4）：实读 4 次（undefined 占比 0），samples/env_reads_full.json 有本地取值；env_bundle 未采该字段 → 未验证。
- `sessionStorage`（实读 4）：实读 4 次（undefined 占比 0），samples/env_reads_full.json 有本地取值；env_bundle 未采该字段 → 未验证。
- `getExtension`（实读 4）：实读 4 次（undefined 占比 0），samples/env_reads_full.json 有本地取值；env_bundle 未采该字段 → 未验证。
- `setItem`（实读 2）：实读 2 次（undefined 占比 0），samples/env_reads_full.json 有本地取值；env_bundle 未采该字段 → 未验证。
- `colorDepth`（实读 2）：实读 2 次（undefined 占比 0），samples/env_reads_full.json 有本地取值；env_bundle 未采该字段 → 未验证。
- `getComputedStyle`（实读 2）：实读 2 次（undefined 占比 0），samples/env_reads_full.json 有本地取值；env_bundle 未采该字段 → 未验证。
- `pixelDepth`（实读 2）：实读 2 次（undefined 占比 0），samples/env_reads_full.json 有本地取值；env_bundle 未采该字段 → 未验证。
- `outputLatency`（实读 1）：实读 1 次（undefined 占比 1），samples/env_reads_full.json 有本地取值；env_bundle 未采该字段 → 未验证。
- `opener`（实读 1）：实读 1 次（undefined 占比 1），samples/env_reads_full.json 有本地取值；env_bundle 未采该字段 → 未验证。
- `replaceChild`（实读 1）：实读 1 次（undefined 占比 0），samples/env_reads_full.json 有本地取值；env_bundle 未采该字段 → 未验证。
- `devicePixelRatio`（实读 1）：实读 1 次（undefined 占比 0），samples/env_reads_full.json 有本地取值；env_bundle 未采该字段 → 未验证。
- `createRadialGradient`（实读 1）：实读 1 次（undefined 占比 0），samples/env_reads_full.json 有本地取值；env_bundle 未采该字段 → 未验证。
- `stroke`（实读 1）：实读 1 次（undefined 占比 0），samples/env_reads_full.json 有本地取值；env_bundle 未采该字段 → 未验证。
- `closePath`（实读 1）：实读 1 次（undefined 占比 0），samples/env_reads_full.json 有本地取值；env_bundle 未采该字段 → 未验证。
- `fill`（实读 1）：实读 1 次（undefined 占比 0），samples/env_reads_full.json 有本地取值；env_bundle 未采该字段 → 未验证。
- `getImageData`（实读 1）：实读 1 次（undefined 占比 0），samples/env_reads_full.json 有本地取值；env_bundle 未采该字段 → 未验证。

