import React from 'react'
import { fmt } from './lib'

const W = 820

function Tip({ tip }) {
  if (!tip) return null
  return (
    <div
      className="pointer-events-none absolute z-20 -translate-x-1/2 -translate-y-[calc(100%+8px)] whitespace-nowrap rounded-lg border border-white/10 bg-[#0b1512]/95 px-2.5 py-1.5 text-[11px] leading-none text-ink shadow-[0_10px_30px_rgba(0,0,0,.55)]"
      style={{ left: `${tip.x}%`, top: `${tip.y}%` }}
    >
      {tip.text}
    </div>
  )
}

export function Line({ points, height = 260, color = '#FFD84D', fill = true, dashedFrom = null, labels = [] }) {
  const [tip, setTip] = React.useState(null)
  const H = height
  const padL = 46, padR = 16, padT = 18, padB = 28
  if (!points.length) return <div className="py-14 text-center text-[12px] text-dim">还没有数据点</div>
  const maxV = Math.max(...points.map((p) => p.v), 1)
  const n = points.length
  const X = (i) => padL + (n === 1 ? (W - padL - padR) / 2 : (i / (n - 1)) * (W - padL - padR))
  const Y = (v) => H - padB - (v / maxV) * (H - padT - padB)
  const path = points.map((p, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)},${Y(p.v).toFixed(1)}`).join(' ')
  const area = `${path} L${X(n - 1).toFixed(1)},${H - padB} L${X(0).toFixed(1)},${H - padB} Z`
  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
        <defs>
          <linearGradient id="lg" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity=".35" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0, 0.5, 1].map((t) => (
          <line key={t} x1={padL} x2={W - padR} y1={padT + t * (H - padT - padB)} y2={padT + t * (H - padT - padB)} stroke="rgba(255,255,255,.06)" />
        ))}
        <text x={padL - 8} y={padT + 4} textAnchor="end" fontSize="10" fill="#5e7670">{fmt(maxV)}</text>
        <text x={padL - 8} y={H - padB} textAnchor="end" fontSize="10" fill="#5e7670">0</text>
        {fill && <path d={area} fill="url(#lg)" />}
        <path d={path} fill="none" stroke={color} strokeWidth="2.4" strokeLinejoin="round" strokeLinecap="round" />
        {points.map((p, i) => (
          <g key={i}>
            <circle
              cx={X(i)} cy={Y(p.v)} r="12" fill="transparent"
              onMouseOver={() => setTip({ x: (X(i) / W) * 100, y: (Y(p.v) / H) * 100, text: `${p.label ? p.label + ' · ' : ''}${fmt(p.v)}` })}
              onMouseOut={() => setTip(null)}
            />
            <circle cx={X(i)} cy={Y(p.v)} r="3" fill="#0A0A0B" stroke={color} strokeWidth="1.6" style={{ pointerEvents: 'none' }} />
          </g>
        ))}
        {labels.map((l, i) => (
          <text key={i} x={X(l.i)} y={H - 8} fontSize="10" fill="#5e7670" textAnchor={l.anchor || 'middle'}>{l.t}</text>
        ))}
      </svg>
      <Tip tip={tip} />
    </div>
  )
}

export function Bars({ items, height = 260, yLabel = '' }) {
  const [tip, setTip] = React.useState(null)
  const H = height
  const padL = 46, padR = 16, padT = 18, padB = 34
  if (!items.length) return <div className="py-14 text-center text-[12px] text-dim">还没有数据</div>
  const maxV = Math.max(...items.map((d) => d.v), 1)
  const bw = (W - padL - padR) / items.length
  const Y = (v) => H - padB - (v / maxV) * (H - padT - padB)
  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
        <defs>
          <linearGradient id="bg1" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#FFD84D" stopOpacity=".95" />
            <stop offset="100%" stopColor="#F2A900" stopOpacity=".35" />
          </linearGradient>
        </defs>
        {[0, 0.5, 1].map((t) => (
          <line key={t} x1={padL} x2={W - padR} y1={padT + t * (H - padT - padB)} y2={padT + t * (H - padT - padB)} stroke="rgba(255,255,255,.06)" />
        ))}
        <text x={padL - 8} y={padT + 4} textAnchor="end" fontSize="10" fill="#5e7670">{fmt(maxV)}</text>
        <text x={padL - 8} y={padT - 6} textAnchor="end" fontSize="9" fill="#5e7670">{yLabel}</text>
        {items.map((d, i) => {
          const x = padL + i * bw + bw * 0.18
          const w = bw * 0.64
          const y = Y(d.v)
          return (
            <g key={i}>
              <rect x={x} y={y} width={w} height={H - padB - y} rx="4" fill="url(#bg1)">
                <title>{`${d.k} ${fmt(d.v)}`}</title>
              </rect>
              <rect
                x={x} y={padT} width={w} height={H - padB - padT} fill="transparent"
                onMouseOver={() => setTip({ x: ((x + w / 2) / W) * 100, y: (y / H) * 100, text: `${d.k} ${fmt(d.v)}${d.sub ? ' · ' + d.sub : ''}` })}
                onMouseOut={() => setTip(null)}
              />
              <text x={x + w / 2} y={H - padB + 14} fontSize="10" fill="#8ca39b" textAnchor="middle">{d.k}</text>
              {d.sub && <text x={x + w / 2} y={H - padB + 26} fontSize="9" fill="#5e7670" textAnchor="middle">{d.sub}</text>}
            </g>
          )
        })}
      </svg>
      <Tip tip={tip} />
    </div>
  )
}

export function HBars({ items, color = '#FFD84D', max, fmtValue }) {
  if (!items.length) return <div className="py-10 text-center text-[12px] text-dim">还没有数据</div>
  const top = max || Math.max(...items.map((d) => d.v), 1)
  return (
    <div className="space-y-2">
      {items.map((d, i) => (
        <div key={i} className="grid grid-cols-[minmax(0,1fr)_120px_52px] items-center gap-3 text-[12px]">
          <div className="truncate text-ink/85" title={d.k}>{d.k}</div>
          <div className="h-2 overflow-hidden rounded-full bg-white/[0.06]" title={`${d.k} ${fmt(d.v)}`}>
            <div className="h-full rounded-full" style={{ width: `${Math.max(2, (d.v / top) * 100)}%`, background: `linear-gradient(90deg,${color},rgba(255,216,77,.7))` }} />
          </div>
          <div className="text-right font-num text-muted">{fmtValue ? fmtValue(d.v) : fmt(d.v)}</div>
        </div>
      ))}
    </div>
  )
}

export function Scatter({ points }) {
  const [tip, setTip] = React.useState(null)
  const H = 280, pad = 40
  if (!points.length) return <div className="py-10 text-center text-[12px] text-dim">还没有数据</div>
  const maxX = Math.max(...points.map((p) => p.x), 1)
  const maxY = Math.max(...points.map((p) => p.y), 0.01)
  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
        <line x1={pad} x2={W - pad} y1={H - pad} y2={H - pad} stroke="rgba(255,255,255,.08)" />
        <line x1={pad} x2={pad} y1={pad} y2={H - pad} stroke="rgba(255,255,255,.08)" />
        {points.map((p, i) => (
          <circle key={i} cx={pad + (p.x / maxX) * (W - pad * 2)} cy={H - pad - (p.y / maxY) * (H - pad * 2)} r="5" fill="rgba(255,216,77,.55)" stroke="#FFD84D" strokeWidth="1">
            <title>{`${p.label || ''} 浏览 ${fmt(p.x)} · 点赞率 ${(p.y * 100).toFixed(1)}%`}</title>
          </circle>
        ))}
        <text x={W - pad} y={H - pad + 16} textAnchor="end" fontSize="10" fill="#5e7670">浏览</text>
        <text x={pad - 6} y={pad} textAnchor="end" fontSize="10" fill="#5e7670">点赞率</text>
      </svg>
      <Tip tip={tip} />
    </div>
  )
}

export function Heatmap({ days }) {
  if (!days.length) return <div className="py-8 text-center text-[12px] text-dim">还没有数据</div>
  const max = Math.max(...days.map((d) => d.v), 1)
  return (
    <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, 14px)', gap: 3 }}>
      {days.map((d) => {
        const a = d.v ? 0.2 + (d.v / max) * 0.8 : 0
        return (
          <div
            key={d.k}
            title={`${d.k} · ${d.v} 篇`}
            className="h-[14px] w-[14px] rounded-[3px] transition hover:scale-125"
            style={{ background: d.v ? `rgba(255,216,77,${a})` : 'rgba(255,255,255,.05)' }}
          />
        )
      })}
    </div>
  )
}

export function Forecast({ actual, predicted, height = 260 }) {
  const [tip, setTip] = React.useState(null)
  const H = height, padL = 46, padR = 16, padT = 18, padB = 28
  const all = [...actual, ...predicted]
  if (!all.length) return <div className="py-10 text-center text-[12px] text-dim">还不够两次抓取</div>
  const maxD = Math.max(...all.map((p) => p.d), 1)
  const maxV = Math.max(...all.map((p) => p.v), 1)
  const minV = Math.min(...all.map((p) => p.v))
  const padV = Math.max((maxV - minV) * 0.12, maxV * 0.01)
  const lo = Math.max(0, minV - padV)
  const X = (d) => padL + (d / maxD) * (W - padL - padR)
  const Y = (v) => H - padB - ((v - lo) / Math.max(1, maxV - lo)) * (H - padT - padB)
  const aPath = actual.map((p, i) => `${i ? 'L' : 'M'}${X(p.d).toFixed(1)},${Y(p.v).toFixed(1)}`).join(' ')
  const pPath = predicted.length ? `M${X(actual[actual.length - 1]?.d || 0)},${Y(actual[actual.length - 1]?.v || 0)} ` + predicted.map((p) => `L${X(p.d).toFixed(1)},${Y(p.v).toFixed(1)}`).join(' ') : ''
  const hit = (p, text, color) => (
    <g key={`${color}${p.d}`}>
      <circle
        cx={X(p.d)} cy={Y(p.v)} r="12" fill="transparent"
        onMouseOver={() => setTip({ x: (X(p.d) / W) * 100, y: (Y(p.v) / H) * 100, text })}
        onMouseOut={() => setTip(null)}
      />
      <circle cx={X(p.d)} cy={Y(p.v)} r={color === 'a' ? 3 : 2.6} fill={color === 'a' ? '#0A0A0B' : 'none'} stroke={color === 'a' ? '#FFD84D' : '#FF9F1C'} strokeWidth={color === 'a' ? 1.6 : 1.4} style={{ pointerEvents: 'none' }} />
    </g>
  )
  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
        <line x1={padL} x2={W - padR} y1={H - padB} y2={H - padB} stroke="rgba(255,255,255,.08)" />
        <text x={padL - 8} y={padT + 4} textAnchor="end" fontSize="10" fill="#5e7670">{fmt(maxV)}</text>
        <text x={padL - 8} y={H - padB} textAnchor="end" fontSize="10" fill="#5e7670">{fmt(lo)}</text>
        {[0, 0.5, 1].map((t) => (
          <line key={t} x1={padL} x2={W - padR} y1={padT + t * (H - padT - padB)} y2={padT + t * (H - padT - padB)} stroke="rgba(255,255,255,.05)" />
        ))}
        <path d={aPath} fill="none" stroke="#FFD84D" strokeWidth="2.4" strokeLinejoin="round" />
        {predicted.length > 0 && <path d={pPath} fill="none" stroke="#FF9F1C" strokeWidth="2.2" strokeDasharray="7 6" />}
        {actual.map((p) => hit(p, `${p.day || ''} 实际 ${fmt(p.v)}`, 'a'))}
        {predicted.map((p) => hit(p, `第 ${Math.round(p.d)} 天 · 预测 ${fmt(p.v)}`, 'p'))}
        <text x={padL} y={H - 6} fontSize="10" fill="#5e7670">发布当天</text>
        <text x={W - padR} y={H - 6} fontSize="10" fill="#5e7670" textAnchor="end">第 {Math.round(maxD)} 天</text>
      </svg>
      <Tip tip={tip} />
    </div>
  )
}
