// 在小黑盒详情页里找正文：全局状态、script、iframe、隐藏节点
const PORT = 9222
const id = process.argv[2] || '196000139'
const sleep = ms => new Promise(r => setTimeout(r, ms))
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
  await cdp.send('Page.navigate', { url: `https://www.xiaoheihe.cn/creator/content_management/detail/${id}` })
  await sleep(6500)
  const expr = `(() => {
    const out = {}
    out.url = location.href
    out.textLen = document.body.innerText.length
    out.iframes = [...document.querySelectorAll('iframe')].map(f => f.src)
    const keys = Object.keys(window).filter(k => /nuxt|state|init|data|article/i.test(k))
    out.globals = keys.slice(0, 30)
    let best = null
    for (const k of keys) {
      try {
        const v = window[k]
        const s = JSON.stringify(v)
        if (s && s.length > 2000 && s.includes('P社')) best = { k, len: s.length, head: s.slice(0, 200) }
      } catch {}
    }
    out.best = best
    const scripts = [...document.querySelectorAll('script')].map(s => s.textContent || '').filter(t => t.includes('P社'))
    out.scriptHits = scripts.map(t => t.length)
    out.scriptHead = scripts.length ? scripts[0].slice(0, 300) : null
    return JSON.stringify(out)
  })()`
  const r = await cdp.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })
  console.log(r.result.value)
} finally { cdp.close() }
