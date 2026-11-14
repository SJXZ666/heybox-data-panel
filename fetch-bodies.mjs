// 批量抓正文：逐篇打开分享页，截获 link/tree 的 text 字段
// 用法：node fetch-bodies.mjs 196000139 196232961 ...
import { writeFileSync, readFileSync, existsSync } from 'node:fs'
const PORT = 9222
const OUT = 'bodies.json'
const ids = process.argv.slice(2).map(Number)
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
function parseLinkText(raw) {
  let t = String(raw || '')
  try { const j = JSON.parse(t); if (Array.isArray(j)) t = j.map(x => x.text || x.content || '').join('') } catch {}
  return strip(t)
}
const strip = html => String(html || '')
  .replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n').replace(/<[^>]+>/g, '')
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
  .replace(/\n{3,}/g, '\n\n').trim()

const pages = await targets()
const page = pages.find(t => t.type === 'page' && t.url.includes('xiaoheihe')) || pages.find(t => t.type === 'page')
let pendingId = null
const got = new Map()
const cdp = await connect(page, m => {
  if (m.method === 'Network.responseReceived' && pendingId && m.params.response.url.includes('link/tree') && m.params.response.url.includes(`link_id=${pendingId}`)) {
    const rid = m.params.requestId
    cdp.send('Network.getResponseBody', { requestId: rid }).then(r => {
      const text = r.base64Encoded ? Buffer.from(r.body, 'base64').toString('utf8') : r.body
      try {
        const j = JSON.parse(text)
        const link = (j.result && j.result.link) || {}
        got.set(pendingId, { title: link.title || '', len: String(link.text || '').length, text: parseLinkText(link.text), createAt: link.create_at })
      } catch {}
    }).catch(() => {})
  }
})
const out = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : {}
try {
  await cdp.send('Page.enable')
  await cdp.send('Network.enable')
  for (const id of ids) {
    pendingId = id
    await cdp.send('Page.navigate', { url: `https://www.xiaoheihe.cn/bbs/post_share?link_id=${id}` })
    for (let i = 0; i < 40 && !got.has(id); i++) await sleep(500)
    const b = got.get(id)
    if (b) { out[id] = b; console.log(`ok ${id} ${b.len}B ${b.title}`) }
    else console.log(`miss ${id}`)
    await sleep(600)
  }
  writeFileSync(OUT, JSON.stringify(out, null, 1), 'utf8')
  console.log('saved', Object.keys(out).length)
} finally { cdp.close() }
