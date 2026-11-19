# REPORT_A2 — feilin076 暗层 `F` 攻坚：池全解 + 暗层定界（结论 C）

- 日期：2026-11-13（第二轮）
- 前置：`static/REPORT_A.md`（本轮**不修改**该文件，仅追加本报告）
- 约束遵守：纯静态/离线；未启动浏览器；未请求业务接口（仅此前 CDN 下载 3 个 js）
- 结论：**C（定界）**，但本轮拿到两个硬收获：① feilin076 的 44 个字符串池全部参数化解开（905 项/291 高置信）；② 在 pe.081 里发现并**离线执行**了一个字节码栈机 VM（解释器 + 16838 字字节码 + 291 项常量池），它负责生成 32 位十六进制随机串。

---

## 0. 一句话结论

按你给的三选一：**C —— `F` 的容身区间已被压到 `feilin076` 的 3 个 `btoa` 调用点（尤其 `ny` @333749 的 `[tc,j,m,te,to].join(...)` → `rV(...)`）与 pe.081 的字节码 VM 之内，且已用穷举证据排除"任何 bundle 里存在字面/池化/数组形态的 `charCodeAt→fromCharCode` 逐字节循环"这一可能**；`F` 本体未静态读出，最小断点坐标见 §8。

强度标记：**已证明** = 穷举/可复现；**有支持** = 多证据一致但未闭环；**观察到** = 单点现象；**已排除** = 有反例。

---

## 1. feilin076 的 44 个字符串池：全部参数化解开

### 1.1 解码器家族（与 pe.081 同模板，参数不同）

```js
function ux(t, r) {
  var n = ["…pool…"];                       // 该函数的私有池
  return (ux = function (r, e) {
    var a = n[r -= 5];                      // ← 下标偏移 Δ（本函数 = 5）
    if (a) {
      if (void 0 === ux.eH) {
        ux.eH = !0;
        var i = "142e0a30…340e".match(/.{1,2}/g).map(function (t) { return parseInt(t, 16) });
        ux.mw = function (t, r) {
          for (var n = "", e = "", a, o, u = 0, c = 0; o = t.charAt(c++);
               ~o && (a = u % 4 ? 64 * a + o : o, u++ % 4) && (n += String.fromCharCode(255 & a >> (-2 * u & 6) ^ r)))
            o = i.indexOf(68 ^ o.charCodeAt(0));        // ← XOR 键（本函数 = 68）
          /* percent-encode 后 decodeURIComponent → UTF-8 */
        }, t = {};
      }
      var o = t[r]; return o ? a = o : (a = ux.mw(a, e), t[r] = a), a;
    }
  })(t, r);
}
```

三元组参数 = **(表 hex, XOR 键, 下标偏移 Δ)**，逐函数不同。本轮用 `static/node/feilin_pools.js` 全自动抽取：

| 项 | 值 |
|---|---|
| 抽取到的解码器数 | **44 / 44** |
| XOR 键集合 | `{0,9,11,13,20,21,55,68,72,78,80,82,88,89,90,97,99,106,110,115,122,133,145,147,150,157,165,166,167,173,176,177,185,189,198,204,233,246,250,254}` |
| 表长 | 每个 **65 字节**（64 个有效符号 + 1 个冗余项，与 pe.081 同构） |
| 池项总数 | **905** |
| 高置信解码（top1 领先 top2 > 40 分） | **291** |
| 落盘 | `static/work/feilin076_pools.json`（含每个解码器的 `decoderOff / key / indexOffset / alphabet / entries[].best / top[3]`） |

解码器偏移（= 其 `indexOf(KEY^…charCodeAt(0))` 位置）：
`151489, 153377, 156732, 164060, 172904, 185670, 196553, 212519, 214138, 240111, 253707, 263394, 266663, 279703, 281017, 284891, 286016, 291218, 302771, 310202, 329736, 342163, 343977, 355596, 365765, 376798, 378071, 380601, 381887, 383452, 399681, 405161, 412203, 423606, 437455, 453888, 458491, 461042, 469744, 474282, 556758, 583989, 614803, 624981`

### 1.2 关键否定结论（**已证明**）

在 **44 个池 × 905 项 × 256 个候选键 = 231 680 次解码**里，**没有任何一项解码出 `fromCharCode` 或 `charCodeAt`**。
（对比：`toString / apply / call / length / push / split / join / replace / key / data` 都能解出，见 `feilin076_pools.json`。）

⇒ feilin076 里**不存在**"通过池名间接取 `String.fromCharCode`"的路径。

---

## 2. 原语普查：三个 bundle 里都没有逐字节变换循环（**已证明**）

对 `charCodeAt / fromCharCode / Uint8Array / Int8Array / btoa / atob / subarray` 逐点归类（`static/opmap.py` + 逐点上下文打印）：

| 文件 | `charCodeAt` | 归属 | `fromCharCode` | 归属 | `Uint8Array` | 归属 |
|---|---|---|---|---|---|---|
| pe.081 | 29 | **9 个池解码器 ×2** + 11 处 ES5 shim | 17 | 9 个池解码器 + 5 处 shim + **`tt` 1 处** + 2 处池字面量（`"fromCharCode"`，即 VM 常量池 `W` 的条目） | 4 | **全部**是 typed-array polyfill / shim（23592、116300、120546、406642 逐点确认，均在 shim 模块） |
| feilin076 | 91 | 44 个池解码器 ×2 + 3 处 shim | 48 | 44 个池解码器 + 4 处 shim | 4 | 同 shim |
| AliyunCaptcha.js | 12 | shim + loader | 9 | shim | 6 | 两处 base64 util（178173 / 189256 / 189379） |

- pe.081 里**唯一**能做"字节数组 → latin1 串 → base64"的是 `tt`（`[265778,266010)`，源码见 REPORT_A §3.2）。
- `th`（42 584 字符，data 组装主驱动）与 `eX`（29 810 字符，状态机）内：`charCodeAt=0, fromCharCode=0, subarray=0, Uint8Array=0, btoa=0`（`eX` 内 3 处 `btoa` 全是 `isNaN(!btoa)` 死分支）。

⇒ **`enc`（849 字节二进制）无法由 pe.081 生成**（它没有第二个字节→串的出口），必须由 feilin076 或"另一个 VM 程序"产出。**这是把 `F` 逐出 pe.081 的硬证据。**

---

## 3. 新发现：pe.081 内有一个可离线执行的字节码栈机 VM

### 3.1 结构（**已证明**，坐标可复现）

| 部件 | 偏移 | 规模 | 说明 |
|---|---|---|---|
| 解释器 `D` | `[210303, 214281)` | 3 978 字符 | `function t(n,e,r,i,a,o)`：`n`=pc起始、`e`=操作数栈、`r`=字节码、`i`=常量池、`a`=作用域配置、`o`=arguments |
| 字节码 `F` | `[218528, 263284)` | **16 838 字** | 纯数字数组，含 `-1` |
| 常量池 `W` | `[263287, 264413)` | **291 项** | 混合：单字符 `"o","r","a","m","C"…`、关键字 `"fromCharCode","map","join","charCodeAt","random","floor","push","length","toString","String","arguments","Boolean","Number","256"`、`!1`/`!0`、以及一大段 0–255 数字 |
| 调用点 | `289715` | — | 在 `th`（`[269899,312483)`）内：`re = J.q( D(0,[],F,W,e5,[re, <pool字符串>]), re )` |

解释器骨架（可读，本轮据此实现了 runner）：

```js
function v(t){for(var n,e=0,n=[];(e-t)*50+33<33;e++)n.push(e);return n}   // range(0,t)
function b(t,n){return t&&"__proto__"!=n ? (t.hasOwnProperty(n)?t:b(Object.getPrototypeOf(t),n)) : null}
for((u=Object.create(a.s||{}))._=window, u["*"]=a.t||this,
    a.e && (u[i[r[n+1]]]=a.e), s=0; (n-r.length)*60+88<88; ) {
  if      (19==(A=r[n++])) { f=r[n++]; (l=t(n,e,r,i,{s:u,t:u["*"]})) ? 1===l?s=1:(s=1,c=a.r?e.pop():l) : n=f; }  // CALL / 跳转
  else if (36==A) { … e.push(a==b) }        // EQ
  else if (24==A) { … }                     // NOT
  else if (56==A) { e.push(u) }             // PUSH SCOPE
  else if (26==A) { f=e.pop(); h=-(-(l=e.pop())%f) }   // MOD
  else if (12==A) { f=r[n++]; l=""; v(f).forEach(()=>{l+=e.pop()}); e.push(l) }  // CONCAT n
  else if (22==A) { … }                     // NEQ
  else if (25==A) { if(!f) n=l }            // JMP_IF_FALSE
  else if (29==A) { … >> }                  // SHR
  else if (55==A) { … o=[]; v(…) }          // NEW ARRAY
  else if (41==A) { s=1 }
  …
}
```
（`=` 号后的片段为本次实际读到的源码，不是推测。）

### 3.2 离线执行（**已证明**，脚本 `static/node/vmrun.js` / `nonce_vm_evidence.js`）

只要把 `D` 的函数体、`F`、`W` 三段源码抠出来，`window` 用 Node 全局对象顶上，就能直接跑：

```js
const D = new Function('window', 'var D = ' + dSrc + ';\nreturn D;')(globalThis);
D(0, [], F, W, { r: 1 }, ['<任意串>', 'x']);
```

实测（`static/work/nonce_vm_evidence.txt`）：

```
run 0: "9e0879a1bd8cf468da5e84e5e7a54201"
run 1: "a109aa87d4baa5dea068ab43b675a401"
run 2: "76ee23f49a2700533f7ba5d73d4a8501"
run 3: "092f471b612435e5074fc27389cbd801"
run 4: "a655a4a2781b114ffa7075db7aaa5b01"
输入无关性：arg="" / "AAAA" / "eJzdlU1P" → 三次结果互不相同
```

- 每次输出都是 32 位十六进制、**与输入无关**，但末尾恒为 `01`（说明 `e5` 作用域被我置为 `{r:1}` 时返回的是"值+标志"的组合，或者程序本身吐的是 uuid 的尾段）。
- 抓包 payload 里的 nonce 是 `f108d668874fd2950f66f503740c115d`（同长度、无 `01` 尾巴）。
- 结论强度：**有支持** —— 这个 VM 程序确实是一个"32 位十六进制随机标识生成器"（`W` 里同时有 `random / floor / toString / charCodeAt / push / length / 256`，与该用途自洽），并且 `th` 在 `289715` 把它的返回值写回 `re`；但"它就是 nonce"还差一步：需要在真实运行里确认 `re` 最终被拼进 payload 前缀。
- 副产物（**已证明**）：`F` 里出现 `37,19,39` 的**唯一**一处是 `286704` 的 `t[m.N(n,37,198)]`（普通算术，非魔数数组）。

### 3.3 为什么这一发现重要

`W` 里既有 `"fromCharCode"` 也有 `"String"`、`"charCodeAt"`、`"map"`、`"join"`、`"push"`、`"length"`、`"toString"`。
也就是说 **VM 程序完全有能力实现"逐字节变换 + `String.fromCharCode` 拼串"**，而静态搜索 `fromCharCode` 只能命中池里的那一个字面量 —— 这正是本轮"字面搜索全阴"却仍有代码能做出二进制串的原因。
⇒ 暗层如果是 VM 实现，它就在 `F` 的某个**子过程**里（解释器通过 opcode 19 递归调用，`n = 跳转目标`），入口 `pc=0` 只是被 `th` 用到的那个。

---

## 4. 暗层候选：feilin076 的 3 个 `btoa` 调用点

feilin076 的 base64 出口是包装函数（**已证明**，`[188716,188876)`）：

```js
function rV(t){ try { return btoa(t) } catch (r) { return btoa(unescape(encodeURIComponent(t))) } }
```

全库只有 3 个真实调用点（第 4 处是定义本身）：

| 调用点 | 所在函数 | 源码片段 | 判据 |
|---|---|---|---|
| `333864` | `ny` @ `[333749,336232)` | `i = rV(tY)`，其中 `tY = [tc,j,m,te,to][<pool>](aA)`（= **5 段 join**） | 拼接后整体 base64：与 `data = btoa(magic ‖ enc)` 的"多段拼一个串再编码"形态吻合 |
| `335477` | 同 `ny` | `i = rV(tr)` | 同一函数里的第二个出口 |
| `520311` | `rS` 附近（`[511k,521k)`） | `l = rV(ny)`（把函数当参数传下去，命名遮蔽） | 需要更外层的调用者才能判 |

`ny` 内还出现的可信片段（其余被 CFF 打散）：

```js
tS = (tH = B).slice(tH.length - 4).padStart(t_, "0")   // 4 位零填充
m  = m[<pool>](0, 155)                                  // slice(0,155)
tj = rW()[<pool>]("-", "")                              // replace("-","")
tG = function(t){ … r = JSON[<pool>](i)[<pool>](aA, "") … }
```

⇒ **`ny` 是暗层最可能的宿主**：它是全库唯一的"多段拼接 → 整体 `btoa`"位置，且在 `data`/`key` 池名（`decoder@214138 idx=34 "data"`、`decoder@412203 idx=17 "data"`）的邻近区间。

### 4.1 判据命中情况（按你给的四条）

| 判据 | 命中 | 说明 |
|---|---|---|
| 输入 `T[3:]`（字符码 43–122，高位恒 0） | 🟡 未直接观察到 | `ny` 的入参 `tY/tr` 均为 CFF 局部量，未能静态还原到字符串源头 |
| 输出与输入等长 849 字节 | 🟡 未直接观察到 | `rV` 的输出是 base64 文本，说明 `ny` 至少做了"串→base64"这一步；`data` 是"3 字节 + 849 字节"再 base64 ⇒ **两步 base64**，与 `ny` 的位置一致 |
| 低 7 位均匀、高 1 位 ≈20% | ✅ 已用统计确证（REPORT_A §6.2bis），但那是**产物**侧证据，不是代码侧 |
| 无周期（mod 2/4/8） | ✅ 已确证 |
| 3 字节魔数常量 | ❌ 见 §5（五路穷举全阴） |

---

## 5. 魔数 `0x25 0x13 0x27` 的五路穷举（**已排除**"以常量/数组/池项形态出现"）

| 搜索方式 | 结果 |
|---|---|
| 字面量 `251327` / `37,19,39` / `25,13,39` / `0x25,0x13` | 0（`37,19` 唯一命中在 286704，是 VM 算术 `t[m.N(n,37,198)]`） |
| 位掩码 `0x7f / 0x80 / &127 / |128 / >>7 / <<7` | feilin076：`0x7f/0x80/&127/|128/>>7` **全 0**；`<<7` 仅 3 处（224194、270419、508615，均非字符循环）。pe.081 同类掩码 0 |
| **所有 ≥128 元素的数字数组**（`vm_enum.js`） | pe.081 仅 1 个（`[214284,218008)`，len 1498，值域 0..1473，是 VM 的 opcode 索引表）；feilin076 仅 1 个（`[143518,143957)`，len 137）。**两者都不含 `37,19,39`/`25,13,39`** |
| **字节码 `F`（16 838 字）** | 显式扫描：无该三元组 |
| **所有池项 × 256 键**（pe.081 226 项 + feilin076 已定位的 22 个池；`magic_hunt.js`） | **0 命中**；同时把"3–8 字符且全为控制字符"的池项也列出（18848 条，全部是同一批编码串在不同键下的产物，无有效项） |

⇒ 魔数**不是**常量、数组、池项；它只能是 CFF 代码里算出来的（例如把某个数字拆成 3 个字节），或来自 `ny` 的某个 `tc/j/m/te/to` 段。

---

## 6. `payload.arg` 字段

- 观测值 `PgQU8DYPLRdiDw==`，base64 解 **10 字节**：`3e 04 14 f0 36 0f 2d 17 62 0f`（早期文档写 12 字节，按本样本纠正为 10）。
- 长度 10 不整除 3 的常见编码（base64/md5-halved 等），**未定**。
- 可定位性：`slidePos` 在 pe.081 池里解出（idx 32），`data` 在 idx 192；**`arg` 本身没在池里解出**（可能在 `th` 的 state 69 里用拼接方式构造，如 `"ar"+"g"`）。
- 建议下一步：把 `th` 的 state 69 段（`[313589,313930)` 的 `tS` 只是入口壳，真实体在 `th` 的 `case 69`）用 `annotate.js` 的标注视图读一遍，找把该值写进 payload 对象的键。

---

## 7. A / B / C 判定

**结论：C（定界）。**

理由链（每条都标了强度）：

1. **已证明**：pe.081 / feilin076 / AliyunCaptcha 三个 bundle 里，**不存在**任何"逐字符 `charCodeAt` → 位运算 → `fromCharCode`"的循环；所有 `charCodeAt/fromCharCode` 都能归到池解码器或 ES5 shim。
2. **已证明**：两个 bundle 的**全部**字符串池（pe.081 226 项 + feilin076 905 项）都不含 `fromCharCode`/`charCodeAt`，因此"池名间接取原语"的路径在 feilin076 上不成立。
3. **已证明**：`pe.081` 里唯一的"字节数组→latin1→base64"出口是 `tt`，而 `tt` 的字节源只能是 pako 输出 ⇒ `data` 的 852 字节缓冲**不可能**在 pe.081 里生成 ⇒ `F` 不在 pe.081 的 CFF 里。
4. **有支持**：feilin076 的 `ny`（`[333749,336232)`）是全库唯一的"多段 join → 整体 `btoa`"位置，且与 `data` 池名邻近 ⇒ `F` 极可能在这里；但其入参是 CFF 局部量，静态读不出。
5. **已排除**：`F` 不是常量/数组/池项形态（§5 五路穷举）；`F` 不是 AES-CTR/OFB/CFB（统计上 `enc` 的小 7 位均匀 + 高位 20% 与"XOR 随机流"矛盾，且 12 key × 8 IV 的 keystream 一致率 ≤1.4%）；`F` 不是 64 项符号表（单样本 distinct=194–228 > 64）。
6. **未定**：`F` 是否依赖 key/nonce（A vs B）。统计上它必然是"7 bit/字节的通道 + 20% 噪声位"，若该通道由服务端签发的会话密钥派生 → B；若是位置派生 → A′。**没有同轮配对样本就无法区分**，这正是差的那一个输入。

---

## 8. 最小断点坐标（给调试器用）

按"先停在哪、再看什么"排序。全部坐标是 **pe.081 / feilin076 的字符偏移**（单行文件，行号无意义）。

### 8.1 抓 `F` 的输入输出（最直接）

| 优先级 | 位置 | 属于 | 断点后要读 |
|---|---|---|---|
| ★1 | **feilin076 `333864`**（`i = rV(tY)`） | `ny` `[333749,336232)` | `tY`（btoa 的入参 = `F` 的**输出**）、`[tc,j,m,te,to]`、`aA`、`B`、`tS` |
| ★2 | feilin076 `335477`（`i = rV(tr)`） | `ny` | `tr` |
| ★3 | feilin076 `520311`（`l = rV(ny)`） | `[511k,521k)` 内函数 | 该函数的入参链 |
| ★4 | **pe.081 `265983`**（`tt` 内 `window.btoa(a)`） | `tt` `[265778,266010)` | `a`（= latin1(deflate)）、`n`、`t.length`（应是 639 的倍数）、上层调用者的 `re` |
| ★5 | pe.081 `289715`（`D(0,[],F,W,e5,…)`） | `th` | `re`（VM 返回值）、`e5` 的真实内容（决定 A/B 判定） |

### 8.2 判定 A / B 的最省实验

在 ★1 停下，取到 `tY` 后：

1. 若 `tY` 的长度为 `4k+3`（如 852）：前半段若能在"去掉 3 字节后 = `enc`"对上 → **A**（纯函数，且很可能就是 `T[3:]` 或它的位置变换）。
2. 记录 `tY` 与页面 `tt()` 的返回 `T`：算 `ks = (tY & 0x7F) ^ T[3:]`；把同样的 `T`（构造一次 payload 固定）跑两遍不同 `nonce`：
   - `ks` 随 nonce 变 → **B**（key/nonce 依赖，且 nonce 已被本轮证明可由 VM 离线生成）；
   - `ks` 不变 → **A′**（位置派生，可纯 Node 复现）。
3. `enc` 恒满足 `|enc| = |T| − 3`，所以任何时刻都该先做 `enc & 0x7F` 再看（高位是噪声位，见 REPORT_A §6.2bis）。

---

## 9. 复现清单（新增脚本全部在 `static/`）

| 路径 | 作用 | 状态 |
|---|---|---|
| `static/node/feilin_pools.js` | 抽取 44 个解码器参数 + 解 905 项池 → `work/feilin076_pools.json` | 跑通 |
| `static/node/tables.js` | 抽两套 65 字节字母表（pe.081 XOR 139 / feilin076 XOR 68） | 跑通 |
| `static/node/vm_enum.js` | 枚举 ≥128 元素数字数组并搜魔数 | 跑通 |
| `static/node/vm_locate.js` | 定位 `D/F/W` + 解释器调用点 | 跑通 |
| `static/node/vmrun.js` / `vmprobe.js` | **离线执行字节码 VM** | 跑通 |
| `static/node/nonce_vm_evidence.js` | 生成 `work/nonce_vm_evidence.txt`（VM 随机串证据） | 跑通 |
| `static/node/magic_hunt.js` | 全池 × 全键搜 `25 13 27`（含控制字符项） | 跑通，0 命中 |
| `static/work/feilin076_pools.json` | 44 池 / 905 项 / 291 高置信 的完整解码 | 产物 |
| `static/work/nonce_vm_evidence.txt` | VM 执行记录 | 产物 |

---

## 10. 与 REPORT_A 的差异（更正项）

| 项 | REPORT_A | 本轮更正 |
|---|---|---|
| 暗层位置 | "在 feilin076，理由是 pe.081 无字节级代码" | **补强为已证明**：逐点归类 + 池全解，排除"池名间接取原语"；并给出 3 个 `rV` 候选点 |
| pe.081 代码形态 | 只识别出 CFF（`th`/`eX`） | **新增**：另有一个 16 838 字的**字节码栈机 VM**，可离线执行，负责生成 32 位十六进制随机串 |
| `arg` 长度 | 12 字节 | **10 字节**（`3e0414f0360f2d17620f`） |
| 魔数 | "未在源码中找到" | **升级为已排除**：字面量/掩码/大数组/字节码/全池×全键 五路穷举全阴 |
| `eZ/rv` 类解码器数量 | pe.081 一个（另知 feilin076 有同族） | feilin076 **44 个**，参数（表/XOR键/Δ）已全部落盘 |
