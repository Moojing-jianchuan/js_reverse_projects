### 复测补充（v1.5.1）

升级到 **v1.5.1** 后复测，第一轮问题已**部分修复**：

- `launch_browser` 已返回 `main_world_eval: true`，`world="main"` 参数也生效了（不再静默退回 isolated）。
- 但 **main-world 实际执行通道仍未打通**，`evaluate_js(world="main")` 和 `hook_function(world="main")` 都稳定报：

```
Camoufox main-world execution returned no result sentinel; the expression was not retried because it may have side effects
```

复现（已按 skill 要求先 `get_page_info()` 拿主 frame `index=0`，再传 `frame_index=0`）：

```js
await mcp.launch_browser({ headless: false, enable_trace: true });
await mcp.navigate({ url: "https://tool.manmanbuy.com/m/aliVal.aspx", wait_until: "domcontentloaded" });
const frames = await mcp.get_page_info();   // 主 frame index=0

await mcp.evaluate_js({ expression: "typeof window.FEILIN", world: "main", frame_index: 0 });
// → { type:"error", error:"...no result sentinel..." }
// 预期 { type:"primitive", value:"object" }

await mcp.hook_function({ function_path: "window.FEILIN.initFeiLin", mode: "trace", world: "main", persistent: true });
// → { error:"...no result sentinel..." }
```

**关键现象**：`trace_property_access`（引擎层通道）正常工作能采到主世界值，唯独 `evaluate_js`/`hook_function` 的 main-world 通道（`mw:` 通道 / `wrappedJSObject` 回退）返回缺哨兵标记。

**判断**：这是 v1.5.1 的 main-world 执行通道 bug（返回体里也没有 `execution_backend` 字段，两条 backend 都没能正确回传结果），和 `enable_trace` 无关。
