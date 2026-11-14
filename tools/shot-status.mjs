// 截图：面板顶部（含自动抓取状态）
import { writeFileSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
const HERE = dirname(fileURLToPath(import.meta.url))
const OUT = join(HERE, '..', '截图')
mkdirSync(OUT, { recursive: true })
const sleep = ms => new Promise(r => setTimeout(r, ms))
const list = await (await fetch('http://127.0.0.1:9222/json/list')).json()
const page = list.find(t => t.type === 'page') || list[0]
const ws = new WebSocket(page.webSocketDebuggerUrl)
let id = 0
const pending = new Map()
const send = (m, p = {}) => new Promise((res, rej) => {
  const mid = ++id
  pending.set(mid, { resolve: res, reject: rej })
  ws.send(JSON.stringify({ id: mid, method: m, params: p }))
})
ws.addEventListener('message', ev => {
  const msg = JSON.parse(ev.data)
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id)
    pending.delete(msg.id)
    msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result)
  }
})
await new Promise((r, j) => { ws.addEventListener('open', r, { once: true }); ws.addEventListener('error', j, { once: true }) })
await send('Page.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1080, deviceScaleFactor: 2, mobile: false })
await send('Page.navigate', { url: 'http://127.0.0.1:7789/' })
await sleep(2600)
const meta = await send('Runtime.evaluate', { expression: `document.querySelector('#meta')?.textContent`, returnByValue: true })
console.log('META:', meta.result.value)
const r = await send('Page.captureScreenshot', { format: 'png' })
writeFileSync(join(OUT, '面板-抓取状态.png'), Buffer.from(r.data, 'base64'))
console.log('saved 面板-抓取状态.png')
ws.close()
