// 验证「计入」勾选：取消一篇 → 卡片/表格/提示是否跟着变
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

await send('Page.navigate', { url: 'http://127.0.0.1:7789/' })
await sleep(2500)
await evalJs(`document.querySelector('.tab[data-v="content"]').click()`)
await sleep(800)
const before = await evalJs(`JSON.stringify({hint: document.querySelector('#tblHint').textContent, meta: document.querySelector('#meta').textContent, first: document.querySelector('#table tbody input.inc')?.checked})`)
console.log('BEFORE', before)
const clicked = await evalJs(`(() => { const b = document.querySelector('#table tbody input.inc'); if (!b) return 'NO_BOX'; b.click(); return 'clicked' })()`)
await sleep(1200)
const after = await evalJs(`JSON.stringify({hint: document.querySelector('#tblHint').textContent, meta: document.querySelector('#meta').textContent, cards: [...document.querySelectorAll('.card b')].slice(0,2).map(x=>x.textContent)})`)
console.log('CLICK', clicked)
console.log('AFTER', after)
const saved = await (await fetch('http://127.0.0.1:7789/api/exclude')).json()
console.log('SAVED', JSON.stringify(saved))
ws.close()
