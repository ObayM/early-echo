import { scaleLinear, scaleLog } from 'd3-scale'
import { useMemo, type PointerEvent } from 'react'
import type { Run } from '../../lab/model'
import { useWidth } from './useWidth'

const FLOOR = 0.05

export default function LabChart({ run, names, seconds, t, threshold, burn, onSeek, height = 170 }: { run: Run; names: string[]; seconds: number; t: number; threshold: number; burn: number; onSeek: (t: number) => void; height?: number }) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const m = { l: 44, r: 14, t: 10, b: 26 }
  const top = Math.max(20, ...run.peak) * 1.4
  const x = scaleLinear([0, seconds], [m.l, width - m.r]).clamp(true)
  const y = scaleLog([FLOOR, top], [height - m.b, m.t]).clamp(true)
  const paths = useMemo(
    () => names.map((_, j) => run.early.map((row, i) => `${i ? 'L' : 'M'}${x(i * run.dt).toFixed(1)} ${y(Math.max(FLOOR, row[j])).toFixed(1)}`).join('')),
    [run, names, width, height, seconds],
  )
  const order = names.map((_, j) => j).sort((a, b) => Number(run.tripped[a] != null) - Number(run.tripped[b] != null))
  const yTicks = [0.1, 1, 10, 100, 1000].filter((v) => v < top)
  const xTicks = []
  for (let s = 0; s <= seconds; s += 30) xTicks.push(s)
  const seek = (e: PointerEvent<SVGSVGElement>) => onSeek(x.invert(e.clientX - e.currentTarget.getBoundingClientRect().left))

  return (
    <div ref={ref} className="w-full">
      <svg
        width={width}
        height={height}
        role="img"
        aria-label={`Microseconds early on each sound line over ${seconds} seconds. ${run.alarm == null ? 'No line passes the threshold.' : `The first line passes the threshold at ${run.alarm} seconds.`}`}
        className="block cursor-ew-resize touch-none select-none overflow-visible"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId)
          seek(e)
        }}
        onPointerMove={(e) => e.buttons === 1 && seek(e)}
      >
        <rect x={x(0)} y={m.t} width={x(burn) - x(0)} height={height - m.t - m.b} fill="var(--color-flame)" fillOpacity={0.14} />
        {yTicks.map((v) => (
          <g key={v}>
            <line x1={m.l} x2={width - m.r} y1={y(v)} y2={y(v)} stroke="var(--color-grid)" />
            <text x={m.l - 8} y={y(v) + 4} textAnchor="end">{v}</text>
          </g>
        ))}
        {xTicks.map((s) => (
          <text key={s} x={x(s)} y={height - m.b + 17} textAnchor={s === 0 ? 'start' : s === seconds ? 'end' : 'middle'}>{s} s</text>
        ))}
        <line x1={m.l} x2={width - m.r} y1={y(threshold)} y2={y(threshold)} stroke="#fff" strokeOpacity={0.7} strokeDasharray="5 4" />
        <text x={width - m.r} y={y(threshold) - 6} textAnchor="end" style={{ fill: '#fff', fontWeight: 500 }} stroke="var(--color-surface)" strokeWidth={4} paintOrder="stroke">
          Threshold
        </text>
        {order.map((j) => (
          <path key={names[j]} d={paths[j]} fill="none" stroke={run.tripped[j] != null ? 'var(--color-flame)' : '#777'} strokeWidth={run.tripped[j] != null ? 2 : 1.25} strokeLinejoin="round" />
        ))}
        <line x1={x(t)} x2={x(t)} y1={m.t - 4} y2={height - m.b} stroke="#fff" strokeWidth={1.5} />
        <circle cx={x(t)} cy={m.t - 4} r={3.5} fill="#fff" />
      </svg>
    </div>
  )
}
