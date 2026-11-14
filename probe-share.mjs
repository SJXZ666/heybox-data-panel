// 打开分享页，抓它的 XHR，找正文
const PORT = 9222
const id = process.argv[2] || '196000139'
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
    if (/xiaoheihe|api|bbs/i.test(u)) hits.push({ reqId: m.params.requestId, url: u })
  }
})
try {
  await cdp.send('Page.enable')
  await cdp.send('Network.enable')
  await cdp.send('Page.navigate', { url: `https://www.xiaoheihe.cn/bbs/post_share?link_id=${id}` })
  await sleep(9000)
  let found = 0
  for (const h of hits.slice(-40)) {
    try {
      const b = await cdp.send('Network.getResponseBody', { requestId: h.reqId })
      const text = b.base64Encoded ? Buffer.from(b.body, 'base64').toString('utf8') : b.body
      if (/P社|老玩家|CK3/.test(text)) {
        if (h.url.includes("link/tree")) { const j = JSON.parse(text); const l = (j.result && j.result.link) || {}; const info = Object.entries(l).filter(([k,v]) => typeof v === "string").map(([k,v]) => [k, v.length]); console.log(JSON.stringify({ keys: Object.keys(l), strings: info, textLen: (l.text||"").length, descLen: (l.description||"").length, head: String(l.text||l.description||"").slice(0,120) })) } else { console.log(JSON.stringify({ url: h.url, len: text.length })) }
        found++
      }
    } catch {}
  }
  console.log('hits:', hits.length, 'found:', found)
} finally { cdp.close() }
