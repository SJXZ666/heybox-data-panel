import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { RefreshCw, Database, Sparkles, LayoutDashboard, BarChart3, FileText, Settings as SettingsIcon } from 'lucide-react'
import { Aurora, ShimmerButton, Pill } from './components'
import { getJSON, postJSON, fmt } from './lib'
import { Overview, ChartsView, ContentView, PostView, SettingsView, AnalysisView } from './views'

const NAV = [
  { key: 'overview', label: '总览', icon: LayoutDashboard },
  { key: 'content', label: '内容', icon: FileText },
  { key: 'charts', label: '图表', icon: BarChart3 },
  { key: 'analysis', label: '分析', icon: Sparkles },
  { key: 'settings', label: '设置', icon: SettingsIcon },
]

const TITLES = {
  overview: '总览',
  content: '内容',
  charts: '图表',
  analysis: '账号分析',
  settings: '设置',
  post: '单篇',
}

export default function App() {
  const [data, setData] = useState({ rows: [], auto: {}, schedule: null })
  const [history, setHistory] = useState([])
  const [exclude, setExclude] = useState(new Set())
  const [range, setRange] = useState('all')
  const initial = (() => {
    const h = String(location.hash || '').replace('#', '')
    if (h.startsWith('post=')) return { tab: 'post', id: Number(h.slice(5)) || null }
    if (['charts', 'content', 'settings', 'analysis', 'overview'].includes(h)) return { tab: h, id: null }
    return { tab: 'overview', id: null }
  })()
  const [tab, setTab] = useState(initial.tab)
  const [postId, setPostId] = useState(initial.id)
  const [scraping, setScraping] = useState(false)
  const [toast, setToast] = useState('')

  const load = useCallback(async () => {
    const [d, h, e] = await Promise.all([getJSON('/api/data'), getJSON('/api/history'), getJSON('/api/exclude')])
    setData(d || { rows: [] })
    setHistory(h || [])
    setExclude(new Set((e?.ids || []).map(Number)))
  }, [])

  useEffect(() => { load().catch((err) => setToast('读取失败：' + err.message)) }, [load])
  useEffect(() => {
    const h = tab === 'post' && postId ? `#post=${postId}` : `#${tab}`
    if (location.hash !== h) window.history.replaceState(null, '', h)
  }, [tab, postId])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(''), 2600)
    return () => clearTimeout(t)
  }, [toast])

  const post = useMemo(() => data.rows.find((r) => Number(r.id) === Number(postId)) || null, [data, postId])
  const openPost = (id) => { setPostId(id); setTab('post') }

  const toggleExclude = async (id) => {
    const next = new Set(exclude)
    if (next.has(Number(id))) next.delete(Number(id))
    else next.add(Number(id))
    setExclude(next)
    try { await postJSON('/api/exclude', { ids: [...next] }) } catch { setToast('保存排除失败') }
  }

  const scrape = async () => {
    setScraping(true)
    setToast('抓取中，大约 30 秒…')
    try {
      const r = await postJSON('/api/scrape')
      if (!r.ok) throw new Error(r.error || '失败')
      await load()
      setToast(`抓完了，共 ${r.count} 篇`)
    } catch (e) { setToast('抓取失败：' + e.message) }
    finally { setScraping(false) }
  }

  const sch = data.schedule
  const meta = `共 ${data.rows.length} 篇 · 数据时间 ${data.updatedAt ? new Date(data.updatedAt).toLocaleString('zh-CN', { hour12: false }) : '—'}`
  const schText = sch ? `上次自动抓取 ${new Date(sch.at).toLocaleString('zh-CN', { hour12: false }).slice(5)} ${sch.ok ? '成功' : '失败'}` : '还没跑过自动抓取'

  return (
    <div className="min-h-screen">
      <Aurora />

      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[212px] flex-col border-r border-line bg-[#060c0a]/85 px-4 py-6 backdrop-blur lg:flex">
        <div className="flex items-center gap-3 px-1">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-accent to-amber-500 text-[#04231a]">
            <Sparkles size={17} />
          </div>
          <div className="text-[15px] font-semibold tracking-tight text-ink">小黑盒面板</div>
        </div>

        <nav className="mt-8 space-y-1">
          {NAV.map((item) => {
            const Icon = item.icon
            const active = tab === item.key || (tab === 'post' && item.key === 'content')
            return (
              <button
                key={item.key}
                onClick={() => { setTab(item.key); setPostId(null) }}
                className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[13px] transition ${
                  active ? 'bg-accent/12 text-accent' : 'text-muted hover:bg-white/[0.04] hover:text-ink'
                }`}
              >
                <Icon size={16} />
                {item.label}
              </button>
            )
          })}
        </nav>

        <div className="mt-auto space-y-3">
          <ShimmerButton onClick={scrape} disabled={scraping} className="w-full justify-center">
            <span className="inline-flex items-center gap-2"><RefreshCw size={14} className={scraping ? 'animate-spin' : ''} />{scraping ? '抓取中' : '重新抓取'}</span>
          </ShimmerButton>
          <div className="space-y-1 px-1 text-[10.5px] leading-relaxed text-dim">
            <div className="flex items-center gap-1.5"><Database size={11} /> 本地面板 · 127.0.0.1:7789</div>
            <div>{schText}</div>
            {exclude.size > 0 && <div>已排除 {exclude.size} 篇</div>}
          </div>
        </div>
      </aside>

      <div className="lg:pl-[212px]">
        <div className="mx-auto max-w-6xl px-5 pb-24 pt-6">
          <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
            <div>
              <div className="text-[11px] uppercase tracking-[0.2em] text-dim">DASHBOARD</div>
              <h1 className="mt-1 text-[24px] font-bold tracking-tight text-ink">{TITLES[tab] || '总览'}</h1>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-[11.5px] text-muted">
                <span>{meta}</span>
                {data.auto?.autoScrape && <Pill tone="mint">每天 {String(data.auto?.dailyHour ?? 18).padStart(2, '0')}:00 自动抓</Pill>}
                {exclude.size > 0 && <Pill tone="dim">已排除 {exclude.size} 篇</Pill>}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="inline-flex rounded-xl border border-line bg-white/[0.03] p-1">
                {[['7', '7 天'], ['30', '30 天'], ['90', '90 天'], ['all', '全部']].map(([k, label]) => (
                  <button key={k} onClick={() => setRange(k)} className={`rounded-lg px-3 py-1.5 text-[12px] transition ${range === k ? 'bg-white/10 text-ink' : 'text-muted hover:text-ink'}`}>{label}</button>
                ))}
              </div>
              <button onClick={scrape} disabled={scraping} className="inline-flex items-center gap-2 rounded-xl border border-line px-3 py-2 text-[12px] text-muted lg:hidden">
                <RefreshCw size={14} className={scraping ? 'animate-spin' : ''} /> 抓取
              </button>
            </div>
          </header>

          <AnimatePresence mode="wait">
            <motion.main
              key={tab + (postId || '')}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.22 }}
            >
              {tab === 'overview' && <Overview data={data} exclude={exclude} range={range} onOpenPost={openPost} onScrape={scrape} scraping={scraping} />}
              {tab === 'charts' && <ChartsView data={data} history={history} exclude={exclude} />}
              {tab === 'content' && <ContentView data={data} exclude={exclude} toggleExclude={toggleExclude} onOpenPost={openPost} />}
              {tab === 'post' && (post ? <PostView post={post} rows={data.rows} history={history} exclude={exclude} onBack={() => setTab('content')} /> :
                <div className="rounded-2xl border border-line bg-white/[0.02] p-14 text-center text-[13px] text-dim">从内容里点一篇文章进来看</div>)}
              {tab === 'analysis' && <AnalysisView />}
              {tab === 'settings' && <SettingsView auto={data.auto} onSaved={load} />}
            </motion.main>
          </AnimatePresence>
        </div>
      </div>

      <AnimatePresence>
        {toast && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 12 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 rounded-xl border border-line bg-[#0b1210]/95 px-5 py-2.5 text-[12.5px] text-ink shadow-2xl backdrop-blur">
            {toast}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
