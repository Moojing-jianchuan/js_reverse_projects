# zhipin_reverse

BOSS直聘 `__zp_stoken__` 的本地生成与验证环境（jsdom 补环境 + 双路阶段对照）。

## 当前状态

| 层级 | 状态 | 说明 |
|---|---|---|
| S1 能生成 | ✅ | jsdom 产出 token；阶段数与 API 顺序与浏览器完全一致（754 / 21） |
| S2 服务端受理 | ⚠️ 仅浏览器会话 | 真实 `security.html` 由浏览器打开可通过挑战（跳到 `jobs?_security_check=…`）；**token 脱离该会话一律 38/37** |
| S3 命中数据 | ⚠️ 依赖 S2 | 浏览器通道可用；纯协议当前不可 |
| S4 可持续 | ❌ | 未验证 |

环境快照一致度 **48/49**；唯一已知不可对齐项是 `p=14892`（时间/随机派生）。

## 目录

```
env_jsdom.js            jsdom 环境伪装核心（navigator/screen/window/canvas/webgl/CSS/iframe/cookie/storage）
gen_token2.js           生成 token：node gen_token2.js <sdk> <seed> <ts> [pageUrl]
main.py                 完整流程：python 取 seed → node 生成 token → 发送校验
main_jsdom.js           纯 jsdom 的对照版本
capture_env.py          采集真实浏览器环境写入 config/browser_env.json
tools/                  插桩、双路对照、SDK 获取（见下）
config/                 当前 SDK、插桩版、环境快照、security.html inline 脚本快照
docs/notes.md           技术笔记：证据、消融、踩坑记录
```

## 快速开始

拿当前 SDK（浏览器网络里直接取，不走 API）：

```bash
python tools/find_sdk.py
```

换版后一键接入（下载 → 插桩 → 双路对照 → 差异报告）：

```bash
python tools/onboard_sdk.py --name <8位hex>
python tools/onboard_sdk.py --file config/_sdk_xxx.js
```

手工对照（**顺序不能反**：浏览器跑完会把当次指纹写回 `config/browser_env.json`）：

```bash
python tools/stage_run_browser.py <seed> <ts> tmp_browser_stages.json
node   tools/stage_run_jsdom.js  <seed> <ts> tmp_jsdom_stages.json
python tools/first_diff.py       tmp_browser_stages.json tmp_jsdom_stages.json
```

生成 token：

```bash
node gen_token2.js config/_sdk_6d66a65a.js <seed> <ts>
node gen_token2.js config/_sdk_6d66a65a.js <seed> <ts> "https://www.zhipin.com/web/passport/zp/security.html"
```

`main.py` 是完整流程脚本（python 取 seed → node 生成 token → 发送），`main_jsdom.js` 是纯 jsdom 的对照版本。

## 工具

| 工具 | 用途 |
|---|---|
| `tools/probe_ip.py` | 测出口：`--proxy http://127.0.0.1:7897`，`code 37` 表示出口干净、`35` 表示被风控 |
| `tools/find_sdk.py` | 打开页面监听 response，抓当前 `security-js/<name>.js` 并落盘 |
| `tools/onboard_sdk.py` | 新 SDK 一键接入：下载/插桩/浏览器侧/jsdom 侧/差异报告 |
| `tools/instrument_sdk.py` | 把 169 处分发调用改写成 `__trace(p, args, ret)` |
| `tools/prelude_stage.js` | 确定性 `Math.random`、阶段日志、API 日志、读探针 |
| `tools/stage_run_browser.py` | 浏览器侧执行，并回写当次指纹到 `config/browser_env.json` |
| `tools/stage_run_jsdom.js` | jsdom 侧执行（`ZP_PRE_EVAL` / `ZP_PROBE_READS` 可开关） |
| `tools/first_diff.py` | 按执行顺序找第一个真实差异（自动跳过时间/随机阶段） |
| `tools/stage_compare.py` | 阶段/取值摘要对照 |
| `tools/env_compare.py` | 环境快照逐项对照 |
| `tools/ablate.py` / `ablate_browser.py` | 单侧消融，定位某阶段依赖哪个环境项 |
| `tools/capture_css.py` / `css_counter.py` | 采集/度量 CSS 枚举口径 |
| `tools/stage_ctx.py` / `stage_window.py` / `read_compare.py` | 阶段上下文、窗口切片、读探针对照 |

## 关键机制

1. **SDK 由服务端下发**：`/web/passport/zp/security-js/<name>.js`，name 随版本变化（如 `cb43d3e3` → `6d66a65a`），只能在浏览器网络里看。
2. **挑战流程**：`POST joblist.json` → `code 37` + `zpData.{seed,ts,name}` → 生成 token → 带 cookie `__zp_stoken__`（**必须 percent-encoded**）重发 → `code 0`。
3. **token 一次性 / 有时效**：页面生成的 token 被用掉后再重放必 `37`；请求里只带 `__zp_stoken__` 即可通过，不需要 sseed/sts/sname。
4. **token 含随机时间**：同 seed + 同 ts 也不可能逐字节复现，判据只能是服务端受理，不是等长或哈希。

## 已知差异

| 项 | 状态 |
|---|---|
| CSS 原型名枚举（`p=19458`） | ✅ 已对齐：用浏览器里 SDK 实际枚举到的首段前缀（`cssSdkProto`，1152 项）建原型 |
| 环境快照 | 48/49，仅 `deviceMemory` 表示方式不同（无实际影响） |
| `p=14892` 及其派生（`p=14643`） | ⛔ 时间/随机派生，浏览器连续跑也是 23/29/30，不可对齐 |
| token 长度 | 577 = 577 |

## 出口（重要）

**结论：不需要代理——被封的只是本机 IPv6，强制 IPv4 直连就是干净的。**

| 出口 | 结果 |
|---|---|
| 直连 IPv6（2409:8760:… 移动） | `code 35 您的IP地址存在异常行为` |
| 直连 IPv4（`curl -4`） | **`code 37` + seed + name** ✅ |
| Clash 代理 127.0.0.1:7897（境外 IP） | `code 37` 也能拿 seed，但浏览器/python 必须同出口 |

用法：

```bash
python tools/probe_ip.py            # 直连（默认强制 IPv4）→ 37
python tools/probe_ip.py --proxy http://127.0.0.1:7897
python main.py                       # 完整链路（IPv4）
```

代码层固定 IPv4：

```python
from curl_cffi.const import CurlIpResolve, CurlOpt
requests.post(url, ..., curl_options={CurlOpt.IPRESOLVE: CurlIpResolve.V4})
```

浏览器侧：`Camoufox(firefox_user_prefs={"network.dns.disableIPv6": True})`。

## 注意

- **先浏览器、后 jsdom**：Camoufox 每次启动随机化指纹，浏览器侧会把当次指纹写回配置。
- 任何环境 A/B 都必须**单次采样 + 间隔拉长**；高频请求会触发 `code 35 IP 异常`，那时所有结果都不可信。
- 插桩会改变函数身份/`toString`（本身是指纹），对照时两边必须用**同一份插桩**。
