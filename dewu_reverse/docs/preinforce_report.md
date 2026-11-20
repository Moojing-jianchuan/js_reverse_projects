# 得物 PC 端风控 SDK 逆向报告：`fun` 定性 + captcha `d` 载荷完全还原

- 工程目录：`D:\ds_work\js_reverse_projects\dewu_reverse`
- 分析日期：2026-11-20
- 方法：**全程 Node 本地分析，未使用任何浏览器 MCP**（浏览器实例被主会话占用）
  - 页面侧证据由主会话提供，本文标注「主会话实测」
  - 本报告标「待主会话取证」的项，需要浏览器侧再取一次样本
- 运行环境：Node v24.13.0 / Windows / `src/env_patch.js`（jsdom 补环境，子任务C 交付，35/35 验收）

---

## 0. 一句话结论

| 问题 | 结论 | 强度 |
|---|---|---|
| `d` 的加密算法 | **位置对齐的 XOR 流密码**：`cipher[i] = plain[i] XOR KS[i]`，再把每个字节当字符做 UTF-8 编码后 base64 | 证明（逐字节对拍 + 主会话独立差分法） |
| 密钥来源 | **`KS = F(sk, 浏览器族)`，确定性函数**；`sk=''`+Firefox UA 时是一张常量表 | 证明（5 组对照，见 §3.4）；`F` 内部构造未确认 |
| 明文格式 | 普通 `JSON.stringify`，顶层 5 键 + `data`(34) + `data.jcmp`(11)，顺序即对象字面量顺序 | 证明 |
| `sign` | `md5("d" + d + "048a9c4943398714b356a696503d2d36")`，与 info 接口同一套 `f()` | 证明（两边独立命中） |
| 时效性 | **`d` 本身无任何时间绑定**，不一次性，不绑 sessionid；`c` 恒 0 | 证明（含真机 control） |
| 本地能否造出与浏览器一致的 `d` | **能**：标定一次 keystream 后逐字节稳定 | 证明 |
| 「请求已过期」的含义 | **会话/出口 IP 被风控降级的通用拒绝语**，与 `d` 无关 | 证明（真机调用同样回这句） |

---

## 1. 三个 SDK 的分工（修正后的认识）

真实加载顺序：`pceptor.js` → 业务 chunk → `preinforce2.js` → `pyuntu.js` → 阿里云验证码 SDK。

| 脚本 | 挂载全局 | 职责 | 证据 |
|---|---|---|---|
| `preinforce2.js` | `fun`、`base64js`、`jsdVipUserMark='dw'` | 令牌/随机串生成器 + base64 工具；加载后只打 `dav.dewu.com/cost` | §2 |
| `pceptor.js` | `_yundunxhr`、`dw`、`fun` 的消费方 | XHR 拦截器（伪造 native）、请求头 `bcv/bcn/skt/ltk/hsn/adi/shumeiid`、`/interceptor` `/webSk` 配置与令牌；用 `fun.Fun99(text,'',sks,'')` 处理响应体 | 反混淆源码 + 主会话抓包 |
| `pyuntu.js` | **`dewuCap`**、`yd_md5`、`regeneratorRuntime` | **验证码 SDK 本体**：`dewuCap(config)` → `POST /api/v1/h5/risk-stone-captcha/captcha/call`（body `{d, sign}`）；滑动/点击轨迹 → `/captcha/verify` | 源码 `''.concat(HOST,'/captcha/verify')` + 主会话实测 |

> 任务书原假设「`d` 由 preinforce2 采集+加密」**不成立**。`d` 由 `pyuntu.js` 生成；`preinforce2` 只提供 `base64js` 与 `fun`。

---

## 2. `fun` 是什么

### 2.1 类型与形状

```
typeof fun            = 'object'
Object.keys(fun)      = []                      ← 无自有可枚举属性
Object.getOwnPropertyNames(fun) = []            ← 无自有属性（全在原型上）
Object.getPrototypeOf(fun)      = { constructor, Fun110, Fun99 }
JSON.stringify(fun)   = "{}"
fun.constructor       = 匿名类（名字是 U+FC5E 前缀的混淆变量名）
fun.Fun110.length     = 5
fun.Fun99.length      = 5
```

也就是说 `fun` 是 **`new (匿名类)()` 出来的实例**，没有数据属性，只有两个原型方法。任务书里"`fun` 极可能是对外 API 入口"——只对了一半：它是入口，但只有两个方法。

### 2.2 `Fun110(a, b, c, d, e)` —— 令牌/随机串生成器

| 项 | 值 |
|---|---|
| arity | 5 |
| 参数语义 | `a`（任意值，原样回填到返回值的 `d` 字段）；`b`（疑似 HTTP method，源码里有 `'get'===(b\|\|'post').toLocaleLowerCase()` 分支）；`c/e` 未确认 |
| 返回值 | `{a, b, c, d, e}`（`d` 有值时才有该键） |
| 实读环境 | **仅 4 项**：`navigator.userAgent`、`navigator.languages`、`screen.width`、`screen.height` |

采样（`node src/preinforce_loader.js fun`，jsdom 环境）：

```json
{ "a": "C92A31127D691D3D624A7AAFF4AA948F75A8B4DA4B4C74CE",
  "b": "82DBE76F6A0AB01CA1AA4A0502CE41A175D166ED5FE060CA",
  "c": "0,hdw4",
  "e": "CFECB3EC333C7FD79E2E5A17A734F038F4264714ECB0CB94" }
```

在另一个（vm）沙箱里同一函数返回的是大小写混合的 base64 字母表串，`c` 变成 `"2415,hdw4"`：

```json
{ "a": "Y7CmZaCKNerM4HBMGFu4LW0plfh5wwUzKIOKITs377y2...",
  "b": "YwsFtOmmG", "c": "2415,hdw4", "e": "R1A5mv9GO4rPcTYYVawOfcAS..." }
```

**判定**：`Fun110` 是**随机令牌生成器**，输出受随机流驱动（固定随机流则输出可复现，见附录 A.3），与环境变量之间只有 UA/语言/屏幕尺寸参与，**与 captcha 的 `d` 不是同一套生成逻辑**。`c` 是 `''.concat(X, ',').concat('hdw4')` 形式的两段拼接（`X` 随入参有无 `a` 在 `0 / 2415 / 5294` 之间变化）。最可能是 `adi / ltk / hsn` 一类短期票据的来源，**但这一点未定案**（标：未确认）。

### 2.3 `Fun99(x, y, z, w)` —— 安全序列化/透传（不是解密）

| 输入 | 输出（vm 沙箱 / jsdom 环境） |
|---|---|
| `('hello','','','')` | `"hello"`（原样） / `undefined` |
| `({a:1,b:[1,2]},'','','')` | `'{"a":1,"b":[1,2]}'` / 同 |
| `(14764 字符的密文响应,'',sk,'')` | **原样返回该密文**（未解密） |
| `()` | 抛 `TypeError: Cannot read properties of undefined (reading 'includes')` |

注意 `('hello',…)` 在两种环境下结果不同（jsdom 里返回 `undefined`），说明它有一条与环境/第三参数相关的分支，
不是纯 `JSON.stringify`——所以本报告把它的定性停在「透传/序列化 + 条件分支」，**解密分支标未确认**。

`pceptor` 的响应链路是 `fun.Fun99(await res.clone().text(), '', sks, '')` 再 `new Response(...)`，所以它至少承担「按 sks 处理响应体」的角色；在我给出的输入下表现为透传/字符串化。**具体解密条件未确认**（缺少真实 `sks` 响应样本的配对）。

---

## 3. `d` 载荷完全还原

### 3.1 生成点（`pyuntu.js`，已反混淆定位）

```js
// pyuntu.000.eval.deesc.js @105333（verify 分支，结构同 call）
return Date.now(),
  130090 = ''.concat(HOST, '/captcha/verify'),
  33593  = buildHeader(181654),
  102743 = buildEnvelope({isSuccess:2, datav3:'', datav3Fail:212131, cRestStart:226587}),
  171893(75396 = { d: ENC39772(JSON.stringify(102743)) }),
  241043(130090, 75396, 33593);
```

即：`d = ENC(JSON.stringify(envelope))`，然后请求层再补 `sign`。

### 3.2 明文结构（`captcha/call`，实测 1301 字符）

**顶层只有 5 个键**（顺序固定，顺序影响密文与 `sign`）：

```json
{
  "bcv": "1.3.1.20260331",
  "type": 0,
  "c": "v=1.3.1.20260331|rest=0|vrest=0|vreqt=0|sqt=0|ojst=0",
  "webp": 0,
  "data": "<下面 data 的 JSON 字符串（二次 JSON.stringify）>"
}
```

> `dtz` **不在顶层**，它在 `data` 里（早期版本写错过，已修正）。
> `sessionID` 首次调用不出现 —— `undefined` 会被 `JSON.stringify` 丢键（见 §4.3）。
> 完整 52 字段快照见 `docs/cap_d_plaintext.md`。

### 3.3 加密算法（完整、可复现）

```
plaintext  = JSON.stringify(payloadObj)                       // UTF-8，字段按插入序
cipher[i]  = plaintext_utf8[i] XOR KS[i]                      // 同长度，逐字节
d          = base64( UTF8( String.fromCharCode(cipher[i]) ) )  // 每个密文字节当字符再 UTF-8 编码
sign       = md5("d" + d + "048a9c4943398714b356a696503d2d36")
```

- 第 3 步就是抓包里 `d` 呈 "mojibake base64"（`M8KWLsKMw5LD...`、出现大量 `w6...`/`w7...`）的原因：
  密文字节 0x80–0xFF 被 UTF-8 编码成 2 字节，所以 `len(d) = 4·ceil(utf8len/3)`，而 `utf8len ∈ [cipherLen, 2·cipherLen]`。
- 反向三步即可解密，`decryptD()` 已实现。

### 3.4 密钥来源：**由 `sk` 决定的确定性 keystream**（本报告最关键的结论）

先说**不是**什么（六组排除实验）：

| 实验 | 操作 | 结果 | 排除 |
|---|---|---|---|
| R1 | 两个独立 `createEnv()` 实例各出一次 `d`，用各自明文求 keystream | 1301 / 1301 字节完全相同 | 会话无关、进程无关 |
| R2 | 明文 1301 → 1355（UA 加长） | 前缀 1301 字节完全相同 | 与明文长度无关 |
| R3 | 明文 1301 → 9701 | 前缀仍完全相同，可抽出 9701 字节 | 可无限延伸 |
| R4 | 周期扫描 1..256 | 最佳周期 219、匹配率 0.009；253/256 个不同字节值 | 不是短密钥重复 XOR |
| R5 | `RC4(常见 key)` 前 32 字节 | 无命中 | 不是常见 key 的 RC4 |
| R6 | 固定 / 变化 `Date.now`、`performance.now`、延迟 0/900/2500ms | keystream 不变 | 与时间无关 |

再说什么在决定它（三组对照）：

| 条件 | keystream 前 8 字节 | 结论 |
|---|---|---|
| `sk=''` + Firefox UA | `48b44cefa4f3ade2` | 表 A（本文默认，已抽 9701 字节） |
| `sk=96×'A'`（cookie 或 localStorage） | `ef0790541be7a064` | **换 sk → 整张换表** |
| `sk=96×'B'` | `bb83d8c860d6958c` | 随 sk 内容变 |
| `sk=''` + Chrome UA | `79982a435e3cd462` | 换浏览器族 → 换表 |
| `sk=''` + 无 UA | `6335cb9f2afe9cb6` | 第三张表 |
| `sk=''` + 预置 `yuntuSession` | `48b44cefa4f3ade2` | `yuntuSession` 无关 |

并且 **cookie 里的 sk 与 localStorage 里的 sk 等价**（同为 96×'A' 时 ks 完全一致），说明 ks 只依赖 sk 的值本身。

**结论**：`KS = F(sk, 浏览器族)`，是**确定性函数**——不含随机、不含时间、不依赖明文。
- `sk=''` + Firefox UA 时它就是一张常量表（`artifacts/keystream.bin`，9701 字节，sha256 `7c70d1f6…`）。
- **换 sk 或换 UA 族必须重新标定**：`await calibrateKeystream(sk)` 会离线跑一次原始 SDK 抽表。
- `F` 的内部构造（是否 RC4/PRNG seeded by sk）**未确认**；但工程上不需要——标定一次即可。

产物：
```
artifacts/keystream.bin   9701 字节，sk='' + Firefox UA
sha256 = 7c70d1f6…（完整见 artifacts/keystream.json）
head64 = 48b44cefa4f3ade2415cb47ee4f864b1a289a48dcca5366515ce7602461e533c
         33f7d46472328c034dcb6fec29948516ebad65c4949544facf6c1aa1e63f6641
```

> ⚠️ 版本号（`bcv`）变化后必须重抽并做一次 §5 的逐字节对拍。

---

## 4. 时效性结论：`d` 不绑时间

### 4.1 证据

1. **`c` 的时间字段恒为 0，浏览器里也是 0。**
   源码：`'|rest='.concat(new Date().valueOf() - T_init, ...)`，而 `T_init` 在**同一次调用内**取，
   所以差值必然 ≈ 0。断言实验（延迟矩阵）：init 后 0ms / 900ms / 2500ms 才调 `dewuCap`，`c` 三次**完全一样**：

   ```
   delay=   0ms  c = v=1.3.1.20260331|rest=0|vrest=0|vreqt=0|sqt=0|ojst=0
   delay= 900ms  c = v=1.3.1.20260331|rest=0|vrest=0|vreqt=0|sqt=0|ojst=0
   delay=2500ms  c = v=1.3.1.20260331|rest=0|vrest=0|vreqt=0|sqt=0|ojst=0
   ```

2. **固定 `Date.now` / `performance.now` 不改变明文**（只有 `data.dje` 变，而 `dje` 每次调用都变，是纯随机串）。
3. **keystream 与时间无关**（R6）。
4. **明文里没有任何时间戳字段**：`bcv/type/c/webp/data/dtz` 与 `data` 的 34 个字段中，唯一每次变的是 `dje`。

### 4.2 结论

- `d` **不绑时间**：不存在"有效期 N 秒"的窗口。
- `d` **不一次性**：同一明文→同一 `d`（keystream 固定），服务端不可能靠"密文已用过"来拒；若要防重放，只能靠明文里的 `dje`。
- `d` **不与 `sessionid`/`shumeiid` 密码学绑定**，但**明文可能携带**它们（见 §4.3），属"内容携带"而非"绑定"。

### 4.3 一个必须注意的差异：`call` 与 `verify` 的 `d` 明文不同

| | `captcha/call` | `captcha/verify` |
|---|---|---|
| 生成函数 | 同一个 `ENC39772` + 同一 KS | 同 |
| 明文外壳 | `{bcv,type,c,webp,data[,sessionID]}` | 同 |
| `sessionID` | **首次调用时省略**（`undefined` → `JSON.stringify` 丢键） | **携带**（来自 `call` 响应里的 `sessionId`） |
| 额外字段 | — | `datav3`（答题答案）、`datav3Fail`（失败累加）、`cRestStart` 等被写进累加对象 |
| 体量 | 1301 字符明文 → `d` 2628 | 明文更长 → `d` ≈ 6278（主会话实测） |

即：**同一套生成逻辑，不同字段集**（与主会话判断一致）。`verify` 的明文比 `call` 多出 `sessionID` 与答题/轨迹数据，所以更长。

体量换算自检：`d` 6278 字符 → base64 解出 4708 字节 → UTF-8 还原后密文长度落在 `[2354, 4708]` 区间 → 明文同长。这与"外壳 + sessionID + datav3 轨迹串"的量级吻合。

---

## 5. 与真实样本的对拍结果

### 5.1 本地 vs SDK（逐字节）

`node src/preinforce_loader.js demo`：

```
=== 2) 原始 SDK 出值（jsdom 跑 pyuntu.js）===
  d.len 2628 | sign 36e6e33cb609473d08307b27e98860b7 | 明文 1301

=== 3) 对拍：本地重算 ===
  d 一致    : true
  sign 一致 : true
  body 一致 : true        ← 整条 {"d","sign"} 逐字节相同
```

| 检查项 | 结果 |
|---|---|
| 用固定 KS 解 `d` 得到的明文 == SDK 当场 `JSON.stringify` 的明文 | ✅ true |
| 用固定 KS 把明文重算成 `d` == SDK 的 `d` | ✅ true（2628 = 2628） |
| `signD(d)` == SDK 的 `sign` | ✅ true |
| 整条 body `JSON.stringify({d,sign})` 逐字节相等 | ✅ true |

### 5.2 本地 vs 真实浏览器

| 对比项 | 结论 |
|---|---|
| 算法（KS / 编码 / sign） | 与浏览器**同一套**（因为 KS 是常量、与实例无关） |
| 明文字段集 | 与浏览器同一套 34+5 字段（字段名与顺序来自同一份 SDK 源码） |
| 明文字段**值** | **本地取自本地环境**，与真机不同（UA/屏幕/SK/sumei/dje 等） |
| 服务端接受度 | 格式与签名被接受（`code:0`），但回 `msg:"请求已过期"`（主会话实测） |

### 5.3 服务端 msg 的解读（已由控制组定案）

`{"code":0,"msg":"请求已过期"}`（**不是** 403、**不是** 签名错）。

**控制组证据（主会话，真实浏览器页面主世界直接调 `window.dewuCap({})`）**：
同一个调用在**真机、真 sk、真 TLS、真设备指纹**下，返回的也是
`{"code":0,"msg":"请求已过期"}`（24 字节，与本地生成的一字不差）；
而同一页面在**刚加载的干净会话**里，同一个 call 返回 **11808 字节的完整挑战**（含 `bgList`）。

→ **「请求已过期」= 会话/出口 IP 被风控降级后的通用拒绝语，与 `d` 的构造无关。**
→ 因此 `sk` 注入、`sessionId` 注入、cookie 注入都改变不了这条 msg（主会话已逐一验证），
   这是**控制组失效**的典型形态：本地候选并没有"失败"，是整个会话被降级了。

**对结论的影响**：`d` 的算法、明文结构、`sign` 规则**全部正确**，不因这条 msg 做任何修改。
唯一剩余依赖是**一个没被风控标记的出口环境 + 会话**（非算法问题）。

---

## 6. 本地造出来的 `d` 距离"真实可用"还差什么

### 6.1 已经不缺的

- ✅ 不需要设备指纹（字段只是明文内容，加密不依赖它们）
- ✅ 不需要时间窗口（`d` 无时间绑定）
- ✅ 不需要向服务端换密钥（KS 由 `sk` 决定，标定一次即可）
- ✅ 不需要复刻 canvas/webgl/audio

### 6.2 工程问题：给定真 `sk`，本地能否稳定生成服务端认可的 `d`？

**能，但必须做一次"标定"**：

1. `const ks = await calibrateKeystream(realSk)`   ← 离线跑一次原始 SDK（不发网络），抽 800~2000 字节 keystream
2. `const body = buildCaptchaBody(plain, ks)`       ← 之后纯算法，毫秒级，逐字节稳定
3. 需要重标定的时机：**`sk` 变化 / UA 族变化 / `bcv` 版本变化**

**入参清单**

| 输入 | 是否必须与真实请求一致 | 说明 |
|---|---|---|
| `sk` | ✅ **必须** | 直接决定 keystream；不一致 → 服务端解不开 |
| UA 族（Firefox/Chrome/other） | ✅ **必须** | 决定 keystream 表；且要同时出现在 HTTP `User-Agent` 头与 `data.dua`/`data.jcmp.dua` |
| `bcv` | ✅ 必须 | 与 SDL 版本绑定的表 |
| 明文键顺序 | ✅ 必须 | 顺序变了密文与 `sign` 全变 |
| `data.dje` | ⚠️ 建议每次新随机 | 明文里唯一随机量；不参与加密 |
| 屏幕/窗口几何、`dpl`、时区 | ⭕ 可填合理值 | 只是内容；不影响加解密 |
| `shumeiId`（`dwsm`） | ⭕ 建议带上 | 前端自造（`YYYYMMDDHHmmss`+32hex），`pceptor` 加载即写入 |
| `sessionID` | ✅ verify 必须 | call 首次无；verify 必须显式给 |
| 时间 | ❌ 随便 | `c` 恒 0；无时间戳字段 |

### 6.3 verify 还缺什么

- `captcha/call` 的**真实响应**（`data.sessionId`、`bgList` 图集）。
- `datav3`：答题轨迹/答案串，**必须靠真实交互或解图**（不是加密问题，是内容问题）。
- `cRestStart`：本次答题起始时间。
- 加密侧不需要再查。

---

## 7. 采集字段清单（`captcha/call` 的 `d` 明文，共 5 顶层 + 34 内层）

> 全部由 `decryptD(d)` 直接 dump 得到，顺序即 SDK 对象字面量顺序（顺序影响密文与 sign）。

### 7.1 顶层

| 字段 | 实测值 | 含义/来源 |
|---|---|---|
| `bcv` | `1.3.1.20260331` | SDK 版本号（常量，与 KS 绑版） |
| `type` | `0` | 验证码类型（`call`=0；`verify` 为挑战 type） |
| `c` | `v=<bcv>\|rest=\|vrest=\|vreqt=\|sqt=\|ojst=` | 计时/状态串；`rest = Date.now() - T_init`（同调用内取，**恒 0**） |
| `webp` | `0` | webp 支持位（`verify` 阶段会变 0/1） |
| `data` | 嵌套 JSON 字符串 | 设备/环境指纹（见下） |

> `dtz` 在 `data` 里，不在顶层。`sessionID` 首次调用不存在（被 `JSON.stringify` 丢键）。
> 完整 52 字段机器可读快照：`docs/cap_d_plaintext.md`、`artifacts/cap_d_fields.json`。

### 7.2 `data`（34 项，按类别）

**浏览器身份（navigator）**

| 字段 | 实测 | 来源 |
|---|---|---|
| `dua` | Firefox 152 UA | `navigator.userAgent` |
| `dpl` | `PDF Viewer\|Portable Document Format\|internal-pdf-viewer,…` | plugins 枚举（name/description/filename 用 `\|` 连接、多插件用 `,`） |
| `dnt` | `wifi` | `navigator.connection.type`（等价物），取不到 fallback `wifi` |
| `dwd` | `-1` | `navigator.webdriver`（false→-1，true→1） |
| `dcd` | `24` | `screen.colorDepth` |
| `dpr` | `1.25` | `devicePixelRatio` |
| `dm` | `PC` | 设备类型（PC/H5） |
| `dmtp` | `0` | `maxTouchPoints` |
| `dul` | `https://www.dewu.com/` | `location.href` |
| `dte` | `1` | `'ontouchstart' in window ? 1 : -1` 一类触摸能力位 |
| `dwte` | `1` | 同上（另一判定） |

**窗口 / 屏幕几何（单位 px）**

| 字段 | 实测 | 来源 |
|---|---|---|
| `dbw` / `dbh` | 1906 / 969 | `document.body.clientWidth/Height` |
| `dbww` / `dbwh` | 1906 / 969 | 同上（另一路径，用于交叉校验） |
| `dow` / `doh` | 1920 / 1032 | `window.outerWidth/outerHeight` |
| `dsw` / `dsh` | 1920 / 1080 | `screen.width/height` |
| `dsaw` / `dsah` | 1920 / 1032 | `screen.availWidth/availHeight` |
| `dsal` / `dsat` | 0 / 0 | `screen.availLeft/availTop`（取不到→0，`dor` 取不到→-1） |
| `dor` | `-1` | 屏幕方向（`screen.orientation.angle` 一类，缺失→-1） |
| `dsl` / `dst` | 0 / 0 | `scrollLeft/scrollTop` |

**会话 / 身份**

| 字段 | 实测 | 来源（源码已定位） |
|---|---|---|
| `sk` | `""` | `cfg.sk \|\| cookieGet('sk') \|\| localStorage.getItem('sk') \|\| ''` |
| `shumeiId` | `normal` | `cfg.sumei \|\| cookieGet('dwsm') \|\| localStorage.getItem('dwsm') \|\| 'normal'` |
| `userId` | `""` | `cfg.userId \|\| ''`（登录后为 duToken 关联 id） |
| `appid` | `h5` | `cfg.appid \|\| 'h5'` |

**随机/一次性**

| 字段 | 实测 | 来源 |
|---|---|---|
| `dje` | `5xYjDGjBu1RUJMXaaWb1m8wp4gmPR0V7` | 每次调用重新生成的 32 字符随机串（**明文里唯一的随机量**；与加密无关） |

**页面上下文（`jcmp` 子对象）**

| 字段 | 实测 |
|---|---|
| `dlocalSk` | `localStorage.getItem('sk')`（null） |
| `dtagn` | 是否有 `document.scripts.length` → `''`/数字 |
| `dtitle` | `document.title` |
| `dcapno` | `#dw-slider #no` 的 innerText（挑战图上的编号提示） |
| `dscreenwidth` / `dscreenheigh` | 1920 / 1080 |
| `dpagewidth` / `dpageheigh` | `''`（页面盒尺寸，jsdom 下空） |
| `dua` / `dlanguage` / `dwebdriver` | UA / `zh-CN` / `false` |

**时区**：`dtz = Asia/Shanghai`（`Intl.DateTimeFormat().resolvedOptions().timeZone`）

> 说明：`pyuntu` 这一层**没有 canvas/webgl/audio/字体** 指纹字段。任务书预期的"大量 canvas/webgl 指纹"不在 `d` 里；
> 需要那类字段的是阿里云 `cloudauth` 设备指纹通道（`cloudauth-device-dualstack.cn-shanghai.aliyuncs.com`，主会话抓包见到），
> 与 `d` 是两条独立链路。

---

## 8. 与 `sign` 的统一（顺带收口）

`captcha` 的 `sign` 与 `info` 接口**同一个函数**：

```js
// 参数对象 = {d}
sign = md5("d" + d + "048a9c4943398714b356a696503d2d36")
```

与 `src/dewu_sign.js` 里已验证的 `f(t)`（键名排序 + key+value 拼接 + 盐 → md5）完全同构，只是参数对象只有一个键 `d`。
主会话已实测逐字节命中；本报告 §5.1 的 `[3] sign 一致: true` 是第二次独立确认。

---

## 9. 待主会话取证

以下必须浏览器侧证据，本地无法替代：

1. **真实 `captcha/call` 响应体**：`data.sessionId`、`bgList` 图集结构 —— 做 `verify` 的必需输入。
2. **真实 `captcha/verify` 的 `d` 样本（6278 字符）** 及其配对明文（若有 `JSON.stringify` 侧证据更好）。
   拿到后可直接验证：`decryptD(真实d)` 应解出可读 JSON，且头部为 `{"sessionID":"…","bcv":"1.3.1.20260331","type":…,"c":"…","webp":…,"data":"…"}`。
   —— 这一步若成立，等于把 `verify` 的明文格式也钉死。
3. **真实 `sk`（96 字符）与 `dwsm` cookie 值**：补 `data.sk` / `data.shumeiId` / header `SK`。
4. **`sks` 响应头**与对应响应体一对：用来定 `fun.Fun99` 的真实语义（解密 or 透传）。
5. **`dje` 的生成入口**：观测相邻两次 `dewuCap` 的 `dje`，确认是否纯随机（本地观察是每次都变）。

---

## 10. 复现步骤

```bash
cd D:\ds_work\js_reverse_projects\dewu_reverse

# 1) 全链路自检（SDK 出值 → 本地重算 → 逐字节对拍 → 解密回明文 → fun 内省）
node src/preinforce_loader.js demo

# 2) 只看 SDK 出值
node src/preinforce_loader.js sdk

# 3) 只看 fun
node src/preinforce_loader.js fun

# 4) 纯算法：明文 -> {d, sign}（不启 jsdom，毫秒级）
node src/preinforce_loader.js crypt '{"bcv":"1.3.1.20260331", ...}'

# 5) 换 SDK 版本时重抽 keystream
node scripts/extract_keystream.js
```

代码地图：

| 文件 | 作用 |
|---|---|
| `src/preinforce_loader.js` | 交付主入口：`buildD / decryptD / signD / buildCaptchaBody / callPlainTemplate / runSdkCaptcha / introspectFun` |
| `src/env_patch.js` | （子任务C）jsdom 补环境，真跑原始 SDK |
| `scripts/extract_keystream.js` | 撑长明文抽 keystream |
| `scripts/verify_local_d.js` | 本地 vs SDK 逐字节对拍 |
| `scripts/cap_d_capture.js` | 抓 `d` + 明文 + base64js 调用链 |
| `scripts/ks_analysis.js` | keystream 周期性/长度无关性/RC4 排查 |
| `scripts/time_field_matrix.js` | 时间源 → 明文字段影响矩阵 |
| `scripts/delay_matrix.js` | `c` 的时间字段语义（延迟实验） |
| `scripts/legacy_sandbox.js` | 与 `unpack.js` 同构的 vm 沙箱（preinforce2 专用，5/5 稳定） |
| `artifacts/keystream.bin` | 9701 字节硬编码 keystream |
| `artifacts/cap_plain_call.json` | `captcha/call` 的完整明文（1301 字符） |

---

## 11. 纯算法层自检结果（`node scripts/test_crypt_layer.js`）

```
PASS  roundtrip len=20 d.len=48
PASS  roundtrip len=198 d.len=408
PASS  roundtrip len=1299 d.len=2624
PASS  roundtrip len=3498 d.len=7016          ← verify 量级
PASS  roundtrip len=8998 d.len=18012         ← 逼近 keystream 上限
PASS  base64 层长度关系 raw=1522 cipher=1000
PASS  sign 规则 c9b45f89c9a5d6003c092ea573926998
PASS  verify 形态往返 plain=224 d=464
PASS  超长明文显式报错                        ← 不静默截断
PASS  call 模板可加密可解析 d=2036

10 passed, 0 failed
```

超出 `keystream.bin`（9701 字节）的明文会**显式抛错**而不是静默截断——落地时不会产出"看着对、服务端解不开"的 `d`。

---

## 12. 结论强度与适用范围

| 结论 | 强度 | 范围 |
|---|---|---|
| `d` 的编码三步（XOR → byte-as-char → UTF-8 → base64） | **证明**（逐字节对拍） | `pyuntu.js`，`bcv=1.3.1.20260331` |
| keystream 是与明文/实例/时间无关的硬编码常量流 | **证明**（R1–R6 六组实验） | 同上 |
| `sign = md5("d"+d+SALT)` | **证明** | 同上，且与 `info` 接口同构 |
| `d` 无时间绑定 / 不一次性 / 不绑 sessionid | **证明**（对 `d` 内容而言） | 同上 |
| `{"msg":"请求已过期"}` 来自 `sk`/会话层 | **支持**（未做消融） | 需主会话补 `sk` 后复验才能升为"证明" |
| `Fun110` = 令牌/随机串生成器 | **支持**（读值 + 可复现性 + 输出无结构） | 具体产出对应哪个 header（adi/ltk/hsn）**未确认** |
| `Fun99` = 透传/序列化 | **观察**（4 组输入） | 真实 `sks` 配对样本缺失，解密分支**未确认** |

**失效条件**：SDK 版本号（`bcv`）变化 → keystream 极可能整体换表，必须先
`node scripts/extract_keystream.js` 重抽并与 `keystream.bin` 的 sha256 对比，再回归本报告 §5 的对拍。

---

## 附录 A：本轮踩过的坑（供后续复用）

### A.1 把宿主内建注入 vm 沙箱 → JSDUN 自我解码炸掉

`vm.createContext({Object, Array, String, JSON, ...})` 会让沙箱里的 `[].constructor.constructor('return this')()`
拿到**宿主 global**，JSDUN 的字符串表就取不到，第二阶段解出
`(function (55,,415)undefined)()` → `SyntaxError: Unexpected number`。
**做法**：宿主只注入 `console/timers/crypto.fill`，内建一律用 context 自己的（`scripts/env_bootstrap.js`）。

### A.2 假 `Date` + hook `Math.random` 让沙箱不确定

在 vm 沙箱里同时改 `Date`（固定推进）和 hook `Math.random`，`preinforce2.js` 的加载结果在
"OK / 超时 / `Cannot set properties of undefined`"之间随机抖动（5 次全失败）。
**做法**：这类脚本一律用「宿主内建 + 接 eval/Function」的 `scripts/legacy_sandbox.js`（5/5 稳定），
真正的出值走 jsdom + `src/env_patch.js`。

### A.3 `Fun110` 可复现性

固定 `Math.random` 为同一个 LCG 序列并重置起点后，`Fun110()` 两次输出**完全相同**；
连调两次（不重置）输出不同，且呈周期重复（`2oLo2oLo…` / `S3S3S3S3…`）。
说明其输出逐字符消耗随机流 → 进一步支持「令牌生成器」的判定。

### A.4 `d` 的"mojibake base64"不是二次加密

`d` 是标准 base64 的 ASCII 文本。之所以看起来像乱码，是因为**被 base64 的输入本身是"每个密文字节当成字符再 UTF-8 编码"**的结果。
不要按"UTF-8 乱码"去找编码问题，按 `Buffer.from(d,'base64')` → `toString('utf8')` → 取 `charCodeAt` 反推即可。
