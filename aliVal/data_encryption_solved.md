# data 轨迹加密 — 完整还原（已验证与浏览器抓包一致）

## 最终算法（全部离线验证 MATCH）

### data 字段生成
```
data = base64( 魔数(0x25 0x13 0x27, 3字节) + AES-128-CBC密文字节 )
```

### AES 加密参数
| 参数 | 值 |
|------|-----|
| 算法 | AES-128-CBC + Pkcs7 |
| 密钥 | DeviceConfig 解密后的 field[0]（每次请求动态，16 字节 ASCII，如 "949e92630e11f43e"）|
| IV | "0123456789ABCDEF"（由 AES_IV hex "d35db7e39ebbf3d001083105" 经 hex→base64→utf8 派生）|
| 明文 | 轨迹 JSON |

### 轨迹 JSON 格式
```json
{"mousemove":[{"x":632,"y":759,"t":38071},...],"mouseclick":[],"keyup":[],"scrollTop":[],"scrollLeft":[],"pointerEvent":[],"clientType":"desktop","startTime":1787906803422,"timestamp":"1787906803235"}
```
- mousemove：鼠标轨迹点数组（x=clientX, y=clientY, t=相对时间偏移）
- clientType："desktop"
- startTime / timestamp：时间戳（毫秒）

### DeviceConfig 解密
```
DeviceConfig 用 RES_KEY("87f879f135f27da7") + IV("0123456789ABCDEF") AES-CBC 解密
解密后是 # 分隔字符串：
  field[0] = base64 编码的动态密钥（16 hex 字符，data 加密用）
  field[1] = "1"
  field[2] = 设备 ID (umid)
  field[3] = FeiLin 版本
  field[4..6] = 空
  field[7] = 时间戳
  field[8] = 客户端 IP
  field[9] = "0"
```

## 关键验证记录（离线 MATCH）
1. HMAC 签名：`sign()` → `pOPR6amfTocqp0dBOYyxmL1lKqc=` ✅ MATCH
2. DeviceConfig 解密：field[0] = 动态密钥 ✅
3. data 加密：AES-CBC(轨迹, field0, iv) + 魔数 = 浏览器抓包密文 ✅ MATCH（`CBC match: true`）

## 完整链路（main.js 已实现）
1. InitCaptcha（HMAC 签名 + 固定 DeviceData）→ CertifyId + DeviceConfig + 图片
2. 解密 DeviceConfig → field[0]（动态密钥）
3. 缺口识别（back.png 灰度骤降列）
4. 轨迹生成 + data 加密（AES-CBC + 魔数）
5. captchaVerifyParam = {sceneId, certifyId, deviceToken, data} → slideAuth

## 剩余难点
- **deviceToken**：设备指纹（cloudauth-device SDK 生成），格式 base64("WEB#deviceId#AES加密的设备指纹#len#md5")。设备指纹收集 canvas/WebGL/navigator/screen 等，纯 Node 生成困难。

## 踩坑记录
- `CipherParams.toString()` 返回 base64（不是 hex），之前误判为 hex 导致"密文长度矛盾"和"压缩"的误判。
- feilin149.js 有 17+ 组 string pool 解码器（sb/sv、ro/tT、rv/rl、eL 等），字母表 hex 和 N^charCode 映射各不相同（sb 用 100^charCode，ro 用 10^charCode）。
- 映射 `rl(t,r)=rv(r-5,t)`，`tT(t,r)=ro(t-5,r)`。
