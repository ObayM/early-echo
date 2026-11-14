import { scaleLinear, scaleLog } from 'd3-scale'
import type { ModelLine, ModelView } from '../../data/types'
import { useWidth } from './useWidth'

const LINE = ['var(--color-out)', 'var(--color-faint)', 'var(--color-flame)']
const STACK = 5

export default function SurvivePlot({ view, pick, height = 320, onTest }: { view: ModelView; pick: string; height?: number; onTest?: (id: string) => void }) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const m = { l: 44, r: 14, t: 28, b: 40 }
  const x = (view.x.log ? scaleLog : scaleLinear)([view.x.lo, view.x.hi], [m.l, width - m.r]).clamp(true)
  const y = scaleLinear([0, 1], [height - m.b, m.t])
  const chosen = view.lines.find((c) => c.key === pick) ?? view.lines[view.lines.length - 1]
  const colour = (c: ModelLine) => LINE[Math.max(0, LINE.length - view.lines.length + view.lines.indexOf(c))]
  const at = (v: number, p: number) => `${x(v).toFixed(1)} ${y(p).toFixed(1)}`

  const path = (c: ModelLine, guess: boolean) =>
    c.points
      .slice(1)
      .map((q, i) => {
        const a = c.points[i]
        return (a.tested === 0 || q.tested === 0) === guess ? `M${at(a.x, a.p)}L${at(q.x, q.p)}` : ''
      })
      .join('')
  const runs: ModelLine['points'][] = []
  chosen.points.forEach((q, i) => {
    if (q.tested === 0) return
    if (i > 0 && chosen.points[i - 1].tested > 0) runs[runs.length - 1].push(q)
    else runs.push([q])
  })
  const bands = runs.filter((r) => r.length > 1).map((r) => `M${[...r.map((q) => at(q.x, q.hi)), ...[...r].reverse().map((q) => at(q.x, q.lo))].join('L')}Z`)

  const stacks = new Map<string, { cx: number; alive: boolean; tests: ModelLine['tests'] }>()
  for (const t of [...chosen.tests].sort((a, b) => a.x - b.x)) {
    const cx = x(t.x)
    const k = [...stacks.keys()].find((key) => { const st = stacks.get(key)!; return st.alive === t.alive && Math.abs(st.cx - cx) < 4 }) ?? `${cx}:${t.alive}`
    const st = stacks.get(k) ?? { cx, alive: t.alive, tests: [] }
    st.tests.push(t)
    stacks.set(k, st)
  }
  const edge = (alive: boolean, n: number) => y(alive ? 1 : 0) + (alive ? n : -n) * 7
  const dots = [...stacks.values()].flatMap((st) => st.tests.slice(0, STACK).map((t, n) => ({ ...t, cx: st.cx, cy: edge(st.alive, n) })))
  const more = [...stacks.values()].filter((st) => st.tests.length > STACK)

  const names = view.lines.map((c) => ({ c, y: y(c.points[0].p) - 8 })).sort((a, b) => a.y - b.y)
  const crowded = names.some((n, i) => i > 0 && n.y - names[i - 1].y < 15)
  const first = chosen.points[0]
  const last = chosen.points[chosen.points.length - 1]

  return (
    <div ref={ref} className="w-full">
      {crowded && (
        <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
          {view.lines.map((c) => (
            <span key={c.key} className="inline-flex items-center gap-1.5 whitespace-nowrap">
              <span className="h-0.5 w-3.5" style={{ background: colour(c) }} />
              {c.short}
            </span>
          ))}
        </div>
      )}
      <svg
        width={width}
        height={height}
        role="img"
        aria-label={`Chance a flame keeps burning. ${view.pick}: ${chosen.short}. ${Math.round(first.p * 100)}% at ${first.x} and ${Math.round(last.p * 100)}% at ${last.x} (${view.x.say}).`}
        className="block overflow-visible"
      >
        {[0, 0.25, 0.5, 0.75, 1].map((v) => (
          <g key={v}>
            <line x1={m.l} x2={width - m.r} y1={y(v)} y2={y(v)} stroke="var(--color-grid)" />
            <text x={m.l - 8} y={y(v) + 4} textAnchor="end">{v * 100}%</text>
          </g>
        ))}
        {view.x.ticks.map((v, i) => (
          <text key={v} x={x(v)} y={height - m.b + 17} textAnchor={i === 0 && x(v) - m.l < 12 ? 'start' : 'middle'}>{v}</text>
        ))}
        <text x={width - m.r} y={height - 4} textAnchor="end">{view.x.say}</text>
        <text x={m.l} y={m.t - 14}>Chance it keeps burning</text>
        {bands.map((d) => <path key={d} d={d} fill={colour(chosen)} fillOpacity={0.14} />)}
        {view.lines.map((c) => {
          const on = c === chosen
          const common = { fill: 'none', stroke: colour(c), strokeWidth: on ? 2.5 : 1.5, strokeOpacity: on ? 1 : 0.55, strokeLinecap: 'round' as const }
          return (
            <g key={c.key}>
              <path d={path(c, false)} {...common} />
              <path d={path(c, true)} {...common} strokeDasharray="3 5" />
              {!crowded && (
                <text x={x(c.points[0].x) + 6} y={y(c.points[0].p) - 8} style={{ fill: colour(c), fontWeight: on ? 500 : 400 }} stroke="var(--color-surface)" strokeWidth={4} paintOrder="stroke">
                  {c.short}
                </text>
              )}
            </g>
          )
        })}
        {dots.map((d) => (
          <circle
            key={d.id}
            cx={d.cx}
            cy={d.cy}
            r={3.5}
            fill={d.alive ? 'var(--color-flame)' : 'var(--color-out)'}
            stroke="var(--color-surface)"
            strokeWidth={1.5}
            className={onTest ? 'cursor-pointer' : undefined}
            onClick={() => onTest?.(d.id)}
            tabIndex={onTest ? 0 : undefined}
            role={onTest ? 'button' : undefined}
            aria-label={onTest ? `Test at ${d.x}, ${d.alive ? 'kept burning' : 'went out'}. Open NASA's row.` : undefined}
            onKeyDown={(e) => {
              if (onTest && (e.key === 'Enter' || e.key === ' ')) {
                e.preventDefault()
                onTest(d.id)
              }
            }}
          >
            <title>{`${d.x}, ${d.alive ? 'kept burning' : 'went out'}`}</title>
          </circle>
        ))}
        {more.map((st) => (
          <text key={`${st.cx}:${st.alive}`} x={st.cx + 7} y={edge(st.alive, STACK - 1) + 4} style={{ fill: st.alive ? 'var(--color-flame)' : 'var(--color-out)' }} stroke="var(--color-surface)" strokeWidth={4} paintOrder="stroke">
              +{st.tests.length - STACK}
          </text>
        ))}
      </svg>
    </div>
  )
}
