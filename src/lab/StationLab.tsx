import { useDeferredValue, useMemo, useState, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import LabChart from '../components/charts/LabChart'
import { useOpenTest } from '../components/TestDrawer'
import { buttonClass, Card, LegendItem, linkClass, PageTitle, Seg } from '../components/ui'
import { useData } from '../data/DataProvider'
import { atm, GAS, int, pct, seconds as secs } from '../data/format'
import { CLOTH, GAS_HEAT, labFlame } from './flames'
import { ASSUMED, fireAt, gas, puffs, run, type Setup, type Vec } from './model'
import { hasWebGL } from './parts'
import StationScene, { type View } from './StationScene'
import { inside, LINES, START } from './station'
import { Transport, usePlayback } from './playback'

const SECONDS = 120
const SHEET = 'Saffire-I:1'
const NAMES = LINES.map((l) => l.name)
const joules = (j: number) => (j >= 10000 ? `${int(Math.round(j / 1000))} kJ` : `${int(Math.round(j))} J`)
const us = (v: number) => (v < 0.05 ? '0' : v < 10 ? v.toFixed(1) : int(Math.round(v)))
export default function StationLab({ pick }: { pick: ReactNode }) {
  const { byId, summary, candle } = useData()
  const openTest = useOpenTest()
  const [params, setParams] = useSearchParams()
  const threshold = candle.stats.mic1.out_us - candle.stats.mic1.threshold_us

  const presets = useMemo(() => {
    const droplets = (['station', 'habitat'] as const).map((key) => {
      const group = summary.finding[key].ids.map((id) => labFlame(byId.get(id))).filter((f) => f != null).sort((a, b) => a.test.d0! - b.test.d0!)
      const cabin = summary.cabins.find((c) => c.key === key)!.short
      return { name: `Droplet, ${cabin.replace('Station', 'station')} air`, flame: group[group.length >> 1] }
    })
    return [{ name: 'Cloth sheet (Saffire)', flame: labFlame(byId.get(SHEET))! }, ...droplets]
  }, [byId, summary])
  const asked = params.get('flame') ?? ''
  const flame = useMemo(() => labFlame(byId.get(asked)) ?? presets[0].flame, [byId, asked, presets])
  const { test, fire } = flame
  const setFlame = (id: string) => setParams((prev) => { const next = new URLSearchParams(prev); next.set('flame', id); return next }, { replace: true })

  const [at, setAt] = useState<Vec>(START)
  const [flowCm, setFlowCm] = useState(10)
  const flow = useDeferredValue(flowCm) / 100
  const [view, setView] = useState<View>('module')
  const webgl = useMemo(hasWebGL, [])

  const play = usePlayback(SECONDS, `${flame.test.id} ${at} ${flow}`)
  const { t } = play
  const setup = useMemo<Setup>(
    () => ({ air: flame.air, fire: flame.fire, at: inside(at, (flame.fire.travel ?? 0) / 2), flow: [flow, 0, 0], lines: LINES }),
    [flame, at, flow],
  )
  const result = useMemo(() => run(setup, SECONDS, threshold), [setup, threshold])
  const warm = useMemo(() => puffs(setup, t), [setup, t])
  const now = result.early[Math.max(0, Math.min(result.early.length - 1, Math.round(t / result.dt)))]

  const first = result.alarm == null ? -1 : result.tripped.indexOf(result.alarm)
  const g = gas(setup.air)
  const { released } = flame
  const droplet = flame.kind === 'droplet'
  const cloth = flame.kind === 'cloth'
  const watts = released / fire.burn
  const ending = test.end ? summary.outcomes[test.end] : 'Ended'
  const flameNow = t >= fire.burn ? `${ending} at ${secs(fire.burn)}` : 'Burning'
  const quarter = (threshold * 2 * 295.65 * g.c) / 1e6

  return (
    <>
      <PageTitle title="3D lab: a flame loose in a station module" aside={pick}>
        One of NASA's test flames, placed in a station module. Four laptops time sound between each other. Warm air makes the sound arrive early, and past{' '}
        <b>{threshold.toFixed(2)} µs</b> a line trips. The flame comes from NASA's row. <b>The timing is our estimate</b>, checked against one candle.
      </PageTitle>

      <div className="grid items-start gap-4 xl:grid-cols-12">
        <Card
          className="xl:col-span-8"
          title={flame.title}
          aside={
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
              <LegendItem swatch={<span className="h-0.5 w-3.5 bg-[#9fd0ff]" />}>Sound line</LegendItem>
              <LegendItem swatch={<span className="h-[3px] w-3.5 bg-flame" />}>Tripped</LegendItem>
              <LegendItem swatch={<span className="size-2.5 rounded-full bg-flame/40" />}>Warmed air</LegendItem>
              <LegendItem swatch={<span className="size-2.5 rounded-full ring-1 ring-inset ring-white" />}>Where the flame is</LegendItem>
            </div>
          }
        >
          <div className="relative isolate h-[320px] overflow-hidden rounded-xl bg-ground sm:h-[420px] xl:h-[460px]">
            {webgl ? (
              <StationScene
                t={t}
                at={fireAt(setup, t)}
                sheet={fire.travel && fire.wide ? { mid: setup.at, length: fire.travel, wide: fire.wide, burned: Math.min(1, t / fire.burn) } : undefined}
                flame={fire.radius(t)}
                wide={fire.wide}
                soot={droplet ? Math.max(0, 1 - t / (fire.burn * 0.6)) : cloth ? 1 : 0.4}
                puffs={warm}
                early={now}
                threshold={threshold}
                flow={flow}
                view={view}
                onPlace={setAt}
              />
            ) : (
              <p className="p-5 text-muted">This browser can't draw 3D (WebGL is off). The chart and the figures below still work.</p>
            )}
            <p className="pointer-events-none absolute left-3 top-3 rounded-full bg-black/70 px-2.5 py-1 text-xs text-muted">
              {secs(Math.min(t, SECONDS))} · {flameNow}
            </p>
            <p className="pointer-events-none absolute bottom-3 left-3 hidden text-xs text-faint sm:block">Click a wall to move the fire. Drag to look around.</p>
          </div>

          <div className="mt-3.5 flex flex-wrap items-center gap-x-3 gap-y-2">
            <Transport play={play} />
            <Seg<View> onCard label="View" value={view} onChange={setView} options={[['module', 'Whole module'], ['aisle', 'From the hatch'], ['flame', 'Close to the flame']]} />
          </div>

          <h3 className="mb-1 mt-5 text-[13px] font-medium text-muted">Microseconds early on each line (the scale goes up in tens). Drag to move through time.</h3>
          <LabChart run={result} names={NAMES} seconds={SECONDS} t={t} threshold={threshold} burn={fire.burn} onSeek={play.seek} />
          <p className="mt-1 text-xs text-faint">
            Shaded: the flame is burning. In NASA's test it burned for {secs(fire.burn)}{fire.burn > SECONDS ? `, so this is the first ${SECONDS} s` : ''}.
          </p>
        </Card>

        <div className="grid gap-4 xl:col-span-4">
          <Card title="The alarm">
            <p className={`text-[32px] font-semibold leading-10 tracking-[-0.02em] ${result.alarm != null ? 'text-flame' : ''}`}>
              {result.alarm != null ? `Trips after ${secs(result.alarm)}` : `No line trips in ${SECONDS} s`}
            </p>
            <p className="mt-1 text-[13px] leading-[19px] text-muted">
              {result.alarm != null
                ? `Line ${LINES[first].name} is first. ${result.tripped.filter((v) => v != null).length} of ${LINES.length} lines trip in ${SECONDS} s.`
                : 'The warmed air never crosses a line strongly enough. Move the fire or change the air flow.'}
            </p>
            <table className="mt-4 w-full border-collapse">
              <thead>
                <tr className="text-left text-xs text-faint [&>th]:pb-2 [&>th]:font-normal">
                  <th>Line</th>
                  <th className="text-right">Length</th>
                  <th className="text-right">Now</th>
                  <th className="text-right">Tripped at</th>
                </tr>
              </thead>
              <tbody>
                {LINES.map((l, j) => (
                  <tr key={l.name} className="[&>td]:border-t [&>td]:border-rule [&>td]:py-2">
                    <td className="font-medium">{l.name}</td>
                    <td className="text-right text-muted">{l.length.toFixed(1)} m</td>
                    <td className={`text-right ${now[j] >= threshold ? 'font-medium text-flame' : ''}`}>{us(now[j])} µs</td>
                    <td className="text-right">{result.tripped[j] != null ? secs(result.tripped[j]!) : <span className="text-broke">–</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          <Card title="The flame">
            <div className="flex flex-wrap gap-2">
              {presets.map((p) => (
                <button key={p.name} type="button" aria-pressed={p.flame.test.id === test.id} onClick={() => setFlame(p.flame.test.id)} className={`${buttonClass} ${p.flame.test.id === test.id ? '!border-white' : ''}`}>
                  {p.name}
                </button>
              ))}
            </div>
            <dl className="mt-4 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 text-[13px] [&>dd]:border-t [&>dd]:border-rule [&>dd]:py-[7px] [&>dd]:text-right [&>dt]:whitespace-nowrap [&>dt]:border-t [&>dt]:border-rule [&>dt]:py-[7px] [&>dt]:text-muted">
              <dt>Air</dt>
              <dd>{pct(flame.air.o2)} oxygen, {atm(flame.air.p)}{flame.assumedPressure ? ' (assumed)' : ''}, rest {GAS[flame.air.dil]}</dd>
              <dt>Burned for</dt>
              <dd>{secs(fire.burn)}</dd>
              <dt>How it ended</dt>
              <dd>{ending}</dd>
              <dt>Heat given off</dt>
              <dd>{joules(released)}{droplet ? '' : watts >= 1000 ? `, about ${(watts / 1000).toFixed(1)} kW` : `, about ${Math.round(watts)} W`}</dd>
              <dt>Sound in this air</dt>
              <dd>{Math.round(g.c)} m/s</dd>
            </dl>
            <p className="mt-3 text-[13px] leading-[19px] text-muted">
              The heat is worked out from NASA's row, not measured.{' '}
              <button type="button" className={linkClass} onClick={() => openTest(test.id)}>NASA's row</button>
              {' · '}
              <Link className={linkClass} to="/tests">Pick another test</Link>
            </p>
          </Card>

          <Card title="The cabin air flow">
            <label className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 text-[13px] text-muted">
              Along the module
              <output className="font-medium text-ink">{flowCm === 0 ? 'Still air' : `${flowCm} cm/s`}</output>
              <input type="range" className="col-span-2 h-6 w-full accent-white" min={0} max={20} step={1} value={flowCm} onChange={(e) => setFlowCm(Number(e.target.value))} />
            </label>
            <p className="mt-2 text-[13px] leading-[19px] text-muted">
              The station keeps cabin air moving at 7.6 to 20 cm/s (
              <a className={linkClass} href="https://ntrs.nasa.gov/api/citations/20150009509/downloads/20150009509.pdf" target="_blank" rel="noreferrer">NASA</a>
              ). With no gravity nothing else moves the warm air: in still air it stays around the flame.
            </p>
          </Card>
        </div>
      </div>

      <div className="mt-4 grid items-start gap-4 xl:grid-cols-12">
        <Card className="xl:col-span-6" title="How the estimate is made">
          <ol className="grid list-decimal gap-2 pl-[18px] text-[13px] leading-[19px] text-muted">
            <li>
              {droplet
                ? "From NASA's row: the droplet's size, fuel, burn time, how much of it burned, and the air."
                : flame.gas
                ? `From NASA's row: how fast the fuel burned, the burn time and the air. ${flame.gas[0].toUpperCase()}${flame.gas.slice(1)} gives off about ${GAS_HEAT[flame.gas] / 1e6} MJ per kg (textbook).`
                : `From NASA's row: the sheet's size, its burn time and the air. The cloth weighs ${CLOTH.mgPerCm2} mg per cm², ${pct(CLOTH.cotton)} of it cotton (NASA's Saffire paper, ICES-2021-266). Cotton gives off about ${CLOTH.heat / 1e6} MJ per kg (textbook).`}{' '}
              That makes about {joules(released)}. We assume {pct(ASSUMED.kept)} of it stays in the gas as heat.
            </li>
            {cloth && <li>The flame starts at one short edge of the sheet and travels its length at a steady speed, with the air behind it.</li>}
            <li>The warm air spreads slowly by itself. Moving air carries it along and mixes it. How fast it mixes is assumed.</li>
            <li>Sound is faster in warm air. We add up the time saved along each line, across a beam a few cm wide, because sound at 20 kHz doesn't travel as a thin ray.</li>
            <li>A line trips at {threshold.toFixed(2)} µs early. That's how far our candle test's threshold sits from its no-flame level.</li>
          </ol>
          <p className="mt-3 text-[13px] leading-[19px] text-muted">
            <b className="font-medium text-ink">The one check we have:</b> the same sums for our candle on Earth (40 to 80 W, hot air rising at 0.5 to 1 m/s, the line 12 cm above the flame) give 0.8 to 3.2 µs, the right order of size. We measured{' '}
            <Link className={linkClass} to="/sound">{candle.stats.mic1.shift_us.toFixed(1)} µs</Link>.
          </p>
        </Card>
        <Card className="xl:col-span-6" title="What the lab leaves out">
          <ul className="grid list-disc gap-2 pl-[18px] text-[13px] leading-[19px] text-muted">
            <li>Our real test was one 0.9 m line in a still room. These lines are {Math.min(...LINES.map((l) => l.length)).toFixed(1)} to {Math.max(...LINES.map((l) => l.length)).toFixed(1)} m long. Nobody has tested that.</li>
            <li>
              The threshold is tiny: air that is {quarter.toFixed(2)} °C warmer along 1 m of a line shifts the timing just as much. Cabin air that warms by itself (people, equipment, sunlight on the hull) would look the same. We haven't
              measured how steady a cabin is.
            </li>
            <li>
              Sound is carried along by moving air, and the lab ignores that. Air that speeds up or slows down by {Math.min(...LINES.map((l) => (threshold * g.c ** 2) / l.length / 1e4)).toFixed(0)} to{' '}
              {Math.max(...LINES.map((l) => (threshold * g.c ** 2) / l.length / 1e4)).toFixed(0)} cm a second along a line shifts the timing as much as the threshold, and station fans move air at 8 to 20. Timing each line in both directions and adding
              the two cancels this. <a className={linkClass} href="https://earlyecho.obayy.dev/app">Our Android app does this with two phones.</a>
            </li>
            <li>How fast moving air mixes the heat is the least certain number. Less mixing means a thinner, hotter streak: fewer lines touch it, and those trip harder.</li>
            <li>The air flow is one steady stream along the module, and air that reaches the far hatch is gone, as if the air conditioner had cooled it. Real cabin air swirls around racks and people, and some of the heat would come back.</li>
            <li>
              NASA's droplets are a few mm of fuel burned in a sealed chamber. They only trip a line when the air carries their heat straight onto it. The cloth sheet is one of the biggest fires NASA has lit in space, in an empty cargo ship. A real
              cabin fire could be anywhere between.
            </li>
            <li>
              The room is NASA's own 3D model of the US Lab on the station (
              <a className={linkClass} href="https://science.nasa.gov/3d-resources/international-space-station-iss-e-internal/" target="_blank" rel="noreferrer">
                NASA 3D Resources
              </a>
              ). NASA never burned anything loose in it. The flame, its light on the walls, the glow of the warmed air and the pulses on the sound lines are drawn: the flame as a ball {ASSUMED.flameRatio} times as wide as the droplet, or a
              band as wide as the sheet. The pulses are slowed down a great deal. Only the µs figures come from the estimate.
            </li>
          </ul>
        </Card>
      </div>
    </>
  )
}
