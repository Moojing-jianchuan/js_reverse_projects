# tdc.js 密钥提取 v3 —— 三形状通吃 + helper 识别失败的根因

> 对象：三份 `tdc.js` build（全部纯本地，node only，不联网、不开浏览器、不装依赖）
> - `samples/mix_tdc.js` 244,257 字符（旧称 build B，TDC_NAME `NKibcNUnfmkEiYQKYDUBEOinAnCcXEPW`）
> - `samples/cur_tdc.js` 264,504 字符（旧称 build A，TDC_NAME `OUjbOmijNcmaNQYdkNagXSCBMZGJgWDN`）
> - `samples/capture11_tdc.js` 257,913 字符（**本次新 build**，TDC_NAME `MEZKDNVimSjOSBkjVVBFQXaYMTGhAmeJ`，
>   从 `samples/capture11.json` 的 `requests[10].response_body` 抽出，与既有 `samples/exp_tdc.js` 字节相同）
>
> 产物：`tools/tdc_key3.mjs`（新文件；`tdc_key.mjs` / `tdc_key2.mjs` / `tools/vmp/*` / `scripts/*` 全部未改）
> 日志：`src/tdc_key3_mix_tdc.log`、`src/tdc_key3_cur_tdc.log`、`src/tdc_key3_capture11.log`、
> 失败路径 `src/_key3_fail_demo.log`、helper 诊断 `--diag`（见 §2）

---

## 0. 一句话结论

**257913 那份拿下了。** 三份 build 全部 `--selfcheck → OK`，且 mix/cur 的 EK 与 `tdc_key2` 的历史结论逐位一致。

关键判断：**卡的不在 VM，也不在盐的"性质"，而在盐的"来源"和"排序"。**
新 build 上 `tools/vmp/bytecode.mjs:82` 抛错只是表象；就算把那行修好，静态路线的盐排序依然排不到正确盐（§2.3），
所以 v3 把 **key 候选和盐候选两样原料全部改成运行期采集**，不再依赖任何静态反汇编产物。

| build | key 四字（运行期 REGS） | S 位置修正 | EK | cd | 明文 |
|---|---|---|---|---|---|
| `mix_tdc.js` | `1362842936, 1094398780, 1682399563, 1700026214` | `[1644810, 1842184, 0, 0]` | **`1364487746, 1096240964, 1682399563, 1700026214`** | 72 | 3350 B |
| `cur_tdc.js` | `1345597520, 1262969173, 1395147868, 1179739983` | `[1907998, 0, 2236942, 0]` | **`1347505518, 1262969173, 1397384810, 1179739983`** | 73 | 3302 B |
| `capture11_tdc.js` | `1799514436, 1197630312, 1650674755, 1162624047` | `[0, 0, 131618, 1447448]` | **`1799514436, 1197630312, 1650806373, 1164071495`** | 72 | 3398 B |

XTEA 参数三份完全一致：**32 轮 / ECB / 8B 块 / (v0,v1) 小端 u32 / 不交换（swap=false）/ 偏移 0 / sum 在两半之间 += delta**。
盐的非零位：mix 在 **0、1**；cur 在 **0、2**；capture11 在 **2、3** —— 三份互不相同，这正是 v1/v2 写死位置模式会翻车的区域。

---

## 1. 复现（三条命令，真跑输出）

```
node tools/tdc_key2.mjs samples/mix_tdc.js       --selfcheck   → OK   EK [1364487746,1096240964,1682399563,1700026214]
node tools/tdc_key2.mjs samples/cur_tdc.js       --selfcheck   → OK   EK [1347505518,1262969173,1397384810,1179739983]
node tools/tdc_key2.mjs samples/capture11_tdc.js --selfcheck   → 失败
```

`capture11` 的实际输出（`src/_capture11_key2.log`）：

```
[1/5] build: capture11_tdc.js  257913 bytes
[boot] fn joAqFyB$xo$64b57z b64len 231896
[boot] entry = 0x13e44
[helpers] range-builder(while+push) = _0x1185ce
[helpers] base64(alphabet literal) = NOT FOUND        ← 就是这个
[helpers] zigzag(>>1, optional) = _0x45aee1
[helpers] varint-decoder(Int8Array) = _0x1d5866
Error: helper identification failed
    at tools/vmp/bytecode.mjs:82
卡在第 1 层（反汇编）：反汇编流水线失败：… bytecode.mjs … capture11_tdc.bytecode.json
```

**第 82 行 `if (!b64Hit || !decHit || !rangeHit) throw` 里命中的是 `b64Hit`**（另两个都识别到了）。

> 注：`samples/capture11_tdc.js` 原本不存在，是按任务说明从 `samples/capture11.json` 的
> `requests[10].response_body`（URL `https://captcha.eo.qq.com/tdc.js?appid=25199668&…`）抽出的，
> 写出后与既有 `samples/exp_tdc.js` **逐字节相同**（257913 chars, identical = true）。

---

## 2. helper 识别失败的根因（三层，逐层证实）

### 2.1 直接原因：base64 识别签名要求"字母表字面量出现在**具名函数体**内"

`tools/vmp/bytecode.mjs` 的 4 个 helper 全是从 `funcs` 里 `re.test(f.text)` 挑的，而 `funcs` 只收
**带 id 的 FunctionDeclaration / FunctionExpression**：

```js
const b64Hit = pickFn(/ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789/, 'base64');
```

- mix：`function _0x46379c(...){ … 'ABCDEF…+/='.split('') … }` → 字面量在函数体内 → 命中。
- capture11：字母表被提到 **IIFE 顶部的共享字符串对象**里，函数体只留键名：

```js
var joAqFyB$xo$64b57z = (function(){
  var _0x500fc5=_0x38b920,
      _0x181eeb={'mDAJd':'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=',
                 'TUHwa':function(a,b){return a(b);}, …};
  …
  function _0xe56fc2(_0x57b9f0){
    var _0x533d44=_0x500fc5,
        _0x270efb=_0x181eeb["mDAJd"]['split'](''),   // ← 字母表在这里被"引用"
        … _0x52ae2c[charCodeAt(i)] …                 // ← 真正的查表是 base 表变量
```

`--diag` 直接把它钉住（`node tools/tdc_key3.mjs samples/capture11_tdc.js --diag`）：

```
[diag] bytecode.mjs 原签名（函数体内出现字母表字面量）：
   rangeHit  = _0x1185ce
   b64Hit    = NOT FOUND
   zigHit    = _0x45aee1
   decHit    = _0x1d5866
   第 82 行抛错条件命中：b64Hit
[diag] 新签名：base 表变量 = _0x52ae2c
   b64Hit(new, 引用 base 表变量) = _0xe56fc2
   字母表字面量位置 5885，所在语境：…var_0x500fc5=_0x38b920,_0x181eeb={'mDAJd':'ABCDEF…
   是否落在某个"具名函数体"内：否 → 所以 funcs.find(...) 匹配不到
```

### 2.2 修法（已验证，且向后兼容）

不再找"字母表字面量"，改成两步：

1. **base 表变量** = 初始化式里同时含 `concat` 与 range-builder 函数名的 `var`（capture11 → `_0x52ae2c`；
   mix → `_0x290628`；cur → `_0x2599c4`）。这本来就是 `bytecode.mjs` 里的 `initName`，只是没被拿来当锚点。
2. **b64 助手** = 具名函数中**引用了 base 表变量**且含 `charCodeAt|replace` 的那个
   （capture11 → `_0xe56fc2`；mix → `_0x46379c`；cur → `_0x7b4a21`）。旧签名在两份老 build 上仍然命中，二者结果一致。

**三份 build 的交叉验证**（静态解码的 int 数 vs 运行期 `REGS[6]` 的长度）：

| build | 旧 b64Hit | 新 b64Hit | base 表 | 静态解码 ints | 运行期 int 流长度 | 前 8 个 int |
|---|---|---|---|---|---|---|
| `mix_tdc.js` | `_0x46379c` | `_0x46379c` | `_0x290628` | 121,743 | **121,743** | `55,9,0,95,9,50,67,12` |
| `cur_tdc.js` | `_0x7b4a21` | `_0x7b4a21` | `_0x2599c4` | 124,690 | **124,690** | `75,16,79,16,110,16,97,79` |
| `capture11_tdc.js` | **NOT FOUND** | `_0xe56fc2` | `_0x52ae2c` | 127,675 | **127,675** | `78,44,4,0,29,4,1,72` |

长度和头部**逐一相等**，说明"新签名"解出来的就是运行期 dispatcher 真正在读的那条 int 流 —— 这不是拟合，是等式。

### 2.3 但"修好解码"并不足以救 v2：静态盐排序本身就错位

即使把 `bytecode.mjs` 修好跑通 `opcodes.mjs` + `disasm.mjs`，capture11 上的产物也是**退化**的：

```
[disasm] entry 81476 instructions 26372 coverage 99.5% ambiguous JMP_IF 0 jumps 539
[disasm] opcodes seen 95 / 95
[disasm] strings reconstructed 0        ← 老 build 能重建字符串，这份一个都没重建
roles: {"ARITH":11955,"CALL_REENTRY":400,"CALL_PUSH":293,"STR_APP":9525,"OTHER":300,"CMP":585,
        "STR_APP2":850,"STR_APP_THEN_REENTRY":46,"CALL":1337,"TYPEOF_MIX":213,"THROW":111,
        "JMP":246,"RET":371,"BITOP":140}
```

`STR_INIT / ALLOC / MOV / PROP_READ_* / LOAD_IMM` 一个都没出现 —— `opcodes.mjs` 的 `role()` 在这份 build 的
分发器形态上大面积塌缩成 `ARITH`/`STR_APP`。**role 不可信 ⇒ "ARITH 的大立即数"不再是盐候选的可靠定义。**

更致命的是**排序**。按静态 `ARITH` 出现次数排 capture11 的盐候选取 top-6，结果是：

```
ARITH 大立即数候选数: 69
top10: 131618(x2) 115245(x1) 107072(x1) 114486(x1) 105723(x1) 122485(x1) 107374(x1) …
真实盐 131618  → 静态排名第 1 位
真实盐 1447448 → 静态排名第 54 位   ← tdc_key2 只取 slice(0,6)
若按 tdc_key2 的 saltVals = arr.slice(0,6)：131618,115245,107072,114486,105723,122485
真实 S 是否落在前 6：[true, false]
```

也就是说：**`tdc_key2` 即便解码成功，第二颗盐也进不了候选集**（69 个候选里 62 个的计数都是 1，静态计数无区分度）。

---

## 3. 新候选策略：两样原料都从运行期拿

v3 的 pipeline（`tools/tdc_key3.mjs`）：

```
① patchDispatcher(tdc.js)                       —— 与 v2 同一段正则，不依赖反汇编
② 跑一次 VM（scripts/env.mjs 的 buildEnv）        —— 顺带拿到同 build 的 collect 做自证
③ hook 在 switch(CODE[++IP]) 之前拿 REGS：
   · key 候选 = REGS 里**真实存在的 4 元 32bit 整数数组**（按出现次数排序）
   · 盐候选 = REGS 里那条**字节码 int 流**（dispatcher 正在读它）中 100000..10000000 的整数
             —— 这是 "ARITH 大立即数" 的**超集**，因为它就是它的数据来源；排序用**运行期读取次数**
④ 位置 × ±盐 × 至多 maxSalt 个非零 → EK = key + S
⑤ oracle = 明文前缀 `{"cd":[`（7 字节，三份 build 恒定）→ 命中后再做整包 JSON 自证
```

### 3.1 为什么"运行期读取次数"这个排序是对的

盐是 build 期烘进字节码的常量，**每次进 VM 主循环都会被 dispatcher 读一次**，所以它在 int 流里的读取次数会
和"循环被执行的次数"同阶 —— 而字符串打包用的那些 100030~122521 之类常量，读取次数只和所在分支频率有关。
实测把真实盐顶到了最前面：

| build | 运行期盐候选 top-6（按 int 流读取次数） | 真实盐排名 | 命中时枚举到第几组 |
|---|---|---|---|
| `mix_tdc.js` | `1644810 1842184 113780 104597 115048 116561` | **#1, #2** | 64,225（L2） |
| `cur_tdc.js` | `121799 2236942 1907998 116723 120328 111935` | **#2, #3**（`121799` 是诱饵） | 94,113（L2） |
| `capture11_tdc.js` | `131618 1447448 114051 101907 115245 105600` | **#1, #2** | **4,105**（L2） |

对比一下同一颗盐在静态口径下的排名：`1447448` 静态第 **54**，运行期第 **2**。这就是 v3 相对 v2 的实质增益。

### 3.2 分级枚举（每级都会打印候选数，失败时标注"已排除"）

| 级 | 内容 | 组数（capture11 / 60 盐） |
|---|---|---|
| L0 | 无盐（EK=key）× 32 轮 × 两端序 | 8 |
| L1 | 至多 1 个非零盐 | 3,848 |
| L2 | 至多 2 个非零盐 | 695,048 |
| L3 | 至多 3 个非零盐（盐池缩到 top16，控代价） | 1,443,633（按需开） |
| L4 | 无盐 × 轮数 16/24/32/48/64 × 8B 内偏移 0..7 | 320 |
| L5 | 位置词池交叉（所有采到的 4 元数组的词 → 四元组） | 8,192 |

capture11 在 **L2 的第 4,105 组**命中；L0/L1 全量跑完被排除（真解确实需要两个非零位）。

### 3.3 失败时的输出（真跑样例，`src/_key3_fail_demo.log`）

故意用错 build 解真包（`mix_tdc.js` + `cur` 的浏览器 collect）：

```
  ✗ 未命中：共试 494936 组 / 0.4s，明文前缀 {"cd":[ 通过 0 次
  每级候选数量（已排除 = 全量跑完且无一通过前缀 oracle）：
    ✗ 已排除          8 组  1ms  L0 无盐（EK=key） × 32 轮 × 端序
    ✗ 已排除       3208 组  9ms  L1 至多 1 个非零盐（50 盐 ±）
    ✗ 已排除     483208 组  363ms  L2 至多 2 个非零盐（50 盐 ±）
    ✗ 已排除        320 组  1ms  L4 无盐 × 轮数 16/24/32/48/64 × 8B 内偏移 0..7
    ✗ 已排除       8192 组  9ms  L5 位置词池交叉（8 词 → 4096 四元组）
  仍在候选空间内的方向（未展开）：
    · 盐取值超出 top60（… 共 50 个）→ 加大 --salt-cap
    · 非零位 > 2 → 加大 --max-salt（代价 ~ (2k)^m）
    · key 候选池外的 4 元数组（本 build 只采到 4 个）→ 减小 --sample 或提高采样密度
  卡点判定：VM 已产出 collect（3736B），说明**不卡 VM**，卡在候选空间。
```

---

## 4. 交付判据（全部真跑，2026-11-19）

```
$ node tools/tdc_key3.mjs samples/mix_tdc.js --selfcheck
[2/4] … 4 元数组 4 个；盐候选 50 个（1e5..1e7）；VM 阶段耗时 1.4s
[命中] 64225 组 / 0.1s （L2 至多 2 个非零盐（50 盐 ±））
  EK          : [1364487746, 1096240964, 1682399563, 1700026214]
  明文        : ✓ 合法 JSON，3350 字节，顶层键 [cd, sd]，cd 槽 72
  OK                                                       wall 3.41s

$ node tools/tdc_key3.mjs samples/cur_tdc.js --selfcheck
[2/4] … 4 元数组 4 个；盐候选 71 个（1e5..1e7）；VM 阶段耗时 2.1s
[命中] 94113 组 / 0.1s （L2 至多 2 个非零盐（60 盐 ±））
  EK          : [1347505518, 1262969173, 1397384810, 1179739983]
  明文        : ✓ 合法 JSON，3302 字节，顶层键 [cd, sd]，cd 槽 73
  OK                                                       wall 4.01s

$ node tools/tdc_key3.mjs samples/capture11_tdc.js --selfcheck      ← 新 build
[2/4] … 4 元数组 4 个；盐候选 117 个（1e5..1e7）；VM 阶段耗时 1.5s
[命中] 4105 组 / 0.0s （L2 至多 2 个非零盐（60 盐 ±））
  key 四字    : [1799514436, 1197630312, 1650674755, 1162624047]   ← REGS ip=25613 x63919
  S 位置修正  : [0, 0, 131618, 1447448]
    位 2: 1650674755 + 131618  = 1650806373   (盐 131618 在字节码 int 流中出现 2 次)
    位 3: 1162624047 + 1447448 = 1164071495   (盐 1447448 在字节码 int 流中出现 2 次)
  EK          : [1799514436, 1197630312, 1650806373, 1164071495]
  明文        : ✓ 合法 JSON，3398 字节，顶层键 [cd, sd]，cd 槽 72
  OK                                                       wall 3.5s
```

外部真包回归（`--collect`）：

```
$ node tools/tdc_key3.mjs samples/cur_tdc.js --collect samples/collect_browser.txt
[3/4] 外部 collect: samples/collect_browser.txt  3736 字节 / 467 块  (同 build VM 自产 collect 3304 字节，仅供参考)
[命中] 94113 组 / 0.1s
  明文头 120B : {"cd":["",1794975565,["PDF Viewer","Chrome PDF Viewer",…
  明文        : ✓ 合法 JSON，3732 字节，顶层键 [cd, sd]，cd 槽 73
  长度补齐    : 4 字节 \0（collect 3736B）
  OK
```

（`samples/collect_browser.txt` 经 `src/_probe_which_build.mjs` 判定属于 `cur_tdc.js` 这一族：
`collect_browser.txt`/`rebuilt_collect.txt`/`e27_local_collect.txt` → cur；`_e53_collect.txt` → mix。）

### 4.1 三份 build 的差异一览

| | `mix_tdc.js` | `cur_tdc.js` | `capture11_tdc.js` |
|---|---|---|---|
| 源码字符数 | 244,257 | 264,504 | 257,913 |
| 折叠后字符数 | 243,820 | 264,116 | **489,464**（折叠反而膨胀，说明折叠器也没看懂它） |
| TDC_NAME | `NKibcNUnfmkEiYQKYDUBEOinAnCcXEPW` | `OUjbOmijNcmaNQYdkNagXSCBMZGJgWDN` | `MEZKDNVimSjOSBkjVVBFQXaYMTGhAmeJ` |
| bootstrap b64 长度 | 217,508 | 238,128 | 231,896 |
| 入口偏移 | `0x1aca5` | `0x18b60` | `0x13e44` |
| dispatcher case 数 | 97 | 94 | 95 |
| 字节码 int 数 | 121,743 | 124,690 | 127,675 |
| 字母表字面量位置 | 函数体内 | 函数体内 | **IIFE 顶部共享对象内** |
| 字符串重建（disasm） | 正常 | 正常 | **0**（role 塌缩） |
| 盐非零位 | 0、1 | 0、2 | **2、3** |
| 盐大小量级 | 1.6M / 1.8M | 1.9M / 2.2M | **131K / 1.4M**（跨量级，v2 的 1e5..1e7 过滤刚好覆盖） |

---

## 5. 未覆盖项 / 已知限制

1. **capture11 没有浏览器真包**：`capture11.json` 里只有 4 条 `collect` 请求（均属更大流程），没有可定位到
   这份 build 的 collect 响应；因此 capture11 只有 `--selfcheck` 自证。**自证成立的条件**是"key 与 collect 来自同一次
   VM 运行"，这一点三份 build 都满足（同一份 build、同一个沙箱、同一轮枚举）。`--collect` 路径本身已在 cur 上用真包验证。
2. **盐模型仍然被限定为"逐位加法、至多 2 个非零位、4 位"**。三份 build 都符合，但这是**归纳**而非证明。
   如果未来 build 改成乘法/字节内置换/把盐拼进 key 字符串，L0..L5 会全部落空，需要新加一级——失败输出会明确
   "卡在候选空间"并列出已排除的组数，不会静默退出。
3. **VM 必须先能跑起来**。v3 不解决"VM 跑不起来"的情况（会以 `exit 4` + `VM 阶段失败/卡在 VM` 区分报错）。
   三份 build 在 `scripts/env.mjs` 下都能出 collect。
4. **`--diag` 的修复版解码器没有并进 `tools/vmp/bytecode.mjs`**（约束要求不改）。它现在只作为诊断/交叉验证手段存在
   （`src/_probe_bc.mjs` + `--diag`），解出来的 int 流与运行期完全一致，若将来允许改 `tools/vmp/*`，把 §2.2 的两步
   直接替换掉 `bytecode.mjs` 的 `b64Hit` 选择逻辑即可（向后兼容 mix/cur）。
5. **耗时**：单份 build 端到端 **3.4–4.0 s**，其中 VM 1.4–2.1 s 是绝对瓶颈，枚举命中只用 0.0–0.1 s。
   `--sample 8` 是采样步长；若某份 build 的 key 数组只在极晚/极少的分支出现，可调小（代价：hook 开销线性上升）。
   并行跑多份 build 会把 VM 阶段拖慢 30–60 倍（实测 1.5s → 100s+），**批量时应串行**。

---

## 6. 换一份新 build，平均多久命中

| 阶段 | 耗时（实测，单进程） |
|---|---|
| patch dispatcher（正则，无 AST） | < 10 ms |
| VM 跑一遍 + REGS 采样（含 int 流刮取） | 1.4 – 2.1 s |
| 枚举 L0→L2（≤ 70 万组，命中即停） | 0.0 – 0.4 s |
| 整包 JSON 自证 + 打印 | < 10 ms |
| **合计** | **3.4 – 4.0 s** |

即：**新 build 平均 ~3.5 秒出 EK**（三份 build 分别 3.41 / 4.01 / 3.50 s，共 3 次全成功）。
`--collect` 路径多读一个文件，可忽略。

---

## 7. 文件清单

| 文件 | 说明 |
|---|---|
| `tools/tdc_key3.mjs` | **交付物**。`--selfcheck` / `--collect <f>` / `--diag`；`--rounds --sample --max-salt --salt-cap --quiet` |
| `samples/capture11_tdc.js` | 从 `capture11.json` 抽出的 257913 build（与 `samples/exp_tdc.js` 字节相同） |
| `src/tdc_key3_mix_tdc.log` / `_cur_tdc.log` / `_capture11.log` | 三条交付判据的完整真跑日志 |
| `src/_key3_fail_demo.log` | 失败路径（错 build + 真包）的完整输出 |
| `src/_capture11_key2.log` | `tdc_key2` 在 257913 上失败的完整栈 |
| `src/_probe_bc.mjs` | 修复版 helper 识别 + 解码（交叉验证用；非交付路径） |
| `src/_facts.mjs` | 三份 build 静态事实表 |
| `src/_probe_which_build.mjs` | 判定某个 collect 属于哪份 build |
| `src/_probe_cap11_vm.mjs` / `src/_probe_rt.mjs` / `src/_probe_cap11_try.mjs` | 取证脚本：运行期取样、纯运行期枚举、早期"直接加法"否证实验 |
| `src/_vmp/capture11_tdc.{folded.js,bytecode.json,opcodes.json,disasm.json,disasm.ins.json}` | 为新 build 现场生成的反汇编产物（证明"解码可修，但 role/排序不可信"） |
