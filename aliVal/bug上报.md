# Bug 报告：camoufox-reverse MCP 的 `evaluate_js` / `hook_function` 无法访问主世界全局

## 环境

| 项 | 值 |
|----|-----|
| MCP 版本 | camoufox-reverse MCP **v1.2.0**（`check_environment` 返回 version_ok=true）|
| 浏览器 | camoufox-reverse 定制版（`trace_active=true`，Firefox 内核 135）|
| 操作系统 | Windows 10（win32）|
| Node.js | v22.14.0 |
| 复现场景 | 页面加载了混淆 SDK（阿里云 FeiLin），SDK 在主世界挂载 `window.FEILIN` / `window.um` |

## 现象

1. `evaluate_js` 读不到主世界全局，返回 `undefined`：
   ```js
   evaluate_js("typeof window.um")            // → "undefined"（主世界实际是 "object"）
   evaluate_js("typeof window.FEILIN")        // → "undefined"（主世界实际是 "object"）
   evaluate_js("typeof window.initAliyunCaptcha") // → "undefined"
   ```
2. `hook_function` 找不到主世界函数，报 `Cannot find`：
   ```
   [TRACE] Cannot find: window.FEILIN.initFeiLin
   ```
3. 结果：无法在主世界 hook / 观察 SDK 的 `initFeiLin` 真实执行，导致 jsdom 环境伪装的 `null.slice()` 缺项无法定位。

## 根因

`evaluate_js` 和 `hook_function` 运行在 **isolated world（隔离世界）**：

- **主世界（main world）**：页面自己的 JS 运行环境，混淆 SDK（`feilin002.js`）在这里执行，`window.FEILIN`、`window.um`、`initAliyunCaptcha` 等都挂载在这里。
- **隔离世界（isolated world）**：MCP 注入的 JS 运行环境。它和主世界**共享 DOM**，但 **`window` 全局对象是独立的一份**——隔离世界的 `window` 上没有页面挂载的那些全局。

所以 `hook_function` 去隔离世界的 `window` 上找 `FEILIN`，自然找不到（`undefined`），报 `Cannot find`。

camoufox 当前能碰到主世界的能力只有两个，都有盲区：
- `trace_property_access`：引擎层追踪，**只追属性读取，追不到方法调用**（`.slice()` 这类追不到）
- `instrumentation`：AST 源码重写，可用但偏重

## 建议修复

给 `evaluate_js` 和 `hook_function` 增加 **`mainWorld` 参数**（或等价的主世界执行上下文），对标 js-reverse MCP 已有的 `evaluate_script(mainWorld=true)`。

- 方案 A（Playwright 原生）：`page.evaluate(fn)` 天然跑在主世界；isolated world 才是需要额外指定 `isolation` 的。把 `evaluate_js` 默认切回主世界，或加 `mainWorld` 开关。
- 方案 B（CDP 层）：`Runtime.evaluate` 时指定 `executionContextId` 为主世界 context（`Page.getFrameTree` → `Runtime.executionContextCreated` 里 `auxData.isDefault === true` 的那个），而不是默认的 isolated context。

## 影响

1. **无法 hook 主世界 SDK 函数**：`hook_function("window.um.getToken", ...)` 这类操作全部失效，逆向核心武器缺一块。
2. **无法在主世界观察混淆 SDK 真实执行**：只能靠引擎层 `trace_property_access`（看不到方法调用）和 AST 插桩，定位问题的效率大幅下降。
3. **直接阻塞路径 B**：本次实战中，jsdom 补环境卡在 `null.slice()`，本应通过主世界 hook 对比「浏览器成功 vs jsdom 失败」定位缺项，但 hook 不到主世界，卡点无法定位，最终被迫换用另一个 MCP（js-reverse）的 `mainWorld` 能力才拿到主世界数据。

## 复现代码样本

```javascript
// ========== 样本 1：evaluate_js 读不到主世界全局 ==========
// 前置：页面已加载 feilin002.js（主世界挂载 window.FEILIN / window.um）
const r = await mcp.evaluate_js({
  expression: "(() => JSON.stringify({ um: typeof window.um, FEILIN: typeof window.FEILIN }))()"
});
// 实际返回: {"um":"undefined","FEILIN":"undefined"}
// 预期返回: {"um":"object","FEILIN":"object"}

// ========== 样本 2：hook_function 找不到主世界函数 ==========
await mcp.hook_function({
  function_path: "window.FEILIN.initFeiLin",
  mode: "trace",
  log_args: true, log_return: true,
});
await mcp.reload();
const logs = await mcp.get_console_logs();
// logs 里出现: [TRACE] Cannot find: window.FEILIN.initFeiLin

// ========== 期望的修复后用法 ==========
await mcp.evaluate_js({
  expression: "window.um.getToken()",
  mainWorld: true,   // ← 建议新增的参数
});
// 期望返回: deviceToken 字符串
```
