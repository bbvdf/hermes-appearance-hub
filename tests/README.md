# 离线验证

不需要启动桌面端：用 jsdom + react-dom 加载 `desktop/plugin.js`、跑 `register()`、渲染面板。

```bash
npm i -D react react-dom jsdom   # 一次性
node tests/setup.mjs             # 装 SDK 桩到 node_modules/@hermes/plugin-sdk

node tests/smoke.mjs             # 加载 / 注册 / 首次渲染 / message.complete / 卸载
node tests/expand.mjs            # 字体展开区 + 自定义音源分支渲染
```

桩（`tests/sdk-stub/`）替身 `@hermes/plugin-sdk` 的导出：`host`(notify/onEvent)、`icons`(Proxy)、
`SegmentedControl`/`Switch`/`Input`/… 与 `usePluginI18n`/`useI18n`（t 直接回键名，便于断言文案键）。

判读：两个脚本都应打印 `SYNTAX_OK` 级别的正常输出、无 React 警告（key 相关）、`dispose: OK`；
`expand.mjs` 里 `font.tintStrength` 不在展开区属正常（默认外形不是淡底/竖线档）。
