# REPORT_B — 让 FeiLin 滑块在真实浏览器里渲染并截获 captchaVerifyParam

- 目标页：`https://tool.manmanbuy.com/m/aliVal.aspx`（`mode:'embed'`，SceneId `vollz84f`）
- 驱动方式：RDP（`FireFoxDebugger`），不使用 Playwright 操作页面
- 交付脚本：[rdp_get_cvp.py](../rdp_get_cvp.py)　校验脚本：[static/verify_cvp.py](verify_cvp.py)
- 采样结果：[config/cvp_capture.json](../config/cvp_capture.json)

---

## 0. 三句话结论

1. **滑块渲染卡在「puzzle 图片预载」这一步**：本机 WinINET 系统代理 `127.0.0.1:7897` 让浏览器访问
   `static-captcha.aliyuncs.com` 永久挂起（shell 里 curl 直连 97 ms 就 200），
   于是 SDK 里 `Lr(PuzzleImage)` / `Lr(Image)` 的 Promise 永不 settle，
   而**只有它们 settle 之后才会执行 `a()` —— `a()` 正是 `new window.AliyunCaptcha` + `getInstance` 的地方**。
2. **拿到了**：替换实例的 `captchaVerifyCallback` 后合成拖拽，回调里直接收到 `captchaVerifyParam`（`source=callback`），
   同轮还抓到 `deflate_b64`（eJ 开头）与 `device_config`（320 字符，取自 `AliyunCaptcha.prototype.deviceConfig.DeviceConfig`）。
3. **样本特征**：`captchaVerifyParam` 是 2046–2110 字符的 **JSON 信封**（`sceneId/certifyId/deviceToken/data`），
   `data` 字段 = 700 字符 base64，前 3 字节 **`25 13 27`**；`deflate_b64` 524 字符；
   **`|base64decode(data)[3:]| == |deflate_b64| - 3`（521 == 521）严格相等**，可做 XOR 求 keystream。
   从页面加载到产出 param 约 40 s。

---

## 1. 根因：容器 0×0 不是第一现场

任务书里最可疑的是 `#captcha-element` 没有宽高（页面 CSS 只有
`position:absolute; top:50%; left:50%; transform:translate(-50%,-50%)`，绝对定位 + 无尺寸 ⇒ 0×0）。**实测证伪**：

| 实验 | 结果 |
|---|---|
| 给容器 `width:360px;height:44px;display:block;position:relative` 后再 init 一次 | 容器变 360×44，但 `childNodes` 仍为 0 |
| 等到 25 s 再 attach（排除「调试器 attach 触发反调试」） | 仍然空；`document.visibilityState=visible`、rAF 2 s 内跑了 296 帧 |
| 观察 `window.RMD` | `undefined` ⇒ `AliyunCaptcha` 的构造函数（`rS` 第一行就是 `window.RMD=!1`）**从没被执行** |
| 包 `Element.prototype.insertAdjacentHTML` | 0 次调用 ⇒ `initEmbed/initPopup` 路径根本没走到 |
| 包 `Document.prototype.createElement` | 只出现 `div/span/style/iframe/script/link`（指纹 + CSS 注入），**没有 img** |
| 包 `window.FEILIN.initFeiLin` | 0 次调用 |
| `getInstance` / `window.captcha` | 一直是 `undefined` |

也就是说：InitCaptcha 请求 200、两张 PNG 的 GET 也发出去了、pe 渲染包（`pe.0xx.xxxx.js`）也下载并执行了
（注入了 3 个 `<style>`，共 14115/11509/20794 字节），**但 UI 构造那一步永远不开始**。

### 真正卡点：`a()` 的触发条件

`config/AliyunCaptcha_new.js`（loader）里这段是决定性的：

```js
function a(){
  var r = window.AliyunCaptcha.prototype;
  r.config = e; r.deviceConfig = rr;
  var i = new window.AliyunCaptcha;      // ← 控件真正实例化
  e.getInstance && e.getInstance(i);     // ← getInstance 回调
}
...
l && I().all([Lr(u.PuzzleImage), Lr(u.Image)]).then(function(t){
        e._extend({imgPreLoaded:!0});
        typeof window.AliyunCaptcha === 'function' && e.dynamicJSLoaded === true && a();
});
```

`I().all([...])` 就是图片预载。图片请求不返回 ⇒ `.then` 不执行 ⇒ `a()` 不执行 ⇒
容器永远空、`getInstance` 永不回调。**而此时 `window.AliyunCaptcha` 已经是 `function`（pe 包末尾 `t.AliyunCaptcha=rS`），
所以"初始化看起来是成功的"是个假象**——它只成功到了"下载完渲染包"。

### 为什么图片请求会挂死

```
netsh winhttp show proxy            → Direct access (no proxy server)
HKCU\...\Internet Settings
    ProxyEnable = 1
    ProxyServer = 127.0.0.1:7897    ← 本地代理客户端
```

Firefox 默认「使用系统代理」（WinINET），于是所有请求都过 `127.0.0.1:7897`。
`1sfr0c.captcha-open.aliyuncs.com`、`cloudauth-device-dualstack.cn-shanghai.aliyuncs.com` 能过，
**唯独 `static-captcha.aliyuncs.com`（CNAME → `*.w.kunlunaq.com`）被代理黑洞**：

```
curl 直连（绕过 WinINET）：http=200 tls=0.043 total=0.097 ip=117.59.166.13
页面内 new Image() / XHR / fetch 同一个 URL：16 s 后仍是 null（三种方式全挂）
```

---

## 2. 解决方案

给 `FireFoxDebugger` 用的 camoufox 一个**自带 `user.js` 的独立 profile**，关掉系统代理：

```python
PROFILE = r"D:\ds_work\js_reverse_projects\aliVal\static\profile_noproxy"
os.makedirs(PROFILE, exist_ok=True)
open(os.path.join(PROFILE, "user.js"), "w").write('user_pref("network.proxy.type", 0);\n')
tempfile.mkdtemp = lambda *a, **k: PROFILE      # 让 launch() 复用这个预置 profile
dbg = FireFoxDebugger(port=free_port()); dbg.launch(URL, wait_page=12)
```

`network.proxy.type=0` = 直连。改完立刻见效（同一份页面代码，无任何其它改动）：

```
elKids = 3
aliyunCaptcha-window-embed[810x710]  aliyunCaptcha-img-box[750x500]  aliyunCaptcha-img[750x500]
aliyunCaptcha-puzzle[130x500]        aliyunCaptcha-sliding-body[750x100]
aliyunCaptcha-sliding-slider[100x100] aliyunCaptcha-sliding-text[550x50]
window.captcha = object        ← getInstance 回调了
PNG: Image onload 296x200 / XHR st=200 len=39406
```

尺寸也对得上：`slideStyle 320~360 × 40`，被 CSS `transform:scale(var(--aliyun-zoom-ratio))` 放大 2.5 倍
⇒ 轨道 750 px、滑块 100 px、窗口 810×710。

> 备选（未采用）：往 `HKCU\...\Internet Settings\ProxyOverride` 追加该域名；
> 但它改的是全局系统设置，不如独立 profile 干净、可回滚。

---

## 3. 截获路径（同轮三件套）

### 3.1 不重新 init

页面自己的初始化（`config/init_call_1.txt`）已经跑通并且实例就绪，
**不再调 `initAliyunCaptcha`**（会卡死），直接操作现成实例 `window.captcha`。

### 3.2 换掉回调（主路径，`source=callback`）

```js
var keep = function(p){
  window.__cap.cvp = String(p); window.__cap.src = 'callback';
  return new Promise(function(){});        // 永不 resolve
};
window.captcha.captchaVerifyCallback = keep;                       // 实例自有属性（rS 里 this.captchaVerifyCallback = n.captchaVerifyCallback）
window.AliyunCaptcha.prototype.config.captchaVerifyCallback = keep; // 兜底
window.alert = function(){};                                        // 防 alert 阻塞
```

**为什么返回一个永不 resolve 的 Promise**：页面的 `onBizResultCallback` 里
`bizResult===true` 会 `location.href='/m/disSitePro.aspx...'` 跳走，`false` 会 `alert` 阻塞页面。
永不 resolve ⇒ SDK 既不跳转也不弹窗，**业务接口 `/m/aliVal.aspx?method=slideAuth` 一次都没打**
（实测 `ajax=0, xhr=0`，不消耗验证额度）。

### 3.3 三条兜底钩子

| 钩子 | 用途 | 本机实际情况 |
|---|---|---|
| `window.captchaVerifyCallback` 替换 | 主路径，直接拿 param | ✅ 命中 |
| `jQuery.ajax` 包装，取 `data.captchaVerifyParam` | 页面自带回调提交处（`config/inline_1.js`） | 0 次（回调已被换掉，符合预期） |
| `XMLHttpRequest.prototype.send` 正则抠 `captchaVerifyParam=` | 无 jQuery 时的兜底 | 0 次 |
| `window.btoa` 包装（长度 >150） | 抓 FeiLin 的 deflate 串（`eJ` 开头）与内层 `JRMn…` | ✅ 命中 |

### 3.4 `device_config` 的正确位置

不是网络层（Log1 在 attach 之前就完成了），而是挂在原型上：

```js
window.AliyunCaptcha.prototype.deviceConfig.DeviceConfig   // 320 字符
```

loader 里 `r.deviceConfig = rr` 把这个对象挂到原型，FEILIN 把 Log1 回来的
`ResultObject.DeviceConfig` 回填到它的 `DeviceConfig` 字段。同一对象里还有：

| 路径 | 长度 | 内容 |
|---|---|---|
| `deviceConfig.DeviceConfig` | 320 | ← 要的 DeviceConfig（AES 密文） |
| `deviceConfig.DeviceToken` | 1336 | `V0VCI2Fi…`（base64("WEB#ab034ec06…")） |
| `deviceConfig.sessionId` | 81 | `ab034ec0643f9139…` |
| `deviceConfig.version` | 80 | `1.5.4/feilin077…` |

### 3.5 合成拖拽

```js
slider = #aliyunCaptcha-sliding-slider          // 100×100（已 scale 2.5）
起点 = slider 中心；距离 = gap_px * zoom(2.5) = 500 px
每个 step 同时发 PointerEvent(pointerdown/move/up) + MouseEvent(mousedown/move/up)
24 步、16~32 ms 间隔、带 ±1 px 抖动，最后 mouseup
```
`isTrusted=false` 服务端必然判失败，但 FeiLin **前端**照样算轨迹、加密、回调 —— 这正是需要的。

---

## 4. 样本说明（`config/cvp_capture.json`）

```json
{
 "captchaVerifyParam": "{\"sceneId\":\"vollz84f\",\"certifyId\":\"...\",\"deviceToken\":\"V0VCI2Fi...\",\"data\":\"JRMn...\"}",
 "cvp_blob": "JRMn...",          // = 信封里的 data 字段
 "device_config": "+zSquwrNnlvWpvpj...",
 "deflate_b64": "eJz...",
 "certify_id": "PzoMR8Akv9",
 "captured_at": "2026-11-13T18:2x:xx",
 "source": "callback",
 "slider": {"gap_px": 200, "css_width": 360, "track_px": 750, "knob_px": 100, "zoom": 2.5},
 "btoa_all": [{"len":1336,"head":"V0VCI2FiMDM0"},{"len":524,"head":"eJztk0FvFDEM"},
              {"len":700,"head":"JRMnXwxEDS83"}, ...],
 "notes": "...",
 "dev_scan": [...]
}
```

| 项 | 值 |
|---|---|
| `captchaVerifyParam` 长度 | 2046 / 2086 / 2110（三次采样，随轨迹变化） |
| 信封字段 | `sceneId`, `certifyId`, `deviceToken`, `data` |
| `data`（= `cvp_blob`） | 636~704 字符 base64，**前 3 字节 `25 13 27`** |
| `deflate_b64` | 476~528 字符，`eJ…`（zlib + btoa） |
| **配对等式** | `len(b64decode(cvp_blob))-3 == len(deflate_b64)-3` ⇒ 521 == 521（`static/verify_cvp.py` 实测 EQUAL） |
| keystream（XOR 后） | 190~197 个不同字节 / 521，无 8/16/20/32 周期，零字节占比 0.2%~0.6% ⇒ 像真流密码而非固定表 |
| `device_config` | 320 字符；**多次运行前 40 字符相同（`+zSquwrNnlvWpvpj…`）**，整串是否随会话变化需按全串比对（本次未留旧样本对比，注意不要假设前缀能区分会话） |
| 全流程耗时 | 约 40 s（attach 10~12 s + 拖拽 1 s + 取回） |

---

## 5. 失败尝试清单（都别再走一遍）

1. **给容器加尺寸**（`width:360px;height:44px;display:block;position:relative`）→ 容器有尺寸了，仍然 0 子节点。
   容器 0×0 是**结果不是原因**（UI 压根没生成）。
2. **重新调一次 `initAliyunCaptcha`**（带自己的回调）→ 会再发一次 InitCaptcha + 再注入一套 CSS，UI 依旧不出现；
   多次调用会把主线程拖死。
3. **早 attach（wait_page=2~3）** → `thread.attach` 直接超时（主线程被 WebGL 指纹采集占满），
   `evaluate` 25~60 s 无响应。必须等 ~10 s。
4. **怀疑反调试 / 隐藏页 / rAF 节流** → 25 s 后才 attach 仍然不渲染；
   `visibilityState=visible`、`hasFocus()=true`、rAF 2 s 296 帧，全部排除。
5. **怀疑 `document.fonts` / IntersectionObserver / shadow DOM** → 容器 `shadowRoot=none`；
   全 DOM 无任何 `captcha|aliyun|slide` 相关节点（`body.children` 只有 4 个原始节点）。
6. **怀疑 pe 渲染包加载失败** → `window.AliyunCaptcha` 已是 `function`，pe 也注入了 3 个 `<style>`，加载没问题。
7. **热缓存重载**（想压进 device 阶段的 5 s 竞速窗口）→ feilin 2189 ms、pe 1844 ms 依旧不渲染，说明瓶颈不在 device。
8. **包装 `FEILIN.initFeiLin` / `insertAdjacentHTML` / `createElement` / `Error` / `unhandledrejection` / `console.error`**
   → 全部静默，**没有异常**。这就是为什么靠报错找不到原因：它不是抛错，而是 await 永不返回。
9. **在页面里 `new Image()` / `fetch` / `XHR` 拉 PNG** → 三种方式都 16 s 无任何回调（onload/onerror 都没有），
   而 `curl` 直连 97 ms 返回 200。**这才把矛头指向系统代理。**

---

## 6. 复现

```powershell
cd D:\ds_work\js_reverse_projects\aliVal
python rdp_get_cvp.py          # 自带 idle 等待、端口挑选(6200-6400)、结尾 dbg.close()+端口释放检查
python static\verify_cvp.py    # 打印配对等式 / keystream 特征
```

脚本要点（都在 [rdp_get_cvp.py](../rdp_get_cvp.py) 里）：

- `free_port()` 在 6200–6400 里挑空闲端口；`launch(url, wait_page=12)` 后再 attach（避开忙期）。
- `enable_retry()` 重试 attach；`evaluate` 结果不在页面里 await（RDP 不支持 awaitPromise），全部走"写标志 → 轮询"。
- 结尾 `dbg.close()` + 端口 `connect_ex` 复查，实测 `[port free] True`，无残留 camoufox。
- `slider_dom.json` 里历史记录的 `#captcha-element [0x0]` 与本次现象一致，属于同一问题。

### 仍需注意

- 页面内联脚本第 72 行 `async` 换行导致 `ReferenceError: async is not defined`
  （`async\function captchaVerifyCallback` 被 ASI 拆开），**这是页面自己的 bug**，
  但它发生在 `initAliyunCaptcha(...)` 之后，不影响初始化，与本问题无关。
- `#button` 有 `visibility:hidden`，embed 模式不需要点它。
- 每轮只消耗一次 InitCaptcha（页面加载），业务接口 `slideAuth` **0 次**。
