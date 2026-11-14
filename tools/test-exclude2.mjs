// 重新验证勾选：把当前被排除的那篇勾回来，确认统计恢复
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
await sleep(2600)
await evalJs(`document.querySelector('.tab[data-v="content"]').click()`)
await sleep(800)
console.log('STATE', await evalJs(`JSON.stringify({hint: document.querySelector('#tblHint').textContent, meta: document.querySelector('#meta').textContent, cards: [...document.querySelectorAll('.card b')].slice(0,2).map(x=>x.textContent)})`))
const r = await evalJs(`(() => { const b = [...document.querySelectorAll('#table tbody input.inc')].find(x => !x.checked); if (!b) return 'NONE_OFF'; b.click(); return 're-included ' + b.dataset.id })()`)
await sleep(1300)
console.log('ACTION', r)
console.log('AFTER', await evalJs(`JSON.stringify({hint: document.querySelector('#tblHint').textContent, meta: document.querySelector('#meta').textContent, cards: [...document.querySelectorAll('.card b')].slice(0,2).map(x=>x.textContent)})`))
console.log('SAVED', JSON.stringify(await (await fetch('http://127.0.0.1:7789/api/exclude')).json()))
ws.close()
