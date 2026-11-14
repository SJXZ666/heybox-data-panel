import React, { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { fmt, pct, monthKey, monthNow, rate, inRange, getJSON, postJSON, scoreMap } from './lib'
import { Panel, Section, Stat, Bar, Pill, ShimmerButton } from './components'
import { Line, Bars, HBars, Scatter, Heatmap, Forecast } from './charts'

const statKeys = [
  ['views', '总浏览'], ['likes', '总点赞'], ['comments', '总评论'],
  ['favorites', '总收藏'], ['shares', '总分享'], ['battery', '总充电'],
]

export function Overview({ data, exclude, range, onOpenPost, onScrape, scraping }) {
  const rows = useMemo(() => data.rows.filter((r) => inRange(r, range) && !exclude.has(Number(r.id))), [data, range, exclude])
  const post = useMemo(() => (Number(data.auto?.monthlyPosts) || 20), [data])
  const viewsGoal = Number(data.auto?.monthlyViews) || 50000
  const perViews = Number(data.auto?.perPostViews) || 1000
  const perRate = Number(data.auto?.perPostRate ?? 3)
  const perCount = Number(data.auto?.perPostCount) || 4
  const mk = monthNow()
  const monthRows = rows.filter((r) => monthKey(r.date) === mk)
  const mv = monthRows.reduce((a, r) => a + (Number(r.views) || 0), 0)
  const hitViews = monthRows.filter((r) => (Number(r.views) || 0) >= perViews).length
  const hitRate = monthRows.filter((r) => rate(r, 'likes') + rate(r, 'favorites') + rate(r, 'comments') >= perRate / 100).length
  const sorted = [...rows].sort((a, b) => b.date.localeCompare(a.date))
  const recent = sorted.slice(0, 6)
  const best = [...rows].sort((a, b) => (b.views || 0) - (a.views || 0))[0]
  const last10 = [...sorted].slice(0, 10)
  const avg10 = last10.length ? Math.round(last10.reduce((a, r) => a + (Number(r.views) || 0), 0) / last10.length) : 0
  const allAvg = rows.length ? Math.round(rows.reduce((a, r) => a + (Number(r.views) || 0), 0) / rows.length) : 0
  const engTotal = (r) => (Number(r.likes) || 0) + (Number(r.favorites) || 0) + (Number(r.comments) || 0)
  const withExp = rows.filter((r) => Number(r.exposure) > 1000)
  const lowCtr = withExp.filter((r) => (Number(r.views) || 0) / Number(r.exposure) < 0.15).slice(0, 3)
  const vs = [...rows].map((r) => Number(r.views) || 0).sort((a, b) => a - b)
  const p75 = vs[Math.floor(vs.length * 0.75)] || 0
  const lowEng = rows.filter((r) => (Number(r.views) || 0) >= p75 && engTotal(r) / Math.max(1, Number(r.views)) < 0.03).slice(0, 3)

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
        <Stat label="篇数" value={rows.length} />
        {statKeys.map(([k, label]) => (
          <Stat key={k} label={label} value={rows.reduce((a, r) => a + (Number(r[k]) || 0), 0)} />
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel>
          <div className="mb-1 flex items-center justify-between">
            <div className="text-[13px] font-semibold text-ink">本月目标</div>
            <Pill tone="dim">{mk}</Pill>
          </div>
          <Bar label="本月篇数" value={monthRows.length} target={post} suffix="篇" />
          <Bar label="本月浏览" value={mv} target={viewsGoal} suffix="次" />
          <Bar label="单篇达标（浏览）" value={hitViews} target={perCount} suffix="篇" extra={`每篇 ≥ ${fmt(perViews)}`} />
          <Bar label="单篇达标（互动）" value={hitRate} target={perCount} suffix="篇" extra={`每篇互动率 ≥ ${perRate}%`} />
          <div className="mt-2 text-[11px] text-dim">按本月已发布、且「计入」的内容算。</div>
        </Panel>

        <Panel>
          <div className="text-[13px] font-semibold text-ink">历史最好 vs 最近 10 篇</div>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-line bg-white/[0.02] p-4">
              <div className="text-[11px] text-dim">历史最好</div>
              <div className="mt-1 font-num text-2xl font-semibold text-accent">{fmt(best?.views || 0)}</div>
              <div className="mt-1 truncate text-[11px] text-muted">{best?.title}</div>
            </div>
            <div className="rounded-xl border border-line bg-white/[0.02] p-4">
              <div className="text-[11px] text-dim">最近 10 篇平均</div>
              <div className="mt-1 font-num text-2xl font-semibold text-ink">{fmt(avg10)}</div>
              <div className="mt-1 text-[11px] text-muted">全账号平均 {fmt(allAvg)}</div>
            </div>
          </div>
          <div className="mt-4 text-[11px] text-dim">
            {best ? `${best.date} 发布，至今 ${fmt(best.views)} 浏览；最近 10 篇合计 ${fmt(last10.reduce((a, r) => a + (Number(r.views) || 0), 0))}。` : ''}
          </div>
        </Panel>
      </div>

      <Section>最近发布</Section>
      <div className="space-y-2">
        {recent.map((r) => (
          <button key={r.id} onClick={() => onOpenPost(r.id)} className="flex w-full items-center gap-4 rounded-xl border border-line bg-white/[0.02] px-4 py-3 text-left transition hover:border-accent/30 hover:bg-white/[0.04]">
            <div className="min-w-0 flex-1 truncate text-[13px] text-ink/90">{r.title}</div>
            <div className="shrink-0 font-num text-[12px] text-muted">{r.date} · {fmt(r.views)} 浏览 · {fmt(r.likes)} 赞</div>
          </button>
        ))}
      </div>

    </div>
  )
}

export function ChartsView({ data, history, exclude }) {
  const rows = data.rows.filter((r) => !exclude.has(Number(r.id)))
  const byDay = new Map()
  for (const s of history) {
    const list = s.rows || []
    if (!list.length) continue
    let total = 0
    for (const x of list) if (!exclude.has(Number(x.id))) total += Number(x.views) || 0
    byDay.set(s.day || String(s.at).slice(0, 10), total)
  }
  const days = [...byDay.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  const daily = []
  for (let i = 1; i < days.length; i++) daily.push({ day: days[i][0], v: Math.max(0, days[i][1] - days[i - 1][1]) })
  const dailyPoints = daily.map((d) => ({ v: d.v, label: d.day }))
  const labels = daily.length ? [{ i: 0, t: daily[0].day.slice(5), anchor: 'start' }, { i: daily.length - 1, t: daily[daily.length - 1].day.slice(5), anchor: 'end' }] : []

  const monthly = new Map()
  for (const r of rows) {
    const k = monthKey(r.date)
    const o = monthly.get(k) || { k, posts: 0, views: 0 }
    o.posts += 1
    o.views += Number(r.views) || 0
    monthly.set(k, o)
  }
  const monthBars = [...monthly.values()].sort((a, b) => a.k.localeCompare(b.k)).slice(-6).map((m) => ({ k: m.k.slice(2), v: m.views, sub: `${m.posts} 篇` }))

  const scores = useMemo(() => scoreMap(data.rows, exclude), [data.rows, exclude])
  const scoreTop = [...rows].sort((a, b) => (scores.get(Number(b.id)) || 0) - (scores.get(Number(a.id)) || 0)).slice(0, 12).map((r) => ({ k: r.title, v: scores.get(Number(r.id)) || 0 }))
  const withExp = rows.filter((r) => Number(r.exposure) > 2000)
  const ctrs = withExp.map((r) => ({ k: r.title, v: (Number(r.views) / Number(r.exposure)) * 100 }))
  const ctrTop = [...ctrs].sort((a, b) => b.v - a.v).slice(0, 6)
  const ctrLow = [...ctrs].sort((a, b) => a.v - b.v).slice(0, 6)
  const scatter = rows.filter((r) => r.views > 200).map((r) => ({ x: Number(r.views), y: rate(r, 'likes'), label: r.title }))
  const heat = (() => {
    const m = new Map()
    for (const r of rows) m.set(r.date, (m.get(r.date) || 0) + 1)
    const out = []
    const today = new Date()
    for (let i = 139; i >= 0; i--) {
      const d = new Date(today)
      d.setDate(d.getDate() - i)
      const k = d.toISOString().slice(0, 10)
      out.push({ k, v: m.get(k) || 0 })
    }
    return out
  })()

  return (
    <div className="space-y-4">
      <Section>每日新增浏览（全部文章合计）</Section>
      <Panel>
        <Line points={dailyPoints} labels={labels} />
        <div className="mt-2 text-[11px] text-dim">
          {daily.length ? `最近一天 ${daily[daily.length - 1].day}：新增 ${fmt(daily[daily.length - 1].v)} 浏览；共 ${days.length} 天快照。` : '要有两天的快照才能算每天新增。'}
        </div>
      </Panel>

      <Section>每月：发了几篇，拿了多少浏览</Section>
      <Panel><Bars items={monthBars} yLabel="浏览" /></Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel>
          <div className="mb-3 text-[12px] text-muted">真实得分前 12</div>
          <HBars items={scoreTop} />
        </Panel>
        <Panel>
          <div className="mb-3 text-[12px] text-muted">曝光 → 浏览转化率</div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div><div className="mb-2 text-[11px] text-accent">最高</div><HBars items={ctrTop} fmtValue={(v) => `${v.toFixed(1)}%`} /></div>
            <div><div className="mb-2 text-[11px] text-amber-300">最低</div><HBars items={ctrLow} color="#FF9F1C" fmtValue={(v) => `${v.toFixed(1)}%`} /></div>
          </div>
        </Panel>
      </div>

      <Section>浏览 × 点赞率</Section>
      <Panel><Scatter points={scatter} /></Panel>

      <Section>发布热力图（140 天）</Section>
      <Panel><Heatmap days={heat} /></Panel>
    </div>
  )
}

function Spark({ pts }) {
  if (!pts || pts.length < 2) return <span className="text-dim">—</span>
  const vs = pts.map((p) => p[1])
  const min = Math.min(...vs), max = Math.max(...vs)
  const W = 62, H = 18
  const d = vs.map((v, i) => `${i ? 'L' : 'M'}${((i / (vs.length - 1)) * W).toFixed(1)},${(H - 2 - (max === min ? 0.5 : (v - min) / (max - min)) * (H - 4)).toFixed(1)}`).join(' ')
  const up = vs[vs.length - 1] >= vs[0]
  return <svg width={W} height={H}><path d={d} fill="none" stroke={up ? '#3ddc97' : '#f28b82'} strokeWidth="1.4" /></svg>
}

export function ContentView({ data, exclude, toggleExclude, onOpenPost }) {
  const [sort, setSort] = useState({ key: 'date', dir: 'desc' })
  const [q, setQ] = useState('')
  const scores = useMemo(() => scoreMap(data.rows, exclude), [data.rows, exclude])
  const rows = useMemo(() => {
    const arr = [...data.rows]
    const k = sort.key
    return arr.sort((a, b) => {
      const sign = sort.dir === 'asc' ? 1 : -1
      if (k === 'date') return String(a.date || '').localeCompare(String(b.date || '')) * sign
      if (k === 'title') return String(a.title || '').localeCompare(String(b.title || ''), 'zh') * sign
      if (k === 'score') return ((scores.get(Number(a.id)) || 0) - (scores.get(Number(b.id)) || 0)) * sign
      return ((Number(a[k]) || 0) - (Number(b[k]) || 0)) * sign
    })
  }, [data, sort])
  const Th = ({ k, children, right }) => (
    <th className={`whitespace-nowrap px-3 py-3 ${right ? 'text-right' : ''}`}>
      <button
        onClick={() => setSort((s) => ({ key: k, dir: s.key === k ? (s.dir === 'asc' ? 'desc' : 'asc') : 'desc' }))}
        className={`inline-flex items-center gap-1 transition hover:text-ink ${sort.key === k ? 'text-accent' : ''}`}
      >
        {children}
        <span className="text-[9px] leading-none">{sort.key === k ? (sort.dir === 'asc' ? '▲' : '▼') : '↕'}</span>
      </button>
    </th>
  )
  const view = q.trim() ? rows.filter((r) => String(r.title || '').includes(q.trim())) : rows
  const on = rows.filter((r) => !exclude.has(Number(r.id)))
  const engTotal = (r) => (Number(r.likes) || 0) + (Number(r.favorites) || 0) + (Number(r.comments) || 0)
  const withExp = on.filter((r) => Number(r.exposure) > 1000)
  const lowCtr = withExp.filter((r) => Number(r.views) / Number(r.exposure) < 0.15)
  const vs = on.map((r) => Number(r.views) || 0).sort((a, b) => a - b)
  const p75 = vs[Math.floor(vs.length * 0.75)] || 0
  const lowEng = on.filter((r) => (Number(r.views) || 0) >= p75 && engTotal(r) / Math.max(1, r.views) < 0.03)

  return (
    <div className="space-y-4">
      <Section right={<span className="text-[11px] text-dim">共 {rows.length} 篇 · 已排除 {exclude.size} 篇</span>}>全部内容</Section>
      <div className="mb-2 flex items-center gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="搜标题…"
          className="w-64 rounded-lg border border-line bg-white/[0.03] px-3 py-1.5 text-[12px] text-ink outline-none placeholder:text-dim focus:border-accent/40"
        />
        {q && <button onClick={() => setQ('')} className="text-[11px] text-dim hover:text-ink">清除</button>}
        <span className="text-[11px] text-dim">{view.length} / {rows.length}</span>
      </div>
      <Panel padded={false} className="overflow-x-auto">
        <table className="w-full min-w-[900px] text-left text-[12.5px]">
          <thead className="text-[11px] uppercase tracking-wide text-dim">
            <tr className="border-b border-line">
              <th className="px-4 py-3">计入</th>
              <Th k="title">标题</Th>
              <Th k="date">日期</Th>
              <Th k="views" right>浏览</Th>
              <Th k="likes" right>赞</Th>
              <Th k="comments" right>评论</Th>
              <Th k="favorites" right>收藏</Th>
              <Th k="shares" right>分享</Th>
              <Th k="battery" right>充电</Th>
              <Th k="exposure" right>曝光</Th>
              <Th k="score" right>真实得分</Th>
            </tr>
          </thead>
          <tbody>
            {view.map((r) => {
              const off = exclude.has(Number(r.id))
              return (
                <tr key={r.id} className={`border-b border-line/60 transition hover:bg-white/[0.03] ${off ? 'opacity-40' : ''}`}>
                  <td className="px-4 py-2.5">
                    <input type="checkbox" checked={!off} onChange={() => toggleExclude(r.id)} className="h-3.5 w-3.5 accent-[#FFD84D]" />
                  </td>
                  <td className="max-w-[360px] px-3 py-2.5">
                    <button onClick={() => onOpenPost(r.id)} className="block max-w-full truncate text-left text-ink/90 hover:text-accent">{r.title}</button>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-muted">{r.date}</td>
                  <td className="px-3 py-2.5 text-right font-num">{fmt(r.views)}</td>
                  <td className="px-3 py-2.5 text-right font-num">{fmt(r.likes)}</td>
                  <td className="px-3 py-2.5 text-right font-num">{fmt(r.comments)}</td>
                  <td className="px-3 py-2.5 text-right font-num">{fmt(r.favorites)}</td>
                  <td className="px-3 py-2.5 text-right font-num">{fmt(r.shares)}</td>
                  <td className="px-3 py-2.5 text-right font-num">{fmt(r.battery)}</td>
                  <td className="px-3 py-2.5 text-right font-num">{fmt(r.exposure)}</td>
                  <td className="px-3 py-2.5 text-right font-num text-accent">{scores.get(Number(r.id)) ?? '—'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </Panel>
    </div>
  )
}

export function PostView({ post, rows, history, exclude, onBack }) {
  const [body, setBody] = useState(null)
  const [fc, setFc] = useState(null)
  const [cmpId, setCmpId] = useState('')
  const scores = useMemo(() => scoreMap(rows, exclude), [rows, exclude])
  const on = rows.filter((r) => !exclude.has(Number(r.id)) && Number(r.id) !== Number(post.id))
  const avg = (k) => (on.length ? on.reduce((a, r) => a + (Number(r[k]) || 0), 0) / on.length : 0)
  const eng = (r) => (Number(r.likes) || 0) + (Number(r.favorites) || 0) + (Number(r.comments) || 0)

  useEffect(() => {
    getJSON(`/api/body?id=${post.id}`).then(setBody).catch(() => setBody({ ok: false }))
    getJSON(`/api/forecast?id=${post.id}&days=14`).then(setFc).catch(() => setFc({ ok: false }))
  }, [post.id])

  const series = useMemo(() => {
    const m = new Map()
    for (const s of history) {
      const row = (s.rows || []).find((x) => Number(x.id) === Number(post.id))
      if (!row) continue
      m.set(s.day || String(s.at).slice(0, 10), Number(row.views) || 0)
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }, [history, post.id])
  const daily = []
  for (let i = 1; i < series.length; i++) daily.push({ v: Math.max(0, series[i][1] - series[i - 1][1]), label: series[i][0] })
  const week = series.slice(-8)
  const weekGain = week.length > 1 ? week[week.length - 1][1] - week[0][1] : 0
  const dayGain = daily.length ? daily[daily.length - 1].v : 0
  const prevGain = daily.length > 1 ? daily[daily.length - 2].v : 0
  const dayDelta = prevGain > 0 ? ((dayGain - prevGain) / prevGain) * 100 : 0
  const cmp = on.find((r) => Number(r.id) === Number(cmpId))

  const bars = [
    ['浏览', 'views'], ['点赞', 'likes'], ['评论', 'comments'], ['收藏', 'favorites'], ['充电', 'battery'],
  ]

  return (
    <div className="space-y-4">
      <button onClick={onBack} className="text-[12px] text-muted hover:text-accent">← 返回</button>
      <Panel>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-lg font-semibold leading-snug text-ink">{post.title}</div>
            <div className="mt-1 text-[12px] text-muted">{post.date} · {fmt(post.views)} 浏览 · {fmt(post.likes)} 赞 · {fmt(post.comments)} 评论</div>
          </div>
          <div className="flex gap-2">
            <Pill tone="mint">真实得分 {scores.get(Number(post.id)) ?? '—'}</Pill>
            <Pill tone="dim">曝光 {fmt(post.exposure)}</Pill>
          </div>
        </div>

        {series.length >= 2 && (
          <div className="mt-4 flex flex-wrap items-center gap-3 text-[12px]">
            <span className="text-dim">近 {week.length - 1} 天</span>
            <Spark pts={week} />
            <span className="font-num text-ink">{weekGain >= 0 ? '+' : ''}{fmt(weekGain)}</span>
            <span className="text-dim">日均 {fmt(Math.round(weekGain / Math.max(1, week.length - 1)))}</span>
            <span className={`font-num ${dayDelta >= 0 ? 'text-accent' : 'text-rose-300'}`}>
              昨天 {dayGain >= 0 ? '+' : ''}{fmt(dayGain)} {dayDelta >= 0 ? '↑' : '↓'}{Math.min(999, Math.abs(dayDelta)).toFixed(0)}%
            </span>
          </div>
        )}

        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[['浏览', post.views], ['点赞', post.likes], ['评论', post.comments], ['收藏', post.favorites], ['分享', post.shares], ['充电', post.battery], ['曝光', post.exposure], ['点击率', `${((Number(post.views) / Math.max(1, Number(post.exposure))) * 100).toFixed(1)}%`]].map(([k, v]) => (
            <div key={k} className="rounded-xl border border-line bg-white/[0.02] px-3 py-3">
              <div className="font-num text-lg font-semibold text-ink">{typeof v === 'number' ? fmt(v) : v}</div>
              <div className="mt-1 text-[11px] text-dim">{k}</div>
            </div>
          ))}
        </div>
      </Panel>

      <Section>这篇 vs 账号平均</Section>
      <Panel>
        <div className="space-y-3">
          {bars.map(([label, k]) => {
            const v = Number(post[k]) || 0
            const a = avg(k)
            const ratio = a > 0 ? v / a : 0
            return (
              <div key={k} className="grid grid-cols-[52px_1fr_150px] items-center gap-3 text-[12px]">
                <span className="text-muted">{label}</span>
                <div className="relative h-2.5 overflow-hidden rounded-full bg-white/[0.06]">
                  <div className="h-full rounded-full" style={{ width: `${Math.min(100, ratio * 50)}%`, background: 'linear-gradient(90deg,#F2A900,#FFD84D)' }} />
                  <div className="absolute top-0 h-full w-[2px] bg-white/40" style={{ left: '50%' }} />
                </div>
                <span className="whitespace-nowrap text-right font-num text-muted">{fmt(v)} / 均 {fmt(Math.round(a))} · {ratio.toFixed(1)}×</span>
              </div>
            )
          })}
        </div>
      </Panel>

      <Section>正文</Section>
      <Panel>
        {body?.ok ? (
          <>
            <div className="whitespace-pre-wrap text-[13px] leading-7 text-ink/85">{String(body.text).slice(0, 300)}{String(body.text).length > 300 ? '…' : ''}</div>
            <div className="mt-3 text-[11px] text-dim">共 {fmt(body.len)} 字 · {body.title}</div>
          </>
        ) : (
          <div className="text-[12px] text-dim">这篇的正文还没抓到。</div>
        )}
      </Panel>

      <Section>这篇每天新增浏览</Section>
      <Panel>
        <Line points={daily} height={220} />
      </Panel>

      <Section>浏览量预测</Section>
      <Panel>
        {fc?.ok ? (
          <>
            <Forecast actual={fc.actual || []} predicted={fc.predicted || []} />
            <div className="mt-2 text-[11px] text-dim">
              现在约每天 +{fmt(fc.params?.dailyNow || 0)}；7 天后约 {fmt(fc.predicted?.[6]?.v || 0)}，14 天后约 {fmt(fc.predicted?.[13]?.v || 0)}（当前 {fmt(post.views)}）。
              依据：最近 {fc.params?.spanH} 小时涨 {fmt(fc.params?.lastInc || 0)}、衰减 {fc.params?.tauH} 小时、内容系数 {fc.params?.contentFactor}、正文 {fmt(fc.params?.bodyLen || 0)} 字。
            </div>
          </>
        ) : (
          <div className="text-[12px] text-dim">{fc?.error || '预测需要至少两次抓取。'}</div>
        )}
      </Panel>

      <Section>两篇对比</Section>
      <Panel>
        <select value={cmpId} onChange={(e) => setCmpId(e.target.value)} className="w-full max-w-md rounded-lg border border-line bg-white/[0.04] px-3 py-2 text-[12.5px] outline-none">
          <option value="">选一篇对比</option>
          {on.map((r) => <option key={r.id} value={r.id}>{r.title}</option>)}
        </select>
        {cmp && (
          <div className="mt-4 overflow-hidden rounded-xl border border-line">
            <table className="w-full text-[12px]">
              <thead className="bg-white/[0.03] text-[11px] text-dim">
                <tr><th className="px-3 py-2 text-left">指标</th><th className="px-3 py-2 text-right">这篇</th><th className="px-3 py-2 text-right">对比篇</th><th className="px-3 py-2 text-right">差值</th></tr>
              </thead>
              <tbody>
                {['views', 'likes', 'comments', 'favorites', 'shares', 'battery'].map((k) => {
                  const a = Number(post[k]) || 0
                  const b = Number(cmp[k]) || 0
                  const d = b - a
                  return (
                    <tr key={k} className="border-t border-line/60">
                      <td className="px-3 py-2 text-muted">{{ views: '浏览', likes: '点赞', comments: '评论', favorites: '收藏', shares: '分享', battery: '充电' }[k]}</td>
                      <td className="px-3 py-2 text-right font-num">{fmt(a)}</td>
                      <td className="px-3 py-2 text-right font-num">{fmt(b)}</td>
                      <td className={`px-3 py-2 text-right font-num ${d >= 0 ? 'text-accent' : 'text-rose-300'}`}>{d >= 0 ? '+' : ''}{fmt(d)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            <div className="border-t border-line px-3 py-2 text-[11px] text-dim">差值 = 对比篇 − 这篇</div>
          </div>
        )}
      </Panel>
    </div>
  )
}

export function SettingsView({ auto, onSaved }) {
  const [form, setForm] = useState({
    apiKey: '', model: auto?.model || 'deepseek-flash', autoScrape: auto?.autoScrape !== false,
    dailyHour: auto?.dailyHour ?? 18, monthlyPosts: auto?.monthlyPosts || 20, monthlyViews: auto?.monthlyViews || 50000,
    perPostViews: auto?.perPostViews || 1000, perPostRate: auto?.perPostRate ?? 3, perPostCount: auto?.perPostCount || 4,
  })
  const [msg, setMsg] = useState('')
  const [acct, setAcct] = useState(null)
  const [acctMsg, setAcctMsg] = useState('')
  const loadAcct = () => getJSON('/api/account').then(setAcct).catch(() => {})
  useEffect(() => { loadAcct() }, [])
  const openLogin = async () => {
    try {
      const r = await postJSON('/api/account/login', {})
      setAcctMsg(r.ok ? '已打开登录页：登录完把那个 Edge 窗口关掉就行' : (r.error || '打开失败'))
    } catch (e) { setAcctMsg('打开失败：' + e.message) }
  }
  const switchTo = async (id) => {
    try {
      const r = await postJSON('/api/account/switch', { id })
      setAcctMsg(r.ok ? '已切换。原来那个账号的数据存在本地 accounts 目录，切回去还在' : (r.error || '切换失败'))
      loadAcct()
      onSaved?.()
    } catch (e) { setAcctMsg('切换失败：' + e.message) }
  }
  const createAccount = async () => {
    if (!window.confirm('新建账号会先把当前账号的数据保存到本地，然后清空面板去登录新号。继续吗？')) return
    try {
      const r = await postJSON('/api/account/switch', { create: true })
      setAcctMsg(r.ok ? '已新建。点「打开登录页」登录新账号，登录完重新抓取' : (r.error || '新建失败'))
      loadAcct()
      onSaved?.()
    } catch (e) { setAcctMsg('新建失败：' + e.message) }
  }
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value })
  const save = async () => {
    setMsg('保存中…')
    try {
      const r = await postJSON('/api/settings', form)
      setMsg(r.ok ? '已保存' : '保存失败')
      onSaved?.()
    } catch (e) { setMsg('保存失败：' + e.message) }
  }
  return (
    <div className="max-w-2xl space-y-4">
      <Panel>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-[13px] font-semibold">账号</div>
            <div className="mt-1 text-[11px] text-dim">
              {acct?.loggedIn ? '已保存登录态' : '还没有登录'} · {acct?.hasData ? `本地数据停在 ${String(acct.dataAt || '').slice(0, 10)}` : '本地没有数据'}
            </div>
          </div>
          <div className="flex gap-2">
            <ShimmerButton onClick={openLogin}>打开登录页</ShimmerButton>
            <button onClick={createAccount} className="rounded-full border border-line px-4 py-1.5 text-[12px] text-muted hover:border-accent/40 hover:text-accent">新建账号</button>
          </div>
        </div>
        {(acct?.accounts || []).length > 0 && (
          <div className="mt-3 divide-y divide-white/5">
            {acct.accounts.map((a) => (
              <div key={a.id} className="flex items-center justify-between gap-3 py-2">
                <div className="min-w-0">
                  <div className="truncate text-[12px]">{a.name}{a.id === acct.current ? '（当前）' : ''}</div>
                  <div className="text-[11px] text-dim">{a.posts} 篇 · {a.dataAt ? String(a.dataAt).slice(0, 10) : '无数据'}</div>
                </div>
                {a.id !== acct.current && (
                  <button onClick={() => switchTo(a.id)} className="shrink-0 rounded-full border border-line px-3 py-1 text-[11px] text-muted hover:border-accent/40 hover:text-accent">切换</button>
                )}
              </div>
            ))}
          </div>
        )}
        {acctMsg && <div className="mt-2 text-[11px] text-amber-300">{acctMsg}</div>}
        <div className="mt-2 text-[11px] text-dim">切换账号会把当前数据存到本地 accounts 目录，切回来自动恢复，不会丢。</div>
      </Panel>

      <Panel>
        <div className="text-[13px] font-semibold">服务</div>
        <label className="mt-4 block text-[11px] text-dim">API Key</label>
        <input value={form.apiKey} onChange={set('apiKey')} placeholder="sk-…（留空不改）" className="mt-1 w-full rounded-lg border border-line bg-white/[0.04] px-3 py-2 text-[13px] outline-none focus:border-accent/40" />
        <label className="mt-3 block text-[11px] text-dim">模型</label>
        <input value={form.model} onChange={set('model')} className="mt-1 w-full rounded-lg border border-line bg-white/[0.04] px-3 py-2 text-[13px] outline-none" />
        <div className="mt-4 flex items-center gap-3 text-[13px]">
          <input type="checkbox" checked={form.autoScrape} onChange={set('autoScrape')} className="h-4 w-4 accent-[#FFD84D]" />
          <span>每天自动抓取</span>
        </div>
        <label className="mt-3 block text-[11px] text-dim">每天几点抓（0–23）</label>
        <input type="number" min="0" max="23" value={form.dailyHour} onChange={set('dailyHour')} className="mt-1 w-32 rounded-lg border border-line bg-white/[0.04] px-3 py-2 text-[13px] outline-none" />
      </Panel>

      <Panel>
        <div className="text-[13px] font-semibold">目标</div>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <div><label className="text-[11px] text-dim">每月篇数</label><input type="number" value={form.monthlyPosts} onChange={set('monthlyPosts')} className="mt-1 w-full rounded-lg border border-line bg-white/[0.04] px-3 py-2 text-[13px]" /></div>
          <div><label className="text-[11px] text-dim">每月浏览</label><input type="number" value={form.monthlyViews} onChange={set('monthlyViews')} className="mt-1 w-full rounded-lg border border-line bg-white/[0.04] px-3 py-2 text-[13px]" /></div>
          <div><label className="text-[11px] text-dim">单篇浏览目标</label><input type="number" value={form.perPostViews} onChange={set('perPostViews')} className="mt-1 w-full rounded-lg border border-line bg-white/[0.04] px-3 py-2 text-[13px]" /></div>
          <div><label className="text-[11px] text-dim">单篇互动率 %</label><input type="number" value={form.perPostRate} onChange={set('perPostRate')} className="mt-1 w-full rounded-lg border border-line bg-white/[0.04] px-3 py-2 text-[13px]" /></div>
          <div><label className="text-[11px] text-dim">本月要达到的单篇数</label><input type="number" value={form.perPostCount} onChange={set('perPostCount')} className="mt-1 w-full rounded-lg border border-line bg-white/[0.04] px-3 py-2 text-[13px]" /></div>
        </div>
      </Panel>

      <div className="flex items-center gap-3">
        <ShimmerButton onClick={save}>保存设置</ShimmerButton>
        <span className="text-[12px] text-muted">{msg}</span>
      </div>
    </div>
  )
}


export function AnalysisView() {
  const [analysis, setAnalysis] = useState('')
  const [busy, setBusy] = useState('')
  const [msg, setMsg] = useState('')
  const [at, setAt] = useState('')
  useEffect(() => {
    getJSON('/api/analysis').then((d) => {
      if (d?.report || d?.prompt) setAnalysis(d.report || d.prompt)
      if (d?.at) setAt(d.at)
    }).catch(() => {})
  }, [])
  const run = async (mode) => {
    setBusy(mode)
    setAnalysis('')
    setMsg('')
    try {
      const r = await postJSON('/api/analyze', { mode })
      setAnalysis(r.report || r.prompt || r.log || '没有内容')
      if (r.at) setAt(r.at)
      if (r.report) setMsg('报告已生成')
      else if (r.prompt) setMsg('提示词已生成（没填 API Key 时只出提示词）')
    } catch (e) { setMsg('失败：' + e.message) }
    setBusy('')
  }
  const copy = async () => {
    try { await navigator.clipboard.writeText(analysis); setMsg('已复制') } catch { setMsg('复制失败') }
  }
  return (
    <div className="space-y-4">
      <Panel>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-[13px] font-semibold">账号分析</div>
            <div className="mt-1 text-[11px] text-dim">用抓到的 50 多篇笔记生成一份诊断，或只拿提示词；需要设置里填了 API Key。{at ? ` 上次生成：${String(at).replace('T', ' ').slice(0, 16)}` : ''}</div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <ShimmerButton onClick={() => run('report')} disabled={!!busy}>{busy === 'report' ? '生成中…' : '生成分析'}</ShimmerButton>
            <button onClick={() => run('prompt')} disabled={!!busy} className="rounded-lg border border-line px-3 py-2 text-[12px] text-muted transition hover:border-accent/40 hover:text-ink disabled:opacity-50">
              {busy === 'prompt' ? '生成中…' : '只生成提示词'}
            </button>
            {analysis && <button onClick={copy} className="rounded-lg border border-line px-3 py-2 text-[12px] text-muted transition hover:border-accent/40 hover:text-ink">复制</button>}
          </div>
        </div>
        {msg && <div className="mt-2 text-[11px] text-dim">{msg}</div>}
      </Panel>
      {analysis ? (
        <Panel>
          <pre className="max-h-[70vh] overflow-auto whitespace-pre-wrap text-[12.5px] leading-7 text-ink/85">{analysis}</pre>
        </Panel>
      ) : (
        <Panel>
          <div className="py-10 text-center text-[12px] text-dim">还没有内容。点上面的按钮生成一份。</div>
        </Panel>
      )}
    </div>
  )
}
