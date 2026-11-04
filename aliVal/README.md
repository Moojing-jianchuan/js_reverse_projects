# 阿里云 FeiLin 拼图验证码逆向（tool.manmanbuy.com）

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

## 尚未破解（剩余工作）
1. **data 字段（加密轨迹）**：FeiLin SDK 里的自定义加密（3 字节魔数 `25 13 27` + 自定义密文，非标准 AES/XOR）。位于 feilin149.js（575KB 混淆）。密钥 = DeviceConfig field[0]（动态密钥）。
2. **deviceToken 生成**：设备指纹，位于 cloudauth-device SDK。
3. **DeviceData**：InitCaptcha 请求参数，两次抓包完全相同（固定值，可复现），结构 = AES(PLATFORM#appName#sceneId#captcha-normal#prefix#region)。

## 关键发现
- DeviceData 是固定值（同一浏览器产生相同指纹），可直接硬编码或复现。
- data 的加密密钥来自 DeviceConfig 解密出的 field[0]（每次请求动态变化）。
- FeiLin SDK 有反调试：console.clear()、console.count 噪声、debugger 陷阱。
