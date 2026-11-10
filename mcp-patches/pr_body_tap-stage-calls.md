## 动机

控制流平坦化的 JSVMP 里，每个状态都走同一个分发调用形态：

```js
return l.apply(this, [9425].concat(Array.prototype.slice.call(arguments)))
```

member/call tap 看不到这层边界。本地补环境与真实浏览器出现分歧时，只有最终 token 不同，没有任何“哪个状态开始跑偏”的证据，排查只能靠猜。

## 改动

- `instrumentation(action="install", tap_stage_calls=True)`：字面量匹配上面的分发调用，改写成
  `__mcp_tap_stage(p, fn, this, arguments, tag, site)`。调用语义不变，只多一条 `tap_stage`
  事件：状态号 `p`、`argc`、前几个入参预览、返回值预览。
- `action="log"` 新增 `summary.hot_stages`（按 `p` 聚合），并支持 `type_filter="tap_stage"`、
  `key_filter=<p>`。
- 与 `mode` / `filter_property_names` / `filter_object_names` 无关；**解析失败时仍然生效**
  （此时 `stats.stage_only=true`，只做阶段插桩），保证大体积混淆文件可用。
- 默认关闭，行为零变化。入参用启动时捕获的 `Array.prototype.slice` 复制一份，日志异常不会替换
  分发函数的返回值。
- `include_source_site=True` 时为阶段 tap 同样输出 site id。

## 为什么是字面量匹配而不是 AST

分发调用的写法在打包产物里极其稳定，而这类文件常常是 esprima/acorn 解析不了或解析代价很高的
巨型混淆产物。字面量匹配既能覆盖，又不依赖解析成功；AST 那一层继续负责 member/call tap。

## 验证

真实 315 KB 安全 SDK（控制流平坦化 + JSVMP）：

- 改写 **169** 处分发调用；
- 单次 `ABC().z(seed, ts)` 产出 **754** 条 `tap_stage`，**51** 个不同状态；
- token 长度与改写前一致（577），无行为变化。

新增 `tests/test_stage_taps.py`（7 项）；`tests/test_ast_rewriter.py`、
`tests/test_instrumentation_semantics.py`、`tests/test_docs.py` 全绿。
`tests/test_jsvmp.py` 的两处 `UnicodeDecodeError` 是 Windows 默认 GBK 读文件导致的既有问题，与本次改动无关。
