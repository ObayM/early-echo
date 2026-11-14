import { lazy, Suspense, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link, useNavigationType } from 'react-router-dom'
import AirExplorer from '../components/AirExplorer'
import Brand from '../components/Brand'
import CandlePlot from '../components/charts/CandlePlot'
import FlameVideos from '../components/FlameVideos'
import RankRow from '../components/RankRow'
import SurvivePlot from '../components/charts/SurvivePlot'
import { useOpenTest } from '../components/TestDrawer'
import { buttonClass, Card, Legend, LegendItem, linkClass, Seg } from '../components/ui'
import { useData } from '../data/DataProvider'
import { int } from '../data/format'
import type { FlameStudy } from '../data/types'
import { hasWebGL } from '../lab/webgl'
import { classify, Strip } from './Sound'

const HeroScene = lazy(() => import('../home/HeroScene'))

const STOPS = [['data', 'Flames'], ['rank', 'Ranking'], ['model', 'Model'], ['alarm', 'Alarm'], ['sources', 'Sources']] as const
const go = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
const solid = 'inline-grid h-11 cursor-pointer place-items-center whitespace-nowrap rounded-full bg-white px-5 text-[15px] font-medium text-black transition-colors hover:bg-[#ddd]'
const hollow = 'inline-grid h-11 cursor-pointer place-items-center whitespace-nowrap rounded-full border border-control px-5 text-[15px] font-medium transition-colors hover:border-[#888]'
const note = 'text-[13px] leading-[19px] text-muted'
const SCROLL = 'ee-home-scroll'
const APP = 'https://earlyecho.obayy.dev/app'
const CODE = 'https://github.com/ObayM/early-echo'

const TOUR = [
  { id: 'top', say: 'A flame warms the air. The sound lines that cross it trip.' },
  { id: 'data', say: 'Every flame NASA lit in orbit, placed by its air. Pick a cabin to read the nearest ones.' },
  { id: 'rank', say: 'The same flames in groups, ranked by how few went out.' },
  { id: 'model', say: 'A model for three kinds of flame, checked on days it never saw.' },
  { id: 'alarm', say: 'Our candle test. With the flame lit, the sound arrived early.' },
  { id: 'sources', say: "Every count leads back to NASA's rows." },
]
const HOLD = 12

function Tour({ stop, onStop }: { stop: number; onStop: (n: number | null) => void }) {
  const last = stop === TOUR.length - 1
  useEffect(() => {
    const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    document.getElementById(TOUR[stop].id)?.scrollIntoView({ behavior: calm ? 'auto' : 'smooth', block: 'start' })
    const next = setTimeout(() => onStop(last ? null : stop + 1), HOLD * 1000)
    return () => clearTimeout(next)
  }, [stop, last, onStop])
  useEffect(() => {
    const end = () => onStop(null)
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && end()
    window.addEventListener('wheel', end, { passive: true })
    window.addEventListener('touchmove', end, { passive: true })
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('wheel', end)
      window.removeEventListener('touchmove', end)
      window.removeEventListener('keydown', onKey)
    }
  }, [onStop])
  return (
    <div role="status" className="fixed inset-x-4 bottom-4 z-20 mx-auto max-w-[620px] overflow-hidden rounded-2xl bg-raised shadow-[0_10px_40px_rgba(0,0,0,.7)]">
      <div className="flex items-center gap-3 py-3 pl-4 pr-3">
        <p className="min-w-0 flex-1 text-[15px] leading-[21px]">{TOUR[stop].say}</p>
        <span className="text-xs text-faint">{stop + 1}/{TOUR.length}</span>
        {!last && <button type="button" className={`${buttonClass} !px-3`} onClick={() => onStop(stop + 1)}>Next</button>}
        <button type="button" className={`${buttonClass} !px-3`} onClick={() => onStop(null)}>{last ? 'Done' : 'Stop'}</button>
      </div>
      <i key={stop} className="block h-0.5 origin-left bg-white" style={{ animation: `ee-fill ${HOLD}s linear both` }} />
    </div>
  )
}

function Section({ id, title, lead, children }: { id: string; title: string; lead: ReactNode; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-6 pt-14 lg:pt-20">
      <h2 className="text-[26px] font-semibold leading-8 tracking-[-0.02em] lg:text-[32px] lg:leading-10">{title}</h2>
      <p className="mb-6 mt-2 max-w-[64ch] text-[15px] leading-[22px] text-muted">{lead}</p>
      {children}
    </section>
  )
}

function Hero({ onTour }: { onTour: () => void }) {
  const webgl = useMemo(hasWebGL, [])
  const [live, setLive] = useState(false)
  const ready = useCallback(() => setLive(true), [])
  return (
    <section id="top" className="relative scroll-mt-14 lg:flex lg:min-h-[min(78svh,640px)] lg:items-center">
      <div className="relative z-10 pb-6 pt-8 lg:w-[40%] lg:py-16">
        <h1 className="text-balance text-[34px] font-semibold leading-[38px] tracking-[-0.03em] sm:text-[44px] sm:leading-[48px] xl:text-[52px] xl:leading-[56px]">A fire alarm made of sound</h1>
        <p className="mt-5 max-w-[40ch] text-base leading-6 text-muted">Sound moves faster through hot air, so devices already on the station could time it to notice a flame. Built on NASA's 1,939 space fire tests.</p>
        <div className="mt-7 flex flex-wrap gap-3">
          <Link className={solid} to="/lab">Light your own fire</Link>
          <button type="button" className={hollow} onClick={() => go('data')}>See NASA's data</button>
        </div>
        <button type="button" className={`${linkClass} mt-5 text-muted`} onClick={onTour}>Or take the one minute tour</button>
        <p className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-[15px]">
          <a className={linkClass} href={APP}>Get the Android app (APK)</a>
          <a className={linkClass} href={CODE} target="_blank" rel="noreferrer">Code on GitHub</a>
        </p>
      </div>
      <div className="relative -mx-4 h-[300px] sm:h-[380px] lg:absolute lg:inset-y-0 lg:left-[34%] lg:right-0 lg:mx-0 lg:-mr-8 lg:h-auto">
        <img
          src={`${import.meta.env.BASE_URL}hero.jpg`}
          alt="The station's lab module cut open. A cloth sheet burns at one end, and the sound lines between four laptops that cross its warm air have turned orange."
          className={`absolute inset-0 size-full object-contain transition-opacity duration-700 ${live ? 'opacity-0' : ''}`}
        />
        {webgl && (
          <Suspense fallback={null}>
            <HeroScene onReady={ready} />
          </Suspense>
        )}
        <div className="pointer-events-none absolute inset-y-0 left-0 hidden w-1/4 bg-linear-to-r from-ground to-transparent lg:block" />
      </div>
      <p className="mt-2 text-xs leading-4 text-faint lg:absolute lg:bottom-8 lg:left-0 lg:mt-0">NASA's Saffire-I fire, placed in the US Lab. The timing is our estimate.</p>
    </section>
  )
}

type Show = 'all' | 'FLEX' | 'CFI-G'
const TOP = 8

function Rank() {
  const { summary } = useData()
  const { ranking } = summary
  const [show, setShow] = useState<Show>('all')
  const [whole, setWhole] = useState(false)
  const rows = ranking.map((g, index) => ({ g, index })).filter(({ g }) => show === 'all' || g.exp === show)
  return (
    <Card
      title={whole ? `All ${rows.length} groups` : `Top ${Math.min(TOP, rows.length)} of ${rows.length} groups`}
      aside={<Seg<Show> onCard label="Which flames" value={show} onChange={setShow} options={[['all', 'All flames'], ['FLEX', 'Droplets'], ['CFI-G', 'Gas flames']]} />}
      footer={
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          {rows.length > TOP && (
            <button type="button" className={buttonClass} aria-expanded={whole} onClick={() => setWhole(!whole)}>
              {whole ? 'Show fewer' : `Show all ${rows.length}`}
            </button>
          )}
          <p className={note}>Droplets that broke up are not counted. A group needs five flames that ran to an end.</p>
        </div>
      }
    >
      <div className="mb-3"><Legend /></div>
      <div className="-mx-2 hidden grid-cols-[26px_minmax(0,2.2fr)_minmax(90px,1fr)_124px_84px_76px] gap-x-3 px-2 pb-1 text-xs text-faint md:grid">
        <span />
        <span>Fuel and air</span>
        <span>How the flames ended</span>
        <span className="text-right">Went out</span>
        <span className="text-right">Fuel burned</span>
        <span className="text-right">Burned for</span>
      </div>
      <div className="grid gap-0.5">
        {rows.slice(0, whole ? rows.length : TOP).map(({ g, index }, i) => <RankRow key={index} g={g} place={i + 1} index={index} full />)}
      </div>
    </Card>
  )
}

type Kind = FlameStudy['key']
const KINDS: [Kind, string][] = [['gas', 'Gas flames'], ['droplet', 'Droplets'], ['inverse', 'Inverse flames']]

function Survive() {
  const { model } = useData()
  const openTest = useOpenTest()
  const [kind, setKind] = useState<Kind>('gas')
  const [picks, setPicks] = useState<Partial<Record<Kind, string>>>({})
  const study = model[kind]
  const { scores: s } = study
  const view = { ...study.view, lines: study.view.lines.map((c) => ({ ...c, short: c.short.replace(' prep', '') })) }
  const pick = picks[kind] ?? view.lines[view.lines.length - 1].key
  const checks: [string, number, boolean?][] = [
    ['Always "it goes out"', study.always.right],
    ['Nearest tests, by air', s.near_air.right],
    [`Nearest tests, by air and ${(s.near_plus.name ?? '').replace(/^.* and /, '')}`, s.near_plus.right],
    ['The model', s.kept.right, true],
  ]
  return (
    <div className="grid gap-4">
      <div className="max-w-full overflow-x-auto">
        <Seg<Kind> label="Kind of flame" value={kind} onChange={setKind} options={KINDS} />
      </div>
      <div className="grid items-start gap-4 xl:grid-cols-12">
        <Card
          className="xl:col-span-8"
          title={`${study.name}, by ${view.x.say.split(',')[0].toLowerCase()}`}
          aside={
            <div className="max-w-full overflow-x-auto">
              <Seg<string> onCard dense label={view.pick} value={pick} onChange={(v) => setPicks({ ...picks, [kind]: v })} options={view.lines.map((c) => [c.key, c.short])} />
            </div>
          }
        >
          <SurvivePlot view={view} pick={pick} height={320} onTest={openTest} />
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
            <LegendItem swatch={<span className="h-0.5 w-3.5 bg-white" />}>Model</LegendItem>
            <LegendItem swatch={<span className="w-3.5 border-t-2 border-dotted border-white" />}>No tests nearby, a guess</LegendItem>
            <LegendItem swatch={<span className="h-2.5 w-3.5 rounded-sm bg-white/15" />}>Range when relearned, near tests</LegendItem>
            <LegendItem swatch={<span className="size-2 rounded-full bg-flame" />}>Test that kept burning</LegendItem>
            <LegendItem swatch={<span className="size-2 rounded-full bg-out" />}>Went out</LegendItem>
          </div>
          <p className={`mt-3 ${note}`}>
            {study.tests} tests on {study.days} days{study.dropped ? `, and ${study.dropped} more left out for a missing input` : ''}. {view.note}
          </p>
        </Card>
        <div className="grid gap-4 xl:col-span-4">
          <Card title="What the tests show">
            <dl className="grid gap-3.5">
              {study.raw.map((r) => (
                <div key={r.say}>
                  <dd className="text-[22px] font-medium leading-7">{r.alive} of {r.tests}</dd>
                  <dt className={note}>{r.say}</dt>
                </div>
              ))}
            </dl>
          </Card>
          <Card title="Checked on days it never saw">
            <dl className="grid">
              {checks.map(([label, right, mine]) => (
                <div key={label} className="flex items-baseline justify-between gap-3 border-b border-rule py-2 text-[14px]">
                  <dt className={mine ? 'font-medium' : 'text-muted'}>{label}</dt>
                  <dd className={`whitespace-nowrap tabular-nums ${mine ? 'font-medium' : 'text-muted'}`}>{right} of {study.tests}</dd>
                </div>
              ))}
            </dl>
            <p className={`mt-3 ${note}`}>
              Calls it got right. The model is a {study.model.charAt(0).toLowerCase() + study.model.slice(1)}.
              {s.near_plus.right > s.kept.right && ' The best simple rule got more right here. What the model adds is an estimate between tests.'}
              {s.near_plus.right === s.kept.right && ' A simple rule that matches the same inputs does as well. What the model adds is an estimate between tests.'}
              {' '}We picked each model type after seeing these scores, so they are a little hopeful.
            </p>
          </Card>
        </div>
      </div>
      {kind === 'gas' && <FlameVideos />}
    </div>
  )
}

function Alarm() {
  const { candle: d } = useData()
  const { mic0, mic1 } = d.stats
  const { truth, said } = classify(d)
  return (
    <div className="grid items-start gap-4 xl:grid-cols-12">
      <Card
        className="xl:col-span-8"
        title="A real candle, second by second"
        aside={
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
            <LegendItem swatch={<span className="h-0.5 w-3.5 bg-white" />}>Arrival time, each second</LegendItem>
            <LegendItem swatch={<span className="h-2.5 w-3.5 rounded-sm bg-flame/30" />}>Flame lit</LegendItem>
          </div>
        }
        footer={<Link className={linkClass} to="/sound">Full test</Link>}
      >
        <CandlePlot d={d} height={280} />
        <div className="mt-3 grid grid-cols-1 items-center gap-x-3 gap-y-1.5 text-xs text-muted sm:grid-cols-[52px_minmax(0,1fr)] sm:pr-3.5 [&>span:nth-child(odd)]:sm:text-right">
          <Strip label="Webcam" cells={truth} />
          <Strip label="Sound" cells={said} />
        </div>
        <p className={`mt-3 ${note}`}>Webcam: what happened. Sound: what the threshold said. Dark seconds are not counted, red ones are wrong.</p>
      </Card>
      <div className="grid gap-4 xl:col-span-4">
        <Card title="Result">
          <dl className="grid gap-3.5">
            {[
              [`${mic1.shift_us.toFixed(1)} and ${mic0.shift_us.toFixed(1)} µs`, "earlier with the candle lit, at the laptop's two microphones"],
              [`${mic1.right} of ${mic1.clean_seconds}`, `seconds called right at the first microphone, ${mic0.right} at the second`],
              ['1 laptop and a soundbar', 'nothing custom-built'],
            ].map(([value, label]) => (
              <div key={label}>
                <dd className="text-[22px] font-medium leading-7">{value}</dd>
                <dt className={note}>{label}</dt>
              </div>
            ))}
          </dl>
        </Card>
        <Card title="Limits" footer={<Link className={linkClass} to="/lab">Try it in the 3D lab</Link>}>
          <ul className={`grid list-disc gap-1.5 pl-[18px] ${note}`}>
            <li>The heat has to cross a sound line.</li>
            <li>A person near the line shifts it almost as much.</li>
            <li>One candle, on Earth. No blind run yet.</li>
          </ul>
        </Card>
      </div>
    </div>
  )
}

function SourceList() {
  const { summary } = useData()
  return (
    <Card footer={<Link className={linkClass} to="/sources">How the numbers are made</Link>}>
      <ul className="grid gap-x-8 sm:grid-cols-2 xl:grid-cols-3">
        {summary.experiments.map((e) => (
          <li key={e.key} className="flex items-baseline gap-3 border-b border-rule py-2">
            <Link className="min-w-0 flex-1 truncate font-medium" to={`/tests?exp=${encodeURIComponent(e.key)}`} title={e.name}>{e.key}</Link>
            <span className="whitespace-nowrap text-[13px] text-muted">{int(e.rows)} rows</span>
            <a className={`${linkClass} whitespace-nowrap text-[13px]`} href={e.url} target="_blank" rel="noreferrer">{e.psi}</a>
          </li>
        ))}
      </ul>
    </Card>
  )
}

export default function Home() {
  const { totals } = useData().summary
  const [stop, setStop] = useState<number | null>(null)
  const [back] = useState(useNavigationType() === 'POP')
  useEffect(() => {
    window.scrollTo(0, back ? Number(sessionStorage.getItem(SCROLL)) || 0 : 0)
    const save = () => sessionStorage.setItem(SCROLL, String(window.scrollY))
    window.addEventListener('scroll', save, { passive: true })
    return () => window.removeEventListener('scroll', save)
  }, [back])

  return (
    <>
      <header className="mx-auto flex h-14 max-w-[1320px] items-center pl-2 pr-4 lg:pl-6 lg:pr-8">
        <Brand />
        <nav aria-label="On this page" className="ml-auto flex items-center gap-5 text-muted">
          {STOPS.map(([id, label]) => (
            <button key={id} type="button" className="hidden cursor-pointer transition-colors hover:text-ink md:block" onClick={() => go(id)}>
              {label}
            </button>
          ))}
          <Link className="transition-colors hover:text-ink" to="/lab">3D lab</Link>
          <a className="transition-colors hover:text-ink" href={APP}>App</a>
          <a className="transition-colors hover:text-ink" href={CODE} target="_blank" rel="noreferrer">Code</a>
        </nav>
      </header>
      <main className="mx-auto max-w-[1320px] overflow-x-clip px-4 pb-16 lg:px-8">
        <Hero onTour={() => setStop(0)} />
        <Section
          id="data"
          title="NASA's flames, by the air they burned in"
          lead={`${int(totals.rows)} test records from ${totals.experiments} experiments. Each dot is one flame. Click it to read NASA's row and burn it in the lab, or pick a cabin air.`}
        >
          <AirExplorer height={460} />
        </Section>
        <Section id="rank" title="What keeps a flame alive" lead="Flames grouped by fuel and air. Fewest that went out come first.">
          <Rank />
        </Section>
        <Section id="model" title="Which flames keep burning" lead="We trained a small model for three kinds of flame from two NASA experiments, and checked each one on days of tests it never saw.">
          <Survive />
        </Section>
        <Section id="alarm" title="Our candle test" lead="A speaker plays a high sound and a laptop's two microphones time it. With a real candle under the line, the sound arrived early. Our Android app does the same with two phones, timing both ways.">
          <Alarm />
        </Section>
        <Section id="sources" title="Sources" lead="Every count comes from NASA's published tables. The candle recording is ours.">
          <SourceList />
        </Section>
        <footer className="mt-16 flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-t border-rule pt-6 text-xs text-faint">
          <p>Early Echo · NASA Space Apps Cairo 2026 · Data: NASA PSI, public domain</p>
          <p className="flex flex-wrap gap-4">
            <a className={linkClass} href={APP}>Android app</a>
            <a className={linkClass} href={CODE} target="_blank" rel="noreferrer">Code on GitHub</a>
            <Link className={linkClass} to="/overview">All screens</Link>
            <Link className={linkClass} to="/tests">All tests</Link>
          </p>
        </footer>
      </main>
      {stop != null && <Tour stop={stop} onStop={setStop} />}
    </>
  )
}
