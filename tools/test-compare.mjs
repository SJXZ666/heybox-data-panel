// 核对对比表差值方向：选一篇浏览更高的对比篇，看差值是否为正
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
// 找一篇低浏览的（多美 79）打开
await evalJs(`(() => { const rows=[...document.querySelectorAll('#table tbody tr')]; const r=rows.find(x=>x.innerText.includes('多美成立')); r?.click(); return !!r })()`)
await sleep(1000)
// 选浏览最高那篇做对比
const picked = await evalJs(`(() => { const s=document.querySelector('#cmpSel'); if(!s) return 'NO'; const opt=[...s.options].find(o=>o.text.includes('P社入坑')); s.value=opt.value; s.dispatchEvent(new Event('change')); return opt.text.slice(0,20) })()`)
await sleep(600)
console.log('picked', picked)
console.log('table', await evalJs(`document.querySelector('#cmpBox').innerText.slice(0,260)`))
await evalJs(`document.querySelector('#cmpBox')?.scrollIntoView({block:'center'})`)
await sleep(400)
const r = await send('Page.captureScreenshot', { format: 'png' })
writeFileSync(join(OUT, '面板-compare.png'), Buffer.from(r.data, 'base64'))
console.log('saved 面板-compare.png')
ws.close()
