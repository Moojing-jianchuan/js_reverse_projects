# key 提取攻关记录（2026-11-19 01:00–02:00）

## 已确认的事实（都是实测）

### 1. build 之间 key 不通用（`scripts/e51_key_family.mjs`）

对 6 份 build 各跑一次 VM，用两个已知 key 尝试解密它们各自的输出：

```
cur_tdc.js      264504  collect 4140  → buildA(verified) 可解 (cd=73)
browser_tdc.js  249052  collect 4492  → NONE
online_tdc.js   244257  collect 4172  → NONE
e2_tdc.js       247146  collect 4172  → NONE
rdp_tdc2.js     241194  collect 4524  → NONE
rdp_tdc.js      192476  collect 4120  → NONE
```

⇒ **每份 build 的 key 都不同**，不存在"家族复用"。

### 2. B 的 12 是 key 错，不是模板错（`scripts/e50_key_selfcheck.mjs`）

同一份 `tdc.js` 在本地 VM 里出 collect，再用提取的 key 解它自己：

```
tdc.js 244257 (TDC_NAME NKibcNUnfmkEiYQKYDUBEOinAnCcXEPW)
local collect 4364
FAIL  tdc_key EK [1918201689,…]  -> 乱码
FAIL  build-A EK [1347505518,…]  -> 乱码
```

**连自己加密的输出都解不开** ⇒ 该 build 的 key 提取是错的。这比"在线试 3 次都 12"更能说明问题。

### 3. 尝试从 VM 寄存器直接 dump key：脚本注入位置不对

思路：VM 的 key 一定在运行时内存里。做法是给 `tdc.js` 打补丁，在寄存器数组初始化后暴露
`globalThis.__regs`，跑完 `getData` 后遍历寄存器里所有 4 连整数当候选 key，用 collect 反解验证。

`scripts/e52_dump_key_from_vm.mjs` 的现状：

```
opcode 0x32  register array _0x1bfc65
init site index 9082          ← 这里插到了字符串表里，不是函数体内
→ SyntaxError: Unexpected token ','
```

寄存器名识别成功（放宽容错后能从 `case 0x32:` 拿到 `_0x1bfc65`），但**初始化点定位错了**：
`_0x1bfc65=[]` 的第一次出现是在字符串/字节码区，直接在那里插代码会破坏脚本。
需要在**解释器函数内**（`case 0x32` 所在的那个函数）插入，或改用"函数入口暴露参数"的方式。

## 并行进行中

子任务 `7c755d13` 正在做「枚举 + VM 自检」版提取器（`tools/tdc_key2.mjs`）：
把"猜明文是 JSON"换成"必须能解开同 build 的 VM 输出"，并扩大候选空间（词序 / S / 端序 / 轮数 / sum 位置 / 偏移）。

## 下一步（等子任务结果后择一）

1. 若 `tdc_key2` 能稳定解出 244257 那类 build → 直接回到 e48 重跑在线。
2. 若仍不稳 → 修 `e52` 的插桩点：在解释器函数体首行注入（而不是数组初始化处），
   把 `__regs` 暴露出来，用"寄存器遍历 + collect 反解"当 oracle —— 这条路不依赖任何静态规则，最接近"必然正确"。
