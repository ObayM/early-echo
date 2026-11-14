import type { ReactNode } from 'react'
import { MARK, MARK_CLASS, MARK_LABEL, type Mark } from '../data/outcome'
import type { End, Tally } from '../data/types'

export function PageTitle({ title, children, aside }: { title: string; children?: ReactNode; aside?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
      <div>
        <h1 className="text-[22px] font-semibold leading-[30px] tracking-[-0.01em] lg:text-2xl">{title}</h1>
        {children && <p className="mt-1.5 max-w-[78ch] text-[15px] leading-[22px] text-muted [&_b]:font-medium [&_b]:text-ink">{children}</p>}
      </div>
      {aside}
    </div>
  )
}

export function Card({ title, aside, footer, className = '', children }: { title?: string; aside?: ReactNode; footer?: ReactNode; className?: string; children: ReactNode }) {
  return (
    <section className={`flex min-w-0 flex-col rounded-2xl bg-surface p-5 ${className}`}>
      {(title || aside) && (
        <header className="mb-3.5 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-2">
          {title && <h2 className="text-base font-semibold leading-[22px]">{title}</h2>}
          {aside}
        </header>
      )}
      {children}
      {footer && <div className="mt-auto pt-3.5">{footer}</div>}
    </section>
  )
}

export const linkClass = 'cursor-pointer underline decoration-[#555] underline-offset-[3px] transition-colors hover:decoration-white'

export function Dot({ mark }: { mark: Mark }) {
  return <span className={`inline-block size-2 flex-none rounded-full ${MARK_CLASS[mark]}`} />
}

export function Legend({ marks = ['alive', 'broke', 'out'], children }: { marks?: Mark[]; children?: ReactNode }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
      {marks.map((m) => (
        <span key={m} className="inline-flex items-center gap-1.5 whitespace-nowrap">
          <Dot mark={m} />
          {MARK_LABEL[m]}
        </span>
      ))}
      {children}
    </div>
  )
}

export function LegendItem({ swatch, children }: { swatch: ReactNode; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      {swatch}
      {children}
    </span>
  )
}

export function Stack({ tally, className = '' }: { tally: Tally; className?: string }) {
  const parts: [Mark, number][] = [['alive', tally.alive], ['broke', tally.broke], ['out', tally.out]]
  const label = parts.filter(([, n]) => n).map(([m, n]) => `${n} ${MARK_LABEL[m].toLowerCase()}`).join(', ')
  return (
    <div className={`flex h-2.5 gap-0.5 overflow-hidden rounded-full bg-raised ${className}`} role="img" aria-label={label || 'No flames'} title={label}>
      {parts.map(([m, n]) => n > 0 && <span key={m} className={MARK_CLASS[m]} style={{ flexGrow: n, flexBasis: 0 }} />)}
    </div>
  )
}

export function EndMark({ end, label }: { end: End | null; label?: string }) {
  if (!end) return <span className="text-broke">–</span>
  return (
    <span className="inline-flex items-center gap-2 whitespace-nowrap">
      <Dot mark={MARK[end]} />
      {label}
    </span>
  )
}

export function Seg<T extends string>({ options, value, onChange, label, onCard = false, dense = false }: { options: [T, string][]; value: T; onChange: (v: T) => void; label: string; onCard?: boolean; dense?: boolean }) {
  return (
    <div role="group" aria-label={label} className={`inline-flex max-w-full overflow-x-auto rounded-full p-[3px] *:shrink-0 ${onCard ? 'bg-ground' : 'bg-surface'}`}>
      {options.map(([v, text]) => (
        <button
          key={v}
          type="button"
          aria-pressed={v === value}
          onClick={() => onChange(v)}
          className={`h-7 cursor-pointer whitespace-nowrap rounded-full ${dense ? 'px-2.5' : 'px-3'} transition-colors ${v === value ? 'bg-active text-ink' : 'text-muted hover:text-ink'}`}
        >
          {text}
        </button>
      ))}
    </div>
  )
}

export const buttonClass = 'h-[34px] cursor-pointer whitespace-nowrap rounded-full border border-control px-4 transition-colors hover:border-[#888]'
