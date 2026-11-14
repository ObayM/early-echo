import CandlePlot from '../components/charts/CandlePlot'
import { Card, LegendItem, PageTitle } from '../components/ui'
import { useData } from '../data/DataProvider'
import { signed } from '../data/format'
import type { Candle } from '../data/types'

type Cell = 'lit' | 'out' | 'skip' | 'wrong'
const CELL: Record<Cell, string> = { lit: 'bg-flame', out: 'bg-out', skip: 'bg-[#2a2a2a]', wrong: 'bg-wrong' }

export function classify(d: Candle): { truth: Cell[]; said: Cell[]; right: number; counted: number } {
  const cut = d.stats.mic1.threshold_us
  const truth: Cell[] = d.lit.map((on) => (on ? 'lit' : 'out'))
  const said: Cell[] = d.mic1_us.map((u, i) => (!d.clean[i] ? 'skip' : u < cut === d.lit[i] ? truth[i] : 'wrong'))
  return { truth, said, right: said.filter((c) => c === 'lit' || c === 'out').length, counted: said.filter((c) => c !== 'skip').length }
}

export function Strip({ label, cells }: { label: string; cells: Cell[] }) {
  return (
    <>
      <span className="sm:pr-2">{label}</span>
      <span className="flex h-3 overflow-hidden rounded-[3px]" aria-hidden="true">
        {cells.map((c, i) => <i key={i} className={`flex-1 ${CELL[c]}`} />)}
      </span>
    </>
  )
}

export default function Sound() {
  const { candle: d } = useData()
  const { mic0, mic1 } = d.stats
  const { truth, said, right, counted } = classify(d)
  console.assert(right === mic1.right && counted === mic1.clean_seconds, 'candle strip disagrees with the exported stats', { right, counted, mic1 })
  const lit = d.periods.filter((p) => p.state === 'lit' && p.mic1_us != null).map((p) => signed(p.mic1_us!))
  const shake = [mic0, mic1].map((m) => Math.round(m.shake_lit_us / m.shake_out_us)).sort((a, b) => a - b)

  return (
    <>
      <PageTitle title="Sound alarm">
        Sound crosses hot air faster. With a candle lit under one sound line, the sound arrived <b>{mic1.shift_us.toFixed(1)} µs earlier</b>, and one fixed threshold got{' '}
        <b>{mic1.right} of {mic1.clean_seconds}</b> seconds right.
      </PageTitle>

      <div className="grid items-start gap-4 xl:grid-cols-12">
        <Card
          className="xl:col-span-8"
          title="Our candle test, with a real candle"
          aside={
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
              <LegendItem swatch={<span className="h-0.5 w-3.5 bg-white" />}>Arrival time of the sound, each second</LegendItem>
              <LegendItem swatch={<span className="h-2.5 w-3.5 rounded-sm bg-flame/30" />}>Flame lit (webcam)</LegendItem>
            </div>
          }
        >
          <CandlePlot d={d} height={300} />
          <div className="mt-3 grid grid-cols-1 items-center gap-x-3 gap-y-1.5 text-xs text-muted sm:grid-cols-[52px_minmax(0,1fr)] sm:pr-3.5 [&>span:nth-child(odd)]:sm:text-right">
            <Strip label="Webcam" cells={truth} />
            <Strip label="Sound" cells={said} />
          </div>
          <p className="mt-3 text-[13px] leading-[19px] text-muted">
            The two strips are the same {d.seconds} seconds: what the webcam saw, and what the threshold said from sound alone. Dark seconds are not counted (within 5 s of
            lighting or blowing out, or a hand in the line). Red seconds are wrong.
          </p>
        </Card>

        <Card className="xl:col-span-4" title="The numbers">
          <table className="w-full border-collapse">
            <thead>
              <tr className="text-xs text-faint [&>th]:pb-2 [&>th]:font-normal">
                <th className="text-left">Sound arrives</th>
                <th className="text-right">Mic A</th>
                <th className="text-right">Mic B</th>
              </tr>
            </thead>
            <tbody className="[&_td]:border-t [&_td]:border-rule [&_td]:py-2.5 [&_td:not(:first-child)]:text-right">
              <tr><td className="text-muted">Flame lit</td><td>{signed(mic1.lit_us)} µs</td><td>{signed(mic0.lit_us)} µs</td></tr>
              <tr><td className="text-muted">Flame out</td><td>{signed(mic1.out_us)} µs</td><td>{signed(mic0.out_us)} µs</td></tr>
              <tr><td className="text-muted">Earlier when lit</td><td className="font-medium">{mic1.shift_us.toFixed(1)} µs</td><td className="font-medium">{mic0.shift_us.toFixed(1)} µs</td></tr>
              <tr><td className="text-muted">Shake inside one second, lit</td><td>{mic1.shake_lit_us.toFixed(2)} µs</td><td>{mic0.shake_lit_us.toFixed(2)} µs</td></tr>
              <tr><td className="text-muted">Shake inside one second, out</td><td>{mic1.shake_out_us.toFixed(2)} µs</td><td>{mic0.shake_out_us.toFixed(2)} µs</td></tr>
              <tr><td className="text-muted">Seconds right</td><td className="whitespace-nowrap font-medium">{mic1.right} of {mic1.clean_seconds}</td><td className="whitespace-nowrap pl-3 font-medium">{mic0.right} of {mic0.clean_seconds}</td></tr>
            </tbody>
          </table>
          <p className="mt-3 text-[13px] leading-[19px] text-muted">
            Times are against the first 5 seconds of the recording, and against a second sound line that does not pass the candle. A microsecond (µs) is a millionth of a
            second. The laptop has two microphones a few centimetres apart.
          </p>
        </Card>
      </div>

      <div className="mt-4 grid items-start gap-4 xl:grid-cols-12">
        <Card className="xl:col-span-4" title="How it works">
          <ul className="grid list-disc gap-2 pl-[18px] text-[13px] leading-[19px] text-muted">
            <li>A speaker plays a quiet, high test sound and a microphone times its arrival. Sound moves about 343 m/s in room air and faster in hot air.</li>
            <li>Hot gas on the line between them makes the sound arrive a little early. It also makes the arrival time shake, {shake[0] === shake[1] ? `about ${shake[0]}` : `${shake[0]} to ${shake[1]}`} times more than with the flame out.</li>
            <li>Laptops, tablets and speakers are already on board. Nothing new has to be launched.</li>
            <li>{d.setup}</li>
          </ul>
        </Card>
        <Card className="xl:col-span-4" title="What it can't do yet">
          <ul className="grid list-disc gap-2 pl-[18px] text-[13px] leading-[19px] text-muted">
            <li>It catches hot gas that crosses a sound line. With the candle 2.4 m away from every line, lighting it changed nothing we could tell apart from a person moving.</li>
            <li>A person walking up to the line moves it by 1 to 2 µs, close to the size of the flame's effect.</li>
            <li>The effect was different on each relight ({lit.join(', ')} µs), and we can't explain that yet.</li>
            <li>The shift is about 3 times smaller than we estimated before measuring.</li>
            <li>We knew when the candle was lit. A blind run hasn't been done.</li>
            <li>All of this is on Earth, where hot air rises through the line. In space it stays around the flame.</li>
          </ul>
        </Card>
        <Card className="xl:col-span-4" title="Next">
          <ul className="grid list-disc gap-2 pl-[18px] text-[13px] leading-[19px] text-muted">
            <li>A blind run in a safe lab: one person changes the flame, another reads the screen.</li>
            <li>The candle under the other sound line. The shift should flip sign.</li>
            <li>A heat source that isn't a flame, and other distances.</li>
            <li>An estimate for a flame without gravity, from NASA's flame sizes and temperatures.</li>
          </ul>
        </Card>
      </div>
    </>
  )
}
