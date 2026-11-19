# TDC / EdgeOne `tdc.js` — JSVMP 纯静态结构分析

> 对象：`samples/cur_tdc.js`（主样本，264,504 字符，浏览器实际执行过的字节）＋ `scripts/tdc.js`（对照 build）。
> 方法：**只读文件 + 本地 node 做常量折叠/反汇编**，无浏览器、无网络请求、未修改任何主会话在用的脚本。
> 数值全部可由 `tools/vmp/*.mjs` 复现；每条结论标注了「代码位置」或「未验证」。

## 0. 一句话结论

这是一台 **obfuscator.io 外壳 + 自研栈式 JSVMP**：
字符串表 33 项（访问器 `_0x4837`，偏移 0x175，轮转 15 次）
→ 单一 base64 字节码（124,690 个 zigzag-varint 整数，入口 **0x18b60**）
→ **94 条 opcode 的 switch 分发器**（原文件偏移 10594 起）
→ 字节码里没有独立的加密指令，TEA 家族只是 `0x3e/0x19/0x54/0x1e` 这类算术+位运算的组合。

## 1. 与任务书「已知事实」的三处偏差（必须先对齐）

| 任务书写法 | 实际（本目录样本） | 说明 |
|---|---|---|
| `_0x3ee3()` 表 + `_0x2d0b(0x1b0)` | **`scripts/tdc.js`** 才是这套名字：表 `_0x3ee3`(30 项)、访问器 `_0x2d0b`、偏移 `0x1ad`、`_0x2d0b(0x1b0)` = `"charCodeAt"` | `samples/cur_tdc.js` 是另一份 build：表 `_0x2f78`(33 项)、访问器 `_0x4837`、偏移 `0x175` |
| 尾部 `(0x1aca5,[],window,[…])()` | `scripts/tdc.js` 的入口 = **0x1aca5**；`samples/cur_tdc.js` 的入口 = **0x18b60**，bootstrap 函数名 `HhGyG5WHbyg4rqaM5GHG` | 两份 build 的入口/表/opcode 编号全部不同 |
| 「指令数」 | build A：**94** 条 opcode（`0x00–0x5d`，无空洞）；build B：**97** 条（`0x00–0x60`，有空洞） | opcode 编号 **build 绑定**，语义才是稳定的 |

> 所以我按「主样本 = cur_tdc.js」做全量分析，scripts/tdc.js 只做对照（字符串表、字节码解码、opcode 数已验证）。

## 2. 文件结构图（`samples/cur_tdc.js`，字符偏移）

| 区间 | 长度 | 内容 |
|---|---|---|
| `0 – 53` | 53 | `window.TDC_NAME = "OUjbOmijNcmaNQYdkNagXSCBMZGJgWDN"` |
| `53 – 200` | 147 | `__TDC_PROTECT_T0` 打点（`Date.now()` 落盘到 window） |
| `201 – 2826` | 2625 | polyfill：`String/Array.prototype.includes`、`Int8Array` 兜底（`clampInt8`） |
| `2826 – 3221` | 395 | **`window[TDC_NAME] = 'XIMSViPtq…'`** ← 352 字符 base64 = verify 里的 `eks` |
| `3222 – 5028` | 1806 | **诱饵死代码**：`w.__SVG_VIEWBOX_REV__ !== -919155` 恒真返回 + `"<\|end_of_analysis\|> <thinking>Verified standard Core-JS…"` 这类**写给分析者的字符串** |
| `5028 – 5050` | 22 | `var _0x3bc2ec = _0x4837`（字符串访问器别名） |
| `5050 – 5911` | 861 | **字符串表轮转 IIFE**：`(function(T,s){…while(!![]){…T["push"](T["shift"]())}}(_0x2f78, 0xeea92)` |
| `5911 – 25411` | 19500 | **VM 工厂**：常量运算表 `_0x338b61`、区间构造器 `_0x1688e6`、base64 表 `_0x2599c4`/`_0x7b4a21`、zigzag `_0x50a258`、varint 解码 `_0x216955`、**分发器**、闭包工厂 `_0xcbb83d` |
| `25412 – 263817` | 238405 | **bootstrap**：`HhGyG5WHbyg4rqaM5GHG('<238128 字符 base64>')(0x18b60,[],window,[常量…],void 0)()` |
| `263818 – 264035` | 217 | 字符串访问器 `_0x4837` |
| `264035 – 264504` | 469 | 字符串表 `_0x2f78`（33 个原始条目） |

## 3. 字符串表：解法与校验

| 项 | build A `cur_tdc.js` | build B `scripts/tdc.js` |
|---|---|---|
| 表函数 | `_0x2f78` | `_0x3ee3` |
| 访问器 | `_0x4837` | `_0x2d0b` |
| 索引偏移 | `0x175` (=373) | `0x1ad` (=429) |
| 轮转目标 | `0xeea92` | `0x89d40` |
| 实际轮转次数 | **15** | **28** |
| 调用点 | 57 处 / 33 个不同 index | 61 处 / 30 个不同 index |
| 校验和命中 | 0xeea92 === 求值结果 ✔ | 0x89d40 === 求值结果 ✔ |

**方法（不 eval 样本主体）**：表数组直接取 AST 的 `ArrayExpression` 字面量；偏移取 `p = p - 0xNNN` 的字面量；把轮转 IIFE 的校验和表达式里 `ACC(0xNNN)` 折叠成 `arr[0xNNN-off]` 后对**常量表达式**求值，直到等于 target；别名（`var X = ACC` / `var X = 已识别别名`）用 AST 递归收集后一起折叠。

**结果自证**（build A 全部 33 个 index）：

```
0x17d → "call"            7 处   ← case 0x4/0x7/0x18/0x59/0x5d 的 [.]("call")(…) 正好 7 处
0x194 → "push"           10 处
0x191 → "fromCharCode"    4 处
0x185 → "defineProperty"  1 处
0x188 → "pop" / 0x189 → "length" / 0x17a → "apply" / 0x180 → "concat"
其余 0x175/0x176/0x177/… 是 "3028926DQCVaE" 这类垃圾串——只在轮转校验和里被 parseInt，从不做属性名。
```

产物：`samples/tdc.strings.json`（build → `index → 明文`，含 `fullTable` 全表与 `sites` 调用点偏移）；
常量折叠后的完整源码：`src/_vmp/cur.folded.js`（264504 → 264116 字符，57 处调用点全部变成明文字符串）。

## 4. 字节码：静态解出全部整数

| 项 | build A | build B |
|---|---|---|
| base64 长度 | 238128 | 217508 |
| base64 → 字节 | 178595 | 见 `src/_vmp/tdcjs.bytecode.bytes.bin` |
| 字节 → zigzag-varint 整数 | **124,690** | **121,743** |
| 入口 ip | **0x18b60** (101,216) | **0x1aca5** (109,733) |
| 独立重写实现 == 文件助手 | **IDENTICAL = true** | **IDENTICAL = true** |

解码链（都在 VM 工厂里，`5911–25411`）：

1. `_0x2599c4`：用 `_0x1688e6(start,count,step)` 拼出的 123 项「字符码 → 6bit 值」查找表。字母表是标准 base64，但 **`+` 与 `-` 同值 62**、`_` 也是 63：
   `A=0 … Z=25, a=26 … z=51, 0=52 … 9=61, +=62, -=62, /=63, _=63`，其余码位为 0（无效）。
2. `_0x7b4a21`：先 `replace(/[=]+$/,"")`，再按 4 字符一组累加 `prev = 0x40*prev + v`，第 2/3/4 个字符时输出 `0xff & prev >> (-2n & 6)`。
3. `_0x216955`：`Int8Array` 逐字节读，**最高位为 1 表示继续**；7bit 一组（第 5 字节用整字节 `<<0x1c`）；结果过 `_0x50a258(v) = (v>>1) ^ -(v&1)`（zigzag）。

> 交叉验证的做法：把 4 个助手按 AST 位置切出来在隔离 `vm` 里只做常量求值，再用我独立重写的 base64+zigzag 解同一串，**124690 个整数逐个相等**（`tools/vmp/bytecode.mjs` 会打印 `IDENTICAL = true`）。

## 5. VM 运行时结构（都能在源码里指到位置）

```js
// 闭包工厂 _0xcbb83d(bytecode, undefined) → 返回 _0x1869b7（可调用 VM）
function _0x1869b7(entry_ip, arg2, W, CONSTS, errorHandler) {
  var A = [W, CONSTS, arg2, this, arguments, self, bytecode, 0];   // 8 个预置槽
  var ip = entry_ip, callStack = [];
  while (true) { switch (bytecode[++ip]) { case 0x00: … case 0x5d: … } }
}
// 引导：HhGy(<base64>)(0x18b60, [], window, [void 0, null, 0x9e3779b9, 0x13c6ef3720, 0.75, …], void 0)()
```

| 槽 | 内容 | 依据 |
|---|---|---|
| `A[0]` | **window**（每个 VM 帧都有） | 引导实参第 3 个 = `window`；`0x0b/0x17/0x1b/0x21` 重入时原样透传 |
| `A[1]` | **常量池** `[void 0, null, 0x9e3779b9, 0x13c6ef3720, 0.75, 0.8, 0.7, 0.9, 0.5, 0.60436…, 0.66403…, 0.71629…, 0.60436…5, 0.66403…49, 0.66403…89, 0.71629…44, 0.55, 3.2, 0.25, 0x811c9dc5]` | 引导实参第 4 个（字节码用 `0x15 A[d]=A[1][imm]` 取用） |
| `A[6]` | 自身字节码数组 | `_0xa6a858=[…,_0x4c0e0b,0x0]` |
| `A[2]` | 该帧的实参数组 | 引导实参第 2 个 = `[]` |
| 调用栈 `_0x426cf1` | `0x2b/0x2d/0x56` push、`0x1c` pop | `case 0x2b/0x2d/0x56/0x1c` |

**常量池就是「加密族」的物证**：`A[1][2]=0x9e3779b9`（TEA delta）、`A[1][3]=0x13c6ef3720`（2·delta）、`A[1][19]=0x811c9dc5`（FNV-1a 偏移基）、`A[1][4..18]` 是一批 0.5–3.2 的比例常量。
字节码里对它们的取用（`0x15 A[d]=A[1][imm]`）我静态扫到：`A[1][2]` 1 处（ip 61494）、`A[1][3]` **4 处**（ip 34149 / 46168 / 52195 / 95333）、比例常量 23 处；**`A[1][19]`（FNV）0 处**。
ip 95333 附近是 `A[76]=A[1][3]; A[101]=(A[76]==A[35]); A[101]=!A[101]; 0x30 条件跳转` —— 典型的**轮数/循环上界比较**，不是 mix 本体。

## 6. 分发器与 opcode 全表（build A：94 条）

分发器：`switch(bytecode[++ip])`。原文件偏移：`switch(` 在 **10563**，判别式 `_0x4c0e0b[++_0x3599db]` 在 **10570**，第一个 `case 0x0:` 在 **10594**，最后一个 `case 0x5d:` 在 **24854**。

机器派生（`src/_vmp/cur.opcodes.json`）与人工核对（下表「语义」列）一致；**操作数个数 = 该 case 里 `++ip` 的出现次数**（`0x2c`/`0x30` 变长，见备注）。

| opcode | 原文件偏移 | 操作数 | 类 | 语义（依据 = 处理分支代码） |
|---|---|---|---|---|
| `0x00` | 10594 | 3 | 位运算 | A[d] = A[a]  |
| `0x01` | 10700 | 3 | 比较 | A[d] = A[a] >= A[b] |
| `0x02` | 10818 | 2 | 位运算 | A[d] = ~A[a] |
| `0x03` | 10902 | 3 | 位运算 | A[d] = A[a] >> A[b] |
| `0x04` | 11020 | 4 | 函数调用 | A[d] = A[a]['call'](this_ref, A[b], A[c])   ← 2 实参 |
| `0x05` | 11200 | 5 | 属性读 | A[d] = A[a][A[k]]; A[e] = imm                 ← 动态键读 + 立即数 |
| `0x06` | 11375 | 3 | 位运算 | A[d] = A[a] << imm |
| `0x07` | 11482 | 4 | 函数调用 | A[d] = A[a]['call'](A[b], A[c])             ← this=A[b], 1 实参 |
| `0x08` | 11652 | 3 | 属性写 | A[d] = delete A[a][A[k]] |
| `0x09` | 11777 | 2 | 逻辑 | A[d] = !A[a] |
| `0x0a` | 11861 | 3 | 字符串拼接 | A[d] = ''; A[e] += fromCharCode(imm)      ← 串初始化 + 追加 |
| `0x0b` | 11995 | 11 | 调用/VM重入 | A[o][o]=A[o]; 收集 N 个实参; A[x]=VM(ip+off,args,…); defineProperty(fn,'length',imm); A[o][A[k]]=A[x] |
| `0x0c` | 12650 | 2 | 数据 | A[d] = imm                                      ← 立即数装载 |
| `0x0d` | 12722 | 1 | 控制流 | ip += imm                                     ← 无条件跳转 |
| `0x0e` | 12771 | 3 | 函数调用 | A[d] = A[a]['call'](A[b])                   ← this=A[b] |
| `0x0f` | 12907 | 2 | 数据 | A[d] = A[a]                                     ← 寄存器搬移 |
| `0x10` | 12990 | 1 | 控制流 | throw A[a] |
| `0x11` | 13046 | 2 | 算术 | A[d] = +A[a]                                    ← 数值化 |
| `0x12` | 13131 | 5 | 属性读/字符串 | A[d] += fromCharCode(imm); A[e] = A[b][A[k]]   ← 拼串 + 动态键读（环境访问主路径） |
| `0x13` | 13332 | 6 | 属性读/字符串 | A[d] = A[b][A[k]]; A[e] = ''; A[e] += fromCharCode(imm) |
| `0x14` | 13570 | 2 | 数据 | A[d] = typeof A[a] |
| `0x15` | 13661 | 3 | 属性读 | A[d] = A[b][imm]                              ← 立即数键（数组下标/常量池取用） |
| `0x16` | 13769 | 3 | 函数调用 | A[d] = new A[a](A[b])                       ← 构造 1 参 |
| `0x17` | 13892 | 8 | 调用/VM重入 | 收集 N 个实参; A[x] = VM(ip+off,args,…); defineProperty(fn,'length',imm); A[o][A[k]] = A[x] |
| `0x18` | 14436 | 2 | 函数调用 | A[d] = A[a]['call'](this_ref)               ← 0 实参 |
| `0x19` | 14549 | 3 | 位运算 | A[d] = A[a] << A[b] |
| `0x1a` | 14668 | 3 | 比较 | A[d] = (A[a] == A[b])                           ← 松散相等 |
| `0x1b` | 14815 | 5 | 调用/VM重入 | 收集 N 个实参; A[x] = VM(ip+off,args,…); defineProperty(fn,'length',imm) |
| `0x1c` | 15275 | 0 | 控制流 | callStack.pop()                               ← 异常展开 |
| `0x1d` | 15310 | 1 | 控制流 | return A[a] |
| `0x1e` | 15367 | 3 | 位运算 | A[d] = A[a] ^ A[b] |
| `0x1f` | 15485 | 3 | 属性写 | A[b][imm] = A[v] |
| `0x20` | 15593 | 3 | 属性读 | A[d] = A[b][A[k]]                             ← 动态键读（obj[键]） |
| `0x21` | 15712 | 10 | 调用/VM重入/字符串 | A[d] += fromCharCode(imm); 收集实参; A[x]=VM(…); defineProperty; A[o][A[k]]=A[x] |
| `0x22` | 16351 | 3 | 属性写 | A[b][A[k]] = A[v] |
| `0x23` | 16470 | 7 | 函数调用 | A[d] = imm; A[e] = A[a]['call'](this_ref, A[f]); A[g] = A[e] |
| `0x24` | 16732 | 3 | 位运算 | A[d] = A[a]  |
| `0x25` | 16850 | 2 | 算术 | A[d] = ++A[a] |
| `0x26` | 16936 | 5 | 属性写/字符串 | A[d] += fromCharCode(imm); A[b][A[k]] = A[v] |
| `0x27` | 17126 | 3 | 算术 | A[d] = A[a] / A[b] |
| `0x28` | 17244 | 2 | 函数调用 | A[d] = new A[a]() |
| `0x29` | 17334 | 1 | 数据 | A[d] = null |
| `0x2a` | 17389 | 5 | 函数调用 | A[x] = A[fn]['apply'](this, argsArray) |
| `0x2b` | 17704 | 4 | 控制流 | A[d]=catchErr; A[e]=A[e]; callStack.push(ip+imm)   ← try 入口 |
| `0x2c` | 17894 | 7/8（变长） | 控制流 | A[d]=typeof A[a]; A[e]=(A[b]==A[c]); ip += A[k] ? imm : (imm,imm)  ← 变长条件跳转 |
| `0x2d` | 18191 | 1 | 控制流 | callStack.push(ip + imm) |
| `0x2e` | 18289 | 3 | 比较 | A[d] = A[a] === A[b] |
| `0x2f` | 18409 | 3 | 算术 | A[d] = A[a] - imm |
| `0x30` | 18516 | 2/3（变长） | 控制流 | ip += A[c] ? imm : (imm,imm)                   ← 变长条件跳转 |
| `0x31` | 18635 | 5 | 函数调用 | A[d] = A[a]['call'](A[b], A[c], A[e])        ← 2 实参 |
| `0x32` | 18840 | 4 | 控制流/迭代 | A[t]=A[a]; if (A[b] = !!A[t].length) A[c]=A[t].shift(); else ++ip |
| `0x33` | 19038 | 2 | 迭代 | A[d] = for-in 键数组(A[a]) |
| `0x34` | 19201 | 8 | 属性读/数据 | A[d]=A[b][A[k]]; A[e]=typeof A[x]; A[f]=(A[g]==A[h]) |
| `0x35` | 19498 | 6 | 属性读 | A[d]=A[b][imm]; A[e]=A[f][A[k]] |
| `0x36` | 19698 | 3 | 比较 | A[d] = A[a] >= imm |
| `0x37` | 19806 | 3 | 算术 | A[d] = A[a] % A[b] |
| `0x38` | 19944 | 9 | 属性读 | A[d]=A[b][imm]; A[e]=A[f][imm]; A[g]=A[h][imm] |
| `0x39` | 20236 | 3 | 比较 | A[d] = A[a] > A[b] |
| `0x3a` | 20354 | 3 | 位运算 | A[d] = A[a] >>> imm |
| `0x3b` | 20463 | 3 | 比较 | A[d] = A[a] > imm |
| `0x3c` | 20570 | 3 | 比较 | A[d] = A[a] == imm |
| `0x3d` | 20678 | 5 | 属性写 | A[d]=A[a]; A[b][A[k]]=A[v] |
| `0x3e` | 20865 | 3 | 算术 | A[d] = A[a] + A[b]                              ← TEA/加法主用 |
| `0x3f` | 21003 | 2 | 算术 | A[d] = --A[a] |
| `0x40` | 21089 | 2 | 数据 | A[d] = Array(imm) |
| `0x41` | 21169 | 1 | 数据 | A[d] = {} |
| `0x42` | 21222 | 7 | 数据 | A[d]=A[a]; A[e] = ('bigint'==typeof A[x]) ? A[f] : A[g]-0 |
| `0x43` | 21571 | 3 | 算术 | A[d] = imm - A[a] |
| `0x44` | 21678 | 4 | 函数调用 | A[d] = new A[a](A[b], A[c]) |
| `0x45` | 21835 | 1 | 数据 | A[d] = catchErr |
| `0x46` | 21895 | 3 | 算术 | A[d] = A[a] + imm |
| `0x47` | 22002 | 6 | 函数调用 | A[d] = A[a]['call'](A[b], A[c], A[e], A[f]) ← 3 实参 |
| `0x48` | 22231 | 4 | 字符串拼接/数据 | A[d]+=fromCharCode(imm); A[e]={}; A[f]='' |
| `0x49` | 22403 | 3 | 数据 | A[d] = ('bigint'==typeof A[x]) ? A[a] : A[b]-0 |
| `0x4a` | 22578 | 3 | 比较 | A[d] = A[a] === imm |
| `0x4b` | 22687 | 1 | 字符串拼接 | A[d] = '' |
| `0x4c` | 22740 | 3 | 位运算 | A[d] = A[a] & imm |
| `0x4d` | 22847 | 3 | 算术 | A[d] = A[a] - A[b] |
| `0x4e` | 22965 | 2 | 控制流 | A[d]=catchErr; return A[b] |
| `0x4f` | 23066 | 4 | 字符串拼接 | A[d] += fromCharCode(c1); A[e] += fromCharCode(c2)   ← 双字拼串（特征最明显） |
| `0x50` | 23250 | 3 | 比较 | A[d] = A[a] in A[b] |
| `0x51` | 23370 | 3 | 算术 | A[d] = A[a] * A[b] |
| `0x52` | 23508 | 2 | 字符串拼接 | A[d] += fromCharCode(imm) |
| `0x53` | 23608 | 5 | 属性读 | A[d]=A[b][imm]; A[e]=A[e] |
| `0x54` | 23784 | 3 | 位运算 | A[d] = A[a] >> imm |
| `0x55` | 23892 | 1 | 数据 | A[d] = catchErr |
| `0x56` | 23952 | 3 | 控制流 | A[d]=A[a]; callStack.push(ip+imm)             ← finally 入口 |
| `0x57` | 24098 | 3 | 比较 | A[d] = A[a] < A[b] |
| `0x58` | 24216 | 3 | 比较 | A[d] = A[a] < imm |
| `0x59` | 24323 | 3 | 函数调用 | A[d] = A[a]['call'](this_ref, A[b])         ← 1 实参 |
| `0x5a` | 24470 | 5 | 函数调用 | A[d] = new A[a](A[b], A[c], A[e]) |
| `0x5b` | 24661 | 2 | 算术 | A[d] = -A[a] |
| `0x5c` | 24746 | 3 | 比较 | A[d] = A[a] <= imm |
| `0x5d` | 24854 | 5 | 函数调用 | A[d] = A[a]['call'](this_ref, A[b], A[c]) |

## 7. opcode 分类表（类 → opcode 列表 → 判定依据）

| 类 | opcode | 判定依据（代码片段，取自 `case` 分支） |
|---|---|---|
| 位运算 | `0x00` `0x02` `0x03` `0x06` `0x19` `0x1e` `0x24` `0x3a` `0x4c` `0x54` | 0x1e: A[d]=A[a]^A[b] · 0x19: << · 0x03: >> · 0x3a: >>> · 0x24: \| · 0x4c: & |
| 比较 | `0x01` `0x1a` `0x2e` `0x36` `0x39` `0x3b` `0x3c` `0x4a` `0x50` `0x57` `0x58` `0x5c` | 0x1a: A[a]==A[b] · 0x2e: === · 0x39: > · 0x57: < · 0x36: >= · 0x50: in |
| 函数调用 / 构造 / VM 重入 | `0x04` `0x07` `0x0b` `0x0e` `0x16` `0x17` `0x18` `0x1b` `0x23` `0x28` `0x2a` `0x31` `0x44` `0x47` `0x59` `0x5a` `0x5d` | 0x04/0x07/0x0e/0x18/0x31/0x47/0x59/0x5d = `['call'](...)` 的 0–3 实参变体；0x2a = `['apply']`；0x0b/0x17/0x1b/0x21 = 递归调用解释器本体（`Object.defineProperty(fn,'length',{value:imm})` 伪造 arity，反 hook） |
| 属性读（动态键 obj[name]） | `0x05` `0x15` `0x20` `0x35` `0x38` `0x53` | 0x20: `A[code[++ip]] = A[code[++ip]][A[code[++ip]]]` ← **环境访问主路径**；0x15: 立即数键；0x12/0x13/0x26 在拼串后顺带读/写 |
| 属性写 / delete | `0x08` `0x1f` `0x22` `0x3d` | 0x22: `A[b][A[k]] = A[v]` · 0x1f: `A[b][imm] = A[v]` · 0x08: `delete A[b][A[k]]` |
| 字符串拼接（fromCharCode 逐字拼） | `0x0a` `0x4b` `0x4f` `0x52` | 0x4b 初始化 `A[d]=""`；0x52 / 0x4f（一次两个字符）/ 0x0a / 0x48 追加；**明文属性名就是这样被拼出来的** |
| 数据搬移 / 立即数 / 分配 | `0x0c` `0x0f` `0x14` `0x29` `0x40` `0x41` `0x42` `0x45` `0x49` `0x55` | 0x0c `A[d]=imm` · 0x0f/0x45/0x55 MOV · 0x29 null · 0x40 Array(imm) · 0x41 {} · 0x14 typeof |
| 控制流（跳转/返回/异常/迭代） | `0x0d` `0x10` `0x1c` `0x1d` `0x2b` `0x2c` `0x2d` `0x30` `0x32` `0x33` `0x4e` `0x56` | 0x0d `ip += imm` · 0x2c/0x30 条件跳转（**变长操作数**）· 0x2b/0x2d/0x56 `callStack.push(ip+imm)` · 0x1c `pop()` · 0x1d/0x4e return · 0x10 throw · 0x32 shift 迭代器 · 0x33 for-in 键 |
| 算术 | `0x11` `0x25` `0x27` `0x2f` `0x37` `0x3e` `0x3f` `0x43` `0x46` `0x4d` `0x51` `0x5b` | 0x3e: A[d]=A[a]+A[b] · 0x4d: A[d]=A[a]-A[b] · 0x27: / · 0x51: * · 0x37: % |

**「加密原语（TEA/ECB）」不是一类 opcode**，这一点要说清楚：

- 全部 94 条 opcode 里没有任何一条带 crypto 语义；TEA 只能是 `0x3e(+) / 0x19(<<) / 0x03(>>) / 0x1e(^) / 0x4c(&)` 的组合。
- 常量池 `A[1][2]/A[1][3]` 就是 delta / 2·delta，字节码有 5 处读取（见 §5）。
- **未能**把某一段字节码静态判定成「32 轮 TEA 展开」：需要寄存器级数据流（哪些寄存器是 key/v0/v1），而 key 在运行期由 VM 内部派生。→ 标 **未验证**。

## 8. 环境访问点清单（属性名 + 字节码 opcode/偏移）

做法：对反汇编结果做**帧感知抽象解释**——寄存器域记录「已知字符串 / 已解析对象路径」，遇 `0x12/0x20/0x26/0x22/0x15` 时若键寄存器是已知字符串就记一条访问点。覆盖 99.86%（29,651 条指令，opcode 全部落在 0–0x5d，无非法字节 ⇒ 对齐自洽）。

- 能恢复键名的属性访问点：**1994** 处
- 其中能一路解析到 `window.<root>` 的：**600** 处；基址寄存器无法静态确定（来自调用返回值/跨帧实参）：1394 处
- 去重后的属性名：**487** 个

### 8.1 两个可复核的证据窗口（原样摘自分片）

**① `navigator.userAgent`**（ip 64851–64899）：

```
64851 0x4f STR_APP2 [8,110, 8,97 ]   ← A[8] += "na"
64856 0x4f STR_APP2 [8,118, 8,105]   ← "vi"     … 拼完 A[8] = "navigator"
64877 0x4b STR_INIT [11]             ← A[11] = ""
64879 0x4f STR_APP2 [11,117,11,115]  ← "us" … 拼完 A[11] = "userAgent"
64899 0x12 STR_APP_THEN_READ [11,116, 14, 8, 11]
        └─ A[11] += chr(116)="t";  A[14] = A[8][A[11]]   ⇒  navigator["userAgent"]
64905 0x1f PROP_WRITE_IMM [15,0,14]  ← 结果写进 A[15][0]（采集容器）
```

**② `getExtension("WEBGL_debug_renderer_info") + getParameter(UNMASKED_RENDERER_WEBGL)`**（ip 106449–106490）：

```
106449 0x4f STR_APP2 [21,69, 21,68] …  拼出 A[21] = "…ED_RENDERER_WEBGL"
106484 0x12 STR_APP_THEN_READ [21,76, 13, 19, 21]  ← A[13] = A[19]["…ED_RENDERER_WEBGL"]
106490 0x07 CALL [21, 27, 25, 13]                  ← 立即拿常量继续用（getParameter 的枚举值路径）
```

### 8.2 按类别汇总（key → 出现次数，ip 前若干）

读表须知：

- `路径` 列里的 `?.xxx` = **键名已确定，但基址寄存器来自调用返回值/跨帧实参，静态无法归属**（不猜宿主）。
- `window.window.X` 是 `A[0]` 假设的副产物：VM 把 window 放在 `A[0]`，但字节码里也可能先取 `A[0]["window"]`（或 `self`/`top` 别名）再取属性。**把它读成「全局 X」即可**，不要当成真的访问了 `window.window`。
- 同一属性名出现多次是正常的：TDC 对同一项常做「探测 + 采集」两次（例如 `webdriver` 既看值也看是否存在）。

#### navigator（UA/语言/硬件）（13 个 key）

| key | n | 字节码 ip | 解析到的路径（若有） |
|---|---|---|---|
| `appName` | 1 | 73040 | window.navigator.appName |
| `appVersion` | 2 | 42627, 71256 | window.navigator.appVersion<br>?.appVersion |
| `cookieEnabled` | 1 | 120593 | ?.cookieEnabled |
| `deviceMemory` | 1 | 45609 | ?.deviceMemory |
| `hardwareConcurrency` | 1 | 3252 | window.navigator.hardwareConcurrency |
| `languages` | 1 | 98361 | window.navigator.languages |
| `mimeTypes` | 1 | 46456 | window.navigator.mimeTypes |
| `platform` | 3 | 79412, 86833, 117847 | ?.platform<br>?.platform= |
| `plugins` | 1 | 86561 | window.navigator.plugins |
| `userAgent` | 8 | 32310, 35509, 60181, 64899 | ?.userAgent<br>window.navigator.userAgent |
| `userAgentData` | 4 | 19360, 52489, 59548, 94044 | window.navigator.userAgentData<br>?.userAgentData |
| `vendor` | 1 | 72952 | window.navigator.vendor |
| `webdriver` | 1 | 73341 | window.window.navigator.webdriver |

#### screen（屏幕参数）（9 个 key）

| key | n | 字节码 ip | 解析到的路径（若有） |
|---|---|---|---|
| `availHeight` | 1 | 62773 | window.screen.availHeight |
| `colorDepth` | 2 | 56292, 62835 | window.screen.colorDepth |
| `devicePixelRatio` | 1 | 110668 | window.window.devicePixelRatio |
| `fontSmoothingEnabled` | 2 | 44287, 110555 | window.screen.fontSmoothingEnabled |
| `height` | 7 | 9669, 33699, 50573, 55968 | ?.height<br>window.screen.height |
| `innerHeight` | 1 | 90243 | window.window.innerHeight |
| `innerWidth` | 1 | 51479 | ?.innerWidth |
| `logicalXDPI` | 2 | 112055, 123879 | window.screen.logicalXDPI |
| `width` | 7 | 210, 50886, 59284, 62661 | ?.width<br>window.screen.width |

#### document / location（容器与上下文）（19 个 key）

| key | n | 字节码 ip | 解析到的路径（若有） |
|---|---|---|---|
| `URL` | 2 | 87299, 99417 | window.document.URL |
| `addEventListener` | 4 | 47471, 69352, 80510, 94590 | ?.addEventListener<br>window.window.addEventListener |
| `appendChild` | 20 | 5715, 29864, 59944, 63237 | ?.appendChild<br>window.document.head.appendChild |
| `body` | 16 | 29579, 44489, 46123, 49730 | window.document.body<br>?.body |
| `characterSet` | 1 | 5450 | window.document.characterSet |
| `compatMode` | 1 | 65683 | window.document.compatMode |
| `cookie` | 1 | 55319 | window.document.cookie |
| `createElement` | 31 | 16255, 29724, 30074, 41544 | window.document.createElement<br>?.createElement |
| `dispatchEvent` | 2 | 95692, 98031 | window.document.dispatchEvent<br>window.EventTarget.prototype.dispatchEvent |
| `documentElement` | 3 | 64068, 89402, 116203 | ?.documentElement |
| `getElementById` | 8 | 43807, 45129, 54696, 65200 | window.document.getElementById<br>?.getElementById |
| `getElementsByTagName` | 3 | 3536, 54088, 74049 | ?.getElementsByTagName |
| `head` | 2 | 29833, 82819 | window.document.head<br>?.head |
| `hidden` | 1 | 8152 | ?.hidden |
| `href` | 3 | 65358, 66149, 73537 | window.document.location.href<br>?.href |
| `location` | 3 | 65342, 66133, 73521 | window.document.location<br>?.location |
| `msHidden` | 1 | 89003 | ?.msHidden |
| `removeChild` | 10 | 5216, 34986, 49761, 55503 | ?.removeChild<br>window.document.body.removeChild |
| `webkitHidden` | 1 | 76345 | ?.webkitHidden |

#### canvas 2d（图形指纹）（13 个 key）

| key | n | 字节码 ip | 解析到的路径（若有） |
|---|---|---|---|
| `CanvasRenderingContext2D` | 1 | 77454 | ?.CanvasRenderingContext2D |
| `HTMLCanvasElement` | 1 | 77344 | ?.HTMLCanvasElement |
| `OffscreenCanvas` | 2 | 77894, 90043 | ?.OffscreenCanvas |
| `arc` | 1 | 91164 | ?.arc |
| `beginPath` | 2 | 119469, 119658 | ?.beginPath |
| `bezierCurveTo` | 2 | 119540, 119678 | ?.bezierCurveTo |
| `clearRect` | 1 | 118833 | ?.clearRect |
| `fill` | 1 | 119751 | ?.fill |
| `fillRect` | 2 | 88410, 119216 | ?.fillRect |
| `fillText` | 5 | 88474, 88619, 96690, 96800 | ?.fillText |
| `getContext` | 8 | 23833, 29086, 33383, 47021 | ?.getContext |
| `getImageData` | 1 | 65013 | ?.getImageData |
| `toDataURL` | 1 | 96838 | ?.toDataURL |

#### webgl（GPU 指纹）（38 个 key）

| key | n | 字节码 ip | 解析到的路径（若有） |
|---|---|---|---|
| `ALIASED_POINT_SIZE_RANGE` | 1 | 17939 | ?.ALIASED_POINT_SIZE_RANGE |
| `ARRAY_BUFFER` | 2 | 94983, 95024 | ?.ARRAY_BUFFER |
| `COLOR_BUFFER_BIT` | 1 | 67015 | ?.COLOR_BUFFER_BIT |
| `COMPILE_STATUS` | 3 | 14605, 26832, 49646 | ?.COMPILE_STATUS |
| `FLOAT` | 1 | 66852 | ?.FLOAT |
| `FRAGMENT_SHADER` | 2 | 17434, 34458 | ?.FRAGMENT_SHADER |
| `HIGH_FLOAT` | 1 | 17549 | ?.HIGH_FLOAT |
| `HIGH_INT` | 1 | 17641 | ?.HIGH_INT |
| `LINK_STATUS` | 2 | 6717, 13692 | ?.LINK_STATUS |
| `LOW_FLOAT` | 1 | 17472 | ?.LOW_FLOAT |
| `LOW_INT` | 1 | 17574 | ?.LOW_INT |
| `MEDIUM_FLOAT` | 1 | 17514 | ?.MEDIUM_FLOAT |
| `MEDIUM_INT` | 1 | 17611 | ?.MEDIUM_INT |
| `RGBA` | 1 | 67188 | ?.RGBA |
| `STATIC_DRAW` | 1 | 95145 | ?.STATIC_DRAW |
| `TRIANGLE_STRIP` | 1 | 67092 | ?.TRIANGLE_STRIP |
| `UNMASKED_RENDERER_WEBGL` | 1 | 106484 | ?.UNMASKED_RENDERER_WEBGL |
| `UNMASKED_VENDOR_WEBGL` | 1 | 53924 | ?.UNMASKED_VENDOR_WEBGL |
| `UNSIGNED_BYTE` | 1 | 67224 | ?.UNSIGNED_BYTE |
| `VERTEX_SHADER` | 1 | 34403 | ?.VERTEX_SHADER |
| `WebGLRenderingContext` | 1 | 77557 | ?.WebGLRenderingContext |
| `attachShader` | 2 | 56886, 56896 | ?.attachShader |
| `bindBuffer` | 1 | 94947 | ?.bindBuffer |
| `bufferData` | 1 | 95020 | ?.bufferData |
| `compileShader` | 2 | 32704, 33215 | ?.compileShader |
| `createBuffer` | 1 | 118394 | ?.createBuffer |
| `createProgram` | 1 | 63544 | ?.createProgram |
| `createShader` | 2 | 34367, 34417 | ?.createShader |
| `drawArrays` | 1 | 67051 | ?.drawArrays |
| `getExtension` | 13 | 145, 9258, 19273, 23500 | ?.getExtension |
| `getParameter` | 4 | 17851, 17873, 53758, 106313 | ?.getParameter |
| `getProgramParameter` | 2 | 13659, 57013 | ?.getProgramParameter |
| `getShaderParameter` | 2 | 33293, 49605 | ?.getShaderParameter |
| `getShaderPrecisionFormat` | 1 | 103399 | ?.getShaderPrecisionFormat |
| `linkProgram` | 1 | 56933 | ?.linkProgram |
| `readPixels` | 1 | 67172 | ?.readPixels |
| `shaderSource` | 2 | 32467, 32715 | ?.shaderSource |
| `useProgram` | 1 | 118353 | ?.useProgram |

#### Web Audio（音频指纹）（24 个 key）

| key | n | 字节码 ip | 解析到的路径（若有） |
|---|---|---|---|
| `AudioContext` | 2 | 24199, 47675 | window.window.AudioContext<br>?.AudioContext |
| `OfflineAudioContext` | 1 | 91490 | ?.OfflineAudioContext |
| `attack` | 1 | 85430 | ?.attack |
| `baseLatency` | 4 | 8026, 15555, 32154, 71317 | ?.baseLatency |
| `channelCount` | 4 | 7741, 15490, 15494, 111200 | ?.channelCount<br>?.channelCount= |
| `channelCountMode` | 2 | 7841, 76773 | ?.channelCountMode |
| `channelInterpretation` | 2 | 7963, 115135 | ?.channelInterpretation |
| `connect` | 2 | 85494, 85505 | ?.connect |
| `createAnalyser` | 1 | 57570 | ?.createAnalyser |
| `createBuffer` | 1 | 118394 | ?.createBuffer |
| `createDynamicsCompressor` | 1 | 85298 | ?.createDynamicsCompressor |
| `createOscillator` | 1 | 85160 | ?.createOscillator |
| `destination` | 4 | 15440, 15486, 57786, 85536 | ?.destination |
| `frequency` | 1 | 85222 | ?.frequency |
| `getChannelData` | 2 | 8269, 20302 | ?.getChannelData |
| `knee` | 1 | 85368 | ?.knee |
| `ratio` | 1 | 85395 | ?.ratio |
| `release` | 1 | 85462 | ?.release |
| `sampleRate` | 3 | 15365, 15369, 69500 | ?.sampleRate<br>?.sampleRate= |
| `start` | 1 | 85559 | ?.start |
| `threshold` | 1 | 85335 | ?.threshold |
| `type` | 23 | 5360, 6400, 12486, 15952 | ?.type<br>?.type= |
| `webkitAudioContext` | 1 | 66064 | ?.webkitAudioContext |
| `webkitOfflineAudioContext` | 1 | 34633 | ?.webkitOfflineAudioContext |

#### performance / 时序（5 个 key）

| key | n | 字节码 ip | 解析到的路径（若有） |
|---|---|---|---|
| `__TDC_PERF_INIT` | 2 | 35792, 35844 | window.window.__TDC_PERF_INIT<br>?.__TDC_PERF_INIT |
| `__TDC_PROTECT_T0` | 1 | 114782 | ?.__TDC_PROTECT_T0 |
| `getEntriesByType` | 2 | 75290, 114648 | ?.getEntriesByType<br>window.performance.getEntriesByType |
| `now` | 2 | 44104, 98787 | ?.now |
| `performance` | 2 | 89332, 114600 | window.performance |

#### storage / crypto / 编码（19 个 key）

| key | n | 字节码 ip | 解析到的路径（若有） |
|---|---|---|---|
| `Date` | 1 | 84095 | ?.Date |
| `DateTimeFormat` | 1 | 61274 | ?.DateTimeFormat |
| `Intl` | 1 | 61233 | ?.Intl |
| `JSON` | 20 | 4987, 12405, 15304, 18325 | window.JSON<br>?.JSON |
| `TextEncoder` | 1 | 111686 | ?.TextEncoder |
| `btoa` | 1 | 86062 | ?.btoa |
| `crypto` | 4 | 5656, 18112, 64721, 83427 | window.window.crypto<br>?.crypto |
| `encode` | 2 | 19637, 96872 | ?.encode |
| `getItem` | 2 | 61421, 76839 | window.localStorage.getItem<br>window.sessionStorage.getItem |
| `getTimezoneOffset` | 1 | 105147 | ?.getTimezoneOffset |
| `localStorage` | 4 | 3317, 26457, 48188, 61400 | window.window.localStorage<br>window.localStorage |
| `now` | 2 | 44104, 98787 | ?.now |
| `parse` | 1 | 12421 | ?.parse |
| `resolvedOptions` | 1 | 61319 | ?.resolvedOptions |
| `sessionStorage` | 4 | 24030, 49328, 76818, 88930 | ?.sessionStorage<br>window.sessionStorage |
| `setItem` | 2 | 26478, 88951 | window.localStorage.setItem<br>window.sessionStorage.setItem |
| `stringify` | 19 | 5013, 15330, 18351, 20533 | window.JSON.stringify<br>?.stringify |
| `subtle` | 2 | 5677, 83448 | window.window.crypto.subtle |
| `timeZone` | 2 | 84668, 100538 | ?.timeZone=<br>?.timeZone |

#### 自动化/调试器标记（风控探针）（13 个 key）

| key | n | 字节码 ip | 解析到的路径（若有） |
|---|---|---|---|
| `$cdc_asdjflasutopfhvcZLmcfl_` | 1 | 72521 | window.document.$cdc_asdjflasutopfhvcZLmcfl_ |
| `CasperError` | 1 | 73164 | window.window.CasperError |
| `WebPage` | 1 | 72357 | window.window.WebPage |
| `__fxdriver_unwrapped` | 1 | 72748 | window.window.__fxdriver_unwrapped |
| `__nightmare` | 1 | 73737 | ?.__nightmare |
| `__playwright` | 1 | 73603 | ?.__playwright |
| `__playwright__` | 1 | 73675 | ?.__playwright__ |
| `__webdriver_script_fn` | 1 | 72607 | window.document.__webdriver_script_fn |
| `_defaultView` | 1 | 116304 | ?._defaultView |
| `_virtualConsole` | 1 | 26996 | ?._virtualConsole |
| `callPhantom` | 1 | 72043 | window.window.callPhantom |
| `documentElement` | 3 | 64068, 89402, 116203 | ?.documentElement |
| `domAutomation` | 1 | 72809 | window.window.domAutomation |

#### TDC/验证码自有键（5 个 key）

| key | n | 字节码 ip | 解析到的路径（若有） |
|---|---|---|---|
| `OUjbOmijNcmaNQYdkNagXSCBMZGJgWDN` | 1 | 10950 | window.window.OUjbOmijNcmaNQYdkNagXSCBMZGJgWDN |
| `TCaptchaIframeClientPos` | 6 | 27084, 27533, 37086, 55759 | window.window.TCaptchaIframeClientPos<br>?.TCaptchaIframeClientPos |
| `TCaptchaReferrer` | 1 | 13784 | ?.TCaptchaReferrer |
| `TCaptchaSid` | 3 | 12130, 27704, 110798 | ?.TCaptchaSid<br>window.window.TCaptchaSid |
| `_cPWCPZdYfJgnFEOYmfDJVfBmHNSYlDWm` | 10 | 15088, 20188, 46021, 48316 | window.window._cPWCPZdYfJgnFEOYmfDJVfBmHNSYlDWm<br>?._cPWCPZdYfJgnFEOYmfDJVfBmHNSYlDWm |

### 8.3 带前缀的键 ⇒ **疑似 collect 的输出字段名**（重要）

在 487 个键里，有一批形如 `<前缀>-<属性>` 的名字，它们不像 DOM API，而像**采集容器里的字段名**：

| key | n | 字节码 ip |
|---|---|---|
| `ac-baseLatency` | 1 | 25469 |
| `ac-channelCount` | 1 | 25749 |
| `ac-channelCountMode` | 1 | 25805 |
| `ac-channelInterpretation` | 1 | 25871 |
| `ac-maxChannelCount` | 1 | 25605 |
| `ac-numberOfInputs` | 1 | 25654 |
| `ac-numberOfOutputs` | 1 | 25705 |
| `ac-outputLatency` | 1 | 25515 |
| `ac-sampleRate` | 1 | 25554 |
| `an-channelCount` | 2 | 7745, 26250 |
| `an-channelCountMode` | 2 | 7845, 26304 |
| `an-channelInterpretation` | 2 | 7969, 26370 |
| `an-fftSize` | 1 | 25902 |
| `an-frequencyBinCount` | 2 | 7209, 25958 |
| `an-maxDecibels` | 2 | 7357, 26040 |
| `an-minDecibels` | 2 | 7283, 25999 |
| `an-numberOfInputs` | 2 | 7571, 26155 |
| `an-numberOfOutputs` | 2 | 7665, 26206 |
| `an-smoothingTimeConstant` | 2 | 7481, 26106 |

解读：`ac-` = AudioContext 系（baseLatency/channelCount/sampleRate/…），`an-` = AnalyserNode 系（fftSize/frequencyBinCount/smoothingTimeConstant/…）。
**这就是「collect 明文字段名可静态部分枚举」的直接证据**：这些键是从字节码的 `fromCharCode` 拼串里恢复出来的，不是猜的。
同理可推：其它指纹项的字段名也在这套拼串里，只是可能不带前缀（例如直接 `ua`/`scr` 这类短名会被我的 ≥3 字符过滤掉）。

#### 其它（未归类，共 332 个 key，仅列前 60）

```
  $  +  /  =  Array  AxrLBq  Boolean  CSS  Error  EventTarget  Float32Array  Function  GlUeEut  JFOdfA  KtDPHH  Math  MouseEvent  Number  Object  PI  RTCPeerConnection  RegExp  String  Symbol  TypeError  Uint8Array  [16]  [17]  [28]  [2]  [35]  [3]  [4]  [5]  [6]  [7]  [8]  _SWaUODDFNhWhbiTWhbUHROdCDXYYgRhZ  _state  a  abs  ac-baseLatency  ac-channelCount  ac-channelCountMode  ac-channelInterpretation  ac-maxChannelCount  ac-numberOfInputs  ac-numberOfOutputs  ac-outputLatency  ac-sampleRate  af  altKey  an-channelCount  an-channelCountMode  an-channelInterpretation  an-fftSize  an-frequencyBinCount  an-maxDecibels  an-minDecibels
```

> 说明：这里的属性名是**从字节码里静态恢复出来的**，含少量噪声（相邻函数的状态泄漏会拼出 `1screen`、`GlUeEut` 这类；垃圾串一律被 §3 的垃圾表项排除）。判据：一条访问点被采信的最低要求是「键寄存器在本帧内由 `0x4b/0x4f/0x52/0x0a/0x48` 逐字拼成」。

### 8.4 卡住的地方（诚实标注）

1. **1394 处访问点只知道键名、不知道宿对象**：基址寄存器来自调用返回值（如 `getContext("webgl")` 的返回），静态无法跟进去。要闭合必须做执行轨迹或更重的符号执行 → **未验证**。
2. `0x2c` / `0x30` 是**变长条件跳转**（`ip += cond ? imm : (imm,imm)`），静态对齐时两分支都会试；build A 上只有 4 处两种长度都合法的歧义点（占 0.01%），已标注 `ambiguousJmpIf`。
3. `0x0b/0x17/0x1b/0x21` 的**重入目标 ip** 依赖运行期寄存器（返回值地址），因此「函数边界」是启发式（段内不连续即视为新帧），跨帧数据流不做推断。

## 9. 对父会话最关心的「collect 明文里有什么」：静态能给什么 / 给不出什么

**能给（本报告即证据）**：

1. **字段名的候选全集**：VM 里所有以「对象.属性」形式读到的键（§8，487 个去重键），包含全部指纹面：UA/platform/vendor/languages/hardwareConcurrency/deviceMemory/plugins/mimeTypes/webdriver、screen 全套、canvas 2d 与 WebGL 的 UNMASKED_* / ALIASED_POINT_SIZE_RANGE / 各精度、Web Audio 的 baseLatency/channelCount/startRendering、performance.timing、storage、以及反自动化探针（`__playwright`/`__nightmare`/`$cdc_…`/`callPhantom`/`CasperError`）。
   **更关键**：§8.3 的 `ac-*` / `an-*` 那批键说明**输出字段名本身就在字节码里逐字拼出来**——即「collect 明文里有哪些字段名」在静态侧是**部分可直接读到的**。
2. **采集顺序与写入点**：`0x1f PROP_WRITE_IMM` / `0x22 PROP_WRITE_DYN` 把读到的值写进容器（例：`64905 A[15][0]=A[14]`），所以「哪个值进第几个槽」是**可静态枚举**的，只要基址是当前帧内构造的对象。
3. **容器结构线索**：`0x41 A[d]={}`（对象）、`0x40 A[d]=Array(imm)`（定长数组）、`0x4b A[d]=""`（字符串累加）三类分配 + `setData` 的入口（`TDC.setData` 会把外部对象并进去）。
4. **`eks` 与采集无关**：`window[TDC_NAME]`（352 字符 base64）只在文件头写一次，字节码里对它的读取点（§8 的 `_SWaUODD…`/`OUjbOmij…` 键）是**原样回填给 getInfo()**，不参与 derive。

**给不出**：

1. **明文字段名 ≠ 明文字段值**。`getData(true)` 的输出是 8 字节块粒度的密文（父会话已实测 ECB 特征），静态分析拿不到任何明文；**不要在密文里找 `userAgent` 字符串**——它不存在。
2. **密钥/明文都不在静态常量里**：TEA 的 key 由 VM 在运行期派生（父会话已用篡改 eks + 80 组候选密钥证伪），我这边也**没有**在字节码里找到 16/32 字节的 key 常量（字节码里全是 ≤32 位小整数）。
3. **不能静态确定「某一轮实际写了哪些字段」**：字段集合取决于运行期分支（能力探测失败就走降级），例如 `getContext("webgl")` 返回 null 时整块 WebGL 采集不执行。这正是「同一会话长度稳定、跨环境长度变化」的原因。→ 要**确知**本次 collect 的字段集合，只能在 VM 里 hook `0x1f/0x22` 的写入点（父会话的插桩路线），静态这边只能给候选集与写入点。
4. **JSON 序列化层**：`JSON.stringify` 是走 `0x04/0x07/0x59` 这类通用 call 调全局 `JSON`（§8.1 的 `window.JSON` 26 处），键名来自对象字面量构造而不是可读字符串——所以「最终字段名的拼写」在静态侧是**部分可读**的，别指望 100%。

## 10. 已验证 / 未验证清单

**已验证（可复现命令 / 字节级）**

1. 字符串表两 build 全部解出、校验和精确命中（build A `0xeea92`/15 轮；build B `0x89d40`/28 轮），产物 `samples/tdc.strings.json`。
2. 字节码静态解出：build A 124,690 整数 / 入口 0x18b60；build B 121,743 / 入口 0x1aca5；**独立重写实现与文件助手逐字节一致**。
3. 分发器：build A 94 条 opcode（0x00–0x5d，无空洞），build B 97 条（0x00–0x60）；操作数个数 = `++ip` 次数，已逐条核对。
4. 反汇编覆盖率 build A 99.86%（29,651 条指令）、build B 99.82%；两 build 里都**没有出现非法 opcode**（对齐自洽的强证据）。
5. 环境访问点 1994 处 / 去重 487 个键，含两条可复核的证据窗口（§8.1）。
6. opcode 分类（§7）全部由分支代码直读；「加密不是独立 opcode」由 94 条语义表穷举得出。

**未验证 / 只是候选**

1. TEA/XTEA 的具体变体与轮数：常量池有 delta/2·delta（5 处读取），但**没能**把某段字节码静态判定为 32 轮 mix 或 key schedule。
2. `0x0b/0x17/0x1b/0x21` 重入目标表（即「有哪些 VM 内函数」）没有静态枚举完：目标 ip 依赖运行期返回值地址。
3. §8 里 1394 处「键名已知、宿对象未知」的访问点，宿主只能靠执行轨迹闭合。
4. build B（`scripts/tdc.js`）只做了字符串表 / 字节码 / opcode 表；**它的环境访问点没有做**（opcode 编号不同，我的角色驱动管线虽然通用，但对 build B 的字符串装配形态适配不足，恢复出的键名质量不达标 ⇒ 不报告）。
5. 服务端是否校验指纹一致性 → 需要真实 verify，静态无法回答。

## 11. 复现（全部本地、无网络）

```powershell
cd D:\ds_work\js_reverse_projects\eo_captcha_reverse
# 0) acorn 从本机已有依赖取，不装包
#    D:/ds_work/dsh-src/node_modules/.pnpm/acorn@8.17.0/node_modules/acorn

# 1) 顶层结构
node tools/vmp/ast_overview.mjs samples/cur_tdc.js

# 2) 字符串表（解 + 校验 + 输出折叠后源码）
node tools/vmp/strings.mjs samples/cur_tdc.js src/_vmp/cur.strings.json --fold src/_vmp/cur.folded.js
node tools/vmp/strings.mjs scripts/tdc.js    src/_vmp/tdcjs.strings.json --fold src/_vmp/tdcjs.folded.js
node tools/vmp/merge_strings.mjs samples/tdc.strings.json "src/_vmp/cur.strings.json:cur_tdc.js" "src/_vmp/tdcjs.strings.json:scripts/tdc.js"

# 3) 字节码解码（含独立交叉验证）
node tools/vmp/bytecode.mjs src/_vmp/cur.folded.js   samples/cur_tdc.js src/_vmp/cur.bytecode.json
node tools/vmp/bytecode.mjs src/_vmp/tdcjs.folded.js scripts/tdc.js      src/_vmp/tdcjs.bytecode.json

# 4) opcode 表（角色按分支代码形态判定，跨 build 可迁移）
node tools/vmp/opcodes.mjs src/_vmp/cur.folded.js   src/_vmp/cur.opcodes.json
node tools/vmp/opcodes.mjs samples/cur_tdc.js       src/_vmp/cur.opcodes.orig.json   # 拿原文件偏移
node tools/vmp/roles.mjs   src/_vmp/cur.opcodes.json

# 5) 反汇编 + 字符串重建 + 环境访问点
node tools/vmp/disasm.mjs     src/_vmp/cur.bytecode.json src/_vmp/cur.opcodes.json src/_vmp/cur.disasm.json
node tools/vmp/env_points.mjs src/_vmp/cur.disasm.ins.json src/_vmp/cur.envpoints.json
node tools/vmp/show.mjs       src/_vmp/cur.disasm.ins.json 64899 10 3     # 看证据窗口

# 6) 本报告
node tools/vmp/gen_report.mjs
```

---

产物索引：

| 文件 | 内容 |
|---|---|
| `samples/tdc.strings.json` | 两 build 的 `index → 明文`（含全表、调用点偏移、别名、偏移/轮转元数据） |
| `src/_vmp/cur.folded.js` / `tdcjs.folded.js` | 常量折叠后的源码（`_0xNNN(0xABC)` 全部变明文） |
| `src/_vmp/cur.bytecode.json` / `tdcjs.bytecode.json` | 解出的整数流 + 入口 |
| `src/_vmp/*.bytes.bin` | base64 解出的原始字节（sha256 见日志） |
| `src/_vmp/cur.opcodes.json` / `.orig.json` | opcode 表（折叠态 / 原文件偏移态） |
| `src/_vmp/cur.disasm.ins.json` | 29651 条指令（ip / op / role / operands / len） |
| `src/_vmp/cur.envpoints.json` | 环境访问点（byKey / byRoot / hits） |
| `src/VMP_STATIC.md` | 本报告 |
