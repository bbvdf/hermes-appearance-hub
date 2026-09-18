"""hermes-appearance-hub 统一插件包占位模块。

实际逻辑不在此处:
- 桌面 UI: desktop/plugin.js(桌面端直接加载,状态栏「外观」面板)
- 后端: dashboard/plugin_api.py(提供 GET /fonts,见 dashboard/manifest.json)

本文件仅为占位,使包结构完整;CLI 的 plugins doctor 会报
"no register() function",属预期内,可忽略。
"""
