// 抓小黑盒创作中心：文章列表 + 每篇的浏览/点赞/评论/分享/收藏/充电/得分
// 用法：node scrape.mjs   （会自己拉起带调试端口的 Edge；需要在那个窗口里登录过小黑盒）
import { writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
// 定时抓取用一个挪到屏幕外的窗口：不占前台，但复用已登录的 edge-profile
const HIDDEN = process.env.HB_HIDDEN === '1'
const PROFILE = join(HERE, 'edge-profile')
const LIST_URL = 'https://www.xiaoheihe.cn/creator/content_management/home?article_type=all'
const PORT = Number(process.env.HB_PORT || '9222')
const EDGE = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
].find(p => existsSync(p))

const sleep = ms => new Promise(r => setTimeout(r, ms))

async function targets() {
  const r = await fetch(`http://127.0.0.1:${PORT}/json/list`, { signal: AbortSignal.timeout(1500) })
  return r.json()
}

async function ensureBrowser() {
  try { await targets() } catch {
    if (!EDGE) throw new Error('找不到 Edge')
    mkdirSync(PROFILE, { recursive: true })
    const args = [
      `--remote-debugging-port=${PORT}`,
      `--user-data-dir=${PROFILE}`,
      '--no-first-run',
      LIST_URL,
    ]
    if (HIDDEN) args.unshift('--window-position=-32000,-32000', '--window-size=1440,1000',
      '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding')
    else args.push('--window-position=0,0', '--window-size=1440,1000')
    spawn(EDGE, args, { detached: true, stdio: 'ignore' }).unref()
    for (let i = 0; i < 40; i++) {
      await sleep(800)
      try { await targets(); break } catch {}
    }
  }
  const pages = await targets()
  return pages.find(t => t.type === 'page' && t.url.includes('xiaoheihe')) || pages.find(t => t.type === 'page')
}

function connect(page, onEvent) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(page.webSocketDebuggerUrl)
    let id = 0
    const pending = new Map()
    ws.addEventListener('message', ev => {
      const m = JSON.parse(ev.data)
      if (m.id && pending.has(m.id)) {
        const { resolve: ok, reject: bad } = pending.get(m.id)
        pending.delete(m.id)
        m.error ? bad(new Error(m.error.message)) : ok(m.result)
      } else if (m.method && onEvent) onEvent(m)
    })
    ws.addEventListener('open', () => resolve({
      send(method, params = {}) {
        return new Promise((ok, bad) => {
          const mid = ++id
          pending.set(mid, { resolve: ok, reject: bad })
          ws.send(JSON.stringify({ id: mid, method, params }))
        })
      },
      close: () => ws.close(),
    }), { once: true })
    ws.addEventListener('error', () => reject(new Error('调试端口连不上')), { once: true })
  })
}

const withTimeout = (p, ms, label) => Promise.race([
  p,
  new Promise((_, rej) => setTimeout(() => rej(new Error(`${label} 超时`)), ms)),
])

const evalJs = async (cdp, expression) => {
  const r = await withTimeout(
    cdp.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }),
    20000,
    '页面求值',
  )
  return r.result?.value
}

async function waitFor(cdp, needle, ms = 30000) {
  const t0 = Date.now()
  while (Date.now() - t0 < ms) {
    const ok = await evalJs(cdp, `performance.getEntriesByType('resource').some(e => e.name.includes(${JSON.stringify(needle)}))`)
    if (ok) return true
    await sleep(700)
  }
  return false
}

const page = await ensureBrowser()
if (!page) throw new Error('没有可用的浏览器页面')
let listUrl = null
let dataUrl = null
const cdp = await connect(page, m => {
  const u = m.params && m.params.request && m.params.request.url
  if (!u) return
  if (u.includes('author/concept/article/list')) listUrl = u
  if (u.includes('author/concept/article/data')) dataUrl = u
})

try {
  await cdp.send('Page.enable')
  await cdp.send('Network.enable')

  // 1) 列表：只截页面发出的签名 URL，实际请求改由 Node 带 cookie 发（后台窗口的页面求值会被节流）
  if (!page.url.includes('content_management/home')) {
    await cdp.send('Page.navigate', { url: LIST_URL })
  } else {
    await cdp.send('Page.reload', { ignoreCache: false })
  }
  for (let i = 0; i < 60 && !listUrl; i++) await sleep(500)
  if (!listUrl) throw new Error('列表接口没出来：检查是否登录')

  const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
  let cookie = ''
  try {
    const ck = await withTimeout(cdp.send('Network.getCookies', { urls: ['https://api.xiaoheihe.cn/', 'https://www.xiaoheihe.cn/'] }), 10000, '取 cookie')
    cookie = (ck.cookies || []).map(c => `${c.name}=${c.value}`).join('; ')
  } catch (err) {
    console.warn('拿不到 cookie：', err.message)
  }

  const listRows = []
  for (let offset = 0; offset < 800; offset += 20) {
    const u = new URL(listUrl)
    u.searchParams.set('offset', String(offset))
    u.searchParams.set('limit', '20')
    const r = await withTimeout(fetch(u.toString(), {
      headers: { cookie, 'user-agent': UA, referer: 'https://www.xiaoheihe.cn/' },
      signal: AbortSignal.timeout(15000),
    }), 20000, '列表请求')
    const j = await r.json()
    const arr = (j.result && j.result.articles) || []
    for (const a of arr) listRows.push({ id: a.link_id, title: a.title, createdAt: a.create_at, views: a.click || 0, likes: a.award || 0, comments: a.comment || 0 })
    if (arr.length < 20) break
  }
  if (!listRows.length) throw new Error('列表是空的')
  console.log('列表', listRows.length, '篇')

  // 2) 详情页只为拿数据接口的签名地址；拿不到就降级
  if (!dataUrl) {
    try {
      await withTimeout(cdp.send('Page.navigate', { url: `https://www.xiaoheihe.cn/creator/content_management/detail/${listRows[0].id}` }), 15000, '打开详情页')
      for (let i = 0; i < 40 && !dataUrl; i++) await sleep(500)
    } catch (err) {
      console.warn('详情页没拿到数据接口，降级为列表数据：', err.message)
    }
  }
  if (!dataUrl) console.warn('没有数据接口地址，本次只更新浏览/赞/评')

  const rows = []
  for (const it of listRows) {
    let art = {}
    let st = {}
    if (dataUrl && cookie) {
      try {
        const u = new URL(dataUrl)
        u.searchParams.set('link_id', String(it.id))
        const r = await withTimeout(fetch(u.toString(), {
          headers: { cookie, 'user-agent': UA, referer: 'https://www.xiaoheihe.cn/' },
          signal: AbortSignal.timeout(12000),
        }), 15000, '明细请求')
        const j = await r.json()
        art = j.result?.article || {}
        st = art.statistic_data || {}
      } catch (err) {
        console.warn('第', rows.length + 1, '篇明细失败：', err.message)
      }
    }
    const num = k => Number(String(st[k]?.total ?? 0).replace(/[^0-9.]/g, '')) || 0
    rows.push({
      id: it.id,
      title: art.title || it.title,
      createdAt: (Number(art.create_at) || Number(it.createdAt) || 0) * 1000,
      date: new Date((art.create_at || it.createdAt) * 1000).toISOString().slice(0, 10),
      views: st.click ? num('click') : (it.views || 0),
      likes: st.award ? num('award') : (it.likes || 0),
      comments: st.comment ? num('comment') : (it.comments || 0),
      shares: num('share'),
      favorites: num('favour'),
      battery: num('battery'),
      likeRate: st.award_rate?.total ?? '',
      favoriteRate: st.favour_rate?.total ?? '',
      commentRate: st.comment_rate?.total ?? '',
      shareRate: st.share_rate?.total ?? '',
      avgTime: num('avg_time'),
      avgComplete: num('avg_complete_time'),
      exposure: Number(art.exposure_count || 0),
      score: Number(art.content_score || 0),
      newFollow: num('new_follow'),
      contentLen: String(art.article_desc || '').replace(/<[^>]+>/g, '').length,
      imgs: (art.imgs || []).length,
      shareUrl: art.share_url || '',
    })
    await sleep(120)
    if (rows.length % 10 === 0) console.log('已抓', rows.length, '篇')
  }

  writeFileSync(join(HERE, 'data.json'), JSON.stringify({ updatedAt: new Date().toISOString(), rows }, null, 2), 'utf8')

  const head = ['标题', '日期', '浏览', '点赞', '评论', '分享', '收藏', '充电', '点赞率', '收藏率', '评论率', '分享率', '平均时长', '正文时长', '曝光', '内容得分', '新增粉丝']
  const csv = [head.join(','), ...rows.map(r => [r.title, r.date, r.views, r.likes, r.comments, r.shares, r.favorites, r.battery, r.likeRate, r.favoriteRate, r.commentRate, r.shareRate, r.avgTime, r.avgComplete, r.exposure, r.score, r.newFollow]
    .map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))].join('\n')
  writeFileSync(join(HERE, 'data.csv'), '\ufeff' + csv, 'utf8')
  console.log('完成：data.json / data.csv，共', rows.length, '篇')
} finally {
  cdp.close()
}
