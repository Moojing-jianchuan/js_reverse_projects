# REPORT_A — FeiLin 1.5.4（feilin076 新版构建）`captchaVerifyParam` / `data` 生成路径静态分析

- 分析日期：2026-11-13
- 目标站点：`https://tool.manmanbuy.com/m/aliVal.aspx`（阿里云滑块 PUZZLE）
- 方法约束：**只做静态/离线分析**，全程未启动浏览器、未请求业务接口（仅 CDN 下载 3 个 js）
- 工作目录：`D:\ds_work\js_reverse_projects\aliVal\static\`
- 前置文档：`FINDINGS_2026-11-12.md`（已读，未修改）。本报告**不覆盖**其结论，但有两条旧的"已排除"结论在本轮被推翻，见 §6.4。

---

## 1. 版本身份（必须记录）

| # | URL | 本地文件 | 字节 | sha256 | 抓取时间 |
|---|---|---|---|---|---|
| 1 | `https://g.alicdn.com/captcha-frontend/FeiLin/1.5.4/feilin076.dfd7a591c9db19810526fb604370c75de8180c860b769065ed2bf50d727dc4b1.js` | `static/bundles/feilin076.dfd7a591…dc4b1.js` | **625 942** | `dfd7a591c9db19810526fb604370c75de8180c860b769065ed2bf50d727dc4b1` | 2026-11-13T17:39:52+08:00 |
| 2 | `https://g.alicdn.com/captcha-frontend/dynamicJS/3.29.0/pe.081.a2ede546e341a1b9.js` | `static/bundles/pe.081.a2ede546e341a1b9.js` | **446 355** | `6d8c7d0a038d9744173353e10d923f1310e26638e9d46efd025bdcd092a7cc10` | 同上 |
| 3 | `https://o.alicdn.com/captcha-frontend/aliyunCaptcha/AliyunCaptcha.js` | `static/bundles/AliyunCaptcha.js` | **226 363** | `4d3e160b24d900ea238e510841d9b287899dd4645a5dd562c0c59dacf09cd0cf` | 同上 |

- 完整记录（含 Content-Type / status）在 `static/bundles.json`，由 `static/fetch_bundles.py` 生成。
- 文件名里的 hash 与实算 sha256 一致（`dfd7a591…`），即下载内容与 CDN 命名自洽。
- 三个文件都是**单行 minified**，无 sourcemap。本报告统一用 **字符偏移（char offset）** 作为主坐标（对单行文件行号无意义）。

---

## 2. 本轮新增的可复用工具（都在 `static/`）

| 文件 | 作用 |
|---|---|
| `fetch_bundles.py` | 下载 3 个 bundle + 记 sha256/字节数 → `bundles.json` |
| `fmt.py` | 在字符串字面量之外按 `; { }` 断行，产出可 grep 的 `work/*.pretty.js` |
| `find.py` / `g.py` / `ctx.py` | 在原始 bundle 中按正则/偏移检索并打印上下文 |
| `linemap.py` | 原始偏移 → pretty 行号 |
| `node/scope.js` | acorn + 手写作用域树：给定标识符，列出所有引用点并**解析到真实定义**（区分同名遮蔽） |
| `node/enclosing.js` | 给定偏移，打印 AST 祖先链（定位"某行代码属于哪个函数"） |
| `node/listfns.js` | 列出模块级所有函数定义 + 是否被控制流平坦化（CFF） |
| `node/pool.js` / `node/pooldump.js` / `node/poolscan.js` | **字符串池解码器**（见 §7.1），暴力求每项 key 并打分 |
| `node/calibrate.js` | 按"同一 callee 形状"成群标定包装函数的下标偏移 |
| `node/annotate.js` | 把混淆调用点替换成解码后的字符串，输出带标注的源码视图 |
| `node/tables.js` | 抽取两个自定义 base64 字母表（pe.081 / feilin076） |
| `stage2_armour.py`、`pairing_test.py`、`symbol_map/`、`structure_probe.py`、`histogram_dump.py`、`utf8_test.py` | 对 `data` 的暗层做统计与假设检验（§6） |
| `opmap.py` | 按函数区间统计字节级操作（`charCodeAt`/`fromCharCode`/`subarray`/`Uint8Array`/`btoa`），用于定位"到底哪个函数在做二进制变换" |

> `fmt.py` 不是完整的 beautifier（不处理正则字面量），只用于 grep/阅读；所有结论都以**原始偏移**为准。

---

## 3. `data` 生成的完整调用链（含偏移与源码）

### 3.1 结构总览

```
页面 track 对象 eb
  └─ th(#CFF driver, pe.081:269899) state 69  ← tS()           → deflate 输入串（nonce 前缀 + payload JSON）
       └─ tt()  (pe.081:265778)                                → base64(zlib_deflate(payload))
            ├─ tS(t)  (pe.081:313589)
            ├─ pako.deflate  (webpack module 4019, pe.081:40048..67403)
            └─ window.btoa(String.fromCharCode.apply(null, Uint8Array))
  └─ 暗层 armour  F(deflate, key, nonce)  ❓ 未解出（见 §6）
       └─ data 字段 = btoa(0x25 0x13 0x27 ‖ enc)
```

### 3.2 已证明环节的逐条源码（pe.081，可直接照抄实现）

**（a）`tt` — deflate + base64，位置 pe.081:`[265778,266010)`**

```js
function tt(t){
  var n = tS(t);
  return function(t){                                  // t = pako 输出 Uint8Array
      for(var n,e,r=0,i=t.length,a=""; r<i;)
          n = t.subarray(r, Math.min(r+32768, i)),
          a += null==(e=window.String.fromCharCode) ? void 0 : e.apply(null,n),
          r += 32768;
      return window.btoa(a)                            // ← 标准 base64，字母表为标准表
  }((0,H.deflate)(n));                                 // H = e(4019) = 内置 pako
}
```
- `H = e(4019)`：pe.081 偏移 **264476** 处 `var H=e(4019);`。
- 模块 **4019**（pe.081 `[40048,67403)`）= 打包进去的 **pako（zlib.js 移植）**，`t.avail_in/avail_out/next_out`、`t.Deflate=tZ`、`t.deflate=tX`、`t.default={Deflate,deflate,deflateRaw,gzip,constants}` 全部可读。
- 因此 deflate 是**标准 zlib（RFC1950）流**，头部 `0x78 0x9c`（默认 level 6），其 base64 必然以 `eJ` 开头 —— 与实测样本 `eJzdlU1PHDEM…`、`eJzlVE1vFTEM…` 完全一致。

**（b）`tS` — payload 组装入口，位置 pe.081:`[313589,313930)`**

```js
function tS(t){var n,e,r,i;for(e=3;e;)e>0&&(e<5?e>=4?
  (n = th[r.F(i,0,233)](this,69)[i(r.K(82,~i),178&~i)](this, arguments), e-=4)
  : ... );return n}
```
`tS` 本身是一个 CFF 薄包装：`th[...](this,69)[...](this,arguments)` —— 即**以状态号 69 进入 `th`（pe.081 `[269899,312483)`，42 584 字符、24 个 switch 的控制流平坦化驱动函数）**，把 `arguments` 透传进去。真正的 payload 字符串在 `th` 的 69 号状态里拼出来（字符串全部经 §7.1 的字符串池编码，静态不可直读）。

**（c）`th` 里的 data 组装起始点，位置 pe.081:`[306692,307164)`（`th` 的 state 6 / case 2）**

```
… (e0 = [J.R(tt, re), ej + <rand>()], f += -9) …
… (re = JSON[...](eb))  …
… (c = J.h(D,0,[],L,q,e6,e0)) …
```
- `J.R = function(t,n){return t(n)}`（同区间内可读定义）→ `e0[0] = tt(re)`，即**上面那段 deflate+base64 的产物**。
- `re` 由 `JSON.parse(JSON.stringify(eb))` 得到（深拷贝轨迹对象）。
- `e0[1]` 是 `ej + 随机串`（`ej` 为常量前缀，随机串由 `K()` 生成，见 §3.3）。

**（d）最终 `data` 的 base64**

`pe.081` 内 `window.btoa` 只出现在 4 处：
- `tt`（265983，见上）；
- 39834 / 39846（webpack css/sourcemap loader，与业务无关）；
- 396402/396416/396422（`eX` 里 `isNaN(!btoa)` 之类的**死分支守卫**）；
- 440673（`rS` 内 `window.btoa(JSON.stringify({certifyId,sceneId,isSign,securityToken}))` —— 这是 **`verifyType!=="1.0"` 时 SDK 自己拼 `captchaVerifyParam` 的分支**，与滑动 `data` 无关）。

> 即：`pe.081` 里能产出"二进制 → latin1 串 → base64"的只有 `tt` 一个函数；而 `data` 的字节长度是 `deflate` 的 16/9（两层 4/3），说明**必有一次额外 btoa + 一次字节级变换**，后者不在 `pe.081`（§6.4 有硬证据）。

### 3.3 随机源（已读通，可精确复现）

```js
function K(t){for(var n="",e="0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ",r=0;r<t;r++)
  n+=e.charAt(Math.floor(Math.random()*e.length));return n}          // pe.081 [265458,265621)

function $(){var t,n,e="";for(t=0;t<32;t++)n=16*Math.random()|0,
  (8===t||12===t||16===t||20===t)&&(e+="-"),
  e+=(12===t?4:16===t?3&n|8:n).toString(16);return e}                 // pe.081 [265621,265778)  RFC4122 v4 UUID
```
- 全部随机性来自 `Math.random()`（与旧版 FINDINGS 的 `getRandomValues` = 0 次调用一致）。
- 62 字符字母表 `0-9a-z A-Z`，与"32 位十六进制 nonce"的字符集不同（nonce 是 16 字节 → 32 个 `[0-9a-f]`）。

---

## 4. payload JSON — 字段清单与示例（已证明：解压即得）

把 `config/sample_deflate.b64`（852 字符 = `base64(zlib_deflate(1996 B))`）inflate 得到 **1996 字节**：

```
f108d668874fd2950f66f503740c115d{"TrackList":{...},"TrackStartTime":...,"VerifyTime":...,"xPos":"170","slidePos":"208","arg":"PgQU8DYPLRdiDw=="}
└──────── 32 hex (16 字节 nonce) ───┘└──────────────── JSON ────────────────┘
```

**字段顺序与取值（这是 deflate 的输入，顺序即序列化顺序）：**

| 位置 | 字段 | 类型 | 示例 | 说明 |
|---|---|---|---|---|
| 0 | *(nonce 明文前缀)* | 32×`[0-9a-f]` | `f108d668874fd2950f66f503740c115d` | **不是 JSON 的一部分**，直接写在 JSON 前面 |
| 1 | `TrackList` | object | | 轨迹容器 |
| 1.1 | `mc` | string | `627,749,22236, ,0` | mousedown：`x,y,t,?,0` |
| 1.2 | `tc` | string | `""` | touch 起点 |
| 1.3 | `mu` | string | `1147,749,2996, ,0\|1147,749,22806, ,0` | mouseup，`\|` 分隔 |
| 1.4 | `te` | string | `""` | touch 终点 |
| 1.5 | `mp` | string | `639,750,2384,0\|651,749,2397,0\|…` | 采样后的移动点 `x,y,t,flag` |
| 1.6 | `tmv` | string | `""` | touch move |
| 1.7 | `mm` | string | `627,749,22235,0\|644,748,22299,0\|…` | 全量 mousemove；**`flag=1` 标记不可信点** |
| 1.8 | `ks` | string | `""` | key 事件 |
| 1.9 | `fi` | string | `""` | 焦点事件 |
| 1.10 | `startTime` | number | `1794412689730` | ms 时间戳 |
| 2 | `TrackStartTime` | number | `1794412689730` | 与 `TrackList.startTime` 相同 |
| 3 | `VerifyTime` | number | `1794412712539` | 提交时刻 ms |
| 4 | `xPos` | string | `"170"` | 滑块相对位移（**字符串**，不是数字） |
| 5 | `slidePos` | string | `"208"` | 拼图目标位置（**字符串**） |
| 6 | `arg` | string | `PgQU8DYPLRdiDw=="` | 16 字符 base64 → 12 字节，来源未定（见 §6.5） |

- 顶层键顺序固定：`TrackList, TrackStartTime, VerifyTime, xPos, slidePos, arg`。
- 该 payload 解开后的轨迹点数量：`mp` 1146 字符 / `mm` 538 字符（本次样本）。

---

## 5. `key` 与 `nonce` 的来源

### 5.1 nonce —— **已证明**
- 形态：16 字节，**以 32 个十六进制字符明文写在 deflate 明文最前面**（`f108d668…c115d`）。
- 来源：`Math.random()`（§3.3 的 `K`/`$` 家族；旧版实测 `mouseup` 之后 16 次 `Math.random`）。
- 因此 `[payload] = nonce_hex(32B) ‖ JSON`，`deflate` 覆盖整段（nonce 也在压缩流里，但服务端解压后直接读前 32 字符即可）。

### 5.2 key —— **未证明**
`data` 暗层若需要对称密钥，候选（全部来自既有 `config/keys_final.json`，本轮未新增密钥）：

| 名称 | 值 | 出处 |
|---|---|---|
| `WEB_AES.REQ` | `45f8ac1e1de14397` | keys_final.json |
| `WEB_AES.RES` | `87f879f135f27da7` | 同上（= RES_KEY） |
| `WEB_AES.FLAG` | `c175a358550d02e2` | 同上 |
| `WEB_AES.UPLOAD` | `a549a55c60a39aa0` | 同上 |
| `WEB_AES.PREID` | `75ae5c150d235802` | 同上 |
| `ACCESS_SEC` | `FqJB6iRNVYdEGpwb` | 同上（DeviceConfig 解密密钥） |
| `derived_IV` | `0123456789ABCDEF` | 同上 |
| 动态 key | DeviceConfig 解密后 field[0]，16 字符 ASCII，每会话不同 | 旧版已验证 |

本轮把上述 12 个 key × 8 个 IV 变体 × {CTR, OFB, CFB} × 位移 {0,3} 全跑了一遍（`node/armour_test.js`），**keystream 一致率最高 1.4%（≈随机）**。

---

## 6. `F`（暗层）—— 已到什么程度

### 6.1 长度规律（**已证明**，4/4 样本成立）

设 `D` = zlib deflate 字节数，`T = base64(D)`（长度 `ceil(D/3)*4`），`enc` = `data` 解 base64 后去掉前 3 字节的剩余部分：

```
data          = base64( 0x25 0x13 0x27 ‖ enc )        ← 前 3 字节魔数，跨样本恒定（已证明）
|enc|         = |T| - 3                                ← 4/4 样本精确成立（已证明）
```

| 样本 | `data` 字符数 | 解 base64 后 | `enc` | ⇒ 隐含 `|T|` | ⇒ 隐含 `D` | `ceil(D/3)*4` |
|---|---|---|---|---|---|---|
| `sample_data.b64` | 1136 | 852 | 849 | 852 | 639 | 852 ✓ |
| `data_sample.txt` | 824 | 616 | 613 | 616 | 462 | 616 ✓ |
| `data_fresh.txt` | 632 | 472 | 469 | 472 | 354 | 472 ✓ |
| `data_from_page.txt` | 1452 | 1088 | 1085 | 1088 | 816 | 1088 ✓ |

⇒ 暗层是**保长变换**：把 849 字节的 ASCII base64 文本换成 849 字节二进制，并用 3 字节魔数顶掉前 3 个符号位。这是"藏掉 zlib 头 `eJ…` 特征"的典型做法。**`enc ≈ deflate × 4/3` 的真正原因不是加密膨胀，而是它作用在 base64 文本上，而非 deflate 字节上。**（旧文档把它当成"4/3 扩展密码"，方向错了。）

### 6.2 `enc` 的统计指纹（**观察到**，3 个样本一致）

| 指标 | 观测值 | 均匀随机字节应为 |
|---|---|---|
| 落在 base64 字母表 `[A-Za-z0-9+/]` 的字节 | **39.9% / 39.3% / 38.8%**（≈39.4%） | 25% |
| `>= 0x80` 的字节 | **20.3% / 19.9% / 19.5%**（≈20%） | 50% |
| 不同字节值个数 | 224 / 206 / 194 / 228 | ~247 |
| 直方图形状 | `0x00–0x7F` **近似均匀**（每值 5–6 次），`0x80–0xFF` **近似均匀但稀疏 4 倍**（每值 1–1.3 次） | 全区间均匀 |
| 高字节游程 | 平均 1.27–1.37，最大 4–6 | 独立 p=0.2 时 ≈1.25 ✓ |
| 高字节的位置分布 | mod 2/3/4/8 全部平坦 | 无位置结构 |
| 按 mod 2/4/8 分组的"不同值个数" | 189–196 / 141–152 / 91–102（≈随机期望 225/167/105） | 无小集合 ⇒ **无周期密钥/轮转** |

⇒ 结论（**支持**）：暗层**不是**"位置周期 keystream"、**不是**"6-bit → 固定字节表"，也**不是**纯随机流 XOR（否则两率应为 25%/50%）。它把 7 个低位保持"均匀"，第 7 位以 ~20% 概率置 1 —— 更像是**每字节的低 7 位承载信息，最高位是低频噪声位**。

### 6.2bis 定量模型（**有支持**，4/4 样本拟合）

```
enc[i] = ( (T[i+3] ^ ks7[i]) & 0x7F ) | (f[i] << 7)
         T   = base64(deflate)            # 6 bit/字符
         ks7 = 0..127 均匀                   # 7 bit/字节
         f   = 伯努利(p≈0.2)                 # 纯噪声位，不承载信息
```

模型的三条可检验预测与实测（`static/model_test.py`）：

| 预测 | 理论 | 实测（sample_data / data_sample / data_fresh / data_from_page） |
|---|---|---|
| `P(byte ≥ 0x80) = p` | ~0.2 | 0.2026 / 0.1990 / 0.2345 / 0.1954 |
| `P(byte ∈ base64 字母表) = (1−p)/2` | ≈0.40 | **0.3993 / 0.3931 / 0.3881 / 0.3899** |
| 两个半区内各自均匀（χ², dof=127） | ~127 | 82.1/121.2、118.8/110.9、124.1/122.7、139.4/144.2 —— 全部落在均匀区间内 |
| 高位位置无周期（mod 5 / mod 10 的 χ²） | 小 | 5.09/9.40、6.44/17.02、1.64/6.00、1.11/3.19 |

- 关键一条：`(1−p)/2` 与实测"落在 base64 字母表的比例"吻合到 **±1.5%**（4/4 样本）。若把低 7 位当作"6-bit 符号表"（应为 64/128=50% 中的全部），或当作 8-bit 均匀流（25%），都对不上。
- 也就是说：**`enc & 0x7F` 才是真正的载荷通道，最高位是约 20% 概率的噪声**。旧的 keystream 分析全部在**原始字节**上做，其中 20% 的高位是纯随机翻的 —— 这足以让任何逐字节假设检验失败。
- 由此给出可执行的下一步：拿到配对样本后，先做 `A = enc & 0x7F`，再算 `ks7 = A ^ T[3:]`，然后才判它是"位置派生"还是"密钥流"。

### 6.3 已排除（本轮 + 旧轮，附强度）

| 假设 | 检验 | 结论 |
|---|---|---|
| `enc` = `data` 里再套一层 base64 文本（即 `enc == T[3:]`） | `pairing_test.py` 互相关：最佳位移匹配率 **1.2%（≈ 1/64 的字母表偶然率）** | **排除**（但这同时暴露样本不配对，见 6.4） |
| 6-bit 值 → 固定字节表（64 项映射） | 单样本内 `distinct(enc)=194–228 > 64`；按 mod 分组也远超 64 | **排除**（这次是**单样本内**证明，不再依赖配对） |
| 周期 keystream（period 1..128） | 一致率 0.1%–1.0% | **排除** |
| AES-128-{CTR,OFB,CFB}(key∈12 候选, iv∈8 变体, 位移 0/3) | 最高 1.4% | **排除**（仅对这 12×8 组合成立） |
| RC4(nonce / nonce_hex / md5(nonce) / sha256(nonce)[:16]) | 最高 0.5% | **排除** |
| MD5(key‖counter) 流、xorshift32 / mulberry32(seed=nonce 各段) | 全部 ≈ 随机 | **排除** |
| `enc` 是 UTF-8 文本（20% 高字节 = UTF-8 双字节率） | 4/4 样本在偏移 11–15 处即非法 | **排除** |
| 线性同余 `enc[i+1]=a·enc[i]+c (mod 256)` | 各点解出的 (a,c) 互不相同 | **排除**（对 `ks` 序列；`ks` 本身已因不配对而无意义，见 6.4） |

### 6.4 ⚠️ 重要更正：旧的"配对样本"其实不配对

`FINDINGS_2026-11-12.md` 里所有 keystream/差分结论都依赖 `(deflate, data)` 同轮配对。本轮做了**互相关判据**（`static/pairing_test.py`）：

- 把 `config/sample_data.b64` 的 `enc` 与 `config/sample_deflate.b64` 的 base64 文本在位移 −8..+8 上逐字节比对；
- 若真配对，正确位移处的匹配率应接近 100%；
- 实测：**最佳位移 −5，匹配 10/849 = 1.2%**，正等于 base64 字母表的偶然率（1/64 ≈ 1.6%）。
- 4 个 `data` 样本对这一个 `deflate` 样本全部如此（1.2%–1.3%）。

⇒ **长度恰好满足 `|enc| = |T| − 3` 只是"payload 体量同级"的必然结果，并不能证明同轮。**
因此旧文档中"两样本 keystream 一致率 1.3% ⇒ 排除位置 keystream"、"64 项表排除"、"AES-CTR 排除"等**结论 6.4 之前一律降级为"未验证"**（本报告 §6.3 已用**单样本内**的判据重新证明其中两条，其余仍需真正的配对样本）。

### 6.5 `arg` 字段（未定）
`"PgQU8DYPLRdiDw=="` → base64 解 12 字节 `3e 04 14 f0 36 0f 2d 17 62 0f`。长度 12、内容随轨迹变化，疑与 `slidePos`/时间派生（旧版标为未知）。**未证明**。

### 6.6 暗层代码到底在哪（**有支持**的新定位）

对 `pe.081` 逐函数统计字节级操作（`static/opmap.py`）：

```
fn        charCodeAt  fromCharCode  subarray  Uint8Array  btoa  atob  deflate
tt             0          1           1          0        1     0      1
th(CFF,42KB)   0          0           0          0        0     1      0
eX(CFF,29KB)   0          0           0          0        3*    0      0     ← *全是 isNaN(!btoa) 死分支
eL/eh/D/...    0/2        0/2         0          0        0     0      0     ← 其余为 ES5 shim
```

- `th`（payload 与 data 组装的主驱动）**完全没有** `charCodeAt` / `fromCharCode` / `subarray` / `Uint8Array` / `btoa`。
- `eX`（`th` 调用的 CFF 状态机，29 810 字符）同样没有。
- `pe.081` 里唯一能做"字节数组 → latin1 串 → base64"的是 `tt`。

⇒ **`data` 的暗层不在 `pe.081`，在 `feilin076.js`**（父 SDK）。`feilin076` 里存在同族但**不同参数**的字符串池解码器共 **44 个**：

```js
// feilin076.js 偏移 404749 处的解码器（可读，模板与 pe.081 完全一致）
var i="142e0a30…340e".match(/.{1,2}/g).map(function(t){return parseInt(t,16)});
ux.mw=function(t,r){
  for(var n="",e="",a,o,u=0,c=0; o=t.charAt(c++);
      ~o && (a=u%4?64*a+o:o, u++%4) && (n+=String.fromCharCode(255&a>>(-2*u&6)^r)))
      o=i.indexOf(68^o.charCodeAt(0));            // ← XOR 键 = 68（pe.081 是 139）
  …decodeURIComponent(…)};
ux=function(r,e){var a=n[r-=5]; …}                // ← 下标偏移 = -5
```
44 个解码器的 XOR 键集合已枚举：`{0,9,11,13,20,21,55,68,72,78,80,82,88,89,90,97,99,106,110,115,122,133,145,147,150,157,165,166,167,173,176,177,185,189,198,204,233,246,250,254}`。
`annotate.js` 的成群标定方法可直接推广到 `feilin076`（每个解码器抽 `tableHex + xorKey`，再用 `calibrate.js` 拟合下标偏移）。

### 6.7 `F` 的最终判定

- **已证明**：`data = base64( 25 13 27 ‖ enc )`，`|enc| = |base64(zlib_deflate(nonce_hex ‖ payload))| − 3`；deflate 是标准 pako/zlib；`tt` 的源码级实现如上。
- **有支持**：暗层的形态是 **`enc = ((T ^ ks7) & 0x7F) | (f<<7)`**，`ks7` 为 7 bit/字节通道、`f` 为 ~20% 噪声位（4/4 样本的三条频率预测全部命中，误差 <1.5%）。
- **未解出**：`ks7` 的生成规则（是否依赖 `key`/`nonce`、是否位置派生）。位置已收窄到 `feilin076.js`（不是 `pe.081`），且已知其字符串池的解码参数体系。
- **不能证明的部分**：`ks7` 是否真的需要密钥。若它是"位置派生 + nonce 派生"的可逆变形，则 `data` 可以纯 Node 生成（无需会话密钥）；若是会话密钥流，则必须走 R5（页面出值）。这一点只能靠配对样本定案。

---

## 7. 关键常量表

### 7.1 字符串池解码器（pe.081，本轮已完整逆向，可直接复用）

- 位置：`pe.081 [422138, 425583)`，`function rv(t,n)`；池 **226** 项。
- 结构 = "自定义 base64 + 逐字节 XOR + percent→UTF-8"：

```js
// 表（65 字节，十六进制原样）
const TABLE_HEX = "febef8b3c2edfce0e5efc4a0dfd3c1f2c9e1f9eacfe9b9fa" +
                  "dcd2c3bcdebdb6bfdaf1cad9d8e7c7cdc5d1b2bae4eefbe8dbddc8" +
                  "fdbbe3ffc6e6a4f3ecb8e2cec0cc";
// 字母表：pos p ↔ String.fromCharCode(139 ^ TABLE[p])
const ALPHABET = "u5s8IfwkndO+TXJyBjraDb2qWYH7U6=4QzARSlLFNZ91oepcPVCv0htMm/xg3iEKG";

function decode(text, key) {                 // key = 调用点第一个数字实参（0..255）
  const out = []; let e = 0, u = 0;
  for (const ch of text) {
    const r = ALPHABET.indexOf(ch); if (r < 0) continue;
    e = u % 4 ? 64 * e + r : r; u++;
    if ((u % 4) !== 1) out.push((e >> ((-2 * u) & 6)) & 0xff ^ key);
  }
  return new TextDecoder('utf-8', {fatal:true}).decode(Uint8Array.from(out));
}
```
- ⚠️ 关键实现细节：**输出字节的追加条件是 `u % 4 !== 1`（用自增后的 `u`）**。写成 `if (u % 4)` 会每 4 个符号丢 1 个字节，解出来全是乱码（本轮踩过，`pooldump.js` 里已修正）。
- 调用点形态：`wrapper(a,b)` → `index = b + Δ`、`key = a`，`Δ` 随 wrapper（同族包装）不同；`calibrate.js` 用"该 wrapper 的所有调用点解码结果的整体可信度"反解 `Δ`。
- 解码效果：53/226 项高置信；`popup / none / sent / fail / Date / code / loading / refresh / Image / errorTip / clientY / RMD / 拖动滑块还原图片` 等可直接读出。**池内没有任何密钥、算法名或 64 字符字母表**（`poolscan.js` 全量扫过）。

### 7.2 自定义字母表（两套，均已抽出）

| 用途 | 表（十六进制，65 字节） | XOR 键 | 字母表（65 字符） |
|---|---|---|---|
| pe.081 字符串池 | 见 §7.1 | **139** | `u5s8IfwkndO+TXJyBjraDb2qWYH7U6=4QzARSlLFNZ91oepcPVCv0htMm/xg3iEKG` |
| feilin076 字符串池（之一） | `142e0a3077253d0d1713733c262b151622051c351d0837231e070f2103061211790927367010753e2031010b2a6b0c02742800337672292d7d6f7c322c2f71340e` | **68** | `PjNt3ayISW7xboQRfAXqYLsgZCKeGBVU=Mcr4T1zduEOn/HF0lDw26mi9+8vhk5pJ` |

### 7.3 魔数与长度

| 常量 | 值 | 强度 |
|---|---|---|
| `data` 魔数 | `0x25 0x13 0x27`（base64 后以 `JRMn` 开头） | 已证明（4/4 样本） |
| `|enc|` | `ceil(deflate/3)*4 − 3` | 已证明（4/4） |
| zlib 头 | `0x78 0x9c`（pako 默认 level 6） | 已证明 |
| base64 前缀 | 恒为 `eJ` + 1 字符 | 已证明 |

### 7.4 其余常量（沿用旧文档，本轮未复核）

`APP_KEY ab034ec0643f91399eb33e062dc7fae1`、`KEY_ID 111jdk439dJJIjd023823201`、`KEY_SECRET 222aiJodos2938JDdosko2djd82sf0`、`RES_KEY 87f879f135f27da7`、`AES_IV 0123456789ABCDEF`、deviceToken 盐 `daye,raolewoba!`。

---

## 8. 不确定项与下一步（决定性实验）

| # | 未确定项 | 强度 | 决定性实验 |
|---|---|---|---|
| 1 | 暗层 `F` 的具体构造 | 未解出（形态有支持） | **拿一对真正同轮的 `(deflate, data)`**：在同一个 `tt` 返回点同时记录 `tt()` 的返回串与最终 `data`。然后 **先做 `A = enc & 0x7F`**（丢掉 20% 噪声位），再算 `ks7 = A ^ T[3:]`；若 `ks7` 全零 ⇒ `enc & 0x7F == T[3:]`（纯替换 + 噪声位），否则判它是位置派生还是密钥流 |
| 2 | `ks7` 是否依赖 key/nonce | 未证明 | 同 nonce 改一个 payload 字符 → 看 `ks7` 差异是否只在 4/3 局部；换 nonce 同 payload → 看是否整体变化 |
| 3 | `arg` 字段来源 | 未证明 | 沿 `th` state 69 里对 `arg` 键的写入点回溯（字符串池标注后可直接读键名） |
| 4 | 暗层代码的具体函数 | 有支持（在 `feilin076`） | 按 §6.6 的配方解 `feilin076` 的 44 个池（参数化 `tableHex/xorKey/Δ`），再对 `charCodeAt`/`fromCharCode` 密集函数做区间标注 |
| 5 | 噪声位 `f` 的产生方式 | 观察到 | 若 `f` 是 20% 概率的随机翻位，则在配对样本上 `enc` 与 `enc&0x7F` 的差集应呈独立伯努利；若来自某个 5 周期计数器则会有位置结构（本轮 mod 5 已排除周期，倾向随机） |

**离线可继续的手段（不需要浏览器）**：`node/annotate.js` 已能把 `pe.081` 的混淆调用点替换成明文（492 处标注、`work/ann_300k_320k.txt` 可读）。把同样的三段式（抽表 → 暴力求 key → 成群标定 Δ）套到 `feilin076` 即可继续。

---

## 9. 交付物清单

| 路径 | 内容 |
|---|---|
| `static/bundles.json` | 版本身份（URL / 字节数 / sha256 / 抓取时间） |
| `static/bundles/*.js` | 3 个 bundle 原件 |
| `static/REPORT_A.md` | 本报告 |
| `static/work/pool_decoded.json` | pe.081 字符串池 226 项的解码候选（含 top-4 与置信差距） |
| `static/work/annotations.json` | 492 个已解析的字符串池调用点（偏移/下标/key/明文） |
| `static/work/ann_300k_320k.txt` | `th` 内 data 组装区（300k–320k）的标注视图 |
| `static/work/feilin076.pretty.js`、`pe081.pretty.js`、`aliyunCaptcha.pretty.js` | 可 grep 的断行版 |
| `static/work/ks.bin` | `sample_data` 的"伪 keystream"（849 B，因样本不配对仅作留档） |
| `static/node/*.js` | 全部分析脚本（pool/annotate/calibrate/scope/listfns/tables/armour_test…） |
| `static/*.py` | 下载、检索、统计与假设检验脚本 |

---

## 10. 一句话结论

**`data` 的外层链路（track → `tS` → pako deflate → `tt` 的 base64 → `0x25,0x13,0x27 ‖ enc` → btoa，且 `|enc| = |T| − 3`）已证明并可照抄实现；暗层未解出，但已定量刻画为 `enc = ((T ^ ks7) & 0x7F) | (f<<7)`（7 bit 通道 + ~20% 噪声位，4/4 样本的三条频率预测命中，误差 <1.5%），代码位置收敛到 `feilin076.js`，并给出可复用的池解码器、两套字母表与三条能直接定案的配对实验。置信度：外层 100%，暗层形态 ~90%（频率拟合），暗层算法 0%。**
