/**
 * 交互测试：字体总开关打开 + 点击展开 → 渲染定制区（含自定义音源分支） —— 面板离线验证（jsdom + react-dom，无需启动桌面端）
 * 先跑：npm i -D react react-dom jsdom && node tests/setup.mjs
 */
import { JSDOM } from 'jsdom'
const dom = new JSDOM('<!doctype html><html lang="zh"><head></head><body></body></html>', { pretendToBeVisual: true, url: 'http://localhost/' })
const w = dom.window
for (const k of ['window','document','localStorage','sessionStorage','MutationObserver','HTMLElement','Element','Node','CustomEvent','Event','getComputedStyle','requestAnimationFrame']) { try { globalThis[k] = w[k] } catch {} }
globalThis.IS_REACT_ACT_ENVIRONMENT = false
const zd = { zoom: { get: async () => ({ percent: 100 }), setPercent: async () => {}, onChanged: () => () => {} }, readFileDataUrl: async () => 'data:audio/mpeg;base64,AAAA', selectPaths: async () => [] }
w.hermesDesktop = zd; globalThis.hermesDesktop = zd
document.fonts = { check: () => false }
globalThis.__notices = []
const warns = []
const origErr = console.error
console.error = (...a) => { warns.push(a.join(' ')); origErr(...a) }
const { default: plugin } = await import('../desktop/plugin.js')
let captured = null; const store = new Map()
store.set('font.enabled', true)
store.set('sound.source', 'custom')
store.set('sound.customName', 'ding.mp3')
plugin.register({
  storage: { get: (k, d) => (store.has(k) ? store.get(k) : d), set: (k, v) => store.set(k, v) },
  i18n: { register: () => () => {}, t: (k) => k },
  register: (d) => { captured = d }, onDispose: () => {}, rest: async () => ({ fonts: ['LXGW WenKai', 'Maple Mono', 'Consolas'] }), reset: () => {}
})
const { createRoot } = await import('react-dom/client')
const container = document.createElement('div'); document.body.appendChild(container)
createRoot(container).render(captured.data.menuContent)
const tick = () => new Promise((r) => setTimeout(r, 60))
await tick()
const before = container.innerHTML.length
const find = (text) => [...container.querySelectorAll('div')].find((d) => { const k = Object.keys(d).find((x) => x.startsWith('__reactProps$')); return !!k && d.textContent === text && typeof d[k].onClick === 'function' })
const fontTitle = find('font.title')
console.log('找到字体标题行:', !!fontTitle)
const pkey = fontTitle && Object.keys(fontTitle).find((k) => k.startsWith('__reactProps$'))
console.log('React props 键:', pkey, '| 有 onClick:', !!(pkey && fontTitle[pkey].onClick))
globalThis.IS_REACT_ACT_ENVIRONMENT = true
const React = (await import('react')).default
const act = React.act
if (pkey && fontTitle[pkey].onClick) { await act(async () => { fontTitle[pkey].onClick() }); }
await tick()
const html = container.innerHTML
const want = ['font.thinkBox','font.tintStrength','font.reset','font.ui','font.text','font.code','font.thinking','font.colorPrimary']
console.log('点击展开后长度:', before, '->', html.length)
console.log('展开区缺失文案:', JSON.stringify(want.filter((k) => !html.includes(k))))
console.log('展开区渲染出的控件: seg=', (html.match(/data-comp="seg"/g)||[]).length, ' switch=', (html.match(/data-comp="switch"/g)||[]).length, ' select=', (html.match(/<select/g)||[]).length)
console.log('React 警告数:', warns.filter((x) => /key|Warning/i.test(x)).length)
console.log('剩余警告:', JSON.stringify(warns.map((x) => x.split('\n')[0].slice(0, 90))))
console.log('notices:', JSON.stringify(globalThis.__notices))
warns.filter((x) => /key|Warning/i.test(x)).slice(0,3).forEach((x) => console.log('  !', x.split('\n')[0].slice(0,140)))
