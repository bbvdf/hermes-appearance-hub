/**
 * 冒烟测试：加载插件 → register → 渲染面板 → 完成事件 → 卸载 —— 面板离线验证（jsdom + react-dom，无需启动桌面端）
 * 先跑：npm i -D react react-dom jsdom && node tests/setup.mjs
 */
import { JSDOM } from 'jsdom'
const dom = new JSDOM('<!doctype html><html lang="zh"><head></head><body></body></html>', { pretendToBeVisual: true, url: 'http://localhost/' })
const w = dom.window
const GLOBALS = ['window','document','localStorage','sessionStorage','MutationObserver','HTMLElement','Element','Node','CustomEvent','Event','getComputedStyle','requestAnimationFrame']
for (const k of GLOBALS) { try { globalThis[k] = w[k] } catch (e) { console.log('skip global', k, e.message) } }
const zd = { zoom: { get: async () => ({ percent: 100 }), setPercent: async () => {}, onChanged: () => () => {} },
             readFileDataUrl: async () => 'data:audio/mpeg;base64,AAAA', selectPaths: async () => [] }
w.hermesDesktop = zd; globalThis.hermesDesktop = zd
document.fonts = { check: () => false }
const notices = []; globalThis.__notices = notices

const TARGET = process.argv[2] || '../desktop/plugin.js'
const mod = await import(TARGET)
const plugin = mod.default
console.log('module default keys:', Object.keys(plugin).join(','))

const store = new Map(); let captured = null; const disposers = []
const ctx = {
  storage: { get: (k, d) => (store.has(k) ? store.get(k) : d), set: (k, v) => store.set(k, v) },
  i18n: { register: () => () => {}, t: (k) => k },
  register: (data) => { captured = data },
  onDispose: (fn) => disposers.push(fn),
  rest: async () => ({ fonts: ['LXGW WenKai', 'Maple Mono'] }),
  reset: () => {}
}
plugin.register(ctx)
console.log('registered:', !!captured, captured && captured.data.id, captured && captured.data.area)
console.log('register notices:', JSON.stringify(notices))
console.log('disposers:', disposers.length)

const { renderToStaticMarkup } = await import('react-dom/server')
const html = renderToStaticMarkup(captured.data.menuContent)
console.log('panel html length:', html.length)
const must = ['sound.title','sound.preset','sound.takeover','sound.volume','sound.source','font.title','font.thinkBox','font.tintStrength','font.reset','behavior.toolView','bubble.title','translucency.title','intro.title','paper.title','tabstrip.title','density.title','zoom.title','theme.gridTitle']
console.log('MISSING KEYS:', JSON.stringify(must.filter((k) => !html.includes(k))))
for (const m of ['data-comp="seg"','data-comp="switch"','data-icon=']) console.log(m, '->', (html.match(new RegExp(m, 'g')) || []).length)
if (globalThis.__events && globalThis.__events['message.complete']) {
  try { globalThis.__events['message.complete'](); console.log('message.complete handler: OK') } catch (e) { console.log('message.complete FAILED:', e.message) }
} else console.log('message.complete handler: 未注册')
console.log('notices after render:', JSON.stringify(notices))
const selStyle = document.getElementById('hermes-appearance-hub-selection-style')
console.log('selection fix injected:', !!selStyle, '| css rules:', selStyle ? selStyle.textContent.split('\n').length : 0)
disposers.forEach((f) => { try { f() } catch (e) { console.log('dispose error:', e.message) } }); console.log('dispose: OK')
console.log('selection fix removed:', !document.getElementById('hermes-appearance-hub-selection-style'))
