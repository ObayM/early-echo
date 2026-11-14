import { useGLTF } from '@react-three/drei'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useData } from '../data/DataProvider'
import { labFlame } from '../lab/flames'
import { fireAt, puffs, run, type Setup } from '../lab/model'
import StationScene, { LAB } from '../lab/StationScene'
import { inside, LINES, START } from '../lab/station'

const SHEET = 'Saffire-I:1'
const SECONDS = 48
const RATE = 3.5
const FLOW = 0.1
const still = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

function useLoop(seconds: number, running: boolean) {
  const [t, setT] = useState(() => (still() ? seconds * 0.6 : 0))
  useEffect(() => {
    if (!running || still()) return
    let last = performance.now()
    let frame = requestAnimationFrame(function tick(time) {
      const step = Math.min(0.1, Math.max(0, (time - last) / 1000)) * RATE
      last = time
      setT((v) => (v + step >= seconds ? 0 : v + step))
      frame = requestAnimationFrame(tick)
    })
    return () => cancelAnimationFrame(frame)
  }, [running, seconds])
  return t
}

export default function HeroScene({ onReady }: { onReady: () => void }) {
  const { byId, candle } = useData()
  useGLTF(LAB, false, true)
  useEffect(onReady, [onReady])
  const threshold = candle.stats.mic1.out_us - candle.stats.mic1.threshold_us
  const flame = useMemo(() => labFlame(byId.get(SHEET))!, [byId])
  const { fire } = flame
  const setup = useMemo<Setup>(() => ({ air: flame.air, fire, at: inside(START, (fire.travel ?? 0) / 2), flow: [FLOW, 0, 0], lines: LINES }), [flame, fire])
  const result = useMemo(() => run(setup, SECONDS, threshold), [setup, threshold])

  const box = useRef<HTMLDivElement>(null)
  const [seen, setSeen] = useState(true)
  useEffect(() => {
    const watch = new IntersectionObserver(([e]) => setSeen(e.isIntersecting))
    watch.observe(box.current!)
    return () => watch.disconnect()
  }, [])

  const t = useLoop(SECONDS, seen)
  const warm = useMemo(() => puffs(setup, t), [setup, t])
  const now = result.early[Math.max(0, Math.min(result.early.length - 1, Math.round(t / result.dt)))]
  const caught = result.alarm != null && t >= result.alarm

  return (
    <div ref={box} className="pointer-events-none relative size-full">
      <StationScene
        t={t}
        at={fireAt(setup, t)}
        sheet={fire.travel && fire.wide ? { mid: setup.at, length: fire.travel, wide: fire.wide, burned: Math.min(1, t / fire.burn) } : undefined}
        flame={fire.radius(t)}
        wide={fire.wide}
        soot={1}
        puffs={warm}
        early={now}
        threshold={threshold}
        flow={FLOW}
        view="module"
        fit={2.3}
        onPlace={() => {}}
      />
      <div data-hero-status className="absolute bottom-3 right-4 text-right lg:bottom-8 lg:right-8">
        <p className="text-xs text-muted">{Math.floor(t)} s</p>
        <p className={`text-[26px] font-semibold leading-8 tracking-[-0.02em] lg:text-[34px] lg:leading-10 ${caught ? 'text-flame' : 'text-faint'}`}>
          {caught ? `Caught in ${Math.round(result.alarm!)} s` : 'Listening'}
        </p>
      </div>
    </div>
  )
}
