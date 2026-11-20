# pceptor.js 响应体解密链路报告

> 目标：`POST /api/v1/h5/commodity-pick-interfaces/pc/pick-rule-result/feeds/info`
> 线上 200 响应体在 wire 上是**纯 base64 文本**（不是 JSON），`content-type: application/json;charset=UTF-8`，
> 响应头带 `sks: 1` / `sks-length: N`。浏览器里前端由 `pceptor.js` 的 fetch / XHR 拦截器解密后才交给业务代码。
>
> 环境：Node + jsdom，全程本地，未发任何真实网络请求。
> 版本身份：`artifacts/js/pceptor.js`（152495 B）、`artifacts/js/preinforce2.js`（107221 B）、样本 `artifacts/resp_125.bin`（14764 chars）。
> 结论日期：2026-11-20。

---

## 0. 一句话结论

```
明文 = window.fun.Fun99(响应体文本, '', sks响应头, '')
```

`Fun99` 由 **preinforce2.js**（不是 pceptor.js 自己）定义；pceptor 只是在运行期把
`https://davstatic.dewu.com/preinforce2.js` 用 `<script>` 注入，加载完把 `window.fun` 上的
`{Fun110, Fun99}` 取来用。所以离线还原只需要 `preinforce2.js` + 一个 jsdom 环境，
**不需要 pceptor.js，不需要 `/interceptor` 配置，不需要 sk 会话，不需要联网**。

已用真实样本验证：14764 字符密文 → **11410 字符明文 JSON**，
`{"code":200,"msg":"success","data":{"list":[40 件商品],"total":198,"page":1,"pageSize":40},"status":200}`。

---

## 1. 调用签名 / 参数语义（定参来源：源码真实调用点，不靠猜）

### 1.1 fetch 路（`artifacts/unpacked/pceptor.000.eval.js` @197252）

```js
196562 = 2003.headers.get('sks');
if (196562) {
  100065 = await 236800.clone().text();
  3568   = window.fun.Fun99(100065, '', 196562, '');          // ← 响应体解密
  252207++,
  140303 = new Response(3568, { status: 2003.status, statusText: 2003.statusText, headers: 2003.headers });
}
222344(140303);   // 把解出来的 Response 交给业务层
```

### 1.2 XHR 路（同文件 @214442，`_yundunxhr` 的响应回调）

```js
var 67652 = <headers>.sks;
...
const { Fun99: 136802 } = await 108099,
      233299 = 136802(req.response, '', 67652, '');           // ← 同一函数、同一参数位
(252207++, req.response = 233299);
```

### 1.3 模块内包装（同文件 @339761）

```js
Fun99(102210, 5713, 171360){
  return window.fun && window.fun.Fun99
    ? window.fun.Fun99(102210, '', 171360, '')                // 第 2、4 参恒为 ''
    : 102210;                                                  // 没有 fun 就原样放行
}
```

### 1.4 参数表（实测矩阵见 §3.2）

| # | 形参 | 真实调用点传什么 | 我们的实测语义 |
|---|---|---|---|
| 1 | 数据 | `await res.text()` / `xhr.response` | 响应体密文文本（base64）。若字符串含 `{` 和 `}` 则直接 `JSON.stringify`/原样返回（短路，不解密） |
| 2 | — | `''` | 恒空串，**不影响结果**（传密文本身也等价） |
| 3 | `sks` | 响应头 `sks` 的值 | **按 `,` 切开取 `[0]`：等于 `'1'` 才解密，其它值原样返回输入**。传 `''`（假值）等价于 `'1'`（内部默认数组 `['1','1']`） |
| 4 | — | `''` | 只参与 `D.indexOf('/api/v1/h5/index/fire/flow/product/detailV3')` 那个埋点分支（统计 `C,<耗时>,<长度>`），**与解密无关**；传 `'#h5'` 结果不变 |
| 5 | — | `''` | 只用于 `sessionStorage.setItem('enT', <sks首段>)` 的记账分支；传 `'1'` 结果不变 |

> ⚠️ **`sks` 不是密钥**。它只是一个"这段响应体已加密"的开关/版本标记：`'1'` → 解密；
> `'0'` / `'2'` / `'hdw4'` / `'a,b,c'` → **原样把密文还给你**（不是解密失败，是设计上的旁路）。

### 1.5 `sk` / `dwsm` / `bcv` / `sm` 在这条链路里的位置

| 名字 | 出现在哪 | 与响应解密的关系 |
|---|---|---|
| `sk` | `localStorage.sk`，请求侧 keystream 的种子 | **无关**。seed 真 sk / 空 storage / 假 sk，解出的明文 md5 完全一致（§3.3） |
| `dwsm` | `localStorage.dwsm`，设备指纹 | **无关**（同上） |
| `bcv` | 请求体 `{bcv,type,c,webp,data}` 里的 SDK 版本号（`1.3.1.20260331`） | 响应侧**不出现**；请求加密才用 |
| `sm` / `shumeiId` | 请求明文里的 `data.shumeiId` | 响应侧不出现 |
| `sks` / `sks-length` | **响应头** | `sks` = 解密开关（见上）；`sks-length` 客户端**没读**（源码里 0 命中），含义未确认（§5） |

---

## 2. 证据强度（三条独立线路，互相不依赖）

| # | 线路 | 做法 | 结果 | 强度 |
|---|---|---|---|---|
| A | **源码调用点** | 在 `pceptor.000.eval.js` 里 grep `Fun99`，定位 fetch / XHR 两处真实调用 | 两处参数位完全一致：`(body, '', sks, '')` | **证明**（代码即事实） |
| B | **路线 1 喂入-截出**（`scripts/route1_pceptor_feed.js`） | 让 **pceptor 自己的 fetch 拦截器**吃一份假的 200：真实密文 + 真实响应头 `sks:1`、`sks-length:14740`；它注入的 `davstatic…/preinforce2.js` 用本地存档顶替（不联网） | 业务层拿到 11410 字符明文，`JSON.parse` 成功，`code=200`、`list=40` | **证明**（端到端、未逆任何算法） |
| C | **路线 2 直接调**（`scripts/probe_fun99_resp.js`） | jsdom 加载 `preinforce2.js`，直接 `Fun99(密文,'','1','')` | 同上，md5 `33a9d5c4…` 与线路 B 一致 | **证明**（同一函数、同一入参 → 同一出参） |

线路 B 的关键日志（`artifacts/route1_pceptor_feed.log`）：

```
[  205ms] 捕获 pceptor 注入的外部 SDK 脚本: https://davstatic.dewu.com/preinforce2.js…  → 用 preinforce2 payload 顶替（不联网）
[  284ms]   顶替后 window.fun = object | Fun99=function
[ 1830ms] 拦截器返回 Response: status=200 statusText=OK
[ 1830ms]   返回的 Response.headers.sks = "1"
[ 1830ms] 业务层拿到的 body: type=string len=11410
[ 1830ms]   JSON.parse 成功: code=200 data.list=40
```

> 说明：日志里被顶替的那个 URL 就是 `preinforce2.js` 本身（`227990 = 'https://davstatic.dewu.com/preinforce2.js…'`），
> 所以"顶替"不是取巧——我们用的就是 pceptor 真正要加载的那份资源（`artifacts/js/preinforce2.js` 存档）。

---

## 3. 实测矩阵

### 3.1 三条加载路线 × 输出

| 路线 | 输出 | 说明 |
|---|---|---|
| jsdom `createEnv({blockNetwork:true})` + `preinforce2.js` | **11410 字符 JSON** | ✅ 交付用这条 |
| 同上，但把 `navigator.userAgent` 改成 Chrome UA | 51141 字符 `{"0":2,"1":64,...}` | ❌ **走另一条分支**，输出的是 `Uint8Array` 的 `JSON.stringify`，不是明文 |
| 同上，UA 置空串 | 11410 字符 JSON | 空 UA 落在 Firefox 分支 |
| legacy `vm` 极简沙箱（`scripts/legacy_sandbox.js`）+ `preinforce2.000.eval.js` | 14764 字符 = **原样返回输入** | ❌ 该沙箱缺东西，解密分支不成立 |

**结论：`navigator.userAgent` 是这条解密链路的隐含入参**（决定 SDK 内部走 Firefox 还是 Chrome 分支）。
`src/env_patch.js` 的默认 UA 就是 Firefox 分支（`Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:152.0) Gecko/20100101 Firefox/152.0`），
所以 `src/pceptor_decrypt.js` 里**不要动 UA**。

### 3.2 `sks` 取值矩阵（同一段密文）

| `sks` | 输出长度 | 是否 JSON |
|---|---|---|
| `'1'` | 11410 | ✅ `code=200` |
| `''` | 11410 | ✅（假值 → 内部默认 `['1','1']`） |
| `'1,hdw4'` / `'1,1,1,1'` | 11410 | ✅（取 `[0]`） |
| `'0'` / `'2'` / `'hdw4'` / `'a,b,c'` | 14764 | ❌ 原样返回密文（旁路） |

### 3.3 会话/环境无关性

| 变量 | 改法 | 明文 md5 |
|---|---|---|
| 基线 | `seedStorage:{sk,dwsm}` | `33a9d5c4402904c801bcd9e7e1cf1691` |
| 清空 storage | 不 seed | `33a9d5c4402904c801bcd9e7e1cf1691` |
| 假 sk | `sk='BOGUS_SK_'+'x'*88` | `33a9d5c4402904c801bcd9e7e1cf1691` |
| 同进程连调两次 | — | 一致（`stable=true`） |

→ **响应侧密钥是静态内置在 SDK 里的，不随 sk / dwsm / 时间 / 会话变化**。
这比请求侧（`d` 的 keystream 强绑定 `sk`，见 `docs/preinforce_report.md`）宽松得多，也是本路线能稳定离线复现的原因。

---

## 4. 信封结构（分层，含证据）

```
wire 文本 (14764 base64 字符)
  │ base64 -d                      → 11072 字节（0 个 U+FFFD，是合法 UTF-8 → 确认是 mojibake 信封）
  │ .toString('utf8') → 每字符 &0xff
  ▼
密文字节 (7372 B)
  │ XOR 固定 keystream（前 8 字节 = 1e c5 ac 80 f8 e5 59 09）
  ▼
zlib 流 (7372 B，头 78 9c)
  │ pako Inflate (windowBits:15)   ← preinforce2 里打包的 pako（源码含 inflateInit2 / Z_BUF_ERROR）
  ▼
明文 UTF-8 JSON (14760 B / 11410 字符)
```

**"中间产物是 zlib 流"的直接证据**（`scripts/probe_resp_zlib_decisive.js`）：
把密文截断到一半喂给 `Fun99`，它会走失败分支并把中间缓冲吐成 base64：

```
n=3686 截断 → 返回 3686 字符，解 base64 得 2764 字节，头 78 9c ad 5b 59 57 1b d9   ← zlib 头
             inflate(Z_SYNC_FLUSH) 成功 → 6722 字节，开头正是
             "{\"code\":200,\"msg\":\"success\",\"data\":{\"list\":[{\"spuId\":33557075,…"
n=8/16/32/100/1000 → 返回 undefined（太短，连 zlib 头都不成立）
```

即：**解密 → zlib → inflate → JSON**，四步全在 SDK 内部完成，我们只做 I/O。

### 4.1 没有解到底的部分（诚实标注）

| 项 | 状态 | 说明 |
|---|---|---|
| keystream 的具体算法 | **未确认** | 只抽到前 8 字节（`1e c5 ac 80 f8 e5 59 09`）；已知它是位置相关流（截断密文得到前缀稳定的输出），非固定密钥 |
| 完整 keystream | **未恢复** | 需要"压缩前的精确字节"，而服务器用的 deflate 参数与我们本地对不上（见下） |
| 服务器 deflate 参数 | **未命中** | 本地对同一份明文暴力枚举 `level 0-9 × windowBits 8-15 × memLevel 1-9 × strategy 5 种`（两种明文变体，共 ~5000 组）**没有一组等于 7372**；最接近 `level=3,windowBits=11,memLevel=3 → 7370`（差 −2）。所以要么压缩参数还要更细（如 `pako` 默认 `chunkSize` 分块），要么服务器压缩的输入与最终 JSON 有细微差异 |
| `sks-length: 14740` | **未确认** | 客户端源码里 0 命中（不读）。它与明文 14760 B、密文 7372 B 都不等，最接近"压缩前的明文字节数"（差 20 B），但无法证实 |

> 结论：**算法层没有逆到底，也不需要**。本任务是 I/O 边界收口——`Fun99` 的入参出参已经完全可复现，
> 且不需要 sk 会话、不需要浏览器。若将来要脱离 JS 重写成纯 Node，需要先补齐上面三项。

---

## 5. 与请求侧信封的关系

两侧用的是**同一套 mojibake base64 外壳**，但密钥体系不同：

| | 请求体 `d`（captcha/call、info） | 响应体（feeds/info） |
|---|---|---|
| 外壳 | `base64(UTF8(latin1(bytes)))`，解出来是"mojibake base64" | **完全相同**（本报告 §4 已验证同一步还原函数） |
| 变换 | `明文 XOR KS`（等长，无压缩） | `XOR keystream → zlib deflate → inflate`（**不等长：7372 → 14760**） |
| 密钥来源 | **强绑定 `sk`**：换 sk 整张表都换（`docs/preinforce_report.md`） | **静态内置**：与 sk/dwsm/会话无关 |
| 入口 | `fun.Fun110(...)`（5 参，另有 `sign = md5('d'+d+salt)`） | `fun.Fun99(body,'',sks,'')` |
| 服务端标记 | 请求头 `sk` / `shumeiId` | 响应头 `sks`（=解密开关）、`sks-length` |

**为什么之前的尝试全部失败**（记录以免重走）：
1. 拿**请求侧**的 keystream 去 XOR 响应密文 → 必然全负。两侧密钥体系不同，长度也不同（响应侧多一层压缩）。
2. 只调 `Fun99(x,'','','')` → 看着像"原样返回"，误判为"不是解密入口"。实际 `''` 等价于 `'1'`，
   只有在**输入是 base64 且不含 `{}`** 时才走进解密；当时喂的是 JSON 字符串，被 `{`/`}` 短路了。
3. 在 jsdom 里等 pceptor 的拦截器自己触发 → 触发不了，因为它注入的 `davstatic…/preinforce2.js` 加载不到
   （`resources:'usable'` 会真的走网络，与"不联网"冲突）。本报告用"顶替那个 script + 手动触发 onload"绕开，
   不需要 `resources:true`。

---

## 6. 交付物与用法

### 6.1 `src/pceptor_decrypt.js`

```js
const { decryptInfoResponse, decryptInfoResponseText, decryptResponse } = require('./src/pceptor_decrypt');

const json = await decryptInfoResponse(rawBase64Text);              // 默认 sks='1'
const text = await decryptInfoResponseText(rawBase64Text);          // 不解 JSON
const json2 = await decryptResponse(rawBody, { sks: headers.sks }); // 按响应头语义自动判定
```

- 引擎单例：首次 ~880ms，之后每次 ~18ms；`disposeEngine()` 释放。
- 默认 `seedStorage:{sk: <当前sk>, dwsm: <当前dwsm>}`（只为让 SDK 环境自洽，**与解密结果无关**）。
- 传入已解密的 JSON 文本 / `sks` 首段不是 `'1'` → 原样返回（与浏览器行为一致）。
- 输入不是该信封 → 明确抛错，不静默返回垃圾（`decryptInfoResponse` 另有 `JSON.parse` 兜底）。

CLI：

```bash
node src/pceptor_decrypt.js artifacts/resp_125.bin artifacts/info_decrypted_sample.json
# 输入 : artifacts/resp_125.bin ( 14764 chars )
# sks  : "1" | 引擎 UA: Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:152.0) … Firefox/152.0
# 输出 : 11410 chars (908ms)
# JSON : code=200 msg=success data.keys=["list","total","page","pageSize"]
# list : 40 条，第一条 spuId=33557075
```

### 6.2 样本 / 日志 / 复现脚本

| 文件 | 内容 |
|---|---|
| `artifacts/info_decrypted_sample.json` | **真实明文样本**（`data.list` 40 件商品，`spuId=33557075` 起；`total=198`） |
| `artifacts/info_decrypted_raw.txt` | 同一明文的原始文本（未 pretty print，14760 B） |
| `artifacts/route1_pceptor_feed.log` | 路线 1 的端到端时间线 |
| `scripts/route1_pceptor_feed.js` | 路线 1：喂假 200 给 pceptor 自己的拦截器 |
| `scripts/probe_fun99_resp.js` | 路线 2：直接调 `fun.Fun99` |
| `scripts/probe_fun99_matrix.js` | 稳定性 / 环境无关性 / keystream 关系 |
| `scripts/probe_fun99_edges.js` | sks 矩阵、UA 分支、伪造/截断密文行为 |
| `scripts/probe_resp_crypto.js` | 密文字节还原、压缩假设、明文结构 |
| `scripts/probe_resp_zlib_decisive.js` | "中间产物是 zlib 流"的判决实验 + deflate 参数暴力枚举 |
| `scripts/verify_pceptor_decrypt.js` | 离线回归（15 项全绿） |

```bash
node scripts/verify_pceptor_decrypt.js   # pass=15 fail=0
node scripts/route1_pceptor_feed.js      # 端到端，不发网络请求
```

---

## 7. 限制与改版检测点

1. **样本量 1**。所有结论建立在一份真实 200（`resp_125.bin`）上；分页 / 空列表 / 业务错误码 / 其它 `sks` 取值都**未采样**。
   接入采集程序时应保证：解密后 `JSON.parse` 成功 且 `code === 200`，否则落盘原文待查。
2. **UA 必须留在 Firefox 分支**。换 Chrome UA 会静默输出 `Uint8Array` 序列化（不是报错），
   这类退化很难从结果里看出来——所以 `decryptInfoResponse` 用 `JSON.parse` 做最后一道闸。
3. **`preinforce2.js` 改版即失效**。检测点：
   - `artifacts/js/preinforce2.js` 哈希变化；
   - `Fun99` arity 不再是 5；
   - `window.fun` 上不再同时有 `Fun110` / `Fun99`；
   - 解密结果不再是 zlib 流（截断实验里拿不到 `78 9c` 头）。
4. **`sks` 语义可能扩展**。目前只见到 `'1'`。若线上出现 `'1,xxx'` 之外的加密版本标记（例如 `'2'` 真的表示另一种算法），
   本模块会直接原样返回密文——届时先抓一条真实响应确认 `sks` 首段再改分支。
5. **未逆算法**：本模块依赖 JS 运行时跑 SDK。若要求"纯 Node 无 jsdom"，还缺 §4.1 里的三项（完整 keystream、deflate 参数、`sks-length` 含义）。
