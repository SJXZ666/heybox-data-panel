// 抓创作中心详情页的网络响应，看看正文藏在哪个接口里
const PORT = 9222
const id = process.argv[2]
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

const pages = await targets()
const page = pages.find(t => t.type === 'page' && t.url.includes('xiaoheihe')) || pages.find(t => t.type === 'page')
const hits = []
const cdp = await connect(page, m => {
  if (m.method === 'Network.responseReceived') {
    const u = m.params.response.url
    if (/article|concept|bbs|content|detail/i.test(u)) hits.push({ reqId: m.params.requestId, url: u, type: m.params.type })
  }
})
try {
  await cdp.send('Page.enable')
  await cdp.send('Network.enable')
  await cdp.send('Page.navigate', { url: `https://www.xiaoheihe.cn/creator/content_management/detail/${id}` })
  await sleep(7000)
  for (const h of hits.slice(-25)) {
    try {
      const b = await cdp.send('Network.getResponseBody', { requestId: h.reqId })
      const text = b.base64Encoded ? Buffer.from(b.body, 'base64').toString('utf8') : b.body
      const has = /P社|老玩家|CK3/.test(text)
      if (has) { const j = JSON.parse(text); const r = j.result || {}; const a = r.article || {}; console.log(JSON.stringify({ keys: Object.keys(r), articleKeys: Object.keys(a), contentLen: String(a.content||a.content_html||"").length, htmlLen: String(a.html||"").length, desc: String(a.article_desc||"").slice(0,40) })) }
    } catch {}
  }
} finally { cdp.close() }
