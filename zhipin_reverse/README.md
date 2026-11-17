# zhipin_reverse

BOSS直聘 `__zp_stoken__` 的**纯协议**取数方案：本地用 jsdom 跑官方 security SDK 铸 token，再由 Python 走 HTTP 完成挑战流程与翻页采集。

> 最后验证：2026-11-17 —— 本地铸 token **被服务端受理**（`set/zpToken code=0` → joblist 返回 15 条/页），连续两次通过。
> 对应 SDK：`security-js/b9a070d3.js`（323891 字节，sha256 `fb71e45a708d78317169196f0695f561c44af6e8852b7b571d3b7ef90f495fd2`）。

---

## 目录（只有这些文件，全部为运行所需）

```
zhipin_client.py        协议采集器：取 seed → 本地铸 token → set/zpToken → 翻页 → JSONL
gen_token2.js           单次铸 token：node --allow-natives-syntax gen_token2.js <sdk> <seed> <rawTs> [pageUrl]
env_jsdom.js            jsdom 环境伪装核心（含全部环境修复，见下）
env_extra.js            额外环境补齐（window 键集、PluginArray 等）
env_extra_firefox.js    Firefox 152 实测键表（被 env_extra.js 引用）

config/_sdk_b9a070d3.js 官方 SDK 原始字节（不要改动/不要用改写版）
config/browser_env.json 浏览器环境快照（几何、canvas 真值、CSS 名集合等）
config/security_5d7c1c55.html  挑战页 DOM 骨架
config/security_inline.json    挑战页内联脚本快照

package.json / package-lock.json / node_modules/   仅依赖 jsdom
```

---

## 快速开始

```powershell
# 1) 依赖（已存在则跳过）
pnpm install        # 或 npm install

# 2) 端到端采集（本地铸 token，1 页）
D:\python\python.exe zhipin_client.py --mint local --pages 1 --out data/jobs.jsonl

# 3) 分页采集
D:\python\python.exe zhipin_client.py --mint local --pages 3 --out data/jobs.jsonl

# 4) 只铸一个 token（调试用）
D:\nodejs\node.exe --allow-natives-syntax gen_token2.js config/_sdk_b9a070d3.js "<seed>" <rawTs>
```

两阶段用法（需要复用同一会话时）：

```powershell
D:\python\python.exe zhipin_client.py --phase seed --session config/session.json
D:\python\python.exe zhipin_client.py --session config/session.json --token-file config/token.txt --pages 3
```

### 硬性要求

- 铸 token 的 node 进程**必须**带 `--allow-natives-syntax`（`document.all` 的 undetectable 语义依赖 `%GetUndetectable()`；不带会让环境形态偏离）。
- 请求必须走 **IPv4**（客户端已内置 `CURLOPT_IPRESOLVE=V4`；IPv6 出口会直接吃 `code 35`）。
- `config/_sdk_b9a070d3.js` 必须是官方原始字节，**不要**用任何插桩/改写版本。

---

## 挑战流程与错误码

```
业务接口 → code 37 + zpData{name, seed, ts}
   └─ 本地铸 token（jsdom 跑 SDK）→ 写 __zp_stoken__（值需 URL-encode）
        └─ POST /wapi/zppassport/set/zpToken（空 body，Referer 带 ?_security_check=1_<ms>）→ code 0
             └─ 重放业务接口 → code 0 + 数据
```

| code | 含义 | 处置 |
|---|---|---|
| `37` | 挑战，返回 seed | 正常，继续铸 token |
| `38` | 环境自证不通过 | token 内容被拒；换 seed 重试 |
| `35` | 出口 IP 风控 | **连 seed 都拿不到**，等冷却或换出口 |

---

## 原理摘要

```
token = "4eeeg" + base64( UTF-8( t ) )        t 是 241 个码点
t[i]    = (dl[i] + 28) ^ 1
dl[3+j] = (src[j] + 3) ^ PAD[j % 5]           PAD = [50,56,53,49,50] = "28512"
⇒ src[j] = ( ((t[j+3] ^ 1) - 28) ^ PAD[j%5] ) - 3
```

`src` 是 **238 字节记录流**，关键字段：

| 槽 | 语义 | 说明 |
|---|---|---|
| 174 / 209 | `floor(ts/1000)` / `ts%1000` | 时间戳派生，两侧天然不同 |
| 191 | `String(iframe.contentWindow.constructor).replace(/\s/g,'').length` | 原生性自证 |
| 239 / 240 | `getOwnPropertyNames(document).length` / `Object.keys(document).length` | 文档形状 |
| 236 / 238 | `Object.keys(window)` 派生 | 随页面状态漂，勿追 |
| ~118..149 | `md5(canvas.toDataURL())` 的 32 位 hex | 渲染指纹 |

长度公式：`tokenLen = 5 + 4 * ceil((241 + 非ASCII数) / 3)`（实测 441~473 均可能出现）。

---

## 已实现的环境修复（都在 `env_jsdom.js` / `config/browser_env.json` 里，默认开启）

| # | 修复 | 回退开关 |
|---|---|---|
| 1 | 删除 28 个 Firefox 上不存在的全局（`Fence`、`BackgroundFetchManager`…） | — |
| 2 | 补 33 个页面 CSS 自定义属性（`getComputedStyle` 383 → 416 项） | `ZP_CSS_NO_PAGE_VARS=1` |
| 3 | 不插 `CSSStyleDeclaration` 中间原型层（保持 `getPrototypeOf(style)` 直连名字表） | `ZP_CSS_DECLPROTO=1` |
| 4 | `document.all` 活索引（长度活、下标也活；索引 `configurable:false`） | — |
| 5 | 屏幕几何用真值（1920×1080 / inner 1920×927 / screenY 32 / cores 32） | 改 `config/browser_env.json` |
| 6 | canvas 真值（`len=43806`、`md5=667ad57b…`） | 同上（换机器需重采） |
| 7 | `document` 形状（`getOwnPropertyNames`=3、`Object.keys`=3） | `ZP_NO_DOC_SHAPE=1` |
| 8 | iframe **子 realm** 的 `Window` 构造器 toString 返回原生形态（58 → 30 字符） | `ZP_NO_IFRAME_NATIVE=1` |

其它调试开关：`ZP_SCRIPT_TAG=1`（用 `<script>` 标签注入）、`ZP_COOKIES='{"k":"v"}'`（预置 cookie）、`ZP_WINKEY_PAD=<n>`（补 window 键数）。

---

## 版本核验（重要）

这套东西会换版。**每次取到 seed 后顺手核一次 SDK 的 `len` + `sha256`**，与 `config/` 里的归档不一致就重新下载并重跑对照：

```powershell
# 期望：323891 / fb71e45a708d7831…
$b = Invoke-WebRequest -Uri "https://www.zhipin.com/web/passport/zp/security-js/b9a070d3.js" `
       -Headers @{ "User-Agent"="Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:152.0) Gecko/20100101 Firefox/152.0" } -UseBasicParsing
$bytes = $b.RawContentStream.ToArray()
$bytes.Length
(-join ([System.Security.Cryptography.SHA256]::Create().ComputeHash($bytes) | ForEach-Object { $_.ToString("x2") }))
```

注意事项：

- **取 SDK 时不要开着任何在线改写/插桩路由**，否则拿到的字节数与厂商版不同（会误判"换版"），且产物载荷会变；
- 换版后先跑 `gen_token2.js` 看能否出 token，再看长度是否落在 441~473，最后打一次服务端确认；
- 换机器 / 换浏览器版本时，`config/browser_env.json` 里的 canvas 真值与几何要重采。

---

## 已知限制

- 出口 IP 请求过量会进风控（`code 35`），需冷却或用代理（`--proxy`）。
- 分页第 2 页可能返回 `code 0` 但 `jobList` 为空，属分页参数/lid 问题，与 token 无关。
- 槽 236/238 随浏览器页面状态漂移，本地未对齐（不影响受理）。

---

## 参考

完整的逆向过程与结论（技术指纹、载荷公式、逐槽语义、8 个补丁的实测值、7 个坑）已整理进 skill 案例：

`hello-js-reverse-skill/cases/boss-zhipin-zp-stoken-security-js-vmp.md`
