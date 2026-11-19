# 腾讯 EO / 天御验证码 armor（ENC_C1）逆向结论

分析对象（本仓库 `scripts/`）：

| 文件 | 字符数 | SHA-256 |
|---|---|---|
| `widget-ele.js`（页面侧 widget，`/static/widget-ele.6403758d.js`） | 278 751 | `E2403AE1DAD9FD12693C2844AB46DD71C0A4C7CAFD6250CF10333323F0DB7CAB` |
| `eo-frame.js`（iframe 侧，`/static/tcaptcha-widget-eo-frame.8cc727d7.js`） | 269 089 | `D10DE84C402AD515D5425C6FC738DAB1E58F323EF8A2224B7B3CA136D541C832` |

样本（本仓库 `samples/harvest/`，源自 `samples/capture1.json` / `capture2.json`，Camoufox 抓包导出）：
`prehandle_c1/c2`（cap_union_prehandle 响应）、`verify_c1/c2`（cap_union_new_verify 请求+响应）。

所有偏移均指该文件的**字符**偏移（单行 bundle，用 `str.indexOf` 可复现）。

---

## 0. 结论速览

| 问题 | 结论 |
|---|---|
| armor 是什么 | 两层：**会话层**（iframe 内 X25519 握手 + HKDF，密钥 `S` 下发）+ **请求层**（`SEAL` 用 `S` 做 ChaCha20-Poly1305，把 verify 的敏感字段塞进新字段 `payload`） |
| armor 在你抓到的这次请求里启用了吗 | **没有**。握手确实发起了（URL 里有 `ec_pub=`/`enc_ok=c1`/`kid=1`），但 prehandle 响应 `data` 里**没有 `blob`**，于是 `applyPrehandleArmor` 直接透传 → `e.armor` 为 `undefined` → `bindArmor(undefined)` 返回 `null` → `this.armor === null` → verify 走明文分支 |
| `collect`/`eks` 会被 armor 加密吗 | **不会**。`applyVerifyArmor` 只删 `ans/pow_answer/pow_calc_time` 并追加 `payload`；`collect`(=TDC.getData)、`tlg`、`eks`(=TDC.getInfo().info)、`sess`、`deviceID` 原样保留 |
| 密钥从哪来 | **不是** `ENC_C1` 常量、**不是** `sess`、**不是** getsig。会话密钥 = `HKDF-SHA256(X25519(客户端临时私钥, 硬编码服务端公钥), salt=0³², info="hundun2|c1", 32B)`；verify 载荷的 AEAD 密钥 `S` 由服务端在 `data.blob` 密文里下发 |
| 算法 | ChaCha20-Poly1305（RFC 8439，**AAD 为空**），线格式 `base64(nonce[12] ‖ ct ‖ tag[16])` |
| `__TencentCaptchaArmorInner__` 的真实来源 | `widget-ele.js` 自己的 **JSVMP 打包模块** `[118599, 157282]` 在加载时挂到 `globalThis`；不是 `cap_union_new_getsig` 下发的 JS，也没有任何 `eval`/`new Function` 注入 |
| 可离线复现吗 | 可以。`scripts/armor_probe.mjs` 已跑通「握手 → 解密 blob → bindArmor → 封装 verify 载荷 → Node 侧解开校验」全链路 |

---

## 1. `__TencentCaptchaArmorInner__` / `__TencentCaptchaArmorFrame__` 的真实定义与注入来源

### 1.1 全量检索结果

对 `widget-ele.js` / `eo-frame.js` / `TEOCaptchaWidget.js` / `dy-jy.js` / `loader.js` / `tdc.js` 全文检索：

* `captcha_armor`：**0 次**（不存在这种资源名）
* `__TencentCaptchaArmorInner__`：`widget-ele.js` 1 次（`87588` 附近，**只读**）、`eo-frame.js` 1 次（`99456` 附近，**只读**）
* `__TencentCaptchaArmorFrame__`：`widget-ele.js` 1 次、`eo-frame.js` 1 次
* `widget-ele.js` 中 `eval(`：**0 次**；`new Function` 仅 1 处（`89436`，webpack 的 `return this` 全局探测，与 armor 无关）

只读的意思是：**bundle 里没有任何 `xxx.__TencentCaptchaArmorInner__ = …` 赋值**；写入发生在被 JSVMP 编译的模块内部（见 1.2，运行时可观测）。

### 1.2 两个 armor 模块的边界（JSVMP 打包）

两个 bundle 里各有一个被 `javascript-obfuscator` + 自定义 VM 编译的模块：字符串表可见，逻辑体被压成 base64 程序流，通过 `(…b64…, !1)(23454, [], window, [...字面量表...], void 0)()` 引导执行。

| 模块 | 文件 | 字符区间 | 程序 blob | 安装的全局 | 暴露 API |
|---|---|---|---|---|---|
| Inner（请求层） | `widget-ele.js` | `[118599, 157282]` | `155772` 处 b64 → 38 667B 模块 | `globalThis.__TencentCaptchaArmorInner__` | `bindArmor/1`、`applyVerifyArmor/2`、`decodeGetsigJson/3` |
| Frame（会话层） | `eo-frame.js` | `[121299, 187354]` | `184968` 处 b64 → 66 039B 模块 | `globalThis.__TencentCaptchaArmorFrame__` | `createHandshake/0`、`handshakeQuery/1`、`loadServerPublic/0`、`deriveSessionKey/3`、`applyPrehandleArmor/2` |

字符串表（`widget-ele.js@156053` 起、`eo-frame.js@185578` 起）直接暴露了内部函数名，是判定实现范围的硬证据：

```
"ENC_C1","C20P_NONCE_LEN","C20P_TAG_LEN","VERIFY_TS_SKEW_SEC","concatBytes","utf8Encode",
"bytesToBase64","base64ToBytes","timingSafeEqual","randomBytes","bytesEqual",
"bindArmor","applyVerifyArmor","decodeGetsigJson","armorFromWire","encSupported","enc",
"ans","sess","nonce","ts","pow_answer","pow_calc_time","sealVerifyPayload","S","payload",
"openGetsigBlob","openC20p","sealC20p","dyn_show_info","expire_at","comm_captcha_cfg",
"armorToWire","openPrehandleBlob", … 1634760805,2036477234,1797285236 …
```

`1634760805 / 2036477234 / 1797285236` = `0x61707865 / 0x79622d32 / 0x6b206574` = `"expa"/"y2b"/"k et"`，即 **ChaCha20 的 sigma 常量**（`widget-ele.js@157193`、`eo-frame.js@187276`）。SHA-256 常量（`1779033703…`）同在表内，说明 HKDF/HMAC 也是手写实现。

### 1.3 加载（“注入”）路径：webpack 副作用 require，不是网络注入

`widget-ele.js@118293` 起的包装模块（`armor_bind.txt` 同源，实测偏移 `117941`）：

```js
// widget-ele.js@117941
t.bindArmor=function(e){if(!e)return null;try{return i().bindArmor(e)}catch(t){return null}},
t.applyVerifyArmor=function(e,t){try{return i().applyVerifyArmor(e,t)}catch(r){return!1}},
t.decodeGetsigJson=function(e,t,r){try{return i().decodeGetsigJson(e,t,r)}catch(o){return{ok:!1,reason:"decode throw"}}}
// 上一层：i=r(53) → 再下一层：r(54); var i=r(31)
t.bindArmor=function(e){return i.loadArmorInner().bindArmor(e)}          // i = r(31) loader
```

`widget-ele.js@87588`（loader，`eo-frame.js@99309` 同构）：

```js
t.loadArmorFrame=function(){return r("__TencentCaptchaArmorFrame__")},
t.loadArmorInner=function(){return r("__TencentCaptchaArmorInner__")}
// r(k) = (typeof globalThis!=="undefined"?globalThis: typeof window!=="undefined"?window:e)[k]
```

所以链路是：`RequestManager` 模块 `require(53)` → `require(54)`（**副作用**：VM 模块执行，把 API 挂上 `globalThis`）→ `require(31)` 的 loader 按名字取全局对象。
**没有任何** `cap_union_new_getsig` 返回 `js` 字段被 `eval`/`new Function`/`appendChild(script)` 执行的分支：

* `widget-ele.js` 里 `getScript` 只用于 `tdc.js`（`88595` `loadDyJs`）、`refreshDyJs`（`173012`，用 prehandle 的 `comm_captcha_cfg.tdc_path`）、`initVm`（`172699`）、`dy-jy.js`（`227470`）；
* `cap_union_new_getsig`（`widget-ele.js@174154`）的响应只作为**数据**交给 `decodeGetsigJson`（见 3.3），不做代码执行。

> 结论：armor 的能力随 bundle 静态下发；服务端只能通过「给不给 `blob`」「getsig 里给不给加密体」来开关，无法注入代码。

---

## 2. armor 何时启用：整条判定链（含代码位置）

### 2.1 能力探测 —— `eo-frame.js`

```js
// eo-frame.js@209467  canOfferArmorByUa()：UA 白/黑名单（Android<12、iOS<15、Mobile/Tablet 判定）
// eo-frame.js@209402  canOfferArmor()
canOfferArmor=function(){try{return!!(o()&&                       // o = canOfferArmorByUa
  function(){ /* ArrayBuffer/Uint8Array/Uint32Array/Int16Array/Float64Array + subarray/set 语义自检 */ }()
  &&function(){ /* crypto.getRandomValues(8) 自检 */ }())}catch(t){return!1}}
```

### 2.2 握手创建 & 带进 prehandle URL

```js
// eo-frame.js@229381  getPreHandleNew
var i = E.canOfferArmor() ? m.createHandshake() : null,    // 握手对象
…
a.__hs = i, e.success(a)                                    // @229887：握手挂到 prehandle 响应上（非枚举语义，见下）
```

```js
// eo-frame.js@230600  prehandle URL 参数
enc_ua: E.canOfferArmorByUa() ? "1" : "0"
// eo-frame.js@230638
if(e){var A=m.handshakeQuery(e); n.kid=A.kid, n.ec_pub=A.ec_pub, n.enc_ok=A.enc_ok}
```

`handshakeQuery` 实测输出：`{"kid":"1","ec_pub":"<base64 X25519 公钥>","enc_ok":"c1"}`。
→ 抓包里 `kid=1&ec_pub=n8tgHWtFY6LoLpa3Dnkqai1YRGGRliL0bmmNWIApZj0%3D&enc_ok=c1` 正是这条链路，**说明浏览器侧确实发起了握手**。

### 2.3 服务端开关：`data.blob`

```js
// eo-frame.js@210888
t.applyPrehandleArmor=function(e,t){
  var a=e&&e.data;
  if(!a||"object"!=typeof a)return{ok:!0,data:a};
  if(!a.blob)     return{ok:!0,data:a};      // ← 没有 blob：原样透传（armor 关闭）
  if(!t)          return{ok:!1};             // 有 blob 但没握手：失败
  try{return i(85).applyPrehandleArmor(e,t)}catch(r){return{ok:!1}}
}
```

调用点：

```js
// eo-frame.js@228088
var r=e.__hs||null; delete e.__hs;
var o=m.applyPrehandleArmor(e,r);
if(o.ok){ e.data=o.data; … }                 // 解密后的 data + armor 一起进 preloadOption
```

### 2.4 widget 侧绑定

```js
// widget-ele.js@172248  RequestManager 构造函数
this.armor=null
// widget-ele.js@172286
e.prototype.bindArmor=function(e){this.armor=c.bindArmor(e)}
// widget-ele.js@231074  prehandle 成功后
this.httpRequest.bindArmor(e.armor)
```

`e.armor` 只可能由 2.3 的解密结果提供（`{ok:true, data, armor}`）；`bindArmor(undefined)` 在 `117941` 处 `if(!e)return null` 返回 `null`。

### 2.5 verify 分支

```js
// widget-ele.js@174847  e.prototype.verify=function(e,t){ … }
var l={collect:s,tlg:s.length,eks:u,sess:this.sess,ans:JSON.stringify(e)};
… l.deviceID=…; if(d.runWorkload&&…) l.pow_answer=…,l.pow_calc_time=…
if(!this.armor||c.applyVerifyArmor(l,this.armor)){          // @175320
   … 拼 form-urlencoded 发 /cap_union_new_verify …
} else { t({errorMessage:"armor payload",errorCode:"httpError",…}) }
```

### 2.6 你这次抓包的实际情况（结论：armor 未启用）

| 证据 | 值 |
|---|---|
| prehandle URL 含 `ec_pub` / `enc_ok=c1` / `kid=1` | 是（握手已发起，能力探测通过） |
| prehandle 响应 `data` 的键 | `comm_captcha_cfg, dyn_show_info, html` —— **无 `blob`** |
| verify POST 字段 | `collect,tlg,eks,sess,ans,deviceID,pow_answer,pow_calc_time` —— **无 `payload`** |
| `data.blob` 缺失的后果 | `applyPrehandleArmor` 在 `210987` 处直接 `{ok:true,data}` 透传 → `e.armor=undefined` → `bindArmor→null` → `!this.armor` 为真 → **明文分支** |

即：**这是「握手已发起、服务端选择不下发 armor」的明文快速路径**。因此抓到的 `collect/eks` 是 TDC 原始产物，不含任何 armor 密文。

---

## 3. 密钥来源与算法（已用 Node 实测对齐）

### 3.1 X25519 握手（`createHandshake`）

`eo-frame.js` 的 Frame 模块运行时输出（`scripts/armor_probe.mjs` 实跑）：

```
secretKey = 1a988501c403eb523b54d419f5a732cab449300e37748ef864fad98712d34b83   (32B, random)
publicKey = a1c3cfc80eaf1cbaf82da0b73ef9172c7e5680410f2209847f529c9573943645   (32B)
encOk     = "c1"
handshakeQuery = {"kid":"1","ec_pub":"ocPPyA6vHLr4LaC3PvkXLH5WgEEPIgmEf1KclXOUNkU=","enc_ok":"c1"}
```

Node 侧用 `crypto.createPrivateKey(PKCS8(secretKey))` 推出的公钥与 VM 的 `publicKey` **逐字节相同** → 标准 X25519。

`loadServerPublic()` 返回**硬编码常量 32B**：

```
c855b6f4e1a75920a818df194530583ba6c3034e289402ac0249f43f4185e717
```

### 3.2 会话密钥 KDF（`deriveSessionKey`）

`eo-frame.js` 内部实现（运行时用「小 buffer 轨迹」反推、并与 VM 输出比对确认）：

```
shared = X25519(client.secretKey, SERVER_PUBLIC_KEY)                      // 32B
PRK    = HMAC-SHA256(key = 0x00 * 32, msg = shared)                       // HKDF-Extract，salt 固定 32 字节全 0
info   = "hundun2|" + enc            // enc 来自 data.enc，实测取值 "c1" → "hundun2|c1"（10 字节）
key    = HMAC-SHA256(PRK, info ‖ 0x01)                                    // HKDF-Expand 第一块，L=32
```

实测两条独立证据：

1. 轨迹里出现 32B 全零（salt）、10B `"hundun2|c1"`（info）、64/96/128B 的 HMAC 中间块；
2. `HKDF(hkdfSync)` 结果与 `deriveSessionKey` 返回值逐字节相等（`armor_probe.mjs` 打印 `MATCH`），且该 32B 恰好等于 VM 自造 blob 时内部使用的那把 AEAD key。

> 注：HMAC-SHA256 会把 key 补零到 64B 块，所以 `salt = 0x00*32` 与 `salt = 空` 的 Extract 结果相同；实现里出现的是 32 字节全零 buffer，两种写法都可复现。

> `info` 里的 `"hundun2"` 是固定的 KDF_INFO_PREFIX（字符串表项 `"KDF_INFO_PREFIX"`）；第三个参数在公开 API 上就是 `enc` 套件名。**与 sess / collect / eks / getsig 无关。**

### 3.3 请求层密钥 `S`：由服务端 blob 下发

`openPrehandleBlob` = 用 3.2 的会话密钥解开 `data.blob`，得到一份**扁平 JSON patch**，其中的 `S` 就是后续 verify 载荷的 AEAD 密钥（32B，base64）。

实测（自造 blob，走真实解密分支，`applyPrehandleArmor` 返回 `ok:true`）：

```json
{ "sess": "<必须与 prehandle 的 sess 相同>",
  "nonce": "<base64，12B>",          // ← 注意是字符串，不是数组
  "S": "<base64，32B>",
  "enc": "c1",
  "dyn_show_info": { … },            // 可选，覆盖 prehandle 的 dyn_show_info
  "comm_captcha_cfg": { … } }        // 可选，覆盖 prehandle 的 comm_captcha_cfg
```

返回：

```json
{"ok":true,
 "data":{"comm_captcha_cfg":…,"dyn_show_info":…},
 "armor":{"S":"<b64 32B>","nonce":"<b64 12B>","enc":"c1"}}
```

### 3.4 C20P 线格式（`sealC20p` / `openC20p`）

字符串表有 `C20P_NONCE_LEN` / `C20P_TAG_LEN`，实测切片（pattern blob `00 01 02 … 3f`）：

```
[12] 000102030405060708090a0b      → nonce = 前 12 字节
[36] 0c0d…2f                       → ct
[16] 3031…3f                       → tag = 后 16 字节
```

即 `wire = base64(nonce[12] ‖ ciphertext ‖ tag[16])`，**AAD 为空**（用 AAD = sess/enc/info 均失败，AAD 为空时 VM 立即 `JSON.parse` 我们的明文 → 证明 tag 校验通过）。Node 的 `chacha20-poly1305` 可双向互通。

### 3.5 `bindArmor` / `armorFromWire`（实测读序）

`Inner.bindArmor(x)` 依次读 `x.S` → `x.nonce` → `x.enc`，返回 `{S:<Uint8Array 32>, nonce:<Uint8Array|string>, enc:"c1"}`；任一缺失返回 `null`（无异常）。

### 3.6 `applyVerifyArmor` / `sealVerifyPayload`（实测）

输入 `l`（verify 载荷），输出（返回 `true`）：

```json
{"sess": l.sess,
 "nonce": <armor.nonce，原样序列化；若为 string 就是 string>,
 "ts": <秒级 Unix 时间戳，Math.floor(Date.now()/1000)>,
 "ans": l.ans,
 "pow_answer": l.pow_answer,
 "pow_calc_time": <Number(l.pow_calc_time)>}
```

然后：`delete l.ans / l.pow_answer / l.pow_calc_time`，`l.payload = base64(nonce'[12] ‖ ct ‖ tag[16])`（`nonce'` 是**新随机 12B**，与 `armor.nonce` 不同，后者只回显在密文 JSON 里）。

产物实测（`armor_probe.mjs` 输出，用 `armor.S` 在 Node 侧解开）：

```json
{"sess":"s1v33fDDw71PuG17nFqv1ZgUxAO_TdXZSQsDFwDUM_c",
 "nonce":"/d0aN41c77czDmRa","ts":1794977215,
 "ans":"[{\"elem_id\":0,\"type\":\"DynAnswerType_TIME\",\"data\":\"\"}]",
 "pow_answer":"3bd2e95f386414c4#3401","pow_calc_time":8}
```

### 3.7 `decodeGetsigJson`（getsig 刷新链）

```js
// widget-ele.js@174140
$.ajax({url: TCaptchaApiDomain+"/cap_union_new_getsig", type:"POST",
        data:{sess:this.sess, extra_info:JSON.stringify({refresh_trigger:t})},
  success:function(t){
    if(t.sess) r.sess=t.sess;
    if(r.armor && "0"===String(t.ret)){
      var o=c.decodeGetsigJson(t, r.armor, r.sess||i.sess);      // @174309
      return o.ok ? (o.plaintext ? r.armor=null : (o.nonce&&(r.armor.nonce=o.nonce)),
                     o.sess&&(r.sess=o.sess), e({ret:o.ret,sess:r.sess,data:o.data,errorMessage:""}))
                  : e({ret:"httpError", errorMessage:"armor getsig:"+o.reason, …});
    }
    e(t);                                        // armor 关闭：直接用明文 JSON
  }})
```

实测：用 `S` 自己封一个 blob 塞进 `t.data`，`decodeGetsigJson` 返回 `{"ok":true,"ret":"0","sess":<传入 sess>,"data":<base64>,"plaintext":true}` → 说明它用 `armor.S` 开 C20P，并在内层不含新 armor 时置 `plaintext:true`（此时调用方把 `r.armor` 清空，回到明文）。

---

## 4. 两种分支下 `cap_union_new_verify` 的字段结构

| 字段 | armor 未启用（你的抓包） | armor 启用 |
|---|---|---|
| `collect` | `decodeURIComponent(TDC.getData(true))`，明文，如 5112 字符 | **原样明文**（不变） |
| `tlg` | `collect.length` | 不变 |
| `eks` | `TDC.getInfo().info`（TDC 指纹 blob，352 字符 b64 = 264B） | **原样明文**（不变） |
| `sess` | prehandle 的 sess（结尾 `**`，TDC 风格） | 不变（同时出现在 `payload` 密文里做绑定） |
| `ans` | `JSON.stringify(ans 数组)` | **删除**，进 `payload` 密文 |
| `deviceID` | 明文数字 | 不变 |
| `pow_answer` | `pow_cfg.prefix + n`（`3bd2e95f386414c4#3401`） | **删除**，进 `payload` 密文 |
| `pow_calc_time` | 明文（毫秒/秒量级整数） | **删除**，进 `payload` 密文 |
| `payload` | 无 | `base64(nonce[12] ‖ C20P_ct ‖ tag[16])`，key=`armor.S`，AAD 空 |

补充：`window.getVData` 若存在会再追加 `vData`（`widget-ele.js@175320` 之后），与 armor 无关。

---

## 5. 复现步骤（已实跑）

```powershell
cd D:\ds_work\js_reverse_projects\eo_captcha_reverse
node scripts\armor_probe.mjs
```

脚本做的事（全部离线，只用 Node `vm` + 内置 `crypto`）：

1. 从 `widget-ele.js` / `eo-frame.js` 按 `"ENC_C1"` 反查模块边界并切片（`[118599,157282]`、`[121299,187354]`）；
2. 在 `vm` 沙箱里执行切片（补 `window/self/crypto/TextEncoder/atob/…`），拿到 `__TencentCaptchaArmorInner__` / `__TencentCaptchaArmorFrame__`；
3. `createHandshake()` → 用 Node 复算 `X25519 + HKDF`，与 `deriveSessionKey` 比对（打印 `MATCH`）；
4. 按 §3.3 的 schema 自造 `data.blob`，喂给 `applyPrehandleArmor` → 得到 `armor`；
5. `bindArmor(armor)` → `applyVerifyArmor(payload, armor)` → 用 `armor.S` 在 Node 侧 `openC20P` 解开 `payload`，打印密文 JSON；
6. 审计 `samples/harvest/*`：`ec_pub/enc_ok` 是否存在、prehandle `data` 是否有 `blob`、verify POST 字段集合。

关键输出（真实运行）：

```
Frame API: createHandshake/0, handshakeQuery/1, loadServerPublic/0, deriveSessionKey/3, applyPrehandleArmor/2
Inner API: bindArmor/1, applyVerifyArmor/2, decodeGetsigJson/3
SERVER_PUBLIC_KEY = c855b6f4e1a75920a818df194530583ba6c3034e289402ac0249f43f4185e717
handshakeQuery = {"kid":"1","ec_pub":"ocPPyA6vHLr4LaC3PvkXLH5WgEEPIgmEf1KclXOUNkU=","enc_ok":"c1"}
VM sessionKey = Node sessionKey  → MATCH
applyPrehandleArmor -> {"ok":true,"data":{…},"armor":{"S":"Wqe9dfXiavIpDOWaR…","nonce":"…","enc":"c1"}}
applyVerifyArmor -> true ; fields after seal: collect,tlg,eks,sess,deviceID,payload
sealed JSON: {"sess":…,"nonce":…,"ts":…,"ans":…,"pow_answer":…,"pow_calc_time":8}
```

其它辅助脚本（探索过程留档）：`scripts/probe_handshake.mjs`、`probe_kdf.mjs`、`probe_trace_kdf.mjs`、`probe_armor_proxy.mjs`、`probe_armor_shape2.mjs`、`probe_pre9..pre14.mjs`、`probe_bindarmor.mjs`、`armor_roundtrip.mjs`。

---

## 6. 未解 / 需要补的证据

1. **缺一份真正的 armor 样本**：现有抓包里服务端没下发 `blob`，所以「服务端真实 blob 的字段全集」只能按我们复现的 schema 推断（`sess/nonce/S/enc/dyn_show_info/comm_captcha_cfg`，`expire_at` 被读但可选）。要落到「服务端亲口说的结构」，需要在服务端开 armor 的站点/时段再抓一次，或直接对 `cap_union_prehandle` 用**我们自己生成的 `ec_pub`** 发一次请求看是否返回 `blob`（返回即可用我们的私钥解，因为密钥是我们自己算的）。
2. **浏览器那一次的 `secretKey` 没有记录**：`ec_pub` 已在抓包里，但 X25519 私钥随机且从未出网，事后无法用它解任何东西。要验证「真实 blob 解密」，必须 hook `__TencentCaptchaArmorFrame__.createHandshake()` 记录 `secretKey`，或走 (1) 的自造握手路线。
3. **未做字节码级反汇编**：Inner/Frame 的逻辑体是 JSVMP 程序流（`eo-frame` 程序 blob 49 756 chars → 37 316B，声明 23 454），本报告的算法结论来自「运行时行为取证 + 与 Node 原语互操作对齐」，不是逐指令还原。`armorFromWire/armorToWire/openC20p/sealC20p` 的内部细节（例如 `VERIFY_TS_SKEW_SEC` 的具体秒数、`expire_at` 的校验窗口）**未逐一验证**：本轮只观测到它们被读取，没有构造越界样本触发拒绝。
4. **`kid` 语义未验证**：`kid` 恒为 `"1"`（`ARMOR_KID`），目前没有发现它参与 KDF 或线格式；是否有 kid=2 的第二套套件，无法从现有 bundle 判断。
5. **`decodeGetsigJson` 真实样本缺失**：只用自造 blob 验证过 `ok:true / plaintext:true` 分支，服务端 getsig 真正返回加密封装时的字段（`ret`、`sess` 回显、`nonce` 轮换）未与真实响应比对。
6. **`eks` 的语义**：代码上 `eks = TDC.getInfo().info`（`widget-ele.js@89190`），由 `tdc.js` 生成；其内部结构不属于本任务范围，本报告只确证「它不是 armor 密文，且 armor 不触碰它」。

---

## 7. 对「本地 Node 离线生成合法校验请求」的含义

* 明文分支（当前线上主流）：可完全离线生成 —— `collect` 需要 TDC（`tdc.js`，另一条线）、`eks` 是 TDC info、`pow_answer` 已由 `pow_cfg.prefix/md5` 验证（`md5(prefix+"3401")==pow_cfg.md5`）。
* armor 分支：**只要服务端下发 `blob`，也能离线**——因为会话密钥只依赖「我们自己生成的 X25519 私钥 + 硬编码服务端公钥」，`S` 又由 blob 明文给出；本报告已把整条链路跑通并可复算。唯一变量是服务端是否愿意发 blob（服务端策略），不是密码学障碍。

---

*文档生成：2026-11-18；证据均为本仓库脚本实跑输出，未使用浏览器。*
