import { scaleLinear, scaleLog } from 'd3-scale'
import { useMemo, useState, type MouseEvent } from 'react'
import { WINDOW, type AirTest } from '../../data/air'
import { atm, pct } from '../../data/format'
import { MARK, type Mark } from '../../data/outcome'
import type { Cabin, End } from '../../data/types'
import { useWidth } from './useWidth'

const O2: [number, number] = [0.08, 0.42]
const P: [number, number] = [0.42, 3.6]
const FILL: Record<Mark, string> = { out: 'var(--color-out)', alive: 'var(--color-flame)', broke: 'var(--color-broke)', noign: 'none' }
const ORDER: Record<Mark, number> = { out: 0, broke: 1, alive: 2, noign: 0 }
const LABEL_AT: Record<Cabin['key'], { dx: number; dy: number; anchor: 'start' | 'middle' | 'end' }> = {
  station: { dx: 12, dy: -12, anchor: 'start' },
  prep: { dx: -12, dy: 4, anchor: 'end' },
  habitat: { dx: -12, dy: 4, anchor: 'end' },
}

interface Props {
  tests: AirTest[]
  cabins: Cabin[]
  height?: number
  outcomes: Record<End, string>
  pick?: { o2: number; p: number }
  onPick?: (o2: number, p: number) => void
  onTest?: (id: string) => void
}

export default function AirMap({ tests, cabins, height = 340, outcomes, pick, onPick, onTest }: Props) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const [hover, setHover] = useState<{ t: AirTest; x: number; y: number } | null>(null)
  const small = width < 520
  const m = { l: 58, r: 14, t: 14, b: 40 }
  const x = scaleLinear(O2, [m.l, width - m.r])
  const y = scaleLog(P, [height - m.b, m.t])

  const dots = useMemo(() => {
    const r = small ? 2.6 : 3.3
    const gap = 2 * r + 0.7
    const spots: [number, number][] = []
    for (let j = -14; j <= 14; j++) for (let k = -14; k <= 14; k++) spots.push([j * gap + (k % 2 ? gap / 2 : 0), k * gap * 0.866])
    spots.sort((a, b) => Math.hypot(...a) - Math.hypot(...b))
    const placed: { t: AirTest; mark: Mark; px: number; py: number }[] = []
    for (const t of [...tests].sort((a, b) => ORDER[MARK[b.end]] - ORDER[MARK[a.end]] || a.o2 - b.o2 || a.p - b.p)) {
      const hx = x(t.o2)
      const hy = y(t.p)
      const [dx, dy] = spots.find(([dx, dy]) => !placed.some((q) => Math.hypot(q.px - hx - dx, q.py - hy - dy) < gap - 0.01)) ?? [0, 0]
      placed.push({ t, mark: MARK[t.end], px: hx + dx, py: hy + dy })
    }
    return { r, list: placed }
  }, [tests, width, height, small])

  const click = (e: MouseEvent<SVGRectElement>) => {
    const box = e.currentTarget.ownerSVGElement!.getBoundingClientRect()
    onPick?.(x.invert(e.clientX - box.left), y.invert(e.clientY - box.top))
  }
  const clampX = (v: number) => Math.min(width - m.r, Math.max(m.l, v))
  const clampY = (v: number) => Math.min(height - m.b, Math.max(m.t, v))

  return (
    <div ref={ref} className="relative w-full">
      <svg width={width} height={height} role="img" aria-label={`Map of ${tests.length} flames by the oxygen and pressure of the air they burned in`} className="block overflow-visible">
        {[0.5, 0.7, 1, 2, 3].map((p) => (
          <g key={p}>
            <line x1={m.l} x2={width - m.r} y1={y(p)} y2={y(p)} stroke="var(--color-grid)" />
            <text x={m.l - 10} y={y(p) + 4} textAnchor="end">{p} atm</text>
          </g>
        ))}
        {(small ? [0.1, 0.2, 0.3, 0.4] : [0.1, 0.15, 0.2, 0.25, 0.3, 0.35, 0.4]).map((o) => (
          <text key={o} x={x(o)} y={height - m.b + 18} textAnchor="middle">{Math.round(o * 100)}%</text>
        ))}
        <text x={width - m.r} y={height - 4} textAnchor="end">Oxygen in the air</text>
        {onPick && <rect x={m.l} y={m.t} width={width - m.l - m.r} height={height - m.t - m.b} fill="transparent" className="cursor-crosshair" onClick={click} />}
        {dots.list.map(({ t, mark, px, py }) => (
          <circle
            key={t.id}
            cx={px}
            cy={py}
            r={dots.r}
            fill={FILL[mark]}
            className={onTest ? 'cursor-pointer' : undefined}
            onPointerEnter={() => setHover({ t, x: px, y: py })}
            onPointerLeave={() => setHover(null)}
            onClick={() => onTest?.(t.id)}
          />
        ))}
        {pick && (
          <rect
            x={clampX(x(pick.o2 - WINDOW.do2))}
            y={clampY(y(pick.p * WINDOW.fp))}
            width={clampX(x(pick.o2 + WINDOW.do2)) - clampX(x(pick.o2 - WINDOW.do2))}
            height={clampY(y(pick.p / WINDOW.fp)) - clampY(y(pick.p * WINDOW.fp))}
            rx={6}
            fill="none"
            stroke="#fff"
            strokeDasharray="4 4"
            pointerEvents="none"
          />
        )}
        {cabins.map((c) => {
          const cx = x(c.o2)
          const cy = y(c.p)
          const at = LABEL_AT[c.key]
          return (
            <g key={c.key} pointerEvents="none">
              <rect x={cx - 5} y={cy - 5} width={10} height={10} transform={`rotate(45 ${cx} ${cy})`} fill="#000" stroke="#fff" strokeWidth={1.5} />
              <text x={cx + at.dx} y={cy + at.dy} textAnchor={at.anchor} style={{ fill: '#fff', fontWeight: 500 }} stroke="#000" strokeWidth={4} paintOrder="stroke">
                {c.short}
              </text>
            </g>
          )
        })}
      </svg>
      {hover && (
        <div
          className="pointer-events-none absolute z-10 w-max max-w-[260px] -translate-x-1/2 -translate-y-full rounded-lg bg-active px-2.5 py-1.5 text-xs leading-[17px] shadow-[0_6px_20px_rgba(0,0,0,.5)]"
          style={{ left: Math.min(width - 130, Math.max(130, hover.x)), top: hover.y - 10 }}
        >
          {hover.t.exp} {hover.t.label} · {hover.t.fuel}
          <br />
          <span className="text-muted">{pct(hover.t.o2)} oxygen · {atm(hover.t.p)} · {outcomes[hover.t.end]}</span>
        </div>
      )}
    </div>
  )
}
