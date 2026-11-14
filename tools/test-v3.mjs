// 验证 v3 新功能：目标进度、纵向对照、热力图、48h、两篇对比
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
const shot = async name => {
  const r = await send('Page.captureScreenshot', { format: 'png' })
  writeFileSync(join(OUT, name), Buffer.from(r.data, 'base64'))
  console.log('shot', name)
}

await send('Page.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1080, deviceScaleFactor: 2, mobile: false })
await send('Page.navigate', { url: 'http://127.0.0.1:7789/?v=3' })
await sleep(2600)

console.log('fns', await evalJs(`JSON.stringify({goals: typeof renderGoals, vs: typeof renderVsBest, heat: typeof drawHeatmap, f48: typeof drawFirst48, cmp: typeof wireCompare})`))
console.log('overview', await evalJs(`JSON.stringify({goals: document.querySelector('#goals')?.innerText.slice(0,80), vs: document.querySelector('#vsBest')?.innerText.slice(0,80), cards: [...document.querySelectorAll('.card b')].slice(0,2).map(x=>x.textContent)})`))
await shot('面板-overview.png')

await evalJs(`document.querySelector('.tab[data-v="charts"]').click()`)
await sleep(1200)
console.log('charts', await evalJs(`JSON.stringify({heat: document.querySelectorAll('#heatmap i').length, heatHint: document.querySelector('#heatHint')?.innerText, f48: document.querySelector('#chart48')?.innerText.slice(0,120)})`))
await shot('面板-charts.png')

// 单篇 + 两篇对比
await evalJs(`document.querySelector('.tab[data-v="content"]').click()`)
await sleep(600)
await evalJs(`(() => { const rows=[...document.querySelectorAll('#table tbody tr')]; rows[0]?.click(); return rows.length })()`)
await sleep(800)
console.log('post', await evalJs(`JSON.stringify({title: document.querySelector('#postDetail h2')?.innerText, cmpSel: document.querySelectorAll('#cmpSel option').length, bars: document.querySelectorAll('#postDetail .barline').length})`))
await evalJs(`(() => { const s=document.querySelector('#cmpSel'); if(!s) return 'NO'; s.value=s.options[1]?.value; s.dispatchEvent(new Event('change')); return s.value })()`)
await sleep(500)
console.log('cmpTable', await evalJs(`document.querySelector('#cmpBox table') ? document.querySelector('#cmpBox table').innerText.slice(0,120) : 'NONE'`))
await shot('面板-post.png')
ws.close()
