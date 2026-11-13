# 阿里云 FeiLin 拼图验证码逆向（tool.manmanbuy.com）

> **2026-11-14 最新：已完全打通 —— 纯 Node 连续 5/5 通过（S3）**
>
> 无浏览器、无 SendInput、无硬件设备，一条命令：
>
> ```bash
> node e2e_run_chain.js --gen human --submit
> ```
>
> ```
> post 13  gap=182  dataLen=1528  → {"captchaVerifyResult":true,"bizResult":true}
> post 14  gap=169  dataLen=1304  → true
> post 15  gap=160  dataLen=1404  → true
> post 16  gap=166  dataLen=1752  → true
> post 17  gap=202  dataLen=1384  → true
> ```
>
> **两个独立难点，都已解决：**
>
> | 难点 | 解法 | 文件 |
> |---|---|---|
> | `data` 加密层（JSVMP 里自修改的 64 项查表变换） | 无密钥、可逆；两组同轮真实样本逐字节 0 差异 | [`feilin_data.js`](feilin_data.js) · [`verify_armour.js`](verify_armour.js) |
> | **轨迹形态（S3 的真门槛）** | 真人「慢逼近 → 谷底犹豫 → 末端甩鞭 → 收尾」；平滑曲线是机器指纹 | [`e2e_15_human_track.js`](e2e_15_human_track.js) |
>
> 对照实验：同一套几何、同样 `flag=1`、device 遥测 200、加密逐字节正确 ——
> **平滑轨迹 0/12，真人形态 5/5**。卡住的从来不是密码学，是轨迹像不像人。
>
> 读哪里：[`SLIDER_SOLVE.md`](SLIDER_SOLVE.md)（怎么用）· [`FINDINGS_2026-11-12.md`](FINDINGS_2026-11-12.md) §8.12（完整复盘）· [`docs/CASE.md`](docs/CASE.md)（案例与九条踩坑）
>
> 边界：**S4 未验证**（5 次都在同一小时内，跨天/连续续期未测）；仓库不含任何真实 `deviceToken`。

> **2026-11-12 更新（SDK 已升级 1.5.4，请看 [`FINDINGS_2026-11-12.md`](FINDINGS_2026-11-12.md)）**
>
> 本文下方是 1.5.1 时期的记录，部分内容已过期（`DeviceData`、`feilin002.js`、`data = 魔数 + AES(轨迹)` 都已变）。当前结论：
> - **deviceToken 生成公式已完全解开**：`base64("WEB#deviceId#AES(指纹,动态key)#len#" + MD5(前四段+"#daye,raolewoba!"))`
> - **deviceToken 可复用**：纯 Node（`init_captcha_node.js`）用浏览器产出的 token 调 InitCaptcha 直接成功
> - **data 明文结构已还原**：`deflate(JSON{TrackList:{mc,mu,mp,mm,...}, xPos, slidePos, arg})` 再经动态 JS 的自定义编码
> - **data 编码层未复现**：实现在 `dynamicJS/3.29.0/pe.0xx.<hash>.js` 的 JSVMP 内（非 crypto-js、非 feilin075.js）
> - **slideAuth 未通过**：位置正确仍被拒，归因于合成事件 `isTrusted=false` 被 SDK 记入 `TrackList.mm` 标记位

## 目标
`https://tool.manmanbuy.com/m/aliVal.aspx` 的滑块验证码（阿里云 FeiLin PUZZLE 拼图），纯协议过滑块。

## 请求链路（已完全摸清）
```
1. Log1 (cloudauth-device-dualstack)  → 设备指纹，返回 DeviceConfig
2. InitCaptcha (captcha-open)          → 返回 CertifyId + back.png + shadow.png + DeviceConfig
3. 加载 FeiLin SDK + 动态 JS，渲染滑块
4. 拖动滑块 → FeiLin 生成加密轨迹 data → 构建 captchaVerifyParam
5. POST /m/aliVal.aspx?method=slideAuth  → captchaVerifyParam={sceneId, certifyId, deviceToken, data}
6. 业务服务端校验 → captchaVerifyResult
```

## 已破解的全部密钥（config/keys_final.json）

| 名称 | 值 | 用途 |
|------|-----|------|
| Er.KEY_ID | `111jdk439dJJIjd023823201` | InitCaptcha 的 AaduaneId |
| Er.KEY_SECRET | `222aiJodos2938JDdosko2djd82sf0` | InitCaptcha HMAC 签名密钥 |
| kr.KEY_ID | `DuaneAprqkYsF3nt1yjK29Bf` | Log1 设备请求的 AaduaneId |
| kr.KEY_SECRET | `DuanemHmyeE6LXCC46sJEDUw5DTlSZ` | Log1 HMAC 签名密钥 |
| WEB_AES.REQ | `45f8ac1e1de14397` | |
| WEB_AES.RES | `87f879f135f27da7` | DeviceConfig 解密密钥 |
| WEB_AES.FLAG | `c175a358550d02e2` | |
| ACCESS_SEC (vt) | `FqJB6iRNVYdEGpwb` | KEY_ID/KEY_SECRET 解密密钥 |
| AES_IV | `0123456789ABCDEF` | AES-CBC IV（由 "d35db7e39ebbf3d001083105" hex→base64 派生） |
| APP_KEY | `ab034ec0643f91399eb33e062dc7fae1` | |
| API_VERSION | `2023-03-05` | |

## 已破解的算法

### 1. HMAC-SHA1 签名（阿里云 RPC 标准，已验证 ✅）
```
ar(s) = encodeURIComponent(s).replace(/\+/g,"%20").replace(/\*/g,"%2A").replace(/%7E/g,"~")
canonicalQueryString = sorted params, each ar(key)+"="+ar(value), joined by "&"
StringToSign = "POST" + "&" + "%2F" + "&" + ar(canonicalQueryString)
Signature = base64(HmacSHA1(StringToSign, KEY_SECRET + "&"))
```
✅ 已用真实抓包 InitCaptcha 请求验证通过。

### 2. AES 解密（KEY_ID/KEY_SECRET、DeviceConfig，已验证 ✅）
```
gr(cipher_b64) = AES-128-CBC-decrypt(cipher_b64, Utf8("FqJB6iRNVYdEGpwb"), {iv: Utf8("0123456789ABCDEF"), padding: Pkcs7})
DeviceConfig 解密 = AES-128-CBC-decrypt(DeviceConfig, Utf8("87f879f135f27da7"), {iv: Utf8("0123456789ABCDEF"), padding: Pkcs7})
```

### 3. DeviceConfig 结构（已验证 ✅）
解密后是 `#` 分隔的字符串：
```
field[0] = 每次请求的动态 AES 密钥（base64，如 "1e29dba1c26a1b57" / "db61c739893c9b16"）
field[1] = "1"
field[2] = 设备 ID (umid): appkey-h-<ts>-<rand>
field[3] = FeiLin 版本
field[4..6] = 空
field[7] = 时间戳
field[8] = 客户端 IP
field[9] = "0"
```

### 4. 字符串混淆解码（已验证 ✅）
- 自定义 base64 字母表：`abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789+/=`
- 解码函数 `rt`（偏移 314，读 Gt 数组）、`xr`（偏移 208，读 dr 数组）

## 拼图缺口识别（已验证 ✅）
back.png 296×200，缺口左边缘在灰度骤降处（当前样本 x≈112-113）。算法：逐行找灰度从背景骤降到暗区的列，取众数。

## 历史遗留问题（1.5.1 时期的判断，现均已解决）

> 下面三条是当时的未解项，2026-11-14 全部打通，原文保留作对照：
>
> - **`data` 加密** —— 已解出。既不是 AES，也不是拿 `DeviceConfig.field[0]` 当密钥；
>   而是 `dynamicJS/pe.0xx` 里一段**自修改的 64 项查表变换**（`armour`），**无密钥**、可逆。
>   魔数 `25 13 27` 是**产物不是常量**（SEED 固定 + `T` 恒以 `eJ` 起步，前 3 字节自动算出），
>   这就是当年静态搜 `251327` / `[37,19,39]` 永远搜不到的原因。
> - **`deviceToken`** —— 已解出，见上方 2026-11-12 块的公式，且可直接复用。
> - **`DeviceData`** —— 固定值，可直接打。
> - 另外当年把 `slideAuth` 失败归因于 `isTrusted` 也是**错的**：换成 `SendInput` 真鼠标注入后
>   `isTrusted=true`、`mm/mp` flag 全 1，仍然 false。真正的原因是轨迹形态。

1. ~~**data 字段（加密轨迹）**~~ → 已解决，见 [`feilin_data.js`](feilin_data.js)
2. ~~**deviceToken 生成**~~ → 已解决，见 2026-11-12 块的公式
3. ~~**DeviceData**~~ → 固定值，已可复现

## 关键发现
- DeviceData 是固定值（同一浏览器产生相同指纹），可直接硬编码或复现。
- data 的加密密钥来自 DeviceConfig 解密出的 field[0]（每次请求动态变化）。
- FeiLin SDK 有反调试：console.clear()、console.count 噪声、debugger 陷阱。
