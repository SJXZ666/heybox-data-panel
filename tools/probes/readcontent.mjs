// 读取单篇正文：用调试端口里已登录的 Edge 打开分享页，取正文长度与开头
// 用法：node readcontent.mjs <link_id>
const PORT = Number(process.env.HB_PORT || '9222')
const id = process.argv[2]
const sleep = ms => new Promise(r => setTimeout(r, ms))

async function targets() {
  const r = await fetch(`http://127.0.0.1:${PORT}/json/list`, { signal: AbortSignal.timeout(2000) })
  return r.json()
}

function connect(page) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(page.webSocketDebuggerUrl)
    let idc = 0
    const pending = new Map()
    ws.addEventListener('message', ev => {
      const m = JSON.parse(ev.data)
      if (m.id && pending.has(m.id)) {
        const { ok, bad } = pending.get(m.id)
        pending.delete(m.id)
        m.error ? bad(new Error(m.error.message)) : ok(m.result)
      }
    })
    ws.addEventListener('open', () => resolve({
      send(method, params = {}) {
        return new Promise((ok, bad) => {
          const mid = ++idc
          pending.set(mid, { ok, bad })
          ws.send(JSON.stringify({ id: mid, method, params }))
        })
      },
      close: () => ws.close(),
    }), { once: true })
    ws.addEventListener('error', () => reject(new Error('调试端口连不上')), { once: true })
  })
}

const evalJs = async (cdp, expression) => {
  const r = await cdp.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
  return r.result?.value
}

const pages = await targets()
const page = pages.find(t => t.type === 'page' && t.url.includes('xiaoheihe')) || pages.find(t => t.type === 'page')
if (!page) { console.log(JSON.stringify({ ok: false, error: '没有可用页面' })); process.exit(0) }

const cdp = await connect(page)
try {
  await cdp.send('Page.enable')
  await cdp.send('Page.navigate', { url: `https://www.xiaoheihe.cn/creator/content_management/detail/${id}` })
  let text = ''
  for (let i = 0; i < 20; i++) {
    await sleep(600)
    text = await evalJs(cdp, `(() => { const el = document.querySelector('.ProseMirror, [contenteditable=true], .article-content, article'); return el ? el.innerText : (document.body ? document.body.innerText : '') })()`)
    if (text && text.length > 200) break
  }
  console.log(JSON.stringify({ ok: true, len: text.length, head: text.slice(0, 60) }))
} catch (e) {
  console.log(JSON.stringify({ ok: false, error: e.message }))
} finally {
  cdp.close()
}
