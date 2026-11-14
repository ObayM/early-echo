import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { airTests, near, WINDOW, type ExpFilter } from '../data/air'
import { useData } from '../data/DataProvider'
import { atm, pct } from '../data/format'
import { tally } from '../data/outcome'
import { verdict } from '../data/verdict'
import AirGroupFigure from './AirGroupFigure'
import AirMap from './charts/AirMap'
import { useOpenTest } from './TestDrawer'
import { buttonClass, Card, Legend, LegendItem, linkClass, Seg } from './ui'

const PSI_PER_ATM = 14.696
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

export default function AirExplorer({ height = 440 }: { height?: number }) {
  const { tests, summary } = useData()
  const openTest = useOpenTest()
  const { cabins } = summary
  const habitat = cabins.find((c) => c.key === 'habitat')!
  const [pick, setPick] = useState({ o2: habitat.o2, p: habitat.p })
  const [exps, setExps] = useState<ExpFilter>('both')
  const [nitrogenOnly, setNitrogenOnly] = useState(true)

  const mapTests = useMemo(() => airTests(tests, exps, nitrogenOnly), [tests, exps, nitrogenOnly])
  const nearby = useMemo(() => mapTests.filter((t) => near(t, pick.o2, pick.p)), [mapTests, pick])
  const total = tally(nearby)
  const read = verdict(total)
  const byExp = ['FLEX', 'CFI-G'].map((key) => ({ key, ...tally(nearby.filter((t) => t.exp === key)) })).filter((g) => g.tests > 0)
  const choose = (o2: number, p: number) => setPick({ o2: clamp(Math.round(o2 * 200) / 200, 0.1, 0.4), p: clamp(Math.round(p * 100) / 100, 0.45, 3.2) })
  const preset = cabins.find((c) => Math.abs(c.o2 - pick.o2) < 1e-6 && Math.abs(c.p - pick.p) < 0.006)

  return (
    <div className="grid items-start gap-4 xl:grid-cols-12">
      <Card
        className="xl:col-span-8"
        title="Every flame, by the air it burned in"
        aside={
          <Legend>
            <LegendItem swatch={<span className="size-[9px] rotate-45 ring-[1.5px] ring-inset ring-white" />}>Cabin air</LegendItem>
            <LegendItem swatch={<span className="h-2.5 w-3.5 rounded-sm border border-dashed border-white" />}>Your pick</LegendItem>
          </Legend>
        }
      >
        <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2">
          <Seg<ExpFilter> onCard label="Which flames" value={exps} onChange={setExps} options={[['both', 'All flames'], ['FLEX', 'Droplets'], ['CFI-G', 'Gas flames']]} />
          <label className="inline-flex cursor-pointer items-center gap-2 text-[13px] text-muted">
            <input type="checkbox" className="size-4 accent-white" checked={nitrogenOnly} onChange={(e) => setNitrogenOnly(e.target.checked)} />
            Oxygen and nitrogen only
          </label>
        </div>
        <AirMap tests={mapTests} cabins={cabins} outcomes={summary.outcomes} height={height} pick={pick} onPick={choose} onTest={openTest} />
      </Card>

      <Card className="xl:col-span-4" title="Pick a cabin air">
        <div className="flex flex-wrap gap-2">
          {cabins.map((c) => (
            <button key={c.key} type="button" aria-pressed={preset?.key === c.key} onClick={() => setPick({ o2: c.o2, p: c.p })} className={`${buttonClass} ${preset?.key === c.key ? '!border-white' : ''}`}>
              {c.short}
            </button>
          ))}
        </div>
        <div className="mt-4 grid gap-3.5">
          <label className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 text-[13px] text-muted">
            Oxygen
            <output className="font-medium text-ink">{pct(pick.o2)}</output>
            <input type="range" className="col-span-2 h-6 w-full accent-white" min={10} max={40} step={0.5} value={pick.o2 * 100} onChange={(e) => choose(Number(e.target.value) / 100, pick.p)} />
          </label>
          <label className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 text-[13px] text-muted">
            Pressure
            <output className="font-medium text-ink">{atm(pick.p)} ({(pick.p * PSI_PER_ATM).toFixed(1)} psi)</output>
            <input type="range" className="col-span-2 h-6 w-full accent-white" min={0.45} max={3.2} step={0.01} value={pick.p} onChange={(e) => choose(pick.o2, Number(e.target.value))} />
          </label>
        </div>
        <div className="mt-5 border-t border-rule pt-4">
          <AirGroupFigure
            label={preset ? `Nearest flames to ${preset.name.toLowerCase().replace('moon and mars', 'Moon and Mars').replace('shuttle', 'Shuttle')}` : 'Nearest flames to your pick'}
            detail={`Within ${WINDOW.do2 * 100} points of oxygen and ${Math.round((WINDOW.fp - 1) * 100)}% of the pressure`}
            tally={total}
          />
          {byExp.length > 1 && (
            <ul className="mt-2 grid gap-1 text-[13px] text-muted">
              {byExp.map((g) => <li key={g.key}>{g.key === 'FLEX' ? 'Droplets' : 'Gas flames'}: {g.out} of {g.tests} went out</li>)}
            </ul>
          )}
          <p className="mt-4 font-medium">{read.head}</p>
          <p className="mt-1 text-[13px] leading-[19px] text-muted">{read.text}</p>
          {total.tests > 0 && (
            <p className="mt-3">
              <Link className={linkClass} to={`/tests?o2=${pick.o2}&p=${pick.p}&exps=${exps}&n2=${nitrogenOnly ? 1 : 0}`}>See these {total.tests} tests</Link>
            </p>
          )}
        </div>
      </Card>
    </div>
  )
}
