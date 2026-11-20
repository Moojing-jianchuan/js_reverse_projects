# 验证码链路报告：本地生成 `d` → `captcha/call` → `captcha/verify`

- 日期：2026-11-20
- 状态：**纯离线交付**（主会话要求停止一切真实网络请求；本文所有"发送"步骤都标注为可选、默认关闭）
- 相关文档：`docs/preinforce_report.md`（算法与 fun）、`docs/cap_d_plaintext.md`（明文快照）

---

## 0. 结论速览

| 问题 | 结论 |
|---|---|
| 本地能否生成 `call` 的 `d` | ✅ 能，与 SDK 输出**逐字节一致** |
| 本地能否生成 `verify` 的 `d` | ✅ 加密侧能（同一加密器 + 同一 keystream）；`datav3` 等内容侧需真实交互 |
| 「请求已过期」是什么 | ❌ **不是 `d` 的问题**：真机自己调 `window.dewuCap({})` 也返回这一句（主会话控制组）；干净会话同一调用返回 11808 字节完整挑战 |
| 卡在哪 | **一个没被风控标记的出口环境/会话**，不是算法 |
| `sk` 怎么来 | 前端可自举：`pceptor.js` 加载即写 `dwsm`；`sk` 走 `/webSk`（`dav.dewu.com/webSk`），本地可复刻调用契约但本报告未发该请求 |

---

## 1. 一条命令（离线）

```bash
cd D:\ds_work\js_reverse_projects\dewu_reverse

# 本地生成 call 载荷 + 三重自检（sign / 解密往返 / 本地重算），不发任何请求
node src/dewu_cap_flow.js
```

输出（实测）：

```
=== 步骤 1/3：本地生成 captcha/call 载荷 ===
  d.len   : 2628
  sign    : 12da10c07b2464fda1d4a34de2588024
  明文长度: 1301
  自检    : sign true | 解密往返 true | 本地重算 true
```

产物写到 `artifacts/flow/<时间戳>/`：
`call_request.json`（headers + body）、`call_plaintext.json`（解密明文）、`summary.json`。

**可选网络步骤**（主会话已要求停用，仅保留能力）：

```bash
node src/dewu_cap_flow.js --send            # 真发 captcha/call（1 次）
node src/dewu_cap_flow.js --send --verify   # 再发 captcha/verify（合成 datav3，仅探针）
```

---

## 2. 链路分解

### 步骤 1：建环境 + 跑原始 SDK，拿到 `{d, sign}`

```js
const L = require('./src/preinforce_loader');
const cap = await L.runSdkCaptcha({}, { wait: 1500 });
// cap.parsed = { d, sign }          ← SDK 自己发出的 body
// cap.plain  = 解密出的明文
```

`runSdkCaptcha` 内部：`createEnv()`（jsdom + env_patch）→ 包 `JSON.stringify` 与 `XMLHttpRequest` 原型 → `evalSource(pyuntu.js)` → 调 `window.dewuCap(config)` → 抓它自己发出的请求。

### 步骤 2：`POST /api/v1/h5/risk-stone-captcha/captcha/call`

请求头（SDK 同款，取自 `pceptor` 的 Headers 构造）：

```
Content-Type: application/json
appid: h5        bcn: dewu       bcv: 1.3.1.20260331
platform: h5     lang: zh        SK: <sk>       shumeiId: <dwsm>      userId: ""
```

请求体：`{"d":"<2628 字符>","sign":"<32hex>"}`

**已知回执**（2026-11-20）：

| 会话状态 | 响应 |
|---|---|
| 干净会话（主会话 10:19 真机） | 200，**11808 字节完整挑战**（含 `bgList` 图集、`type=2`） |
| 被风控降级（主会话真机 + 本地均如此） | 200，`{"code":0,"msg":"请求已过期"}` |

→ 这一行就是**控制组证据**：同一条 `msg` 在真机上也出现，说明它与 `d` 的构造无关。

### 步骤 3：构造 `captcha/verify`

```js
const vPlain = {
  sessionID: '<call 响应里的 data.sessionId>',   // ← 必须显式给，否则会被 JSON.stringify 丢键
  bcv: '1.3.1.20260331',
  type: <挑战 type>,
  c: 'v=1.3.1.20260331|rest=0|vrest=0|vreqt=0|sqt=0|ojst=0',
  webp: 0,
  data: '<与 call 相同的 data 字符串>',
  datav3: '<答题轨迹/答案串>',
  datav3Fail: '',
  cRestStart: Date.now(),
};
const body = L.buildCaptchaBody(vPlain, ks);   // ks 见 §3
```

`datav3` 的拼装规则**未确认**（需真实 verify 样本对拍）。加密侧不需要再查。

---

## 3. 本地生成 `d` 的正确用法（含 sk 标定）

```js
const L = require('./src/preinforce_loader');

// ① 标定：给定真 sk，抽取与它配套的 keystream（离线，跑一次原始 SDK）
const ks = await L.calibrateKeystream(realSk);        // 返回 ~2000+ 字节

// ② 之后纯算法，毫秒级、逐字节稳定
const plain = L.callPlainTemplate({ data: { sk: realSk, shumeiId: dwsm } });
const body  = L.buildCaptchaBody(plain, ks);           // { d, sign }

// ③ 解密（自检）
L.decryptD(body.d, ks) === JSON.stringify(plain);      // true
```

**必须重标定的三种情况**

1. `sk` 变了（`KS = F(sk, …)`，换 sk 整张表都变）
2. UA 族变了（Firefox / Chrome / 其他 → 三张不同表）
3. `bcv` 版本变了

`calibrateKeystream` 的 `pad` 参数决定能覆盖多长的明文（默认 800 → 明文 +1600 字节）。明文超过 ks 长度时 `buildD` 会**显式抛错**，不会静默截断。

---

## 4. `sk` 的来源（源码定位 + 本地实证）

### 4.1 取值点（`pyuntu.js` 反混淆）

```js
sk       = cfg.sk  || cookieGet('sk') || localStorage.getItem('sk') || ''
shumeiId = cfg.sumei || cookieGet('dwsm') || localStorage.getItem('dwsm') || 'normal'
data.jcmp.dlocalSk = localStorage.getItem('sk')
// 请求头：append('sk', …) / append('shumeiId', …) / append('userId', …)
```

### 4.2 `dwsm` 是前端自造的（已实测）

`node scripts/pceptor_live.js`（只加载 `pceptor.js`，无网络请求）后：

```
[storage] dwsm = YOUR_SHUMEIID_HERE
[storage] yuntuSession = 1NuBZKvY-g9OY-Mqez-R3Sz-m65msmNSEPRSA9V
document.cookie: dwsm=YOUR_SHUMEIID_HERE
```

格式：`YYYYMMDDHHmmss` + 32 hex。**不需要服务端下发**，`pceptor` 加载即写入。

> ⚠️ 注意：`dwsm` 里的时间前缀说明它**可能带有效期**，但本报告未验证其 TTL。

### 4.3 `/webSk`（`sk` 的签发/续期）调用契约

`pceptor.js` 反混淆后（`pceptor.000.eval.deesc.js` @226472）：

```js
init(cfg) {
  const payload = FUN110(JSON.stringify(body95950), bcv, sk, sm, cfg);   // 组包（d=明文、a/b/c/e=令牌）
  payload.sign = SIGN(payload);
  fetch('https://dav.dewu.com/webSk', {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      dsn: 'p=h&d=ar&bcn=dewu&bcv=' + bcv + '&sm=' + sm + '&sk=' + sk + '&il=n&kt=r'
    },
    body: JSON.stringify(payload)
  })
  .then(r => r.text())
  .then(t => {
    const resp = JSON.parse(DEC(t, bcv, sk, sm, cfg));    // 响应是加密的，用 FUN99/DEC 解
    Promise.all([...]).then(([a, b]) => {
      postTo('https://dav.dewu.com/wr', sk, {...resp, ...a, ...b, xhsda: MD5(...)}, bcn, bcv);
    });
  });
}
```

要点：

- 触发条件**不是**脚本加载，而是某个拦截到的事件（本报告只加载 `pceptor` 时**没有**任何网络请求）。
- 请求体与响应都走同一组加解密函数（`FUN110` / `DEC`），`sk` 通过 `dsn` 头明示传给服务端。
- 观察到的相邻常量：`bcn='dewu'`、`bcv='1.3.1.20260331'`、`sm=<shumeiId>`、`il=n`、`kt=r`、`p=h`、`d=ar`。
- **未验证**：以空 `sk` 调 `/webSk` 是否能签发一个新 `sk`（本轮按主会话要求未发该请求）。

### 4.4 可复用的替代顺序

页面真实顺序是 `pceptor.js` → 业务 chunk → `preinforce2.js` → `pyuntu.js`。
本项目的 `runSdkCaptcha` 只加载 `pyuntu.js`（够用，因为 `d` 只依赖 pyuntu + keystream）；
若需要 `dwsm` / `shumeiId` / 被 `pceptor` 二次包装的请求头，则先 `evalSource(pceptor.js)` 再 `evalSource(pyuntu.js)`。

> 实测：`pceptor` 的 fetch 包装会 `new Request(...)`/`req.clone()`，jsdom 里没有这些构造器，
> 需要补最小 `Request`/`Headers` 多态实现（`scripts/with_pceptor_probe.js` 里有现成代码）。

---

## 5. 与 `d` 无关但必须记住的两条约束

1. **`sessionID` 缺省被 `JSON.stringify` 丢掉** —— 复刻 `verify` 的 `d` 必须显式传 `sessionID`，否则生成的是 `call` 形态明文。
2. **UA 必须三处一致** —— HTTP `User-Agent` 头、`data.dua`、`data.jcmp.dua`；且 UA 族决定 keystream 表。
   UA 在明文里出现两次，改 UA 长度 Δ 会让明文长度 +2Δ（so 密文长度 +2Δ）。

---

## 6. 未完成 / 需要外部条件

| 项 | 为什么没做完 | 怎么收口 |
|---|---|---|
| `call` 拿到真实挑战 | 本机出口/会话被风控降级（真机同样被降级，见控制组） | 换一个干净出口/会话，同一份代码直接可跑 |
| `datav3` 拼装规则 | 需要真实 verify 样本 | 拿到一次成功的 `verify` 请求体后对拍 |
| `/webSk` 能否用空 `sk` 自举签发 | 按要求未发该请求 | 干净环境下发 1 次，看响应是否含新 `sk` |
| `KS = F(sk, UA)` 的内部构造 | 只是没逆；工程上标定即可 | 如需脱机算表，需逆 `F`（当前无必要） |
| `dwsm` 的 TTL | 未验证 | 观察过期的 `dwsm` 是否被服务端拒 |

---

## 7. 代码地图

| 文件 | 作用 |
|---|---|
| `src/dewu_cap_flow.js` | 链路主入口（默认离线；`--send` / `--verify` 才会发请求） |
| `src/preinforce_loader.js` | `buildD / decryptD / signD / buildCaptchaBody / callPlainTemplate / calibrateKeystream / runSdkCaptcha / introspectFun` |
| `src/env_patch.js` | jsdom 补环境（子任务C） |
| `scripts/test_crypt_layer.js` | 纯算法层 10 项断言 |
| `scripts/test_calibrate.js` | `calibrateKeystream` 与内置 ks 的一致性 |
| `scripts/ks_vs_sk.js` | sk → keystream 的对照实验 |
| `scripts/branch_key_matrix.js` | UA → keystream 表的对照实验 |
| `scripts/dump_plain_fields.js` | 生成 52 字段快照 |
| `scripts/pceptor_live.js` | 只加载 pceptor，观察 `dwsm`/`yuntuSession` 自造 |
| `scripts/with_pceptor_probe.js` | pceptor + pyuntu 串联（含 `Request` 补丁） |
