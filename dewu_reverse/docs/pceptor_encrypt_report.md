# pceptor 信封加密报告：`feeds/info` 的 `{data}` 怎么来（Node 本地、无浏览器、无网络）

> 目标：`https://app.dewu.com/api/v1/h5/commodity-pick-interfaces/pc/pick-rule-result/feeds/info`
> 目标产物：`{"data":"<md5(明文)><mojibake-base64(密文)>"}`
> 本文所有结论都在 `D:\ds_work\js_reverse_projects\dewu_reverse` 内可复现，命令见 §7。
> 交付实现：`src/pceptor_encrypt.js`（`buildInfoEnvelope` / `sdkEnvelope` / `calibrate`）。

---

## 0. 一页结论

| 问题 | 结论 | 强度 |
|---|---|---|
| 信封能不能本地造出来 | **能**。`buildInfoEnvelope(plain)` → `data`，纯算法 **0–3 ms**，与 SDK 直出**逐字一致** | 证明 |
| 要不要打通 pceptor 的 XHR 拦截器 | **不要**。信封由 `window.fun.Fun110(payload,'post','',false,{SK,…})` 直接产出，2 ms | 证明 |
| 拦截器到底卡在哪 | SDK 请求管线 `await` 注入的 `preinforce2` 模块 + 等 `/cost` 的响应形状；离线假响应喂不出它要的形态 | 证据链（§1） |
| `/interceptor` 响应是 URL 白名单吗 | **不是**。596 B 是一组灰开关（`gray558h5Detection` / `gray558h5MiniSk` / `gray559webSkCookie` / `isAnti` …），不含 `MD5(pathname)` 白名单 | 证明 |
| 密文/明文长度 | 本机 **等长**（124/124）。抓包的 125 B 差异来自对端 UA 分支，不是算法里的长度前缀 | 本机=证明，抓包差异=观测 |
| keystream 来源 | `F(sk, navigator.userAgent 括号段)`，与明文、与 shumeiid 无关；同 `(sk,UA)` 下确定可复现 | 证明 |
| 与 captcha 的 `d` 同一张表吗 | **不是**。编码层相同（XOR + mojibake-base64），密钥派生不同 | 证明（换表实测）+ 观测（父会话 0~0.8%） |

---

## 1. 拦截器：为什么你那套"喂了 interceptor 还是不拦"

### 1.1 直接原因：只加载了 `pceptor.js`，没加载 `preinforce2.js`

pceptor 把加密模块当外链脚本注入（报告 `docs/pceptor_report.md` §1 已定位：`@40917` 建 Promise、`@41070` 设 `script.src`、`onload` 判 `window.fun.Fun110`）。业务请求的装配链里 `await 108099`（= 那个模块）之后才 `setRequestHeader/send`。

所以只灌 `pceptor.js` 时：`window.fun === undefined` → 这个 `await` 永不 settle → **原生 `send` 一次都不会被调用**，你 hook 到的 `captured 0` 就是这么来的，不是"拦截器没启用"。

复现（`scripts/c_interceptor_live.js`，先 hook 原生 XHR 再加载 SDK）：

```text
node scripts/c_interceptor_live.js pceptor-only
  [load] pceptor.js OK
  window.fun? false | _yundunxhr? function | XMLHttpRequest 已被替换? true
  === 交给原生 XHR 的调用 1 条 ===
  - POST https://dav.dewu.com/interceptor      ← 只有 SDK 自己的配置请求
  （业务请求 0 条）
```

### 1.2 两件套齐全后：拦截器确实生效了，但卡在 `/cost`

```text
node scripts/c_interceptor_live.js
  [load] pceptor.js OK
  [load] preinforce2.js OK
  window.fun? true | _yundunxhr? function | XMLHttpRequest 已被替换? true
  === 交给原生 XHR 的调用 2 条 ===
  - POST https://dav.dewu.com/interceptor   headers: Content-Type,Accept,bcn,dsn,sk,shumeiid,ltk,sessionid,hsn,adi,skt
  - post https://dav.dewu.com/cost           headers: bcn,src,Content-Type,sk,shumeiid,ltk,sessionid,hsn,adi,skt
```

判读：
- 业务请求**没有**出现在原生 `send` 上 → 它被 pceptor 的包装 XHR 吃掉了（**拦截器已激活**，不是没生效）；
- 7 个附加头（`sk/shumeiid/ltk/sessionid/hsn/adi/skt`）全部算出来了 → 装配链走到了 body 处理阶段；
- 之后 SDK 只发 `/cost`；离线的假响应（`{"code":200,"msg":"{}"}`）给不出它要的形态，于是最终 `send` 不落地。

### 1.3 `/interceptor` 的响应不是白名单

`artifacts/interceptor_resp.json`（596 B，真实抓取）解码后：

```json
{"code":200,"msg":"{\"hl564\":\"yes\",\"wg2568\":\"yes\",\"kg566\":\"yes\",\"k575dl\":\"yes\",\"isAnti\":0,\"isRe\":\"0\",\"h587i\":\"yes\",\"dr564\":\"yes\",\"gray559hm\":\"yes\",\"h592\":\"yes\",\"k575tm\":\"yes\",\"gray559tzjc\":\"yes\",\"kg570\":\"yes\",\"isMiniCookieH5\":\"no\",\"k575td\":\"yes\",\"gray558h5MiniSk\":\"yes\",\"antiUrl\":\"\",\"gu568\":\"yes\",\"gh564\":\"yes\",\"gray558h5CookieDomainsk\":\"yes\",\"cs564\":\"yes\",\"k575tc\":\"yes\",\"gray558h5Detection\":\"yes\",\"h586g\":\"yes\",\"isDomainH5\":\"no\",\"gl564\":\"no\",\"ft564\":\"yes\",\"gray559webSkCookie\":\"yes\"}"}
```

全部是**布尔灰开关**，没有 `MD5(pathname).toUpperCase()` 白名单数组，也没有难度/盐。所以"喂 interceptor 就能进加密分支"这个假设不成立：加密开关不在这份配置里（`docs/pceptor_report.md` §4.2 里那个"运行时白名单 `231943`"至少在 PC 端这条链路上不是由它下发的）。

### 1.4 关键发现：加密分支**不需要**拦截器

`window.fun.Fun110` 是纯函数式入口，五个参数就能直接进加密分支：

```js
fun.Fun110(明文, 'post', '', false, {SK, Sk, sk, ShumeiId, shumeiId, shumeiid})
→ {a,b,c,d,e}
   c === '1,hdw4'   → 成功分支，d = '{"data":"<hex32><b64>"}'
   c === '5294,hdw4'（或其它） → 明文回退，d === 明文原样
```

在本机 jsdom 下这条调用**2 ms 返回**，`data` 与线上抓包同形（同 UA 分支下逐字一致）。因此本任务的 A/B 两条路线可以完全绕开拦截器。

> ⚠️ 一个必须记住的坑：**Node `vm` 沙箱（`src/env.js`）跑不了这个加密分支**。`Fun110` 五参在 vm 里会自旋不返回——根因定位到 `preinforce2` 自带 CryptoJS 的 `_doFinalize`：它把 `this._data` 这个 WordArray 的 `words.length` 弄成 `508512340`、`sigBytes` 弄成 `3.6e10`，随后 `BufferedBlockAlgorithm._process` 要做 5.6e8 轮 `_doProcessBlock`，等于挂死。证据脚本：`scripts/a_spin_trace.js`（给 245 个扁平化状态机循环装步数计数器 → 命中 `_process` 的 4 态循环）、`scripts/a_wa_probe.js`（`Latin1.parse`/`concat`/`_doFinalize` 打点，入参全正常）。**同一份 `preinforce2.js` 在 jsdom realm 里毫秒级返回**，所以环境选择很关键。

---

## 2. 「明文 → 信封」算法

```text
hex32  = md5(明文 JSON 字符串)                       // 32 位小写 hex
cipher = XOR(明文字节, KS[0 .. len))                 // 等长，逐字节
data   = hex32 + mojibakeBase64(cipher)
```

`mojibakeBase64`（线上那些 `w6bDlcK3F37D…` 的由来）：

```js
// 编码：每个密文字节当一个 0..255 的“字符”，再按 UTF-8 编码，最后 base64
b64 = Buffer.from(Buffer.from(cipher).toString('latin1'), 'utf8').toString('base64');
// 解码（必须这一层，否则长度和内容都会被 UTF-8 破坏）
raw = Buffer.from(b64, 'base64'); s = raw.toString('utf8');
cipher[i] = s.charCodeAt(i) & 0xff;
```

明文字段顺序敏感（`sign` 在最前）：

```json
{"sign":"f2b6b4c666227d52fdadf251f307445d","pickRuleId":644479,"pageNum":1,"pageSize":24,"filterUnbid":true,"showCspu":true}
```

`sign = md5( 键名排序拼接 key+value + "048a9c4943398714b356a696503d2d36" )`，已对拍（本机 `infoPlain()` 生成的明文与抓包明文逐字一致）。

### 2.1 那多出来的 1 字节

三条独立证据：

| 实验 | 结果 | 说明 |
|---|---|---|
| 本机 SDK 直出（默认环境） | `cipherLen 124 / plainLen 124`，`data.len 280` | 算法本身**等长**，`data` 里没有额外字节 |
| 把 Fun110 依赖的窗口属性逐个置 falsy（`outerWidth=0` / `screen.width=0` / `innerHeight=0` / `navigator.languages=[]` / 两个一起） | 5 种变异 `data.len` 全是 280、密文全 124、XOR 结果与 baseline 124/124 一致 | 源码里那串 `L/W/H/U` 缺值标记在 PC 端这条路上**不参与长度** |
| 线上抓包样本对表 | 按 `shift0`（明文不加前缀）**前 29 字节全中**；按 `shift1`（前置 1 字符）**0 命中** | 抓包那份密文**前部没有前缀**，多出的字节只能在**尾部一侧** |

结论：
- **`{data}` 的结构里没有"长度前缀/版本字节"**（证明，本机可复现等长）；
- 抓包那份 `125 B` 是**对端那一次加密的输入比明文多 1 字节**（落在末尾），而且对端 KS 与本机表只有前 29 字节一致 → 对端走的是**另一条 UA 分支**，所以这 1 字节的具体值**无法用本机表反推**（观测，不是证明）。

> 换句话说：129→125 的差异不是"多了一个结构字节"，而是"环境分支不同 + 输入多一字节"两件事叠在一起。要钉死它，需要真机 UA 的 KS（一次标定即可，见 §7）和真机侧对 `Fun110` 入参的 hook。

---

## 3. keystream（KS）的派生来源

从 `artifacts/unpacked/preinforce2.readable.js` 反混淆读出的加密闭包（`@59xxx`；常量池 `33319[]` 已还原）：

```js
// 闭包：Fun110 → (payload, keyMap)
uaParen = /\(([^)]+)\)/.exec(navigator.userAgent)[1];        // 例: "Windows NT 10.0; Win64; x64; rv:152.0"
key     = MD5( /duapp/.test(UA) ? D : (keyMap.SK || keyMap.shumeiId || uaParen) ).toString();
seed    = "3697" + MD5(uaParen).toString().split('').map(c => c.charCodeAt()).join('');  // 数字串
mid     = base64js.fromByteArray( utf8( XOR(payload, key) ) );   // 中间量（Vigenère-XOR + 编码）
out     = RC4like(payload, mid, seed, seed);                     // 256 字节 S 盒 + i/j 交换；
                                                                 // seed%5 / seed%64 作扰动
return MD5(payload) + out;                                       // 就是 hex32 + 密文
```

要点（都能和实测对上）：

- `keyMap.SK || keyMap.shumeiId || uaParen` —— **SK 非空时 shumeiid 根本不参与** ⇒ 换 `shumeiid` 不换表。
- `seed` 只来自 `uaParen` ⇒ **换 UA 整张表重算**。
- 最终密文与明文**等长**，逐字节 XOR 语义 ⇒ `KS` 可以离线标定成一张表。

### 3.1 实测矩阵（`scripts/b_ks_extract.js`）

| 实验 | 结果 |
|---|---|
| 两条差异极大的明文（124 B 与 2181 B）反推 KS | **2181/2181 全等** → KS 与明文内容、长度无关 |
| 124 B 样本反推的 KS 与长表对照 | **124/124** |
| 换 `shumeiid` 重标 | **124/124 不变** → 与 shumeiid 无关 |
| 换 UA（Chrome 131）重标 | **0/124** → 整张换表 |
| 同进程内新开一个 env 重标 | `data` 逐字一致 → 确定性 |
| 表长 | 标定到 2181 B（`artifacts/b_ks.bin`，sha256 见 `artifacts/b_ks_meta.json`） |

⇒ `KS = F(sk, uaParen)`，是一张**会话/环境级常量流**，不是一次性随机流。换 sk 或换 UA 必须重标（`calibrate()` 一次 ≈ 1.5 s）。

---

## 4. 与 captcha 的 `d` 的异同

| 项 | `feeds/info` 的 `{data}` | captcha 的 `d` |
|---|---|---|
| 明文 | info JSON（`sign` 在最前） | `{bcv,type,c,webp,data}` 五键对象 |
| 长度 | 等长（本机 124/124） | 等长（父会话实测 1301/1301） |
| 前缀 | `hex32 = md5(明文)` | 无 |
| 编码层 | `XOR` + mojibake-base64 | **同一套**（`buildD/decryptD` 里一样的 latin1↔utf8 双层） |
| 校验字段 | 无独立 `sign`（`hex32` 即校验） | `sign = md5("d"+d+SALT)`，与 info 的 `sign` 同一个 `f()` |
| 密钥派生 | `MD5(SK)` + `seed(md5(uaParen))` → RC4 变体 | 另有一套（`src/preinforce_loader.js` 用 SDK 标定出的 `artifacts/keystream.bin`） |
| 同一张表？ | — | **不是**（父会话对 captcha 的 `ks` 与本机 info 表 0~0.8% 命中，符合"两套派生"） |

一句话：**编码层共用、密钥派生各一套**。这也解释了为什么用 captcha 的 keystream 去解 info 的 `{data}` 一定是乱码（不是标定错，是表不对）。

---

## 5. 哪些是「证明」，哪些是「观测」

**证明（可复现、有对拍）**
1. `hex32 === md5(明文)` —— 本机 SDK 直出与纯算法都成立，抓包也成立。
2. `cipher === XOR(明文, KS)` 且**等长**、可逆 —— 本机 3 组明文错一字节即失败，`decryptData` 还原原文。
3. `KS` 与明文内容/长度无关 —— 124 B / 2181 B 两条明文整表 2181/2181。
4. `KS` 与 `shumeiid` 无关、与 UA 强相关 —— 124/124 vs 0/124。
5. 同一 `(sk, UA)` 下确定性 —— 跨 env 实例 `data` 逐字一致。
6. `Fun110(payload,'post','',false,{SK,…})` 五参即得信封，`c='1,hdw4'` 是成功标记 —— 2 ms 返回、与纯算法逐字一致。
7. `/interceptor` 响应是灰开关集合，不含 URL 白名单 —— 响应体逐字可读。
8. 拦截器在"两件套齐全"后确实生效（业务请求不再出现在原生 `send`）—— 但**离线跑不完**整条链。

**观测（不能当结论用）**
1. 抓包样本 `125 B` 的**第 125 字节是什么** —— 对端 KS 与本机只在头 29 字节一致，尾部无从反推。
2. 抓包对端的 **UA 分支**具体是哪一支（Chrome/哪个版本/Firefox 哪个版本）。
3. `/cost` 的响应到底长什么样、SDK 等它做什么（离线只看到它发、没看到它收）。
4. `Fun99(respText,'',key,'')` 的响应解密行为（本会话没做）。
5. `c='1,hdw4'` 里 `1` 的语义（成本/算法标识，未逆到底）。

---

## 6. 交付物清单

| 文件 | 作用 |
|---|---|
| `src/pceptor_encrypt.js` | `buildInfoEnvelope(plain)` → `{data, hex, b64, cipher, ks, ms, debug}`；`sdkEnvelope(plain)` → 厂商直出；`calibrate()` → 重标 KS；`decryptData(data)` → 反解 | 
| `artifacts/b_ks.bin` / `b_ks_meta.json` | 当前 `(sk,UA)` 的 KS 表 + 元数据（sha256、UA、标定样本） |
| `artifacts/envelope_pairs.json` | 4 组对拍：3 组本机（明文/密文/hex/sign/SDK↔纯算法一致性）+ 1 组线上抓包 |
| `scripts/b_envelope_probe.js` | 多明文 + 偏移扫描（证明 off=0 且表稳定） |
| `scripts/b_ks_extract.js` | KS 标定与决定因素矩阵（明文/长度/shumeiid/UA/确定性） |
| `scripts/b_prefix_probe2.js` | 抓包样本 shift0/shift1 对齐判定（破"多 1 字节"） |
| `scripts/b_marker_probe.js` | falsy 属性变异实验（证明标记串不参与长度） |
| `scripts/c_interceptor_live.js` | 拦截器现场复现（pceptor-only vs 两件套） |
| `scripts/a_spin_trace.js` / `a_wa_probe.js` | vm 沙箱里 CryptoJS 自旋的定位证据 |

---

## 7. 复现命令

```powershell
cd D:\ds_work\js_reverse_projects\dewu_reverse

# 1) 自检（sign 规则 / 等长 / 可逆 / 纯算法==SDK / 两条明文同表）
node src/pceptor_encrypt.js --selftest
#   → [self-test] 8/8

# 2) 造一条 info 信封（毫秒级）
node src/pceptor_encrypt.js --info 644479 1 24

# 3) 重标 KS（换 sk 或换 UA 后必须做）
node src/pceptor_encrypt.js --calibrate 2048
#   或指定 UA/会话：
#   node -e "require('./src/pceptor_encrypt').calibrate({sk:'<sk>',shumeiid:'<dwsm>',ua:'<UA>',force:true})"

# 4) 证据链
node scripts/b_envelope_probe.js      # 多明文 + 偏移扫描
node scripts/b_ks_extract.js          # KS 决定因素矩阵
node scripts/b_prefix_probe2.js       # 抓包对齐判定
node scripts/c_interceptor_live.js    # 拦截器现场（加 pceptor-only 参数看反例）
```

---

## 8. 还差什么（按价值排序）

1. **真机 UA 的 KS**：当前表是 `sk=9UDgC7wf…` + Firefox 152 分支。要发真请求，只要把真机 UA 传进 `calibrate()` 重标一次（1.5 s），`data` 就会落到对端那一支。
2. **多出来那 1 字节的成因**：需要真机 UA 的表 + 真机侧 hook `Fun110` 入参；本机证明它不是结构字节。
3. **`/cost` 的响应契约**：想打通"拦截器自动加密"（而不是直接调 `Fun110`）就必须有它，否则管线停在 `send` 之前。
4. **请求头链路**：`hsn/adi/ltk/sk` 已由 `src/pceptor_loader.js` 的 vm 环境算得（18/18 自检通过），可与本模块拼成完整请求；但注意 vm 环境**不能**用来出信封（见 §1.4）。
5. **响应侧 `Fun99`**：`d` 解回来之后业务 JSON 的解密/解压，未做。
