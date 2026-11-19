# 纯本地补环境：能到哪、为什么到此为止（2026-11-19 06:00 结案）

## 数字（全部实测，可复跑）

```
cd 逐槽一致：47 → 56 / 73        （scripts/e44_cd_diff.mjs）
非原生函数 ：108 → 0             （scripts/e80_count_non_native.mjs）
全局键     ：64 → 265（浏览器 iframe 是 282）
sd.fpBio.ce（canvas 短指纹）：与浏览器完全一致
sd.fpBio.af（audio  短指纹）：与浏览器完全一致
sd.fpBio.gp（graphics probe）：s:-3 → s:0，sp 与浏览器完全一致
```

在线 verify 结果：**全部 errorCode=12**（含最后一次、参数与"能过的那次"逐项一致）。

## 这一轮真正有效的改动

| 改动 | 证据 |
|---|---|
| 补齐 `Object.keys(window)` 到 282 键表（`scripts/browser_globals.mjs`） | 浏览器 282 / 本地原 64 ⇒ `sd.ep.k` 就是这个数 |
| `harden()` 的 `walk()` 逐键 try/catch + 末尾二次 walk | 108 → 0 个非原生函数 |
| `readPixels` 填确定性非零像素 | `gp` 从 `s:-3` 变 `s:0`，`sp="2a9ece8f78bd7689"` 与浏览器一致 |
| `location.href` 改成 widget iframe 的 URL | `cd[64]` 一致 |
| `matchMedia("(color-gamut: srgb)")` → true | `cd[24]` 一致 |
| 裸元素 rect → -9999/100、`offsetLeft/Top` → -9999 | `cd[55]` 一致 |
| `canPlayType` 按真值映射 | `cd[5]`、`cd[37]` 一致 |
| 实时 `AudioContext.destination` 补两个属性 | `cd[19]` 一致 |
| `window.name`、`getData` 前等 800ms、`storage.estimate` 真值、`styleSheets` 4/194 | `cd[3]`、`cd[42]`、`cd[32]` 一致 |

## 为什么剩下的修不动（每条都有实测依据）

| 槽 | 真值 | 尝试过的手段 | 结论 |
|---|---|---|---|
| `cd[7]` | 父页面 URL | 改 `referrer`/`frameElement`/`top`/`parent`/`self`/`ancestorOrigins` 全部无效；`e73` 读 trap 显示 SDK **只读 `location.href`(3)/`window.name`(2)/`window.opener`(1)** | 来源不在单 realm 可模拟的面上 |
| `cd[45]` | `"iframe"` | 同上（`top`/`parent`/`frameElement` 都不被读） | 同上 |
| `cd[43]` | `{_state:0, canvas, audio}` | 补 `Blob/FileReader/URL.createObjectURL/OffscreenCanvas/createImageBitmap/Image/ImageData` 全无效；`e67` 捕异常 0 个；`e83` 显示该对象不经 `JSON.stringify` | `-2` 是能力探测阶段的降级分支，不是异常 |
| `cd[66]` | `0` | 非原生函数 108→0、全局键补齐、`webdriver` 已 false | 仍 `22`：它是**内部分数**，不与"非原生函数数"相关 |
| `cd[22]/[23]/[41]/[59]/[63]` | 767/2/5/0.956/0 | `e75` 给所有全局属性装 getter、`e77` 给所有函数装返回值记录 | 这些值是 VM **内部算出来的派生量**，没有对应的 env API |
| `cd[30]` | `1;<sid>` | 设 `TCaptchaSid` 后 sid 对了，但前缀仍是 `0` | 前缀来自另一个标志，未定位 |
| `cd[68]/[69]` | cookie 值 | `e74` 确认来自 cookie | 每次会话本就不同 |

**值替换也试过**（`e81`：patch `case 0x22` 直接把 `"unknown"→URL`、`"top"→"iframe"`、`22→0`），替换确实触发（日志有 6 次命中），
但**槽值不变** ⇒ 写入走的是中间对象，不是最终 cd。

## 最后排除的一条：dispatcher 状态序列对照

MCP `instrumentation(install, tap_stage_calls=True)` 在这个 build 上改写成功（150 处 / 1 文件），
但 `window.__mcp_vmp_log` 里 **`tap_stage` 事件 = 0**（只做了 member access tap），日志 20000 条被数字占满。
⇒ 这条对照路在本 build 上不可用。插桩已 `stop` 清理。

## 结论

1. **纯本地补环境的上限是 56/73**。剩下 17 项里，3 个是时间戳（本就该不同），
   其余 14 项分两类：**单 realm 结构性缺失**（`cd[7]/[45]/[43]`）与 **VM 内部派生量**（`cd[22]/[23]/[41]/[59]/[63]/[66]`）。
2. 这些不是"再多补几个 API"能解决的 —— 已经用 7 种手段（变异归因 / 读取 trap / 函数返回值 trap /
   异常捕获 / 写入 opcode hook / 值替换 / stringifier hook）逐一排除。
3. `A 组`（浏览器出 collect + Node 发送）历史上就是 `errorCode=0`；`B 组`（本地出 collect）恒为 12。
   参数格式已逐项核对一致（`ans`、`tlg`、`eks`、`pow_answer` 全对）⇒ **差异只在 collect 明文**。

## 可交付的两条路

- **R5（推荐）**：浏览器过一次校验拿 `EO-Bot-Captcha-Token`（30 天有效），之后本地 HTTP 采集。
  工程上是稳定方案，已在本项目里跑通过。
- **继续 R3**：要越过 56/73，需要的不再是补环境，而是**换一个能拿到 iframe 真实上下文的执行器**
  （例如在真实浏览器里跑我们的 env 逻辑，或用 Firefox 的 jsdom 替代品承载双 realm），这属于换架构，不是继续修槽。
