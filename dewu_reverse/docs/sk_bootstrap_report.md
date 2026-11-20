# `sk` 签发链路（`POST https://dav.dewu.com/webSk`）静态分析

> 目的：回答"谁调 `/webSk`、请求体明文长什么样、响应怎么落成 cookie/localStorage、有效期字段是什么"。
> **全部为静态定位 + 本地沙箱"喂入-截出"，没有向线上发任何请求。**
> 依据文件：`artifacts/unpacked/pceptor.000.eval.js`（下文 `@N` 均为该文件的**字符偏移**）
> 辅助：`artifacts/unpacked/pceptor.readable.js`（把 `\uXXXX` 解开，便于搜端点）
> 运行器：`src/pceptor_loader.js`（`node src/pceptor_loader.js` 自检 18/18）

---

## 1. 结论速览

```text
/interceptor 响应 ──(msg: h586g/h587i/h592/isRe)──> window.dw.init()
                                                       │
                        ┌──────────────────────────────┘
                        ▼
   payload = 192447(JSON.stringify(<指纹对象>), bcv, sk, sm, ua)      @318367
   payload.sign = 105711(payload)                                     @318474   (md5(键名排序拼接+SALT))
   fetch('https://dav.dewu.com/webSk', {POST, credentials:'include',
        headers:{'Content-Type','application/json',
                 dsn:'p=h&d=ar&bcn=dewu&bcv=<bcv>&sm=<sm>&sk=<sk>&il=n&kt=r'},
        body: JSON.stringify(payload)})                               @318497
                        │
                        ▼  响应是 **十六进制串**（1440 B），不是 JSON
   明文 = AES-CBC-Decrypt( Hex→Bytes, key=K(sm,ua), iv=K.substr(k1,k2), Pkcs7 )    @1792 (120167) / 调用 @319519
                        │
                        ▼  respJSON = { k, sm, adk, ... }
   sk  = Base64.decode(resp.k).toString(Utf8)                         @322367
   localStorage['sk'] = sk ;  document.cookie 写 'sk' (107276)
   resp.sm  → localStorage['dwsm'] = sm ; cookie 'dwsm'
   resp.adk → sessionStorage['ak']        ← adi 的加密 key 就是它
   88125 = sk（内存态），随后 setTimeout 里探测 indexedDB
```

**有效期**：`/webSk` 的响应对象里**没有看到显式过期字段**；SDK 侧的过期判定来自：
- `sk` 只是 cookie/localStorage 的字符串，没有时间戳内嵌；
- 强制刷新由 `/interceptor` 响应驱动（`h586g/h587i/h592/isRe` 任一为 `'yes'` 会重新 `init()`，@168019）。
⇒ **"有效期"= 服务端说了算 + SDK 收到新配置就重签**，本地无法从 `sk` 自身的字节推出 TTL（未确认，见 §6）。

---

## 2. 谁调用 `/webSk`

| 层 | 位置 | 代码 |
|---|---|---|
| URL 常量 | `@10447`、`@179269` | `89690='https://dav.dewu.com/webSk'`（同批还有 `/interceptor`=115472、`/wr`=158840、`/nr`=62343、`preinforce2.js`=227990） |
| 载体类 | `@318178` | `63908 = class 229555 { init(cfg){…} getSk() getSM() getLtk() bindUser(u) Fun110(a,b) Fun99(a,b,c) }` |
| 对外实例 | `@163092` / `@264423` | `77251 = new 63908()` → `window.dw = 77251` |
| 触发入口 | 类内 | `bindUser(u){ u && this.init(u) }`；页面也可以直接 `window.dw.init(cfg)` |
| 事件驱动 | `@168019` | 某个 XHR 的 `onreadystatechange`：`JSON.parse(resp.responseText).msg` → `JSON.parse(...)` 得到 `{h586g,h587i,h592,isRe}`；若 `107276`/`isRe` 分支命中则 `window.dw.init()` |
| 实际发请求 | `@318497` | `fetch(89690, {method:'POST', credentials:'include', headers:{…}, body: JSON.stringify(202208)})` |

**实测（本地沙箱，喂入-截出）**：`dw.init({})` 一次就会让底层 `fetch` 收到 1 条 `POST https://dav.dewu.com/webSk`（`recorder.fetchCalls`）。三次 `init()` → 三条。

> 注意：`/webSk` 走的是 **fetch**，不是 XHR。只 hook `XMLHttpRequest.prototype` 会完全看不到它（这正是早期漏掉它的原因）。

---

## 3. 请求体是怎么构造的

```js
// @318367
202208 = 192447(JSON.stringify(95950), 184622 /*bcv*/, 174861 /*sk*/, 9214 /*sm*/, 23670 /*UA*/)
// @318474
202208.sign = 105711(202208)
```

- `95950`：指纹/环境载荷对象（插件列表、webgl、canvas、屏幕、时间等；见 `@147849`-`@149xxx` 一带的 `webGLbase/webGL2base/baseCost/ImageCost` 采样）。
- `192447(str, bcv, sk, sm, ua)`：载荷打包器（定义 `@3451`）。
- `105711(payload)`：`sign` 生成器（定义 `@172397`），口径与站内业务请求同源：**键名排序拼接 `key+value` + 常量盐 `048a9c4943398714b356a696503d2d36` → md5**（该式已在本仓库 `src/dewu_sign.js` 对三条真实样本三次对拍通过）。

**请求头 `dsn` 的完整拼装（逐字）**：

```text
dsn: 'p=h&d=ar&bcn=' + 'dewu' + '&bcv=' + bcv + '&sm=' + sm + '&sk=' + sk + '&il=n&kt=r'
```

对比：业务请求/`interceptor` 用的 `dsn` 是 `p=h&bcn=dewu&bcv=<bcv>&sk=<sk>`（**没有** `d=ar`、`sm`、`il`、`kt`），另一处 `/cost` 用 `p=h&bcn=…&bcv=…&ek=1`。三个端点三套 `dsn`，不能混用。

**本地实测的请求体（沙箱内，未联网）**：

```json
POST https://dav.dewu.com/webSk
headers: Content-Type: application/json
         dsn: p=h&d=ar&bcn=dewu&bcv=…&sm=…&sk=…&il=n&kt=r
body:    {"sign":"70bc8f4b72a86921468bf8e8441dce51"}
```

> 只有 `sign` 是因为 `95950`（指纹载荷）在沙箱里是空对象——`192447` 打包出来的对象没有可枚举自有属性，`JSON.stringify` 只剩 `sign`。
> 这同时说明：**`sign` 覆盖的是打包后的载荷对象**；真机上该 body 会带上完整指纹字段。
> （`70bc8f4b…` ≠ `md5(SALT)=fe26befc…`，所以载荷非空，只是不可枚举——别用"body 只有 sign"反推算法。）

---

## 4. 响应怎么解、怎么落到 cookie / localStorage

### 4.1 响应解密（AES-CBC，Key 由 `sm`+`UA` 派生）

`@1792`（函数 `120167`）：

```js
var {normalRKey1, normalRKey2, newKey1, newKey2, newKey3,
     normalNewKey1, normalNewKey2, normalNewKey3, d, deNewKey1} = 18233(sm, ua, …);

bytes  = CryptoJS.enc.Hex.parse(respText);            // ← 响应是 hex 串
b64    = CryptoJS.enc.Base64.stringify(bytes);
plain  = CryptoJS.AES.decrypt(b64,
            CryptoJS.enc.Utf8.parse(deNewKey1),
            { iv: CryptoJS.enc.Utf8.parse(deNewKey1.substr(K1, K2)),
              mode: CryptoJS.mode.CBC, padding: CryptoJS.pad.Pkcs7 }).toString(Utf8);
```

调用点在 `@319519`：

```js
216664 = JSON.parse(120167(respText, bcv, sk, sm, ua))
```

⇒ **要点**：`/webSk` 的响应体不是 JSON，是一段 **hex 文本**；必须先用 `Hex.parse` 转字节，再用 **会话相关的 key（`18233(sm, ua, …)` 派生的 `deNewKey1`，IV = 该 key 的 `substr(k1,k2)`）** 做 AES-CBC/Pkcs7 解密，才是 JSON。
**这就是为什么直接 base64/JSON 解析 `/webSk` 响应会失败。**

### 4.2 落盘（`@322367`，逐字）

```js
174861 = CryptoJS.enc.Base64.parse((216664 || {}).k).toString(CryptoJS.enc.Utf8);
localStorage.setItem('sk', 174861);
107276('sk', 174861);                                  // 写 document.cookie
216664.sm  && (9214 = 216664.sm, localStorage.setItem('dwsm', 216664.sm), 107276('dwsm', 216664.sm));
216664.adk && sessionStorage.setItem('ak', 216664.adk);
88125 = 174861;                                        // 内存态 sk（getSk() 的 88125 分支）
setTimeout(function(){ … indexedDB … });
```

| 响应字段 | 落地位置 | 用途 |
|---|---|---|
| **`k`** | `localStorage['sk']` + cookie `sk`（base64 解码后的 UTF-8 明文） | `sk` 头、`Fun110` 的 `keyMap.SK`、`/wr` 上报 |
| **`sm`** | `localStorage['dwsm']` + cookie `dwsm` | `shumeiid` 头（`dw.getSM()`） |
| **`adk`** | `sessionStorage['ak']` | **`adi` 的加密 key**（`260194` 里 `184251(拼串, sessionStorage['ak'] || 常量)`） |

> 闭环：`/webSk` 一次就把 `sk`、`dwsm`、`ak` 三样都签下来；`adi` 想要线上那种 132 字符长值，就必须先有 `adk`。

### 4.3 签到 sk 之后的第二次上报（`/wr`）

`@320124` → `161970(sk, {...}, 'dewu', bcv, 'https://dav.dewu.com/wr')`，而 `161970`（`@345322`）：

```js
28898 = { sk, shumeiid: cookie('dwsm')||localStorage['dwsm']||142448(),
          bcn, bcv, bdg: 0, bty: 'rirm', ...extra };
125395 = Utf8.parse(JSON.stringify(28898));
194545 = AES.encrypt(125395, Utf8.parse(49452.substr(5,16)),
                     { iv: Utf8.parse(49452.substr(10,16)), mode: CBC, padding: Pkcs7 });
1551   = 194545.ciphertext.toString().toUpperCase();     // 大写 hex
98048('https://dav.dewu.com/wr', { data: 1551 }, bcn, bcv);   // POST {data}
```

⇒ `/wr` 是"会话态心跳/绑定"上报：**AES-CBC(key=`49452.substr(5,16)`, iv=`49452.substr(10,16)`)，输出大写 hex，包成 `{data:…}`**。
`/cost`（`https://dav.dewu.com/cost`，在 `preinforce2` 里，`readable @54318` 一带）是耗时上报，走 `dsn: p=h&bcn=…&bcv=…&ek=1` 那套。

---

## 5. 拿到 `sk` 之后怎么本地自举（步骤，不要求此刻跑通）

> 前提：当前出口 IP/会话已被风控降级（真页面 `dewuCap` 也回 `{"code":0,"msg":"请求已过期"}`），所以**不要在线验证**；下面是恢复到干净环境后可直接执行的自举序列。

1. **准备一个干净的会话上下文**（新 IP / 新浏览器 profile），打开 `https://www.dewu.com/`，等 `pceptor.js` → `preinforce2.js` → `pyuntu.js` 三件套加载完。
2. **抓三条 SDK 自有请求**（顺序通常是 `/interceptor` → `/webSk` → `/cost`，后续 `/wr`）：
   - `/interceptor`：POST，响应 596 B，JSON（`msg` 里带 `h586g/h587i/h592/isRe`）；
   - `/webSk`：POST，响应 1440 B，**hex 文本**；
   - `/wr`：POST，请求体 `{data: <大写hex>}`。
3. **从 `/webSk` 响应解出 `sk`**：
   - 首选：让 SDK 自己解——把响应原文塞回沙箱里的 `fetch` 返回值，SDK 会走 `120167()` 解密并自动写 `localStorage['sk']` / cookie `sk`（`src/pceptor_loader.js` 已支持 `fetchImpl` 注入，见下）；
   - 兜底：实现 `18233(sm, ua, …)` 的 key 派生（源码 `@4851 / @20476 / @341235` 三处可交叉验证）+ AES-CBC/Pkcs7，IV = `key.substr(k1,k2)`。
4. **校验自举结果**（不进网络）：
   ```powershell
   $env:SK='<解出的 sk>'; $env:DWSM='<响应里的 sm>'; node src/pceptor_loader.js
   # 期望 18/18，且 "sk 头与注入值一致" PASS、"追加头齐全" PASS
   ```
5. **只在确认 `sk` 新鲜时**再谈在线：把 `sk` 注入 loader → `getHeadersFor()` 产出完整 headers → 与真实请求逐字节对拍（`hsn` 应随 body 长度变化、`adi` 应变成 132 字符长值、`ltk` 应随分钟变化）。
6. **判定 `sk` 是否新鲜**：`sk` 自身不带时间戳，只能靠"重新走一次 `/webSk` 拿到的 `k` 是否与旧值不同"来判定；SDK 侧的强制刷新信号是 `/interceptor` 响应里的 `h586g/h587i/h592/isRe`。

**注入接口（已在 `src/pceptor_loader.js` 实现）**：

```js
const api = pceptor.load({
  sk: '<解出的 sk>',            // → 挂到 window.dw.getSk（sk 头的唯一可靠来源）
  shumeiid: '<sm>',             // → 挂到 window.dw.getSM
  fetchImpl: (url, init) => {   // 用来把真实 /webSk 响应喂给 SDK 自己解（离线调试时返回固定文本）
    return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve(HEX_RESPONSE) });
  },
});
const r = await api.getHeadersFor({ url, method: 'POST', bodyText });
```

---

## 6. 未确认 / 需要真机补的一手证据

| 项 | 状态 | 需要什么 |
|---|---|---|
| `sk` 的 TTL / 过期字段 | **未确认** | `/webSk` 响应解密后的完整 JSON（看是否有 `exp/ttl/ts`）。静态代码里只看到 `k/sm/adk` 三个字段被消费，未见时间字段 |
| `18233(sm, ua, …)` 的 key 派生式 | **未确认** | 需要能跑通一次 `120167()`；或用真响应 + 已知 `sm/ua` 反推 |
| `95950` 指纹载荷的真实字段集 | **未确认** | 真页面 `JSON.stringify(payload)`（`/webSk` 请求体）。本地为空对象，只能确认 `sign` 覆盖它 |
| `49452`（`/wr` 的 AES key 常量） | 只确认用法 | `49452.substr(5,16)` / `(10,16)`；常量明文未取 |
| `/interceptor` 白名单字段 | **未确认** | 响应解密后的数组（它决定哪些 URL 走 `{"data":…}` 加密） |
| `getSk()` 的 `.split('\u200b')[K]` 索引 | **未确认** | 真页面 `window.dw.getSk()` 与 `document.cookie` 里 `sk` 的 `\u200b` 分段关系 |

---

## 7. 相关脚本

| 脚本 | 用途 |
|---|---|
| `src/pceptor_loader.js` | 离线加载三件套；`getHeadersFor/encryptBody/decryptResponse/selfCheck` |
| `scripts/check23.js` | 触发 `dw.init()`，列出 `fetchCalls`（`/webSk` 的 method/headers/body） |
| `scripts/make_readable.js` | 生成 `*.readable.js`（解 `\uXXXX`），用于搜 `webSk`/`interceptor`/`/cost` |
| `scripts/ctx3.js` | 按关键字打印 readable 源码上下文 |
| `scripts/vm_line2off.js` | 把 vm 报的 `line:col` 还原成字符偏移（该文件用 U+2028 分行，共 1468 处） |
