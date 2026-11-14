// 截一张「计入」勾选的示意图：先排除一篇个人向帖子，截图，再勾回来
import { writeFileSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
const HERE = dirname(fileURLToPath(import.meta.url))
const OUT = join(HERE, '..', '截图')
mkdirSync(OUT, { recursive: true })
const sleep = ms => new Promise(r => setTimeout(r, ms))
const list = await (await fetch('http://127.0.0.1:9222/json/list')).json()
const page = list.find(t => t.type === 'page')
if (!page) { console.error('NO_PAGE'); process.exit(1) }
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
const r = await evalJs(`(() => {
  const rows = [...document.querySelectorAll('#table tbody tr')]
  const row = rows.find(tr => tr.querySelector('.title')?.textContent.includes('创作等级三级啦'))
  if (!row) return 'NO_ROW'
  const box = row.querySelector('input.inc')
  if (box.checked) box.click()
  window.scrollTo(0, document.body.scrollHeight - 1600)
  return 'excluded ' + box.dataset.id
})()`)
await sleep(1200)
const shot = await send('Page.captureScreenshot', { format: 'png' })
writeFileSync(join(OUT, '面板-计入勾选.png'), Buffer.from(shot.data, 'base64'))
console.log(r, 'saved 面板-计入勾选.png')
// 勾回来
await evalJs(`(() => { const rows=[...document.querySelectorAll('#table tbody tr')]; const row=rows.find(tr=>tr.querySelector('.title')?.textContent.includes('创作等级三级啦')); const b=row?.querySelector('input.inc'); if(b && !b.checked) b.click(); return 'restored' })()`)
await sleep(900)
console.log('exclude now', JSON.stringify(await (await fetch('http://127.0.0.1:7789/api/exclude')).json()))
ws.close()
