// 小黑盒数据面板服务：127.0.0.1:7789
// 页面 / 数据 / 抓取 / 分析 / 设置 / 历史快照 / 定时抓取
import http from 'node:http'
import { readFileSync, writeFileSync, existsSync, renameSync, mkdirSync, copyFileSync, rmSync, statSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'

const HERE = dirname(fileURLToPath(import.meta.url))
const PORT = Number(process.env.HEYBOX_PORT) || 7789
const HOST = '127.0.0.1'
const DATA = join(HERE, 'data.json')
const HISTORY = join(HERE, 'history.json')
const BODIES = join(HERE, 'bodies.json')
const CONFIG = join(HERE, 'config.json')
const SCHEDULE = join(HERE, 'schedule.json')
const PROFILE = join(HERE, 'edge-profile')
const ACCOUNTS = join(HERE, 'accounts')
const ACCOUNTS_JSON = join(HERE, 'accounts.json')
const ANALYSIS_FILE = join(HERE, 'analysis.json')
const ACTIVE_FILES = ['data.json', 'history.json', 'bodies.json', 'exclude.json', 'schedule.json', 'predictions.json', 'calibration.json']
const EDGE_PATHS = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
]

const readJson = (p, fb) => { try { return JSON.parse(readFileSync(p, 'utf8')) } catch { return fb } }
const writeJson = (p, v) => writeFileSync(p, JSON.stringify(v, null, 2), 'utf8')
const send = (res, code, type, body) => { res.writeHead(code, { 'content-type': type, 'cache-control': 'no-store' }); res.end(body) }

function cfg() {
  const c = readJson(CONFIG, {})
  return { apiKey: c.apiKey || '', model: c.model || 'deepseek-flash', autoScrape: c.autoScrape !== false, dailyHour: Number.isFinite(Number(c.dailyHour)) ? Number(c.dailyHour) : 18, monthlyPosts: Number(c.monthlyPosts) || 20, monthlyViews: Number(c.monthlyViews) || 50000, perPostViews: Number(c.perPostViews) || 1000, perPostRate: Number(c.perPostRate) || 3, perPostCount: Number(c.perPostCount) || 4 }
}

function runNode(script, args = [], timeoutMs = 240000, env = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [join(HERE, script), ...args], { cwd: HERE, windowsHide: true, env: { ...process.env, ...env } })
    let out = '', err = ''
    const timer = setTimeout(() => {
      try { child.kill() } catch {}
      // 子进程自己又拉起了 Edge，只杀直接子进程会留下孤儿，这里连整棵树一起收
      try { spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' }) } catch {}
      reject(new Error('超时'))
    }, timeoutMs)
    child.stdout.on('data', d => { out += d })
    child.stderr.on('data', d => { err += d })
    child.on('close', code => {
      clearTimeout(timer)
      code === 0 ? resolve(out) : reject(new Error((err || out || '').trim() || `退出码 ${code}`))
    })
  })
}

function appendSnapshot() {
  const data = readJson(DATA, { rows: [] })
  if (!data.rows?.length) return
  const day = new Date().toISOString().slice(0, 10)
  const hist = readJson(HISTORY, [])
  // 只存 id + 浏览：趋势图要的是“每个点都留下来”，不是当天的最后一张全量快照
  const rows = data.rows.map(r => ({ id: r.id, views: Number(r.views) || 0 }))
  hist.push({ day, at: new Date().toISOString(), rows })
  writeJson(HISTORY, hist.slice(-1200))
}

let running = false
let lastRun = readJson(SCHEDULE, null)
function saveSchedule() { try { writeJson(SCHEDULE, lastRun) } catch {} }

// 手动/定时抓取完成后，把还没有正文的篇目补一次（同一篇只抓一次）
function backfillBodies() {
  try {
    const data = readJson(DATA, { rows: [] })
    const bodies = readJson(BODIES, {})
    const missing = (data.rows || []).map((r) => Number(r.id)).filter((id) => id && !bodies[id])
    if (!missing.length) return
    const child = spawn(process.execPath, ['fetch-bodies.mjs', ...missing.map(String)], { cwd: HERE, detached: true, stdio: 'ignore' })
    child.unref()
    console.log(`补抓正文：${missing.length} 篇`)
  } catch (err) { console.log('补抓正文失败：', err.message) }
}

async function doScrape() {
  if (running) throw new Error('上一轮还在抓')
  running = true
  const t0 = Date.now()
  try {
    const out = await runNode('scrape.mjs', [], 240000, { HB_HIDDEN: '1' })
    appendSnapshot()
    try { evaluatePredictions() } catch (err) { console.log('预测自检失败：', err.message) }
    backfillBodies()
    lastRun = { at: new Date().toISOString(), ok: true, ms: Date.now() - t0, log: out.trim().split('\n').slice(-2).join(' / ') }
    saveSchedule()
    return lastRun
  } catch (err) {
    lastRun = { at: new Date().toISOString(), ok: false, ms: Date.now() - t0, error: err.message }
    saveSchedule()
    throw err
  } finally { running = false }
}

// 每分钟检查一次是否到点：重启、睡眠唤醒后都能补上，不依赖一次性的 setTimeout
let ticking = false
async function tick() {
  if (ticking || running) return
  const c = cfg()
  if (!c.autoScrape) return
  if (!existsSync(join(PROFILE, 'Default'))) return  // 还没登录就不自动抓
  // 每天固定 time 点抓一次：以「最近一个已到的抓取时刻」为准，关机/重启后能补
  const now = new Date()
  const due = new Date(now)
  due.setHours(c.dailyHour, 0, 0, 0)
  if (now < due) due.setDate(due.getDate() - 1)
  const last = lastRun?.at ? new Date(lastRun.at).getTime() : 0
  if (last >= due.getTime()) return
  ticking = true
  try { await doScrape() } catch (err) { console.log('定时抓取失败：', err.message) } finally { ticking = false }
}


function readAccounts() { return readJson(ACCOUNTS_JSON, { current: null, order: [] }) }

function saveCurrentAccount() {
  const st = readAccounts()
  if (!st.current) return st
  const dir = join(ACCOUNTS, st.current)
  mkdirSync(dir, { recursive: true })
  for (const f of ACTIVE_FILES) if (existsSync(join(HERE, f))) copyFileSync(join(HERE, f), join(dir, f))
  const prof = join(HERE, 'edge-profile')
  if (existsSync(prof)) {
    const dst = join(dir, 'edge-profile')
    rmSync(dst, { recursive: true, force: true })
    renameSync(prof, dst)
  }
  const meta = readJson(join(dir, 'meta.json'), {})
  writeJson(join(dir, 'meta.json'), { ...meta, id: st.current, savedAt: new Date().toISOString() })
  return st
}

function clearActive() {
  for (const f of ACTIVE_FILES) rmSync(join(HERE, f), { force: true })
  rmSync(join(HERE, 'edge-profile'), { recursive: true, force: true })
}

function loadAccount(id) {
  const dir = join(ACCOUNTS, id)
  if (!existsSync(dir)) return false
  clearActive()
  for (const f of ACTIVE_FILES) if (existsSync(join(dir, f))) copyFileSync(join(dir, f), join(HERE, f))
  const prof = join(dir, 'edge-profile')
  if (existsSync(prof)) {
    rmSync(join(HERE, 'edge-profile'), { recursive: true, force: true })
    renameSync(prof, join(HERE, 'edge-profile'))
  }
  return true
}

function ensureCurrentAccount() {
  const st = readAccounts()
  if (st.current) return st
  const d = readJson(DATA, { rows: [] })
  const hasAnything = (d.rows || []).length > 0 || existsSync(PROFILE)
  if (!hasAnything) return st
  const id = 'acc_default'
  st.current = id
  if (!st.order.includes(id)) st.order.push(id)
  const dir = join(ACCOUNTS, id)
  mkdirSync(dir, { recursive: true })
  writeJson(join(dir, 'meta.json'), { id, name: '原账号', createdAt: new Date().toISOString() })
  writeJson(ACCOUNTS_JSON, st)
  return st
}

function accountInfo(id) {
  const dir = join(ACCOUNTS, id)
  const d = readJson(join(dir, 'data.json'), { rows: [] })
  const meta = readJson(join(dir, 'meta.json'), {})
  let size = 0
  for (const f of ACTIVE_FILES) { try { if (existsSync(join(dir, f))) size += statSync(join(dir, f)).size } catch {} }
  return { id, name: meta.name || id, posts: (d.rows || []).length, dataAt: d.updatedAt || null, savedAt: meta.savedAt || null, size }
}

function median(arr) {
  const b = arr.filter(x => Number.isFinite(x)).sort((x, y) => x - y)
  if (!b.length) return 0
  const m = b.length >> 1
  return b.length % 2 ? b[m] : (b[m - 1] + b[m]) / 2
}

const CALIB = join(HERE, 'calibration.json')
const PREDS = join(HERE, 'predictions.json')

function readCalib() {
  return readJson(CALIB, { global: 1, posts: {}, updatedAt: null, mape: null, samples: 0 })
}
function saveCalib(c) { try { writeJson(CALIB, c) } catch {} }

// 找到「某个时间点之后最近的一次真实抓取」，用来给过去的预测打分
function actualAt(hist, id, needT) {
  let best = null
  for (const s of hist) {
    const row = (s.rows || []).find(x => Number(x.id) === Number(id))
    if (!row) continue
    const t = Date.parse(s.at || (s.day + 'T23:59:59'))
    if (!Number.isFinite(t) || t < needT) continue
    if (!best || t < best.t) best = { t, v: Number(row.views) || 0 }
  }
  return best
}

// 自检：把写过的预测点和后来的真实值对比，校准「全站系数」和「单篇系数」
function evaluatePredictions() {
  const hist = readJson(HISTORY, [])
  const preds = readJson(PREDS, [])
  const calib = readCalib()
  const byPost = new Map()
  const all = []
  const keep = []
  for (const rec of preds) {
    const rest = []
    for (const p of rec.points || []) {
      if (Date.now() < p.t) { rest.push(p); continue }
      const act = actualAt(hist, rec.id, p.t)
      if (!act) { rest.push(p); continue }
      const ratio = act.v / Math.max(1, p.v)
      all.push(ratio)
      if (!byPost.has(rec.id)) byPost.set(rec.id, [])
      byPost.get(rec.id).push(ratio)
    }
    if (rest.length) keep.push({ ...rec, points: rest })
  }
  // 还没有「写过的预测」可回看时，用历史点做walk-forward回测：
  // 站在前一个点，用再前一个点的速度按同样公式预测，再看实际差多少。
  if (!all.length) {
    const data = readJson(DATA, { rows: [] })
    for (const r of data.rows || []) {
      const pts = []
      for (const s of hist) {
        const row = (s.rows || []).find(x => Number(x.id) === Number(r.id))
        if (!row) continue
        const t = Date.parse(s.at || (s.day + 'T23:59:59'))
        if (Number.isFinite(t)) pts.push({ t, v: Number(row.views) || 0 })
      }
      pts.sort((a, b) => a.t - b.t)
      for (let i = 2; i < pts.length; i++) {
        const h1 = (pts[i - 1].t - pts[i - 2].t) / 3600e3
        const h2 = (pts[i].t - pts[i - 1].t) / 3600e3
        if (h1 < 6 || h2 < 6) continue
        const vph = Math.max(0, (pts[i - 1].v - pts[i - 2].v) / h1)
        const pred = pts[i - 1].v + vph * 96 * (1 - Math.exp(-h2 / 96))
        const ratio = pts[i].v / Math.max(1, pred)
        all.push(ratio)
        if (!byPost.has(r.id)) byPost.set(r.id, [])
        byPost.get(r.id).push(ratio)
      }
    }
    if (all.length) calib.source = 'backtest'
  }
  if (all.length) {
    calib.source = calib.source === 'backtest' ? 'backtest' : 'live'
    const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x))
    calib.global = Number(clamp(median(all), 0.5, 2).toFixed(3))
    for (const [id, rs] of byPost) {
      if (rs.length >= 2) calib.posts[id] = Number(clamp(median(rs), 0.6, 1.8).toFixed(3))
    }
    calib.samples = (Number(calib.samples) || 0) + all.length
    calib.mape = Number((median(all.map(r => Math.abs(r - 1))) * 100).toFixed(1))
    calib.updatedAt = new Date().toISOString()
    saveCalib(calib)
    writeJson(PREDS, keep.slice(-400))
  }
  return calib
}

// 浏览量预测：按「距发布多少小时」算，不用自然日，避免晚上发帖把第一天算残；
// 速度来自最近两次快照的真实小时增量；内容信号用摘要/配图/互动/曝光；
// 再用历史预测/实际比值的校准系数自我修正。
function forecastFor(id, days = 14) {
  const data = readJson(DATA, { rows: [] })
  const hist = readJson(HISTORY, [])
  const target = (data.rows || []).find(r => Number(r.id) === Number(id))
  if (!target) return { ok: false, error: '没有这篇的数据' }

  const pts = []
  for (const s of hist) {
    const row = (s.rows || []).find(x => Number(x.id) === Number(id))
    if (!row) continue
    const t = Date.parse(s.at || (s.day + 'T23:59:59'))
    if (!Number.isFinite(t)) continue
    pts.push({ t, v: Number(row.views) || 0, day: s.day })
  }
  pts.sort((a, b) => a.t - b.t)
  if (pts.length < 2) return { ok: false, error: '这篇还只有 1 个快照点，等下一次抓取再算' }

  const created = Number(target.createdAt) || Date.parse(target.date + 'T12:00:00')
  const last = pts[pts.length - 1]
  const prev = pts[pts.length - 2]

  // 账号先验：每篇最近一次「每天新增 / 当前浏览」，中位数
  const ratios = []
  for (const r of data.rows || []) {
    const ser = []
    for (const s of hist) {
      const row = (s.rows || []).find(x => Number(x.id) === Number(r.id))
      if (row) ser.push(Number(row.views) || 0)
    }
    if (ser.length >= 2 && ser[ser.length - 1] > 0) {
      const d = ser[ser.length - 1] - ser[ser.length - 2]
      if (d >= 0) ratios.push(d / ser[ser.length - 1])
    }
  }
  const priorRatio = median(ratios) || 0.02

  // 速度用「最近 24 小时」估；不足 24h 就退到最早的点，跨度太短再用账号先验兜底，
  // 否则两次抓取只隔 1 小时，小波动会被放大成每天几百。
  let ref = pts[0]
  for (const p of pts) {
    if (last.t - p.t >= 24 * 3600e3) ref = p
  }
  const spanH = Math.max(1, (last.t - ref.t) / 3600e3)
  let vph = Math.max(0, (last.v - ref.v) / spanH)
  if (spanH < 6) vph = Math.max(vph, ((Number(target.views) || 0) * priorRatio) / 24)

  // 衰减常数（小时）：默认 96h；跨度够 12h 且速度在掉才按比值推
  let tauH = 48
  if (pts.length >= 3 && spanH >= 12) {
    const a = pts[pts.length - 3], b = pts[pts.length - 2]
    const h1 = Math.max(1, (b.t - a.t) / 3600e3)
    const h2 = Math.max(1, (last.t - b.t) / 3600e3)
    const r1 = (b.v - a.v) / h1, r2 = (last.v - b.v) / h2
    if (r1 > 0 && r2 > 0 && r2 < r1) tauH = Math.max(12, Math.min(96, -h2 / Math.log(Math.max(0.05, Math.min(0.95, r2 / r1)))))
  }

  // 内容信号：互动率分位、曝光转化、摘要长度、配图数（正文拿不到，用这些替代）
  const eng = r => (Number(r.views) > 0 ? ((Number(r.likes) || 0) + (Number(r.favorites) || 0) + (Number(r.comments) || 0)) / Number(r.views) : 0)
  const ctr = r => (Number(r.exposure) > 0 ? Number(r.views) / Number(r.exposure) : 0)
  const allEng = (data.rows || []).map(eng).sort((a, b) => a - b)
  const myEng = eng(target)
  const pct = allEng.length ? allEng.filter(x => x <= myEng).length / allEng.length : 0.5
  let contentFactor = 0.8 + pct * 0.6
  const allCtr = (data.rows || []).map(ctr).sort((a, b) => a - b)
  if (allCtr.length && ctr(target) < allCtr[allCtr.length >> 1]) contentFactor *= 0.9
  const bodies = readJson(BODIES, {})
  const bodyText = String((bodies[id] || {}).text || '')
  const bodyLen = bodyText.length
  const descLen = Number(target.contentLen) || 0
  const imgCount = Number(target.imgs) || 0
  if (bodyLen >= 1200) contentFactor *= 1.04
  if (bodyLen > 0 && bodyLen < 300) contentFactor *= 0.96
  if (!bodyLen) contentFactor *= 0.97
  if (imgCount >= 3) contentFactor *= 1.03
  if (imgCount === 0) contentFactor *= 0.95

  // 自校准
  const calib = readCalib()
  const gFactor = (Number(calib.posts[id]) || 1) * (Number(calib.global) || 1)
  vph *= contentFactor * gFactor

  const predicted = []
  let prevAdd = 0
  for (let d = 1; d <= days; d++) {
    const cum = vph * tauH * (1 - Math.exp(-(d * 24) / tauH))
    const v = Math.round(last.v + cum)
    const t = last.t + d * 86400e3
    predicted.push({ d: Math.round(((t - created) / 86400e3) * 100) / 100, v, t })
    prevAdd = cum
  }

  // 记下预测，等以后有真实值时打分
  try {
    const preds = readJson(PREDS, [])
    const idx = preds.findIndex(r => Number(r.id) === Number(id) && Date.now() - Date.parse(r.at) < 6 * 3600e3)
    const rec = { id: Number(id), at: new Date().toISOString(), points: predicted.map(p => ({ t: p.t, v: p.v })) }
    if (idx >= 0) preds[idx] = rec
    else preds.push(rec)
    writeJson(PREDS, preds.slice(-400))
  } catch {}

  return {
    ok: true,
    id: Number(id),
    actual: pts.map(p => ({ d: Math.round(((p.t - created) / 86400e3) * 100) / 100, day: p.day, v: p.v })),
    predicted,
    params: {
      createdAt: created,
      lastInc: Math.round(last.v - ref.v),
      spanH: Number(spanH.toFixed(1)),
      dailyNow: Math.round(vph * 24),
      hourly: Number(vph.toFixed(2)),
      tauH: Math.round(tauH),
      contentFactor: Number(contentFactor.toFixed(2)),
      engagementPct: Number((pct * 100).toFixed(0)),
      descLen,
      bodyLen,
      imgCount,
      calibGlobal: calib.global,
      calibPost: calib.posts[id] || 1,
      mape: calib.mape,
      calibSamples: calib.samples,
      calibSource: calib.source || 'none',
      samples: pts.length,
    },
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${HOST}:${PORT}`)
  try {
    if (url.pathname === '/' || url.pathname === '/index.html') {
      const dist = join(HERE, 'web', 'dist', 'index.html')
      if (existsSync(dist)) return send(res, 200, 'text/html; charset=utf-8', readFileSync(dist))
      return send(res, 200, 'text/html; charset=utf-8', readFileSync(join(HERE, 'index.html')))
    }
    if (url.pathname === '/old') {
      return send(res, 200, 'text/html; charset=utf-8', readFileSync(join(HERE, 'index.html')))
    }
    if (url.pathname.startsWith('/assets/')) {
      const f = join(HERE, 'web', 'dist', url.pathname.slice(1))
      if (!existsSync(f)) return send(res, 404, 'text/plain; charset=utf-8', 'not found')
      const ext = url.pathname.split('.').pop()
      const mime = { js: 'application/javascript; charset=utf-8', css: 'text/css; charset=utf-8', svg: 'image/svg+xml', png: 'image/png', woff2: 'font/woff2', map: 'application/json' }[ext] || 'application/octet-stream'
      return send(res, 200, mime, readFileSync(f))
    }
    if (url.pathname === '/api/data') {
      const data = readJson(DATA, { rows: [], updatedAt: null })
      return send(res, 200, 'application/json; charset=utf-8', JSON.stringify({ ...data, lastRun, running, auto: cfg(), schedule: lastRun }))
    }
    if (url.pathname === '/api/history') {
      return send(res, 200, 'application/json; charset=utf-8', JSON.stringify(readJson(HISTORY, [])))
    }
    if (url.pathname === '/api/body') {
      const id = Number(url.searchParams.get('id'))
      const b = (readJson(BODIES, {}) || {})[id]
      return send(res, 200, 'application/json; charset=utf-8', JSON.stringify(b ? { ok: true, id, title: b.title, len: String(b.text || '').length, text: b.text } : { ok: false, error: '这篇还没有正文缓存' }))
    }
    if (url.pathname === '/api/forecast') {
      const id = url.searchParams.get('id')
      const days = Math.max(3, Math.min(30, Number(url.searchParams.get('days')) || 14))
      return send(res, 200, 'application/json; charset=utf-8', JSON.stringify(forecastFor(id, days)))
    }
    if (url.pathname === '/api/analysis' && req.method === 'GET') {
      return send(res, 200, 'application/json; charset=utf-8', JSON.stringify(readJson(ANALYSIS_FILE, { report: '', prompt: '', at: null })))
    }
    if (url.pathname === '/api/calibration') {
      return send(res, 200, 'application/json; charset=utf-8', JSON.stringify(evaluatePredictions()))
    }
    if (url.pathname === '/api/account' && req.method === 'GET') {
      const st = ensureCurrentAccount()
      const data = readJson(DATA, {})
      return send(res, 200, 'application/json; charset=utf-8', JSON.stringify({
        ok: true,
        loggedIn: existsSync(join(PROFILE, 'Default')),
        hasData: (data.rows || []).length > 0,
        dataAt: data.updatedAt || null,
        current: st.current,
        accounts: (st.order || []).map(accountInfo),
      }))
    }
    if (url.pathname === '/api/account/login' && req.method === 'POST') {
      const edge = EDGE_PATHS.find((x) => existsSync(x))
      if (!edge) return send(res, 500, 'application/json; charset=utf-8', JSON.stringify({ ok: false, error: '这台电脑上没找到 Microsoft Edge' }))
      ensureCurrentAccount()
      spawn(edge, [
        `--user-data-dir=${PROFILE}`,
        '--no-first-run',
        '--new-window',
        'https://www.xiaoheihe.cn/creator/content_management/home?article_type=all',
      ], { detached: true, stdio: 'ignore' }).unref()
      return send(res, 200, 'application/json; charset=utf-8', JSON.stringify({ ok: true }))
    }
    if (url.pathname === '/api/account/switch' && req.method === 'POST') {
      let body = ''
      for await (const chunk of req) body += chunk
      const p = body ? JSON.parse(body) : {}
      const st = ensureCurrentAccount()
      try {
        if (p.create) {
          if (st.current) saveCurrentAccount()
          clearActive()
          const id = 'acc_' + Date.now().toString(36)
          st.order = [...(st.order || []), id]
          st.current = id
          mkdirSync(join(ACCOUNTS, id), { recursive: true })
          writeJson(join(ACCOUNTS, id, 'meta.json'), { id, name: p.name || `账号 ${st.order.length}`, createdAt: new Date().toISOString() })
          writeJson(ACCOUNTS_JSON, st)
          return send(res, 200, 'application/json; charset=utf-8', JSON.stringify({ ok: true, current: id }))
        }
        const id = String(p.id || '')
        if (!id || !existsSync(join(ACCOUNTS, id))) {
          return send(res, 404, 'application/json; charset=utf-8', JSON.stringify({ ok: false, error: '找不到这个账号的本地数据' }))
        }
        if (st.current === id) return send(res, 200, 'application/json; charset=utf-8', JSON.stringify({ ok: true, current: id }))
        if (st.current) saveCurrentAccount()
        loadAccount(id)
        st.current = id
        writeJson(ACCOUNTS_JSON, st)
        return send(res, 200, 'application/json; charset=utf-8', JSON.stringify({ ok: true, current: id }))
      } catch (err) {
        return send(res, 500, 'application/json; charset=utf-8', JSON.stringify({ ok: false, error: '切换失败：先把登录用的 Edge 窗口关掉再试（' + err.message + '）' }))
      }
    }
    if (url.pathname === '/api/settings' && req.method === 'GET') {
      const c = cfg()
      const masked = c.apiKey ? c.apiKey.slice(0, 6) + '…' + c.apiKey.slice(-4) : ''
      return send(res, 200, 'application/json; charset=utf-8', JSON.stringify({ ...c, apiKey: masked, hasKey: !!c.apiKey }))
    }
    if (url.pathname === '/api/settings' && req.method === 'POST') {
      let body = ''
      for await (const chunk of req) body += chunk
      const p = body ? JSON.parse(body) : {}
      const c = cfg()
      if (typeof p.apiKey === 'string' && p.apiKey && !p.apiKey.includes('…')) c.apiKey = p.apiKey.trim()
      if (typeof p.model === 'string' && p.model) c.model = p.model.trim()
      if (typeof p.autoScrape === 'boolean') c.autoScrape = p.autoScrape
      if (Number.isFinite(Number(p.dailyHour)) && Number(p.dailyHour) >= 0 && Number(p.dailyHour) <= 23) c.dailyHour = Math.round(Number(p.dailyHour))
      if (Number(p.monthlyPosts) > 0) c.monthlyPosts = Math.round(Number(p.monthlyPosts))
      if (Number(p.monthlyViews) > 0) c.monthlyViews = Math.round(Number(p.monthlyViews))
      if (Number(p.perPostViews) > 0) c.perPostViews = Math.round(Number(p.perPostViews))
      if (Number(p.perPostRate) >= 0) c.perPostRate = Number(p.perPostRate)
      if (Number(p.perPostCount) > 0) c.perPostCount = Math.round(Number(p.perPostCount))
      writeJson(CONFIG, c)
      return send(res, 200, 'application/json; charset=utf-8', JSON.stringify({ ok: true, hasKey: !!c.apiKey, model: c.model, autoScrape: c.autoScrape, dailyHour: c.dailyHour, monthlyPosts: c.monthlyPosts, monthlyViews: c.monthlyViews, perPostViews: c.perPostViews, perPostRate: c.perPostRate, perPostCount: c.perPostCount }))
    }
    if (url.pathname === '/api/exclude' && req.method === 'GET') {
      const ids = readJson(join(HERE, 'exclude.json'), { ids: [] }).ids || []
      return send(res, 200, 'application/json; charset=utf-8', JSON.stringify({ ids }))
    }
    if (url.pathname === '/api/exclude' && req.method === 'POST') {
      let body = ''
      for await (const chunk of req) body += chunk
      const p = body ? JSON.parse(body) : {}
      const ids = Array.isArray(p.ids) ? p.ids.map(Number).filter(Number.isFinite) : []
      writeJson(join(HERE, 'exclude.json'), { ids })
      return send(res, 200, 'application/json; charset=utf-8', JSON.stringify({ ok: true, count: ids.length }))
    }
    if (url.pathname === '/api/scrape' && req.method === 'POST') {
      const r = await doScrape(false)
      const data = readJson(DATA, { rows: [] })
      return send(res, 200, 'application/json; charset=utf-8', JSON.stringify({ ok: true, count: data.rows.length, updatedAt: data.updatedAt, ms: r.ms }))
    }
    if (url.pathname === '/api/analyze' && req.method === 'POST') {
      let body = ''
      for await (const chunk of req) body += chunk
      const payload = body ? JSON.parse(body) : {}
      const args = payload.mode === 'prompt' ? ['--prompt-only'] : []
      const out = await runNode('analyze.mjs', args, 180000)
      const report = existsSync(join(HERE, '分析报告.md')) ? readFileSync(join(HERE, '分析报告.md'), 'utf8') : ''
      const prompt = existsSync(join(HERE, '分析提示词.md')) ? readFileSync(join(HERE, '分析提示词.md'), 'utf8') : ''
      const prev = readJson(ANALYSIS_FILE, {})
      const saved = {
        at: new Date().toISOString(),
        mode: payload.mode === 'prompt' ? 'prompt' : 'report',
        report: payload.mode === 'prompt' ? (prev.report || '') : report,
        prompt: prompt || prev.prompt || '',
      }
      writeJson(ANALYSIS_FILE, saved)
      return send(res, 200, 'application/json; charset=utf-8', JSON.stringify({ ok: true, log: out.trim(), report: saved.report, prompt: saved.prompt, at: saved.at }))
    }
    return send(res, 404, 'text/plain; charset=utf-8', 'not found')
  } catch (err) {
    return send(res, 500, 'application/json; charset=utf-8', JSON.stringify({ ok: false, error: err.message || String(err) }))
  }
})

server.listen(PORT, HOST, () => {
  console.log(`[heybox-panel] http://${HOST}:${PORT}`)
  // 每分钟看一次到点没有；重启、睡眠唤醒后都会自动补
  void tick()
  setInterval(() => { void tick() }, 60_000)
})
