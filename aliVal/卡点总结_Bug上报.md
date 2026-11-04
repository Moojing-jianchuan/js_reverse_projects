# 卡点总结（供上报 Bug）

## 一、目标与整体进度

**目标**：逆向阿里云 FeiLin 滑块验证码（`tool.manmanbuy.com/m/aliVal.aspx`），通过路径 B（jsdom 补环境）让 FeiLin SDK 自生成 `deviceToken`，最终纯协议过滑块。

**已完成（全部验证 MATCH）**：
| 环节 | 状态 |
|------|------|
| HMAC-SHA1 签名（InitCaptcha） | ✅ 已还原，`verify_sign.js` MATCH |
| DeviceConfig 解密（AES-128-CBC） | ✅ field[0]=动态密钥 |
| data 轨迹加密（AES-CBC + 魔数 25 13 27） | ✅ `CBC match: true` |
| 缺口识别（back.png 灰度骤降列） | ✅ gapX 正常 |
| deviceToken 结构解码 | ✅ 见下 |

## 二、deviceToken 结构（已解码出真实值）

通过主世界拿到 `window.um.getToken()` 完整返回值（1308 字符 base64），解码后：

```
deviceToken = base64("WEB#" + deviceId + "#" + ciphertext + "#" + len + "#" + md5")
```

| 段 | 值 | 长度 |
|----|-----|------|
| [0] | `WEB` | 3 |
| [1] | deviceId = `ab034ec0643f91399eb33e062dc7fae1-h-1788164336228-87581f40cd9a...`（APP_KEY-h-时间戳-uuid） | 81 |
| [2] | ciphertext（AES 密文，经 Log2 请求 `Action=Log2&Data=<ret3>` 上报） | 856 base64 = **640 字节** |
| [3] | `677`（len） | 3 |
| [4] | `c79539efa3b8ba943317d3871fa24081`（md5） | 32 |

- 上报请求：`POST https://cloudauth-device-dualstack.cn-shanghai.aliyuncs.com/`，`Action=Log2`，`Data` = deviceToken 密文（640 字节 base64），响应仅 `{"ResultObject":true}`
- **剩余未解**：`len=677` 与 `md5` 的精确计算对象（ciphertext 字节数=640，≠677；md5 对 base64 串/字节/拼接都不匹配）

## 三、卡点：jsdom 里 initFeiLin 报 null.slice()

路径 B（jsdom 补环境，让 SDK 自生成 deviceToken，绕过手动逆向 len/md5）卡住：

```
TypeError: Cannot read properties of null (reading 'slice')
    at ud (feilin002.js:1:474624)
    at uT (feilin002.js:1:510784)
    at se  (feilin002.js:1:539081)
    at Object.p (feilin002.js:1:546425)
```

**关键现象**：
- 错误发生在 `initFeiLin` 的**最早阶段**——`canvas/webgl` 调用为 0 次、XHR 为 0 次，即在任何设备指纹收集/网络请求**之前**就报错
- 换真实 DeviceConfig（320 字符）与截断占位符，报错完全一致
- 浏览器里同一份 feilin002.js 正常运行（initFeiLin 成功、生成 deviceToken）

**已尝试的补环境（均未解决）**：
- markNative 三层防御（WeakSet + toString 覆写 + Function.prototype.toString）
- navigator 基础属性（platform/vendor/userAgent/appVersion/language/languages/hardwareConcurrency/cookieEnabled/product/appCodeName/productSub/maxTouchPoints/webdriver/doNotTrack/onLine）
- window 的 document/screen/navigator/localStorage/sessionStorage getter markNative
- plugins/mimeTypes 完整结构（length=5/2 + item/namedItem/Symbol.toStringTag）
- screen（2752×1152）、window 尺寸、devicePixelRatio
- document（hasFocus/readyState/hidden/visibilityState/referrer + Symbol.toStringTag）
- canvas.toDataURL（真实指纹 882 字符）/ getContext('2d'/'webgl') + getParameter
- DOM 布局属性（offsetHeight/Width/getBoundingClientRect）
- performance.timing/navigation、matchMedia、indexedDB、mediaDevices、sessionStorage、Notification/AudioContext/fetch

## 四、关键工具发现（camoufox-reverse MCP 能力边界）

| 工具 | 能力 | 结果 |
|------|------|------|
| `evaluate_js` | **isolated world** | 读不到主世界 `window.um`/`FEILIN`（返回 undefined） |
| `hook_function` | **isolated world** | 报 `[TRACE] Cannot find: window.FEILIN.initFeiLin`，hook 不到主世界函数 |
| `trace_property_access` | 引擎层（C++），**主世界** | ✅ 采集到 31 个属性访问（但只追踪属性读取，追不到方法调用 `.slice()`） |
| `instrumentation` | AST 源码重写，**主世界** | 可注入主世界（未深入验证 tap-log） |

**据此判断**：`null.slice()` 是方法调用层面的缺项，`trace_property_access` 追不到；camoufox 无法直接 hook 主世界函数定位。最终通过 js-reverse MCP 的 `evaluate_script(mainWorld=true)` 才拿到主世界 `window.um.getToken()` 真实值。

## 五、上报 Bug 关键信息

- **FeiLin SDK 版本**：1.5.1，文件 `feilin002.3ef8801ab11a1d0f6c42014cc6c5f782de47647a0d6dcd049ef7bd891beb141f.js`（577167 字节）
- **复现**：jsdom（`pretendToBeVisual:true, runScripts:'dangerously'`）加载 AliyunCaptcha.js + feilin002.js 后，调用 `window.FEILIN.initFeiLin(Br, cb)`，立即 Promise reject `Cannot read properties of null (reading 'slice')`
- **错误位置**：feilin002.js 字符偏移 474624（ud 函数内部）
- **诉求**：定位 `null.slice()` 中为 null 的变量来源（是缺哪个环境 API 还是 Br 字段缺失）
