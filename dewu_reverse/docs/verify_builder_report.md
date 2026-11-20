# 得物 `captcha/verify` 请求组装器 —— 报告

> 工程：`D:\ds_work\js_reverse_projects\dewu_reverse`
> 日期：2026-11-20 ｜ 范围：**全本地**（不联网、不跑浏览器 MCP）

## 0. 结论摘要

| 项 | 结论 | 证据 |
|---|---|---|
| 组装器 | `src/cap_verify_builder.js` → `buildVerify()` 输出 `{plain, d, sign}` | 本报告 §1 |
| **逐字对拍** | **95 条断言全绿**；用真实样本的全参数重新加密，`d` / `sign` 与真实抓包**字符串全等** | `node scripts/test_verify_builder.js` |
| keystream 来源 | ① 已知明文反推 `ks = cipher XOR plaintext`（3285 字节）② `calibrateCaptchaKs(sk)` 现标（6412 字节）—— 前 3285 字节**逐字节相同** | §1.1 |
| 字段顺序 | `sessionID,width,type,pts,xys,data,bcv,webp,c,pc,pn,trace`（12 项，顺序影响密文进而影响 sign） | §2 |
| `c` 计时项 | **call 恒 0；verify 非 0**（`rest=156 / vrest=0 / vreqt=4 / sqt=73873 / ojst=19`） | §3 |
| 轨迹 | 同落点可**完全还原**真实样本的 126 点 / 1102ms（`xys` 逐字符相同） | §4 |
| 未知 | `pts` 的坐标系、`pc` 的生成规则、`pn`/`trace` 语义、`c` 各锚点、服务端校验阈值 | §6 |

复现：

```bash
node scripts/test_verify_builder.js     # 逐字对拍 + 参数化回归，95 条断言，期望 PASS 95 / FAIL 0
node src/cap_verify_builder.js --demo   # 真实样本参数 + 新随机 dje → d/sign + 自检
```

对拍结果（本机实跑）：

```
A. 逐字对拍：真实参数 + 反推 ks → d/sign 与抓包完全一致    7/7 PASS
B. 逐字对拍：ks 用 calibrateCaptchaKs(sk) 现标（异步路径）  3/3 PASS
C. 换 ks 重加密：d 变、明文不变（链路自洽）                 4/4 PASS
D1..D6 字段顺序/类型、c、轨迹、参数化、半套轨迹、负向输入   81/81 PASS
────────────────────────────────────────────────────────────
总计 95 条断言 | PASS 95 | FAIL 0
```

---

## 1. 算法（本次再次独立验证）

```
cipher    = plaintext_utf8 XOR keystream          // 等长、偏移 0
d         = base64( UTF8( 每字节当字符(cipher) ) )  // "mojibake base64" 的成因
sign      = md5("d" + d + "048a9c4943398714b356a696503d2d36")
keystream = F(sk, UA族)                            // 同 sk 同 UA 恒定，与长度/时间/随机无关
```

对拍时的三个硬数字（真实样本，服务端返回 `{"code":1,"msg":"验证成功"}`）：

| 量 | 值 |
|---|---|
| 明文（`JSON.stringify(payload)`） | **3285** 字节 |
| `d` | **6556** 字符（base64） |
| `decodeD(d)` | base64 → 4916 字节 → UTF-8 回压 → **3285** 字节密文 |
| `sign` | `0ccc257f686c71b313e5b9517aa5176f` |

### 1.1 keystream 两条独立路径一致

- 反推：`ks = cipher XOR 明文`，3285 字节，head `6f16ca12c4314aff5c05eb23171d838b…`
- 标定：`calibrateCaptchaKs(sk, dwsm)`（`sk` 取自真实样本 `data.sk`，UA = Firefox 152 同族），6412 字节
- 断言：`ksCalib.slice(0,3285).equals(ksDerived) === true`

⇒ **用样本自己的 `sk` 标定出的表，就是产生该样本的那张表**。这同时证明了 `ks = F(sk, UA族)` 且与明文长度无关（标定时撑长 `sessionId` 不影响前 3285 字节）。

## 2. 12 个字段的语义（逐项标注确认程度）

| # | 字段 | 类型/形制 | 含义（确认程度） | 来源 |
|---|---|---|---|---|
| 1 | `sessionID` | string，样本 86 字符（base64 风格） | **挑战会话 id**〔已确认〕verify 必带；`call` 首次调用时可为空/省略 | `captcha/call` 响应的 `sessionId` |
| 2 | `width` | number，样本 `384` | 挑战图宽度〔高度可能〕——与 `pts` 两点坐标都落在 `[0,384]` 量级吻合 | 挑战参数 |
| 3 | `type` | number，verify=`5`，call=`0` | 挑战/作答类型码〔**未确认** `5` 的确切含义，疑为拖拽点选类〕 | 挑战参数 |
| 4 | `pts` | `"sx,sy,absTs\|ex,ey,cost"` | 起终点 + **绝对毫秒时间戳** + 拖拽总耗时（`cost` = `xys` 末点相对时间）〔形制已确认〕；`sx,sy` 的坐标系〔**未确认**，见 §4.3〕 | SDK 轨迹采集 |
| 5 | `xys` | `"x,y,t\|…"` 126 点 | 轨迹点：**首点 = 绝对页面坐标 + 绝对毫秒；后续点 = `x` 页面坐标 + `y`（另一套基准）+ 相对毫秒**〔形制已确认，`y` 基准混用见 §4.2〕 | SDK 轨迹采集 |
| 6 | `data` | **字符串**（内嵌 JSON，34 字段） | 环境指纹（UA/尺寸/时区/sk/shumeiId/`dje` nonce/`dom` 等）〔已确认〕**必须是字符串**，传对象会多一层引号导致密文全变 | 风控 SDK 采集 |
| 7 | `bcv` | string `1.3.1.20260331` | SDK 版本〔已确认〕；换版本要重抽 keystream | SDK 常量 |
| 8 | `webp` | number，样本 `1` | 图片格式能力位〔含义**未确认**；旧样本出现过 `0`〕 | 环境探测 |
| 9 | `c` | `v=..\|rest=..\|vrest=..\|vreqt=..\|sqt=..\|ojst=..` | 计时/状态串〔形制已确认，各项含义见 §3〕 | SDK 计时器 |
| 10 | `pc` | `"x1,y1\|x2,y2"`，各 2 位小数，样本 `635.26,277.63\|886.34,403.17` | 两个落点坐标〔**未确认**坐标系与生成规则，见 §4.3〕 | SDK 布局/事件 |
| 11 | `pn` | **字符串**，样本 `"1123"` | 〔**未确认**〕注意是字符串不是数字（写成数字会导致密文不同） | SDK 内部计数 |
| 12 | `trace` | 32 位大写 hex，样本 `2D456506F735C7F22A120285752BF154` | 轨迹/请求 trace id〔**未确认**；与请求头 `traceparent`（`00-f5fb…-01`）、`hsn` 都不同值〕 | SDK 随机 |

**两份真实样本的顶层差异**（`artifacts/verify_d_plaintext.json` vs `artifacts/call_plain_real.json`）：

| | call | verify |
|---|---|---|
| 顶层字段 | `sessionID,bcv,type,c,webp,data`（6） | `sessionID,width,type,pts,xys,data,bcv,webp,c,pc,pn,trace`（12） |
| `type` | 0 | 5 |
| `c` 计时项 | 全 0 | `rest=156 / vreqt=4 / sqt=73873 / ojst=19` |
| `data` 字段集 | 34 个，首个是 `yt:2` | 34 个，**没有 `yt`、末尾多 `dom:"DIV_sDIV_sDIV"`** |

## 3. `c` 六个计时项：**verify 非 0、call 恒 0**（这是事实，别写反）

### 3.1 真实取值

```
call   c = v=1.3.1.20260331|rest=0|vrest=0|vreqt=0|sqt=0|ojst=0     ← 全 0
verify c = v=1.3.1.20260331|rest=156|vrest=0|vreqt=4|sqt=73873|ojst=19
```

### 3.2 源码字面量（`artifacts/unpacked/pyuntu.readable.js`，偏移为字节位置）

```js
// call 路径 @114209 —— sqt/ojst 硬编码 0
c: 'v='.concat(V,'|rest=').concat(new Date().valueOf() - T0,'|vrest=',0,'|vreqt=').concat(R,'|sqt=0|ojst=0')

// verify 路径 @115287 —— sqt 变成变量，ojst 仍为 0
c: 'v='.concat(V,'|rest=').concat(A,'|vrest=').concat(B,'|vreqt=').concat(R,'|sqt=').concat(C,'|ojst=0')

// verify 路径 @133225 —— rest/vrest/vreqt/sqt/ojst 全是变量
c: 'v='.concat(V,'|rest=').concat(A,'|vrest=').concat(B,'|vreqt=').concat(R,'|sqt=').concat(C,'|ojst=').concat(D)

// 另一分支 @101557（对象累加版）—— rest/sqt/ojst 反过来是硬编码
['v='.concat(V),'rest=0','vrest='.concat(Date.now()-T),'vreqt='.concat(R),'sqt=0','ojst=0'].join('|')
```

⇒ **同一个拼接模板、不同字段槽位**：`call` 把 `sqt/ojst` 写死为 0，`verify` 走的是「五项全部取变量」的那条分支。这与两份样本的实测完全吻合（call 全 0 / verify 三项非 0），也解释了早期的错误推断「`c` 的时间项恒为 0」为何只在 call 上成立。

### 3.3 取值规律（实测 + 锚点反推）

以「verify 请求发出时刻 `T_req = 1795152694702`」为基准反推各项隐含锚点：

| 项 | verify 值 | 反推锚点 `T_req - 值` | 锚点相对什么事件 |
|---|---|---|---|
| `rest` | 156 ms | `…694546`（13:31:34.546） | 落在「`xys` 末点 `.141` → 请求 `.702`」之间，即**拖拽结束后的提交阶段**〔推测，未确认〕 |
| `vrest` | 0 | `T_req` 本身 | 恒 0（两份样本都是 0）〔未确认是"未触发"还是"恒置 0"〕 |
| `vreqt` | 4 ms | `…694698` | 距请求仅 4 ms，像**载荷组装/发送那一刻的残余计时**〔推测〕 |
| `sqt` | 73873 ms | `…620829`（13:30:20.829） | 比 `call`（13:30:19.015）晚约 **1.8 s**，即验证码面板初始化时点〔推测：会话/实例存活时长〕 |
| `ojst` | 19 ms | `…694683` | 同样落在提交阶段〔推测〕 |

要点：

- `sqt` 是唯一「量级到几十秒」的项，只能用「会话已存在多久」解释；`rest/vreqt/ojst` 都是**同一提交动作内的毫秒级残差**。
- 因为 `T_req` 含 1 次网络排队，上表锚点有 ±几十毫秒浮动，**只能作为数量级证据**；各项的精确锚点事件 = **未确认**（见 §6）。
- 生成新载荷时：`c` 请显式传（`buildVerify({c})` 或 `buildVerify({bcv, timings})`）。`makeC()` 默认全 0 = call 形态；**verify 该填非 0**，`sqt` 应填「该验证会话已过去多少毫秒」。

## 4. 轨迹：结构与参数化

### 4.1 已确认的形制（126 点真实样本）

```
xys[0]   = x,y,<绝对毫秒时间戳>          // 页面坐标 + 绝对时间
xys[1..] = x,y,<相对毫秒>                // 相对首点
pts      = "sx,sy,<绝对毫秒>|ex,ey,<cost>"   // cost == xys 末点相对时间（1102）
```

实测统计（本次重算，修正了一处旧口径）：

| 指标 | 值 |
|---|---|
| 点数 | 126 |
| 总时长 | 1102 ms |
| `dt`（第 2 点起相邻差）取值种类 | **15 种**：3,4,5,6,7,8,10,11,12,16,17,23,33,89,139 |
| `dt` 范围 | 3 – 139 ms |
| `x` 列 | 274 → 401，单调不减 |
| `y` 列（第 2 点起） | 0 → 249，单调不减（104 次上升 / 20 次持平 / **0 次下降**） |
| `pts` 与 `xys` 首点 | `pts(62,57)` ≠ `xys(274,626)` |

> **口径修正**：`artifacts/track_stats.json` 里写的「dt 只有 16 种取值」是把首点的**绝对时间戳**当成相对偏移算出的坏值一起统计了（该文件自己的 `dtMin = -1795152693004` 正是 `35 - 1795152693039`）。模板真实 `dt` 种类 = **15**。

### 4.2 `y` 列基准混用（真实数据事实）

`xys[0].y = 626`，`xys[1].y = 0`，随后 0→249 单调上升。也就是说 **首点用页面坐标，后续点用另一套 y 基准**，两段之间不连续。`genTrackFromTemplate()` 的仿射复现会如实把这个跳变也复现出来（所以同落点能逐字符还原样本），没有"修掉"它 —— 这是对真实样本的忠实还原，不是 bug。

### 4.3 `pts` / `xys` / `pc` 三套坐标（关系**未确认**）

样本两条端点：

| | 首 | 末 |
|---|---|---|
| `pts` | 62,57 | 189,306 |
| `xys` | 274,626 | 401,249 |
| `pc` | 635.26,277.63 | 886.34,403.17 |

- `xys.x - pts.x` 两点恒为 **212**（像纯平移），但 `xys.y - pts.y` 两点是 **+569 / −57**（不是常差）。
  ⇒ `pts` 与 `xys` **不是同一坐标系下的平移关系**；两点数据也无法定出唯一仿射变换。`pts` 的坐标系 = **未确认**。
- `pc` 与 `pts` 之间：若假设仿射，隐含尺度为 x 方向 1.977、y 方向 −0.504（符号相反、模不同），说明也不是同一变换。`pc` 的生成规则 = **未确认**（现有 `cap_solver.genTrack()` 里的 `sx*2.32 / ey*1.31` 是占位猜测，别当结论）。
- 工程处置：`buildVerify` 允许 `track` 里直接给 `pts/pc/pn/trace` 原样透传；`makeTrack()` 默认仍沿用 `genTrackFromTemplate` 的「`pts` 与 `xys` 同坐标」写法（**与真实样本不符**，为兼容既有资产不改动它），需要的场合请显式传 `pts`。

### 4.4 轨迹参数对通过率的影响（**假设，未验证**）

> 纪律要求不发真实请求，所以下面全部是**待验证假设**，不是结论。每条都给了可落地的验证方法。

| 参数 | 假设 | 依据 | 怎么验证（等有真实环境时） |
|---|---|---|---|
| 点数 126 | 低于某阈值（疑 < 50）或与时长比例离谱会被判机 | 真人节流 3–139 ms/点，固定 10 ms 等距是最典型机器特征 | 固定落点，只改点数（126→40→126），看 `code` |
| 总时长 1102 ms | 与位移强相关；短位移配长耗时是机器特征 | `genTrackFromTemplate` 已按 `clamp(新位移/模板位移, 0.45, 1.6)` 缩放 | 扫 0.45/1.0/1.6 三档 |
| `dt` 非等距（15 种） | 等距 `dt` 是最强机器信号 | 真人 3–139 ms 长尾 | 用等距 `dt` 造一条对照 |
| `x` 单调 | 横向回拉可能被计分 | 真实样本 0 次回拉 | 注入 x 回拉 |
| `y` 列基准混用 | 服务端可能根本不解析 y 的绝对值，只看差分/点数 | 样本自身 `626→0` 跳变仍通过 | 改 y 基准后重放 |
| `pts` 与 `xys` 一致性 | 两者若被交叉校验，坐标系错配会暴露 | 样本中二者不同坐标系 | 固定 `xys`、换 `pts` 写法 |
| `trace` 唯一性 | 极可能按会话去重 | 32 位随机 hex | 同 `trace` 连发两次 |
| `dje` 新鲜度 | 明文里唯一每次变的字段，是**唯一可行的防重放抓手** | `docs/preinforce_report.md` §4：`d` 不绑时间、不一次性 | 同 `dje` 重放两次 |

同时必须记住两条已确认的前提（同前一份报告）：`d` **不绑时间**（`c` 的时间项在同一次调用内取值，且 `keystream` 与时间无关），`d` **不一次性**（同明文 → 同 `d`）。若服务端要防重放，只能靠明文里的 `dje` / `sessionID`。

## 5. 对拍是怎么做到"逐字"的

1. `artifacts/verify_d_plaintext.json` 是**已解密明文**（人工拖拽那次），其键序就是真实键序；`JSON.stringify()` 后 = 3285 字节，与密文长度相等 ⇒ 说明它就是原文，没有多余空格。
2. 从 `artifacts/capture_verify.json` 取那次请求的真实 `{d, sign}`。
3. `ks = decodeD(d) XOR 明文`（3285 字节）。
4. `buildVerify(真实样本全部参数 + ks)` → `plain'`、`d'`、`sign'`。
5. 断言：`plain' ≡ 明文`（逐字节）、`d' ≡ d`（字符串全等）、`sign' ≡ sign`、`decryptPlain(d', ks) ≡ 明文`。

关键坑（都已在测试里锁死）：

- `data` 必须是**字符串**，传对象会多一层引号；`data` 重建时**不能**用 `cap_solver.buildDataField()`（它会重写 `jcmp.dlocalSk` / `jcmp.dua`，改变样本原值）——直接 `JSON.parse` → 改字段 → `JSON.stringify` 才能保持键序与原值。
- `pn` 是**字符串** `"1123"`，写成数字 `1123` 会让密文不同。
- 字段顺序错一位，`sign` 就全变；`assemblePlain()` 内置了顺序断言，写错直接抛错。

## 6. 未确认项清单（都给出"怎么才能确认"）

| # | 未确认 | 现状 | 确认方法 |
|---|---|---|---|
| 1 | `c` 五项各自的精确锚点事件 | 只知量级 + 反推锚点（§3.3） | 在浏览器里记录 `call`/`mousedown`/`mouseup`/`verify` 的 `performance.now()`，与 `c` 对表 |
| 2 | `vrest` 为何恒 0 | 两份样本都是 0 | 造一次"失败后重试"的 verify |
| 3 | `vreqt=4` 的含义 | 疑"本次 verify 的第 4 次请求"或发送前残差 | 连续 verify 多次看是否递增 |
| 4 | `pts` 的坐标系 | 与 `xys` x 差恒 212、y 差非常数 | 多点真实样本（≥3 组不同落点）做联立 |
| 5 | `pc` 的生成规则 | 与 `pts`/`xys` 都对不上 | 同上；或在浏览器里抓 `pc` 来源对象 |
| 6 | `pn` 语义 | 只有 `"1123"` 一个样本值 | 多次作答看是否递增/随页面元素数变 |
| 7 | `trace` 语义 | 32 位大写 hex，与 `traceparent`/`hsn` 不同 | 比对同一页面多次 verify 的 `trace` 与前缀 |
| 8 | `type=5` 与 call 的 `type=0` 的关系 | 只知取值 | 换挑战类型（点选/滑块）观察 |
| 9 | `webp` 含义（0/1） | verify 与 call 都是 1，旧样本 0 | 换浏览器（不支持 webp）观察 |
| 10 | `width=384` 是图宽还是容器宽 | 与 `pts` 量级吻合 | 换分辨率 / 挑战图尺寸观察 |
| 11 | 服务端实际校验哪些字段、阈值多少 | **完全未知**（纪律不允许发请求） | 唯一办法：授权后用最小改动矩阵重放 |
| 12 | 生成轨迹的 `pts` 是否该换成真实样本那套坐标 | 默认沿用 `xys` 坐标（与样本不符） | 拿到 §6.4 的多点样本后再定 |
| 13 | `ks` 是否随 `bcv` 变化 | 旧文档建议"版本变了就重抽" | 换 `bcv` 后标定对比前 64 字节 |

## 7. 文件与用法

```
src/cap_verify_builder.js        组装器（buildVerify / makeTrack / makeC / ksFromKnownPair / CLI --demo）
scripts/test_verify_builder.js   逐字对拍 + 回归（91 条断言）
docs/verify_builder_report.md    本文件
```

```js
const { buildVerify, makeTrack, makeC } = require('./src/cap_verify_builder');

// ① 有 ks：同步返回
const { d, sign } = buildVerify({ sessionID, track, dataField, ks });

// ② 只有 sk：返回 Promise，内部 calibrateCaptchaKs 现标（同 sk 只标一次，之后走缓存）
const body = await buildVerify({
  sessionID,
  track: { sx: 260, sy: 640, ex: 392, ey: 254 },   // 只给两点 → 内部 makeTrack
  dataField,                                       // 字符串！
  sk, dwsm,
  c: makeC({ bcv: '1.3.1.20260331', rest: 210, vrest: 0, vreqt: 0, sqt: 42000, ojst: 12 }),
});
```

`makeTrack({sx,sy,ex,ey, scale?, jitter?, seed?, pts?, pc?, pn?, trace?, now?})`：

- 默认（不传 `scale`/`jitter`）= `genTrackFromTemplate()` 的原样输出（测试里逐字符对比过）
- 时长随位移自动缩放（0.45–1.6 倍），`scale` 可再乘一层
- `jitter` **默认 0 = 关闭**（模板本身已含真人噪声）；开 `jitter` 时可配 `seed` 复现
- `pts/pc/pn/trace` 传了就原样用（用于塞入真实样本的坐标系写法）
