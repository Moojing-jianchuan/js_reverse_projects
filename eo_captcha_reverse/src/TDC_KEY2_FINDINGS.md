# TDC (`tdc.js`) 密钥「枚举 + 自证」提取 —— build B 破案记录

> 对象：`samples/online_tdc.js`（= `scripts/tdc.js`，244,257 字符，TDC_NAME `NKibcNUnfmkEiYQKYDUBEOinAnCcXEPW`，**原来失败的那份**）
> 回归基线：`samples/cur_tdc.js`（264,504 字符，build A，已知 key）
> 方法：**纯本地**，node + 已有反汇编产物；不开浏览器、不联网、不装依赖。
> 产物：`tools/tdc_key2.mjs`（带 `--selfcheck`）、`samples/collect_plaintext_B.json`、
> 自证日志 `src/tdc_key2_selfcheck_A.log` / `_B.log`

---

## 0. 一句话结论

**244257 那份解出来了。** 它和 build A 用的是**同一套 XTEA + 同一套「key 加盐」机制**，
差别只有一处：**盐加在 key 的哪两个下标上**。

| | build A `cur_tdc.js` | build B `online_tdc.js`（本次） |
|---|---|---|
| key 四字（运行期真值） | `1345597520, 1262969173, 1395147868, 1179739983` | `1362842936, 1094398780, 1682399563, 1700026214` |
| S（附加常量） | `[1907998, 0, 2236942, 0]` ← 加在 **0、2** 位 | `[1644810, 1842184, 0, 0]` ← 加在 **0、1** 位 |
| EK = key + S | `1347505518, 1262969173, 1397384810, 1179739983` | `1364487746, 1096240964, 1682399563, 1700026214` |
| EK 字节（ASCII!） | `nMQPUaGKjfJSOgQF` | `BnTQDOwAKaGdfWTe` |
| 解出明文 | 3,199 B JSON，`cd` **73** 槽 | 3,269 B JSON，`cd` **72** 槽 |
| collect | 3,200 B / 400 块 | 3,272 B / 409 块（+3 B `\0` 补齐） |

`node tools/tdc_key2.mjs samples/online_tdc.js --selfcheck` → **`OK`**（cd 槽 72）。
`node tools/tdc_key2.mjs samples/cur_tdc.js  --selfcheck` → **`OK`**（cd 槽 73，EK 与历史结论逐位一致 = 回归通过）。
外部真包回归：`node tools/tdc_key2.mjs samples/cur_tdc.js samples/dumped_browser_cur.json` → **`OK`**（437 块，3492 B JSON，cd 73）。

---

## 1. 失败原因分析（三层，逐层证实）

### 1.1 旧 `tools/tdc_key.mjs` 的 S 位置模式写死成 build A 的形状

旧工具第 4 步只枚举这几种 S 排布：

```js
for (const s of nz) for (const t of nz) if (s !== t) pairs.push([s, 0, t, 0]);  // 0、2 位
for (const s of nz) { pairs.push([s,0,0,0]); pairs.push([0,0,s,0]); }            // 单点 0 或 2 位
pairs.push([0,0,0,0]);
```

而 build B 的盐在 **0、1 位**。⇒ **旧工具在候选空间里根本不存在正确答案**，与 key 词对不对无关。
这是 100% 的确定性排除项：它的搜索空间 ∩ 真解 = ∅。

### 1.2 静态 recipe 在 build B 上系统性跑偏（3/4 是假象）

`tools/tdc_key.mjs` 的 key 词来自「字节码 `charCodeAt` 打包点 → 4 字符 + 常量 K」。
在 B 上 `extractKeyCandidates` 出 43 个候选，前几名是 `0x72556f59 / 0x80637d67 / 0x6447614b`，
而真正的四字是 `0x513b5538 / 0x413b333c / 0x644a6d4b / 0x65545766` —— **top-20 里只命中 1 个**（`0x4b476155` 属 A）。
即：「命中 3/4」那句是在**不同候选切片/不同 K** 下的巧合，不能作为可用判据。
⇒ 静态 recipe 单独用不可靠；必须换数据源或换判据。

### 1.3 旧 oracle 不够硬

「明文必须是 JSON」在**外部 collect** 上是对的，但在 debug 阶段它无法自证：
数据来源（哪份 collect）与加密方（哪份 tdc.js）不是同一物时，任何一环错都会表现为「不是 JSON」。
本次把数据源换成「**同一份 tdc.js 在本地 VM 里跑出来的 collect**」，让 `(加密方, 数据源)` 同源。

---

## 2. 新判据：VM 自证

`--selfcheck` 的做法：

1. 用 `scripts/env.mjs` 建环境，在 node `vm` 里跑**同一份** `tdc.js`，取 `TDC.getData(true)` → collect；
2. 用候选 `EK` 解**它自己的** collect；
3. 判据 = `JSON.parse` 成功 **且** 顶层有 `cd` 数组（`cd` 槽数一并打印）。

这比「猜明文是 JSON」硬，因为攻击面被压到只剩「key/盐/参数」两三个维度：
密文和加密方同源，排除了「env 差异导致 collect 不是那条路径」的干扰。

---

## 3. 关键一步：把「静态推断」换成「运行期取真值」

静态这条路（字节码 role 标签、指令签名）在 build B 上不可用：
`scripts/e52_find_cipher.mjs` 用 build A 的 XTEA 轮函数签名去扫 B 的反汇编 —— **命中 0 处**（A 有 6 处），
原因是 B 是 97 opcode 的另一套扁平化，`role` 标签对不上。所以改走运行期。

### 3.1 通用插桩（不改任何原文件，只在内存里 patch）

`tdc.js` 的 VM dispatcher 形如 `switch(CODE[++IP])`，并且 REGS 数组的构造签名固定：

```js
var X=[..., this, arguments, ..., <CODE>, 0x0]
```

据此自动定位 `CODE` / `IPV` / `REGS`（A、B 两份都能自动认出来），把 dispatcher 包一层：

```js
switch(globalThis.__TH && globalThis.__TH(IP+1, REGS), CODE[++IP])
```

`__TH` 里按需采样 REGS。相关脚本：`scripts/e53_dump_regs.mjs`（采样）、
`scripts/e54_dump_at_ip.mjs`（定点 dump）、`scripts/e56_watch_value.mjs`（值观察）、
`scripts/e64_track_state.mjs`（跟踪某寄存器的变化 ip）、`scripts/e65_trace_block.mjs`（窗口内执行轨迹）。

### 3.2 拿到的东西（build B，ip 都是字节码下标）

```
A[85] = array(1)[ array(4)[1362842936, 1094398780, 1682399563, 1700026214] ]   ← ip 9002（轮函数里）
A[86] = [v0, v1]                                                             ← 块状态
A[4]  = { 0: [v0,v1], 1: array(4) }                                          ← 帧实参
```

状态改写点（`e64`，跟踪 `A[86]`）：

```
ip 8975  [741628763, 757870893]        ← 明文块（= "[[4,-1,-" 的 LE 字节）
ip 9681  3447984063 : 757870893        ← v0 已加密
ip 9690  3447984063 : 2100044432       ← v1 已加密
```

同一 run 里把 409 组 `(明文块, 密文块)` 与最终 collect 对齐（`e61_align_blocks.mjs`）：

```
A[i]（ip 9002 的 A[86]）409 条，全都不在 collect 里     ← 明文
B[i]（ip 10881 的 A[89]）409 条，全都在 collect 里       ← 密文，索引 132,133,134,135,136,130,0,1,...
```

⇒ **ECB、按块独立、且拿到了 409 组已知 (P,C)**，这是后面判定的硬证据。

### 3.3 一枪打穿：块窗口的执行轨迹里直接看到盐

`e65_trace_block.mjs` 记录 ip 8975→9681 之间执行到的所有 ip 并对照反汇编，直接读出四份内联副本：

| 副本 ip | 位置 | 掩码 | 盐 |
|---|---|---|---|
| 2526–2566 | v0 半 | `sum & 3` | **+1644810** |
| 105368–105408 | v0 半 | `sum & 3` | **+1842184** |
| 67646–67678 | v0 半 | `sum & 3` | 无 |
| 37150–37211 | v1 半 | `(sum>>>11)&3` | 无 |
| 45317–45382 | v1 半 | `(sum>>>11)&3` | **+1644810** |
| 100036–100101 | v1 半 | `(sum>>>11)&3` | **+1842184** |

两个盐常量在这两份 build 里也都能从反汇编里静态捞到（`ARITH` 的 1e5..1e7 立即数）：

```
cur_tdc   : 2236942 x2 (ip 19807,52173)   1907998 x2 (ip 93655,95311)
online_tdc: 1644810 x2 (ip 2554,45349)    1842184 x2 (ip 100068,105396)   101111 x1 (噪声)
```

**盐是逐个 key 下标加的**（调用点按 `idx==0 / idx==1 / idx==2 / idx==3` 分支到不同副本），
所以有效密钥 `EK[i] = key[i] + S[i]`；**S 的非零位置是 build 绑定的**（A: 0,2；B: 0,1）。

### 3.4 交叉验证（三重合，全部一致）

1. 用 `EK = key + [1644810,1842184,0,0]` 做**加密**：409 组 `(P,C)` **409/409** 吻合（`scripts/e63_salt_combo.mjs`）；
2. 用 `EK` 做**解密**：VM 自己的 collect → 3269 B 合法 JSON，尾部 3 字节 `\0` 补齐；
3. 盐组合枚举里唯一解就是它：`S ∈ {0,±1644810,±1842184}^4` 共 625 种，**只有 1 种**能过前 5 组 `(P,C)`。

`EK` 的 16 字节在两份 build 里都是 **可打印 ASCII**（`nMQPUaGKjfJSOgQF` / `BnTQDOwAKaGdfWTe`）——
这是个便宜的 sanity check：真 key 必然落在 ASCII 区间，随机数不会。

---

## 4. 命中 key 的构造规则（可解释链条）

```
明文  = JSON（顶层 {cd:[...], sd:{...}}），按 8 字节切块
密文  = base64( XTEA-32-ECB(明文 + \0 补齐到 8 的倍数) )
key   = 4 × u32 = 16 字节
  ├─ 来源：**VM 帧实参里的 4 元整数数组**（字节码里按 (charCode+K)<<(8i) 打包出来的 4 字，
  │        静态 recipe 在 B 上只可靠 3/4，故以运行期数组为准）
  └─ 加盐：每个 key[i] 在轮函数里按「下标分支」被加上一个内联常量 S[i]
EK[i] = key[i] + S[i]
S = [1644810, 1842184, 0, 0]        (build B)
```

逐位：

```
位 0: 1362842936 + 1644810 = 1364487746   (盐站点 ip 2554,45349)
位 1: 1094398780 + 1842184 = 1096240964   (盐站点 ip 100068,105396)
位 2: 1682399563 + 0       = 1682399563
位 3: 1700026214 + 0       = 1700026214
```

每位的「字符形状」（小端 4 字符一组）也说明了为什么必须走 EK：

| | 裸 key（LE 字符） | EK（LE 字符） |
|---|---|---|
| A | `P04P` `UaGK` `\D(S` `OgQF` | `nMQP` `UaGK` `jfJS` `OgQF` |
| B | `8U;Q` `<3;A` `KmJd` `fWTe` | `BnTQ` `DOwA` `KaGd` `fWTe` |

裸 key 的字符是「被 K 偏移过的半成品」，加盐（进位跨字节）后才回到可打印的 16 字符串。
所以「key 就是 16 个 ASCII 字符」是对的，但**直接拿裸字拿去解密一定失败** —— 这正是 build B 之前的死因。

---

## 5. `tools/tdc_key2.mjs` 设计

```
node tools/tdc_key2.mjs <tdc.js> --selfcheck [--sample 8] [--max-salt 2] [--rounds 32] [--no-fallback]
node tools/tdc_key2.mjs <tdc.js> <collect.txt|.json>     # 解外部真包，key 仍来自跑一遍 VM
```

分级枚举（命中即停，失败会把每级「多少组」打印成排除清单）：

| 级 | 维度 | build A | build B |
|---|---|---|---|
| ① | 运行期 4 元整数数组 × S 位置（4 位 × 至多 2 个非零 × 有符号盐）× 端序 | 185 组命中 | 285 组命中 |
| ② | + 8B 内偏移 0..7 × 轮数 16/24/32/48/64 | 备用 | 备用 |
| ③ | 静态 `charCodeAt` 打包词四元组（top-10 → 5,040 序）× S 位置 × 端序 | 备用（仅当静态池覆盖正确词） | 备用 |

- key 候选来源 = **运行期 REGS 采样**（每 `--sample` 步扫一遍，收「长度 4、全是 32 位整数」的数组，按出现次数排序）；
  实测 A/B 都是 4 个候选，真 key 的出现次数是压倒性的（A x59,556 / B x61,048）。
- S 候选 = 反汇编 `ARITH` 的 1e5..1e7 立即数，**位置全排列 + 正负号**（不再写死 `[s,0,t,0]`）。
- 判据：首块解密头 8B 必须 `{`/`[` 起手且可打印+JSON 标点 → 全量解密 → `JSON.parse`。
- 失败路径：打印「每级组数、key 候选、S 组合、轮数、端序」= 已排除清单，不编造 key。

耗时：build B 全流程（含跑一遍 244 KB 的 tdc.js VM）**3.4 s**；命中判定 0.0 s。

---

## 6. 本次仍排除/未覆盖的东西（诚实标注）

1. **静态唯一确定 key 仍然做不到**。B 的 `charCodeAt` 打包点只覆盖部分词，第 4 个词与第 1、2 个词的
   `K` 偏移没能静态对上（这是 B 第 4 种打包写法，未适配）。本方法靠**运行期数组**兜底，
   但「纯静态、不跑 VM」在 B 上依然不成立。
2. **`samples/dumped_browser_build.json` / `dumped_live.json` 用 B 的 EK 解不开**
   （3808 B / 376 块、3736 B / 467 块，×869,046 组全扫无一命中）。这两份应属**别的 build**
   （TDC_NAME 不同），本次没有它们的 tdc.js，因此无法归属验证。⇒ 只证明「同源自证」，
   不证明「这份 dump 属于 B」。
3. **盐的位置只有 0/1 与 0/2 两个样本**，不能推断腾讯的分配规律（可能是按 build 随机挑两个下标）。
   枚举器已覆盖「任意两位 + 正负号」，所以对位置分布不做假设。
4. 明文里 `cd` 槽数 A=73 / B=72，且 B 的 `cd[0]` 是对象（`{count,items}` + 64 位 hex），
   与 A 的 `cd[0]=""`、`cd[1]=时间戳` 布局**不同** —— 若要「纯造 collect」，槽位语义仍需单独对齐，
   本文件不涉及。
5. 只测了 32 轮的 XTEA 主干（两份 build 的常量池都是 `[0x9e3779b9, 0x13c6ef3720]`）；
   16/24/48 只是备用维度，未在任何 build 上实际命中过。

---

## 7. 复现

```powershell
cd D:\ds_work\js_reverse_projects\eo_captcha_reverse

# 244257（原来失败的那份）
node tools/tdc_key2.mjs samples/online_tdc.js --selfcheck
# 264504（回归基线）
node tools/tdc_key2.mjs samples/cur_tdc.js    --selfcheck
# 外部真包
node tools/tdc_key2.mjs samples/cur_tdc.js samples/dumped_browser_cur.json

# 落盘明文
$env:TDC_OUT='samples/collect_plaintext_B.json'; node tools/tdc_key2.mjs samples/online_tdc.js --selfcheck
```

证据脚本（全部只读原文件、patch 只在内存）：

| 脚本 | 作用 |
|---|---|
| `scripts/e51_probe_collect_shape.mjs` | collect 形状（URL 转义 / 字节数 / 是否 8 的倍数 / 多次运行稳定性） |
| `scripts/e52_find_cipher.mjs` | 用 A 的轮函数签名扫 B 反汇编 → 0 命中（证明静态 role 不可用） |
| `scripts/e53_dump_regs.mjs` | 采样 REGS，捞 4 元整数数组与长字符串 |
| `scripts/e54_dump_at_ip.mjs` | 定点 dump 全部寄存器 |
| `scripts/e55_sweep_key.mjs` | 用运行期 key + 旧假设全维度扫描 → 全乱码（证明「不是 key 少个 S」这么简单） |
| `scripts/e56_watch_value.mjs` | 值观察：`32*delta` 出现在哪些 ip |
| `scripts/e61_align_blocks.mjs` | 同一 run 对齐 409 组 (明文块, 密文块) + collect |
| `scripts/e62_variant_sweep.mjs` | 13,824 种 XTEA 变体 × key → 0 命中（证明是 key 不同，不是 cipher 变体） |
| `scripts/e63_salt_combo.mjs` | 625 种盐组合 → 唯一解 `[1644810,1842184,0,0]`，409/409 |
| `scripts/e64_track_state.mjs` | 跟踪 `A[86]` 的改写 ip（8975/9681/9690） |
| `scripts/e65_trace_block.mjs` | 一次块加密的执行轨迹 → 直接读出四份内联副本与盐 |
