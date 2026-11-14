import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import AirGroupFigure from '../components/AirGroupFigure'
import AirMap from '../components/charts/AirMap'
import CandlePlot from '../components/charts/CandlePlot'
import RankRow from '../components/RankRow'
import { useOpenTest } from '../components/TestDrawer'
import { Card, Dot, Legend, LegendItem, linkClass, PageTitle } from '../components/ui'
import { airTests } from '../data/air'
import { useData } from '../data/DataProvider'
import { int } from '../data/format'
import { MARK_LABEL, type Mark } from '../data/outcome'

export default function Overview() {
  const { tests, summary, candle } = useData()
  const openTest = useOpenTest()
  const { station, habitat, caveats } = summary.finding
  const { totals, ranking } = summary
  const mapTests = useMemo(() => airTests(tests, 'both', true), [tests])
  const mic = candle.stats.mic1
  const o = totals.outcomes
  const endings: [Mark, number][] = [['out', o.out], ['alive', o.burned + o.stopped], ['broke', o.broke], ['noign', o.noign]]
  console.assert(endings.reduce((sum, [, n]) => sum + n, 0) === totals.with_outcome, 'endings do not add up')
  const years = summary.experiments.flatMap((e) => e.years ?? []).sort()

  return (
    <>
      <PageTitle title="Fire tests in space">
        In station-like air, <b>{station.out} of {station.tests}</b> droplet flames went out on their own. In the nearest tests to Moon and Mars habitat air,{' '}
        <b>{habitat.out} of {habitat.tests}</b> did.
      </PageTitle>

      <div className="grid gap-4 xl:grid-cols-12">
        <Card
          className="xl:col-span-8"
          title="Where flames die, and where they don't"
          aside={
            <Legend>
              <LegendItem swatch={<span className="size-[9px] rotate-45 ring-[1.5px] ring-inset ring-white" />}>Cabin air</LegendItem>
            </Legend>
          }
          footer={<Link className={linkClass} to="/air">Pick a cabin air and see its nearest tests</Link>}
        >
          <AirMap tests={mapTests} cabins={summary.cabins} outcomes={summary.outcomes} height={330} onTest={openTest} />
          <p className="mt-1 text-[13px] leading-[19px] text-muted">
            Each dot is one flame NASA lit on the space station in oxygen and nitrogen: {int(mapTests.length)} droplets and gas flames with a recorded ending.
          </p>
        </Card>

        <Card className="xl:col-span-4" title="Two kinds of cabin air" footer={<Link className={linkClass} to="/tests?set=habitat">See the {habitat.tests} habitat-like tests</Link>}>
          <div className="grid gap-5">
            <AirGroupFigure label={station.label} detail={station.detail} tally={station} />
            <AirGroupFigure label={habitat.label} detail={habitat.detail} tally={habitat} />
          </div>
          <ul className="mt-4 grid list-disc gap-2 pl-[18px] text-[13px] leading-[19px] text-muted">
            <li>{caveats[0]}</li>
            <li>{caveats[2]}</li>
          </ul>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-12">
        <Card
          className="xl:col-span-5"
          title="Hardest air to put a flame out in"
          aside={<span className="text-[13px] text-muted">top 5 of {ranking.length} groups</span>}
          footer={<Link className={linkClass} to="/ranking">Full ranking</Link>}
        >
          <div className="grid gap-0.5">
            {ranking.slice(0, 5).map((g, i) => <RankRow key={i} g={g} place={i + 1} index={i} />)}
          </div>
        </Card>

        <Card className="xl:col-span-4" title="A fire alarm made of sound" footer={<Link className={linkClass} to="/sound">See our candle test</Link>}>
          <CandlePlot d={candle} height={176} mini />
          <p className="mt-3 text-[13px] leading-[19px] text-muted">
            Sound crosses hot air faster. With a candle lit under one sound line, the sound arrived{' '}
            <b className="font-medium text-ink">{mic.shift_us.toFixed(1)} µs earlier</b> (shaded), and one threshold got{' '}
            <b className="font-medium text-ink">{mic.right} of {mic.clean_seconds}</b> seconds right.
          </p>
        </Card>

        <Card className="xl:col-span-3" title="NASA's records" footer={<Link className={linkClass} to="/tests">Browse all tests</Link>}>
          <dl className="grid gap-3.5">
            {[
              [int(totals.rows), 'test records in one table'],
              [String(totals.experiments), `experiments, ${years[0]} to ${years[years.length - 1]}`],
              [int(totals.with_outcome), 'records that say how the flame ended'],
            ].map(([value, label]) => (
              <div key={label}>
                <dd className="text-[22px] font-medium leading-7">{value}</dd>
                <dt className="text-[13px] text-muted">{label}</dt>
              </div>
            ))}
          </dl>
          <ul className="mt-3 grid gap-1.5 border-t border-rule pt-3 text-[13px]">
            {endings.map(([mark, n]) => (
              <li key={mark} className="flex items-center gap-2">
                <Dot mark={mark} />
                <span className="text-muted">{MARK_LABEL[mark]}</span>
                <span className="ml-auto">{int(n)}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  )
}
