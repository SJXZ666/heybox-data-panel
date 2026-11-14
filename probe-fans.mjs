// 看创作中心首页/个人页有没有「粉丝数」接口
const PORT = 9222
const sleep = ms => new Promise(r => setTimeout(r, ms))
async function targets() { return (await fetch(`http://127.0.0.1:${PORT}/json/list`, { signal: AbortSignal.timeout(2000) })).json() }
function connect(page, onEvent) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(page.webSocketDebuggerUrl)
    let idc = 0; const pending = new Map()
    ws.addEventListener('message', ev => {
      const m = JSON.parse(ev.data)
      if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.bad(new Error(m.error.message)) : p.ok(m.result) }
      else if (m.method && onEvent) onEvent(m)
    })
    ws.addEventListener('open', () => resolve({
      send(method, params = {}) { return new Promise((ok, bad) => { const mid = ++idc; pending.set(mid, { ok, bad }); ws.send(JSON.stringify({ id: mid, method, params })) }) },
      close: () => ws.close(),
    }), { once: true })
    ws.addEventListener('error', () => reject(new Error('port')), { once: true })
  })
}
const list = await targets()
const page = list.find(t => t.type === 'page' && t.url.includes('xiaoheihe')) || list.find(t => t.type === 'page')
const hits = []
const cdp = await connect(page, m => {
  if (m.method === 'Network.responseReceived') {
    const u = m.params.response.url
    if (/user|author|follow|fans|profile|statistic/i.test(u) && u.includes('xiaoheihe')) hits.push({ id: m.params.requestId, url: u })
  }
})
try {
  await cdp.send('Page.enable')
  await cdp.send('Network.enable')
  for (const url of ['https://www.xiaoheihe.cn/creator/content_management/home?article_type=all', 'https://www.xiaoheihe.cn/creator/home']) {
    await cdp.send('Page.navigate', { url })
    await sleep(6000)
  }
  const seen = new Set()
  for (const h of hits.slice(-40)) {
    const key = h.url.split('?')[0]
    if (seen.has(key)) continue
    seen.add(key)
    try {
      const b = await cdp.send('Network.getResponseBody', { requestId: h.id })
      const text = b.base64Encoded ? Buffer.from(b.body, 'base64').toString('utf8') : b.body
      const hasFollow = /follow|fans|粉丝/i.test(text)
      console.log(JSON.stringify({ url: key, len: text.length, hasFollow, head: text.slice(0, 160) }))
    } catch {}
  }
} finally { cdp.close() }
