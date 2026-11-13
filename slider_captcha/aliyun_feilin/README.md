# 阿里云滑块（AliyunCaptcha / FeiLin 1.5.4）纯 Node 求解

**结论：S3 已达成 —— 连续 5/5 通过（gap 160~202），纯 Node，无浏览器、无硬件设备。**

```
post 13  gap=182  dataLen=1528  → {"captchaVerifyResult":true,"bizResult":true}
post 14  gap=169  dataLen=1304  → true
post 15  gap=160  dataLen=1404  → true
post 16  gap=166  dataLen=1752  → true
post 17  gap=202  dataLen=1384  → true
```

S4（跨天 / 连续续期）未验证。

---

## 两个独立难点

这个验证码有**两件事**要分别解决，只解决一件会一直失败：

### 1. `data` 的加密层（字节码 VM 里的自修改查表变换）

```
payload = nonce_hex(32 字符) ‖ JSON{TrackList, TrackStartTime, VerifyTime, xPos, slidePos, arg}
T       = base64( zlib.deflate(payload, level 6) )      // T 恒以 "eJ" 开头
data    = base64( armour(T) )                           // 与 T 等长，前 3 字节天然是 25 13 27
```

`armour` 无密钥，只依赖构建常量 `SEED = "3e627e1b4c63f913"` 与固定的 64 项表。
实现在 `feilin_data.js`（含 `armour` / `unarmour`，可逆）。

三个反直觉点：

- 魔数 `25 13 27`（base64 后是 `JRMn`）**不是常量，是产物**——SEED 固定 + `T` 恒以 `eJ` 起步，前 3 字节自动算出来。这就是为什么静态搜 `251327` / `[37,19,39]` 永远搜不到。
- `|enc| = |T| − 3` 是误读：`armour` 输出与 `T` 等长，那 3 字节本来就是输出的前缀。
- 不需要 `DeviceConfig` 里那个每会话变化的 key。

### 2. 轨迹形态（S3 的真门槛）

真人**不是**平滑曲线，而是「慢逼近 → 谷底犹豫 → 末端甩鞭 → 收尾」：

| 指纹 | 真人 | 平滑曲线（机器） |
|---|---|---|
| 峰值速度位置 | **74.5% 进度** | 5~20% |
| 峰值速度 | **9722 px/s** | ~1400 px/s |
| `dx` 中位 | **1px**（p90 2px） | 大步长 |
| 完全静止帧 | **4%** | 0% |
| 末端回拉 | **55% 概率，3~12px** | 无 |
| y 路径 std | **38px（手臂线性漂移）** | 2px 抖动 |
| 事件数 | **127** | 数百上千 |
| 总时长 | **1.62s** | 数秒 |

实现在 `e2e_15_human_track.js`。

**对照实验**（同一套几何、同样 `flag=1`、device 遥测 200、加密逐字节正确）：

| 轨迹形态 | 结果 |
|---|---|
| 平滑贝塞尔，543 点 / 4.4s，dataLen 4688~16300 | **0/12** |
| 真人形态，92~114 帧 / 0.88~1.24s，dataLen 1304~1752 | **5/5** |

---

## 文件

| 文件 | 作用 |
|---|---|
| `feilin_data.js` | payload → deflate → `armour` → `data`，含可逆的 `unarmour` |
| `verify_armour.js` | 算法自检：两组真实样本逐字节比对 + 往返测试（应 2/2 + 2/2，退出码 0） |
| `e2e_15_human_track.js` | 真人形态轨迹生成器（`--submit` 可走完整链） |
| `e2e_run_chain.js` | 一条链：InitCaptcha → 检测 gap → 离线 data → slideAuth |
| `e2e_01_init.js` | 纯 Node InitCaptcha（阿里云 RPC + HMAC-SHA1 签名），含图片下载 |
| `e2e_02_data.js` | 离线构造 payload + data |
| `e2e_03_slideauth.js` | 提交 slideAuth 并记录回执 |
| `e2e_gap.js` | 缺口检测（y 约束 + 亮且平整的 core 均值） |
| `e2e_09_gen_trusted.js` | 早期 trusted 形态生成器（对照组） |
| `e2e_common.js` | 公共：UA、配额、请求封装 |
| `utils/crypto.js` | 阿里云 RPC 签名（HMAC-SHA1）+ AES 解密 |
| `config/cvp_sample_1.json` / `_2.json` | 两组**同轮配对**真实样本（cvp + deflate_b64 + DeviceConfig） |
| `config/human_cvp.json` | 真人手拖的完整样本（用于对照轨迹指纹） |
| `docs/CASE.md` | 完整案例（含九条踩坑与判据） |

---

## 用法

```bash
# 1) 算法自检（不需要网络）
node verify_armour.js           # 期望 2/2 + 2/2，退出码 0

# 2) 轨迹形态自检
node e2e_15_human_track.js      # 打印帧数/时长/峰值速度/位置/yStd/dt/零位移

# 3) 完整链（需要 deviceToken）
node e2e_run_chain.js --gen human --submit
```

### 关于 `deviceToken`

`e2e_01_init.js` 需要一个已存在的 `deviceToken`（浏览器产出的设备指纹串，形如 `V0VCI2Fi…`）。
本仓库**不包含**任何真实 deviceToken，请自备：在目标页面里执行 `window.z_um.getToken(certifyId)`，
或拦截 `/captcha/InitCaptcha` 请求从 `DeviceToken` 参数取。

---

## 几何口径（本目标站点实测）

```
slidePos = 手指位移 / 2.5         （受控标定：指令 600px → slidePos 240）
xPos     = 拼图块最终位置 / 2.5
图片 296×200 → 渲染 750×500（容器 transform: scale(2.5)）
```

⚠️ 有公开项目测出**二次关系**（`piece.left = 0.0769·m + 0.003552·m²`）。
**换站点必须重新标定，不要照抄系数**——同一厂商不同集成方式会给出不同的缩放/映射。

---

## 关键坑（完整清单见 `docs/CASE.md`）

1. **「点数越多越像人」是错的**：543 点全 false，92 帧通过。
2. **平滑就是机器指纹**：30 条真人 vs 合成训分类器，AUC=1.000 完美可分。
3. **不要用闭环"按块的实际位置回压手指"**：会造出 `107 -35 -102 42 -58` 的来回震荡。
4. **profile 必须每次全新**：复用同一 profile 会让 device SDK 状态累积、XHR `status 0`，看起来像风控拒绝。
5. **`flag=1` 是"可信"不是"不可信"**：`SendInput` 真鼠标注入时 `mm/mp` 全 1，`dispatchEvent` 全 0。
6. **`mm` 里最后一步 137px 不是异常 tail**，那是末端甩鞭。
