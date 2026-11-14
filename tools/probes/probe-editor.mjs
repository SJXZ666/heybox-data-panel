const PORT = 9222
const id = process.argv[2]
const sleep = ms => new Promise(r => setTimeout(r, ms))
const urls = [
  `https://www.xiaoheihe.cn/creator/content_management/detail/${id}`,
  `https://www.xiaoheihe.cn/creator/publish/article?link_id=${id}`,
  `https://www.xiaoheihe.cn/creator/content_management/detail/${id}?tab=content`,
]
async function targets() { return (await fetch(`http://127.0.0.1:${PORT}/json/list`, { signal: AbortSignal.timeout(2000) })).json() }
function connect(page) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(page.webSocketDebuggerUrl)
    let idc = 0; const pending = new Map()
    ws.addEventListener('message', ev => {
      const m = JSON.parse(ev.data)
      if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.bad(new Error(m.error.message)) : p.ok(m.result) }
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
const cdp = await connect(page)
try {
  await cdp.send('Page.enable')
  for (const u of urls) {
    await cdp.send('Page.navigate', { url: u })
    await sleep(5000)
    const info = await cdp.send('Runtime.evaluate', {
      expression: `(() => { const els=[...document.querySelectorAll("a,button")].map(e=>(e.innerText||"").trim()+"|"+(e.href||"")).filter(s=>s.length>1); return JSON.stringify({els:els.slice(0,40), b:document.body.innerText.slice(0,300)}) })()`, const ed = document.querySelector('.ProseMirror, .ql-editor, [contenteditable=true]'); return JSON.stringify({ url: location.href, len: b.length, edLen: ed ? ed.innerText.length : 0, head: b.slice(0, 80) }) })()`,
      returnByValue: true,
    })
    console.log(info.result.value)
  }
} finally { cdp.close() }
