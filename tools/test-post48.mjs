// 验证 48 小时曲线已进单篇页，并截图
import { writeFileSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
const HERE = dirname(fileURLToPath(import.meta.url))
const OUT = join(HERE, '..', '截图')
mkdirSync(OUT, { recursive: true })
const sleep = ms => new Promise(r => setTimeout(r, ms))
const list = await (await fetch('http://127.0.0.1:9222/json/list')).json()
const page = list.find(t => t.type === 'page')
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
const evalJs = async e => (await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true })).result?.value
await send('Page.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1080, deviceScaleFactor: 2, mobile: false })
await send('Page.navigate', { url: 'http://127.0.0.1:7789/' })
await sleep(2500)
await evalJs(`document.querySelector('.tab[data-v="content"]').click()`)
await sleep(700)
await evalJs(`(() => { const tr = document.querySelector('#table tbody tr'); tr?.click(); return !!tr })()`)
await sleep(1200)
console.log('post48', await evalJs(`(document.querySelector('#post48')||{}).innerText?.slice(0,140)`))
console.log('chartsHas48', await evalJs(`!!document.querySelector('#chart48')`))
await evalJs(`document.querySelector('#post48')?.scrollIntoView({block:'center'})`)
await sleep(500)
const r = await send('Page.captureScreenshot', { format: 'png' })
writeFileSync(join(OUT, '面板-post48.png'), Buffer.from(r.data, 'base64'))
console.log('saved 面板-post48.png')
ws.close()
