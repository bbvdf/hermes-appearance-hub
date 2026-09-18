/**
 * 把测试桩装到 node_modules/@hermes/plugin-sdk（桌面端真实 SDK 的替身）。
 * 用法：npm i -D react react-dom jsdom && node tests/setup.mjs
 */
import { mkdirSync, copyFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const dest = join(here, '..', 'node_modules', '@hermes', 'plugin-sdk')
mkdirSync(dest, { recursive: true })
for (const f of ['package.json', 'index.mjs']) copyFileSync(join(here, 'sdk-stub', f), join(dest, f))
console.log('SDK 桩已安装到', dest)
