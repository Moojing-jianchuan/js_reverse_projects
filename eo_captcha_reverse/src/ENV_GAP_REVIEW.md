# 对 ENV_GAP 若项的复核（主会话，纯本地取证）

子会话 B 的 `src/ENV_GAP.md` 给了 13 条 `suspicious-value`。合并前我逐条核对了证据来源，
其中三条**证据口径不一致**，记录如下，避免把"另一实例的基线"当成硬指标。

## 1. `screen` 尺寸冲突：不是缺陷，是实例差异

| 来源 | 值 | 说明 |
|---|---|---|
| `env_bundle.json`（`compare_env`） | 1536×864 / avail 1536×816 | 主 frame；Python 启动的 Camoufox 实例 |
| iframe 内实测（`evaluate_js`, frame 1） | 2048×1152 / avail 1104 | MCP 那个 Camoufox 实例，另一块屏幕 |
| `innerWidth/Height` | 330×70 | widget iframe 自身尺寸，两个实例一致 |

结论：`screen.*` 是**物理屏幕**，与 frame 无关，但**随浏览器实例/机器变化**。服务端不可能要求固定分辨率，
只要求与 `innerWidth/devicePixelRatio/UA` 自洽。所以这条按 `ok` 处理，保留 iframe 实测值，不做"对齐 1536"。

## 2. `canvas.toDataURL` 尺寸：我们其实是自洽的

`samples/canvas_real_dataurl.txt`（浏览器里 TDC 绘制后录到的真实 PNG）解析 IHDR：

```
signature 89504e470d0a1a0a
IHDR width 300  height 150  bitDepth 8  colorType 6
```

即 **TDC 用的 canvas 就是 300×150**，与 `env.mjs` 的 `canvas.width=300 / height=150` 一致，
`toDataURL` 返回 300×150 的 PNG 也一致。B 报告里的"基线 240×60"来自 `env_bundle.canvas`（那是 `compare_env`
自己画的参照图，不是 TDC 的绘制），口径不同。

真正的问题只剩"改画布尺寸后 dataURL 不变"（TDC 不改尺寸，影响小），降级为 low。

## 3. `AudioContext.sampleRate=44100`：指纹用的是 Offline，不是设备

B 说"基线实时 48000"。但 DSP 指纹用的是 `OfflineAudioContext(1, 4500, 44100)`：
浏览器侧录到的真实渲染是 **4500 样本 / 44100Hz / duration 0.102**（`samples/dumped_audio_full.json`），
`env.mjs` 返回的正是这份 buffer 与 44100。实时 `AudioContext` 我们只是 stub，TDC 不拿它做指纹。

结论：44100 是对的；只有实时上下文的 `sampleRate` 可以写成 48000 以求一致，属 cosmetic。

## 仍需修的（证据一致、口径无冲突）

| 项 | 依据 |
|---|---|
| `measureText` 不随 `ctx.font` 变 | 浏览器里 `11pt` 与 `18pt` 宽度不同，本地恒定 |
| `getContext('webgl2')` 返回 1.0 stub | 浏览器 webgl2 的 VERSION/扩展数与 webgl1 不同 |
| `getComputedStyle().getPropertyValue` 恒空 | 浏览器返回元素 style 的真实值 |
| `performance.now()` 用 hrtime | 本地值比页面年龄大 3~4 个数量级 |
| `gl` 方法栈缺失 | 已在 round4 修完（`bindBuffer` 等 30+），回归确认 shader 探针不再降级 |
