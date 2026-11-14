import React, { useRef } from 'react'
import { motion } from 'framer-motion'
import { fmt } from './lib'

export function Aurora() {
  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div className="aurora-blob a1" style={{ width: 720, height: 720, left: -220, top: -260 }} />
      <div className="aurora-blob a2" style={{ width: 620, height: 620, right: -240, top: -120 }} />
      <div className="aurora-blob a3" style={{ width: 560, height: 560, left: '38%', bottom: -300 }} />
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(1200px 600px at 50% -10%, rgba(255,216,77,.10), transparent 62%), linear-gradient(180deg, rgba(7,11,10,.15) 0%, rgba(7,11,10,.55) 70%, rgba(6,10,9,.85) 100%)',
        }}
      />
    </div>
  )
}

export function Panel({ children, className = '', padded = true }) {
  const ref = useRef(null)
  const onMove = (e) => {
    const el = ref.current
    if (!el) return
    const r = el.getBoundingClientRect()
    el.style.setProperty('--mx', `${e.clientX - r.left}px`)
    el.style.setProperty('--my', `${e.clientY - r.top}px`)
  }
  return (
    <div
      ref={ref}
      onMouseMove={onMove}
      className={`group relative overflow-hidden rounded-2xl glass shadow-[0_30px_80px_-50px_rgba(0,0,0,.9)] ${padded ? 'p-5' : ''} ${className}`}
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        style={{
          background:
            'radial-gradient(260px circle at var(--mx,50%) var(--my,0%), rgba(255,216,77,.10), transparent 62%)',
        }}
      />
      <div className="relative z-10">{children}</div>
    </div>
  )
}

export function Section({ children, right }) {
  return (
    <div className="mt-8 mb-3 flex items-end justify-between gap-3">
      <h2 className="flex items-center gap-2 text-[13px] font-semibold tracking-wide text-muted">
        <span className="h-1.5 w-1.5 rounded-[2px] bg-gradient-to-br from-accent to-amber-500" />
        {children}
      </h2>
      {right}
    </div>
  )
}

export function Stat({ label, value, delta, icon }) {
  return (
    <Panel className="!p-4">
      <div className="flex items-start justify-between">
        <div>
          <div className="font-num text-[26px] font-semibold leading-none tracking-tight text-ink">
            {typeof value === 'number' ? fmt(value) : value}
          </div>
          <div className="mt-2 text-[11.5px] text-muted">{label}</div>
        </div>
        {icon && <div className="text-dim">{icon}</div>}
      </div>
      {delta != null && (
        <div className="mt-2 flex items-center gap-1 text-[11px] text-accent">
          <span className="inline-block h-1 w-1 rounded-full bg-accent" />
          {delta}
        </div>
      )}
    </Panel>
  )
}

export function Bar({ label, value, target, suffix = '', extra }) {
  const p = target > 0 ? Math.min(100, Math.round((value / target) * 100)) : 0
  return (
    <div className="py-2">
      <div className="flex items-baseline justify-between text-[12px]">
        <span className="text-muted">
          {label} {extra && <span className="text-dim">{extra}</span>}
        </span>
        <span className="font-num text-[12px] text-ink/80">
          {fmt(value)} / {fmt(target)} {suffix}
          <span className="ml-2 text-dim">{p}%</span>
        </span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/[0.06]">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${p}%` }}
          transition={{ duration: 0.8, ease: [0.2, 0.7, 0.2, 1] }}
          className="h-full rounded-full"
          style={{ background: 'linear-gradient(90deg,#F2A900,#FFD84D)' }}
        />
      </div>
    </div>
  )
}

export function Pill({ children, tone = 'mint' }) {
  const map = {
    mint: 'bg-accent/10 text-accent border-accent/20',
    gold: 'bg-amber-400/10 text-amber-300 border-amber-300/20',
    red: 'bg-rose-400/10 text-rose-300 border-rose-300/20',
    dim: 'bg-white/5 text-muted border-white/10',
  }
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-[2px] text-[11px] ${map[tone]}`}>{children}</span>
  )
}

export function Tabs({ items, value, onChange }) {
  return (
    <div className="inline-flex rounded-xl border border-line bg-white/[0.03] p-1">
      {items.map((it) => {
        const active = it.key === value
        return (
          <button
            key={it.key}
            onClick={() => onChange(it.key)}
            className={`relative rounded-lg px-4 py-2 text-[13px] transition-colors ${active ? 'text-[#06231a]' : 'text-muted hover:text-ink'}`}
          >
            {active && (
              <motion.span
                layoutId="tab-pill"
                className="absolute inset-0 rounded-lg"
                style={{ background: 'linear-gradient(135deg,#FFD84D,#FFB020)' }}
                transition={{ type: 'spring', stiffness: 400, damping: 32 }}
              />
            )}
            <span className="relative z-10 font-medium">{it.label}</span>
          </button>
        )
      })}
    </div>
  )
}

export function ShimmerButton({ children, onClick, disabled, className = '' }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`shimmer-btn rounded-xl px-4 py-2 text-[13px] font-semibold text-[#052019] shadow-[0_12px_30px_-12px_rgba(52,211,153,.8)] transition hover:brightness-105 disabled:opacity-50 ${className}`}
    >
      {children}
    </button>
  )
}
