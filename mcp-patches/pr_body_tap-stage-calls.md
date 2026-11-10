## 改动原因

控制流平坦化的 JSVMP 把所有状态收敛到同一个分发调用：

```js
return l.apply(this, [9425].concat(Array.prototype.slice.call(arguments)))
```

现有的 `tap_get` / `tap_call` / `tap_method` 覆盖的是属性读取与普通调用，
看不到这层「状态号 + 参数透传」的边界。结果是：做“真实浏览器 vs 本地补环境”对照时，
只能看到最终 token 不同，没有任何 per-state 证据，无法定位是哪个状态开始跑偏。

本次实战就卡在这里：315 KB 的 security SDK、169 个分发调用点、754 步执行，
最终是我手写 169 点阶段插桩才一步定位到“第 28 步分叉”。工具本该自带这个能力。

## 改动内容

- `instrumentation(action="install", tap_stage_calls=True)`：字面量匹配上面的分发调用，改写成
  `__mcp_tap_stage(p, fn, this, arguments, tag, site)`。调用语义不变，只额外产出一条
  `tap_stage` 事件：状态号 `p`、`argc`、前几个入参预览、返回值预览。
- `action="log"` 新增 `summary.hot_stages`（按 `p` 聚合），并支持 `type_filter="tap_stage"`、
  `key_filter=<p>`。
- 与 `mode` / `filter_property_names` / `filter_object_names` 无关；**文件解析失败时仍生效**
  （`stats.stage_only=true`，只做阶段插桩），保证巨型混淆产物可用。
- 默认关闭；入参用启动时捕获的 `Array.prototype.slice` 复制一份，日志异常不会替换分发函数的返回值。
- `include_source_site=True` 时为阶段 tap 同样输出 site id。

### 为什么是字面量匹配而不是 AST

分发调用的写法在打包产物里极其稳定，而这类文件常常是 esprima/acorn 解析不了、或解析代价很高的
巨型混淆产物。字面量匹配既能覆盖，又不依赖解析成功；AST 那层继续负责 member/call tap。

## 使用方式

```text
instrumentation(action="install", url_pattern="**/security-js/*.js",
                tap_stage_calls=True, tag="vmp")
navigate("https://target-site.com/")            ← install 必须先于 navigate
instrumentation(action="log", type_filter="tap_stage")
```

## 验证

- 真实 315 KB 安全 SDK：改写 **169** 处分发调用；单次 `ABC().z(seed, ts)` 产出 **754** 条
  `tap_stage`、**51** 个不同状态；token 长度与改写前一致（577），无行为变化。
- 新增 `tests/test_stage_taps.py`（7 项）。
- `tests/test_ast_rewriter.py`、`tests/test_instrumentation_semantics.py`、`tests/test_docs.py` 全绿；
  全量非浏览器用例 **358 passed**。
- `tests/test_jsvmp.py` 的两处 `UnicodeDecodeError` 是 Windows 默认 GBK 读文件的既有问题，与本次改动无关。

## 兼容性与风险

- 默认关闭，现有行为、offset、日志格式不变；`hot_stages` 是新增字段。
- 只匹配固定调用形态，不命中就原样返回，不会误改其他 `apply` 调用。
- 日志量大时受现有 20000 条上限约束（`possibly_capped` 语义不变）。
