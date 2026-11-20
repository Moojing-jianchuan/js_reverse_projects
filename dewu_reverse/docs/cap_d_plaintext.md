# `captcha` 的 `d` 明文结构快照（改版回归用）

- 采集自：`pyuntu.js`（`bcv = 1.3.1.20260331`），2026-11-20
- 提取方式：`decryptD(d)` 直接解出，无人工猜测
- 原始样本：`artifacts/cap_plain_call.json`（1301 字符）
- 机器可读版：`artifacts/cap_d_fields.json`
- 字段总数：**52**（顶层 5 + `data` 34 + `data.jcmp` 11 + verify 专属 2）

---

## 1. 顶层（5 键，顺序固定）

| 字段 | 类型 | 样例 | 随环境变？ | 说明 |
|---|---|---|---|---|
| `bcv` | string | `"1.3.1.20260331"` | ❌ 只随版本 | SDK 版本；**与 keystream 表绑版** |
| `type` | number | `0` | ❌ | 挑战类型（`call`=0；`verify` 为挑战 type，如 2） |
| `c` | string | `"v=1.3.1.20260331\|rest=0\|vrest=0\|vreqt=0\|sqt=0\|ojst=0"` | ⚠️ 实测恒为同值 | 计时/状态串，见 §5 |
| `webp` | number | `0` | ⚠️ verify 阶段会 0/1 | webp 支持位 |
| `data` | string(JSON) | 见 §2 | ✅ | **二次 JSON.stringify 的嵌套字符串**（所以明文里全是 `\"`） |

> ❗ `dtz` **不在顶层**，它在 `data` 里。早期版本把顶层 `dtz` 写进模板是错的，已修正。
> ❗ `sessionID` 首次调用**不出现**（见 §6）。

---

## 2. `data`（34 键，顺序固定）

### 2.1 浏览器身份

| 字段 | 类型 | 样例 | 随环境变 | 来源 |
|---|---|---|---|---|
| `yt` | number | `2` | ❌（Firefox=2） | 浏览器族标记 |
| `dua` | string | `"Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:152.0) Gecko/20100101 Firefox/152.0"` | ✅ | `navigator.userAgent` |
| `dpl` | string | `"PDF Viewer\|Portable Document Format\|internal-pdf-viewer,…"` | ✅ | plugins：`name\|description\|filename`，多插件用 `,` |
| `dnt` | string | `"wifi"` | ⚠️ | 网络类型，取不到 fallback `wifi` |
| `dwd` | number | `-1` | ⚠️ | `navigator.webdriver`（false→-1） |
| `dcd` | number | `24` | ✅ | `screen.colorDepth` |
| `dpr` | number | `1.25` | ✅ | `devicePixelRatio` |
| `dmtp` | number | `0` | ✅ | `maxTouchPoints` |
| `dte` | number | `1` | ⚠️ | 触摸能力位 |
| `dwte` | number | `1` | ⚠️ | `'ontouchstart' in window ? 1 : -1` |
| `dm` | string | `"PC"` | ❌ | 设备类型 |
| `dul` | string | `"https://www.dewu.com/"` | ✅ | `location.href` |

### 2.2 几何（px）

| 字段 | 类型 | 样例 | 来源 |
|---|---|---|---|
| `dbw` / `dbh` | number | `1906` / `969` | `document.body.clientWidth/Height` |
| `dbww` / `dbwh` | number | `1906` / `969` | 同上（另一路径交叉） |
| `dow` / `doh` | number | `1920` / `1032` | `window.outerWidth/outerHeight` |
| `dsw` / `dsh` | number | `1920` / `1080` | `screen.width/height` |
| `dsaw` / `dsah` | number | `1920` / `1032` | `screen.availWidth/availHeight` |
| `dsal` / `dsat` | number | `0` / `0` | `screen.availLeft/availTop` |
| `dor` | number | `-1` | 屏幕方向（缺失→-1） |
| `dsl` / `dst` | number | `0` / `0` | `scrollLeft/scrollTop` |

### 2.3 会话 / 身份

| 字段 | 类型 | 样例 | 来源 |
|---|---|---|---|
| `sk` | string | `""` | `cfg.sk \|\| cookie('sk') \|\| localStorage['sk'] \|\| ''` |
| `shumeiId` | string | `"normal"` | `cfg.sumei \|\| cookie('dwsm') \|\| localStorage['dwsm'] \|\| 'normal'` |
| `userId` | string | `""` | `cfg.userId \|\| ''` |
| `appid` | string | `"h5"` | `cfg.appid \|\| 'h5'` |

> `dwsm` 是**前端自造**的（不是服务端下发）：格式 `YYYYMMDDHHmmss` + 32 hex，`pceptor.js` 加载时即写入 cookie + localStorage。见 `scripts/pceptor_live.js` 实测：
> `dwsm = YOUR_SHUMEIID_HERE`

### 2.4 随机 / 一次性

| 字段 | 类型 | 样例 | 说明 |
|---|---|---|---|
| `dje` | string(32) | `"pj8UmFfo26bZlmg81G36A94lvaJa9veT"` | 每次调用重新生成；**明文里唯一随机的字段**；与加密无关 |

### 2.5 时区

| 字段 | 类型 | 样例 |
|---|---|---|
| `dtz` | string | `"Asia/Shanghai"` |

---

## 3. `data.jcmp`（11 键，页面上下文）

| 字段 | 类型 | 样例 | 来源 |
|---|---|---|---|
| `dlocalSk` | null/string | `null` | `localStorage['sk']` |
| `dtagn` | string/number | `""` | `document.scripts.length` 有无 |
| `dtitle` | string | `""` | `document.title` |
| `dcapno` | string | `""` | `#dw-slider #no` 的 innerText（挑战图编号） |
| `dscreenwidth` | number | `1920` | `screen.width` |
| `dpagewidth` | string | `""` | 页面盒宽（jsdom 下空） |
| `dscreenheigh` | number | `1080` | `screen.height` |
| `dpageheigh` | string | `""` | 页面盒高 |
| `dua` | string | 与 `data.dua` 同值 | **UA 在明文里出现两次**（`data.dua` 与 `data.jcmp.dua`），改 UA 时密文长度 +2×Δ |
| `dlanguage` | string | `"zh-CN"` | `navigator.language` |
| `dwebdriver` | boolean | `false` | `navigator.webdriver` |

---

## 4. `verify` 专属（相对 `call` 的差集）

| 字段 | 类型 | 样例 | 说明 |
|---|---|---|---|
| `sessionID` | string | 来自 `call` 响应的 `data.sessionId` | **`call` 首次没有，`verify` 有** |
| `datav3` | string | `"0,0,100\|1,1,200"` | 答题轨迹/答案串 |
| `datav3Fail` | string | `""` | 失败累加 |
| `cRestStart` | number | `1763600000000` | 本次答题起始时间（`Date.now()`） |

> `datav3/datav3Fail/cRestStart` 的具体拼装规则**未确认**（需要真实 verify 样本对拍）。
> 加密侧不需要再查：同一个加密器 + 同一张（按 sk 决定的）keystream。

---

## 5. `c` 字段的定稿结论：**恒 0，不作为过期依据**

```
c = "v=<bcv>|rest=<Date.now()-T_init>|vrest=0|vreqt=0|sqt=0|ojst=0"
```

- 源码里 `rest` 是 `new Date().valueOf() - T_init`，而 `T_init` **在同一次调用内**取，差值必然 ≈ 0。
- 断言实验（`scripts/delay_matrix.js`）：init 后 0 / 900 / 2500 ms 再调 `dewuCap`，`c` 三次**完全一样**。
- 主会话在真机上读到的也是 0。
- 结论：**`c` 恒 0，且与"请求已过期"无关**。早期报告里"真机非 0"的说法作废（未拿到任何非 0 样本）。

---

## 6. 使用约束：`sessionID` 缺省会被 `JSON.stringify` 丢掉

- `call` 的首个载荷对象里 `sessionID` 是 `undefined` → `JSON.stringify` **直接丢键**，所以顶层只有 5 键。
- 只有 `dewuCap({sessionId:'…'})`（或 `call` 返回过 sessionId 之后）才会出现 `sessionID` 键。
- **后果**：想复刻 `verify` 的 `d`，必须显式提供 `sessionID`；否则生成的是"call 形态"的明文，服务端按 verify 解析会失败。

---

## 7. 字段变更检测（改版回归）

SDK 改版时，字段集/顺序/取值来源都可能动。建议这样回归：

### 7.1 一条命令产出当前快照

```bash
node scripts/dump_plain_fields.js        # 生成 artifacts/cap_d_fields.json
node -e "console.log(require('./artifacts/cap_d_fields.json').map(r=>r.scope+'.'+r.name).join('\n'))"
```

### 7.2 与基线做三路 diff

| 对比项 | 判据 | 含义 |
|---|---|---|
| **字段名集合** | 基线 vs 当前 | 增删字段 → 明文结构变了，模板要更新 |
| **字段顺序** | `Object.keys(JSON.parse(plain))` 序列 | 顺序变了 → 密文与 `sign` 全变（即使值相同），模板必须跟顺序 |
| **`bcv`** | 版本串 | 变了 → **keystream 表必须重抽**，`sign` 盐也可能变 |

### 7.3 必须自动化的断言（建议写进 CI）

1. `d.length` 关系：`len(d) == 4*ceil(utf8(cipher)/3)`，且 `cipher.length == plaintext.length`
2. `signD(d) == sign`
3. `decryptD(d)` 能 `JSON.parse` 成功，且顶层键序列 == 基线
4. 顶层键数量 == 5（call）/ 6（verify，含 `sessionID`）
5. `data` 内键数量 == 34，`data.jcmp` 键数量 == 11
6. 同一 (sk, UA 族, 明文) 下 `buildD` 的输出**逐字节稳定**（幂等）

`scripts/test_crypt_layer.js` 已覆盖 1/2/3/6 的纯算法部分；4/5 需要真跑 SDK（`runSdkCaptcha`）。

### 7.4 keystream 的版本绑定

keystream 不是"一个常量"，而是 **F(sk, 浏览器族)**：见 `docs/preinforce_report.md` §3.4 与下表。

| 条件 | keystream 前 8 字节 | 长度 |
|---|---|---|
| `sk=''`，Firefox UA | `48b44cefa4f3ade2` | 1301（+可延伸至 9701） |
| `sk=''`，Chrome UA | `79982a435e3cd462` | 1363 |
| `sk=''`，无 UA | `6335cb9f2afe9cb6` | 1139 |
| `sk=96×'A'`（cookie 或 localStorage 等价） | `ef0790541be7a064` | 1493 |
| `sk=96×'B'` | `bb83d8c860d6958c` | 1493 |

→ 换 sk 必须 `calibrateKeystream(sk)` 重标定；换 UA 族同理。
