export const fmt = (n) => (Number(n) || 0).toLocaleString('zh-CN')

export const pct = (a, b) => (b > 0 ? Math.round((a / b) * 100) : 0)

export const monthKey = (d) => String(d || '').slice(0, 7)

export const monthNow = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export const rate = (r, k) => (Number(r.views) > 0 ? (Number(r[k]) || 0) / Number(r.views) : 0)

export const numRate = (s) => {
  const v = parseFloat(String(s || '0').replace('%', '').trim())
  return Number.isFinite(v) ? v / 100 : 0
}

export async function getJSON(url) {
  const r = await fetch(url)
  if (!r.ok) throw new Error(`${r.status}`)
  return r.json()
}

export async function postJSON(url, body) {
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body || {}),
  })
  return r.json()
}

export function cutoff(range) {
  if (range === 'all') return '0000-00-00'
  const d = new Date()
  d.setDate(d.getDate() - Number(range))
  return d.toISOString().slice(0, 10)
}

export function inRange(r, range) {
  return (r.date || '') >= cutoff(range)
}


export function scoreMap(rows, exclude) {
  const skip = exclude || new Set()
  const list = (rows || []).filter((r) => Number(r.views) > 0)
  // 拟合与分位只用「计入」的篇目；被排除的仍然可以用这条曲线算分，但不进样本
  const sample = list.filter((r) => !skip.has(Number(r.id)))
  const pctOf = (arr, v) => {
    if (!arr.length) return 0.5
    let n = 0
    for (const x of arr) if (x <= v) n++
    return n / arr.length
  }
  const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x))
  const inter = (r) => (Number(r.likes) || 0) + (Number(r.favorites) || 0) * 2 + (Number(r.comments) || 0) * 2 + (Number(r.battery) || 0) * 3
  const ln = Math.log

  // 拟合「这个浏览量下，正常该有多少互动率」：ln(rate) = a + b*ln(views)
  // 大号天然互动率低，用这条线算残差，而不是拿绝对互动率跟小号比。
  const fit = (metric) => {
    const pts = sample
      .filter((r) => Number(r.views) >= 100 && metric(r) > 0)
      .map((r) => ({ x: ln(Number(r.views)), y: ln(metric(r) / Number(r.views)) }))
    if (pts.length < 6) return null
    const mx = pts.reduce((a, p) => a + p.x, 0) / pts.length
    const my = pts.reduce((a, p) => a + p.y, 0) / pts.length
    let num = 0, den = 0
    for (const p of pts) { num += (p.x - mx) * (p.y - my); den += (p.x - mx) ** 2 }
    const b = den ? clamp(num / den, -1.2, 0) : -0.45
    const a = my - b * mx
    return { a, b }
  }
  const resid = (f, r, metric) => {
    const v = Number(r.views) || 1
    const actual = metric(r) / v
    const exp = Math.exp(f.a + f.b * ln(v))
    return clamp(ln((actual + 1e-9) / (exp + 1e-9)), -1.5, 1.5)
  }

  const fEng = fit(inter)
  const fShare = fit((r) => Number(r.shares) || 0)
  const reachArr = sample.map((r) => ln(1 + (Number(r.views) || 0))).sort((a, b) => a - b)
  const engArr = fEng ? sample.map((r) => resid(fEng, r, inter)).sort((a, b) => a - b) : []
  const shareArr = fShare ? sample.map((r) => resid(fShare, r, (x) => Number(x.shares) || 0)).sort((a, b) => a - b) : []
  const ctrArr = sample.filter((r) => Number(r.exposure) > 0).map((r) => Number(r.views) / Number(r.exposure)).sort((a, b) => a - b)

  const out = new Map()
  for (const r of list) {
    const reach = pctOf(reachArr, ln(1 + (Number(r.views) || 0)))
    let eng = 0.5, spread = 0.5
    if (fEng) eng = pctOf(engArr, resid(fEng, r, inter))
    if (fShare) spread = pctOf(shareArr, resid(fShare, r, (x) => Number(x.shares) || 0))
    const ctr = Number(r.exposure) > 0 ? pctOf(ctrArr, Number(r.views) / Number(r.exposure)) : 0.5
    const score = reach * 40 + eng * 35 + spread * 15 + ctr * 10
    out.set(Number(r.id), Math.max(1, Math.round(score)))
  }
  return out
}
