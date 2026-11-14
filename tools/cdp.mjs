// 极简 CDP 求值：node cdp.mjs "<表达式>" [url 片段]
const expr = process.argv[2] || 'document.title'
const match = process.argv[3] || 'xiaoheihe'
const list = await (await fetch('http://127.0.0.1:9222/json/list')).json()
const page = list.find(t => t.type === 'page' && t.url.includes(match)) || list.find(t => t.type === 'page')
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
  const msg = JSON.parse(ev.data)
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id)
    pending.delete(msg.id)
    msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result)
  }
})
await new Promise((res, rej) => { ws.addEventListener('open', res, { once: true }); ws.addEventListener('error', rej, { once: true }) })
try {
  const res = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })
  console.log(typeof res.result?.value === 'string' ? res.result.value : JSON.stringify(res.result?.value, null, 2))
} finally { ws.close() }
