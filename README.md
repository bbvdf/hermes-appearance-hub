# hermes-appearance-hub — Hermes 桌面版「外观整合」插件

给 Hermes 桌面端用的**外观整合插件**：主题、纸纹、字体、缩放、标签栏、密度、聊天背景、窗口透明、开场标识等外观设置收进一个状态栏入口。

> **本仓库说明**：fork 自 [Heybinshao/hermes-appearance-hub](https://github.com/Heybinshao/hermes-appearance-hub)（MIT，原作者彬少），并整合了 ui-beautify（2026-09-02）：界面/正文/代码/思考四类字体自由选择 + 字号档位（12-20px）+ 思考块去灰/卡片 + 标签栏字号，统一进状态栏「外观」浮窗的「字体」区块。原始版权归原作者所有。

## 功能

| 类别 | 能力 |
|---|---|
| 主题 | 明亮/暗色/跟随系统 + 12 主题一键切换（11 原生 + Binshao 暖纸） |
| 语言 | 简/繁/EN 三键绑定官方语言通道 |
| 字体 | 总开关 + 展开式：界面 UI/聊天正文/代码/思考四类字体（输入框 + 「浏览…」本机字体列表） |
| 字号 | 界面基准 / 正文 / 代码 / 思考 / 标签栏 五处 12–20px 档位 |
| 思考块 | 去灰三档颜色（正文色/亮灰/原配色）+ 卡片框样式 + 独立字体/字号 |
| 纸纹 | 宣纸噪点层，明暗配方各四档 |
| 界面缩放 | 90–175% 六档，驱动 Hermes 原生缩放，与设置/View 菜单同步 |
| 标签栏 | 自动/始终/从不 三档 |
| 会话密度 | 紧凑/舒适/详细 三档 |
| 聊天背景 | 雕像图片显隐 |
| 窗口透明 | 透明/玻璃 + 强度滑杆，玻璃含淡出/磨砂质感/应用范围，走官方 IPC |
| 开场标识 | 关/开 + 原生文案或自定义字标/提示语（防抖自动生效） |
| 双栏布局 | 面板默认左右双栏，底部单栏/双栏随时切换，选择持久化 |

## 平台

- 桌面前端：`desktop/plugin.js`（@hermes/plugin-sdk，纯前端注入，状态栏浮窗）
- 后端：`dashboard/plugin_api.py` 提供 `GET /fonts` 枚举本机已安装字体（Windows 注册表 HKLM + HKCU），填充字体下拉框

## 安装

本插件是统一插件包，放 `$HERMES_HOME/plugins/hermes-appearance-hub/`（Windows 默认 `C:\Users\<user>\AppData\Local\hermes\plugins\`）。

1. 目录放到上述位置（含 `desktop/plugin.js` + `dashboard/` + `plugin.yaml`）
2. `hermes config set plugins.enabled '["hermes-appearance-hub"]'`（替换其它列表项时并入）
3. 重启 Hermes 桌面版；Settings → Plugins 确认已启用（`defaultEnabled: true`）
4. 状态栏右侧出现调色盘「外观」按钮

## 依赖字体

全局字体默认 **霞鹜文楷（LXGW WenKai）**，代码字体默认 **霞鹜文楷 Mono**：

- 字体仓库：[lxgw/LxgwWenKai](https://github.com/lxgw/LxgwWenKai)（MIT）
- 本机已装则直接用系统字体（零网络依赖）；未装自动从 jsdelivr CDN 加载 webfont 分片兜底
- 可在「外观 → 字体」区块换成任意本机字体（如 Maple UI、JetBrains Mono、微软雅黑等）

## 使用

1. 状态栏右侧「外观」按钮 → 浮窗；所有能力即时生效、重启保留
2. 「字体」区块：点击标题行展开，可调四类字体 + 五处字号 + 思考块样式；「浏览…」展开本机字体列表点选
3. 停用插件（Settings → Plugins）自动移除所有注入（纸纹、字体、开场标识替换等）并还原官方设置，不留残留

## 卸载

删除 `$HERMES_HOME/plugins/hermes-appearance-hub/` + 从 `plugins.enabled` 移除 + 重启桌面端。

## License

MIT
