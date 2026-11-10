# MCP 补丁：instrumentation tap_stage_calls

`0001-feat-instrumentation-add-tap_stage_calls-for-flatten.patch` 是对
[camoufox-reverse-mcp](https://github.com/WhiteNightShadow/camoufox-reverse-mcp)
（v1.9.3）的功能补丁：给源码级插桩加上「阶段/分发器」级别的 tap。

应用方式：

```bash
git clone https://github.com/WhiteNightShadow/camoufox-reverse-mcp.git
cd camoufox-reverse-mcp
git am /path/to/0001-feat-instrumentation-add-tap_stage_calls-for-flatten.patch
```

用法：

```text
instrumentation(action="install", url_pattern="**/security-js/*.js",
                tap_stage_calls=True, tag="vmp")
instrumentation(action="log", type_filter="tap_stage")
```

PR 正文见 `pr_body_tap-stage-calls.md`。
