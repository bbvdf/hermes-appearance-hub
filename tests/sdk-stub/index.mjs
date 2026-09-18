import { jsx } from 'react/jsx-runtime'

globalThis.__notices = globalThis.__notices || []

export const haptic = () => {}

export const host = {
  notify: (m) => { globalThis.__notices.push(m) },
  onEvent: (name, cb) => {
    globalThis.__events = globalThis.__events || {}
    globalThis.__events[name] = cb
    return () => { delete (globalThis.__events || {})[name] }
  }
}

// icons 是个 Proxy：任何 icons.Xxx 都返回一个占位组件（真实 SDK 里是 lucide 图标集）
export const icons = new Proxy({}, {
  get: (_, name) => (props) => jsx('span', { 'data-icon': String(name) })
})

// 控件桩：把关键 props 投影成 data-* 供断言；真实 SDK 组件是 Radix 风格实现
const box = (label) => (p) => jsx('div', {
  'data-comp': label,
  'data-value': p && p.value,
  'data-opts': p && p.options ? p.options.map((o) => o.id).join(',') : undefined,
  'aria-label': p && p['aria-label']
})

export const Switch = box('switch')
export const SegmentedControl = box('seg')
export const Input = box('input')
export const Textarea = box('textarea')
export const DropdownMenu = box('dm')
export const DropdownMenuTrigger = box('dmt')
export const DropdownMenuContent = box('dmc')
export const DropdownMenuItem = box('dmi')

// i18n 桩：t 直接回键名，便于断言「哪些文案键被用到」
export const usePluginI18n = () => (k) => k
export const useI18n = () => ({ locale: 'zh', setLocale: () => {}, isSavingLocale: false })
