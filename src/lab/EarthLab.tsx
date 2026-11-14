import { useMemo, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import CandlePlot, { litSpans } from '../components/charts/CandlePlot'
import { Card, LegendItem, linkClass, PageTitle } from '../components/ui'
import { useData } from '../data/DataProvider'
import { signed } from '../data/format'
import EarthScene, { WICK } from './EarthScene'
import { puffs, steadyFire, type Setup } from './model'
import { hasWebGL } from './parts'
import { Transport, usePlayback } from './playback'

const ROOM_AIR = { o2: 0.21, p: 1, dil: 'N2' }
const CANDLE_WATTS = 60
const RISE = 0.5
const SMOOTH = 0.0003

export default function EarthLab({ pick }: { pick: ReactNode }) {
  const { candle: d } = useData()
  const m = d.stats.mic1
  const play = usePlayback(d.seconds, d.recording)
  const { t } = play
  const webgl = useMemo(hasWebGL, [])

  const i = Math.floor(t) - d.t[0]
  const has = i >= 0 && i < d.t.length
  const lit = has ? d.lit[i] : d.periods[0].state === 'lit'
  const blocked = has && d.blocked[i]
  const u = has && !blocked ? d.mic1_us[i] : null
  const saysFlame = u != null && u < m.threshold_us
  const verdict = !has ? 'No reading yet' : blocked ? 'Hand in the way' : !d.clean[i] ? 'Not counted' : saysFlame ? 'Flame' : 'No flame'

  let right = 0
  let counted = 0
  for (let k = 0; k <= Math.min(i, d.t.length - 1); k++) {
    if (!d.clean[k]) continue
    counted++
    if (d.mic1_us[k] < m.threshold_us === d.lit[k]) right++
  }

  console.assert(i < d.t.length - 1 || (right === m.right && counted === m.clean_seconds), 'the replay disagrees with the exported stats', { right, counted, m })

  const plumes = useMemo(
    () => litSpans(d).map(([a, b]) => ({ a, b, setup: { air: ROOM_AIR, fire: steadyFire(CANDLE_WATTS, b - a), at: WICK, flow: [0, RISE, 0], lines: [], mix: SMOOTH } satisfies Setup })),
    [d],
  )
  const warm = useMemo(() => {
    const p = plumes.filter(({ a, b }) => a <= t && t < b + 2).pop()
    return p ? puffs(p.setup, t - p.a) : []
  }, [plumes, t])

  return (
    <>
      <PageTitle title="3D lab: our candle test, replayed" aside={pick}>
        This is a recording, not a simulation. We lit a real candle under a sound line and put it out, {litSpans(d).filter(([a, b]) => b - a > 5).length} times in {d.seconds} seconds. The flame here is lit when our webcam saw it lit. The line shows{' '}
        <b>what the sound measured that second</b>.
      </PageTitle>

      <div className="grid items-start gap-4 xl:grid-cols-12">
        <Card
          className="xl:col-span-8"
          title="Soundbar, laptop and a candle"
          aside={
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
              <LegendItem swatch={<span className="h-0.5 w-3.5 bg-[#9fd0ff]" />}>Sound line</LegendItem>
              <LegendItem swatch={<span className="h-[3px] w-3.5 bg-flame" />}>Reads as a flame</LegendItem>
              <LegendItem swatch={<span className="size-2.5 rounded-full bg-flame/40" />}>Rising hot air (drawn)</LegendItem>
            </div>
          }
        >
          <div className="relative isolate h-[320px] overflow-hidden rounded-xl bg-ground sm:h-[420px] xl:h-[460px]">
            {webgl ? (
              <EarthScene t={t} lit={lit} early={u == null ? null : m.out_us - u} need={m.out_us - m.threshold_us} blocked={blocked} puffs={warm} />
            ) : (
              <p className="p-5 text-muted">This browser can't draw 3D (WebGL is off). The plot and the figures still work.</p>
            )}
            <p className="pointer-events-none absolute left-3 top-3 rounded-full bg-black/70 px-2.5 py-1 text-xs text-muted">
              {Math.floor(t)} s · Webcam: {lit ? 'lit' : 'out'}
            </p>
            <p className="pointer-events-none absolute bottom-3 left-3 hidden text-xs text-faint sm:block">Drag to look around.</p>
          </div>

          <div className="mt-3.5 flex flex-wrap items-center gap-x-3 gap-y-2">
            <Transport play={play} />
          </div>

          <h3 className="mb-1 mt-5 text-[13px] font-medium text-muted">Arrival time of the sound each second, in µs. Shaded: the webcam saw the flame. Drag to move through time.</h3>
          <CandlePlot d={d} height={230} at={t} onSeek={play.seek} />
        </Card>

        <div className="grid gap-4 xl:col-span-4">
          <Card title="This second">
            <p className={`text-[32px] font-semibold leading-10 tracking-[-0.02em] ${verdict === 'Flame' ? 'text-flame' : ''}`}>{verdict}</p>
            <p className="mt-1 text-[13px] leading-[19px] text-muted">
              {verdict === 'Hand in the way'
                ? 'A hand crossed the line to light or put out the candle. There is no usable reading.'
                : verdict === 'Not counted'
                  ? 'The flame had just changed, so this second is left out of the score.'
                  : verdict === 'No reading yet'
                    ? 'The recording starts with the candle lit.'
                    : 'What one fixed threshold says, from the sound alone.'}
            </p>
            <dl className="mt-4 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 text-[13px] [&>dd]:border-t [&>dd]:border-rule [&>dd]:py-[7px] [&>dd]:text-right [&>dt]:whitespace-nowrap [&>dt]:border-t [&>dt]:border-rule [&>dt]:py-[7px] [&>dt]:text-muted">
              <dt>Webcam saw</dt>
              <dd>{lit ? 'Flame lit' : 'Flame out'}</dd>
              <dt>Sound arrived at</dt>
              <dd>{u == null ? '–' : `${signed(u)} µs`}</dd>
              <dt>Threshold</dt>
              <dd>below {signed(m.threshold_us)} µs means a flame</dd>
              <dt>Right so far</dt>
              <dd>{counted ? `${right} of ${counted} seconds` : '–'}</dd>
            </dl>
          </Card>

          <Card title="The whole test">
            <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 text-[13px] [&>dd]:border-t [&>dd]:border-rule [&>dd]:py-[7px] [&>dd]:text-right [&>dt]:whitespace-nowrap [&>dt]:border-t [&>dt]:border-rule [&>dt]:py-[7px] [&>dt]:text-muted [&>dd:first-of-type]:border-0 [&>dt:first-of-type]:border-0 [&>dd:first-of-type]:pt-0 [&>dt:first-of-type]:pt-0">
              <dt>Flame lit</dt>
              <dd>{signed(m.lit_us)} µs on average</dd>
              <dt>Flame out</dt>
              <dd>{signed(m.out_us)} µs on average</dd>
              <dt>Difference</dt>
              <dd>{m.shift_us.toFixed(1)} µs earlier when lit</dd>
              <dt>Seconds right</dt>
              <dd>{m.right} of {m.clean_seconds}</dd>
            </dl>
            <p className="mt-3 text-[13px] leading-[19px] text-muted">
              <Link className={linkClass} to="/sound">The full analysis</Link>
              {' · '}
              <Link className={linkClass} to="/lab">The same idea in a station module</Link>
            </p>
          </Card>
        </div>
      </div>

      <div className="mt-4 grid items-start gap-4 xl:grid-cols-12">
        <Card className="xl:col-span-6" title="What is measured">
          <ul className="grid list-disc gap-2 pl-[18px] text-[13px] leading-[19px] text-muted">
            <li>When the flame was lit: {d.truth.charAt(0).toLowerCase() + d.truth.slice(1)}</li>
            <li>The arrival time on the candle's line, once a second, from the laptop's own microphone. It is the left speaker's sound against the right speaker's, so the soundbar's clock drift cancels.</li>
            <li>The seconds when a hand crossed the line.</li>
          </ul>
        </Card>
        <Card className="xl:col-span-6" title="What is drawn">
          <ul className="grid list-disc gap-2 pl-[18px] text-[13px] leading-[19px] text-muted">
            <li>
              Where things stand. {d.setup} A frame from the webcam shows the laptop facing the soundbar, with the candle under the middle of the line. We didn't measure it to the centimetre.
            </li>
            <li>
              The books are drawn as a plain stand of the same height. They were only there to lift the soundbar level with the laptop's microphone. The table and the candle are stand-ins too: a free 3D model (Poly Haven, public domain) and
              shapes we drew. The room is drawn dark so the flame shows.
            </li>
            <li>The flame's shape, its light, the pulses on the sound lines (slowed down a great deal) and the hot air rising from the flame. On Earth hot air rises through the line. In the station it stays near the flame until the cabin air moves it.</li>
            <li>Which of the soundbar's two speakers the candle's line comes from. The other speaker's line is the one it is timed against.</li>
          </ul>
        </Card>
      </div>
    </>
  )
}
