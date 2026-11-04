### 澄清：根因是浏览器版本，不是 MCP bug

上一版评论里「这是 v1.5.1 的 main-world 执行通道 bug」判断有误，特此纠正。

**实际根因**：本地启动的是 **普通版 135.0.1-beta.24**（Camoufox 官方版），它**没有 Camoufox 原生 `mw:` 通道**，所以 `world="main"` 报 `no result sentinel`。

换成 **152 reverse.5 定制版**（`executable_path` 指定 `camoufox.exe`）后，`world="main"` 全部正常：

```js
// evaluate_js(world="main")
→ { execution_backend: "camoufox_native",
    value: "object|object|function|object" }
// window.FEILIN / window.um / initAliyunCaptcha / __ALIYUN_CRYPT 全部读到

// hook_function(world="main")
→ { status: "tracing", install_state: "installed",
    execution_backend: "camoufox_native" }
```

**结论**：v1.5.1 的 `world="main"` 修复是有效的，`no result sentinel` 只是因为普通版缺 `mw:` 通道，不是 MCP 逻辑 bug。本 Issue 的问题已解决，可以关闭。

感谢修复。
