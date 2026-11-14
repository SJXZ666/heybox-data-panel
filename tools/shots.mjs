// 抓面板五个视图的截图：node shots.mjs
// 需要 7789 面板服务在跑；会复用调试浏览器（9222）里的任意页面。
import { writeFileSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const OUT = join(HERE, '..', '截图')
mkdirSync(OUT, { recursive: true })
const PANEL = 'http://127.0.0.1:7789/'

const sleep = ms => new Promise(r => setTimeout(r, ms))
const list = await (await fetch('http://127.0.0.1:9222/json/list')).json()
const page = list.find(t => t.type === 'page')
if (!page) { console.error('NO_PAGE'); process.exit(1) }

const ws = new WebSocket(page.webSocketDebuggerUrl)
let id = 0
const pending = new Map()
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const msgId = ++id
  pending.set(msgId, { resolve, reject })
  ws.send(JSON.stringify({ id: msgId, method, params }))
})
ws.addEventListener('message', ev => {
  const m = JSON.parse(ev.data)
  if (m.id && pending.has(m.id)) {
    const { resolve, reject } = pending.get(m.id)
    pending.delete(m.id)
    m.error ? reject(new Error(m.error.message)) : resolve(m.result)
  }
})
await new Promise((res, rej) => { ws.addEventListener('open', res, { once: true }); ws.addEventListener('error', rej, { once: true }) })

const evalJs = async expression => {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
  return r.result?.value
}

await send('Page.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1080, deviceScaleFactor: 2, mobile: false })
await send('Page.navigate', { url: PANEL })
await sleep(2500)

async function shot(name) {
  const r = await send('Page.captureScreenshot', { format: 'png' })
  const file = join(OUT, name)
  writeFileSync(file, Buffer.from(r.data, 'base64'))
  console.log('saved', file)
}

const views = ['overview', 'charts', 'content', 'settings']
for (const v of views) {
  await evalJs(`document.querySelector('.tab[data-v="${v}"]').click()`)
  await sleep(900)
  await shot(`面板-${v}.png`)
}

// 单篇：在内容页点第一行
await evalJs(`document.querySelector('.tab[data-v="content"]').click()`)
await sleep(600)
const clicked = await evalJs(`(() => { const row = document.querySelector('tbody tr'); if (!row) return false; row.click(); const rows = [...document.querySelectorAll('tbody tr')]; rows[0]?.querySelector('td')?.click(); return true })()`)
await sleep(900)
await evalJs(`document.querySelector('.tab[data-v="post"]').click()`)
await sleep(900)
await shot('面板-post.png')
console.log('row clicked =', clicked)
ws.close()
