import { others } from '../data/outcome'
import type { Tally } from '../data/types'
import { Stack } from './ui'

export default function AirGroupFigure({ label, detail, tally }: { label: string; detail: string; tally: Tally }) {
  return (
    <div>
      <p className="font-medium">{label}</p>
      <p className="mb-2 text-xs text-faint">{detail}</p>
      {tally.tests === 0 ? (
        <p className="text-muted">NASA ran no tests this close to this air.</p>
      ) : (
        <>
          <p className="mb-2 flex items-baseline gap-2">
            <strong className="text-[30px] font-semibold leading-[34px] tracking-[-0.02em]">
              {tally.out} <span className="text-base font-normal tracking-normal text-muted">of {tally.tests}</span>
            </strong>
            <span className="text-muted">went out on their own</span>
          </p>
          <Stack tally={tally} />
          <p className="mt-1.5 min-h-4 text-xs text-faint">{others(tally)}</p>
        </>
      )}
    </div>
  )
}
