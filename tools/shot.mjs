// 截图：node shot.mjs <tab> <outfile> [clickSelector]
const tab = process.argv[2] || 'overview'
const out = process.argv[3] || 'shot.png'
const list = await (await fetch('http://127.0.0.1:9222/json/list')).json()
let page = list.find(t => t.type === 'page' && t.url.includes('7789'))
if (!page) page = list.find(t => t.type === 'page')
if (!page) { console.error('NO_PANEL_PAGE'); process.exit(1) }
const ws = new WebSocket(page.webSocketDebuggerUrl)
let id = 0
const pending = new Map()
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const mid = ++id
  pending.set(mid, { resolve, reject })
  ws.send(JSON.stringify({ id: mid, method, params }))
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
await send('Runtime.evaluate', { expression: `document.querySelector('.tab[data-v=${JSON.stringify(tab)}]').click()`, returnByValue: true })
await new Promise(r => setTimeout(r, 900))
if (process.argv[4]) {
  await send('Runtime.evaluate', { expression: `document.querySelector(${JSON.stringify(process.argv[4])}).click()`, returnByValue: true })
  await new Promise(r => setTimeout(r, 900))
}
const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
const fs = await import('node:fs')
fs.writeFileSync(out, Buffer.from(shot.data, 'base64'))
console.log('saved', out)
ws.close()
