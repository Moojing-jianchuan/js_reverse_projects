# pceptor.js（得物 PC 端风控 SDK）离线逆向报告

> 目标文件：`artifacts/js/pceptor.js`（152 KB，JSDUN "eval-VM" 保护）
> 脱壳产物：`artifacts/unpacked/pceptor.000.eval.js`（515 KB，仍是扁平化状态机，但为真实执行源码）
> 运行器：`src/pceptor_loader.js` + `src/env.js`（Node `vm`，**无浏览器、无网络**）
> 采样：`node scripts/collect_samples.js` → `artifacts/samples/pceptor_samples.json`
> 结论范围：SDK 版本 `bcv=1.1.8.260514`，2026-11-20 抓取；所有"确认"都带具体函数位置与 I/O 样本

---

## 0. 一页结论

| 能力 | 状态 | 一句话 |
|---|---|---|
| **A. XHR 拦截** | **已确认** | `window.XMLHttpRequest` 被整体替换为包装器；`open/setRequestHeader/send` 全部转发给内部真实 XHR，并在转发前追加 `sk / shumeiid / ltk / sessionid / hsn / adi / skt` 七个头 |
| **B. header 生成** | **已确认（含依赖矩阵）** | 5 个头的取值来源全部落到具体函数：`sk←dw.getSk()`、`shumeiid←dw.getSM()`、`ltk←dw.getLtk()`（时间+UA+canvas 摘要，再用固定 key 加密）、`sessionid←localStorage.yuntuSession`、`adi←260194(...)`、`skt←常量 'hdr1'`；`hsn←48710(...)` 实测**只依赖 body 长度** |
| **C. body 加密 / 响应解密** | **部分确认** | 加密器是注入脚本 `preinforce2.js` 暴露的 `window.fun.Fun110(payload, method, '', true, {SK,ShumeiId,…}) → {a,c,d}`（`c→sks`、`d→body`）；**本地无法进入该分支**：需 `/interceptor` 下发的 URL 白名单 + 会话密钥；缺配置时 SDK 走 `skt:'hdr1'` 明文回退。带 keyMap 的 5 参调用在本地**不收敛**（见 §5.4 的 CPU profile 证据） |

**三层已确认度**：S1（本地能生成）→ A/B 达成；C 只到"结构确认 + 契约确认"，未达成可运行的加密输出。
**外部依赖**：`sk`（会话密钥）、`shumeiid`（dwsm）、以及 `/interceptor` 下发的白名单配置。

---

## 1. 运行环境与必需的补丁

`src/env.js` 提供一个 `window===globalThis` 的 vm 沙箱：`document` / `navigator` / `localStorage` / `XMLHttpRequest`（自实现的"原生 XHR"）/ `fetch` / `crypto` / 定时器。**SDK 自己的两个外链脚本也被离线顶替**：

```text
pceptor.js  ──注入──> https://davstatic.dewu.com/preinforce2.js   → artifacts/unpacked/preinforce2.000.eval.js
            ──注入──> https://davstatic.dewu.com/pyuntu.js        → artifacts/unpacked/pyuntu.000.eval.js
```
（注入点：`pceptor.000.eval.js @40917` 建 `new Promise`，`@41070` 设 `script.src=227990`，`onload` 判 `window.fun.Fun110`；URL 常量在 `@10447 / @179269`。`src/env.js` 的 `attachNode()` 执行 `opts.resolveScript(url)` 并把 `onload` 回调补上。）

按"先确认入口、按读值补环境、截值验证"顺序，实际触发过的补丁（每一条都是被具体报错逼出来的）：

| # | 补丁 | 触发它的报错 | 位置 |
|---|---|---|---|
| 1 | `Object.defineProperty` 对 `key===undefined` 直接返回 | `Cannot redefine property: undefined` | 包装器构造 `@381663`：属性代理循环会以 `undefined` 为键调用 128k 次（真实浏览器里只是给实例加了个名为 `"undefined"` 的垃圾属性，浏览器容忍，Node 第二次就抛） |
| 2 | `navigator.plugins` 给出 5 个带 `name/description/filename` 的条目 | `Cannot read properties of undefined (reading 'name')` | `pceptor.000.eval.js @411376`（`214890.push([118393[i].name, …])`） |
| 3 | `document.all` = `%GetUndetectable()`（`v8.setFlagsFromString('--allow-natives-syntax')` 后取真身） | `Cannot read properties of undefined (reading '__proto__')` | `@330886`（`document.all.__proto__.toString()`、`tdfa: typeof document.all`） |
| 4 | `document.createEvent()` / `Event` / `CustomEvent` | `document.createEvent is not a function` | 响应回调里构造事件 |
| 5 | `Headers` / `Request` / `Response` 最小实现 | `Request is not defined` | `dw.init()` → `/webSk` 链路 |
| 6 | `<script>` 元素支持 `src` setter + `head.appendChild` 真执行 + `onload` | `window.fun` 缺失 → `Fun110` 不可用 | `@40917` 起的加载器 |

补完后的自检（`node src/pceptor_loader.js`）：

```text
[self-check] 18/18
  PASS SDK 加载无异常 / base64js / _yundunxhr / XMLHttpRequest 已被包装
  PASS window.fun 已注入且含 Fun110 (Fun110.length=5)
  PASS dw 实例可用 (getSk/getSM/getLtk/Fun110)
  PASS 请求已到达底层 XHR / URL 未被改写
  PASS 追加头齐全(sk,shumeiid,ltk,sessionid,hsn,adi,skt)
  PASS hsn 为 32 位 hex / sk 头与注入值一致 / adi 为 base64 字符集
  PASS body 结构自检 / 响应通道可回调
```

---

## 2. 能力 A：XHR / fetch 拦截

### 2.1 机制（代码定位）

`pceptor.000.eval.js @381663`：

```js
window[138576] = window[138576] || XMLHttpRequest,   // ← 先把原生构造器存到 window._yundunxhr
XMLHttpRequest = function () {                       // ← 再用包装器顶替全局 XMLHttpRequest
    …
    249158 = new window[138576].prototype.constructor();   // 内部真实 XHR
    249158.getProxy = function () { return 56164 };         // 反向取回包装器
    for (70620 in 249158) 194464[125314++] = 70620;          // 枚举真实 XHR 的可枚举属性
    …  // 函数属性 → this[name] = 绑定包装；数据属性 → defineProperty(this, name, {get,set})
    this.xhr = 249158;
    …
    XMLHttpRequest.prototype = window[138576].prototype;     // 原型仍指向原生
}
```

结论：
- `_yundunxhr === 原生 XMLHttpRequest`（自检里的 `sandbox._yundunxhr.name === 'XMLHttpRequest'`）；
- 业务侧 new 出来的对象自带 **37 个自有属性**：`readyState/status/responseText/response/…` 全部是转发到 `this.xhr` 的访问器，`open/setRequestHeader/send/abort/getAllResponseHeaders/…` 是绑定包装函数；另有 `xhr` 指向真实实例；
- 包装器 `toString()` 返回 `function XMLHttpRequest() {\n    [native code]\n}`（主会话在真页面已验证），即**伪装成原生**。

### 2.2 报文改写（实测）

`buildRequest()` 走 `new XMLHttpRequest() → open → setRequestHeader → send`，底层真实 XHR 收到的就是"最终报文"。

**样本 A1**（`node scripts/collect_samples.js`，逐字来自 `pceptor_samples.json`）

```jsonc
// 输入
{ "url": "https://app.dewu.com/api/v1/h5/commodity-pick-interfaces/pc/pick-rule-result/feeds/info",
  "method": "POST", "bodyText": "{\"a\":1}" }
// 底层 XHR 收到
{ "method": "POST",
  "url": "https://app.dewu.com/api/v1/h5/commodity-pick-interfaces/pc/pick-rule-result/feeds/info",
  "headers": {
    "content-type": "application/json",
    "sk":         "YOUR_SK_HERE",
    "shumeiid":   "YOUR_SHUMEIID_HERE",
    "ltk":        "",
    "sessionid":  "<localStorage.yuntuSession>",
    "hsn":        "6d0bb00954ceb7fbee436bb55a8397a9",
    "adi":        "NzMxOTQ2ODg0N2Q3YjFhZW",
    "skt":        "hdr1"
  },
  "body": "{\"a\":1}" }
```

**样本 A2**（body 为空）：同上，`hsn="90c805bcb9fa376aacfb38d598ec7bb6"`。
**样本 A3**（URL 换成 `/api/v1/h5/OTHER/path`，body 不变）：`hsn` 与 A1 **完全相同**，`adi/skt` 不变 → **URL 不参与 hsn/adi**。

要点：
- 追加头发生在 `send` 之前，顺序为 `sk → shumeiid → ltk → sessionid → hsn → adi → skt`（顺序来自 `recorder.events`）；
- SDK 自己也会发一条 `POST https://dav.dewu.com/interceptor`，body `{"url":"https://www.dewu.com/"}`，带 `bcn/dsn/skt` 等同一套头（`dsn: p=h&bcn=dewu&bcv=1.1.8.260514&sk=`）；
- **`fetch` 通道同样被接管**（`dw.init()` 的 `/webSk` 走 fetch），`preinforce2` 里还有 `document .compatMode` 分支、`zone` 相关路径不在本 SDK 内。

---

## 3. 能力 B：header 生成

装配函数在 `@184147` 附近：

```js
(n.headers.sk || n.headers.Sk || n.headers.SK || (n.headers.sk = 55132()),
 n.headers.shumeiid || … || (n.headers.shumeiid = 220779()),
 n.headers.ltk = Function('return this')().dw ? Function('return this')().dw.getLtk() : '',
 …
 n.headers.sessionid = localStorage.getItem('yuntuSession'))
```

### 3.1 逐头拆解

| header | 生成点 | 输入依赖 | 实测样本 |
|---|---|---|---|
| `sk` | `55132()`（`@210850`）,内部：`157275 \|\| 174861 \|\| cookie('sk') \|\| localStorage['sk'] \|\| 88125 \|\| ''`，再 `.split('\u200b')[K]`；`window.dw` 存在时改走 `dw.getSk()`（`getSk` 方法体在 `dw` 类内，类起点 `@318178`） | **纯会话值**：cookie/localStorage 的 `sk`（启动期还做过一次 `.split('\u200b')[0]`，见 `@322459` 附近） | `9UDgF8S3…`（92 字符，即注入值原样） |
| `shumeiid` | `220779()` / `dw.getSM()` = `cookie('dwsm') \|\| localStorage['dwsm'] \|\| 142448()` | `dwsm`；缺省时 `142448()` 现生成 | `20261120115309…`（首次运行会**自己写** `dwsm` 到 cookie+localStorage，见 `state().cookieWrites`） |
| `ltk` | `dw.getLtk()`（类内，`@336172`）<br>`184251( 124862.substr(a,b) + floor(Date.now()/K) + UA_MD5.substr(c,d) + canvasMD5 + …, 'AUIYDFT3768447U29DSGUITHHDJF' )` | **时间**（`Date.now()`）、**UA**（`MD5(navigator.userAgent).toUpperCase()`）、**canvas 摘要**（`window.*.imgData` 的 `MD5(...).toUpperCase().substr(...)`，缺则 `'00000000'`）、固定 key `AUIYDFT3768447U29DSGUITHHDJF` | 本地 `""`（`dw.getLtk()` 返回空串）；可 `load({ltk:'X'})` 覆写后 header 立即变 `"X"` |
| `sessionid` | `localStorage.getItem('yuntuSession')` | 本地首次运行自动生成形如 `ACgxeD1f-Q9Ys-3zfL-krXv-LrwhUQSxmj25PAfV`（40 字符，5 段，`-` 分隔） | `ACgxeD1f-…`，与 `state().storage.yuntuSession` 逐字一致 |
| `hsn` | `20331()`（`@409100`）→ `hsn = await 48710(bodyOrQuery, headers, method, url)`，赋值在 `@409520` / 调用在 `@409774` | **实测只依赖 body 长度**（见下表） | 见 §3.2 |
| `adi` | `178605()`（`@214885`）→ `headers.adi = 260194(173458, 252207, 40143, 44919, 191044, 173748)`；`260194` 定义在 `@351891`：<br>`81656 = MD5(location.pathname + spuId).substring(0,16) + (fromUserId‖sessionStorage.fu) + '\|' + 38578() + '\|' + 六个计数器…`，`adi = 184251(81656, sessionStorage['ak'] \|\| 常量key)` | `location.pathname`、`spuId`、`fromUserId`、`sessionStorage['ak']`、6 个内部计数 | `NzMxOTQ2ODg0N2Q3YjFhZW`（22 字符 b64 → 明文 `7319468847d7b1ae`） |
| `skt` | `@350772`：`headers.skt='hdr1'` | 常量 | `hdr1` |

### 3.2 `hsn` 的依赖矩阵（这是本轮唯一被完全钉死的一项）

同一进程内连续 5 次请求，只改 body：

| body | 长度 | hsn |
|---|---|---|
| `""` | 0 | `90c805bcb9fa376aacfb38d598ec7bb6` |
| `{"a":1}` | 7 | `6d0bb00954ceb7fbee436bb55a8397a9` |
| `{"b":1}` | 7 | `6d0bb00954ceb7fbee436bb55a8397a9` ← 内容换、长度同 → **不变** |
| `{"a":12}` | 8 | `22577911e88af39f79409e6de8eed4d9` |
| `{"a":"xx"}` | 10 | `213e635dac590095b5681a944a5713a2` |
| 同 body 换 URL / 加查询串 / 加自定义 header | 7 | 仍是 `6d0bb0…` → **URL、query、其它 header 都不参与** |
| 跨进程重跑（不同 `yuntuSession`/`dwsm`） | 7 | 仍是 `6d0bb0…` → **不含会话随机** |

**已排除**：`md5(body)`（`bb6cb5c6…`）、`md5(md5(body))`、`md5(base64(body))`、`md5(JSON.stringify(keys))`、`md5(len)`、`md5('0'.repeat(len))`、`md5(uri 编码)` 等 20 余种简单构造均不命中（`scripts/check18.js`、`check20.js`）。
**未确认**：`48710()` 的具体拼接式（它内部仍是 `MD5(96483.join(''))` 形态，`@408700` 附近；用 `Array.prototype.join` 拦截没有抓到该次调用，说明原像不是 `join` 拼出来的）。

> 因为 `hsn` 只是 body **长度**的函数，它不承担"内容完整性校验"的职责；真正的完整性在 `sign`（`md5(键名排序拼接 + SALT)`）与（加密模式下的）`hex32 = md5(明文)`。

### 3.3 `adi` 本地短值的原因（重要，别误判成"随机值"）

本地 `adi` 解码后是 16 个 hex 字符 `7319468847d7b1ae`，而线上抓包 `adi` 是 132 字符的 mojibake-base64。差别来自 `260194` 末段：

```js
247303 = 184251(81656, sessionStorage['ak'] || 104679)
```

- 线上：`sessionStorage['ak']` 存在 → 走真正的加密 + 长 payload；
- 本地：`ak` 缺失、`spuId/fromUserId` 为空 → 拼串退化成 16 字符，`184251` 在该 key 下输出可逆的短值。
⇒ **`adi` 不是固定值，也不是随机值**：它是"路径/商品/用户/计数器"四类输入在 `ak` 密钥下的密文；本地缺 `ak`，所以稳定输出同一个短值。

---

## 4. 能力 C：body 加密 / 响应解密

### 4.1 加密契约（已由代码 + 抓包双向确认）

调用点在 `@210045`（POST）与 `@209100`（GET），形态一致：

```js
const {Fun110} = await 108099;                     // 108099 = <script> 加载的 preinforce2 模块（window.fun）
const {c, d} = Fun110(requestBody, 'post', '', true, {
    SK: sk(), Sk: sk(), sk: sk(),
    ShumeiId: sm(), shumeiId: sm(), shumeiid: sm()
});
request.headers.sks = c;      // c → sks 头
request.body        = d;      // d → 新的 body（JSON 字符串）
// GET 分支：request.url = path + '?data=' + encodeURIComponent(JSON.parse(d).data)
```

- `Fun110` 是 `window.fun` 的方法（`Fun110.length === 5`，`fun` 由 `preinforce2.js` 提供，实例原型上有 `Fun110/Fun99`）；
- 返回值字段：`{a, b, c, d, e}`。其中 `c` → `sks`，`d` → body，`a/e` 是两段长 base64（`b` 是随机段），`c` 形如 `"5294,hdw4"`（成本/算法标识）；
- **响应侧**用 `Fun99`（`@214442`：`const {Fun99} = await 108099; … = Fun99(response, '', key, '')`），不是 `Fun110`。

### 4.2 分支条件（本地进不去的原因）

```js
if (63166(req.method))      …        // 63166 = m => m && m.toUpperCase()==='POST'
if (259290(req.url))        …        // 259290 = url => whitelist.includes(MD5(new URL(url).pathname).toUpperCase())
```

`259290`（定义 `@47157`）：
```js
h = url → 取 pathname → try { MD5(new URL(h).pathname).toString().toUpperCase() } catch { MD5(h).toUpperCase() }
return 231943.includes(h)            // 231943 = 运行时数组
```
- `231943` 这个白名单**在源码里没有字面量**（`scripts/check15.js`：对 `/feeds/info`、`/category-pick/mapping` 的 `MD5(pathname).toUpperCase()` 在源码中 0 命中；源码里也没有 32 位大写 hex 字面量）；
- 它只能来自 `/interceptor` 的响应（`@208700` 一带的配置合并逻辑，`54761.headers.sks/…`），也就是说：**"这条 URL 要不要加密"由服务端在会话建立时下发**。

⇒ 本地缺该配置时，SDK 走**明文回退**：body 原样、`sks` 为空、额外打 `skt: 'hdr1'`。这就是 `encryptBody()` 在本地返回 `mode: "plaintext-fallback(hdr1)"` 的原因，不是"算法没跑通"。

### 4.3 已知的封装格式（抓包既有结论，本地复算通过）

```text
body = {"data": "<hex32><base64>"}
hex32   = md5(明文 JSON 字符串)                     ← 本地复算：md5(plain)=c536d0639fb2f24e2526ed558c463cf4，与抓包 hex 逐字相同
base64  = b64( 明文 XOR keystream )                 ← 等长，位置对齐
keystream                                           ← 同一会话内恒定，跨会话不同（= 会话级流密钥）
```

本地对拍（`pceptor_samples.json.C_encrypt.capturedSample`）：

```text
plainLen = 124, cipherLen = 124
hex      = c536d0639fb2f24e2526ed558c463cf4  == md5(plain)  ✔
keystream(前 32B) = 91720f5562388428ae908038bbe70a98
keystreamMatchesKnown = true   （与 scripts/ 里既有样本的 keystream 完全一致）
```

`scripts/envelope_probe.js` 里还有一处**必须注意的编码坑**：base64 解码后要 `buf.toString('utf8')` 再逐字符 `charCodeAt & 0xff` 才是真实密文字节（`realBytesFromB64()`），否则长度与内容都会被 UTF-8 破坏。

### 4.4 `Fun110` 的三种调用形态（实测输出）

同一条明文 `PLAIN`（124 B）：

| 调用 | 返回 | 说明 |
|---|---|---|
| `fun.Fun110(PLAIN,'post')` / `(…,'',true)` / `(…,'get','',true)` | `{a,b,c,d,e}`，`d === PLAIN`（原样）、`c = "5294,hdw4"` | **无 keyMap → 不加密**，`d` 是穿透后的原文；`a/e` 仍是两段长密文（约 140 字符，每次调用都变），`b` 随机（16/24 字符） |
| `fun.Fun110(PLAIN,'post','',true,{})` | **不返回**（>20 s 仍未结束） | 只要第 5 参是对象就进入密钥分支 |
| 同上，`{SK: <真 sk>}` | 同上，不收敛 | 与 key 内容无关 |

### 4.5 为什么 5 参调用不收敛（证据，不是"算法没跑通"）

用 `node --cpu-prof` 采样 2.5 s（`scripts/prof_fun110.js` + `scripts/prof_read.js`）：

```text
1009 samples  _doProcessBlock  preinforce2:396:36      ← CryptoJS MD5 的压缩函数
 164 samples  _process         preinforce2:209:224
 144 samples  ﱞ126597          preinforce2:495:384
 133 samples  ﱞ155504          preinforce2:500:228
调用链：_doProcessBlock <- _process <- _doFinalize <- finalize <- (anon) <- value@302
```

即：**它在一个 MD5 循环里反复哈希**（与 `c = "5294,hdw4"` 这个"成本/算法"字段呼应，形如工作量证明/密钥派生）。循环终止条件依赖某个我们拿不到的量（服务端下发的难度/盐），所以在本地永远凑不齐。
另外 `preinforce2` 里确实带了一份 **inflate/deflate 解码器**（`@280900` 附近：`1<<n`、`(1<<n)-1`、`257`），说明 `sk`/配置可能是压缩过的载荷——这条只作线索，未验证。

---

## 5. 要产出"一次真实可用请求"，还缺什么

按重要性排序，全部是**外部输入**，不是代码：

1. **`sk`（会话密钥，必需）**
   - 页面来源：`cookie('sk')` / `localStorage['sk']`，本地会再 `.split('\u200b')[0]`；
   - 真身由 `POST https://dav.dewu.com/webSk` 签发（见 `docs/sk_bootstrap_report.md`），响应里 `k` 字段 base64 解码即得；
   - 注入方式：`pceptor.load({ sk })`（loader 会把它挂到 `window.dw.getSk`，这是 `sk` 头唯一可靠来源）。
2. **`shumeiid`（`dwsm`，强建议）**
   - `cookie('dwsm') || localStorage['dwsm'] || 142448()`；不给也能跑（SDK 自造），但那样 `shumeiid` 与设备指纹不匹配。
3. **`/interceptor` 下发的会话配置（决定"要不要加密"）**
   - 内含 `MD5(pathname).toUpperCase()` 白名单（`231943`）等；没有它 → 永远走 `skt:'hdr1'` 明文回退，也就永远不会产生 `{"data":…}` 与 `sks`。
4. **`sessionStorage['ak']`（`adi` 的加密 key）**
   - 有了它 `adi` 才是线上那种 132 字符长值；没有则稳定输出 16 字符短值。
5. **设备/环境类输入**（影响 `ltk` 与指纹载荷，不影响 A/B 骨架）
   - `navigator.userAgent`、canvas 摘要（`imgData`）、`location.pathname`、`spuId / fromUserId`。
6. **时间**：`ltk` 含 `floor(Date.now()/K)`，跨分钟就会变——**不要把它当固定值**。

---

## 6. 未确认 / 已知缺口

| 项 | 状态 | 说明 |
|---|---|---|
| `48710()`（hsn 原像） | 未确认 | 只确认"仅依赖 body 长度"，拼接式没抓出来（`join` 拦截未命中） |
| `dw.init(config)` 的 config 结构 | 未确认 | `init` 已能在本地跑通并发出 `/webSk`，但 payload 构造器 `192447(JSON.stringify(95950),…)` 里的 `95950` 在本地是空对象，导致请求体只剩 `{"sign": …}` |
| `getSk()` 的 `.split('\u200b')[K]` 索引 | 未确认 | 本地任何 cookie 形态下都返回 `undefined`（`check26`），实际页面 `sk` 头非空 ⇒ 该分支在真机上下文里与本地不同；loader 因此改为直接接管 `dw.getSk` |
| 响应解密是否会改写 `responseText` | 未确认（本地"未改写"） | 灌入密文后业务侧读到的仍是原文（`changed=false`），与"响应解密同样被配置门控"一致 |
| `pyuntu.js` 执行 | 有报错 | 本地执行抛 `ﱞ141254[ﱞ35610] is not a function`（不阻塞 A/B；captcha 链路另有子会话处理） |
| `preinforce2` 的 deflate 用途 | 线索 | 见 §4.5 |

---

## 7. 待主会话取证（浏览器侧，本会话按约束不使用浏览器 MCP）

1. **`/interceptor` 的真实响应**（596 B）：解密后是否就是"URL 白名单 + 配置"；白名单字段名与 `MD5(pathname).toUpperCase()` 的口径是否一致。
2. **`/webSk` 的真实响应**（1440 B）：`k/sm/adk` 三个字段的存在与长度（`docs/sk_bootstrap_report.md` 已按静态分析给出字段名）。
3. **`getSk()` 在真页面的返回值**：`window.dw.getSk()` 与 `document.cookie.sk.split('\u200b')` 的关系，用来钉死 `\u200b` 的语义。
4. **`fun.Fun110` 在真页面的耗时**：确认 5 参分支是"毫秒级"还是"几十毫秒级"。若真页面也是秒级，则 §4.5 的循环不是环境问题而是设计如此（工作量证明）。
5. **响应侧 `Fun99(response, '', key, '')` 的第三个参数**：`@214442` 处的 `67652` 在真页面的取值（本地为空）。

---

## 8. 复现命令

```powershell
cd D:\ds_work\js_reverse_projects\dewu_reverse

# 1) 脱壳（若 artifacts/unpacked 缺失）
node scripts/unpack.js pceptor.js

# 2) 自检（18 项，纯离线）
$env:SK='<cookie sk>'; $env:DWSM='<dwsm>'; node src/pceptor_loader.js

# 3) 生成对拍样本
node scripts/collect_samples.js        # → artifacts/samples/pceptor_samples.json

# 4) 定位辅助
node scripts/make_readable.js          # 生成 *.readable.js（解开 \uXXXX，便于搜端点/字段）
node scripts/ctx3.js pceptor.readable.js "webSk" 400 900
node scripts/vm_line2off.js pceptor.000.eval.js <line> <col>   # 栈里的 line:col → 字符偏移
```

---

## 9. 收口（五項）

- **到达层级**：A、B = S1（本地可生成、结构化自检 18/18 通过）；C = 结构/契约确认，**未达 S1 的可运行实现**（缺会话配置与 `sk` 派生路径）。
- **当前路线与外部依赖**：R3（vm 补环境）+ 离线顶替 `<script>`；外部依赖 = `sk`、`dwsm`、`/interceptor` 配置、`sessionStorage['ak']`。
- **适用范围**：`bcv=1.1.8.260514`，`app.dewu.com/api/v1/h5/...` 与 `dav.dewu.com/{interceptor,webSk,cost,wr,nr}`。
- **结论强度**：A/B 为"证明"（代码位置 + 多组 I/O 对拍 + 依赖矩阵）；C 的封装格式为"证明"，加密器内部为"观察 + 排除"，`sk` 派生路径为"未确认"。
- **失效条件**：SDK 版本变更；`hsn`/`adi` 生成函数改动；`\u200b` 语义变化；`preinforce2.js` 算法升级。
