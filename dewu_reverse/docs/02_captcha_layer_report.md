# 得物风控层（captcha）逆向报告 — 第一版

> 采集时间：2026-11-20 11:20 ~ 11:50 · 全部在 Node/jsdom 内完成，不依赖浏览器
> 工具链：`src/env_patch.js`（106 条环境补丁，`scripts/verify_env.js` 35/35 通过）

---

## 1. 分工修正：captcha 归 pyuntu，不归 preinforce2

原始假设（按加载顺序猜）是 preinforce2 管环境采集、pceptor 管发包。实测把分工改成了：

| 模块 | 挂载全局 | 职责（已证实部分） |
|---|---|---|
| `pyuntu.js` | `dewuCap`、`yd_md5`、`base64js`、`regeneratorRuntime` | **captcha 全流程**：`dewuCap()` 一发即打 `captcha/call`；`yd_md5` 就是签名用的 md5 |
| `pceptor.js` | `_yundunxhr`、`fetch`、`base64js`、`dw` | 业务请求的 `{data}` 封装（请求体加密 + 响应解密），伪 native 的 XHR |
| `preinforce2.js` | `fun`、`base64js`、`jsdVipUserMark` | 加载完即打 `dav.dewu.com/cost`；`fun` 仍待定性（降级为次要线索） |

判定证据：一条 `dewuCap({})` 调用，沙箱 netLog 里只出现 `POST .../risk-stone-captcha/captcha/call`。

## 2. `sign` 已完全收口（与 info 同一套算法）

`dewuCap({})` 产出的 call 载荷：

```json
{"d":"<2628 字符>","sign":"3ee76f081554752512c64f3dffc5c2c7"}
```

穷举对拍结果（`scripts/analyze_cap_call.js`）：

| 候选 | 值 | 命中 |
|---|---|---|
| `md5("d" + d + SALT)` | `3ee76f081554752512c64f3dffc5c2c7` | ✅ |
| `md5(d)` | `eceff391...` | |
| `md5(d + SALT)` | `ac893790...` | |
| `md5(SALT + d)` | `328d35c2...` | |
| `md5(bytesLatin1)` | `902a8660...` | |

`SALT = 048a9c4943398714b356a696503d2d36`，与 info 用的**完全同一个盐、同一个 `f(t)` 算法**（`f({d})` = 键名排序拼接 `"d"+d` 再追加盐）。

顺带验证 `yd_md5`：`yd_md5("abc") = 900150983cd24fb0d6963f7d28e17f72`，`yd_md5("") = d41d8cd9...`，`yd_md5(得物 info 的拼接串) = 0e5d10fb...` → **它就是标准 MD5**。

## 3. 服务端认可格式与签名，只差时效

把本地生成的 body 用 Node 原生 fetch 真发：

```
POST https://app.dewu.com/api/v1/h5/risk-stone-captcha/captcha/call
headers: Content-Type: application/json
         shumeiId: "normal"  userId: ""  appid: "h5"  bcn: "dewu"
         bcv: "1.3.1.20260331"  platform: "h5"  lang: "zh"  SK: ""
→ HTTP 200  {"code":0,"msg":"请求已过期"}      24 字节
```

关键读法：既不是 403「请求已拒绝」，也不是 401「签名认证失败」，而是**语义明确的过期**。说明 `d` 的结构与 `sign` 都被服务端解析并通过了，唯一失败变量是新鲜度/会话。

## 4. `d` 的形态（已解到密文层）

- b64 文本 2628 字符 → 还原后真实密文 **1301 字节**（仍是 UTF-8/Latin-1 破坏，还原函数在 `scripts/analyze_cap_call.js`）
- 字节熵 **7.854 bits/byte** → 加密数据，无明文残留
- 可读片段扫描：15 个 4 字符以上片段，全部是随机噪声

## 5. 强证据：`sk` / `dwsm` 进了 `d`

用 `createEnv({seedStorage})` 注入不同站点状态，观察 `d` 长度变化（`scripts/seed_matrix.js`）：

| 种子 | `d` 长度 | 服务端 msg |
|---|---|---|
| 基线（无种子） | 2628 | 请求已过期 |
| `sk`（92 字符） | **2936**（+308） | 请求已过期 |
| `sk` + `dwsm` | **3044**（+108） | 请求已过期 |
| `sk` + `dwsm` + `yuntuSession` | 3044 | 请求已过期 |

两条结论：
1. `dewuCap` 确实从站点状态里读取 `sk`、`dwsm` 并打包进 `d` —— 长度增量就是它们被编码后的体积。
2. 但它们**不是** "请求已过期" 的成因（加了也没变）→ 过期判定指向时间维度。

## 6. 当前卡点与下一步

**唯一的黑盒**：`d` 的明文与其中的时间字段。

三条并行路线：
- 路线 1（进行中）：在 env_patch 里 hook 加密原语（`crypto.subtle`、`TextEncoder`、`btoa`、`JSON.stringify`、`String.fromCharCode`、AES S-box 表），把 `d` 加密前的明文捞出来。
- 路线 2（进行中）：用服务端 msg 当 oracle，做时间维度的矩阵（伪造 `Date.now()` ±1h/±1d、连续两次调用比对 `d` 前缀差异位置），定位时间字段偏移。
- 路线 3（兜底）：绕开 captcha —— 之前已证实服务端**同时接受明文 `{sign,...}` 请求体**，若 captcha 无法低成本本地化，则改用「浏览器过一次码 + 本地翻页」。

## 6.5 补充：`d` 已完全破解（明文化）

由子会话 B 完成破解，主会话用**独立差分法**交叉验证通过。

### 6.5.1 算法

```
plaintext = JSON.stringify(payloadObj)        // 对象字面量插入序，1301 字节
cipher[i] = plaintext_utf8[i] XOR KS[i]       // KS = 硬编码常量流
d = base64( UTF8( String.fromCharCode(cipher[i]) ) )   // ← "mojibake base64" 的成因
sign = md5("d" + d + SALT)
```

- `KS`：**硬编码常量表**，与明文/时间/会话无关；已抽 9701 字节 → `artifacts/keystream.bin`
- `d` 长度 2628 字符 / 密文 1301 字节 / 明文 1301 字节（等长，同长度流密码）
- 本地重算与 SDK 输出**逐字节一致**（`node src/preinforce_loader.js demo`）

### 6.5.2 主会话的独立差分验证（不依赖 keystream 假设）

`scripts/diff_d_experiments.js`，同一基线跑三组差分：

| 实验 | 明文改动 | 密文差异 | 结论 |
|---|---|---|---|
| 同 env 同输入跑两次 | 无 | **仅 32 字节**，连续落在 `[571..602]` | 该段就是随机字段 `dje`；**其余部分完全确定性，无时间戳** |
| UA 等长改 1 字符 | 1 字节 | **33 字节** = 上述 32 + 偏移 `178` 那 1 字节 | 内容改 1 字节→密文只改 1 字节且位置对齐：**纯 XOR 流密码、无扩散、无链式** |
| UA 加长 15 字符 | +15 字节 | 长度 1301→**1331**；差异从 `209` 到结尾连续（密度 0.951） | 位置对齐再确认；**+30 而非 +15 → UA 在明文里出现两次** |

### 6.5.3 `d` 的明文结构（1301 字符）

```json
{"bcv":"1.3.1.20260331","type":0,
 "c":"v=1.3.1.20260331|rest=0|vrest=0|vreqt=0|sqt=0|ojst=0","webp":0,
 "data":"{\"yt\":2,\"dua\":\"<UA>\",\"dpl\":\"<插件列表>\",\"dnt\":\"wifi\",\"dje\":\"<32字符随机>\",...}",
 "dtz":"Asia/Shanghai"}
```

- 顶层 5 字段；`data` 是**二次序列化的 JSON 字符串**，内含 34 个字段
- `c` 的时间项（`rest/vrest/vreqt/sqt/ojst`）恒为 0 —— 源码是 `new Date() - T_init`，而 `T_init` 在同一次调用内取得，差值必然 ≈0。**延迟矩阵（0/900/2500ms）验证三次完全一致 → 不是过期原因**
- 唯一每次变化的字段是 `data.dje`（32 字符随机串）

### 6.5.4 由此修正"请求已过期"的归因

`d` 不绑时间、不一次性、不绑 sessionid → **"请求已过期" 不是 `d` 造成的**，只能来自外部会话/身份层（`sk`）。

### 6.5.5 `sk` 取值点（源码定位）

```js
sk       = cfg.sk ?: cookieGet('sk') || localStorage.getItem('sk') || ''
shumeiId = cfg.sumei || cookieGet('dwsm') || localStorage.getItem('dwsm') || 'normal'
data.jcmp.dlocalSk = localStorage.getItem('sk')
// headers: shumeiId / sk / userId
```

### 6.5.6 负结果（记录，避免重复）

用同一份 keystream 去解 `POST https://dav.dewu.com/webSk` 的响应（1440 个 hex 字符 = 720 字节）**解不出可读明文**（`scripts/analyze_websk.js`：offset 0 不可读，0~511 偏移扫描无有效 JSON 头）。
→ `webSk` 响应要么用另一张 keystream，要么不是 XOR 流密码。`sk` 的签发链路交由子会话 A 继续定位。

## 7. 决定性控制组：真机自己调 dewuCap 也被回「请求已过期」

在**真实浏览器**页面主世界里（真 `sk` cookie、真 TLS、真设备指纹、真环境）直接调用站点自己的函数：

```js
typeof window.dewuCap === 'function'      // ✅
window.dewuCap({})                        // 调用成功，异步发出 captcha/call
```

抓到的结果（request id 257）：

```
POST https://app.dewu.com/api/v1/h5/risk-stone-captcha/captcha/call
→ HTTP 200  {"code":0,"msg":"请求已过期"}        ← 24 字节
```

对照组：同一页面在**干净会话初始加载时**（10:19，request id 75），同一个 call 返回 **11808 字节的完整挑战**（含 `bgList` 图集、`type=2`）。

**结论：`请求已过期` 是出口 IP / 会话被风控降级后的通用拒绝语，与 `d` 的构造无关。**

这条控制组把此前的所有怀疑一次性排除：

| 假设 | 排除证据 |
|---|---|
| `d` 构造错误 | 真机生成同样被拒；本地 d 与该 sk 下的 SDK 输出逐字节一致 |
| `sk` 缺失/伪造 | 带真 `sk` + 真 `dwsm` + 真 cookie + 真 `sessionid` 注入，msg 不变 |
| 缺 `sessionID` | 注入真机 `sessionid`（payload +112 字节），msg 不变 |
| 客户端时间戳过期 | 明文无时间字段；`Date.now()` ±1h/−1d 不影响 d；延迟矩阵三次一致 |
| 缺 Cookie | 显式附加 `sk`/`_c_WBKFRo` cookie，msg 不变 |
| 缺 `skt`/`traceparent` 等头 | 真机请求也带这些，但真机此刻同样被拒 |

唯一未排除的变量：**出口环境（IP / 设备信誉）**。

## 8. 收口（本层）

- **到达层级**：`sign` 与 `d` 的**生成**达到 S1/S2 之间的最高位——值本身正确（真机同值、逐字节可复现），被接受与否取决于环境信誉。数据侧（S3）当前不可达，原因是环境被风控，不是算法。
- **当前路线**：R3（补环境运行原始 SDK）已完成；出值不依赖浏览器。
- **适用范围**：`bcv=1.3.1.20260331`，2026-11-20 抓取。
- **结论强度**：`sign` 规则「证明」；`d` 的算法/明文/密钥来源「证明（逐字节 + 差分 + 控制组三重）」；"请求已过期"归因环境「证明（控制组）」。
- **失效条件**：`bcv` 升级导致字段集变化、`sk` 签发策略变化、`ks = f(sk)` 的具体派生函数若被服务端加盐。
- **剩余依赖（外部）**：一个未被风控标记的出口 IP / 新设备会话；以及一枚有效的 `sk`（`dav.dewu.com/webSk` 签发）。
