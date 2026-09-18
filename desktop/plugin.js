/**
 * Hermes Appearance Hub — 外观整合面板。
 *
 * 用法：
 *   - 状态栏「外观」按钮 → 标准状态栏弹窗（DropdownMenu，与核心工具一致），
 *     主题/语言/字体/纸纹/缩放/标签栏/密度/聊天背景/消息气泡/窗口透明/开场标识即时生效。
 *   - 「界面缩放」直接驱动 Hermes 原生缩放（window.hermesDesktop.zoom.setPercent）
 *     —— 与 Settings → Appearance → 界面缩放、View 菜单同一套机制，互相实时同步。
 *   - 状态栏右键菜单可勾选显示/隐藏本入口（toggleLabel）。
 *
 * 机制：注入/移除均用本插件专属 DOM id；
 *       插件被禁用/重载时 onDispose 清理全部注入，不留残留。
 *       状态栏入口用 declarative data 通道（variant:'menu' + menuContent），
 *       不自定义 Popover —— 与核心状态栏工具同一条渲染路径，最稳。
 */
import { haptic, host, icons, SegmentedControl, Input, Textarea, DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, usePluginI18n, useI18n } from '@hermes/plugin-sdk'
import { useState, useEffect, useRef } from 'react'
import { jsx, jsxs } from 'react/jsx-runtime'

// ── i18n 文案树（跟随 app 的 display.language，解析链：当前 locale → en → 键名）──
// 与官方设置页用词对齐（i18n/en.ts、zh.ts、zh-hant.ts appearance 段）；
// 仅插件特有概念（纸纹配方档位、单双栏布局）为自有翻译。主题名不翻译。
export const LOCALES = {
  en: {
    statusbar: { label: 'Appearance', title: 'Appearance Settings', toggleLabel: 'Appearance Settings' },
    language: { title: 'Language', desc: 'Choose the language for the desktop interface.' },
    theme: {
      title: 'Appearance',
      titleDesc: 'Pick a fixed mode or let Hermes follow your system setting.',
      modeLight: 'Light', modeDark: 'Dark', modeSystem: 'System',
      gridTitle: 'Theme',
      gridDesc: 'Desktop palettes only. The selected mode is applied on top.'
    },
    font: { title: 'Fonts', desc: 'Custom UI / body / code / thinking fonts, sizes and thinking-block look · latest action wins vs official chat font', yieldNote: 'LXGW takes over; edit the chat font in Settings to hand control back.',
      ui: 'UI font (empty = default)', text: 'Chat body font (empty = follow UI)',
      tabSize: 'Tab strip size', code: 'Code font (empty = default mono)',
      thinking: 'Thinking content font (empty = default)',
      thinkColor: 'Thinking color (text + border)', thinkBox: 'Thinking block look',
      thinkBoxOff: 'No frame', thinkBoxBorder: 'Hairline card', thinkBoxRail: 'Left accent rail', thinkBoxTint: 'Tinted card',
      tintStrength: 'Tint strength', reset: 'Reset to defaults',
      colorPrimary: 'Body color (brightest)', colorSecondary: 'Light gray', colorSystem: 'Original palette',
      browse: 'Browse…', collapse: 'Collapse', familyPlaceholder: 'Font family',
      sizeDefault: 'Default', sizeBase: 'Base', sizeFollowUI: 'Follow UI', sizeFollowBody: 'Follow body', sizeTitle: 'Size' },
    sound: {
      title: 'Completion Sound', desc: 'A cue when a turn finishes · presets loudness-normalised · up to 9×',
      on: 'On', off: 'Off',
      preset: 'Sound', preview: 'Preview', volume: 'Volume',
      source: 'Source', sourcePreset: 'Built-in', sourceCustom: 'My file',
      pick: 'Choose file', clear: 'Remove', none: 'No audio file chosen yet',
      takeover: 'Takeover', takeoverOff: 'Off', takeoverOn: 'On',
      soundPickTitle: 'Choose a completion sound',
      loadFailed: 'Could not read that audio (too large or unsupported):',
      takeoverNote: 'On = mute Hermes\u2019 own cue. It also mutes the thinking sound, the wake chime and haptics; press Ctrl+R to reload the window for it to take effect.',
      note: 'Presets are loudness-normalised, so switching them no longer changes volume. 9× is ~19 dB louder than Hermes\u2019 built-in cue.'
    },
    paper: {
      title: 'Paper Texture', desc: 'Rice-paper grain layer · follows light/dark',
      recipeLight: 'Light recipe', recipeDark: 'Dark recipe',
      recipeLightSet: { light: 'Light', subtle: 'Subtle', classic: 'Classic', top: 'Topped' },
      recipeDarkSet: { light: 'Light', subtle: 'Subtle', classic: 'Classic', ground: 'Grounded' }
    },
    tabstrip: { title: 'Tab Strip', desc: 'Show tabs above a zone. Auto hides them when a zone holds a single pane.', auto: 'Auto', always: 'Always', never: 'Never' },
    density: { title: 'Session List Density', desc: 'Choose how much context appears beneath session titles in the sidebar.', compact: 'Compact', comfortable: 'Comfortable', detailed: 'Detailed' },
    bubble: { title: 'Message Bubbles', desc: 'How transparent your own messages are. 0 is solid, 100 keeps only the outline.' },
    backdrop: { title: 'Chat Backdrop', desc: 'The faint statue image behind the conversation.', off: 'Off', on: 'On' },
    translucency: {
      title: 'Window Translucency', desc: 'See your desktop through the whole window, text and all. Tuned separately for light and dark.',
      clear: 'Clear', glass: 'Glass',
      tint: 'Tint', intensityLabel: 'Intensity', fade: 'Fade',
      materialTitle: 'Frost',
      materials: { 'under-window': 'Deep', popover: 'Soft', titlebar: 'Bright', header: 'Glare' },
      scopeTitle: 'Area',
      scopes: { window: 'Whole window', sidebar: 'Sidebar only' }
    },
    intro: {
      title: 'Intro Splash', desc: 'The wordmark and prompt shown on an empty chat.', off: 'Off', on: 'On',
      native: 'Native copy', custom: 'Custom',
      headlinePlaceholder: 'Wordmark, e.g. BINSHAO', taglinePlaceholder: 'Prompt (leave empty to follow native random copy)'
    },
    behavior: {
      title: 'Chat Behavior',
      toolView: 'Tool Call Display', toolViewDesc: 'Product hides raw tool payloads; Technical shows full input/output.', product: 'Product', technical: 'Technical',
      reasoning: 'Collapse Thinking by Default', reasoningDesc: 'Keep streamed reasoning available without expanding it until you open it.',
      embeds: 'Inline Embeds', embedsDesc: 'Rich previews from third-party sites (YouTube, X, …). Ask shows a placeholder; Always auto-loads; Off keeps plain links.', ask: 'Ask', always: 'Always', offEmbed: 'Off',
      popout: 'Floating Composer', popoutDesc: 'Allow dragging the composer out of its dock. Off locks it at the bottom.',
      appActions: 'App Actions', appActionsDesc: 'Where Settings, Layout, and HUD sit in the titlebar. Right leaves room for tabs.', left: 'Left', right: 'Right'
    },
    zoom: { title: 'UI Scale', desc: 'Native scaling · synced with Settings/View menu' },
    footer: { tip: 'Hover any setting for details · Changes apply instantly' },
    notify: { ready: 'Appearance Hub ready — use the Appearance toggle in the status bar', failed: 'Appearance Hub injection failed: ' }
  },
  zh: {
    statusbar: { label: '外观', title: '外观设置', toggleLabel: '外观设置' },
    language: { title: '语言', desc: '选择桌面界面的语言。' },
    theme: {
      title: '外观',
      titleDesc: '选择固定模式，或让 Hermes 跟随系统设置。',
      modeLight: '明亮', modeDark: '暗色', modeSystem: '跟随系统',
      gridTitle: '主题',
      gridDesc: '仅桌面端调色板。所选模式叠加其上。'
    },
    font: { title: '字体', desc: '自定义界面/正文/代码/思考字体与字号 · 思考块外观 · 与官方聊天字体按最后操作优先', yieldNote: '霞鹜文楷已接管界面字体；在官方设置页改聊天字体即可切回。',
      ui: '界面 UI 字体（留空=默认）', text: '聊天正文字体（留空=跟随UI）',
      tabSize: '标签栏字号', code: '代码块字体（留空=默认等宽）',
      thinking: '思考内容字体（留空=默认）',
      thinkColor: '思考块颜色（文字和边框一起变）', thinkBox: '思考块外形',
      thinkBoxOff: '不要框', thinkBoxBorder: '细边框卡片', thinkBoxRail: '左边一条竖线', thinkBoxTint: '主题色淡底',
      tintStrength: '底色浓度', reset: '重置为默认',
      colorPrimary: '正文色（最亮）', colorSecondary: '亮灰', colorSystem: '原配色',
      browse: '浏览…', collapse: '收起', familyPlaceholder: '字体家族名',
      sizeDefault: '默认', sizeBase: '基准', sizeFollowUI: '跟随UI', sizeFollowBody: '跟随正文', sizeTitle: '字号' },
    sound: {
      title: '完成提示音', desc: 'AI 说完话时响一声 · 各音效响度已统一 · 最大 9 倍',
      on: '开', off: '关',
      preset: '音效', preview: '试听', volume: '音量',
      source: '音源', sourcePreset: '内置音效', sourceCustom: '自定义音频',
      pick: '选择音频', clear: '移除', none: '还没选音频文件',
      takeover: '接管', takeoverOff: '关', takeoverOn: '开',
      soundPickTitle: '选择提示音音频',
      loadFailed: '这个音频读不了(可能太大或格式不支持):',
      takeoverNote: '开启 = 把 Hermes 自带的提示音静音。它会连带静掉思考音、唤醒音和触觉反馈；改完按 Ctrl+R 重载窗口才生效。',
      note: '各音效响度已拉平，换音效不会再忽大忽小。9 倍比 Hermes 内置提示音响约 19 分贝；内置音仍会同时响，可用「接管」开关把它静音。'
    },
    paper: {
      title: '纸纹模拟', desc: '宣纸噪点层 · 随明暗自动切换',
      recipeLight: '明亮配方', recipeDark: '暗色配方',
      recipeLightSet: { light: '极轻', subtle: '微调', classic: '经典', top: '贴顶' },
      recipeDarkSet: { light: '极轻', subtle: '微调', classic: '经典', ground: '贴地' }
    },
    tabstrip: { title: '标签栏', desc: '在分区上方显示标签。自动模式会在分区只有一个面板时隐藏标签。', auto: '自动', always: '始终', never: '从不' },
    density: { title: '会话列表密度', desc: '选择侧边栏会话标题下方显示的信息量。', compact: '紧凑', comfortable: '舒适', detailed: '详细' },
    bubble: { title: '消息气泡', desc: '你自己的消息有多透明。0 为不透明，100 时只保留边框。' },
    backdrop: { title: '聊天背景', desc: '对话后方那张淡淡的雕像图片', off: '关', on: '开' },
    translucency: {
      title: '窗口透明', desc: '让整个窗口（包括文字）透出桌面。明暗模式分别调节。',
      clear: '透明', glass: '玻璃',
      tint: '色调', intensityLabel: '强度', fade: '淡出',
      materialTitle: '磨砂质感',
      materials: { 'under-window': '深邃', popover: '柔和', titlebar: '明亮', header: '透亮' },
      scopeTitle: '应用范围',
      scopes: { window: '整个窗口', sidebar: '仅侧边栏' }
    },
    intro: {
      title: '开场标识', desc: '空白对话中显示的字标和提示语', off: '关', on: '开',
      native: '原生文案', custom: '自定义',
      headlinePlaceholder: '字标，如 BINSHAO', taglinePlaceholder: '提示语（留空跟随原生随机文案）'
    },
    behavior: {
      title: '对话行为',
      toolView: '工具调用显示', toolViewDesc: '产品模式隐藏原始工具数据；技术模式显示完整输入/输出。', product: '产品', technical: '技术',
      reasoning: '默认折叠推理过程', reasoningDesc: '保留流式推理内容，但在你打开前保持折叠。',
      embeds: '内嵌预览', embedsDesc: '富预览会从第三方网站（YouTube、X 等）加载。询问显示占位符；总是自动加载；关闭保留纯链接。', ask: '询问', always: '总是', offEmbed: '关闭',
      popout: '悬浮输入框', popoutDesc: '允许将输入框拖出底部停靠区。关闭后，输入框会锁定在底部。',
      appActions: '应用操作', appActionsDesc: '设置、布局和 HUD 放在标题栏左侧还是右侧。选右侧可给标签留出左边空间。', left: '左侧', right: '右侧'
    },
    zoom: { title: '界面缩放', desc: '缩放整个应用的文字和界面，与系统设置/View 菜单同步。' },
    footer: { tip: '悬停任一设置项查看说明 · 改动即时生效' },
    notify: { ready: '外观 Hub 已就绪 — 状态栏「外观」开关', failed: '外观 Hub 注入失败: ' }
  },
  'zh-hant': {
    statusbar: { label: '外觀', title: '外觀設定', toggleLabel: '外觀設定' },
    language: { title: '語言', desc: '選擇桌面介面的語言。' },
    theme: {
      title: '外觀',
      titleDesc: '選擇固定模式，或讓 Hermes 跟隨系統設定。',
      modeLight: '明亮', modeDark: '深色', modeSystem: '跟隨系統',
      gridTitle: '主題',
      gridDesc: '僅限桌面端的調色盤。所選模式會套用在其上。'
    },
    font: { title: '字型', desc: '自訂介面/正文/程式碼/思考字型與字號 · 思考區塊外觀 · 與官方聊天字型按最後操作優先', yieldNote: '霞鶩文楷已接管介面字型；在官方設定頁改聊天字型即可切回。',
      ui: '介面 UI 字型（留空=預設）', text: '聊天正文字型（留空=跟隨UI）',
      tabSize: '分頁列字號', code: '程式碼字型（留空=預設等寬）',
      thinking: '思考內容字型（留空=預設）',
      thinkColor: '思考區塊顏色（文字與邊框一起變）', thinkBox: '思考區塊外形',
      thinkBoxOff: '不要框', thinkBoxBorder: '細邊框卡片', thinkBoxRail: '左邊一條豎線', thinkBoxTint: '主題色淡底',
      tintStrength: '底色濃度', reset: '重設為預設',
      colorPrimary: '正文色（最亮）', colorSecondary: '亮灰', colorSystem: '原配色',
      browse: '瀏覽…', collapse: '收合', familyPlaceholder: '字型家族名',
      sizeDefault: '預設', sizeBase: '基準', sizeFollowUI: '跟隨UI', sizeFollowBody: '跟隨正文', sizeTitle: '字號' },
    sound: {
      title: '完成提示音', desc: 'AI 說完話時響一聲 · 各音效響度已統一 · 最大 9 倍',
      on: '開啟', off: '關閉',
      preset: '音效', preview: '試聽', volume: '音量',
      source: '音源', sourcePreset: '內建音效', sourceCustom: '自訂音訊',
      pick: '選擇音訊', clear: '移除', none: '還沒選音訊檔',
      takeover: '接管', takeoverOff: '關閉', takeoverOn: '開啟',
      soundPickTitle: '選擇提示音音訊',
      loadFailed: '這個音訊讀不了(可能過大或格式不支援):',
      takeoverNote: '開啟 = 把 Hermes 內建的提示音靜音。它會連帶靜掉思考音、喚醒音與觸覺回饋；改完按 Ctrl+R 重載視窗才生效。',
      note: '各音效響度已拉平，換音效不會再忽大忽小。9 倍比 Hermes 內建提示音響約 19 分貝；內建音仍會同時響，可用「接管」開關把它靜音。'
    },
    paper: {
      title: '紙紋模擬', desc: '宣紙噪點層 · 隨明暗自動切換',
      recipeLight: '明亮配方', recipeDark: '暗色配方',
      recipeLightSet: { light: '極輕', subtle: '微調', classic: '經典', top: '貼頂' },
      recipeDarkSet: { light: '極輕', subtle: '微調', classic: '經典', ground: '貼地' }
    },
    tabstrip: { title: '分頁列', desc: '在分區上方顯示分頁。自動模式會在分區只有一個面板時隱藏分頁。', auto: '自動', always: '一律', never: '永不' },
    density: { title: '工作階段列表密度', desc: '選擇側邊欄工作階段標題下方顯示的資訊量。', compact: '緊湊', comfortable: '舒適', detailed: '詳細' },
    bubble: { title: '訊息氣泡', desc: '你自己的訊息有多透明。0 為不透明，100 時只保留邊框。' },
    backdrop: { title: '聊天背景', desc: '對話後方那張淡淡的雕像圖片。', off: '關閉', on: '開啟' },
    translucency: {
      title: '視窗透明', desc: '讓整個視窗（包括文字）透出桌面。明暗模式分別調節。',
      clear: '透明', glass: '玻璃',
      tint: '色調', intensityLabel: '強度', fade: '淡出',
      materialTitle: '磨砂質感',
      materials: { 'under-window': '深邃', popover: '柔和', titlebar: '明亮', header: '透亮' },
      scopeTitle: '套用範圍',
      scopes: { window: '整個視窗', sidebar: '僅側邊欄' }
    },
    intro: {
      title: '開場標識', desc: '空白對話中顯示的字標和提示語。', off: '關閉', on: '開啟',
      native: '原生文案', custom: '自訂',
      headlinePlaceholder: '字標，例如 BINSHAO', taglinePlaceholder: '提示語（留空跟隨原生隨機文案）'
    },
    behavior: {
      title: '對話行為',
      toolView: '工具呼叫顯示', toolViewDesc: '產品模式會隱藏原始工具 payload；技術模式會顯示完整輸入/輸出。', product: '產品', technical: '技術',
      reasoning: '預設摺疊推理過程', reasoningDesc: '保留串流推理內容，但在您開啟前維持摺疊。',
      embeds: '內嵌預覽', embedsDesc: '豐富預覽會從第三方網站（YouTube、X 等）載入。詢問會在你允許前顯示佔位符；一律會自動載入；關閉則保留純連結。', ask: '詢問', always: '一律', offEmbed: '關閉',
      popout: '懸浮輸入框', popoutDesc: '允許將輸入框拖出底部停靠區。關閉後，輸入框會鎖定在底部。',
      appActions: '應用操作', appActionsDesc: '設定、版面與 HUD 放在標題列左側或右側。選右側可把左側留給分頁。', left: '左側', right: '右側'
    },
    zoom: { title: '介面縮放', desc: '縮放整個應用程式的文字與介面，與設定/檢視選單同步。' },
    footer: { tip: '懸停任一設定項查看說明 · 變更即時生效' },
    notify: { ready: '外觀 Hub 已就緒 — 狀態列「外觀」開關', failed: '外觀 Hub 注入失敗: ' }
  }
}

const ID = 'hermes-appearance-hub'
const PAPER_KEY = 'paper.enabled'
const FONT_KEY = 'font.enabled'
// 字体归属仲裁（最后动作胜）：'hub'=文楷接管（注入 sans），'official'=官方聊天字体在场。
// 仅在文楷开关开着时有意义；关=无注入，天然官方接管，不需要记。默认 hub=v3.0.0 前行为，老用户零打扰。
const FONT_WINNER_KEY = 'font.winner'
const WELCOME_KEY = 'welcome-v1'

// 界面缩放档位：直接复用 Hermes 原生预设（90/100/110/125/150/175 均为原生支持值）。
// 与官方 Settings UI_SCALE_PRESETS 对齐（appearance-settings.tsx）——90% 是官方
// 「实际大小」基准（Cmd+0 落点，electron/zoom.ts DEFAULT_ZOOM_LEVEL），缺了它
// Cmd+0 后没有任何按钮高亮。
// id 用字符串（SegmentedControl<T extends string> 要求），percent 用于调原生接口。
const ZOOM_OPTIONS = [
  { id: '90', label: '90%', percent: 90 },
  { id: '100', label: '100%', percent: 100 },
  { id: '110', label: '110%', percent: 110 },
  { id: '125', label: '125%', percent: 125 },
  { id: '150', label: '150%', percent: 150 },
  { id: '175', label: '175%', percent: 175 }
]

const PAPER_LAYER_ID = ID + '-paper'
const FONT_STYLE_ID = ID + '-font-style'

// ── 开场标识（intro splash）─────────────────────────────────────────
// 原生机制：src/store/intro-splash.ts 用 localStorage 键 hermes.desktop.intro-splash.v1
// （storedBoolean 只在模块加载读一次，无 storage 监听 → 写键仅重启后生效，
//   即时生效全靠本插件的 CSS 注入层）。渲染钩子：[data-slot="aui_intro"]，
//   字标 = p.fit-text（双 span 测量结构），提示语 = p.fit-text 相邻的 p。
const INTRO_MODE_KEY = 'intro.mode'            // 'native' | 'custom' | 'off'
const INTRO_HEADLINE_KEY = 'intro.headline'    // 自定义字标
const INTRO_TAGLINE_KEY = 'intro.tagline'      // 自定义提示语（空 = 跟随原生随机文案）
const INTRO_STYLE_ID = ID + '-intro-style'
const INTRO_NATIVE_KEY = 'hermes.desktop.intro-splash.v1'  // 只写不改名，与原生设置页保持一致

// ── 纸纹试验配方（暗色治泛白 / 浅色治发灰）──────────────────────────
// 暗色 screen 泛白根因：fractalNoise 均值~50% 灰 + screen（只提亮）→ 整屏抬向灰白。
//   思路：噪点分布「贴地」——大部分像素近黑（screen 下不影响底色），少数颗粒微亮。
// 浅色 multiply 发灰同理反向：噪点应「贴顶」——大部分近白（multiply 不影响底色），少数纤维压暗。
// 档位从左到右由轻到重；默认「极轻」。
const DARK_RECIPES = {
  light: { labelKey: 'paper.recipeDarkSet.light', baseFreq: 0.9, octaves: 3, gain: 1.3, offset: -0.15, blur: 0.6, opacity: 0.12 },
  subtle: { labelKey: 'paper.recipeDarkSet.subtle', baseFreq: 0.9, octaves: 3, gain: 1.3, offset: -0.35, blur: 0.6, opacity: 0.2 },
  classic: { labelKey: 'paper.recipeDarkSet.classic', baseFreq: 0.9, octaves: 3, gain: 1.3, offset: -0.15, blur: 0.6, opacity: 0.2 },
  ground: { labelKey: 'paper.recipeDarkSet.ground', baseFreq: 0.9, octaves: 3, gain: 2.2, offset: -0.55, blur: 0.6, opacity: 0.2 }
}
const LIGHT_RECIPES = {
  light: { labelKey: 'paper.recipeLightSet.light', baseFreq: 0.72, octaves: 4, gain: 1.3, offset: 0.3, blur: null, opacity: 0.18 },
  subtle: { labelKey: 'paper.recipeLightSet.subtle', baseFreq: 0.72, octaves: 4, gain: 1.15, offset: 0.25, blur: null, opacity: 0.28 },
  classic: { labelKey: 'paper.recipeLightSet.classic', baseFreq: 0.72, octaves: 4, gain: null, offset: null, blur: null, opacity: 0.3 },
  top: { labelKey: 'paper.recipeLightSet.top', baseFreq: 0.72, octaves: 4, gain: 1.2, offset: 0.05, blur: null, opacity: 0.35 }
}
const DARK_RECIPE_KEY = 'paper.darkRecipe'
const LIGHT_RECIPE_KEY = 'paper.lightRecipe'

// ── 移植：密度 / 标签栏 / 聊天背景 / 窗口透明 ────────────────────────
const DENSITY_KEY = 'hermes.desktop.sessionListDensity'
const DENSITY_OPTIONS = [
  { id: 'compact', labelKey: 'density.compact' },
  { id: 'comfortable', labelKey: 'density.comfortable' },
  { id: 'detailed', labelKey: 'density.detailed' }
]
const TABSTRIP_KEY = 'hermes.desktop.tabStripDefault'
const TABSTRIP_OPTIONS = [
  { id: 'auto', labelKey: 'tabstrip.auto' },
  { id: 'always', labelKey: 'tabstrip.always' },
  { id: 'never', labelKey: 'tabstrip.never' }
]
const BACKDROP_KEY = 'hermes.desktop.backdrop.v1'
// 消息气泡：官方 store/user-bubble-transparency.ts 的 subscribe 副作用等价实现——
// 根节点 CSS 变量 + 同键持久化。0=不透明(默认，移除变量)，v>0 保留 (100-v)% 填充。
const USER_BUBBLE_KEY = 'hermes.desktop.user-bubble-transparency.v1'

// ── 对话行为五件套（官方存储键，语义以官方源码为准）────────────────
// toolView.technical / reasoning.collapsedByDefault / composerPopout.gesturesEnabled
//   = boolean 键（'true'/'false'）；embed-mode = 'ask'|'always'|'off'（默认 ask）；
//   titlebarAppActions = 'left'|'right'（默认 right）。
const TOOL_VIEW_KEY = 'hermes.desktop.toolView.technical'
const REASONING_KEY = 'hermes.desktop.reasoning.collapsedByDefault'
const EMBED_MODE_KEY = 'hermes.desktop.embed-mode'
const POPOUT_KEY = 'hermes.desktop.composerPopout.gesturesEnabled'
const APP_ACTIONS_KEY = 'hermes.desktop.titlebarAppActions'

function readBoolKey(key, fallback) {
  try {
    const v = localStorage.getItem(key)
    return v === 'true' ? true : v === 'false' ? false : fallback
  } catch { return fallback }
}

function writeBoolKey(key, on) {
  try {
    localStorage.setItem(key, String(on))
    window.dispatchEvent(new StorageEvent('storage', { key }))
  } catch {}
}

function clampBubble(value) {
  const n = Math.round(Number(value))
  return Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : 0
}

function applyUserBubble(value) {
  const v = clampBubble(value)
  try {
    if (v === 0) {
      document.documentElement.style.removeProperty('--user-bubble-keep')
      localStorage.removeItem(USER_BUBBLE_KEY)
    } else {
      document.documentElement.style.setProperty('--user-bubble-keep', (100 - v) + '%')
      localStorage.setItem(USER_BUBBLE_KEY, String(v))
    }
  } catch {}
}
const TRANSLUCENCY_KEY = 'hermes.desktop.translucency.v2'
const GLASS_MATERIALS = ['under-window', 'popover', 'titlebar', 'header']
const GLASS_SCOPES = ['window', 'sidebar']
const FROST_LABELS = { 'under-window': 'translucency.materials.under-window', popover: 'translucency.materials.popover', titlebar: 'translucency.materials.titlebar', header: 'translucency.materials.header' }
const SCOPE_LABELS = { window: 'translucency.scopes.window', sidebar: 'translucency.scopes.sidebar' }
const SLIDER_STYLE = {
  height: '4px',
  WebkitAppearance: 'none',
  background: 'var(--ui-stroke-tertiary)',
  borderRadius: '9999px',
  accentColor: 'var(--dt-primary)'
}

// 嵌套行：左标签定宽(内联样式，宿主CSS不编译插件的tailwind类) + 右控件吃满。
// 必须定义在模块顶层——放组件函数体内会每帧产生新函数引用，React 视为不同组件类型
// 而卸载重挂子树，拖动滑杆的原生手势会被打断（表现为拖不动）。
const ControlRow = ({ label, children }) =>
  jsxs('div', {
    className: 'flex items-center gap-2',
    children: [
      jsx('span', {
        style: { width: '52px', flexShrink: 0 },
        className: 'text-[0.625rem] leading-tight text-(--ui-text-quaternary)',
        children: label
      }),
      jsx('div', { className: 'min-w-0 flex-1', children })
    ]
  })

// 行为/设置行（工具调用显示/折叠推理/内嵌预览/悬浮输入框/应用操作/密度等共用）：
// 无图标无简介——单行标题 + 右侧定宽控件；stacked=en 纵向通栏。
// onEnter 由面板注入（hover→底部说明带联动）。
// 必须模块级定义——放组件体内每次渲染新引用，React 卸载重挂子树。
const BehaviorRow = ({ title, options, value, onChange, stacked, onEnter }) =>
  jsxs('div', {
    onMouseEnter: onEnter,
    className: stacked
      ? 'flex flex-col gap-1.5 rounded-md px-2 py-2 hover:bg-(--chrome-action-hover)'
      : 'flex items-center gap-2.5 rounded-md px-2 py-2 hover:bg-(--chrome-action-hover)',
    children: [
      jsx('div', {
        className: 'flex min-w-0 flex-1 items-center gap-2.5',
        children: jsx('div', { className: 'min-w-0 text-[0.75rem] leading-tight', children: title })
      }),
      jsx(SegmentedControl, {
        options,
        value,
        onChange,
        className: stacked ? 'w-full' : 'ml-auto',
        style: stacked ? undefined : { width: '150px', flexShrink: 0 }
      })
    ]
  })

const INTRO_OPTIONS = [
  { id: 'native', labelKey: 'intro.native' },
  { id: 'custom', labelKey: 'intro.custom' }
]

let ctxRef = null
let paperObserver = null

// ── 纸纹 ────────────────────────────────────────────────────────
function makeTexture(baseFreq, octaves, gain, offset, blur) {
  const colorMatrix =
    gain != null
      ? "<feColorMatrix type='matrix' values='" + gain + ' 0 0 0 ' + offset +
        ' 0 ' + gain + ' 0 0 ' + offset +
        ' 0 0 ' + gain + ' 0 ' + offset +
        " 0 0 0 1 0'/>"
      : "<feColorMatrix type='saturate' values='0'/>"
  const blurFilter =
    blur != null ? "<feGaussianBlur stdDeviation='" + blur + "'/>" : ''
  const svg =
    "<svg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'>" +
    "<filter id='n'>" +
    "<feTurbulence type='fractalNoise' baseFrequency='" + baseFreq +
    "' numOctaves='" + octaves + "' stitchTiles='stitch'/>" +
    colorMatrix + blurFilter +
    '</filter>' +
    "<rect width='100%' height='100%' filter='url(#n)'/>" +
    '</svg>'
  return 'url("data:image/svg+xml,' + encodeURIComponent(svg) + '")'
}

function applyPaperMode() {
  const layer = document.getElementById(PAPER_LAYER_ID)
  if (!layer) return
  const html = document.documentElement
  const dark =
    html.classList.contains('dark') || html.dataset.hermesMode === 'dark'

  if (dark) {
    const key = ctxRef ? ctxRef.storage.get(DARK_RECIPE_KEY, 'light') : 'light'
    const r = DARK_RECIPES[key] || DARK_RECIPES.light
    layer.style.backgroundImage = makeTexture(r.baseFreq, r.octaves, r.gain, r.offset, r.blur)
    layer.style.opacity = String(r.opacity)
    layer.style.mixBlendMode = 'screen'
  } else {
    const key = ctxRef ? ctxRef.storage.get(LIGHT_RECIPE_KEY, 'light') : 'light'
    const r = LIGHT_RECIPES[key] || LIGHT_RECIPES.light
    layer.style.backgroundImage = makeTexture(r.baseFreq, r.octaves, r.gain, r.offset, r.blur)
    layer.style.opacity = String(r.opacity)
    layer.style.mixBlendMode = 'multiply'
  }
}

function injectPaper() {
  // 清理 nous-theme-kit 时代的历史残留（原纸纹插件同样处理）
  const oldLayer = document.getElementById('nous-paper-texture')
  if (oldLayer) oldLayer.remove()
  const oldStyle = document.getElementById('nous-paper-style')
  if (oldStyle) oldStyle.remove()

  let layer = document.getElementById(PAPER_LAYER_ID)
  if (!layer) {
    layer = document.createElement('div')
    layer.id = PAPER_LAYER_ID
    document.body.prepend(layer)
  }
  layer.style.cssText = [
    'position:fixed',
    'inset:0',
    'z-index:2147483647',
    'pointer-events:none',
    'background-size:205px 205px'
  ].join(';')

  applyPaperMode()

  if (!paperObserver) {
    paperObserver = new MutationObserver(applyPaperMode)
    paperObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'data-hermes-mode']
    })
  }
}

function removePaper() {
  const layer = document.getElementById(PAPER_LAYER_ID)
  if (layer) layer.remove()
  if (paperObserver) {
    paperObserver.disconnect()
    paperObserver = null
  }
}

// ── 字体（霞鹜文楷 + legacy 仓库的字体/字号/思考块增强）──────────────────
// 本段是两个来源的合并：
//   ① 上游 v3：霞鹜文楷一键接管 + 「最后动作胜」仲裁（font.winner）
//   ② legacy 仓库：界面/正文/代码/思考四类字体自由选择、字号档位（12–22px）、
//      思考块去灰/外形四档/底色浓度滑杆、标签栏字号
// 二者共存：在 hub 里显式选了自定义界面字体 → hub 赢（用户最后动作在此）；只用
// 默认文楷而官方聊天字体在场 → 让位官方，官方清空时 observer 拨回 hub。

// ── 字体（霞鹜文楷默认 + ui-beautify 字体/字号/思考块整合）────────────────
// 原 hermes-font-wenkai 的规则保留为默认（界面=霞鹜文楷、代码=霞鹜文楷 Mono）；
// 整合 ui-beautify（maple-ui-font 更名）：界面/正文/代码/思考四类字体自由选择 +
// 字号档位（12-22px）+ 思考块去灰/外形四档 + 标签栏字号。旧设置从
// maple-ui-font-settings 一次性迁移，之后以本插件 ctx.storage 为准。
const FONT_UI_KEY = 'font.uiFont'
const FONT_UISIZE_KEY = 'font.uisize'
const FONT_TEXTFONT_KEY = 'font.textFont'
const FONT_TEXTSIZE_KEY = 'font.textSize'
const FONT_CODEFONT_KEY = 'font.codeFont'
const FONT_CODESIZE_KEY = 'font.codeSize'
const FONT_THINKFONT_KEY = 'font.thinkingFont'
const FONT_THINKSIZE_KEY = 'font.thinkSize'
const FONT_THINKCOLOR_KEY = 'font.thinkingColor'
const FONT_THINKBOX_KEY = 'font.thinkBox'
const FONT_TABSIZE_KEY = 'font.tabSize'
const FONT_THINKTINT_KEY = 'font.thinkTint'
const FONT_LEGACY_KEY = 'maple-ui-font-settings' // ui-beautify 旧键，仅迁移用

const FONT_SIZES = ['12', '14', '16', '18', '20', '22']
// 比例取自 styles.css: tool=0.6875/0.8125, caption=0.75/0.8125, line=1.125/0.8125, captionLine=1/0.8125
const FONT_RATIO = { tool: 0.85, caption: 0.92, line: 1.4, captionLine: 1.23 }
const FONT_COLORS = [
  { id: 'primary', labelKey: 'font.colorPrimary' },   // 正文色(最亮,去灰)
  { id: 'secondary', labelKey: 'font.colorSecondary' }, // 亮灰
  { id: 'system', labelKey: 'font.colorSystem' },       // 原配色(还原默认)
]
// 思考块卡片样式（四档；旧布尔值在 readFontSettings 里归一化）
const THINK_BOX_STYLES = ['off', 'border', 'rail', 'tint']
const THINK_BOX_DEFAULT = 'border'
// 「底色浓度」滑杆：0 = 无底色，上限 24（再高就明显发蓝）。
// 单一数字换成两个百分比：accent 给色相、base(≈0.45 倍) 给明暗——base 与背景永远对立，
// 所以任何主题下都有可辨识的明暗差。标定：9 ≈ 浅色 #E0E8F7（Δ-31），12 ≈ #D7E1F5（Δ-40）。
const THINK_TINT_MAX = 24
const THINK_TINT_DEFAULT = 9
const clampThinkTint = (v) => {
  const n = Math.round(Number(v))
  return Number.isFinite(n) ? Math.min(THINK_TINT_MAX, Math.max(0, n)) : THINK_TINT_DEFAULT
}
const thinkTintBase = (pct) => Math.max(0, Math.round(pct * 0.45))
const FONT_DEFAULTS = {
  uiFont: 'LXGW WenKai',        // 默认霞鹜文楷（保留原插件观感）
  uisize: '',
  textFont: '',
  textSize: '14',
  codeFont: 'LXGW WenKai Mono', // 默认霞鹜文楷 Mono
  codeSize: '',
  thinkingFont: '',
  thinkSize: '12',
  thinkingColor: 'primary',
  thinkBox: THINK_BOX_DEFAULT,
  thinkTint: THINK_TINT_DEFAULT,
  tabSize: '',
}
// 界面字体栈（无衬线）：先用户选择，回落常用界面字体
const FONT_UI_FALLBACK = `, 'Microsoft YaHei UI', 'Segoe UI', system-ui, -apple-system, sans-serif, 'Apple Color Emoji', 'Segoe UI Emoji', 'Noto Color Emoji', emoji`
const FONT_MONO_FALLBACK = `, ui-monospace, 'SF Mono', 'Cascadia Mono', Consolas, Menlo, monospace, 'Apple Color Emoji', 'Segoe UI Emoji', 'Noto Color Emoji', emoji`

// 系统未装字体时的 webfont 兜底：CDN 分片子集（97 片 × ~7KB，unicode-range 按需加载），
// family 名与系统字体完全一致 → 装了用系统（零网络），没装走 CDN（零手工安装）。
// 实测 CDN: jsdelivr lxgw-wenkai-webfont@1.7.0（MIT，霞鹜文楷官方 webfont 化发行）。
const FONT_WEBFONT_ID = ID + '-font-webfont'
const FONT_WEBFONT_URL = 'https://cdn.jsdelivr.net/npm/lxgw-wenkai-webfont@1.7.0/style.css'

// 字体名 → 带引号 CSS 字符串（JSON 转义安全，防引号/反斜杠逃逸）；空值兜底 system-ui
const fontQ = (name) => JSON.stringify(String(name).trim() || 'system-ui')

// 从 ctx.storage 读全部字体设置（含默认值）
function readFontSettings() {
  const s = ctxRef ? ctxRef.storage : { get: () => undefined }
  const pick = (key, def, valid) => {
    const v = s.get(key, def)
    // 显式空串 = 面板选了「跟随XX」档（'' 天然不在档位表里）→ 必须原样保留。
    // 顶回 def 会让「跟随UI/跟随正文」静默变成硬编码档位（2026-09-17 修）。
    if (v === '') return ''
    return valid && Array.isArray(valid) && !valid.includes(v) ? def : v
  }
  return {
    uiFont: String(s.get(FONT_UI_KEY, FONT_DEFAULTS.uiFont)),
    uisize: pick(FONT_UISIZE_KEY, '', FONT_SIZES),
    textFont: String(s.get(FONT_TEXTFONT_KEY, FONT_DEFAULTS.textFont)),
    textSize: pick(FONT_TEXTSIZE_KEY, FONT_DEFAULTS.textSize, FONT_SIZES),
    codeFont: String(s.get(FONT_CODEFONT_KEY, FONT_DEFAULTS.codeFont)),
    codeSize: pick(FONT_CODESIZE_KEY, '', FONT_SIZES),
    thinkingFont: String(s.get(FONT_THINKFONT_KEY, FONT_DEFAULTS.thinkingFont)),
    thinkSize: pick(FONT_THINKSIZE_KEY, FONT_DEFAULTS.thinkSize, FONT_SIZES),
    thinkingColor: pick(FONT_THINKCOLOR_KEY, FONT_DEFAULTS.thinkingColor, FONT_COLORS.map((c) => c.id)),
    thinkBox: normalizeThinkBox(s.get(FONT_THINKBOX_KEY, FONT_DEFAULTS.thinkBox)),
    thinkTint: clampThinkTint(s.get(FONT_THINKTINT_KEY, FONT_DEFAULTS.thinkTint)),
    tabSize: pick(FONT_TABSIZE_KEY, '', FONT_SIZES),
  }
}

// 思考块卡片样式归一化：兼容旧版布尔值（true=细描边卡片、false=关）
function normalizeThinkBox(v) {
  if (v === true) return 'border'
  if (v === false) return 'off'
  return THINK_BOX_STYLES.includes(v) ? v : THINK_BOX_DEFAULT
}

// 一次性迁移 ui-beautify（maple-ui-font-settings）旧设置
function migrateLegacyFontSettings() {
  try {
    const raw = localStorage.getItem(FONT_LEGACY_KEY)
    if (!raw) return
    const old = JSON.parse(raw)
    if (!old || typeof old !== 'object') return
    const s = ctxRef.storage
    const writeIf = (key, val, def) => {
      const v = val === undefined ? def : val
      if (v !== undefined && String(v) !== String(def)) s.set(key, v)
    }
    writeIf(FONT_UI_KEY, old.uiFont, FONT_DEFAULTS.uiFont)
    writeIf(FONT_UISIZE_KEY, old.uisize, '')
    writeIf(FONT_TEXTFONT_KEY, old.textFont, '')
    writeIf(FONT_TEXTSIZE_KEY, old.textSize, FONT_DEFAULTS.textSize)
    writeIf(FONT_CODEFONT_KEY, old.codeFont, FONT_DEFAULTS.codeFont)
    writeIf(FONT_CODESIZE_KEY, old.codeSize, '')
    writeIf(FONT_THINKFONT_KEY, old.thinkingFont, '')
    writeIf(FONT_THINKSIZE_KEY, old.thinkSize, FONT_DEFAULTS.thinkSize)
    writeIf(FONT_THINKCOLOR_KEY, old.thinkingColor, FONT_DEFAULTS.thinkingColor)
    writeIf(FONT_THINKBOX_KEY, old.thinkBox, FONT_DEFAULTS.thinkBox)
    writeIf(FONT_TABSIZE_KEY, old.tabSize, '')
    localStorage.removeItem(FONT_LEGACY_KEY)
  } catch {}
}

function ensureFontWebfont(uiFont, codeFont) {
  // 界面/代码字体都不是霞鹜系 → 无需 CDN；是且系统未装 → 引 CDN 兜底
  const needWenkai = /LXGW|WenKai|文楷/i.test(String(uiFont || '')) || /LXGW|WenKai|文楷/i.test(String(codeFont || ''))
  if (!needWenkai) {
    const link = document.getElementById(FONT_WEBFONT_ID)
    if (link) link.remove()
    return
  }
  try {
    if (document.fonts && document.fonts.check('12px "LXGW WenKai"')) return
  } catch {}
  let link = document.getElementById(FONT_WEBFONT_ID)
  if (!link) {
    link = document.createElement('link')
    link.id = FONT_WEBFONT_ID
    link.rel = 'stylesheet'
    link.href = FONT_WEBFONT_URL
    document.head.appendChild(link)
  }
}

// 滑杆节流：拖动中不入库，停手 350ms 落盘（模块级即可，面板是单例）
let thinkTintTimer = null

// 由当前设置生成全部字体 CSS（移植 ui-beautify renderCss，样式 id 用本插件专属）
function renderFontCss(s, opts) {
  // skipSans：与官方聊天字体的仲裁让位态——省略界面字体规则，由官方 inline 栈上屏
  const skipSans = !!(opts && opts.skipSans)
  const rules = []
  // UI 界面字体（全局 chrome：body 与 Tailwind --font-sans 都吃 --dt-font-sans。
  // 必须 !important：主题切换 applyTheme 以 inline style 重写该变量）
  if (String(s.uiFont).trim() && !skipSans) {
    rules.push(`:root{--dt-font-sans:${fontQ(s.uiFont)}${FONT_UI_FALLBACK}!important}`)
  }
  // UI 基准字号（styles.css html{font-size:var(--dt-base-size)}；留空不动）
  if (FONT_SIZES.includes(s.uisize)) {
    rules.push(`:root{--dt-base-size:${Number(s.uisize)}px}`)
  }
  // 聊天正文字体（留空=跟随 UI；作用于线程内容根，全部消息文本继承）
  if (String(s.textFont).trim()) {
    rules.push(`[data-slot="aui_thread-content"]{font-family:${fontQ(s.textFont)}${FONT_UI_FALLBACK}!important}`)
  }
  // 代码块字体：留空 = 不覆盖（保持主题/系统等宽）；非空同理由 !important 压主题
  if (String(s.codeFont).trim()) {
    rules.push(`:root{--dt-font-mono:${fontQ(s.codeFont)}${FONT_MONO_FALLBACK}!important}`)
  }
  // 代码块字号：档位=独立；留空=跟随正文（显式 var，压掉 prose 的 ~0.875em）
  rules.push(
    `.aui-md code,.aui-md pre{font-size:${
      FONT_SIZES.includes(s.codeSize) ? `${Number(s.codeSize)}px` : 'var(--conversation-text-font-size)'
    }!important}`
  )
  // 正文字号：档位=绝对 px（并由正文派生 tool/caption/行高 5 个会话变量）；
  // 留空（「跟随UI」）= 不写任何 --conversation-* 规则 → 核心 :root 的 rem 定义
  // （styles.css:474-478 的 0.8125rem 等）原样生效，随界面「基准」字号 --dt-base-size 一起缩放。
  // ⚠️ 勿再用 px 兜底留空档：会压掉 rem 体系，基准改大而正文纹丝不动。
  if (FONT_SIZES.includes(s.textSize)) {
    const px = Number(s.textSize)
    rules.push(`:root{--conversation-text-font-size:${px}px;--conversation-tool-font-size:${(px * FONT_RATIO.tool).toFixed(2)}px;--conversation-caption-font-size:${(px * FONT_RATIO.caption).toFixed(2)}px;--conversation-line-height:${(px * FONT_RATIO.line).toFixed(2)}px;--conversation-caption-line-height:${(px * FONT_RATIO.captionLine).toFixed(2)}px}`)
  }
  // 标签栏字号（PaneTab 文字 span 硬编码 text-[9px]@pane-tab.tsx:227，容器 font-size 会被其直接声明无视，
  // 须命中内层文字 span：'group/tab' 容器 + 'truncate' 文字 token；留空 = 不覆盖）
  if (FONT_SIZES.includes(s.tabSize)) {
    rules.push(`[data-zone-tabstrip] [class~="group/tab"] [class~="truncate"]{font-size:${Number(s.tabSize)}px!important}`)
  }
  // 思考块：
  //  ① 发灰根因（styles.css:1917）：disclosure 容器带 data-conversation-scaffold
  //     → opacity 0.67(rest)/1(hover)，整块(标题行+正文)一起淡；
  //     标题行另用 --conversation-scaffold-text(64% base)灰字。
  //     对策：容器 opacity:1 无条件压死(hover 态规则随之失效)，颜色按档全后代覆盖。
  //  ② 卡片样式四档（off/border/rail/tint）：描边色随颜色档；描边与底色一律用
  //     base(前景色)/accent 的 color-mix —— base 永远与背景对立，同一公式在
  //     浅色/深色下自动等效，不必写 :root.dark 分支。
  // 选择器必须带 [data-conversation-scaffold] 且 background 要 !important：
  // app 的 styles.css:1947 给这个元素压了 `background: transparent !important`
  // （「脚手架一律透明」），插件画底色会被静默吃掉 —— 表现是「边框有、底色没有」。
  // 同为本源 + 都 !important 时比特异性：(0,2,0) > (0,1,0)，插件胜。
  const THINK = '[data-slot="aui_thinking-disclosure"][data-conversation-scaffold]'
  const think = [
    `${THINK},${THINK} *{opacity:1!important}`,
  ]
  if (s.thinkingColor === 'primary') {
    think.push(`${THINK},${THINK} *{color:var(--ui-text-primary)!important}`)
  } else if (s.thinkingColor === 'secondary') {
    think.push(`${THINK},${THINK} *{color:var(--ui-text-secondary)!important}`)
  }
  // 描边跟所选颜色档走：正文色档最清晰，亮灰档次之，原配色档回落主题描边 token
  const edge =
    s.thinkingColor === 'primary' ? 'color-mix(in srgb,var(--ui-base) 20%,transparent)'
      : s.thinkingColor === 'secondary' ? 'color-mix(in srgb,var(--ui-base) 13%,transparent)'
        : 'var(--ui-stroke-secondary)'
  // 底色浓度 9%/4%：nous 浅色下 ≈ #E0E8F7（Δ ≈ -31/-23/-8）、深色下 ≈ #1A2334。
  // 标定过程（实测反馈）：6%/3%（Δ-22）在白底 + 纸纹下看不见 → 12%/5%（Δ-40）偏浓 → 9%/4% 居中。
  // accent 给色相、base 给明暗——base 永远与背景对立，任何主题都有可辨识的明暗差。
  const tintPct = clampThinkTint(s.thinkTint)
  const accentFill = tintPct <= 0
    ? 'transparent'
    : `color-mix(in srgb,var(--ui-accent) ${tintPct}%,color-mix(in srgb,var(--ui-base) ${thinkTintBase(tintPct)}%,transparent))`
  if (s.thinkBox === 'border') {
    think.push(`${THINK}{border:1px solid ${edge};border-radius:10px;padding:7px 12px 9px;background:color-mix(in srgb,var(--ui-bg-chrome) 45%,transparent)!important}`)
  } else if (s.thinkBox === 'rail') {
    think.push(`${THINK}{border:1px solid color-mix(in srgb,var(--ui-base) 8%,transparent);border-left:3px solid color-mix(in srgb,var(--ui-accent) 70%,var(--ui-base));border-radius:8px;padding:6px 10px 8px 11px;background:${accentFill}!important}`)
  } else if (s.thinkBox === 'tint') {
    think.push(`${THINK}{border:1px solid color-mix(in srgb,var(--ui-accent) 34%,${edge});border-radius:10px;padding:7px 12px 9px;background:${accentFill}!important}`)
  }
  think.push(
    `[data-slot="aui_thinking-body"]{font-style:italic;overscroll-behavior:auto!important;${
      FONT_SIZES.includes(s.thinkSize) ? `font-size:${Number(s.thinkSize)}px;` : 'font-size:var(--conversation-text-font-size);'
    }${String(s.thinkingFont).trim() ? `font-family:${fontQ(s.thinkingFont)}${FONT_UI_FALLBACK}!important;` : ''}}`
  )
  rules.push(think.join('\n'))
  return rules.join('\n')
}

// 官方聊天字体的「用户字体段」提取：applyTheme 把 config desktop.font_family 经
// quoteSingleFamily 写成 `'UserFont', <主题栈>` 注入 root.style inline（单引号开头）；
// 未设置时 inline=主题栈（双引号 `"Segoe WPC"…` 起头，无单引号段）。
// 只取单引号内那一段作为比对基准——主题切换会让主题栈部分变，但用户字体段不变，
// 据此区分「用户编辑聊天字体」与「applyTheme 重绘」，避免误夺 hub 所有权。
// 已知盲区：用户手填双引号完整 CSS stack 会读成空段（漏判为未设置）——power user
// 行为且方向是 hub 赢，符合其装插件意图，接受。
function officialUserFont() {
  try {
    const v = document.documentElement.style.getPropertyValue('--dt-font-sans')
    const m = /^\s*'((?:[^'\\]|\\.)*)'/.exec(v)
    return m ? m[1] : ''
  } catch { return '' }
}

// 上一次观测到的官方用户字体段（模块级真相，冷启动播种当前值）
let officialUserFontLast = null


// 界面字体是否为霞鹜系（默认档）——用于区分「hub 的默认接管」与「用户显式选的自定义字体」
function isWenkaiFont(name) {
  return /LXGW|WenKai|文楷/i.test(String(name || ''))
}

// 生成/更新字体样式表。override：拖「底色浓度」滑杆时的即时预览（只重建样式，不写 storage）
function applyFont(override) {
  const s = override ? { ...readFontSettings(), ...override } : readFontSettings()
  ensureFontWebfont(s.uiFont, s.codeFont)
  let style = document.getElementById(FONT_STYLE_ID)
  if (!style) {
    style = document.createElement('style')
    style.id = FONT_STYLE_ID
    document.head.appendChild(style)
  }
  // 字体归属=最后动作胜（font.winner）：
  //   hub      → 注入界面字体规则（哪怕官方有值；用户最后点的是这里）
  //   official → 省略界面字体规则，官方 inline 上屏；官方清空时 observer 拨回 hub
  // 例外：用户把界面字体改成非文楷的自定义字体，视为 hub 的显式操作，仍注入
  // （否则面板刚选的字体被「让位」静默吞掉）。默认 hub 等价 v3.0.0 前行为。
  const winner = ctxRef ? ctxRef.storage.get(FONT_WINNER_KEY, 'hub') : 'hub'
  const customUi = String(s.uiFont || '').trim() !== '' && !isWenkaiFont(s.uiFont)
  const skipSans = winner === 'official' && !customUi
  style.textContent =
    renderFontCss(s, { skipSans }) + '\n' +
    // tooltip 的 chip 硬编码了 [font-family:Arial,sans-serif]（tooltip.tsx），不走变量继承，
    // 需用 data-slot 定位覆盖，否则提示文字永远系统字体。
    '[data-slot="tooltip-content"] > span{font-family:var(--dt-font-sans) !important}'
}

// 官方聊天字体编辑监听（常驻，register 挂、dispose 摘）：只认「用户字体段」变化——
// 非空出现/改值 = 官方被编辑 → winner=official 让位；
// 由非空变空 = 官方被清空 → winner=hub 恢复文楷；
// 段不变（仅主题栈随切主题重绘）→ 不动 winner，hub 的接管不被误夺。
// 冷启动：register 可能早于官方首绘，首次观测只播种基线不裁决（否则首绘被当成
// 编辑，误夺默认 hub 的所有权）；关态也持续维护基线，保证开关联动判定有参照。
let fontObserver = null
let officialFontSeeded = false
function watchOfficialChatFont() {
  if (fontObserver) return
  officialFontSeeded = false
  officialUserFontLast = null
  fontObserver = new MutationObserver(() => {
    const cur = officialUserFont()
    if (!officialFontSeeded) { officialUserFontLast = cur; officialFontSeeded = true; return }
    if (cur === officialUserFontLast) return
    const wasSet = officialUserFontLast !== ''
    officialUserFontLast = cur
    if (!ctxRef || !ctxRef.storage.get(FONT_KEY, false)) return
    if (cur !== '') {
      ctxRef.storage.set(FONT_WINNER_KEY, 'official')
      applyFont()
    } else if (wasSet) {
      // 官方清空 → 交还文楷（仅在开关开着时；否则本就没有注入）
      ctxRef.storage.set(FONT_WINNER_KEY, 'hub')
      applyFont()
    }
  })
  fontObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['style'] })
}
function unwatchOfficialChatFont() {
  if (fontObserver) { fontObserver.disconnect(); fontObserver = null }
}

function removeFont() {
  const style = document.getElementById(FONT_STYLE_ID)
  if (style) style.remove()
  const link = document.getElementById(FONT_WEBFONT_ID)
  if (link) link.remove()
}

// ── 字体字段控件（模块级定义，见 legacy：放组件体内会每帧换引用导致输入被打断）──
const FONT_PRESETS = [
  'LXGW WenKai', 'LXGW WenKai Mono', 'Maple UI', 'Maple Mono', 'JetBrains Mono', 'Cascadia Mono', 'Consolas', 'Menlo',
  'Source Code Pro', 'Fira Code', 'Microsoft YaHei UI', 'Microsoft YaHei',
  'Segoe UI', 'Segoe UI Variable', 'Noto Sans SC', 'SimHei', 'DengXian', 'KaiTi',
]

// 字体字段：输入框(自由编辑，输入即生效)+「浏览…」展开本机字体列表点选 + 独立字号。
// 不用 datalist(浏览器按输入值过滤，看不到全部)也不走 queryLocalFonts
// (Electron 无权限 handler 会挂起/拒绝)——后端 /fonts 列表是唯一可靠来源。
// 定义在模块顶层——放组件函数体内会每帧产生新函数引用，React 视为不同组件类型而卸载重挂，
// 输入框正在输入时会被打断（表现为打字丢字/失焦）。
const FontField = ({ label, value, onChange, fieldKey, sizeValue, onSizeChange, sizeEmptyLabel, sysFonts, browseField, onToggleBrowse, labels }) => {
  const open = browseField === fieldKey
  const fontList = sysFonts.length ? sysFonts : FONT_PRESETS
  return jsxs('div', {
    className: 'flex flex-col gap-1',
    children: [
      jsxs('div', {
        className: 'flex items-center justify-between gap-2',
        children: [
          jsx('label', { className: 'text-xs font-medium text-(--ui-text-secondary)', children: label }),
          jsx('button', {
            type: 'button',
            title: open ? labels.collapseTitle : labels.browseTitle,
            className:
              'rounded-md border border-(--ui-stroke-secondary) px-1.5 py-0.5 text-[0.6875rem] text-(--ui-text-secondary) transition-colors hover:border-(--ui-accent) hover:text-(--ui-accent)',
            onClick: () => onToggleBrowse(open ? null : fieldKey),
            children: open ? labels.collapse : labels.browse,
          }),
        ],
      }),
      jsxs('div', {
        className: 'flex items-center gap-1.5',
        children: [
          jsx('input', {
            value,
            spellCheck: false,
            placeholder: labels.familyPlaceholder,
            className:
              'min-w-0 flex-1 rounded-md border border-(--ui-stroke-secondary) bg-(--ui-input-bg) px-2 py-1 text-xs text-foreground outline-none focus:border-(--ui-accent)',
            onChange: (e) => onChange(e.target.value),
          }),
          jsx('select', {
            value: sizeValue,
            title: labels.sizeTitle,
            className:
              'shrink-0 rounded-md border border-(--ui-stroke-secondary) bg-(--ui-input-bg) px-1 py-1 text-xs text-foreground outline-none focus:border-(--ui-accent)',
            onChange: (e) => onSizeChange(e.target.value),
            children: [
              sizeEmptyLabel && jsx('option', { value: '', children: sizeEmptyLabel }, ''),
              ...FONT_SIZES.map((id) => jsx('option', { value: id, children: `${id}px` }, id)),
            ],
          }),
        ],
      }),
      open &&
        jsx('div', {
          className:
            'max-h-40 overflow-auto overscroll-contain rounded-md border border-(--ui-stroke-secondary) py-0.5',
          children: fontList.map((f) =>
            jsx('button', {
              type: 'button',
              className:
                'block w-full truncate px-2 py-0.5 text-left text-xs text-(--ui-text-secondary) transition-colors hover:bg-(--ui-accent) hover:text-foreground',
              onClick: () => {
                onChange(f)
                onToggleBrowse(null)
              },
              children: f,
            }, f)
          ),
        }),
    ],
  })
}

// ── 开场标识：DOM 文本替换层（即时生效）+ 原生键落盘（重启后一致）──────────
// 原生 Intro 结构：[data-slot="aui_intro"] 内
//   字标 = p.fit-text（双 span 测量结构，叶子 span 持文字）
//   提示语 = 容器内非 fit-text 的那个 p
// 直接替换叶子文本：fit-text 的自适应字号按真实文本测量，替换后缩放依旧正确。
// ⚠️ 勿回退 CSS 伪元素方案：font-size:0 隐藏原生文字后，::before 继承 0 号字，
//    自定义文字永远不可见（2026-08-23 实测踩坑）。
// MutationObserver 兜两种情况：弹窗打开后才新渲染的 intro、React 重渲染写回的原生文案。
const INTRO_SLOT = '[data-slot="aui_intro"]'
let introObserver = null
const introOriginalTexts = new Map()   // 叶子元素 → 原始文本（切回原生/禁用时恢复）
let introNativeLastWritten = null      // 本插件最后写入的原生键值（区分自己写 / 外部改）
let introUninstallHook = null          // setItem 包装的还原函数
let introModeSubscribers = new Set()   // 面板订阅者（外部改动时刷新弹窗 UI）

function writeIntroNative(value) {
  try {
    localStorage.setItem(INTRO_NATIVE_KEY, value)
    introNativeLastWritten = value
  } catch {
    // storage 不可用时静默跳过，注入层不受影响
  }
}

// ── 与原生设置页双向同步 ──────────────────────────────────────────
// 设置页开关 = 真实 DOM 按钮：#setting-field-appearance.intro-splash 内的
// button[role=switch]（Radix Switch，aria-label=「开场标识」）。
// 读状态 → aria-checked；写状态 → 程序化 click（走原生 onCheckedChange，
// atom/滑块/落盘全部真实更新，与手点等价）。
function findIntroSettingSwitch() {
  const field =
    document.getElementById('setting-field-appearance.intro-splash') ||
    Array.from(document.querySelectorAll('[id^="setting-field-"]')).find((el) =>
      el.querySelector('button[role="switch"][aria-label="开场标识"]')
    )
  return field ? field.querySelector('button[role="switch"]') : null
}

function readIntroSettingState() {
  const btn = findIntroSettingSwitch()
  return btn ? btn.getAttribute('aria-checked') === 'true' : null
}

// hub 档位变化时，若设置页开关可见且状态不一致，程序化点击对齐
function syncIntroSettingSwitch(mode) {
  const btn = findIntroSettingSwitch()
  if (!btn) return
  const wantOn = mode !== 'off'
  if ((btn.getAttribute('aria-checked') === 'true') !== wantOn) {
    btn.click()
  }
}

function handleIntroNativeWrite(key, value) {
  if (key !== INTRO_NATIVE_KEY) return
  if (value === introNativeLastWritten) {
    // 自己刚写的：记账已同步，无需反应
    return
  }
  // 新两档语义：开关只控制显隐，不改变 introMode（native/custom 保持不变）。
  // false = 暂时隐藏注入层；true = 按 hub 当前档位恢复。
  introNativeLastWritten = value
  const current = ctxRef ? ctxRef.storage.get(INTRO_MODE_KEY, 'native') : 'native'
  if (value === 'false') {
    stopIntroObserver()
    introRestore()
    const style = document.getElementById(INTRO_STYLE_ID)
    if (style) style.remove()
  } else {
    applyIntroMode(current)
  }
  // 推送给面板的语义 = 最终开/关状态：官方页切关推 'off'（面板跟平到「关」），
  // 切开推当前档位（面板跟平到存档档位）
  introModeSubscribers.forEach((cb) => cb(value === 'false' ? 'off' : current))
}

function installIntroStorageHook() {
  if (introUninstallHook) return
  const rawSetItem = Storage.prototype.setItem
  Storage.prototype.setItem = function (key, value) {
    rawSetItem.call(this, key, value)
    try { handleIntroNativeWrite(String(key), String(value)) } catch {}
  }
  introUninstallHook = () => { Storage.prototype.setItem = rawSetItem }
}

function unsubscribeIntroMode(cb) {
  introModeSubscribers.delete(cb)
}

// 面板实例订阅（弹窗开时加入）：外部在设置页切开关时，浮窗高亮跟着走
function subscribeIntroMode(cb) {
  introModeSubscribers.add(cb)
  return unsubscribeIntroMode
}

function introLeafSpans(root) {
  // 字标叶子 span：没有元素子节点的 span（外层 span 只包内层 span，不算叶子）
  return Array.from(root.querySelectorAll('p.fit-text span')).filter((s) => !s.querySelector('*'))
}

function introWrite(headline, tagline) {
  const root = document.querySelector(INTRO_SLOT)
  if (!root || (!headline && !tagline)) return
  if (headline) {
    for (const el of introLeafSpans(root)) {
      if (!introOriginalTexts.has(el)) introOriginalTexts.set(el, el.textContent)
      if (el.textContent !== headline) el.textContent = headline
    }
  }
  if (tagline) {
    const p = root.querySelector('p:not(.fit-text)')
    if (p) {
      if (!introOriginalTexts.has(p)) introOriginalTexts.set(p, p.textContent)
      if (p.textContent !== tagline) p.textContent = tagline
    }
  }
}

function introRestore() {
  for (const [el, text] of introOriginalTexts) {
    if (el.isConnected && el.textContent !== text) el.textContent = text
  }
  introOriginalTexts.clear()
}

function startIntroObserver() {
  if (introObserver) return
  let scheduled = false
  introObserver = new MutationObserver(() => {
    if (scheduled) return
    scheduled = true
    queueMicrotask(() => {
      scheduled = false
      if (!ctxRef || ctxRef.storage.get(INTRO_MODE_KEY, 'native') !== 'custom') return
      introWrite(
        String(ctxRef.storage.get(INTRO_HEADLINE_KEY, '')).trim(),
        String(ctxRef.storage.get(INTRO_TAGLINE_KEY, '')).trim()
      )
    })
  })
  introObserver.observe(document.body, { childList: true, subtree: true, characterData: true })
}

function stopIntroObserver() {
  if (introObserver) {
    introObserver.disconnect()
    introObserver = null
  }
}

function applyIntroMode(mode) {
  // 官方 atom 通道（优先）：直接驱动 $introSplash（官方订阅链：设置页 UI/React
  // 渲染/落盘全同步）。必须先记账再 set——atom.set 会经官方 persistBoolean 落盘
  // 触发 setItem 钩子，后记账会被误判为外部改动。
  const introAtom = officialStores && officialStores.introSplash
  if (introAtom) {
    try {
      introNativeLastWritten = mode === 'off' ? 'false' : 'true'
      introAtom.set(mode !== 'off')
      if (mode === 'custom') {
        const headline = ctxRef ? String(ctxRef.storage.get(INTRO_HEADLINE_KEY, '')).trim() : ''
        const tagline = ctxRef ? String(ctxRef.storage.get(INTRO_TAGLINE_KEY, '')).trim() : ''
        introWrite(headline, tagline)   // 当前已在渲染的 intro 立即替换
        startIntroObserver()            // 之后新渲染 / 被写回的交给 observer
      } else {
        stopIntroObserver()
        introRestore()
      }
      return
    } catch {
      // atom 调用失败 → 落入下方 CSS 兜底路径
    }
  }
  // ── 兜底路径（atom 未识别/抛错）：CSS 注入隐藏 + 程序化点击同步官方设置页 ──
  let style = document.getElementById(INTRO_STYLE_ID)
  if (mode === 'off') {
    if (!style) {
      style = document.createElement('style')
      style.id = INTRO_STYLE_ID
      document.head.appendChild(style)
    }
    style.textContent = INTRO_SLOT + '{display:none !important}'
  } else if (style) {
    style.remove()
  }

  if (mode === 'custom') {
    const headline = ctxRef ? String(ctxRef.storage.get(INTRO_HEADLINE_KEY, '')).trim() : ''
    const tagline = ctxRef ? String(ctxRef.storage.get(INTRO_TAGLINE_KEY, '')).trim() : ''
    introWrite(headline, tagline)   // 当前已在渲染的 intro 立即替换
    startIntroObserver()            // 之后新渲染 / 被写回的交给 observer
  } else {
    stopIntroObserver()
    introRestore()
  }

  // 原生键落盘：原生/自定义 = 开；关闭 = 关。先记账再写键，避免钩子误判。
  introNativeLastWritten = mode === 'off' ? 'false' : 'true'
  writeIntroNative(mode === 'off' ? 'false' : 'true')
  // 设置页开关若正开着，程序化点击对齐（走原生 onCheckedChange，atom+滑块真实更新）
  syncIntroSettingSwitch(mode)
}

function resetIntroOnDispose() {
  if (introUninstallHook) {
    introUninstallHook()
    introUninstallHook = null
  }
  introModeSubscribers.clear()
  stopIntroObserver()
  introRestore()
  const style = document.getElementById(INTRO_STYLE_ID)
  if (style) style.remove()
  // 禁用插件后恢复原生显示
  try {
    localStorage.setItem(INTRO_NATIVE_KEY, 'true')
  } catch {}
}

// ── 界面缩放（直接驱动 Hermes 原生缩放，不另起 DOM 层）──────────────
// 与 Settings → Appearance → 界面缩放、View 菜单同一套机制（main process 拥有并持久化）。
// 通过 window.hermesDesktop.zoom 读写，onChanged 让原生侧改动（View 菜单 / Cmd±）实时回灌 UI。
function getNativeZoom() {
  const z = window.hermesDesktop && window.hermesDesktop.zoom
  if (!z) return null
  return z.get().then((r) => r && typeof r.percent === 'number' ? r.percent : null)
    .catch(() => null)
}

function setNativeZoom(percent) {
  const z = window.hermesDesktop && window.hermesDesktop.zoom
  if (!z) return
  z.setPercent(percent)
}

// ── 模块级常驻监听：缩放变化无论如何都回灌 ──────────────────────────
// 关键修复：原生 onChanged 是 per-renderer 的 ipcRenderer.on，主进程每次缩放
// 都会广播给「当前挂了监听的渲染进程」。若只在面板挂载时注册，则弹窗关闭期间
// （尤其在 Settings 里改缩放时）收不到广播 → 反向同步断。故在插件加载时注册常驻
// 监听，缓存到 liveZoom，面板打开时再 seed + 订阅模块级更新。
let liveZoom = null                         // 当前原生缩放 percent（模块级单一真相）
let zoomSubscribers = new Set()             // 面板实例订阅者（弹窗开时加入）
let zoomUnsubscribeNative = null            // 原生常驻监听的退订函数

function handleNativeZoomChange(percent) {
  if (typeof percent !== 'number') return
  liveZoom = percent
  zoomSubscribers.forEach((cb) => cb(percent))
}

// 插件加载时调用：挂原生常驻监听（与弹窗开关无关）
function startNativeZoomWatch() {
  if (zoomUnsubscribeNative) return
  const z = window.hermesDesktop && window.hermesDesktop.zoom
  if (!z) return
  // 立即拉一次当前值，保证 liveZoom 有初始真相
  if (typeof z.get === 'function') {
    z.get().then((r) => { if (r && typeof r.percent === 'number') liveZoom = r.percent }).catch(() => {})
  }
  if (typeof z.onChanged === 'function') {
    zoomUnsubscribeNative = z.onChanged((payload) => {
      if (payload && typeof payload.percent === 'number') handleNativeZoomChange(payload.percent)
    })
  }
}

// 面板实例订阅模块级变化（弹窗开时调用，关时退订）
function subscribeNativeZoom(cb) {
  zoomSubscribers.add(cb)
  // 订阅即刻同步一次当前缓存值，避免弹窗打开时与 liveZoom 脱节
  if (liveZoom != null) cb(liveZoom)
  return () => { zoomSubscribers.delete(cb) }
}

// ── 主题模式（明亮/暗色/跟随系统）─────────────────────────────────
// 官方机制（themes/context.tsx）：mode 存 per-profile localStorage——
//   default profile 写全局键 hermes-desktop-mode-v1；命名 profile 写
//   hermes-desktop-profile-modes-v1 record。官方监听 storage 事件
// （APPEARANCE_KEYS），setItem 即全窗口实时生效——与 zoom 同款官方管道。
const MODE_GLOBAL_KEY = 'hermes-desktop-mode-v1'
const MODE_RECORD_KEY = 'hermes-desktop-profile-modes-v1'
const THEME_MODES = [
  { id: 'light', labelKey: 'theme.modeLight' },
  { id: 'dark', labelKey: 'theme.modeDark' },
  { id: 'system', labelKey: 'theme.modeSystem' }
]

function readThemeMode() {
  try {
    // 活跃 profile 键与官方 ThemeProvider 一致（hermes-desktop-active-profile-v1）；
    // 旧键 hermes-active-profile 在官方代码中不存在，曾导致多 profile 下模式误读 default 槽
    const profile = localStorage.getItem('hermes-desktop-active-profile-v1') || 'default'
    if (profile !== 'default') {
      const rec = JSON.parse(localStorage.getItem(MODE_RECORD_KEY) || '{}')
      if (rec[profile]) return rec[profile]
    }
    return localStorage.getItem(MODE_GLOBAL_KEY) || 'system'
  } catch {
    return 'system'
  }
}

function writeThemeMode(mode) {
  try {
    // 与 readThemeMode 同键，跟官方 ThemeProvider 的 Xt setter 对齐
    const profile = localStorage.getItem('hermes-desktop-active-profile-v1') || 'default'
    if (profile === 'default') {
      // 同键重写也会触发原生 storage 监听（同窗口 setItem 不自动派发，手动补发）
      localStorage.setItem(MODE_GLOBAL_KEY, mode)
      window.dispatchEvent(new StorageEvent('storage', { key: MODE_GLOBAL_KEY }))
    } else {
      const rec = JSON.parse(localStorage.getItem(MODE_RECORD_KEY) || '{}')
      rec[profile] = mode
      localStorage.setItem(MODE_RECORD_KEY, JSON.stringify(rec))
      window.dispatchEvent(new StorageEvent('storage', { key: MODE_RECORD_KEY }))
    }
  } catch {}
}

function resolvedDark() {
  return document.documentElement.classList.contains('dark') ||
    document.documentElement.dataset.hermesMode === 'dark'
}

// ── 移植项读写 ────────────────────────────────────────────────────
function readSimpleKey(key, fallback, valid) {
  try {
    const v = localStorage.getItem(key)
    return v && valid.includes(v) ? v : fallback
  } catch { return fallback }
}

function writeSimpleKey(key, value) {
  try {
    localStorage.setItem(key, value)
    window.dispatchEvent(new StorageEvent('storage', { key }))
  } catch {}
}

// ══ 移植自 bbvdf/hermes-appearance-hub-legacy：完成提示音 ═══════════════
// 下面整段（常量 + Web Audio 合成器 + 14 个音效配方 + 响度归一化 + 自定义音频）
// 与 legacy 仓库 desktop/plugin.js 的 sound 模块逐字一致，逻辑未改；仅面板 UI 重写为
// 本仓库的行式风格（ControlRow / hover 说明带）。

// ── 完成提示音（sound）：移植 app 内置合成器 + 可调音量档位 ──────────────
// 内置实现在 apps/desktop/src/lib/completion-sound.ts：Web Audio 即时合成，
// 每个音的包络峰值只有 0.02~0.07，再乘 master 0.48、dry 0.88 —— 输出峰值约
// -31 dBFS，比系统通知音小 20+ dB。这就是「提示音声音小」的根因：它是刻意做
// 成氛围级的轻声，而不是通知音；app 内部也没有音量项。
// 插件带同一套合成器，唯一区别是 master 增益可调（0.5×~4×，1× = 内置原响度）。
const SOUND_KEY = 'sound.enabled'            // 由本插件播放完成提示音
const SOUND_VARIANT_KEY = 'sound.variantId'  // 选中的内置音效（1-14）
const SOUND_VOLUME_KEY = 'sound.volumeStep'  // 音量档位索引
const SOUND_BASE_GAIN = 0.48                 // 与内置 master.gain 对齐
const SOUND_VOLUME_STEPS = [1, 3, 6, 9]
const SOUND_VOLUME_OPTIONS = [
  { id: '0', label: '1×' },
  { id: '1', label: '3×' },
  { id: '2', label: '6×' },
  { id: '3', label: '9×' }
]
const SOUND_DEFAULT_STEP = 2 // 默认 6×（档位索引 2）：内置原响度就是用户说的「小」
const SOUND_BTN_CLASS =
  'flex h-7 shrink-0 cursor-pointer items-center gap-1 rounded-md border border-(--ui-stroke-secondary) px-2 text-[0.625rem] hover:bg-(--chrome-action-hover)'
const SOUND_BTN_STYLE = { color: 'var(--ui-text-secondary)' }
const SOUND_SELECT_STYLE = {
  background: 'var(--ui-bg-elevated)',
  border: '1px solid var(--ui-stroke-secondary)',
  color: 'var(--ui-text-primary)'
}

// 音高（十二平均律），与内置同一组常数
const SOUND_NOTES = {
  A2: 110, A3: 220, A4: 440, A5: 880, B5: 987.77, C3: 130.81, C4: 261.63,
  E4: 329.63, E5: 659.25, E6: 1318.51, G4: 392, G5: 783.99, C5: 523.25, C6: 1046.5
}

// 包络振荡器：线性起音 + 指数衰减（避免归零时的咔哒声）
function cueVoice(ac, master, t0, spec) {
  const osc = ac.createOscillator()
  const env = ac.createGain()
  const start = t0 + (spec.start ?? 0)
  const peak = spec.gain ?? 0.5
  const attack = spec.attack ?? 0.006
  const end = start + spec.dur
  osc.type = spec.type ?? 'sine'
  osc.frequency.setValueAtTime(spec.freq, start)
  env.gain.setValueAtTime(0.0001, start)
  env.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), start + attack)
  env.gain.exponentialRampToValueAtTime(0.0001, end)
  osc.connect(env)
  env.connect(master)
  osc.start(start)
  osc.stop(end + 0.02)
}

// 软拨弦：三角波短促击弦 + 上滑音
function cuePluck(ac, master, t0, spec) {
  const osc = ac.createOscillator()
  const env = ac.createGain()
  const start = t0 + (spec.start ?? 0)
  const attack = spec.attack ?? 0.004
  const glide = spec.glide ?? 0.16
  const end = start + spec.decay
  osc.type = 'triangle'
  osc.frequency.setValueAtTime(spec.freqFrom, start)
  osc.frequency.exponentialRampToValueAtTime(spec.freqTo, start + glide)
  env.gain.setValueAtTime(0.0001, start)
  env.gain.exponentialRampToValueAtTime(Math.max(spec.gain, 0.0002), start + attack)
  env.gain.exponentialRampToValueAtTime(0.0001, end)
  osc.connect(env)
  env.connect(master)
  osc.start(start)
  osc.stop(end + 0.02)
}

// 慢起泛音绽放
function cueBloom(ac, master, t0, spec) {
  const osc = ac.createOscillator()
  const env = ac.createGain()
  const start = t0 + (spec.start ?? 0)
  const hold = spec.hold ?? 0.08
  const end = start + spec.attack + hold + spec.decay
  osc.type = spec.type ?? 'sine'
  osc.frequency.setValueAtTime(spec.freq, start)
  if (spec.freqTo) osc.frequency.exponentialRampToValueAtTime(spec.freqTo, start + spec.attack + hold * 0.6)
  osc.detune.setValueAtTime(spec.detune ?? 0, start)
  env.gain.setValueAtTime(0.0001, start)
  env.gain.exponentialRampToValueAtTime(Math.max(spec.gain, 0.0002), start + spec.attack)
  env.gain.setValueAtTime(Math.max(spec.gain, 0.0002), start + spec.attack + hold)
  env.gain.exponentialRampToValueAtTime(0.0001, end)
  osc.connect(env)
  env.connect(master)
  osc.start(start)
  osc.stop(end + 0.02)
}

function cueNoiseSource(ac, seconds) {
  const length = Math.floor(ac.sampleRate * seconds)
  const buffer = ac.createBuffer(1, length, ac.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1
  const source = ac.createBufferSource()
  source.buffer = buffer
  return source
}

// 带通噪声：一缕「空气感」
function cueAirPuff(ac, master, t0, spec) {
  const source = cueNoiseSource(ac, 0.12)
  const filter = ac.createBiquadFilter()
  const env = ac.createGain()
  const start = t0 + (spec.start ?? 0)
  const end = start + spec.decay
  filter.type = 'bandpass'
  filter.frequency.setValueAtTime(spec.freq, start)
  filter.Q.setValueAtTime(spec.q ?? 1.2, start)
  env.gain.setValueAtTime(0.0001, start)
  env.gain.exponentialRampToValueAtTime(Math.max(spec.gain, 0.0002), start + 0.018)
  env.gain.exponentialRampToValueAtTime(0.0001, end)
  source.connect(filter)
  filter.connect(env)
  env.connect(master)
  source.start(start)
  source.stop(end + 0.02)
}

// 噪声扫频：轻快的「咻」声
function cueWhoosh(ac, master, t0, spec) {
  const source = cueNoiseSource(ac, 0.4)
  const filter = ac.createBiquadFilter()
  const env = ac.createGain()
  const start = t0 + (spec.start ?? 0)
  const end = start + spec.decay
  filter.type = 'bandpass'
  filter.frequency.setValueAtTime(spec.freqFrom, start)
  filter.frequency.exponentialRampToValueAtTime(spec.freqTo, end)
  filter.Q.setValueAtTime(spec.q ?? 0.8, start)
  env.gain.setValueAtTime(0.0001, start)
  env.gain.exponentialRampToValueAtTime(Math.max(spec.gain, 0.0002), start + 0.03)
  env.gain.exponentialRampToValueAtTime(0.0001, end)
  source.connect(filter)
  filter.connect(env)
  env.connect(master)
  source.start(start)
  source.stop(end + 0.02)
}

// 音高滑扫：调制解调器 / 科幻音
function cueSweep(ac, master, t0, spec) {
  const osc = ac.createOscillator()
  const env = ac.createGain()
  const start = t0 + (spec.start ?? 0)
  const attack = spec.attack ?? 0.003
  const end = start + spec.decay
  osc.type = spec.type ?? 'triangle'
  osc.frequency.setValueAtTime(spec.freqFrom, start)
  osc.frequency.exponentialRampToValueAtTime(spec.freqTo, end - 0.02)
  env.gain.setValueAtTime(0.0001, start)
  env.gain.exponentialRampToValueAtTime(Math.max(spec.gain, 0.0002), start + attack)
  env.gain.exponentialRampToValueAtTime(0.0001, end)
  osc.connect(env)
  env.connect(master)
  osc.start(start)
  osc.stop(end + 0.02)
}

let cueReverbImpulse = null

// 一点点混响湿声，让音色待在房间里而不是铁罐里（脉冲响应生成一次并缓存）
function cueReverb(ac) {
  if (!cueReverbImpulse) {
    const seconds = 1.6
    const length = Math.floor(ac.sampleRate * seconds)
    cueReverbImpulse = ac.createBuffer(2, length, ac.sampleRate)
    for (let channel = 0; channel < 2; channel += 1) {
      const data = cueReverbImpulse.getChannelData(channel)
      for (let i = 0; i < length; i += 1) {
        data[i] = (Math.random() * 2 - 1) * (1 - i / length) ** 2.6
      }
    }
  }
  const convolver = ac.createConvolver()
  convolver.buffer = cueReverbImpulse
  return convolver
}

// 14 个内置音效（与 Hermes 设置里的同名同配方，逐个移植）
const SOUND_VARIANTS = [
  {
    id: 1,
    name: 'Two-note comfort',
    play: (ac, master, t0) => {
      cueVoice(ac, master, t0, { freq: SOUND_NOTES.E4, dur: 0.22, gain: 0.05, attack: 0.03, type: 'sine' })
      cueVoice(ac, master, t0 + 0.08, { freq: SOUND_NOTES.C4, dur: 0.52, gain: 0.07, attack: 0.08, type: 'sine' })
      cueVoice(ac, master, t0 + 0.08, { freq: SOUND_NOTES.C3, dur: 0.46, gain: 0.02, attack: 0.1, type: 'sine' })
    }
  },
  {
    id: 2,
    name: 'Glass ping',
    play: (ac, master, t0) => {
      cueVoice(ac, master, t0, { freq: SOUND_NOTES.C6, dur: 0.55, gain: 0.032, attack: 0.002, type: 'sine' })
      cueVoice(ac, master, t0 + 0.01, { freq: SOUND_NOTES.E5, dur: 0.42, gain: 0.018, attack: 0.004, type: 'sine' })
      cueAirPuff(ac, master, t0, { freq: 3200, gain: 0.004, decay: 0.1, q: 1.4 })
    }
  },
  {
    id: 3,
    name: 'Soft marimba',
    play: (ac, master, t0) => {
      cuePluck(ac, master, t0, { freqFrom: SOUND_NOTES.E5, freqTo: SOUND_NOTES.G5, gain: 0.03, decay: 0.14, glide: 0.08 })
      cueBloom(ac, master, t0 + 0.04, { freq: SOUND_NOTES.C5, gain: 0.028, attack: 0.08, hold: 0.04, decay: 0.62 })
      cueBloom(ac, master, t0 + 0.06, { freq: SOUND_NOTES.G4, gain: 0.014, attack: 0.12, hold: 0.06, decay: 0.55 })
    }
  },
  {
    id: 4,
    name: 'Tri-tone message',
    play: (ac, master, t0) => {
      cueVoice(ac, master, t0, { freq: SOUND_NOTES.C6, dur: 0.14, gain: 0.045, attack: 0.004, type: 'sine' })
      cueVoice(ac, master, t0 + 0.1, { freq: SOUND_NOTES.A5, dur: 0.16, gain: 0.04, attack: 0.004, type: 'sine' })
      cueVoice(ac, master, t0 + 0.2, { freq: SOUND_NOTES.G5, dur: 0.22, gain: 0.035, attack: 0.006, type: 'sine' })
    }
  },
  {
    id: 5,
    name: 'Airy whoosh',
    play: (ac, master, t0) => {
      cueWhoosh(ac, master, t0, { freqFrom: 4200, freqTo: 900, gain: 0.022, decay: 0.28, q: 0.7 })
      cueVoice(ac, master, t0 + 0.12, { freq: SOUND_NOTES.A5, dur: 0.35, gain: 0.02, attack: 0.02, type: 'sine' })
    }
  },
  {
    id: 6,
    name: 'Discovery cluster',
    play: (ac, master, t0) => {
      const clusterDetunes = [-14, -5, 0, 7, 12]
      clusterDetunes.forEach((detune, i) => {
        cueBloom(ac, master, t0 + i * 0.03, {
          freq: SOUND_NOTES.A3, gain: 0.012, attack: 0.38, hold: 0.12, decay: 1.05, detune
        })
      })
      cueBloom(ac, master, t0 + 0.1, { freq: SOUND_NOTES.E4, gain: 0.008, attack: 0.45, hold: 0.08, decay: 0.9, detune: 3 })
    }
  },
  {
    id: 7,
    name: 'Systems online',
    play: (ac, master, t0) => {
      cueVoice(ac, master, t0, { freq: SOUND_NOTES.C5, dur: 0.16, gain: 0.04, attack: 0.006, type: 'sine' })
      cueVoice(ac, master, t0 + 0.09, { freq: SOUND_NOTES.G5, dur: 0.28, gain: 0.042, attack: 0.008, type: 'sine' })
      cueVoice(ac, master, t0 + 0.09, { freq: SOUND_NOTES.C4, dur: 0.24, gain: 0.012, attack: 0.01, type: 'sine' })
    }
  },
  {
    id: 8,
    name: 'IBM terminal',
    play: (ac, master, t0) => {
      cueVoice(ac, master, t0, { freq: SOUND_NOTES.B5, dur: 0.12, gain: 0.038, attack: 0.002, type: 'square' })
      cueVoice(ac, master, t0 + 0.14, { freq: SOUND_NOTES.E5, dur: 0.1, gain: 0.028, attack: 0.002, type: 'square' })
    }
  },
  {
    id: 9,
    name: 'Modem chirp',
    play: (ac, master, t0) => {
      cueSweep(ac, master, t0, { freqFrom: 320, freqTo: 2200, gain: 0.024, decay: 0.16, type: 'triangle' })
      cueSweep(ac, master, t0 + 0.1, { freqFrom: 480, freqTo: 1400, gain: 0.014, decay: 0.12, type: 'sine' })
    }
  },
  {
    id: 10,
    name: 'Wind chimes',
    play: (ac, master, t0) => {
      const chimes = [SOUND_NOTES.G5, SOUND_NOTES.C6, SOUND_NOTES.E5, SOUND_NOTES.A5]
      chimes.forEach((frequency, i) => {
        cueVoice(ac, master, t0 + i * 0.13, {
          freq: frequency, dur: 0.72, gain: 0.028 - i * 0.003, attack: 0.003, type: 'sine'
        })
      })
    }
  },
  {
    id: 11,
    name: 'Singing bowl',
    play: (ac, master, t0) => {
      cueBloom(ac, master, t0, { freq: SOUND_NOTES.A3, gain: 0.022, attack: 0.58, hold: 0.16, decay: 1.35 })
      cueBloom(ac, master, t0 + 0.08, { freq: SOUND_NOTES.E4, gain: 0.01, attack: 0.62, hold: 0.12, decay: 1.2, detune: 4 })
      cueBloom(ac, master, t0 + 0.14, { freq: SOUND_NOTES.A4, gain: 0.006, attack: 0.68, hold: 0.08, decay: 1.05, detune: -3 })
    }
  },
  {
    id: 12,
    name: 'Harp lift',
    play: (ac, master, t0) => {
      const notes = [SOUND_NOTES.C5, SOUND_NOTES.E5, SOUND_NOTES.G5, SOUND_NOTES.C6]
      notes.forEach((frequency, i) => {
        cueVoice(ac, master, t0 + i * 0.075, {
          freq: frequency, dur: 0.38, gain: 0.034 - i * 0.004, attack: 0.012, type: 'sine'
        })
      })
      cueBloom(ac, master, t0 + 0.2, { freq: SOUND_NOTES.C4, gain: 0.01, attack: 0.18, hold: 0.06, decay: 0.7 })
    }
  },
  {
    id: 13,
    name: 'Sonar ping',
    play: (ac, master, t0) => {
      cueVoice(ac, master, t0, { freq: SOUND_NOTES.A2, dur: 0.95, gain: 0.036, attack: 0.008, type: 'sine' })
      cueVoice(ac, master, t0 + 0.42, { freq: SOUND_NOTES.A3, dur: 0.55, gain: 0.014, attack: 0.01, type: 'sine' })
      cueAirPuff(ac, master, t0, { freq: 600, gain: 0.005, decay: 0.2, q: 0.5 })
    }
  },
  {
    id: 14,
    name: 'Music box',
    play: (ac, master, t0) => {
      const notes = [SOUND_NOTES.E6, SOUND_NOTES.C6, SOUND_NOTES.G5, SOUND_NOTES.E5]
      notes.forEach((frequency, i) => {
        cuePluck(ac, master, t0 + i * 0.09, {
          freqFrom: frequency, freqTo: frequency * 0.998, gain: 0.02 - i * 0.002, decay: 0.2, glide: 0.06
        })
      })
    }
  }
]

// ── 响度归一化 ────────────────────────────────────────────────────────
// 上面 14 个音效是照抄内置的原始配方，而它们的重叠峰值差异高达 17 dB
// （最响 Two-note comfort 0.140，最轻 Airy whoosh 0.020）——所以同一档位下
// 换音效会明显忽大忽小。下表是每个音效「同时发声的包络峰值之和」的最大值
// （离线扫描所得，扫描脚本见插件仓库的 verification 说明），用它把每个音效
// 提到最响音效的水平：换音效响度一致，且 9 倍档仍是同一绝对响度。
const SOUND_RAW_PEAKS = {
  1: 0.14, 2: 0.05, 3: 0.072, 4: 0.085, 5: 0.02, 6: 0.068, 7: 0.094,
  8: 0.038, 9: 0.038, 10: 0.094, 11: 0.038, 12: 0.122, 13: 0.05, 14: 0.054
}
const SOUND_REFERENCE_PEAK = 0.14 // 最响音效（Two-note comfort）作为统一基准

function soundNormGain(id) {
  const peak = SOUND_RAW_PEAKS[id]
  return peak && peak > 0 ? SOUND_REFERENCE_PEAK / peak : 1
}

// ── 音源：内置预设 / 自定义音频文件；以及「接管」内置音 ────────────────
const SOUND_SOURCE_KEY = 'sound.source'          // 'preset' | 'custom'
const SOUND_CUSTOM_PATH_KEY = 'sound.customPath'
const SOUND_CUSTOM_NAME_KEY = 'sound.customName'
const SOUND_TAKEOVER_KEY = 'sound.takeover'
// app 的全局静音键（src/store/haptics.ts）：内置完成音、思考音、唤醒音、触觉反馈都看它。
// 那个 atom 只在 app 启动时读一次 → 写完键必须重载窗口（Ctrl+R）才生效，面板要如实说明。
const NATIVE_MUTE_KEY = 'hermes.desktop.hapticsMuted'

function nativeSoundMuted() {
  try {
    return localStorage.getItem(NATIVE_MUTE_KEY) === 'true'
  } catch {
    return false
  }
}

function writeNativeSoundMuted(on) {
  try {
    localStorage.setItem(NATIVE_MUTE_KEY, on ? 'true' : 'false')
  } catch {}
}

let customBuffer = null
let customLoadedPath = null
let customPeak = 1

// 读本地音频（桥的 data URL，默认上限 16 MiB）→ 解码 → 扫峰值。
// 峰值用于归一化：自定义文件和内置预设走同一个基准（SOUND_REFERENCE_PEAK），
// 所以同一档位下响度对得上，换文件不会突然炸耳或细如蚊呐。
async function loadCustomSound(path) {
  const desktop = window.hermesDesktop
  if (!desktop || typeof desktop.readFileDataUrl !== 'function') {
    throw new Error('desktop bridge unavailable')
  }
  const dataUrl = await desktop.readFileDataUrl(path)
  const comma = String(dataUrl).indexOf(',')
  const base64 = comma >= 0 ? String(dataUrl).slice(comma + 1) : String(dataUrl)
  const bin = atob(base64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i)
  const ac = cueAudioContext()
  if (!ac) throw new Error('no audio context')
  const buffer = await ac.decodeAudioData(bytes.buffer)
  let peak = 0
  for (let c = 0; c < buffer.numberOfChannels; c += 1) {
    const data = buffer.getChannelData(c)
    for (let i = 0; i < data.length; i += 1) {
      const v = data[i] < 0 ? -data[i] : data[i]
      if (v > peak) peak = v
    }
  }
  customBuffer = buffer
  customPeak = peak > 0.0001 ? peak : 1
  customLoadedPath = path
  return buffer
}

function playCustomCue(step) {
  const ac = cueAudioContext()
  if (!ac || !customBuffer) return false
  const source = ac.createBufferSource()
  source.buffer = customBuffer
  const gain = ac.createGain()
  gain.gain.setValueAtTime(
    SOUND_BASE_GAIN * SOUND_VOLUME_STEPS[resolveSoundStep(step)] * (SOUND_REFERENCE_PEAK / customPeak),
    ac.currentTime
  )
  source.connect(gain)
  gain.connect(ac.destination)
  source.start()
  return true
}

function customFileName(path) {
  return String(path || '').split(/[\\/]/).pop() || ''
}

// 播放完成音：自定义优先，读不到就回退内置预设（绝不让用户静默丢音）
async function playCompletionCue() {
  if (!ctxRef || !ctxRef.storage.get(SOUND_KEY, false)) return
  const step = ctxRef.storage.get(SOUND_VOLUME_KEY, SOUND_DEFAULT_STEP)
  if (ctxRef.storage.get(SOUND_SOURCE_KEY, 'preset') === 'custom') {
    const path = ctxRef.storage.get(SOUND_CUSTOM_PATH_KEY, '')
    if (path) {
      try {
        if (!customBuffer || customLoadedPath !== path) await loadCustomSound(path)
        if (playCustomCue(step)) return
      } catch {}
    }
  }
  playCue(ctxRef.storage.get(SOUND_VARIANT_KEY, 1), step)
}

function resolveSoundVariant(id) {
  const v = Number(id)
  return SOUND_VARIANTS.some((s) => s.id === v) ? v : 1
}

function resolveSoundStep(i) {
  const v = Number(i)
  return Number.isInteger(v) && v >= 0 && v < SOUND_VOLUME_STEPS.length ? v : SOUND_DEFAULT_STEP
}

// 播放链路与内置一致（voices → master → 低通 → dry + 混响湿声 → 输出），
// 只有 master 增益换成「内置基准 × 档位」，所以 1× 与内置同响、4× 明显更响。
let cueCtx = null

function cueAudioContext() {
  try {
    if (!cueCtx) cueCtx = new (window.AudioContext || window.webkitAudioContext)()
  } catch {
    return null
  }
  if (cueCtx.state === 'suspended') cueCtx.resume().catch(() => {})
  return cueCtx
}

function playCue(variantId, step) {
  const ac = cueAudioContext()
  if (!ac) return
  const variant = SOUND_VARIANTS.find((s) => s.id === resolveSoundVariant(variantId))
  if (!variant) return
  const gainScale = SOUND_BASE_GAIN * SOUND_VOLUME_STEPS[resolveSoundStep(step)] * soundNormGain(variant.id)
  const master = ac.createGain()
  const tone = ac.createBiquadFilter()
  tone.type = 'lowpass'
  tone.frequency.setValueAtTime(3800, ac.currentTime)
  tone.Q.setValueAtTime(0.32, ac.currentTime)
  master.gain.setValueAtTime(gainScale, ac.currentTime)
  master.connect(tone)
  const dry = ac.createGain()
  dry.gain.setValueAtTime(0.88, ac.currentTime)
  tone.connect(dry)
  dry.connect(ac.destination)
  const reverb = cueReverb(ac)
  const wet = ac.createGain()
  wet.gain.setValueAtTime(0.34, ac.currentTime)
  tone.connect(reverb)
  reverb.connect(wet)
  wet.connect(ac.destination)
  variant.play(ac, master, ac.currentTime + 0.01)
}

// ── 悬浮输入框 atom 的静态源码指纹反解 ──────────────────────────────
// 官方 $composerPopoutGesturesEnabled 无 persist 订阅（翻转零写入），行为探针
// 与其他零写入 atom 撞车不可靠；但它从键名到导出的变量链是固定的：
//   mn=`键串` → _n=P(mn,!0) → wn=t(_n) → export { wn as X }
// 键串在全 chunk 唯一，反解稳定。返回导出名或 null（失败退回行为认领/直写）。
function findGesturesAtomExport(src) {
  try {
    const key = POPOUT_KEY.replace(/\./g, '\\.')
    const m1 = src.match(new RegExp('([A-Za-z_$][\\w$]*)\\s*=\\s*[`"\']' + key + '[`"\']'))
    if (!m1) return null
    const keyVar = m1[1]
    const m2 = src.match(new RegExp('([A-Za-z_$][\\w$]*)\\s*=\\s*[A-Za-z_$][\\w$]*\\(\\s*' + keyVar + '\\s*,\\s*(?:!0|true)\\s*\\)'))
    if (!m2) return null
    const seedVar = m2[1]
    // atom 包装在种子声明后不远处（同一 var 列表）；窗口限定避免全文误配
    const win = src.slice(m2.index + m2[0].length, m2.index + 4000)
    const m3 = win.match(new RegExp('([A-Za-z_$][\\w$]*)\\s*=\\s*[A-Za-z_$][\\w$]*\\(\\s*' + seedVar + '\\s*\\)'))
    if (!m3) return null
    const atomVar = m3[1]
    const exp = src.match(/export\s*\{([^}]*)\}/)
    if (!exp) return null
    for (const pair of exp[1].split(',')) {
      const parts = pair.trim().split(/\s+as\s+/)
      if (parts[0] === atomVar) return (parts[1] || parts[0]).trim()
    }
    return null
  } catch { return null }
}

// ── 官方 store 实时通道：动态 import 官方 chunk，直接调 nanostores atom ──
let officialStores = null

async function loadOfficialStores() {
  officialStores ??= {}
  let foundBoolAtoms = null
  try {
    // 1) 从 DOM script 标签拿主 bundle URL（assets 同目录）
    const scriptEl = document.querySelector('script[src*="index-"]')
    if (!scriptEl) return officialStores
    const mainUrl = new URL(scriptEl.src, location.href)
    const base = new URL('./', mainUrl)
    // 2) fetch 主 bundle 抠出 chunk 文件名
    const mainSrc = await (await fetch(mainUrl)).text()
    // density chunk
    const m1 = mainSrc.match(/([\w-]*session-list-density-[A-Za-z0-9_-]+\.js)/)
    if (m1 && !officialStores.probed) {
      try {
        const chunkUrl = new URL('./' + m1[1], base).href
        const chunkSrc = await (await fetch(chunkUrl)).text()
        const mod = await import(/* @vite-ignore */ chunkUrl)
        officialStores.probed = true   // 探测完整执行过一次才标记（fetch/import 失败保留下次重试机会）
        // ── 悬浮输入框：静态源码指纹反解认领（零翻转零闪烁），失败留待行为兜底 ──
        if (!officialStores.popoutGestures) {
          const gExport = findGesturesAtomExport(chunkSrc)
          const gAtom = gExport && mod[gExport]
          if (gAtom && typeof gAtom.get === 'function' && typeof gAtom.set === 'function' && typeof gAtom.get() === 'boolean') {
            officialStores.popoutGestures = gAtom
            console.error('[appearance-hub] ✅ popoutGestures 静态认领 via export ' + gExport)
          }
        }
        for (const k of Object.keys(mod)) {
          const v = mod[k]
          if (!v || typeof v.get !== 'function' || typeof v.set !== 'function') continue
          const cur = v.get()
          if (cur === 'compact' || cur === 'comfortable' || cur === 'detailed') {
            if (!officialStores.density) officialStores.density = v
            continue
          }
          // 字符串枚举 atom：值域互斥即身份（toolView/embedMode/appActions）。
          // tabStrip('auto'|'always'|'never') 不在此 chunk，无 'always' 撞值风险。
          if (cur === 'product' || cur === 'technical') { officialStores.toolViewMode ??= v; continue }
          if (cur === 'ask' || cur === 'always' || cur === 'off') { officialStores.embedMode ??= v; continue }
          if (cur === 'left' || cur === 'right') { officialStores.appActions ??= v; continue }
          // 收集 boolean atom（backdrop / intro-splash / reasoning / 命令面板开关等；
          // 静态已认领的 gestures atom 不重复入池）
          if (typeof cur === 'boolean' && v !== officialStores.popoutGestures) {
            if (!foundBoolAtoms) foundBoolAtoms = []
            foundBoolAtoms.push(v)
          }
        }
        // ── boolean atom 全量翻转扫描：一次遍历认领 backdrop / intro-splash /
        // reasoning 三个带 persist 订阅的 atom（翻转引发目标键写入即命中），
        // 同时记录「翻转不引发任何 localStorage 写入」的 atom——
        // $composerPopoutGesturesEnabled 无 persist 订阅，翻转零写入，是唯一
        // 可靠区分特征（reactions/tips 等虽有订阅但写自己的键，计入写入）。
        // 探测期间临时隐藏开场标识 DOM 防闪烁，并抑制 setItem 钩子
        // （防止 intro-splash atom 被翻转时误移除自定义注入层）。
        const introEl = document.querySelector('[data-slot="aui_intro"]')
        const prevVis = introEl ? introEl.style.visibility : ''
        if (introEl) introEl.style.visibility = 'hidden'
        if (introUninstallHook) {
          introUninstallHook()
          introUninstallHook = null
        }
        if (foundBoolAtoms && foundBoolAtoms.length) {
          const snapshot = foundBoolAtoms.map(a => a.get())
          let writeCount = 0
          const flippedKeys = []
          const rawSI = Storage.prototype.setItem
          Storage.prototype.setItem = function (...args) { writeCount++; flippedKeys.push(String(args[0])); return rawSI.apply(this, args) }
          const zeroWrite = []
          const probeDetail = []
          const watchKeys = [
            ['backdrop', BACKDROP_KEY],
            ['introSplash', INTRO_NATIVE_KEY],
            ['reasoningCollapsed', REASONING_KEY]
          ]
          const baseline = Object.fromEntries(watchKeys.map(([, k]) => [k, localStorage.getItem(k)]))
          const nextFrame = () => new Promise((r) => setTimeout(r, 0))
          try {
            for (let bi = 0; bi < foundBoolAtoms.length; bi++) {
              const a = foundBoolAtoms[bi]
              const wroteBefore = writeCount
              a.set(!snapshot[bi])
              await nextFrame()   // 官方 persist 有 microtask/帧级节流，等它 flush 再读键
              const wroteKeys = flippedKeys.slice(wroteBefore)
              const wroteZero = wroteKeys.length === 0
              let hitKey = null
              for (const [name, k] of watchKeys) {
                const now = localStorage.getItem(k)
                if (now !== baseline[k]) {
                  baseline[k] = now        // 滚动基线：已被认领的 atom 不再干扰后续比对
                  if (!officialStores[name]) hitKey = name
                }
              }
              a.set(snapshot[bi])   // 还原（persist 随之写回原值）
              await nextFrame()     // 等还原的写盘也 flush，避免污染下一 atom 的比对
              probeDetail.push(snapshot[bi] + '|' + wroteKeys.join('+') + (hitKey ? '>' + hitKey : ''))
              if (hitKey) officialStores[hitKey] = a
              else if (wroteZero) zeroWrite.push(bi)
            }
          } finally {
            Storage.prototype.setItem = rawSI
          }
          // popout gestures：零写入候选 + 值匹配（键存在时对照键值，缺省 true）。
          // 仅唯一命中才认领；多义/零命中 = 放弃（面板退回 localStorage 直写，重启生效）
          if (!officialStores.popoutGestures) {
            let want = true
            try { const k = localStorage.getItem(POPOUT_KEY); if (k === 'false') want = false } catch {}
            const cands = zeroWrite.filter((i) => snapshot[i] === want)
            if (cands.length === 1) officialStores.popoutGestures = foundBoolAtoms[cands[0]]
            // 诊断：认领失败时打印候选构成，定位是零写入 atom 过多还是过少
            else console.error('[appearance-hub] popout claim failed: want=' + want +
              ' zeroWrite=[' + zeroWrite.join(',') + '] boolTotal=' + snapshot.length +
              ' detail=[' + probeDetail.join(' ;; ') + ']')
          }
          for (const key of ['backdrop', 'introSplash', 'reasoningCollapsed', 'popoutGestures']) {
            if (officialStores[key]) {
              if (!officialStores._recognized) officialStores._recognized = []
              officialStores._recognized.push(key)
            }
          }
          // 探针走 error 级——renderer console.info 不落盘，只有 error 可事后 grep
          console.error('[appearance-hub] probe done: string-atoms=[' +
            ['toolViewMode', 'embedMode', 'appActions'].filter((k) => officialStores[k]).join(',') +
            '] bool-atoms=[' + (officialStores._recognized || []).join(',') + ']')
        }
        // 恢复开场标识可见性 + 重装 setItem 钩子
        if (introEl) introEl.style.visibility = prevVis
        installIntroStorageHook()
      } catch {}
    }
    // store chunk（tabStrip）
    const chunks = [...mainSrc.matchAll(/([\w-]*store-[A-Za-z0-9_-]+\.js)/g)].map(m2 => m2[1])
    for (const name of chunks) {
      if (officialStores.tabStrip) break
      try {
        const mod = await import(/* @vite-ignore */ new URL('./' + name, base).href)
        for (const k of Object.keys(mod)) {
          const v = mod[k]
          if (!v || typeof v.get !== 'function' || typeof v.set !== 'function') continue
          const cur = v.get()
          if (cur === 'auto' || cur === 'always' || cur === 'never') { officialStores.tabStrip = v; break }
        }
      } catch {}
    }
  } catch {}
  return officialStores
}

function readBackdrop() {
  try { return localStorage.getItem(BACKDROP_KEY) === 'true' } catch { return false }
}

function writeBackdrop(on) {
  try {
    localStorage.setItem(BACKDROP_KEY, String(on))
    window.dispatchEvent(new StorageEvent('storage', { key: BACKDROP_KEY }))
  } catch {}
}

function readTranslucencyBook() {
  try {
    const raw = JSON.parse(localStorage.getItem(TRANSLUCENCY_KEY) || 'null')
    if (raw && typeof raw === 'object') {
      return {
        mode: raw.mode === 'glass' || raw.mode === 'clear' ? raw.mode : 'clear',
        base: raw.base || {}, light: raw.light || {}, dark: raw.dark || {}
      }
    }
  } catch {}
  return { mode: 'clear', base: {}, light: {}, dark: {} }
}

// 明暗空槽镜像读取：当前模式槽没显式设置的字段，借用另一槽的显式值，
// 再回落 base、最后出厂默认。只影响读取/推送，不写回落盘数据（不污染官方设置页账本）。
// 解决「暗色调好参数、切回明亮却回落出厂默认（fade=1≈不透明）」的跟随体感问题。
function resolveBookField(book, field, dark) {
  const slot = book[dark ? 'dark' : 'light'] || {}
  const other = book[dark ? 'light' : 'dark'] || {}
  const base = book.base || {}
  const fallback = dark ? { intensity: 22, fade: 0, material: 'titlebar', scope: 'window' }
                        : { intensity: 66, fade: 1, material: 'header', scope: 'window' }
  return slot[field] ?? other[field] ?? base[field] ?? fallback[field]
}

function currentIntensity() {
  const dark = resolvedDark()
  const book = readTranslucencyBook()
  return resolveBookField(book, 'intensity', dark)
}

function writeIntensity(intensity) {
  const dark = resolvedDark()
  const book = readTranslucencyBook()
  const slot = dark ? 'dark' : 'light'
  book[slot] = { ...book[slot], intensity }
  try {
    localStorage.setItem(TRANSLUCENCY_KEY, JSON.stringify(book))
    window.dispatchEvent(new StorageEvent('storage', { key: TRANSLUCENCY_KEY }))
  } catch {}
  pushTranslucencyIpc(book, dark)
}

function pushTranslucencyIpc(book, dark) {
  // 实时驱动原生窗口透明效果（官方 IPC 通道）；取值走明暗空槽镜像
  const defaults = dark ? { intensity: 22, fade: 0, material: 'titlebar', scope: 'window' }
                        : { intensity: 66, fade: 1, material: 'header', scope: 'window' }
  try {
    window.hermesDesktop?.setTranslucency?.({
      mode: book.mode,
      intensity: resolveBookField(book, 'intensity', dark),
      fade: resolveBookField(book, 'fade', dark),
      material: resolveBookField(book, 'material', dark),
      scope: resolveBookField(book, 'scope', dark),
      glassSupported: true
    })
  } catch {}
}


// ── 主题（皮肤）───────────────────────────────────────────────────
// 与模式同款官方管道：skin 存 hermes-desktop-theme-v2（default）/ profile-themes record，
// 官方 storage 监听实时生效。列表 = 原生 BUILTIN_THEME_LIST（presets.ts）。
// ── Binshao 用户主题（Obsidian Primary 移植）──────────────────────
// 种子值由混合链反解生成（solve-seeds.mjs，正向验证 0 偏差）：官方 skin 消费端
// getBaseColors 走 resolveTheme → user themes 在解析链内，写 user-themes key 即生效。
// register 幂等注入 + 热更新：每次 register 重写（localStorage 被清自愈）。
const USER_THEME_KEY = 'hermes-desktop-user-themes-v1'
const BINSHAO_PATCH_ID = 'hub-binshao-patch'
const USER_THEMES = 
{
  "binshao": {
    "name": "binshao",
    "label": "Binshao",
    "description": "暖纸色系移植版，明暗双模式。",
    "colors": {
      "background": "#eee6db",
      "foreground": "#4f351c",
      "card": "#ecdecb",
      "cardForeground": "#4f351c",
      "muted": "#f2ece3",
      "mutedForeground": "#755d3e",
      "popover": "#d9c2a3",
      "popoverForeground": "#4f351c",
      "primary": "#a4896e",
      "primaryForeground": "#fcfaf8",
      "secondary": "#f2ece3",
      "secondaryForeground": "#4f351c",
      "accent": "#f1ede7",
      "accentForeground": "#4f351c",
      "border": "#e4d7c3",
      "input": "#d7c4a8",
      "ring": "#a4896e",
      "midground": "#a4896e",
      "midgroundForeground": "#fcfaf8",
      "composerRing": "#a4896e",
      "destructive": "#bf3f36",
      "destructiveForeground": "#fcfaf8",
      "sidebarBackground": "#ebe3d6",
      "sidebarBorder": "#cfb696",
      "userBubble": "#ecdecb",
      "userBubbleBorder": "#e4d7c3"
    },
    "darkColors": {
      "background": "#352b22",
      "foreground": "#f3e6d4",
      "card": "#644e35",
      "cardForeground": "#f3e6d4",
      "muted": "#2a231d",
      "mutedForeground": "#d2b48a",
      "popover": "#4f3f2d",
      "popoverForeground": "#f3e6d4",
      "primary": "#e0b56a",
      "primaryForeground": "#1c1814",
      "secondary": "#2a231d",
      "secondaryForeground": "#f3e6d4",
      "accent": "#ded1c2",
      "accentForeground": "#1c1814",
      "border": "#6b563d",
      "input": "#48392c",
      "ring": "#e0b56a",
      "midground": "#c9a06a",
      "midgroundForeground": "#1c1814",
      "composerRing": "#e0b56a",
      "destructive": "#e02f29",
      "destructiveForeground": "#f0e4d5",
      "sidebarBackground": "#1c1814",
      "sidebarBorder": "#9a8060",
      "userBubble": "#4f3f2d",
      "userBubbleBorder": "#6b563d"
    },
    "terminal": {
      "foreground": "#4f351c",
      "cursor": "#a4896e",
      "selectionBackground": "rgba(248, 197, 46, 0.2)",
      "black": "#432e14",
      "red": "#df453a",
      "green": "#3eb174",
      "yellow": "#ecb936",
      "blue": "#2a90cb",
      "magenta": "#9f72bb",
      "cyan": "#63a2bb",
      "white": "#fcfaf8",
      "brightBlack": "#b79d7b",
      "brightRed": "#d9746d",
      "brightGreen": "#8bc1a4",
      "brightYellow": "#e7c56f",
      "brightBlue": "#63a2bb",
      "brightMagenta": "#cba7dc",
      "brightCyan": "#63a2bb",
      "brightWhite": "#fcfaf8"
    },
    "darkTerminal": {
      "foreground": "#f3e6d4",
      "cursor": "#e0b56a",
      "selectionBackground": "rgba(249, 207, 81, 0.2)",
      "black": "#1f1a14",
      "red": "#f7685e",
      "green": "#2ea873",
      "yellow": "#e5aa1f",
      "blue": "#4db2d1",
      "magenta": "#6260c3",
      "cyan": "#6abfd2",
      "white": "#f0e4d5",
      "brightBlack": "#6b563d",
      "brightRed": "#fb8479",
      "brightGreen": "#4ec68e",
      "brightYellow": "#dfb64e",
      "brightBlue": "#6abfd2",
      "brightMagenta": "#8a87d9",
      "brightCyan": "#6abfd2",
      "brightWhite": "#f0e4d5"
    }
  }
}
// 层2配色补丁：选中黄/输入框底/行内代码（applyTheme 管道外的硬编码色），
// 作用域锁 [data-hermes-theme="binshao"]，不泄漏其他主题。
const BINSHAO_PATCH_CSS = `[data-hermes-theme="binshao"] {
  --ui-selection-background: rgba(248, 197, 46, 0.2);
  --ui-bg-input: #f8f5f1;
  --ui-inline-code-background: color-mix(in srgb, #5e544b 26%, transparent);
  --ui-inline-code-foreground: #4f351c;
}
[data-hermes-theme="binshao"].dark {
  --ui-selection-background: rgba(249, 207, 81, 0.2);
  --ui-bg-input: #302921;
  --ui-inline-code-background: color-mix(in srgb, #ffffff 7%, transparent);
  --ui-inline-code-foreground: rgba(255, 255, 255, 0.88);
}
`

function injectBinshaoTheme() {
  try {
    const raw = localStorage.getItem(USER_THEME_KEY)
    const record = raw ? JSON.parse(raw) : {}
    Object.assign(record, USER_THEMES)
    localStorage.setItem(USER_THEME_KEY, JSON.stringify(record))
  } catch {}
  document.getElementById(BINSHAO_PATCH_ID)?.remove()
  const style = document.createElement('style')
  style.id = BINSHAO_PATCH_ID
  style.textContent = BINSHAO_PATCH_CSS
  document.head.appendChild(style)
}

const SKIN_GLOBAL_KEY = 'hermes-desktop-theme-v2'
const SKIN_RECORD_KEY = 'hermes-desktop-profile-themes-v1'
const THEMES = [
  { id: 'nous', label: 'Nous' },
  { id: 'nous-alt', label: 'Nous Alt' },
  { id: 'github', label: 'GitHub' },
  { id: 'catppuccin', label: 'Catppuccin' },
  { id: 'everforest', label: 'Everforest' },
  { id: 'solarized', label: 'Solarized' },
  { id: 'midnight', label: 'Midnight' },
  { id: 'ember', label: 'Ember' },
  { id: 'mono', label: 'Mono' },
  { id: 'cyberpunk', label: 'Cyberpunk' },
  { id: 'slate', label: 'Slate' },
  { id: 'binshao', label: 'Binshao' }
]

function readThemeSkin() {
  try {
    const profile = localStorage.getItem('hermes-desktop-active-profile-v1') || 'default'
    if (profile !== 'default') {
      const rec = JSON.parse(localStorage.getItem(SKIN_RECORD_KEY) || '{}')
      if (rec[profile]) return rec[profile]
    }
    return localStorage.getItem(SKIN_GLOBAL_KEY) || 'nous'
  } catch {
    return 'nous'
  }
}

function writeThemeSkin(skin) {
  try {
    const profile = localStorage.getItem('hermes-desktop-active-profile-v1') || 'default'
    if (profile === 'default') {
      localStorage.setItem(SKIN_GLOBAL_KEY, skin)
      window.dispatchEvent(new StorageEvent('storage', { key: SKIN_GLOBAL_KEY }))
    } else {
      const rec = JSON.parse(localStorage.getItem(SKIN_RECORD_KEY) || '{}')
      rec[profile] = skin
      localStorage.setItem(SKIN_RECORD_KEY, JSON.stringify(rec))
      window.dispatchEvent(new StorageEvent('storage', { key: SKIN_RECORD_KEY }))
    }
  } catch {}
}

// ── 面板 ──────────────────────────────────────────────────────────
function AppearancePanel() {
  // 响应式翻译器：locale 切换即重渲染（模块级 OPTIONS 的 labelKey 也在此统一取词）
  const t = usePluginI18n(ID)
  const label = (o) => (o.labelKey ? t(o.labelKey) : o.label)
  // setLocale/isSavingLocale 来自官方 I18nProvider（useI18n 即官方 context），语言三键走同一官方通道
  const { locale, setLocale: setNativeLocale, isSavingLocale } = useI18n()
  // en 纵向通栏开关：现全线统一「左标题右控件」横排（原 en 例外已废，
  // 分支保留——后续若要重调 en 布局，改这一行即可全局生效）
  const stackedLayout = false
  const [paper, setPaper] = useState(() => ctxRef.storage.get(PAPER_KEY, true))
  const [darkRecipe, setDarkRecipeState] = useState(() => {
    const v = ctxRef.storage.get(DARK_RECIPE_KEY, 'light')
    return DARK_RECIPES[v] ? v : 'light'
  })
  const [lightRecipe, setLightRecipeState] = useState(() => {
    const v = ctxRef.storage.get(LIGHT_RECIPE_KEY, 'light')
    return LIGHT_RECIPES[v] ? v : 'light'
  })
  const [themeMode, setThemeModeState] = useState(() => readThemeMode())
  const [density, setDensityState] = useState(() =>
    readSimpleKey(DENSITY_KEY, 'compact', ['compact', 'comfortable', 'detailed']))
  const [bubble, setBubbleState] = useState(() => {
    try { return clampBubble(localStorage.getItem(USER_BUBBLE_KEY) || 0) } catch { return 0 }
  })
  const changeBubble = (v) => {
    setBubbleState(v)
    applyUserBubble(v)
  }
  const [tabStrip, setTabStripState] = useState(() =>
    readSimpleKey(TABSTRIP_KEY, 'auto', ['auto', 'always', 'never']))
  const [backdrop, setBackdropState] = useState(() => readBackdrop())
  // ── 对话行为五件套：状态读官方键；写入 atom 优先、localStorage 直写兜底 ──
  const [toolViewMode, setToolViewModeState] = useState(() =>
    readBoolKey(TOOL_VIEW_KEY, false) ? 'technical' : 'product')
  const [reasoningCollapsed, setReasoningState] = useState(() => readBoolKey(REASONING_KEY, false))
  const [embedMode, setEmbedModeState] = useState(() =>
    readSimpleKey(EMBED_MODE_KEY, 'ask', ['ask', 'always', 'off']))
  const [popoutEnabled, setPopoutState] = useState(() => readBoolKey(POPOUT_KEY, true))
  const [appActionsSide, setAppActionsState] = useState(() =>
    readSimpleKey(APP_ACTIONS_KEY, 'right', ['left', 'right']))

  const changeToolViewMode = (id) => {
    setToolViewModeState(id)
    loadOfficialStores().then((s) => {
      if (s?.toolViewMode) s.toolViewMode.set(id)
      else writeBoolKey(TOOL_VIEW_KEY, id === 'technical')   // 直写 = 重启后生效
    })
    haptic('tap')
  }
  const changeReasoning = (on) => {
    setReasoningState(on)
    loadOfficialStores().then((s) => {
      if (s?.reasoningCollapsed) s.reasoningCollapsed.set(on)
      else writeBoolKey(REASONING_KEY, on)
    })
    haptic('tap')
  }
  const changeEmbedMode = (id) => {
    setEmbedModeState(id)
    loadOfficialStores().then((s) => {
      // embedMode 是 persistentAtom——set 即写穿官方键 + 全窗口即时生效
      if (s?.embedMode) s.embedMode.set(id)
      else writeSimpleKey(EMBED_MODE_KEY, id)
    })
    haptic('tap')
  }
  const changePopout = (on) => {
    setPopoutState(on)
    loadOfficialStores().then((s) => {
      // 官方导出函数三件事：atom set（即时）+ persistBoolean 落盘 + 关时清 zones。
      // hub 等价复刻取二：atom.set 即时生效（use-composer-popout 里
      // poppedOut && gesturesEnabled——关手势时浮框自动归位停靠）+ 同键直写落盘
      // （'true'/'false' 与官方 persistBoolean 同格式）。zone.poppedOut 存档不清，
      // 与官方的差异仅在「关了再开，浮框位置复活」——边缘场景，接受。
      if (s?.popoutGestures) s.popoutGestures.set(on)
      writeBoolKey(POPOUT_KEY, on)
    })
    haptic('tap')
  }
  const changeAppActions = (id) => {
    setAppActionsState(id)
    loadOfficialStores().then((s) => {
      if (s?.appActions) s.appActions.set(id)
      else writeSimpleKey(APP_ACTIONS_KEY, id)
    })
    haptic('tap')
  }
  const [translucencyMode, setTranslucencyModeState] = useState(() => {
    try {
      const raw = JSON.parse(localStorage.getItem(TRANSLUCENCY_KEY) || 'null')
      return raw?.mode === 'glass' ? 'glass' : 'clear'
    } catch { return 'clear' }
  })
  const [intensity, setIntensityState] = useState(() => currentIntensity())
  const [fade, setFadeState] = useState(() => {
    try {
      const raw = JSON.parse(localStorage.getItem(TRANSLUCENCY_KEY) || 'null')
      if (!raw) return resolvedDark() ? 0 : 1
      return resolveBookField(raw, 'fade', resolvedDark())
    } catch { return 0 }
  })
  const [glassMaterial, setGlassMaterialState] = useState(() => {
    try {
      const raw = JSON.parse(localStorage.getItem(TRANSLUCENCY_KEY) || 'null')
      if (!raw) return resolvedDark() ? 'titlebar' : 'header'
      return resolveBookField(raw, 'material', resolvedDark())
    } catch { return 'titlebar' }
  })
  const [glassScope, setGlassScopeState] = useState(() => {
    try {
      const raw = JSON.parse(localStorage.getItem(TRANSLUCENCY_KEY) || 'null')
      if (!raw) return 'window'
      return resolveBookField(raw, 'scope', resolvedDark())
    } catch { return 'window' }
  })
  const [font, setFont] = useState(() => ctxRef.storage.get(FONT_KEY, false))
  // ── 字体增强（搬自 legacy 仓库：界面/正文/代码/思考四类字体 + 字号 + 思考块外观）──
  const [fontSettings, setFontSettingsState] = useState(() => readFontSettings())
  const [fontExpanded, setFontExpanded] = useState(false)
  // 本机字体列表（后端 /fonts 枚举成功后替换兜底预设；加载前用 FONT_PRESETS 预设）
  const [sysFonts, setSysFonts] = useState([])
  // 当前展开字体浏览列表的字段（'ui' | 'text' | 'code' | 'thinking' | null）
  const [fontBrowseField, setFontBrowseField] = useState(null)
  // FontField 的文案（组件模块级定义，拿不到 t()，由面板注入）
  const fontLabels = {
    browse: t('font.browse'), collapse: t('font.collapse'),
    browseTitle: t('font.browse'), collapseTitle: t('font.collapse'),
    familyPlaceholder: t('font.familyPlaceholder'), sizeTitle: t('font.sizeTitle')
  }

  const setFontSettings = (patch) => {
    const next = { ...fontSettings, ...patch }
    setFontSettingsState(next)
    // 在 hub 里改界面字体 = 显式动作 → 归属拨回 hub（否则「让位官方」会静默吞掉这次选择）
    if (Object.prototype.hasOwnProperty.call(patch, 'uiFont')) ctxRef.storage.set(FONT_WINNER_KEY, 'hub')
    Object.entries(patch).forEach(([k, v]) => {
      const key = {
        uiFont: FONT_UI_KEY, uisize: FONT_UISIZE_KEY, textFont: FONT_TEXTFONT_KEY,
        textSize: FONT_TEXTSIZE_KEY, codeFont: FONT_CODEFONT_KEY, codeSize: FONT_CODESIZE_KEY,
        thinkingFont: FONT_THINKFONT_KEY, thinkSize: FONT_THINKSIZE_KEY,
        thinkingColor: FONT_THINKCOLOR_KEY, thinkBox: FONT_THINKBOX_KEY, tabSize: FONT_TABSIZE_KEY,
        thinkTint: FONT_THINKTINT_KEY,
      }[k]
      if (key) ctxRef.storage.set(key, v)
    })
    if (font) applyFont()
  }

  // 「底色浓度」滑杆：拖动中即时预览（只重建样式、不入库），停手 350ms 才落盘
  const previewThinkTint = (v) => {
    const pct = clampThinkTint(v)
    setFontSettingsState((prev) => ({ ...prev, thinkTint: pct }))
    if (font) applyFont({ thinkTint: pct })
    if (thinkTintTimer) clearTimeout(thinkTintTimer)
    thinkTintTimer = setTimeout(() => ctxRef.storage.set(FONT_THINKTINT_KEY, clampThinkTint(pct)), 350)
  }
  // 字体浏览列表字段 —— FontField 用
  const toggleFontBrowse = (fieldKey) => {
    setFontBrowseField((cur) => (cur === fieldKey ? null : fieldKey))
  }

  // 重置字体设置为默认
  const resetFontSettings = () => {
    setFontSettingsState({ ...FONT_DEFAULTS })
    Object.entries(FONT_DEFAULTS).forEach(([k, v]) => {
      const key = {
        uiFont: FONT_UI_KEY, uisize: FONT_UISIZE_KEY, textFont: FONT_TEXTFONT_KEY,
        textSize: FONT_TEXTSIZE_KEY, codeFont: FONT_CODEFONT_KEY, codeSize: FONT_CODESIZE_KEY,
        thinkingFont: FONT_THINKFONT_KEY, thinkSize: FONT_THINKSIZE_KEY,
        thinkingColor: FONT_THINKCOLOR_KEY, thinkBox: FONT_THINKBOX_KEY, tabSize: FONT_TABSIZE_KEY,
        thinkTint: FONT_THINKTINT_KEY,
      }[k]
      if (key) ctxRef.storage.set(key, v)
    })
    if (font) applyFont()
    haptic('tap')
  }

  // 本机字体列表（后端 /fonts 枚举，供「浏览…」下拉；失败回落 FONT_PRESETS 预设）
  useEffect(() => {
    if (ctxRef && typeof ctxRef.rest === 'function') {
      ctxRef.rest('/fonts')
        .then((res) => {
          if (res && Array.isArray(res.fonts) && res.fonts.length) setSysFonts(res.fonts)
        })
        .catch(() => {})
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 完成提示音（P1：内置预设 + 音量档位 + 试听；自定义文件与「接管静音内置音」见后续阶段）
  const [soundOn, setSoundOn] = useState(() => ctxRef.storage.get(SOUND_KEY, false))
  const [soundVariant, setSoundVariantState] = useState(() =>
    resolveSoundVariant(ctxRef.storage.get(SOUND_VARIANT_KEY, 1)))
  const [soundStep, setSoundStepState] = useState(() =>
    resolveSoundStep(ctxRef.storage.get(SOUND_VOLUME_KEY, SOUND_DEFAULT_STEP)))
  const [soundSource, setSoundSourceState] = useState(() =>
    ctxRef.storage.get(SOUND_SOURCE_KEY, 'preset') === 'custom' ? 'custom' : 'preset')
  const [customName, setCustomNameState] = useState(() => ctxRef.storage.get(SOUND_CUSTOM_NAME_KEY, ''))
  const [takeover, setTakeoverState] = useState(() => ctxRef.storage.get(SOUND_TAKEOVER_KEY, false))
  const toggleSound = (next) => {
    setSoundOn(next)
    ctxRef.storage.set(SOUND_KEY, next)
    haptic('tap')
  }
  // 换音效即试听（与 Hermes 设置里的交互一致）
  const setSoundVariant = (id) => {
    const v = resolveSoundVariant(id)
    setSoundVariantState(v)
    ctxRef.storage.set(SOUND_VARIANT_KEY, v)
    playCue(v, soundStep)
  }
  const setSoundStep = (id) => {
    const s = resolveSoundStep(id)
    setSoundStepState(s)
    ctxRef.storage.set(SOUND_VOLUME_KEY, s)
    previewSound()
    haptic('tap')
  }
  const setSoundSource = (id) => {
    const v = id === 'custom' ? 'custom' : 'preset'
    setSoundSourceState(v)
    ctxRef.storage.set(SOUND_SOURCE_KEY, v)
    haptic('tap')
  }
  // 试听：自定义文件按需解码（首次读盘 + 扫峰值），失败走 toast 提示
  const previewSound = () => {
    if (soundSource !== 'custom') {
      playCue(soundVariant, soundStep)
      return
    }
    const path = ctxRef.storage.get(SOUND_CUSTOM_PATH_KEY, '')
    if (!path) {
      host.notify({ kind: 'info', message: t('sound.none') })
      return
    }
    loadCustomSound(path)
      .then(() => playCustomCue(soundStep))
      .catch((e) => host.notify({ kind: 'error', message: t('sound.loadFailed') + ' ' + (e && e.message) }))
  }
  const pickCustomSound = async () => {
    try {
      const desktop = window.hermesDesktop
      if (!desktop || typeof desktop.selectPaths !== 'function') {
        throw new Error('desktop bridge unavailable')
      }
      const picked = await desktop.selectPaths({
        filters: [{ name: 'Audio', extensions: ['mp3', 'wav', 'ogg', 'm4a', 'aac', 'flac'] }],
        multiple: false,
        title: t('sound.soundPickTitle')
      })
      const path = picked && picked[0]
      if (!path) return
      await loadCustomSound(path)
      const name = customFileName(path)
      ctxRef.storage.set(SOUND_CUSTOM_PATH_KEY, path)
      ctxRef.storage.set(SOUND_CUSTOM_NAME_KEY, name)
      ctxRef.storage.set(SOUND_SOURCE_KEY, 'custom')
      setSoundSourceState('custom')
      setCustomNameState(name)
      playCustomCue(soundStep)
      haptic('crisp')
    } catch (e) {
      host.notify({ kind: 'error', message: t('sound.loadFailed') + ' ' + (e && e.message) })
    }
  }
  const clearCustomSound = () => {
    customBuffer = null
    customLoadedPath = null
    customPeak = 1
    ctxRef.storage.set(SOUND_CUSTOM_PATH_KEY, '')
    ctxRef.storage.set(SOUND_CUSTOM_NAME_KEY, '')
    setCustomNameState('')
    haptic('tap')
  }
  // 接管 = 写 app 的全局静音键（内置完成音/思考音/唤醒音/触觉一起静）。
  // app 的 atom 只在启动时读一次 → 必须 Ctrl+R 才生效，面板如实提示。
  const toggleTakeover = (next) => {
    setTakeoverState(next)
    ctxRef.storage.set(SOUND_TAKEOVER_KEY, next)
    writeNativeSoundMuted(next)
    if (next && !soundOn) toggleSound(true)
    haptic('tap')
  }

  const [zoom, setZoomState] = useState(() => '90')
  const [introOn, setIntroOn] = useState(() => {
    try { return localStorage.getItem(INTRO_NATIVE_KEY) !== 'false' } catch { return true }
  })
  const [introMode, setIntroModeState] = useState(() => {
    const v = ctxRef.storage.get(INTRO_MODE_KEY, 'native')
    return v === 'custom' ? 'custom' : 'native'
  })
  // 订阅回调里读最新档位用（避免闭包过期）
  const introModeRef = useRef(introMode)
  useEffect(() => { introModeRef.current = introMode }, [introMode])
  const [introHeadline, setIntroHeadline] = useState(() => ctxRef.storage.get(INTRO_HEADLINE_KEY, 'HERMES AGENT'))
  const [introTagline, setIntroTagline] = useState(() => ctxRef.storage.get(INTRO_TAGLINE_KEY, ''))

  // ── 底部说明带联动：悬停/聚焦任一设置行 → 150ms 防抖后换文案；离开定格最后一条；
  //    面板每次重开（组件重挂载）回占位。hovered 存 desc 键名，t() 缺键自动回退。
  const [hovered, setHovered] = useState(null)
  const hoverTimer = useRef(null)
  useEffect(() => () => clearTimeout(hoverTimer.current), [])
  const hover = (descKey) => {
    clearTimeout(hoverTimer.current)
    hoverTimer.current = setTimeout(() => setHovered(descKey), 150)
  }

  // 面板挂载后建立同步：优先用模块级 liveZoom 缓存，未缓存则回退原生读取；
  // 订阅模块级变化（弹窗关闭即退订，但原生常驻监听在 register 时已挂，故反向永不断）
  useEffect(() => {
    if (liveZoom != null) {
      setZoomState(String(liveZoom))
    } else {
      const init = getNativeZoom()
      if (init && typeof init.then === 'function') {
        init.then((p) => { if (p != null) { liveZoom = p; setZoomState(String(p)) } }).catch(() => {})
      }
    }
    const off = subscribeNativeZoom((p) => setZoomState(String(p)))
    return typeof off === 'function' ? off : undefined
  }, [])

  // 开场标识档位订阅：设置页切开关时，浮窗高亮即时跟平（推送模型，与 zoom 同款）
  useEffect(() => {
    const off = subscribeIntroMode((mode) => {
      setIntroOn(mode !== 'off')
      setIntroModeState(mode === 'off' ? introModeRef.current : mode)
      if (mode !== 'off') {
        // 外部改开关不会带文字变化，仅同步档位即可
        ctxRef && applyIntroMode(mode)
      }
    })
    return typeof off === 'function' ? off : undefined
  }, [])

  // 主题/模式跟随：别处（设置页/另一窗口）改外观时，本窗口原生 storage 监听已处理
  // 界面重绘；这里只需让弹窗高亮跟上——监听同一组键。
  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === MODE_GLOBAL_KEY || e.key === MODE_RECORD_KEY ||
          e.key === SKIN_GLOBAL_KEY || e.key === SKIN_RECORD_KEY) {
        setThemeModeState(readThemeMode())
        setThemeState(readThemeSkin())
      }
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const togglePaper = (next) => {
    setPaper(next)
    ctxRef.storage.set(PAPER_KEY, next)
    if (next) injectPaper()
    else removePaper()
    haptic('tap')
  }

  const setThemeMode = (mode) => {
    setThemeModeState(mode)
    writeThemeMode(mode)
    haptic('tap')
  }

  const setDarkRecipe = (id) => {
    setDarkRecipeState(id)
    ctxRef.storage.set(DARK_RECIPE_KEY, id)
    applyPaperMode()
    haptic('tap')
  }

  const setLightRecipe = (id) => {
    setLightRecipeState(id)
    ctxRef.storage.set(LIGHT_RECIPE_KEY, id)
    applyPaperMode()
    haptic('tap')
  }

  const [theme, setThemeState] = useState(() => readThemeSkin())
  const setTheme = (id) => {
    setThemeState(id)
    writeThemeSkin(id)
    haptic('tap')
  }

  const setDensity = (id) => {
    setDensityState(id)
    loadOfficialStores().then((s) => {
      if (s?.density) s.density.set(id)
      else writeSimpleKey(DENSITY_KEY, id)
    })
    haptic('tap')
  }

  const setTabStrip = (id) => {
    setTabStripState(id)
    loadOfficialStores().then((s) => {
      if (s?.tabStrip) s.tabStrip.set(id)
      else writeSimpleKey(TABSTRIP_KEY, id)
    })
    haptic('tap')
  }

  const toggleBackdrop = (on) => {
    setBackdropState(on)
    loadOfficialStores().then((s) => {
      // 官方 atom 实时切换界面（Backdrop.tsx 直接订阅此 atom）
      if (s?.backdrop) s.backdrop.set(on)
      else writeBackdrop(on)
    })
    haptic('tap')
  }

  const changeTranslucencyMode = (mode) => {
    setTranslucencyModeState(mode)
    try {
      const book = readTranslucencyBook()
      book.mode = mode
      localStorage.setItem(TRANSLUCENCY_KEY, JSON.stringify(book))
      // 必须补发 storage 事件：官方 atom 监听此键同步账本，漏发会让官方揣着旧账本，
      // 在下次明暗切换时用旧值覆盖刚设的参数（偶发失效根因）
      window.dispatchEvent(new StorageEvent('storage', { key: TRANSLUCENCY_KEY }))
      pushTranslucencyIpc(book, resolvedDark())
    } catch {}
    setTimeout(() => setIntensityState(currentIntensity()), 0)
    haptic('tap')
  }

  const changeIntensity = (value) => {
    setIntensityState(value)
    clearTimeout(changeIntensity._t)
    changeIntensity._t = setTimeout(() => writeIntensity(value), 250)
  }

  const writeGlassField = (field, value) => {
    const dark = resolvedDark()
    try {
      const book = JSON.parse(localStorage.getItem(TRANSLUCENCY_KEY) || '{}')
      const slot = dark ? 'dark' : 'light'
      book[slot] = { ...(book[slot] || {}), [field]: value }
      if (!book.mode) book.mode = 'clear'
      localStorage.setItem(TRANSLUCENCY_KEY, JSON.stringify(book))
      window.dispatchEvent(new StorageEvent('storage', { key: TRANSLUCENCY_KEY }))
      pushTranslucencyIpc(book, dark)
    } catch {}
  }

  const changeFade = (value) => {
    setFadeState(value)
    clearTimeout(changeFade._t)
    changeFade._t = setTimeout(() => writeGlassField('fade', value), 250)
  }

  const setGlassMaterial = (m3) => {
    setGlassMaterialState(m3)
    writeGlassField('material', m3)
    haptic('tap')
  }

  const setGlassScope = (s3) => {
    setGlassScopeState(s3)
    writeGlassField('scope', s3)
    haptic('tap')
  }

    const toggleFont = (next) => {
    // 最后动作胜：点「开」= 无条件接管（哪怕官方聊天字体有值），通知一次说明
    // 让位关系；官方值从未被插件改写，点「关」或官方页再编辑都即时复位。
    setFont(next)
    ctxRef.storage.set(FONT_KEY, next)
    if (next) {
      ctxRef.storage.set(FONT_WINNER_KEY, 'hub')
      if (officialUserFont() !== '') {
        host.notify({ kind: 'info', message: ctxRef.i18n.t('font.yieldNote') })
      }
      applyFont()
    } else {
      removeFont()
    }
    haptic('tap')
  }

  const setZoom = (id) => {
    setZoomState(id)
    setNativeZoom(Number(id))
    haptic('tap')
  }

    const toggleIntro = (on) => {
    setIntroOn(on)
    if (!on) {
      // 关 = 三态走 'off'：applyIntroMode 统一做 CSS 隐藏 + 落盘原生键 false +
      // 同步官方设置页开关，与用户手点官方页开关等效（即时生效）
      applyIntroMode('off')
    } else {
      // 开 = 按 Hub 存档档位恢复（native/custom）；恢复到 off 之外的档位
      const mode = ctxRef.storage.get(INTRO_MODE_KEY, 'native')
      applyIntroMode(mode === 'custom' ? 'custom' : 'native')
    }
    haptic('tap')
  }

  const setIntroMode = (mode) => {
    setIntroModeState(mode)
    ctxRef.storage.set(INTRO_MODE_KEY, mode)
    applyIntroMode(mode)
    haptic('tap')
  }

  // 边输入边生效：停手 400ms 防抖落盘 + 重刷替换层，无需失焦/按回车确认
  useEffect(() => {
    if (introMode !== 'custom') return
    const t = setTimeout(() => {
      if (!ctxRef) return
      const headline = String(introHeadline).trim() || 'HERMES AGENT'
      const tagline = String(introTagline).trim()
      ctxRef.storage.set(INTRO_HEADLINE_KEY, headline)
      ctxRef.storage.set(INTRO_TAGLINE_KEY, tagline)
      applyIntroMode('custom')
    }, 400)
    return () => clearTimeout(t)
  }, [introHeadline, introTagline, introMode])

  // ── 面板结构（双栏改造）：原单列 children 原地转为区块列表，零转写、渲染不变 ──
  // ── 对齐总纲（设计宪法）──
  // 1. 右缘：全面板唯一基线 = 区块 px-2 的 8px；任何控件不得用 marginRight/内层 px 偏移离开此线
  // 2. 左缘两级：一级 = px-2 的 8px（图标/标题/展开项）；展开项与上方控件同宽通栏，不缩进
  // 3. 控件左缘三级：嵌套行 = ControlRow 结构（左标签内联定宽52px + gap-2，右栏flex-1）；
  //    定宽禁用 tailwind arbitrary 类——宿主Tailwind不为插件文件编译，w-[52px] 会静默失效
  // 1'. 四角同一基线：标题行/底部行也用 px-2，禁 px-1——全面板只有一条左右基线
  // 5'. 布局关键值禁依赖宿主编译的 tailwind 类（pr-3 曾未编译致双栏不对称、w-[52px] 曾未编译
  //     致 en 控件起点参差）；定宽/定距一律内联 style={{...}}
  const secChildren = [
      // 标题（右上角 = 主题三档切换：明亮/暗色/系统）
      jsxs('div', {
        className:
          'mb-1 flex items-center gap-2.5 border-b border-(--ui-stroke-secondary) px-2 pb-2',
        children: [
          jsx('span', {
            className:
              'flex size-7 shrink-0 items-center justify-center rounded-md border border-(--ui-stroke-secondary) bg-(--ui-bg-elevated)',
            children: jsx(icons.Palette, { className: 'size-3.5 text-(--ui-text-secondary)' })
          }),
          jsx('div', { className: 'min-w-0 flex-1 text-[0.75rem] leading-tight font-medium', children: t('theme.title') }),
          // 语言三键：包外层 div 挂 hover→说明带（SDK 组件不保证透传 DOM props）
          jsx('div', {
            style: { flexShrink: 0 },
            onMouseEnter: () => hover('language.desc'),
            children: jsx(SegmentedControl, {
              options: [
                { id: 'zh', label: '简' },
                { id: 'zh-hant', label: '繁' },
                { id: 'en', label: 'EN' }
              ],
              value: locale,
              onChange: (id) => { setNativeLocale(id); haptic('tap') },
              disabled: isSavingLocale,
              className: 'scale-90',
              'aria-label': t('language.title')
            })
          }),
          jsx('div', {
            style: { flexShrink: 0 },
            onMouseEnter: () => hover('theme.titleDesc'),
            children: jsx(SegmentedControl, {
              options: THEME_MODES.map((m) => ({ ...m, label: label(m) })),
              value: themeMode,
              onChange: setThemeMode,
              className: 'scale-90'
            })
          })
        ]
      }),
      // 主题（原生皮肤列表，平铺网格）
      jsxs('div', {
        onMouseEnter: () => hover('theme.gridDesc'),
        className: 'flex flex-col gap-1.5 rounded-md px-2 py-2 hover:bg-(--chrome-action-hover)',
        children: [
          jsx('div', { className: 'min-w-0 text-[0.75rem] leading-tight', children: t('theme.gridTitle') }),
          jsx(
            'div',
            {
              style: { display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '4px', padding: '0' },
              children: THEMES.map((t) =>
                jsx(
                  'button',
                  {
                    type: 'button',
                    onClick: () => setTheme(t.id),
                    className:
                      'rounded-md border px-1.5 py-1 text-[0.625rem] transition-colors ' +
                      (t.id === theme
                        ? 'border-(--ui-accent) bg-(--ui-control-active-background) font-medium text-(--ui-text-primary)'
                        : 'border-(--ui-stroke-secondary) text-(--ui-text-secondary) hover:bg-(--chrome-action-hover)'),
                    children: t.label
                  },
                  t.id
                )
              )
            }
          )
        ]
      }),

      // 字体（总开关 + 展开式定制：界面/正文/代码/思考字体 + 字号、思考块外观、标签栏字号）
      // 区块与 v3 同风格：无图标 + hover→说明带；展开区沿用 legacy 的表单行
      jsxs('div', {
        onMouseEnter: () => hover('font.desc'),
        className: 'flex flex-col gap-1 rounded-md px-2 py-2 hover:bg-(--chrome-action-hover)',
        children: [
          jsxs('div', {
            className: 'flex items-center gap-2.5',
            children: [
              jsx('div', {
                className: 'min-w-0 flex-1 cursor-pointer text-[0.75rem] leading-tight',
                onClick: () => setFontExpanded((v) => !v),
                children: t('font.title')
              }, 'font-title'),
              jsx(SegmentedControl, {
                options: [
                  { id: 'off', label: t('intro.off') },
                  { id: 'on', label: t('intro.on') }
                ],
                value: font ? 'on' : 'off',
                onChange: (id) => toggleFont(id === 'on'),
                style: { width: '150px', flexShrink: 0 },
                'aria-label': t('font.title')
              }, 'font-toggle')
            ]
          }, 'font-head'),
          // 展开区：总开关开启时显示全部定制项
          font && fontExpanded &&
            jsxs('div', {
              className: 'flex flex-col gap-1.5',
              children: [
                jsx(FontField, {
                  label: t('font.ui'),
                  fieldKey: 'ui',
                  value: fontSettings.uiFont,
                  onChange: (v) => setFontSettings({ uiFont: v }),
                  sizeValue: fontSettings.uisize,
                  onSizeChange: (v) => setFontSettings({ uisize: v }),
                  sizeEmptyLabel: t('font.sizeBase'),
                  sysFonts,
                  browseField: fontBrowseField,
                  onToggleBrowse: toggleFontBrowse,
                  labels: fontLabels
                }, 'font-field-ui'),
                jsx(FontField, {
                  label: t('font.text'),
                  fieldKey: 'text',
                  value: fontSettings.textFont,
                  onChange: (v) => setFontSettings({ textFont: v }),
                  sizeValue: fontSettings.textSize,
                  onSizeChange: (v) => setFontSettings({ textSize: v }),
                  sizeEmptyLabel: t('font.sizeFollowUI'),
                  sysFonts,
                  browseField: fontBrowseField,
                  onToggleBrowse: toggleFontBrowse,
                  labels: fontLabels
                }, 'font-field-text'),
                jsxs('div', {
                  className: 'flex items-center justify-between gap-2',
                  children: [
                    jsx('label', { className: 'text-xs font-medium text-(--ui-text-secondary)', children: t('font.tabSize') }, 'font-tab-label'),
                    jsx('select', {
                      value: fontSettings.tabSize,
                      title: t('font.tabSize'),
                      className:
                        'shrink-0 rounded-md border border-(--ui-stroke-secondary) bg-(--ui-input-bg) px-1 py-1 text-xs text-foreground outline-none focus:border-(--ui-accent)',
                      onChange: (e) => setFontSettings({ tabSize: e.target.value }),
                      children: [
                        jsx('option', { value: '', children: t('font.sizeDefault') }, ''),
                        ...FONT_SIZES.map((id) => jsx('option', { value: id, children: `${id}px` }, id))
                      ]
                    }, 'font-tab-select')
                  ]
                }, 'font-tab-row'),
                jsx(FontField, {
                  label: t('font.code'),
                  fieldKey: 'code',
                  value: fontSettings.codeFont,
                  onChange: (v) => setFontSettings({ codeFont: v }),
                  sizeValue: fontSettings.codeSize,
                  onSizeChange: (v) => setFontSettings({ codeSize: v }),
                  sizeEmptyLabel: t('font.sizeFollowBody'),
                  sysFonts,
                  browseField: fontBrowseField,
                  onToggleBrowse: toggleFontBrowse,
                  labels: fontLabels
                }, 'font-field-code'),
                jsx(FontField, {
                  label: t('font.thinking'),
                  fieldKey: 'thinking',
                  value: fontSettings.thinkingFont,
                  onChange: (v) => setFontSettings({ thinkingFont: v }),
                  sizeValue: fontSettings.thinkSize,
                  onSizeChange: (v) => setFontSettings({ thinkSize: v }),
                  sizeEmptyLabel: t('font.sizeFollowBody'),
                  sysFonts,
                  browseField: fontBrowseField,
                  onToggleBrowse: toggleFontBrowse,
                  labels: fontLabels
                }, 'font-field-thinking'),
                jsxs('div', {
                  className: 'flex flex-col gap-1',
                  children: [
                    jsx('label', { className: 'text-xs font-medium text-(--ui-text-secondary)', children: t('font.thinkColor') }, 'font-color-label'),
                    jsxs('select', {
                      value: fontSettings.thinkingColor,
                      className:
                        'rounded-md border border-(--ui-stroke-secondary) bg-(--ui-input-bg) px-2 py-1 text-xs text-foreground outline-none focus:border-(--ui-accent)',
                      onChange: (e) => setFontSettings({ thinkingColor: e.target.value }),
                      children: FONT_COLORS.map((c) => jsx('option', { value: c.id, children: t(c.labelKey) }, c.id))
                    }, 'font-color-select')
                  ]
                }, 'font-color-row'),
                jsxs('div', {
                  className: 'flex items-center justify-between gap-2',
                  children: [
                    jsx('label', { className: 'text-xs font-medium text-(--ui-text-secondary)', children: t('font.thinkBox') }, 'font-box-label'),
                    jsx('select', {
                      value: fontSettings.thinkBox,
                      className:
                        'shrink-0 rounded-md border border-(--ui-stroke-secondary) bg-(--ui-input-bg) px-1 py-1 text-xs text-foreground outline-none focus:border-(--ui-accent)',
                      onChange: (e) => setFontSettings({ thinkBox: e.target.value }),
                      children: THINK_BOX_STYLES.map((id) =>
                        jsx('option', {
                          value: id,
                          children: t('font.thinkBox' + id.charAt(0).toUpperCase() + id.slice(1))
                        }, id)
                      )
                    }, 'font-box-select')
                  ]
                }, 'font-box-row'),
                (fontSettings.thinkBox === 'tint' || fontSettings.thinkBox === 'rail') &&
                  jsxs('div', {
                    className: 'flex flex-col gap-1',
                    children: [
                      jsxs('div', {
                        className: 'flex items-center justify-between gap-2',
                        children: [
                          jsx('label', {
                            className: 'text-xs font-medium text-(--ui-text-secondary)',
                            children: t('font.tintStrength')
                          }, 'font-tint-label'),
                          jsx('span', {
                            className: 'shrink-0 text-xs tabular-nums text-(--ui-text-secondary)',
                            children: String(fontSettings.thinkTint)
                          }, 'font-tint-value')
                        ]
                      }, 'font-tint-head'),
                      jsx('input', {
                        type: 'range',
                        min: 0,
                        max: THINK_TINT_MAX,
                        step: 1,
                        value: fontSettings.thinkTint,
                        'aria-label': t('font.tintStrength'),
                        className: 'w-full accent-(--ui-accent)',
                        onChange: (e) => previewThinkTint(Number(e.target.value))
                      }, 'font-tint-range')
                    ]
                  }, 'font-tint-row'),
                jsx('button', {
                  type: 'button',
                  className:
                    'mt-0.5 self-start rounded-md border border-(--ui-stroke-secondary) px-2 py-1 text-xs text-(--ui-text-secondary) transition-colors hover:border-(--ui-destructive) hover:text-(--ui-destructive)',
                  onClick: resetFontSettings,
                  children: t('font.reset')
                }, 'font-reset')
              ]
            }, 'font-expand')
        ]
      }, 'font-block'),

      // 纸纹（开关 + 配方同属一个悬浮高亮容器）
      jsxs('div', {
        onMouseEnter: () => hover('paper.desc'),
        className: 'flex flex-col gap-1 rounded-md px-2 py-2 hover:bg-(--chrome-action-hover)',
        children: [
          jsxs('div', {
            className: 'flex items-center gap-2.5',
            children: [
              jsx('div', { className: 'min-w-0 flex-1 text-[0.75rem] leading-tight', children: t('paper.title') }),
              jsx(SegmentedControl, {
                options: [
                  { id: 'off', label: t('intro.off') },
                  { id: 'on', label: t('intro.on') }
                ],
                value: paper ? 'on' : 'off',
                onChange: (id) => togglePaper(id === 'on'),
                style: { width: '150px', flexShrink: 0 },
                'aria-label': t('paper.title')
              })
            ]
          }),

          // 配方（明亮在上，暗色在下；从左到右由轻到重，默认极轻；纸纹关闭时禁用选择）
          // 官方 SegmentedControl 的 disabled 不屏蔽 hover 高亮（Chromium :hover
          // 对 disabled button 仍生效），且不透传 style——外层 div 掐指针感知兜底
          jsx('div', {
            style: { pointerEvents: paper ? undefined : 'none' },
            children: jsxs('div', {
              className: 'flex items-center gap-2',
              children: [
                jsx('span', {
                  className: 'shrink-0 text-[0.625rem] text-(--ui-text-quaternary)',
                  children: t('paper.recipeLight')
                }),
                jsx(SegmentedControl, {
                  options: Object.entries(LIGHT_RECIPES).map(([id, r]) => ({ id, label: t(r.labelKey) })),
                  value: lightRecipe,
                  onChange: setLightRecipe,
                  disabled: !paper,
                  className: 'min-w-0 flex-1'
                })
              ]
            })
          }),
          jsx('div', {
            style: { pointerEvents: paper ? undefined : 'none' },
            children: jsxs('div', {
              className: 'flex items-center gap-2',
              children: [
                jsx('span', {
                  className: 'shrink-0 text-[0.625rem] text-(--ui-text-quaternary)',
                  children: t('paper.recipeDark')
                }),
                jsx(SegmentedControl, {
                  options: Object.entries(DARK_RECIPES).map(([id, r]) => ({ id, label: t(r.labelKey) })),
                  value: darkRecipe,
                  onChange: setDarkRecipe,
                  disabled: !paper,
                  className: 'min-w-0 flex-1'
                })
              ]
            })
          })
        ]
      }),

      // 标签栏（BehaviorRow：单行标题+定宽控件；en 纵向通栏）
      jsx(BehaviorRow, {
        title: t('tabstrip.title'),
        options: TABSTRIP_OPTIONS.map((o) => ({ ...o, label: label(o) })),
        value: tabStrip,
        onChange: setTabStrip,
        stacked: stackedLayout,
        onEnter: () => hover('tabstrip.desc')
      }),

      // 会话列表密度（en 例外：官方全词控件约 209px，横排放不下 → 该行单独纵向换行）
      jsx(BehaviorRow, {
        title: t('density.title'),
        options: DENSITY_OPTIONS.map((o) => ({ ...o, label: label(o) })),
        value: density,
        onChange: setDensity,
        stacked: locale === 'en',
        onEnter: () => hover('density.desc')
      }),

      // 消息气泡（滑杆行无对应 BehaviorRow 形态，仅去图标+挂 hover）
      jsxs('div', {
        onMouseEnter: () => hover('bubble.desc'),
        className: stackedLayout
          ? 'flex flex-col gap-1.5 rounded-md px-2 py-2 hover:bg-(--chrome-action-hover)'
          : 'flex items-center gap-2.5 rounded-md px-2 py-2 hover:bg-(--chrome-action-hover)',
        children: [
          jsx('div', { className: 'min-w-0 flex-1 text-[0.75rem] leading-tight', children: t('bubble.title') }),
          jsxs('div', {
            className: 'flex min-w-0 items-center gap-2' + (stackedLayout ? '' : ' ml-auto'),
            children: [
              jsx('input', {
                type: 'range',
                min: 0,
                max: 100,
                step: 1,
                value: bubble,
                onChange: (e) => changeBubble(Number(e.target.value)),
                style: SLIDER_STYLE,
                className: stackedLayout ? 'min-w-0 w-full cursor-pointer' : 'min-w-0 flex-1 cursor-pointer',
                'aria-label': t('bubble.title')
              }),
              jsx('span', {
                style: { width: '32px', flexShrink: 0 },
                className: 'text-right text-[0.625rem] tabular-nums text-(--ui-text-tertiary)',
                children: bubble + '%'
              })
            ]
          })
        ]
      }),

      // 聊天背景
      jsx(BehaviorRow, {
        title: t('backdrop.title'),
        options: [
          { id: 'off', label: t('backdrop.off') },
          { id: 'on', label: t('backdrop.on') }
        ],
        value: backdrop ? 'on' : 'off',
        onChange: (id) => toggleBackdrop(id === 'on'),
        stacked: false,
        onEnter: () => hover('backdrop.desc')
      }),

      // 窗口透明（整块 hover 显示总说明；嵌套参数行不再单列文案）
      jsxs('div', {
        onMouseEnter: () => hover('translucency.desc'),
        className: 'flex flex-col gap-1.5 rounded-md px-2 py-2 hover:bg-(--chrome-action-hover)',
        children: [
          jsxs('div', {
            className: 'flex items-center gap-2.5',
            children: [
              jsx('div', { className: 'min-w-0 flex-1 text-[0.75rem] leading-tight', children: t('translucency.title') }),
              jsx(SegmentedControl, {
                options: [
                  { id: 'clear', label: t('translucency.clear') },
                  { id: 'glass', label: t('translucency.glass') }
                ],
                value: translucencyMode,
                onChange: changeTranslucencyMode,
                className: 'shrink-0'
              })
            ]
          }),
          jsx(ControlRow, {
            label: translucencyMode === 'glass' ? t('translucency.tint') : t('translucency.intensityLabel'),
            children: jsxs('div', {
              className: 'flex min-w-0 items-center gap-2',
              children: [
                jsx('input', {
                  type: 'range',
                  min: 0,
                  max: 100,
                  step: 1,
                  value: intensity,
                  onChange: (e) => changeIntensity(Number(e.target.value)),
                  style: SLIDER_STYLE,
                  className: 'min-w-0 flex-1 cursor-pointer',
                  'aria-label': '透明强度'
                }),
                jsx('span', {
                  style: { width: '32px', flexShrink: 0 },
                  className: 'text-right text-[0.625rem] tabular-nums text-(--ui-text-tertiary)',
                  children: intensity + '%'
                })
              ]
            })
          }),
          translucencyMode === 'glass' &&
            jsxs('div', {
              className: 'flex flex-col gap-1',
              children: [
                jsx(ControlRow, {
                  label: t('translucency.fade'),
                  children: jsxs('div', {
                    className: 'flex min-w-0 items-center gap-2',
                    children: [
                      jsx('input', {
                        type: 'range',
                        min: 0,
                        max: 100,
                        step: 1,
                        value: fade,
                        onChange: (e) => changeFade(Number(e.target.value)),
                        style: SLIDER_STYLE,
                        className: 'min-w-0 flex-1 cursor-pointer',
                        'aria-label': '淡出'
                      }),
                      jsx('span', {
                        style: { width: '32px', flexShrink: 0 },
                        className: 'text-right text-[0.625rem] tabular-nums text-(--ui-text-tertiary)',
                        children: fade + '%'
                      })
                    ]
                  })
                }),
                jsx(ControlRow, {
                  label: t('translucency.materialTitle'),
                  children: jsx(SegmentedControl, {
                    options: GLASS_MATERIALS.map((m3) => ({ id: m3, label: t(FROST_LABELS[m3]) })),
                    value: glassMaterial,
                    onChange: setGlassMaterial,
                    className: 'w-full'
                  })
                }),
                jsx(ControlRow, {
                  label: t('translucency.scopeTitle'),
                  children: jsx(SegmentedControl, {
                    options: GLASS_SCOPES.map((s3) => ({ id: s3, label: t(SCOPE_LABELS[s3]) })),
                    value: glassScope,
                    onChange: setGlassScope,
                    className: 'w-full'
                  })
                })
              ]
            })
        ]
      }),

      // 开场标识（新会话空态字标 + 提示语）
      jsxs('div', {
        onMouseEnter: () => hover('intro.desc'),
        className: 'flex flex-col gap-1.5 rounded-md px-2 py-2 hover:bg-(--chrome-action-hover)',
        children: [
          jsxs('div', {
            className: 'flex items-center gap-2.5',
            children: [
              jsx('div', { className: 'min-w-0 flex-1 text-[0.75rem] leading-tight', children: t('intro.title') }),
              jsx(SegmentedControl, {
                options: [
                  { id: 'off', label: t('intro.off') },
                  { id: 'on', label: t('intro.on') }
                ],
                value: introOn ? 'on' : 'off',
                onChange: (id2) => toggleIntro(id2 === 'on'),
                className: 'ml-auto',
                style: { width: '150px', flexShrink: 0 }
              })
            ]
          }),
          // 展开区常驻：关 → 整块禁交互（同纸纹配方手法：外层掐指针感知灭 hover）；
          // 开+原生文案 → 仅输入区禁用；开+自定义 → 全部可用
          jsxs('div', {
            style: { pointerEvents: introOn ? undefined : 'none' },
            className: 'flex flex-col gap-1.5',
            children: [
              jsx(SegmentedControl, {
                options: INTRO_OPTIONS.map((o) => ({ ...o, label: label(o) })),
                value: introMode,
                onChange: setIntroMode,
                disabled: !introOn,
                className: 'w-full'
              }),
              jsxs('div', {
                // custom 子区独立掐指针：开+原生时也不可点，且不响应 hover
                style: { pointerEvents: introOn && introMode === 'custom' ? undefined : 'none' },
                className: 'flex flex-col gap-1.5',
                children: [
                  jsx(Input, {
                    value: introHeadline,
                    onChange: (e) => setIntroHeadline(e.target.value),
                    placeholder: t('intro.headlinePlaceholder'),
                    disabled: !introOn || introMode !== 'custom',
                    className: 'h-7 text-[0.6875rem]',
                    'aria-label': '自定义字标'
                  }),
                  jsx(Textarea, {
                    value: introTagline,
                    onChange: (e) => setIntroTagline(e.target.value),
                    placeholder: t('intro.taglinePlaceholder'),
                    disabled: !introOn || introMode !== 'custom',
                    // 固定高度、不给拖拽调大小（右下角 resize 手柄关闭）
                    style: { height: '3.5rem', resize: 'none' },
                    className: 'text-[0.6875rem]',
                    'aria-label': '自定义提示语'
                  })
                ]
              })
            ]
          })
        ]
      }),
      // ── 对话行为五件套（搬自官方设置页外观段，同键直驱官方状态）──
      jsx(BehaviorRow, {
        title: t('behavior.toolView'),
        options: [
          { id: 'product', label: t('behavior.product') },
          { id: 'technical', label: t('behavior.technical') }
        ],
        value: toolViewMode,
        onChange: changeToolViewMode,
        stacked: stackedLayout,
        onEnter: () => hover('behavior.toolViewDesc')
      }),
      jsx(BehaviorRow, {
        title: t('behavior.reasoning'),
        options: [
          { id: 'off', label: t('intro.off') },
          { id: 'on', label: t('intro.on') }
        ],
        value: reasoningCollapsed ? 'on' : 'off',
        onChange: (id) => changeReasoning(id === 'on'),
        stacked: stackedLayout,
        onEnter: () => hover('behavior.reasoningDesc')
      }),
      jsx(BehaviorRow, {
        title: t('behavior.embeds'),
        options: [
          { id: 'ask', label: t('behavior.ask') },
          { id: 'always', label: t('behavior.always') },
          { id: 'off', label: t('behavior.offEmbed') }
        ],
        value: embedMode,
        onChange: changeEmbedMode,
        stacked: stackedLayout,
        onEnter: () => hover('behavior.embedsDesc')
      }),
      jsx(BehaviorRow, {
        title: t('behavior.popout'),
        options: [
          { id: 'off', label: t('intro.off') },
          { id: 'on', label: t('intro.on') }
        ],
        value: popoutEnabled ? 'on' : 'off',
        onChange: (id) => changePopout(id === 'on'),
        stacked: stackedLayout,
        onEnter: () => hover('behavior.popoutDesc')
      }),
      jsx(BehaviorRow, {
        title: t('behavior.appActions'),
        options: [
          { id: 'left', label: t('behavior.left') },
          { id: 'right', label: t('behavior.right') }
        ],
        value: appActionsSide,
        onChange: changeAppActions,
        stacked: stackedLayout,
        onEnter: () => hover('behavior.appActionsDesc')
      }),

      // 完成提示音（移植自 legacy 仓库：14 音效 + 自定义音频 + 音量档 + 接管内置音）
      jsxs('div', {
        onMouseEnter: () => hover('sound.desc'),
        className: 'flex flex-col gap-1.5 rounded-md px-2 py-2 hover:bg-(--chrome-action-hover)',
        children: [
          jsxs('div', {
            className: 'flex items-center gap-2.5',
            children: [
              jsx('div', { className: 'min-w-0 flex-1 text-[0.75rem] leading-tight', children: t('sound.title') }, 'sound-title'),
              jsx(SegmentedControl, {
                options: [
                  { id: 'off', label: t('sound.off') },
                  { id: 'on', label: t('sound.on') }
                ],
                value: soundOn ? 'on' : 'off',
                onChange: (id) => toggleSound(id === 'on'),
                style: { width: '150px', flexShrink: 0 },
                'aria-label': t('sound.title')
              }, 'sound-toggle')
            ]
          }, 'sound-head'),
          jsx(ControlRow, {
            label: t('sound.source'),
            children: jsx(SegmentedControl, {
              options: [
                { id: 'preset', label: t('sound.sourcePreset') },
                { id: 'custom', label: t('sound.sourceCustom') }
              ],
              value: soundSource,
              onChange: setSoundSource,
              className: 'w-full'
            })
          }, 'sound-source'),
          soundSource === 'preset'
            ? jsx(ControlRow, {
                label: t('sound.preset'),
                children: jsxs('div', {
                  className: 'flex min-w-0 items-center gap-2',
                  children: [
                    jsx('select', {
                      value: String(soundVariant),
                      onChange: (e) => setSoundVariant(Number(e.target.value)),
                      className: 'h-7 min-w-0 flex-1 cursor-pointer rounded-md px-1.5 text-[0.6875rem]',
                      style: SOUND_SELECT_STYLE,
                      'aria-label': t('sound.preset'),
                      children: SOUND_VARIANTS.map((v) =>
                        jsx('option', { value: String(v.id), children: v.name }, v.id))
                    }, 'sound-select'),
                    jsx('div', {
                      className: SOUND_BTN_CLASS,
                      style: SOUND_BTN_STYLE,
                      onClick: () => { playCue(soundVariant, soundStep); haptic('crisp') },
                      role: 'button',
                      children: [jsx(icons.Play, { className: 'size-3' }, 'ico'), t('sound.preview')]
                    }, 'sound-preview-btn')
                  ]
                })
              }, 'sound-preset-row')
            : jsxs('div', {
                className: 'flex flex-col gap-1.5',
                children: [
                  jsx(ControlRow, {
                    label: t('sound.sourceCustom'),
                    children: jsx('div', {
                      className: 'truncate text-[0.6875rem] leading-tight text-(--ui-text-secondary)',
                      title: customName || t('sound.none'),
                      children: customName || t('sound.none')
                    })
                  }, 'sound-custom-name'),
                  jsx(ControlRow, {
                    label: '',
                    children: jsxs('div', {
                      className: 'flex flex-wrap items-center gap-2',
                      children: [
                        jsx('div', {
                          className: SOUND_BTN_CLASS,
                          style: SOUND_BTN_STYLE,
                          onClick: () => { void pickCustomSound() },
                          role: 'button',
                          children: [jsx(icons.FolderOpen, { className: 'size-3' }, 'ico'), t('sound.pick')]
                        }, 'sound-pick'),
                        jsx('div', {
                          className: SOUND_BTN_CLASS,
                          style: SOUND_BTN_STYLE,
                          onClick: () => { previewSound(); haptic('crisp') },
                          role: 'button',
                          children: [jsx(icons.Play, { className: 'size-3' }, 'ico'), t('sound.preview')]
                        }, 'sound-preview'),
                        customName &&
                          jsx('div', {
                            className: SOUND_BTN_CLASS,
                            style: SOUND_BTN_STYLE,
                            onClick: clearCustomSound,
                            role: 'button',
                            children: [jsx(icons.Trash2, { className: 'size-3' }, 'ico'), t('sound.clear')]
                          }, 'sound-clear')
                      ]
                    })
                  }, 'sound-custom-actions')
                ]
              }, 'sound-custom-block'),
          jsx(ControlRow, {
            label: t('sound.volume'),
            children: jsx(SegmentedControl, {
              options: SOUND_VOLUME_OPTIONS,
              value: String(soundStep),
              onChange: setSoundStep,
              className: 'w-full'
            })
          }, 'sound-volume'),
          jsx(ControlRow, {
            label: t('sound.takeover'),
            children: jsx(SegmentedControl, {
              options: [
                { id: 'off', label: t('sound.takeoverOff') },
                { id: 'on', label: t('sound.takeoverOn') }
              ],
              value: takeover ? 'on' : 'off',
              onChange: (id) => toggleTakeover(id === 'on'),
              className: 'w-full'
            })
          }, 'sound-takeover'),
          takeover &&
            jsx('div', {
              className: 'mt-0.5 text-[0.6875rem] leading-relaxed text-(--ui-text-tertiary)',
              children: t('sound.takeoverNote')
            }, 'sound-takeover-note'),
          soundOn &&
            jsx('div', {
              className: 'mt-0.5 text-[0.6875rem] leading-relaxed text-(--ui-text-tertiary)',
              children: t('sound.note')
            }, 'sound-note')
        ]
      }),

      // 底部说明带：左=悬停联动（空载显示占位 tip），右=界面缩放（悬停缩放条也联动）
      jsxs('div', {
        className: 'mt-1 flex items-center gap-2 border-t border-(--ui-stroke-secondary) px-2 pt-2',
        children: [
          jsx('div', {
            // 钉两行高：hover 换长/短文案时下方不跳；空载与联动同一容器
            style: { minHeight: '2.5rem', lineHeight: 1.25, display: 'flex', alignItems: 'center' },
            className: 'min-w-0 flex-1 text-[0.625rem] leading-tight text-(--ui-text-quaternary)',
            children: t(hovered || 'footer.tip')
          }),
          jsx('div', {
            // onMouseEnter 包外层 div——SDK 组件不保证透传未知 props 到 DOM
            style: { flexShrink: 0 },
            onMouseEnter: () => hover('zoom.desc'),
            children: jsx(SegmentedControl, {
              options: ZOOM_OPTIONS,
              value: zoom,
              onChange: setZoom,
              className: 'scale-90',
              'aria-label': t('zoom.title')
            })
          })
        ]
      })
    ]
  // 区块索引：0=标题 1=主题 2=字体 3=纸纹 4=标签栏 5=密度 6=消息气泡 7=聊天背景 8=窗口透明
  //          9=开场标识 10-14=行为五件套（工具/推理/内嵌/悬浮框/应用操作） 15=完成提示音 16=底部提示+缩放
  const [secTitle, secTheme, secFont, secPaper, secTabStrip, secDensity, secBubble, secBackdrop,
         secTranslucency, secIntro, secToolView, secReasoning, secEmbeds, secPopout,
         secAppActions, secSound, secFooter] = secChildren

  // 双栏（唯一布局）：标题通栏 + 左右两列 + 底部提示
  return jsxs('div', {
    className: 'flex flex-col p-3',
    style: { width: '42rem' },
    children: [
      secTitle,
      jsxs('div', {
        className: 'flex flex-row',
        children: [
          // 左列：主题 → 聊天背景 → 悬浮输入框 → 折叠推理 → 应用操作 → 工具调用 → 内嵌预览 → 标签栏 → 密度 → 完成提示音
          jsxs('div', {
            className: 'flex min-w-0 flex-1 flex-col',
            style: { paddingRight: '12px' },
            children: [secTheme, secBackdrop, secPopout, secReasoning, secAppActions,
                      secToolView, secEmbeds, secTabStrip, secDensity, secSound]
          }),
          // 右列：消息气泡 → 窗口透明 → 霞鹜文楷 → 纸纹模拟 → 开场标识（pl 内联，与左列对称）
          jsxs('div', {
            className: 'flex min-w-0 flex-1 flex-col border-l border-(--ui-stroke-secondary)',
            style: { paddingLeft: '12px' },
            children: [secBubble, secTranslucency, secFont, secPaper, secIntro]
          })
        ]
      }),
      secFooter
    ]
  })
}

// ── 插件入口 ──────────────────────────────────────────────────────
export default {
  id: ID,
  name: 'Hermes Appearance Hub',
  description: '外观整合浮窗：双栏面板 · 悬停即见简介 · 12 主题/纸纹模拟/霞鹜文楷/窗口透明/开场标识/对话行为，状态栏一键设置。',
  register(ctx) {
    try {
      ctxRef = ctx

      // 插件级 i18n：注册 locale bundles，跟随 app 语言设置；卸载时随 disposer 摘除
      const disposeI18n = ctx.i18n.register(LOCALES)
      // 非响应式翻译器（register 时求值一次；语言切换后需重启更新状态栏文字）
      const ti18n = ctx.i18n.t

      // 按持久化状态初始化。纸纹默认开（原插件继承），字体默认关（v3.1：官方已有
      // 聊天字体自定义，一键策展不默认劫持；老用户存档不受影响，仅新装机默认翻转）
      if (ctx.storage.get(PAPER_KEY, true)) injectPaper()
      // ui-beautify（maple-ui-font-settings）旧键一次性迁移：幂等，迁完即删键
      migrateLegacyFontSettings()
      if (ctx.storage.get(FONT_KEY, false)) applyFont()
      // 官方聊天字体编辑监听常驻：开关开着时官方 inline 变化 → applyFont 让位/恢复
      watchOfficialChatFont()
      // 消息气泡：兜插件重载场景，按官方键恢复 CSS 变量（官方 app 启动已自恢复，幂等）
      applyUserBubble((() => { try { return localStorage.getItem(USER_BUBBLE_KEY) || 0 } catch { return 0 } })())
      injectBinshaoTheme()
      // 开场标识：先与原生键对账，再按最终状态恢复注入；
      // 挂 setItem 钩子后，设置页开关改动即时推送过来（与缩放 onChanged 同款推送模型）
      try {
        const nativeVal = localStorage.getItem(INTRO_NATIVE_KEY)
        if (nativeVal != null) introNativeLastWritten = nativeVal
        // 'off' 不作为持久档位（开/关由原生键承载）：历史遗留的 off 存档还原为
        // native，native/custom 存档必须保留——否则 hub 关闭后重启，「开」无从恢复原档位
        if (ctx.storage.get(INTRO_MODE_KEY, 'native') === 'off') {
          ctx.storage.set(INTRO_MODE_KEY, 'native')
        }
      } catch {}
      applyIntroMode(
        (() => {
          try {
            if (localStorage.getItem(INTRO_NATIVE_KEY) === 'false') return 'off'
          } catch {}
          return ctx.storage.get(INTRO_MODE_KEY, 'native') === 'custom' ? 'custom' : 'native'
        })()
      )
      installIntroStorageHook()
      // 界面缩放走原生机制（window.hermesDesktop.zoom）。
      // 挂模块级常驻监听：与弹窗开关无关，保证 Settings / View 菜单 / Cmd± 改缩放时
      // 反向同步（哪怕 hub 弹窗此刻没开，下次打开也已是最新值）。
      startNativeZoomWatch()
      // 完成提示音：插件自己播（与 app 内置音并存，面板「接管」开关可静音内置音）
      const offCue = host.onEvent('message.complete', () => {
        void playCompletionCue().catch(() => {})
      })
      // 预热官方 store 识别（后台异步，启动时闪烁不可见）：
      // 避免用户首次点聊天背景时键验证法探测导致开场标识闪动
      loadOfficialStores().catch(() => {})

      // 卸载/重载时清理注入，不留残留
      ctx.onDispose(() => {
        langObserver.disconnect()
        removePaper()
        removeFont()
        unwatchOfficialChatFont()
        resetIntroOnDispose()
        if (typeof zoomUnsubscribeNative === 'function') zoomUnsubscribeNative()
        zoomUnsubscribeNative = null
        zoomSubscribers.clear()
        disposeI18n()
        offCue()
        ctxRef = null
      })

      if (!ctx.storage.get(WELCOME_KEY, false)) {
        ctx.storage.set(WELCOME_KEY, true)
        host.notify({ kind: 'info', message: ti18n('notify.ready') })
      }

      // 标准状态栏条目：variant:'menu' + menuContent = 核心 DropdownMenu 弹窗，
      // 与 gateway / 命令中心等核心工具同一渲染路径；toggleLabel 使其出现在
      // 状态栏右键菜单（可勾选显隐）。
      //
      // 冷启动 locale 竞态修复：register 在模块加载时同步执行，而 app 的
      // display.language 走异步 IPC（I18nProvider 初始恒为 en），此刻求值的
      // label/title/toggleLabel 会卡在英文。declarative data 不响应 locale 变化，
      // 故挂 MutationObserver 监听 <html lang>（I18nProvider 每次 setLocale 都会
      // 同步写它）：lang 变化即用同 id 重注册，registry 按 id 原子替换 + invalidate，
      // 按钮文字随之刷新。弹窗内容走 React hook 本就响应式，不受此影响。
      const statusbarData = () => ({
        id: 'hub',
        area: 'statusBar.right',
        order: 100,
        data: {
          id: 'hub',                                    // 必填：右键显隐按此 id 持久化，缺了会存成 null 被过滤
          variant: 'menu',                              // → 核心 DropdownMenu
          label: ti18n('statusbar.label'),
          icon: jsx(icons.Palette, { className: 'size-3.5' }),
          title: ti18n('statusbar.title'),
          menuAlign: 'end',
          menuContent: jsx(AppearancePanel, {}),
          menuClassName: 'w-auto border-(--ui-stroke-secondary) p-0',
          toggleLabel: ti18n('statusbar.toggleLabel')
        }
      })
      ctx.register(statusbarData())

      let lastStatusbarLang = document.documentElement.lang
      const langObserver = new MutationObserver(() => {
        const lang = document.documentElement.lang
        if (!lang || lang === lastStatusbarLang) return
        lastStatusbarLang = lang
        ctx.register(statusbarData())
      })
      langObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] })
    } catch (e) {
      host.notify({ kind: 'error', message: ti18n('notify.failed') + (e && e.message) })
    }
  }
}
