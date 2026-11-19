# REPORT_A4 — 把 VM 拆开：`data` 暗层已完全解出（结论 A：**无密钥、可纯 Node 复现**）

- 日期：2026-11-13（第四轮）
- 依据 bundle：`static/bundles/pe.069.bcf01ca00f5bd260.js`（447 877 B，本次会话 StaticPath 版本）
- 样本：`config/cvp_sample_1.json` / `cvp_sample_2.json`（只读）
- 结论：**`data = btoa( transform(T, seed) )`，`seed` 是构建内固定常量 `3e627e1b4c63f913`，与 nonce、key、deviceToken、轨迹内容全部无关。两组样本逐字节 0 差异。**

---

## 0. 一句话结论

```
T    = deflate_b64                                     # pako(zlib) of (nonce_hex32 ‖ payloadJSON)
data = btoa( F(T) )                                    # F 见 §4，输出长度 = |T|
enc  = b64decode(data)                                 # = 25 13 27 ‖ F(T)[3:]   （魔数是 F 的产物，非字面常量）
```
`F` 只用一个**写死的 16 位十六进制种子**打乱一张 64 项表，然后做逐字符可逆变换。**`data` 现在可以完全离线生成**（给 T 就够），不再需要浏览器、UI、nonce 或任何密钥。

验证（`node enc_repro.js`）：

| 样本 | `T` 长度 | `data` 长度 | 我们输出长度 | `data` 全串相等 | `enc` 逐字节差异 |
|---|---|---|---|---|---|
| cvp_sample_1 | 524 | 700 | 700 | **true** | **0 / 524** |
| cvp_sample_2 | 536 | 716 | 716 | **true** | **0 / 536** |

---

## 1. VM 结构（pe.069）

| 部件 | 偏移 | 规模 | 说明 |
|---|---|---|---|
| 解释器 `L` | `[210609, 214587)` | 3 978 字符 | `function t(n,e,r,i,a,o)`：`n`=pc、`e`=操作数栈、`r`=字节码、`i`=常量池、`a`=作用域配置、`o`=arguments |
| 字节码 `H` | `[218834, 263590)` | **16 838 words** | 大程序（= 32 位十六进制随机串生成器，即 nonce 生成） |
| 常量池 `X` | `[263593, 264719)` | 291 项 | 含 `"random","floor","toString","charCodeAt","256","length","push","map","join"` → 与 `nonce` 用途自洽 |
| 字节码 `F` | `[214590, 218314)` | **1 498 words** | **小程序 = 暗层（本文主角）** |
| 常量池 `q` | `[218317, 218831)` | 135 项 | 25 个字符串 + 109 个数字（数字里包含 6 组 XOR 编码的字符串与 64 项置换表） |

**两个调用点**（都在状态机 `tc` `[269098, 307223)` 内）：

```js
tc:294945   nO = L(0, [], H, X, nD, [nO, eP(73,222)]) + nO     // 大程序：生成 32-hex 随机串（nonce）
tc:296633   u  = L(0, [], F, q, eO, e7)                        // 小程序：暗层 → btoa → data
```

与运行时抓到的调用栈一致：`window.btoa ← t(解释器) ← tc@296634 ← …`，即 **btoa 由 `F` 程序内部发起**（`u.C` = `"btoa"`，见 §4.1）。

---

## 2. 解释器 opcode 表（**已证明**：用它解码两个程序，pc 都恰好走到数组末尾，`desync=0`）

| op | 语义 | 栈 | 操作数 |
|---|---|---|---|
| 0 | `u[pool[pc++]] = undefined`（声明局部） | – | 池索引 |
| 1 | `>>>` | 2→1 | push 标志 |
| 2 | `<` | 2→1 | push |
| 3 | `push {}` | 0→1 | – |
| 4 | `/` | 2→1 | push |
| 5 | 读局部 `u[pool[pc++]]` | 0→1 | 池索引 + push |
| 6 | 压常量 `pool[pc++]` | 0→1 | 池索引 |
| 7 | `throw` | 1→0 | – |
| 8 / 9 | `-` / `*` | 2→1 | push |
| 10 | `delete` | 2→1 | push |
| 11 / 49 / 2 / 52 | `>=` / `<=` / `<` / `>` | 2→1 | push |
| 12 | **字符串拼接 n 段** | n→1 | n + push |
| 13 | DUP | 1→2 | – |
| 14 | 弹 n 个 | n+1→1 | n + push |
| 15 / 30 | `--` / `++` | 1→1 | 局部? + push |
| 16 | pop | 1→0 | – |
| 17 | try/catch/finally | – | 4 个跳转 |
| 18 / 22 / 36 / 37 | `!==` / `!=` / `==` / `===` | 2→1 | push |
| **19** | **调用（inline 块，带失败跳转）** | – | 跳转目标 |
| 20 / 29 / 1 | `<<` / `>>` / `>>>` | 2→1 | push |
| **21** | **RETURN**（`a.r` 真→弹栈，假→吃字面量） | – | 0 或 1 |
| 23 | `in` | 2→1 | push |
| 24 | `!` | 1→1 | push |
| 25 / 54 | **JMP_IF_FALSE** / **JMP_IF_TRUE** | 1→0 | 跳转 |
| 26 | `%` | 2→1 | push |
| 27 | **MAKE_FUNC**（闭包，帧 `{s:u,t:this,r:1}`） | 1→1 | 函数 pc + 是否压栈 |
| 28 | 读成员 `obj[key]` | 2→1 | push |
| **38 / 46** | **`^`（XOR）**（两者共用同一处理器） | 2→1 | push |
| **39** | **写成员** `obj[key]=value`（栈序 value,obj,key） | 3→0 | push |
| 40 | 批量写（`[].concat(e)`） | – | n |
| 41 | `s=1`（标记结束，继续执行） | – | – |
| **42** | **`|`（OR）** | 2→1 | push |
| 43 / 44 | `typeof` / `~` | 1→1 | push |
| 45 | push `window` | 0→1 | – |
| **47** | **`&`（AND）** | 2→1 | push |
| 48 | push `undefined` | 0→1 | push |
| 50 | 写成员 `h[l]=f` | 3→0 | push |
| 51 | **NEW_ARRAY n** | n→1 | n + push |
| 53 | 跳转表（switch） | 2→0 | 默认目标 |
| **55** | **方法调用** `h[l].apply(h,args)`（栈序 obj,name,args…） | n+2→1 | argc + push |
| 56 | **push scope `u`** | 0→1 | – |

> 关键写法：`PUSH_SCOPE + PUSH_CONST "x" + LOAD_MEMBER` = 读局部变量 `u.x`；`PUSH_SCOPE + PUSH_CONST "x" + LOAD_MEMBER + LOAD_MEMBER` = `u.x[key]`。

---

## 3. `F` 程序的指令流（779 条指令，`static/work/F_disasm.txt`）

```
[0 .. 66]     声明局部 o,n,r,t,e,a,h,m,C,l,c,f,s；建立全局别名
              u.e = window.Boolean   u.a = window.Number   u.h = window.String
[66 .. 300]   6 个 XOR 解码 lambda：  x => String.fromCharCode(x ^ KEY)
              KEY / 数组 / 解出的名字（**全部已解**）：
               194  [163,182,173,160]                     -> u.m = "atob"
               174  [204,218,193,207]                     -> u.C = "btoa"
                18  [119,124,113,125,118,119,71,64,91,81,125,127,98,125,124,119,124,102]
                                                          -> u.l = "encodeURIComponent"
               144  [244,245,243,255,244,245,197,194,217,211,255,253,224,255,254,245,254,228]
                                                          -> u.c = "decodeURIComponent"
               168  [205,219,203,201,216,205]             -> u.f = "escape"
                33  [ 84, 79, 68, 82, 66, 64, 81, 68]     -> u.s = "unescape"
[532 .. 560]  o = arguments[0];  n = arguments[1]
[563 .. 581]  o = u.s(u.l(o))                    // = unescape(encodeURIComponent(o))，UTF-8→latin1
[583 .. 717]  r = [64 项置换表]（0..63 的一个全排列，见 §4.2）
[719]         CALL_IF_DEFINED @984               // 先跑"打乱表"子过程，undefined 才跳到 984
   [721 .. 973]  阶段 1：用 n 打乱 r（循环 64 次，Fisher-Yates 变体，3-XOR 交换）
[984]         t = ""                              // 输出累加器（局部 t 被复用）
[993..1011]   n = 0;  e = 0;  a = 0
[1020]        CALL_OR_JUMP @1464
   [1022 .. 1462] 阶段 2：逐字符变换（循环 |o| 次）
[1473]        t = u.C.call(null, t)               // = btoa(t)
[1493]        RETURN t
```

### 3.1 阶段 1（pc 721..973）

```
o2 = 0; t2 = 0
while (o2 < 64) {
    t2 = (((o2 + t2) + r[o2] + r[t2]) >> 1) + n.charCodeAt(o2 % n.length)
    t2 &= 63
    if (o2 !== t2) { r[o2] ^= r[t2]; r[t2] ^= r[o2]; r[o2] ^= r[t2]; }
    o2++
}
```

### 3.2 阶段 2（pc 1022..1462）

```
a = ((e ^ a) + (r[e] ^ r[a])) & 63
if (e !== a) { 3-XOR swap r[e], r[a] }
m  = o.charCodeAt(i) + e + r[e]
m  = m - (a + r[a])
m  = m ^ (r[e] + r[a])
m  = m ^ r[(r[e] + r[a]) & 63]
m &= 255
t += String.fromCharCode(m)
e  = (e + 1) & 63
i++
```

> 位运算 opcode 对应：`& 63` = op47(AND)，`>> 1` = op29(SHR)，`^` = op38/46(XOR)，`& 255` = op47，`%` = op26(MOD)，`+/-` = op34/op8。**没有任何 `|128`/`&127` 式的高位置位**——上一轮从统计里猜的"7 bit 通道 + 20% 噪声位"是**采样不足导致的误判**，真实机理是上面这套"表驱动 + 状态推进"的置换/代换（见 §6 的更正）。

---

## 4. `enc` 的构造等式（**已证明**，两组样本逐字节 0 差异）

### 4.1 输入 / 种子 / 输出

```
输入  : o = unescape(encodeURIComponent(T))     // T 是纯 ASCII base64 ⇒ o === T
种子  : n = "3e627e1b4c63f913"                  // 常量，见 §5
输出  : btoa( transform(o, n) )  长度 = |T|      // 因此 data 的 b64decode 长度 = |T| = 524/536
```

### 4.2 常量表（打乱前，64 项全排列）

```
[32,50,10,51,6,44,37,16,46,11,62,19,43,25,23,30,
 60,33,53,34,7,26,12,48,5,2,20,4,61,13,47,49,
 18,29,27,22,1,17,39,56,41,38,55,31,15,58,52,40,
  8,57,45,35,59,36,42,54,63,3,24,28,14,9,0,21]
```

用种子 `3e627e1b4c63f913` 打乱后（**构建内固定**，可直接硬编码）：

```
[35,21,29,51,50,31,6,40,18,7,38,36,4,59,58,23,
  9,26,2,10,46,15,41,1,16,43,45,17,44,3,52,14,
 60,39,28,12,32,13,8,34,37,53,11,22,24,19,30,25,
 63,57,61,56,62,0,5,33,48,20,27,47,54,49,55,42]
```

### 4.3 逐字节公式

```
enc[i] = Byte(  ( ( ( T.charCodeAt(i) + e + r[e] ) - ( a + r[a] ) )
                    ^ ( r[e] + r[a] )
                    ^ r[ (r[e] + r[a]) & 63 ] ) & 0xFF )
其中 (e, a, r) 按 §3.1/§3.2 迭代；r 在阶段 2 里还会被继续交换（自修改表）
```

### 4.4 魔数 `0x25 0x13 0x27` 的来历（**已证明，是产物而非字面常量**）

i=0,1,2 时 `e=0,1,2`、`a` 由公式推进，代入 T 的前 3 个字符（恒为 `e`,`J`,`z`/`y`）与固定表：

```
first3 = 0x25 0x13 0x27     ← 实测复算命中
```

⇒ 因为 (a) 种子固定、(b) `T` 永远以 `eJ` 开头（zlib 头 `0x78 0x9c` 的 base64），前 3 字节稳定为魔数。
这也解释了为什么当年在源码里怎么搜都搜不到 `251327` 字面量。

---

## 5. 种子的来源（**已证明**，从状态机解出）

```js
tc:306599   e7 = [ n8.w($, nO),  tg + n8.X(eP, 59, 287) ]
tc:279554   tg = eP(9, 89)
辅助函数（均在同一状态机内被赋值，可读）：
  n8.w = function(t,n){ return t(n) }        // tc:293919
  n8.X = function(t,n,e){ return t(n,e) }    // tc:304267
  n8.c = function(t,n){ return t & n }       // tc:305013
  n8.R = function(t,n){ return t + n }
  eP   = function(t,n){ return nc(n-3, t) }  // 字符串池解码包装
```

于是：
```
tg           = eP(9, 89)    = nc(86,  9) = "3e627e1b"
第二段        = eP(59, 287)  = nc(284,59) = "4c63f913"
e7[1] = 种子 = tg + 第二段   = "3e627e1b4c63f913"
```

`nc` = 该 bundle 自己的字符串池解码器（`[322080, 326154)`，与我前几轮解出的同族：65 字节表 + 逐字节 XOR + percent→UTF-8）。`nc(86,9)`/`nc(284,59)` 是用 bundle 自身的解码器在 Node 里直接求值得到的（`node/decpool.js`），**不是猜的**。

`e7[0] = n8.w($, nO)`（`$` = 局部函数，`nO` = 大程序生成的 32-hex 随机串）→ 对应 VM 的 `arguments[0]`。由 §0 的长度关系与全串命中可知 **`e7[0]` 必须等于 `T`**，即 `$(nO)` 返回 deflate_b64（`$` 这一层未逐一展开，但结论已被两组样本的全串相等反证锁定）。

---

## 6. 与上一轮结论的更正（重要）

| 上一轮（REPORT_A / A2）的推断 | 本轮实测结果 |
|---|---|
| "`enc` 是 7 bit 通道 + 约 20% 噪声高位，`enc = ((T ^ ks7) & 0x7F) \| (f<<7)`" | **推翻**。真实是"状态推进 + 自修改 64 表"的代换；`enc` 的统计偏斜只是该变换的分布特征。上一轮"20% 高字节 / 40% 字母表"的频率拟合看似吻合，但它不是机理，只是巧合级别的拟合。 |
| "`ks` 两组只有 20% 一致，既不像位置流也不像随机流" | **解释**：`enc[i]` 依赖整条前缀状态 `(e,a,r)`，任一处 `T` 变化会沿链条传播；同位置 `ks` 只能偶然相同 ⇒ 20% 是"局部未受影响"的比例。 |
| "T 字符相同的 16 个位置 ks 100% 相同" | 与"state 相同则输出相同"一致（这些位置的前缀状态恰好一致）。 |
| "`data` 的 btoa 出口在 feilin076 / `ny`" | **错误，已撤回**。出口在 `pe.069` 的 `F` 程序里（`u.C = "btoa"`）。feilin076 的 `ny` 第六轮已证无引用。 |
| "需要同轮 `(T, enc)` 才能定案" | 现在不需要了：**种子是常量**，任意 `T` 都能离线算出 `data`。 |

---

## 7. 复现（可直接落地）

```js
// static/node/enc_repro.js 核心（完整版含验证）
const TABLE = [/* §4.2 打乱前的 64 项 */];
const SEED  = '3e627e1b4c63f913';
function armour(T) {
  const r = TABLE.slice(), n = SEED, M = 63;
  const o = unescape(encodeURIComponent(T));
  for (let i = 0, t = 0; i < 64; i++) {
    t = ((((i + t) + r[i] + r[t]) >> 1) + n.charCodeAt(i % n.length)) & M;
    if (i !== t) { r[i]^=r[t]; r[t]^=r[i]; r[i]^=r[t]; }
  }
  const bytes = Buffer.alloc(o.length);
  let e = 0, a = 0;
  for (let i = 0; i < o.length; i++) {
    a = ((e ^ a) + (r[e] ^ r[a])) & M;
    if (e !== a) { r[e]^=r[a]; r[a]^=r[e]; r[e]^=r[a]; }
    let m = o.charCodeAt(i) + e + r[e];
    m = m - (a + r[a]);
    m = m ^ (r[e] + r[a]);
    m = m ^ r[(r[e] + r[a]) & M];
    bytes[i] = m & 0xff;
    e = (e + 1) & M;
  }
  return bytes.toString('latin1');
}
const data = Buffer.from(armour(T), 'latin1').toString('base64');
```

> 注意：`btoa` 作用在 latin1 字符串上，等价于 `Buffer.from(bytes).toString('base64')`。

**验证输出（`node enc_repro.js`）**
```
===== cvp_sample_1.json
  data 全串相等: true       enc 逐字节不等数: 0 / 524     first3 = 251327（双方一致）
===== cvp_sample_2.json
  data 全串相等: true       enc 逐字节不等数: 0 / 536     first3 = 251327（双方一致）
```

---

## 8. 这对整条链路意味着什么

1. **`data` 已可纯离线生成**：`payload JSON + nonce` → `pako.deflate` → `base64` → `armour(T)` → `data`。不需要 UI、不需要实例、不需要 nonce 以外的任何会话值，也**不需要 key**。
2. 之前阻塞运行时侧的 "mount 不通 ⇒ 拿不到 `data`" 已经不成立：可以直接用 `deflate_b64` + 本脚本产出 `data`，拼进 `captchaVerifyParam`（`{sceneId, certifyId, deviceToken, data}`）后发 `slideAuth`。
3. 仍取决于服务端的是：`isTrusted` 轨迹可信度（旧结论未变）、`certifyId`/`deviceToken` 生命周期、以及 `arg` 字段（仍未解）。
4. **脆弱点**：种子 `3e627e1b4c63f913` 与 64 项表都是**构建常量**。bundle hash 一变就要重新解（脚本已参数化，重跑 `disasm.js` + `decpool.js` 即可）。

---

## 9. 强度汇总

| 结论 | 强度 |
|---|---|
| pe.069 的 `L/H/X/F/q` 偏移与规模 | 已证明（AST + 偏移） |
| 56 个 opcode 的语义表 | 已证明（用表解码 `F`(1498) 与 `H`(16838) 均 `desync=0`） |
| `F` 的完整指令流与两阶段 pseudocode | 已证明（`work/F_disasm.txt` 782 行） |
| `data = btoa(transform(T, seed))` | **已证明**（两组样本全串 0 差异） |
| 种子 = `"3e627e1b4c63f913"`（常量） | 已证明（由 `nc(86,9)`+`nc(284,59)` 用 bundle 自身解码器求值 + 样本命中） |
| 魔数 `25 13 27` 是变换产物 | 已证明（复算命中） |
| `data` 与 nonce / key 无关 | 已证明（同 T 不同 nonce 两组样本都命中同一 seed） |
| `e7[0] = $(nO) == T` 这一步的具体实现 | 有支持（长度关系 + 全串命中的强约束，未逐一展开 `$`） |
| `arg` 字段来源 | 未定（本轮未攻） |
| 上一轮 "7 bit 通道 / 20% 噪声位" 模型 | **已排除**（机理已解出，统计拟合属巧合） |

---

## 10. 本轮新增脚本

| 路径 | 作用 |
|---|---|
| `static/node/vm_struct.js` | 报告任意 pe bundle 的解释器/字节码/常量池偏移 |
| `static/node/disasm.js` | **字节码反汇编器**（56 opcode，输出 `work/F_disasm.txt`、`work/H_disasm.txt`） |
| `static/node/pools.js` | 打印常量池 `q`/`X` 的字符串与数字项 |
| `static/node/decpool.js` | 抽取并执行 bundle 自带的池解码器（`nc`），精确解出任意池项 |
| `static/node/vmtry.js` | 直接运行真实 VM 程序（`L(0,[],F,q,{r:1},[input,seed])`），用于暴力验证输入/种子 |
| `static/node/find_var.js` | 定位任意偏移的所属函数 + 某变量在该函数内的所有读写点 |
| `static/node/enc_repro.js` | **纯 JS 复现 + 两组样本逐字节验证**（最终交付） |
| `static/work/F_disasm.txt` / `H_disasm.txt` | 反汇编产物（782 / 8147 行） |
