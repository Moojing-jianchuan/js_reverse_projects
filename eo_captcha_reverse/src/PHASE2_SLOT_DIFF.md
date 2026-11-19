# 第二阶段：明文已解出，开始按槽位对齐（2026-11-19 00:30–01:00）

## 突破口

子任务 `713f851e` 静态提取出 XTEA 密钥并解出明文：

```
算法：XTEA / 32 轮 / ECB / 8B 块 / (v0,v1)=小端 u32 / sum 在两半之间 +=delta
key(A) = [1345597520, 1262969173, 1395147868, 1179739983]
S      = [1907998, 0, 2236942, 0]        ← 有效密钥 EK = key + S
明文   = 3520B 密文 → 3517B JSON + 3B \0（无压缩、无二次编码）
```

明文结构：

```json
{"cd":[ 73 项具体环境值 ], "sd":{ od, mathFingerprint, fpBio, ep, tdc_perf }}
```

`cd` 不是"下标"，是**逐槽的环境值**（时间戳 / 插件列表 / 媒体编解码 / 屏幕串 / 音频指纹 / canvas 哈希 / CSSOM 统计 / 布局 / storage …）。

## 本地也解开了，逐槽 diff（`scripts/e44_cd_diff.mjs`）

用同一把 key 解本地 collect（同一份 `cur_tdc.js` + `scripts/env.mjs`）：

```
local collect 4076 → 明文 3056B → JSON.parse OK
cd 73 槽：47 一致 / 26 不同
```

### 26 个不同槽（浏览器 vs 本地）

| 槽 | 浏览器 | 本地 | 判读 |
|---|---|---|---|
| `cd[1]` | 1794985154 | 1795019342 | 时间戳（正常差异） |
| `cd[3]` | `https://captcha.eo.qq.com\|https://captcha.eo.gtimg.com/static` | `""` | ✅ 已修：`window.name` |
| `cd[5]` | 编解码数组 | 部分不同 | 媒体能力值 |
| `cd[7]` | 页面 URL | **`unknown`** | URL 取值路径不对 |
| `cd[13]` | 0 | 1 | 待定 |
| `cd[19]` | `ac-sampleRate:48000` | `44100` | ✅ 已修：实时 `AudioContext` 与 Offline 分离 |
| `cd[22]` | 767 | 64 | 待定（疑似 CSSOM/计数） |
| `cd[23]` | 2 | 14 | 待定 |
| `cd[24]` | `srgb` | `unknown` | 画布色彩空间 |
| `cd[26]` | dataURL 尾部 | 不同 | canvas 内容（同一 PNG 不同尾部） |
| `cd[28]` | 时间戳 | 时间戳 | 正常差异 |
| `cd[30]` | `1;3615235804` | `0;0` | storage/会话标识 |
| `cd[32]` | `{"sheets":4,"rules":194}` | `{"sheets":0,"rules":0}` | **CSSOM 统计** |
| `cd[36]` | `[[4,140,212.8,…]]` | `[[4,-1,-1,…]]` | 元素布局测量 |
| `cd[39]` | `{"_state":-2}` | `{"_state":-1}` | 某项采集状态 |
| `cd[41]` | 5 | 10002 | 待定 |
| `cd[42]` | `{"_state":0,"quota":10737418240,"usage":16414}` | `{"_state":-1}` | **storage 采集失败** |
| `cd[43]` | `{"_state":0,"canvas":"f1b3…","a…"}` | `{"_state":-2}` | **canvas 指纹采集失败** |
| `cd[45]` | `iframe` | `top` | frame 身份判断 |
| `cd[55]` | `{x:-9999,y:-9999,w:100,h:100,…}` | `{x:0,y:0,w:300,h:40,…}` | 布局测量 |
| `cd[59]` | 0.956 | 0 | 待定 |
| `cd[63]` | 0 | 3 | 待定 |
| `cd[64]` | widget URL + rand | 页面 URL + rand | 同 `cd[7]` |
| `cd[66]` | 0 | 22 | 待定 |
| `cd[68]` | 509009119 | 1470025199 | cookie 值 |
| `cd[69]` | 1794983639 | 1794983867 | cookie 时间 |

## 结论

1. **环境不是"整体不对"，而是 26/73 个槽不对**，其中：
   - 3 项已修（`window.name`、实时 `AudioContext` 采样率、`frameElement`）
   - 4 项是**采集失败**（storage `_state:-1`、canvas `_state:-2`、布局 `-1/-1`、色彩空间 `unknown`）
   - 2 项是**取值路径错**（`cd[7]`/`cd[64]` 的 URL 拿到 `unknown`）
   - 其余是待映射的量（`cd[22]/[23]/[41]/[59]/[63]/[66]`）
2. 这条路通了之后，**再也不需要"猜缺什么"** —— 每修一项就重跑 `e44_cd_diff.mjs`，槽位一致数从 47 往上走。
3. 最终形态和那张截图一致：**明文 = `cd`+`sd` 的固定结构 + 从当前 `tdc.js` 提取的 key 做 XTEA 加密**，
   环境数组由浏览器 Hook 一次提供。

## 进展（23:50 → 01:30）与三条硬结论

### 槽位一致数：47 → 49（每修一项重跑 `e44_cd_diff.mjs`）

| 已修 | 手段 | 结果 |
|---|---|---|
| `cd[3]` | `window.name = "https://captcha.eo.qq.com\|https://captcha.eo.gtimg.com/static"` | 一致 |
| `cd[19]` | 实时 `AudioContext`（48000）与 `OfflineAudioContext`（44100）分开 | 一致 |
| `cd[42]` | `storage.estimate()` 返回 `{quota:10737418240, usage:16414}` + getData 前等 800ms | 一致 |
| `cd[32]` | `document.styleSheets` 造 4 个 sheet / 194 rules | 一致 |

顺带纠正一个我自己的错误：我一度把 `screen` 改成 1920×1080（那是**另一个浏览器实例**的 evaluate 值），
导致一致数掉到 45；以 `collect_plaintext.json` 为准后回退到 2048×1152 才对。

### 归因结果（`scripts/e45_attribute_slots.mjs`，单点变异 → 哪槽变）

```
storage → cd[42]        cssom → cd[32]        url → cd[64]
screen  → cd[9,12,44]   plugins → cd[2,40]
canvas-url / layout / audio → 没有槽跟着变（说明我给的值不是那些槽的真正来源）
```

### 三条硬结论

1. **`cd` 的 73 个槽里，有一批在 Node 沙箱里永远补不出来**：
   `cd[26]`（canvas dataURL 的尾部）、`cd[43]`（canvas 指纹 `_state:-2`）、`cd[36]/[55]`（元素布局 `-1/-1`）、
   `cd[7]`（跨域父页面 URL 得 `unknown`）、`cd[68]/[69]`（cookie 机内值）。这些依赖**真实引擎的绘制/布局/跨域上下文**。
2. 这正好对上你说的做法：**这些值直接 Hook 浏览器一次拿**，不试图在沙箱里伪造。
3. 于是最终形态确定为（三段式）：
   - **明文模板**：`cd` 73 槽 + `sd`，由浏览器 Hook 一次产出（`samples/collect_plaintext.json` 已经是这个模板）
   - **每次重建**：只替换动态槽 —— `cd[1]/[28]`（采集时间）、`cd[7]/[64]`（URL + rand）、`cd[68]/[69]`（cookie）
   - **加密**：从**当前** `tdc.js` 静态提取 key（`tools/tdc_key.mjs`），做 XTEA(32 轮/ECB) 加密

### 下一步（要不要现在做，你定）

A. **纯算闭环验证**：用 `collect_plaintext.json` 的模板 + 当前时间/URL 替换 → `tools/tdc_key.mjs` 的 key 加密 →
   与"同 build 浏览器 collect"逐字节对比（离线，不发请求）。若密文能对上，说明加密实现完全正确。
B. 然后才需要**一次在线 verify**（预算 1，只发一次），看服务端是否接受"重建的 collect"。

## A 已跑通（2026-11-19 01:50，纯离线）

### A1 加解密实现：**逐字节可逆**

```
browser collect (base64 4696) → 3520 B 密文 → 解密 3520 B 明文
re-encrypt → 与原 base64 完全相同：true
```

`A3` 负对照：用**不含 S** 的原始 key 加密 → 对不上 ⇒ 确认 `EK = key + S` 是对的。

### A2 JSON 重建：**失败**，但原因已定位

```
JSON.stringify(parse(x)) = 3464 B   vs 原始 3517 B   （差 53 B）
首个分歧在 byte 1384：
  original: ...,[330,70],0,[],       [[4,140,212.8...
  rebuilt : ...,[330,70],0,[],[[4,140,212.8...
```

原始明文里有 **103 个空格**（不是紧凑 JSON），所以不能靠 `JSON.stringify` 重建。

### A2' 字节模板替换：**成功**（`scripts/e47_rebuild_collect.mjs`）

做法：解密出的 3520 B 明文当模板，**只替换等宽的动态槽**，其余字节一字节不动。

```
template 3520 B
  替换 cd[1]/cd[28] 时间戳（10 位 unix 秒，等宽）
  替换 cd[64] 的 rand（13 位，等宽）
→ 长度不变 3520 B，JSON.parse OK，cd 仍是 73 槽
→ 加密后 base64 长度 4696（与浏览器 collect 完全相同）
→ encrypt→decrypt 往返 identical: true
```

产物：`samples/collect_plaintext_raw.bin`（明文模板）、`samples/rebuilt_collect.txt`（重建的 collect）。

### 结论

**纯算链路已闭环**：`模板 cd/sd` → 等宽替换动态槽 → XTEA(32 轮/ECB, EK=key+S) → base64 collect。
剩下的唯一未知是**服务端是否接受"用旧模板 + 新时间"重建的 collect**，这只能在线验一次。

## B：在线验证（3 次，都 12）与根因定位

授权后发了 3 次 verify（`scripts/e48_online_attempt.mjs`），每次都先 `prehandle` 拿新 sess、下载**当次** `tdc.js`、
用 `tools/tdc_key.mjs` 提取 key、模板替换动态槽、XTEA 加密再提交。

| 次 | 替换内容 | 结果 |
|---|---|---|
| 1 | cd[1]/[28] 时间、cd[64] rand | `12` |
| 2 | + `cd[30] sid`（发现它是 `1;<prehandle sid>`） | `12` |
| 3 | + `cd[36]` 毫秒时间戳、`cd[69]` cookie 时间 | `12` |

### 根因：**key 提取不可靠**，不是模板问题

`scripts/e50_key_selfcheck.mjs` 做了一次决定性自检：**用同一份 `tdc.js` 在 Node 里跑 VM 出 collect，
再用提取的 key 去解它**（自己加密的、必然能解的数据）：

```
tdc.js 244257 chars (TDC_NAME NKibcNUnfmkEiYQKYDUBEOinAnCcXEPW)
local collect 4364
FAIL  tdc_key EK [1918201689,…]   -> not json（乱码）
FAIL  build-A EK [1347505518,…]   -> not json
```

也就是说：`tdc_key.mjs` 对这份 build 给出的 key **连它自己的输出都解不开** ⇒ key 是错的。
对比：build A（`samples/cur_tdc.js`, 264504 字符）的 key 是**验证过**的
（`e46` A1：decrypt→encrypt 逐字节可逆；`e49`：能解开新鲜的浏览器 collect，cd 73 槽全在）。

子任务在报告里也留了这条：*"build B 的 collect 解不出 … 静态 recipe 在 B 上命中 3/4"*。
现在用 VM 自检把这条从"怀疑"变成了"实证"。

### 结论

- 纯算链路（模板 + XTEA）**本身是对的**，卡在**取 key**这一步的通用性。
- 已确证的边界：**key 提取只在 build A 系（264504）上验证通过**；244257/247146 那类 build 的 key 还没搞定。
- 因此不该继续发 verify（每次都是拿错 key 去撞），应先修 key 提取。

### 修 key 提取的正确做法（离线）

1. 把 `e50_key_selfcheck.mjs` 当作 **oracle**：本地跑 VM 出 collect → 用候选 key 解 → 解出 JSON 才算对。
2. 让 `tools/tdc_key.mjs` 输出**候选集**（它已能给出 34 个 S 候选 + 词序排列），逐个过 oracle，
   命中即用。这样"提取"变成了"枚举 + 自证"，不再依赖那套脆弱的静态数据流推断。
3. 如果某类 build 枚举不出来，就退回 R5（浏览器出值）——只要 key 搞不定，纯算就无法自洽。

## C：key 提取问题已解决，但暴露出更大的问题（2026-11-19 02:30–03:15）

### C1 key 提取解决了（子任务 `7c755d13`，已由我复跑验证）

`node tools/tdc_key2.mjs <tdc.js> --selfcheck` 对两份 build 都 **OK**：

```
A  samples/cur_tdc.js     EK = [1347505518, 1262969173, 1397384810, 1179739983]   cd 73
B  samples/online_tdc.js  EK = [1364487746, 1096240964, 1682399563, 1700026214]   cd 72
```

B 的 EK 字节是 ASCII `"BnTQDOwAKaGdfWTe"`（sanity check 通过）。
根因三处：旧工具的 `S` 位置写死成 build A 的 `[s,0,t,0]`，而 B 的盐在 **0、1 位**；静态 charCode recipe 在 B 上跑偏；
oracle 太弱。新方法是「内存 patch dispatcher → 采样寄存器里的 4 元整数数组当 key 候选（真 key 出现 A×59556 / B×61048 次）
→ 反汇编 ARIM 大立即数当盐候选 → 位置全排列 → 用同 build VM 输出做 JSON 自证」。

### C2 但是：**不同 build 的 cd 槽位顺序完全不同**

用 A 的浏览器明文（73 槽）对比 B 的 VM 明文（72 槽），逐槽对比（`scripts/e66_align_ab_slots.mjs`）：

```
A[0]  = ""                        | B[0]  = {"count":0,"items":[]}
A[2]  = 插件名数组                 | B[2]  = 1
A[5]  = 媒体编解码数组             | B[5]  = {x:0,y:0,w:300,h:40,...}
A[16] = "Win32"                   | B[22] = "windows"
A[19] = 音频指纹对象               | B[21] = 1.25
```

**不是"少一个槽"，而是顺序/内容都不同** ⇒ 我们"按 cd[i] 索引替换动态槽"的模板方案**跨 build 不成立**。

### C3 这改变了纯算路线的前提

| 路线 | 前提 | 现在的判断 |
|---|---|---|
| 纯算 + 固定模板 | 模板跨 build 通用 | ❌ 已被 C2 否掉。要纯算就必须**每个 build 配一份该 build 的浏览器真值**，即每次都要浏览器 |
| VM + env 对齐 | VM 自己决定结构，只要采集到的**值**与浏览器一致 | ✅ 结构/key 天然正确，只剩"值"要修 |

### C4 VM 路线的新判断：要修的是"采集异常"，不是"补值"

`e44` 里本地那一侧大量是**失败状态**而不是"值不同"：

```
cd[43] canvas      local {"_state":-2}            ← 采集抛错
cd[42] storage     local {"_state":-1} → 修好后 0  ← 异步没等够
cd[39] 某项        local {"_state":-1}
cd[36]/[55] 布局   local [[4,-1,-1,…]] / 默认值    ← 取不到真实布局
cd[7]  URL         local "unknown"                 ← 取值路径抛错
```

而浏览器的 canvas/readPixels 在这台机器上**本来就是全 0**（`e49` 实测 sum=0、base64 头全 "A"），
说明"值"并不难对齐，**难的是让 VM 的采集函数不抛错、跑完**。

### 下一步（离线）

1. 逐个把 `_state:-2 / -1 / unknown` 修成"成功"：给 `getImageData`/`toDataURL`/`getBoundingClientRect`/`getComputedStyle`
   补上真实形状（我们已经有全 0 的像素与 300×150 的 PNG），并确认异常到底抛在哪（在 env 里加 try/catch 打栈）。
2. 每修一项就重跑 `e44_cd_diff.mjs`，看"一致槽数"和"`_state` 成功数"。
3. 等 `_state` 全绿、剩下的差异只有时间戳/cookie 这类动态值时，再发一次在线。

## D：`_state` 排查进展（03:20–04:00，全部离线）

### 已排除的四条（都有实测）

| 怀疑 | 做法 | 结果 |
|---|---|---|
| 采集函数抛异常 | `scripts/e67_probe_errors.mjs`：包装 `toDataURL / toBlob / getImageData / measureText / fillText / getBoundingClientRect / getParameter / readPixels / storage.estimate / AudioContext 构造` 并捕获 | **0 个异常**：TDC 内部自己 catch 了 |
| 缺 `FileReader / Blob / URL.createObjectURL` | 全部补进 `env.mjs`（readAsDataURL 返回录制 PNG） | `cd[43]` 仍 `{"_state":-2}` |
| 缺 `OffscreenCanvas / createImageBitmap / Image / ImageData` | 一并补上（OffscreenCanvas 含 convertToBlob） | 仍 `-2` |
| 用 `crypto.subtle.digest` 算 canvas hash | `scripts/e68_subtle_probe.mjs` 包装 `subtle.digest` | **0 次调用**：hash 是自实现的 |

一致槽数这轮停在 **49/73**（`cd[43]` 未修好）。

### 结论

`_state:-2` 不是"缺 API"或"抛异常"造成的，而是 **TDC 内部的判定分支**（它自己 catch 后写 -2）。
要修它，必须知道那个分支的条件，只有两条路：

1. **静态定位**：在字节码里找 `-2` 字面量写入点 + 相邻的 canvas 分支条件（可用 `tools/vmp` 的反汇编产物交叉）。
2. **二分屏蔽**：把 canvas 相关能力逐项"假装不支持"（返回 null / undefined），看 `-2` 是否变成 `-1/0`，
   反推它到底依赖哪一个 —— 这条纯本地、可自动化。

明天从 2 开始（快、不需要读字节码），拿到依赖项后再决定是否需要 1。

## E：ip 级追踪（04:10–05:15，全部离线）

### 补了一批 canvas 家族 API（仍未修好 `_state`）

加了 `Blob` / `FileReader`（`readAsDataURL` 返回录制 PNG）/ `URL.createObjectURL` /
`OffscreenCanvas`（含 `convertToBlob`）/ `createImageBitmap` / `Image` / `ImageData`。
一致槽数仍是 **49/73**，`cd[43]` 还是 `{"_state":-2}`。

### 采集调用链已完整（`scripts/e69_canvas_audio_calls.mjs`）

```
2d.fillRect(0,0,100,60)
2d.fillText("👨‍👩‍👧‍👦🏳️‍🌈🫠⚙️", 8, 38)
2d.getImageData(0,0,120,60)
OfflineAudioContext(1,4500,44100) → startRendering → resolved len=4500
AudioContext()
2d.fillRect(125,1,62,20) + fillText("ClientJS,org <canvas> 1.0")×2
canvas.toDataURL() → len=5282
```

**每一步都成功、无异常**，但 `_state` 仍是 -2。

### `cd[43]` 的真实结构（浏览器）

```json
{"_state":0,
 "canvas":"f1b34814bb75d050604ee5ea580cf123a1b3a648c80cbb6ef3ce3f1345e8afa1",
 "audio":"e9958f485a018b09f2ef48d9190f78c91a7799b7ae3d85beb014ca8af78ea8a6"}
```

是同一条记录里 **canvas 与 audio 两个 sha256**。我试过三种输入做 sha256 都不匹配那个值
（全 0 的 28800 字节 → `19a9b0eb…`；录制的像素文件 → `eca4136c…`；dataURL 字符串 → `44a198c8…`），
所以那个 hash **不是**对"裸数据直接 sha256"，而是带了盐或自实现。

### ip 级追踪：`_state:-2` 不走属性写 opcode（`scripts/e70_state_ip.mjs`）

给 `cur_tdc.js` 的 store opcode（本例是 `case 0x22`）打补丁，捕获所有 `_state` 写入及其 ip：

```
_state = 0   writes: 3   ip=101567 / 117104 / 84643
_state = -1  writes: 1   ip=86761
_state = -2  writes: 0        ← 一次都没有
```

⇒ **`-2` 不是通过"逐属性写"进去的**，它是某个 `{_state:-2}` 对象**字面量**整体构造后放进 cd 的。
这解释了为什么"补 API / 捕异常 / 加 Blob"都不动它 —— 那是 TDC 在**能力探测阶段**就选定的降级分支。

### 结论与下一步（需要一次浏览器对照）

`_state:-2` 属于"能力探测结果"，只能在**同一 build 下比较浏览器与本地走的分支差异**才能定位。
可行做法（skill 的 §4.5 阶段对照）：

1. 用 MCP `instrumentation(install, url_pattern="**/tdc.js*", tap_stage_calls=True)` 在浏览器里跑一次，
   记录扁平化 dispatcher 的 `tap_stage` 状态序列；
2. 本地对**同一份字节**用 `instrumentation(rewrite_source)` 生成同样插桩的版本，跑一次，记录状态序列；
3. 找**第一个分叉的 stage id**，那就是 `-2` 分支的入口。

这需要一次浏览器访问（只加载挑战页、不点 verify）。除此之外没有新的信息源了 ——
继续在本地盲试（补 API / 捕异常）已经被证明不收敛。

## F：按 zp_token 的方法论继续对齐（05:20–08:50，纯离线）

参考 `cases/boss-zhipin-zp-stoken-security-js-vmp.md` 的踩坑清单后，发现我们踩了它的 **#4**：
「调试 prelude 污染键数 —— SDK 正是读 `Object.keys(window)` 进载荷」。

### F1 全局键表对齐（最大的一刀）

```
浏览器 widget iframe：Object.keys(window).length = 282
本地沙箱（修复前）  ：64
```

新增 `scripts/browser_globals.mjs`（282 个键名 + 每个键的合理默认值），在 `buildEnv()` 末尾补齐。
修复后本地 **265** 个（差的是 Camoufox 的 `setXxxSeed` 与我们的插桩键）。一致槽 49 → **50**。

### F2 逐项归因（`scripts/e71/e72`），改一处测一次

| 槽 | 真值（浏览器） | 改什么 | 结果 |
|---|---|---|---|
| `cd[24]` | `"srgb"` | `matchMedia("(color-gamut: srgb)")` 返回 true | ✅ |
| `cd[55]` | `{x:-9999,y:-9999,w:100,h:100,ol:-9999,…}` | 裸元素 rect → -9999/100；`offsetLeft/Top` → -9999；无 fontFamily 时 `offsetWidth/Height` → 100 | ✅ |
| `cd[5]` | 9 个音频 codec | 重写 `canPlayType` 映射（opus/vorbis/wav→probably，flac/m4a→maybe） | ✅ |
| `cd[37]` | 8 个视频 codec | HEVC/Theora/MPEG-4 → `""` | ✅ |
| `cd[19]` | `ac-channelCountMode:"explicit"` | 实时 `AudioContext.destination` 补两个属性 | ✅ |
| `cd[64]` | widget URL + `?rand=` | **`location.href` 应是 widget iframe 的 URL**（我之前设成了父页面） | ✅ |

一致槽 50 → **56 / 73**。

### F3 读取路径实测（`scripts/e73_read_traps.mjs`）

给 13 个候选属性装 getter 计数，跑一次 VM：

```
3  location.href
2  window.name
1  window.opener
(0) document.referrer / document.URL / document.domain / title /
    frameElement / top / parent / self / length
```

⇒ **`cd[7]` 与 `cd[45]` 不是从这些属性来的**，这解释了为什么改 referrer / frameElement / top 都不动它们。

### F4 新发现：`cd[66]` 是**自动化特征分**

变异实验：`navigator.webdriver = true` → `cd[66]` 变化。当前 **本地 22 / 浏览器 0**。
这是"被检测到的自动化特征数"，比任何单个槽都更值得追（22 项分散在补出来的 200 多个全局里）。

### 当前真实状态

```
一致槽：56 / 73
剩余 17 项：3 个时间戳（动态，正常）
           cd[7] URL、cd[45] iframe、cd[43] canvas、cd[66] 自动化分
           cd[22]=767/65、cd[23]=2/14、cd[26]、cd[30]=1;sid/0;sid、cd[36]=140,212.8/-1,-1
           cd[41]=5/10001、cd[59]=0.956/0、cd[63]=0/3、cd[65] IP、cd[68]/[69] cookie
```

### 下一步

1. 继续归因 5 个未定位槽（试 `document.all`、`navigator.permissions`、`crypto.randomUUID`、`document.fonts`、
   `performance.timing`、`Intl.*`）。
2. `cd[66]` 单开一条线：逐个移除可疑非原生特征，看分数是否下降（目标 22 → 0）。
3. `cd[43] canvas` / `cd[45] iframe` 需要「同一 build 的浏览器 vs 本地 dispatcher 状态序列对照」（一次浏览器访问）。

## 下一步（离线可做，不需要再点浏览器）

1. 逐项修 `cd[7]/[24]/[30]/[32]/[36]/[41]/[42]/[43]/[45]/[55]/[59]/[63]/[66]`，每修一次跑 diff。
2. 全部 73 槽一致（除时间戳/cookie 这类动态值）后，用 `tools/tdc_key.mjs` 的 key 对本地明文做 XTEA **加密**，
   构造 collect 提交 → 期望 `errorCode=0`。
