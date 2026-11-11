# 技术笔记（证据 / 消融 / 踩坑）

只保留**仍然有效**的结论。状态与用法见 [README](../README.md)。

## 1. 挑战页引擎级 trace（77 点，1016 事件 / 31 属性）

在真实 `security.html` 上抓 token 生成全过程，远多于普通页面（17 个属性）：

| 属性 | 次数 | 属性 | 次数 |
|---|---|---|---|
| `document.cookie.get` | 276 | `document.cookie.set` | 244 |
| `window.innerWidth/innerHeight` | 68 / 68 | `canvas.getContext` | 59 |
| `localStorage.getItem` | 42 | `webgl.getExtension` | 42 |
| `webgl.getParameter` | 36 | `screen.rect` | 34 |
| `localStorage.setItem` | 18 | `canvas.toDataURL` | 12 |
| `screen.pixelDepth` / `availRect` | 12 / 12 | `navigator.hardwareConcurrency` | 12 |
| `window.outerWidth/outerHeight` | 8 / 8 | `sessionStorage.getItem` | 6 |
| `performance.timing` | 6 | `navigator.language` | 5 |
| `navigator.userAgent` | 4 | `navigator.platform` | 4 |
| `navigator.maxTouchPoints` | 4 | `navigator.plugins.indexedGetter` | 3 |
| `window.scrollY` | 2 | `sessionStorage.setItem` | 1 |

采集到的真实值：canvas `toDataURL` 43,806 字符、WebGL 扩展 29 个、localStorage 10 个 key
（`passport_config` / `passport-uuid` / `ka-uid` / `warlockjssdkcross` …）、sessionStorage 1 个 key。

## 2. 消融：`p=2726` 的 7 元数组

| 覆盖项 | 变化 | 结论 |
|---|---|---|
| `navigator.plugins = []` | `[1,2,2,5,0,32,0]` → `[1,2,2,0,0,32,0]` | slot3 = plugins.length |
| `navigator.mimeTypes = []` | → `[1,2,0,5,0,32,0]` | slot2 = mimeTypes.length |
| `hardwareConcurrency = 8` | → `[1,2,2,5,0,8,0]` | slot5 = hardwareConcurrency |
| maxTouchPoints / webdriver / UA / platform / Audio / RTC / canvas / cookie | 不变 | 与这 7 位无关 |

## 3. 环境对齐清单（`env_jsdom.js`）

| 项 | 原值 | 改为（浏览器实测） |
|---|---|---|
| hardwareConcurrency | 8 | 32 |
| screen | 1366×768 | 1920×1080（avail 1920×1032） |
| window inner/outer | 1278×663 / 1294×728 | 1920×927 / 1920×1032 |
| localStorage | 空 | 按快照重置（含 `warlockjssdkcross`） |
| `markNative` | Chrome 单行 `[native code]` | Firefox 格式 `function name() {\n    [native code]\n}` + webidl 包装函数自有 `toString` |
| `Symbol.toStringTag` | 无 | HTMLDocument / Screen / Navigator / Window |
| `performance.navigation` / `visibilityState` | 缺 | 已补 |
| `AudioContext` / `RTCPeerConnection` / `Notification` | 缺 | 已补 |
| iframe 内 navigator/screen | 未覆盖 | 已随 `contentWindow` 打补丁 |

## 4. CSS 枚举（`p=19458`）—— 已解决，方法论值得复述

SDK 返回的 CSS 名字数组是**两段拼接**：

| 段 | 浏览器 | jsdom（修复前） | 含义 |
|---|---|---|---|
| 首段（去重前缀） | 1152 | 1171 | `getOwnPropertyNames` 沿原型链 |
| 第二段（重复名） | 714 | 714 | `for…in` 可枚举集合（本来就一致） |
| 合计 | 1866 | 1885 | |

我们按「Firefox 原型上全部 1173 个名字」建原型，但 SDK 只遍历到 1152 个。
**修法**：浏览器侧把 SDK 实际枚举到的首段前缀落盘为 `browser_env.json.cssSdkProto`，
jsdom 侧按这份列表建原型（`env_jsdom.js` 优先读它）。结果 `p=19458` 差异消失、token 长度 577 = 577。

顺带否掉的两条路：改 `CSSStyleDeclaration.prototype` 的可枚举性、把 `element.style` /
`createHTMLDocument` 全部换成自建 stub —— 都不改变那 19 个名字，说明差异不在这些取用路径上。

## 5. 踩过的坑

| 坑 | 现象 | 对策 |
|---|---|---|
| 数字名挂到 CSS 原型 | for-in 撑到 1553 项，SDK 直接走早退分支（阶段数 194） | 数字索引只留在实例上 |
| prelude 早于 bootstrap | bootstrap 先消耗 `Math.random`，PRNG 序列整体错位 | prelude 放在 bootstrap 之后 |
| `document.URL` 硬编码 `about:blank` | `document.domain` 随之错误 | 传入真实 security.html URL |
| 浏览器侧用 `about:blank` 跑 SDK | 报 `The operation is insecure`（非安全上下文） | 退回本地 `http://127.0.0.1:8765/`（localhost 属安全上下文） |
| 用接口取 SDK name | `code 35 IP 异常` 时完全拿不到 | 改从浏览器网络里抓（`tools/find_sdk.py`） |
| raw token 直接塞 cookie | `code 37` | 必须 `encodeURIComponent`（页面写 cookie 也是这么做的） |

## 6. 已否定的假设

- **页面 JS 全局不是差异来源**：把 `security.html` 的 12 段 inline 脚本按原序在 jsdom 执行，
  `Security/SecurityJsHelper/BaseMixin/_passportConfig` 全部定义、token 正常生成（577），结果不变。
- **cookie 不是绑定条件**：seed 用一套 cookie 取，发送时换 cookie 也照样能过（对照组）。
- **传输层已排除**：同一 token 由 python 发送能过、由页面自己用过再发就 37 → 差异在 token 语义。
- **加载方式无关**：`<script>` 注入 vs `eval` 结果一致。

## 7. 纪律

- 环境 A/B 必须单次采样、间隔拉长；几十次连续请求会触发 `code 35`，此后所有结果作废。
- token 不可用等长/哈希做判据，只能看服务端 `code 0`。
- 两边必须用同一份插桩 SDK（包装会改变函数身份，本身是指纹）。

## 8. 纯协议可行性：目前判定「不可行」（2026-11-11 多轮实测）

### 排除项（全部实测，均为 38/37）

| 变量 | 做法 | 结果 |
|---|---|---|
| 环境同源 | 同一次浏览器会话采环境 → jsdom 生成 | 38 |
| UA/TLS 一致 | `impersonate=firefox147` + UA rv:147 | 38 |
| 浏览器全套 cookie | ab_guid/__a/__c/__l/__g/isOHPC + token | 38 |
| 延迟 | 常驻 node 服务，全链路 **841ms** | 38 |
| 页面状态 | dump 真实 `localStorage.passport-uuid` + 真实 `performance.timing` 注入 jsdom | 38 |
| 页面内发送 | 把 jsdom token 设进 `www.zhipin.com` 的同源 cookie，再用页面 `fetch` 发 | **37**（服务端认为无效） |
| 非 zhipin 页生成 | Camoufox 在 localhost 页生成 token → python 发 | 38 |
| `_security_check` 激活 | 先用 token 请求 `jobs?_security_check=1_<ms>` 再调接口 | 38 |

### 仍然成立的控制组

- 真实 `security.html`（带 `code=37&seed=&ts=&name=`）由浏览器打开 →
  页面自己完成挑战 → 导航到 `/web/geek/jobs?_security_check=1|2_<ts>`，**职位页正常加载**。
- 也就是说 token 机制本身没问题，**只有"该页面会话自己提交"时才算有效**。

### 结论

服务端对 token 的校验绑定在「挑战页会话 + 该会话提交」上，脱离了这套上下文的 token
（哪怕由同一个浏览器引擎、同一套指纹生成）都会被判 38/37。
纯协议要过，需要复刻的已经不是环境，而是**服务端与页面之间的会话登记过程**。

当前可用路径：浏览器内执行（Camoufox 打开挑战页 → 让页面自己通过 → 在页面上下文里取数据）。
