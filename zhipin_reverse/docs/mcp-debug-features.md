# MCP / 浏览器调试能力调研（2026-11-11）

目标：在 `camoufox-reverse-mcp`（Camoufox + Playwright，Firefox 内核）上，还能新增哪些**真正可用**的调试能力。
所有结论都在本机实测过，不是文档推断。

## 一、已确认可用 ✅

| 能力 | 实测方式 | 结果 |
|---|---|---|
| Playwright tracing（会话录制） | `context.tracing.start(screenshots=True, snapshots=True, sources=True)` → `stop(path=...)` | 产出 **36.5 KB trace.zip**，可用 trace viewer 或 `trace.playwright.dev` 打开（DOM 快照 + 源码 + 网络 + console） |
| `Error.stack` | 页面内 `new Error().stack` | 可用，Firefox 格式 `g@file:line:col`，尾部带 `chrome://juggler/...` 帧（需过滤） |
| `page.route` 拦截/改写/阻断 | 已在挑战页流程里用于阻断跳转 | 可用 |
| console / pageerror / request / response 事件 | `page.on(...)` | 可用 |
| 源码级插桩 | `instrumentation(action="install", tap_stage_calls=True)` | 本次已合并进 v1.9.4 |
| 引擎级属性追踪 | `trace_property_access`（定制 build） | 可用，77 个原生属性点 |
| 运行时 hook | `hook_function` / `hook_jsvmp_interpreter` / `inject_hook_preset` | 可用（有原型/自有属性盲区，见 issue #24） |

## 二、已确认不可用 ❌（别再往这条路上投入）

| 能力 | 实测 | 原因 |
|---|---|---|
| CDP session | `browser.new_browser_cdp_session()` → `CDP session is only available in Chromium` | Firefox 走 juggler 协议，无 CDP |
| 真实断点 / 单步 / 暂停 | `debugger;` 语句实测耗时 **1 ms**，不暂停 | 无 devtools 附加；juggler 不暴露 debugger 域 |
| `arguments.callee` | strict 模式 → `TypeError` | 语言层禁止 |
| BiDi debugger 域 | 未暴露 | 规范尚未落地 |
| `page.pause()` | API 存在，但需要 headed + inspector | 无头环境无意义 |

**结论：这套栈上做不了"暂停—单步—查看作用域"式调试，只能做"记录型调试"（probe / trace / 事件流）。**

## 三、建议新增的能力（按性价比排序）

### 1. `trace_session`（会话录制，最省事、收益最大）

```text
trace_session(action="start", screenshots=True, snapshots=True, sources=True)
trace_session(action="stop", path="trace.zip")
```

价值：一次操作后可以回看完整现场（DOM 快照、网络、console、源码位置），比现在的"日志倾倒"高一个维度。
实现成本：极低，Playwright 原生支持，MCP 只需暴露 start/stop + 返回文件路径。

### 2. `probe`（日志断点 / logpoint）

把现有 instrumentation 从"成员读取 / 调用 / 分发调用"扩展到"任意位置插入探针"：

```js
// 改写前
x = decrypt(a, b);
// 改写后
x = (__mcp_probe(17, () => [[a, b]], new Error().stack), decrypt(a, b));
```

- 支持条件表达式（`cond: "a.length > 8"`）
- 记录值 + 栈帧（栈需过滤 `chrome://juggler` 帧）
- 支持次数上限、采样率

实现成本：中，AST 改写器已有，加一种编辑类型即可。

### 3. `stage_break`（状态断点）

在 `tap_stage_calls` 基础上，允许指定状态 `p`：

```text
stage_break(p=19458, capture="args+ret+stack", deep=True)
```

命中时记录完整入参/返回值（`structuredClone` 失败时降级为浅层预览）+ 调用栈。
价值：本次逆向里最花时间的就是"某个状态突然跑偏"，这个能力可以直接给出那一刻的现场。

实现成本：低，运行时里已有 `__mcp_tap_stage`，加一个 p 过滤与深拷贝开关。

### 4. `watch`（轮询采样）

```text
watch(expr="window.__state.counter", interval_ms=100, until="== 5")
```

用于观察某个全局值随时间的演化（对应"随机/时间参与编码"这类问题）。

### 5. `timeline`（合并时间轴导出）

把 console + pageerror + 网络 + 我们自己的 tap 事件合并成一条 `.jsonl` 时间轴，
按时间戳排序导出，便于离线比对两个环境（本次双路对照就是自己在拼这个）。

## 四、实现要点（踩过的坑）

- **栈要过滤**：Camoufox 的 `Error.stack` 尾部有 `chrome://juggler/...` 帧，直接展示会误导。
- **不要包原型**：`hook_jsvmp_interpreter` 只包原型，遇到实例自有属性会静默漏报（issue #24），
  新探针应同时处理 own property，并区分 `not_called` / `not_observed`。
- **改写要自检**：纯正则改写可能落进字符串字面量（PR #18 复审就抓到过），
  改写后必须 `node --check` 或 AST 复解析一次。
- **不要用 `page.pause()`**：无头环境无效；需要"暂停"语义时用 `stage_break` + 记录代替。

## 五、优先级建议

| 顺序 | 能力 | 理由 |
|---|---|---|
| P0 | `trace_session` | 成本极低，立刻把"回放调试"补齐 |
| P0 | `stage_break` | 直接服务 JSVMP 场景，成本低 |
| P1 | `probe` | 通用日志断点，替代大量临时 `console.log` |
| P2 | `timeline` | 双路对照/离线分析用 |
| P3 | `watch` | 特定时序问题才需要 |
