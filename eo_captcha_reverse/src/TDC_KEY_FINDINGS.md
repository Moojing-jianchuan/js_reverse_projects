# TDC (`tdc.js`) 密钥静态提取 + collect 解密 —— 结论与复现

> 对象：`samples/cur_tdc.js`（build A，264,504 字符）+ `samples/dumped_cur.json`（与其配套的**浏览器真实 collect**，440 块）；
> 交叉：`scripts/tdc.js`（build B，244,257 字符）。
> 方法：**纯本地**（node + 已有反汇编产物），无网络、无浏览器。动态仅用于**校验**结论（见 §7），静态算法本身不依赖运行。
> 产物：`tools/tdc_key.mjs`（提取 + 解密）、`samples/collect_plaintext.json`（解出的明文）。

## 0. 一句话结论

**collect 是标准 XTEA（32 轮、ECB、8 字节/块、`(v0,v1)` 小端 u32）**；密钥是 4 个 32 位字，
由字节码里 **「4 个字符码 + 常量偏移」按 `(c+K)<<(8*i)` OR 累加** 拼出；
且代码按 key 索引把 key 元素**分流到三份内联副本、每份追加一个常量**，等价于

```
EK[i] = key[i] + S[i]      S = [s0, 0, s2, 0]
```

build A：`key=[1345597520, 1262969173, 1395147868, 1179739983]`，`S=[1907998,0,2236942,0]`，
`EK=[1347505518, 1262969173, 1397384810, 1179739983]` → **明文 100% 解出**（合法 JSON，3517 字节）。

## 1. 加密循环定位（文件 + 偏移 + 反汇编 ip 段 + 证据）

### 1.1 轮函数（v1 半）：`samples/cur_tdc.js`，反汇编 ip **34099–34163**（三份内联副本：34099 / 52141 / 95279）

```
ip       opcode                     指令（A[] = VM 寄存器阵列）
34099  0x06 BITOP   [14, 75, 4]     A[14] = A[75] << 4
34103  0x3a BITOP   [19, 75, 5]     A[19] = A[75] >>> 5
34107  0x1e BITOP   [78, 14, 19]    A[78] = A[14] ^ A[19]        ┐((v<<4)^(v>>>5))
34111  0x3e ARITH   [19, 78, 75]    A[19] = A[78] + A[75]        ┘      + v
34115  0x15 PROP    [78, 85, 0]     A[78] = A[85][0]             ← key 数组（4 字）
34119  0x3a BITOP   [14, 35, 11]    A[14] = A[35] >>> 11         ← sum
34123  0x4c BITOP   [48, 14, 3]     A[48] = A[14] & 3            ← (sum>>>11)&3
34127  0x20 PROP    [14, 78, 48]    A[14] = A[78][A[48]]         ← key[(sum>>>11)&3]
34131  0x3e ARITH   [48, 35, 14]    A[48] = A[35] + A[14]        ┐ sum + key[...]
34135  0x1e BITOP   [16, 19, 48]    A[16] = A[19] ^ A[48]        ┘   ^
34139  0x3e ARITH   [53, 53, 16]    A[53] += A[16]               ← v1 += ...
34143  0x0f / 34146 0x0f            A[77]=A[53]; A[69]=A[53]     ← 写回 v1
34149  0x15 PROP    [76, 1, 3]      A[76] = CONSTS[3] = 0x13c6ef3720 = 32·delta   ← 循环上界
34153  0x1a CMP      [101, 76, 35]   A[101] = (32·delta == sum)
34157  0x09 UNARY                    A[101] = !A[101]
34160  0x30 JMP_IF   [101, 18061, 52838]   ← 未到 32 轮则回跳
```

这就是 XTEA 的 `v += (((v<<4) ^ (v>>>5)) + v) ^ (sum + key[(sum>>>11)&3])`，
`32·delta` 作为循环上界（`0x13c6ef3720` 在常量池 `CONSTS[3]`，`delta=0x9e3779b9` 在 `CONSTS[2]`）。

### 1.2 v0 半 + sum 递增位置：ip **61478–61505**

```
61478  0x3e ARITH   [68, 68, 47]    A[68] += A[47]        ┐ v0 更新（与 1.1 同构）
61485  0x0f ARITH   [75, 68]        A[75] = A[68]         ┘
61488  0x0f ARITH   [53, 69]        A[53] = A[69]         ← 取 v1
61494  0x15 PROP    [14, 1, 2]      A[14] = CONSTS[2] = delta
61498  0x3e ARITH   [19, 19, 14]    A[19] += delta        ← sum += delta（在两半之间！）
61502  0x0f ARITH   [35, 19]        A[35] = A[19]
```

即**标准 XTEA 加密**：

```
for (i=0;i<32;i++){
  v0 += (((v1<<4)^(v1>>>5))+v1) ^ (sum + K[sum & 3]);
  sum += delta;
  v1 += (((v0<<4)^(v0>>>5))+v0) ^ (sum + K[(sum>>>11)&3]);
}
```

### 1.3 「附加常量 S」的分流：ip **22837–22849** / **61509–61517**

```
22837 0x3a A[14] = A[35] >>> 11
22841 0x4c A[19] = A[14] & 3
22845 0x3c A[14] = (A[19] == 2)         ← 只测 2
22849 0x30 JMP_IF …                    → idx==2 走「+2236942」那份副本
61509 0x4c A[19] = A[14] & 3
61513 0x3c A[14] = (A[19] == 0)         ← 只测 0
61517 0x30 JMP_IF …                    → idx==0 走「+1907998」那份副本
34131/52173/95311 三份副本里分别是 无加法 / +2236942 / +1907998（0x46 `A[d]=A[a]+imm`）
```

于是 `K[i]` 实际是 `key[i] + S[i]`，`S=[1907998,0,2236942,0]`。
逐轮用真实寄存器轨迹反解，32 轮里每一轮的 salt 都等于 `S[索引]`（`sum&3` 与 `(sum>>>11)&3` 同一张表），
**32/32 全部吻合**（见 §7 的校验日志）。

> 与第三方成熟实现的日志 `key extracted=(…) offsets=(460573, 0, 197394, 0)` 完全同构：
> 4 个 key 字 + 4 个附加常量，且**第 1、3 位为 0**。本 build 是 `[1907998, 0, 2236942, 0]`。
> 因此那串 `offsets` 极可能就是同一张 S 表（第三方叫法不同）。→ 同源判断为**高度可能，未证同源**。

## 2. 密钥提取算法（可复现，不写死）

### 2.1 单个 32 位字的来源（打包点）

在反汇编里找 `charCodeAt` 的读取点（两种写法都要认）：

- build A：`PROP_READ_DYN [d, strReg, keyReg]`，`keyReg` 重建出 `"charCodeAt"`
- build B：`STR_APP_THEN_READ [keyReg, 't', d, strReg, keyReg]`（先用 3 字符一组的 `STR_APP` 拼出 `charCodeAt`）

其后的 `CALL [d, fn, strReg, idxReg]` 里 `strReg`（`ops[2]`）就是被逐字读取的字符串。
再往后到 `LOAD_IMM 8`（`8*i` 的步子）之间的常量就是偏移 `K`：

| 写法 | 指令形态 | 语义 |
|---|---|---|
| `+K` | `LOAD_IMM [r,K]` → `UNARY` → `ARITH [d,c,r]` | `c - (-K) = c+K` |
| `-K` | `ARITH [d,c,K]`（`0x2f`，第三操作数是立即数） | `c - K` |

打包本体固定在 `LOAD_IMM 8` 之后：

```
LOAD_IMM 8 → A[m]=8 ; A[sh]=8*A[idx] ; A[t]=A[c]<<A[sh] ; A[acc] |= A[t]
```

即 **`word = Σ ((charCode(s[i]) + K) & 0xff) << (8*i)`**（4 个字符一组，小端打包）。

build A 实测的 4 条 recipe（每组 4 字符都出现在 2–4 份内联副本里）：

| 目标字 | 4 个字符码 | K | 站点 ip |
|---|---|---|---|
| 1345597520 | `[87,55,59,87]`（"W7;W"） | −7 | 46477 / 51024 / 100778 / 117465 |
| 1262969173 | `[74,86,60,64]`（"JV<@"） | +11 | 44145 / 48726 / 52311 |
| 1395147868 | `[107,83,55,98]`（"kS7b"） | −15 | 60668 / 66456 |
| 1179739983 | `[91,115,93,82]`（"[s]R"） | −12 | 19559 / 23902 / 101610 |

> 注意：同一段 4 字符会被不同副本用**不同偏移**复用（例如 "W7;W" 另有 +11 的副本，得 `0x62464262`），
> 所以「字符段 + 偏移」必须成对取，不能只看字符段。字节码是扁平化的，线性相邻**不等于**执行顺序，
> 因此工具把窗口内的常量正负都当候选，交给 §2.3 的 oracle 定夺。

### 2.2 S（附加常量）候选

扫全表 `ARITH` 指令里 1000…1e8 的立即数 → build A：`0, 2236942, 1907998, 61387, 46618, …`（前两个就是真的）。
工具按出现次数排序取前 3 个（非 0）组合成 `[s,0,t,0]`。

### 2.3 消歧：用「明文必须是 JSON」当 oracle

候选词（build A 45 个）× 有序四元组（45·44·43·42 = 3,575,880）× S 组合（13）：
先用**单块**解密做廉价筛选（首字节 `{`/`[`、8 字节中 ≥7 可打印、≥2 个 JSON 标点），
命中后整段解密 + `JSON.parse` 复核。build A 在 **1.4 s / 357 万组**内命中。

```powershell
cd D:\ds_work\js_reverse_projects\eo_captcha_reverse
node tools/tdc_key.mjs samples/cur_tdc.js samples/dumped_cur.json
# 可选：TDC_OUT=samples/collect_plaintext.json 直接落盘
```

## 3. 两份 build 的 key（build 绑定已验证）

| | build A `samples/cur_tdc.js` | build B `scripts/tdc.js` |
|---|---|---|
| entry / 整数数 | `0x18b60` / 124,690 | `0x1aca5` / 121,743 |
| opcode 数 | 94 (`0x5d`) | 97 (`0x60`) |
| cipher 副本 ip | 34099 / 52141 / 95279（v1），61478（v0） | 8998 / 37200 / 45371 / 100090 附近同构 |
| **key（4×u32）** | **1345597520, 1262969173, 1395147868, 1179739983** | **1362842936, 1094398780, 1682399563, 1700026214** |
| S 候选 | 1907998 / 2236942 | 1644810 / 1842184 |
| 结论 | **不同** ⇒ key 确实 build 绑定 | 同左 |

build A 的 key 从 key 数组取到（动态校验位 `A[85]=A[2][0]`，见 §7）。
build B 的 key 由同一份静态 recipe 也能命中 **3/4**（`0x513b5538`、`0x6447614b`、`0x65545766`），
第 4 个 `1094398780 (0x413b333c)` 的 recipe 没被模式匹配到 → **未验证**（见 §6）。

## 4. 解密结果

```
$ node tools/tdc_key.mjs samples/cur_tdc.js samples/dumped_cur.json
  key(原始 4 字): [1345597520, 1262969173, 1395147868, 1179739983]
  S(附加常量)   : [1907998, 0, 2236942, 0]
  EK=key+S     : [1347505518, 1262969173, 1397384810, 1179739983]
  EK 字节      : 6e4d51505561474b6a664a534f675146
  参数         : XTEA / 32 轮 / ECB / 8B 块 / (v0,v1)=小端 u32 / sum 在两半之间 +=delta
  明文头 120B  : {"cd":["",1794985154,["PDF Viewer","Chrome PDF Viewer","Chromium PDF Vie
  明文         : ✓ 合法 JSON，3517 字节，顶层键 [cd, sd]
```

- 明文 = **完整 JSON**（无压缩、无二次 base64、无 XOR 层），**不是**「部分可读」。
- 密文 3520 B = 440 块；明文 3517 B + **3 字节 `\0` 长度补齐**（这是 `JSON.parse` 直接报错的唯一原因，去掉尾部 NUL 即合法）。
- 明文结构（已存 `samples/collect_plaintext.json`，pretty 4.7 KB）：
  - `cd`：**73 项数组** —— `["", 1794985154, [插件列表], "https://captcha.eo.qq.com|https://captcha.eo.gtimg.com/static", [], [{codec,support}…], …]`
  - `sd`：对象 ——
    - `od`: `"C"`
    - `mathFingerprint`: 三角函数指纹（`tanh0x` / `0.5` / `0.7` …，每项 `{value, os}`）
    - `fpBio`: `{v:1, cw:1, ce:{s,h,p:5112}, gp:{s,sp,px}}`
    - `ep`: `{v:1, m:8, d:0, k:282}`
    - `tdc_perf`: `{fi:147, pi:113, gd:142}`
  - 对父会话的意义：**明文里没有 `userAgent` 这类字面键**，指纹是按 `cd` 的**位置下标数组**组织的（73 个槽），
    `sd` 只放派生的摘要（哈希 `h`、`sp`/`px`、性能计数）。要纯算出 collect，必须复现 `cd` 的 73 槽顺序与取值。

## 5. 复现链（全本地）

```powershell
# 0) 反汇编产物（已存在；缺失时工具会自动用 tools/vmp/*.mjs 现场生成）
node tools/vmp/strings.mjs  samples/cur_tdc.js src/_vmp/cur_tdc.strings.json --fold src/_vmp/cur_tdc.folded.js
node tools/vmp/bytecode.mjs src/_vmp/cur_tdc.folded.js samples/cur_tdc.js src/_vmp/cur_tdc.bytecode.json
node tools/vmp/opcodes.mjs  src/_vmp/cur_tdc.folded.js src/_vmp/cur_tdc.opcodes.json
node tools/vmp/disasm.mjs   src/_vmp/cur_tdc.bytecode.json src/_vmp/cur_tdc.opcodes.json src/_vmp/cur_tdc.disasm.json

# 1) 看轮函数（编号来自 cur.disasm.ins.json）
node tools/vmp/show.mjs src/_vmp/cur_tdc.disasm.ins.json 34099 6 40
node tools/vmp/show.mjs src/_vmp/cur_tdc.disasm.ins.json 61478 4 30

# 2) 一键提 key + 解密
node tools/tdc_key.mjs samples/cur_tdc.js samples/dumped_cur.json
```

## 6. 未验证 / 已知边界（诚实标注）

1. **build B 的 collect 解不出来**。用动态确认的 B 的 key，试过：
   24 种词序 × 8 种 S 排布 × `(v0,v1)` 交换 × 轮数 {8,16,24,32,48,64} × sum 递增位置两版 × 0–7 字节块偏移，
   **全部无一是 JSON**。两种解释（未区分）：
   - build B 的 cipher 不是这条 XTEA 路径（例如 XXTEA / 不同 delta）；
   - 我这份 env 下跑 `scripts/tdc.js` 产出的 collect（1768 B）与浏览器路径不同源。
   → **卡在这一层，不影响 build A 的结论**。
2. build B 第 4 个 key 字 `1094398780` 的 recipe 未被静态模式匹配到（3/4 命中）⇒ 说明还有 **第 4 种打包写法**没适配。
3. **key 如何流到 cipher 没有静态数据流证据**：运行期 `A[85] = A[2][0]`（ip 46135）说明 key 数组是**调用方传入的帧实参**；
   字节码里**没有** `Array(4)` 字面量（全文只有 1 处 `Array(4)`，是 ICE `stun:` 服务器列表），也没有 4 次 `push` 命中 key 值。
   ⇒ 静态侧只能做到「按打包点枚举候选 + oracle 定夺」，做不到「静态唯一确定」。
4. 第三方日志的 `offsets` 与我们的 `S` 同构，但**未证同源**。
5. `cd` 的 73 个槽位语义只做了抽样解读（插件/编解码/指纹块），**完整槽位表未逐项标注**。

## 7. 动态校验（仅用于验证静态结论，产物不依赖它）

在**副本**上给 dispatcher 插一句探针（不改任何原文件）：

```js
// 把 switch(CODE[++IP]){ 换成：
switch(((globalThis.__Targ===((IP)+1))&&globalThis.__D(REGS),CODE[++IP])){
```

- 在 ip 46168（块起始）dump `A[85]` → 得到 key 数组 `[[1345597520,1262969173,1395147868,1179739983]]`；
- 逐轮 dump `(sum, v0, v1)`（ip 61488 / 34149 / 52195 / 95333）→ 反解出每轮的 salt，得到 `S=[1907998,0,2236942,0]`，
  **32/32 轮吻合**；用 `EK` 重跑 32 轮，末态 `(1051886451, 2564272478)` 与 VM 完全一致（含 v1 的 `-27500498594` = 同值 mod 2³²）。
- build B 同样手法在 ip 8998 取到 `[[1362842936,1094398780,1682399563,1700026214]]` ⇒ **与 A 不同**。

## 8. 产物索引

| 文件 | 内容 |
|---|---|
| `tools/tdc_key.mjs` | key 提取 + 解密；失败会显式打印卡在第几层（反汇编 / 模式 / 解密） |
| `samples/collect_plaintext.json` | 解出的明文（pretty JSON，3517 B 原文） |
| `src/_vmp/cur_tdc.disasm.ins.json` 等 | build A 的反汇编产物（工具自动生成，含 role 语义标签） |
| `src/TDC_KEY_FINDINGS.md` | 本文 |
