import { scaleLinear } from 'd3-scale'
import type { PointerEvent } from 'react'
import type { Candle } from '../../data/types'
import { useWidth } from './useWidth'

export function litSpans(d: Candle): [number, number][] {
  const spans: [number, number][] = []
  let start: number | null = null
  d.lit.forEach((on, i) => {
    if (on && start == null) start = d.t[i]
    if (!on && start != null) {
      spans.push([start, d.t[i]])
      start = null
    }
  })
  if (start != null) spans.push([start, d.seconds])
  return spans
}

export default function CandlePlot({ d, height = 300, mini = false, at, onSeek }: { d: Candle; height?: number; mini?: boolean; at?: number; onSeek?: (t: number) => void }) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const m = mini ? { l: 30, r: 6, t: 8, b: 22 } : { l: 52, r: 14, t: 12, b: 36 }
  const values = d.mic1_us.map((u, i) => (d.blocked[i] ? null : u))
  const ok = values.filter((u): u is number => u != null)
  const lo = Math.floor(Math.min(...ok) / 2) * 2
  const hi = Math.ceil(Math.max(...ok) / 2) * 2
  const x = scaleLinear([0, d.seconds], [m.l, width - m.r])
  const seek = (e: PointerEvent<SVGSVGElement>) => onSeek?.(x.invert(e.clientX - e.currentTarget.getBoundingClientRect().left))
  const y = scaleLinear([lo, hi], [height - m.b, m.t])
  const cut = d.stats.mic1.threshold_us

  let path = ''
  let pen = false
  values.forEach((u, i) => {
    if (u == null) {
      pen = false
      return
    }
    path += `${pen ? 'L' : 'M'}${x(d.t[i] + 0.5).toFixed(1)} ${y(u).toFixed(1)}`
    pen = true
  })
  const yTicks = []
  for (let u = lo; u <= hi; u += 2) yTicks.push(u)
  const xTicks = []
  for (let s = 0; s <= d.seconds; s += mini ? 60 : 30) xTicks.push(s)

  return (
    <div ref={ref} className="w-full">
      <svg
        width={width}
        height={height}
        role="img"
        aria-label={`Sound arrival time each second for ${d.seconds} seconds. It drops by about ${d.stats.mic1.shift_us.toFixed(1)} microseconds whenever the candle is lit.`}
        className={`block overflow-visible ${onSeek ? 'cursor-ew-resize touch-none select-none' : ''}`}
        onPointerDown={onSeek && ((e) => {
          e.currentTarget.setPointerCapture(e.pointerId)
          seek(e)
        })}
        onPointerMove={onSeek && ((e) => e.buttons === 1 && seek(e))}
      >
        {litSpans(d).map(([a, b]) => (
          <rect key={a} x={x(a)} y={m.t} width={x(b) - x(a)} height={height - m.t - m.b} fill="var(--color-flame)" fillOpacity={0.2} />
        ))}
        {yTicks.map((u) => (
          <g key={u}>
            <line x1={m.l} x2={width - m.r} y1={y(u)} y2={y(u)} stroke="var(--color-grid)" />
            <text x={m.l - 8} y={y(u) + 4} textAnchor="end">{(u > 0 ? '+' : u < 0 ? '−' : '') + Math.abs(u)}</text>
          </g>
        ))}
        {xTicks.map((s) => (
          <text key={s} x={x(s)} y={height - m.b + 17} textAnchor={s === 0 ? 'start' : 'middle'}>{s} s</text>
        ))}
        <line x1={m.l} x2={width - m.r} y1={y(cut)} y2={y(cut)} stroke="#fff" strokeOpacity={0.7} strokeDasharray="5 4" />
        {!mini && (
          <>
            <text x={width - m.r} y={y(cut) - 6} textAnchor="end" style={{ fill: '#fff', fontWeight: 500 }} stroke="var(--color-surface)" strokeWidth={4} paintOrder="stroke">
              Threshold
            </text>
          </>
        )}
        <path d={path} fill="none" stroke="#fff" strokeWidth={mini ? 1.5 : 2} strokeLinejoin="round" />
        {at != null && (
          <>
            <line x1={x(at)} x2={x(at)} y1={m.t - 4} y2={height - m.b} stroke="#fff" strokeWidth={1.5} />
            <circle cx={x(at)} cy={m.t - 4} r={3.5} fill="#fff" />
          </>
        )}
      </svg>
    </div>
  )
}
