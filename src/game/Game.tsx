import { Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useProgress } from '@react-three/drei'
import * as THREE from 'three'
import { EndMark, linkClass } from '../components/ui'
import { WINDOW } from '../data/air'
import { DataProvider, useData } from '../data/DataProvider'
import { atm, GAS, int, pct, seconds } from '../data/format'
import { MARK, MARK_LABEL } from '../data/outcome'
import type { Test } from '../data/types'
import { labFlame, type LabFlame } from '../lab/flames'
import { steadyFire } from '../lab/model'
import { BAR, MIC } from '../lab/EarthScene'
import type { Vec } from '../lab/model'
import { hasWebGL, Stage, tag, type Label } from '../lab/parts'
import Bench, { newReading, type Burn, type Reading } from './Bench'
import Board, { boardLabels, O2_RANGE } from './Board'
import Echo, { newPilot } from './Echo'
import Hub, { HUB_START, WORLDS } from './Hub'
import { ORDER, PLACES, type PlaceKey } from './places'
import RoomScene, { ROOMS } from './Rooms'

const CANDLE = { watts: 60, seconds: 45 }
const PSI = 14.696

const panel = 'pointer-events-auto rounded-2xl border border-rule bg-black/75 p-4 backdrop-blur-md'
const pill = 'pointer-events-auto h-9 cursor-pointer whitespace-nowrap rounded-full border border-control bg-black/60 px-4 backdrop-blur-md transition-colors hover:border-[#888]'
const note = 'whitespace-nowrap rounded-full bg-black/70 px-2 py-0.5 text-[11px] text-muted'

const gap = (t: Test, o2: number, p: number) => Math.hypot((t.o2! - o2) / WINDOW.do2, Math.log(t.p! / p) / Math.log(WINDOW.fp))

const press = (fn: () => void) => (e: ReactMouseEvent<HTMLElement>) => {
  e.currentTarget.blur()
  fn()
}

function Mark() {
  return (
    <svg viewBox="0 0 28 28" className="size-6 flex-none text-flame" aria-hidden="true">
      <circle cx="7" cy="14" r="3.2" fill="currentColor" />
      <path d="M13 7.5a9.2 9.2 0 0 1 0 13M18 4a14 14 0 0 1 0 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

function Loading() {
  const { active } = useProgress()
  if (!active) return null
  return <p className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-black/70 px-4 py-2 text-muted">Loading the 3D models</p>
}

function Readout({ reading, threshold, burn, flame, lines, nope }: { reading: Reading; threshold: number; burn: Burn | null; flame: LabFlame | null; lines: number; nope: string | null }) {
  const [, tick] = useState(0)
  useEffect(() => {
    const id = window.setInterval(() => tick((n) => n + 1), 200)
    return () => window.clearInterval(id)
  }, [])
  if (nope) return <p className="text-muted">{nope}</p>
  if (!burn) return <p className="text-muted">Nothing is burning. The laptops send sound to each other along the blue lines and time it. Warm air makes it arrive early.</p>
  const { heard, t } = reading
  const best = Math.max(0, ...reading.early)
  const tripped = reading.early.filter((v) => v >= threshold).length
  const end = flame?.test.end
  return (
    <div>
      <p className="flex items-baseline gap-2">
        <span className={`text-2xl font-semibold ${tripped ? 'text-flame' : ''}`}>{best < 10 ? best.toFixed(1) : Math.round(best)} µs</span>
        <span className="text-muted">early on the best line. A fire is {threshold.toFixed(2)} or more.</span>
      </p>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-raised" aria-hidden="true">
        <div className={`h-full rounded-full ${tripped ? 'bg-flame' : 'bg-[#9fd0ff]'}`} style={{ width: `${Math.min(100, (best / (threshold * 2)) * 100)}%` }} />
      </div>
      <p className="mt-2 text-muted">
        {reading.burning
          ? `Burning, ${seconds(t)}.`
          : flame
            ? `NASA's flame: ${(end ? MARK_LABEL[MARK[end]] : 'Ended').toLowerCase()} after ${seconds(burn.fire.burn)}.`
            : `Put out after ${seconds(burn.fire.burn)}.`}{' '}
        {heard != null ? (
          <span className="text-ink">Heard {seconds(heard)} after it was lit. {tripped} of {lines} lines hear it now.</span>
        ) : reading.burning ? (
          'No line has caught it yet. The warm air has to reach a sound line.'
        ) : (
          'No line caught this one.'
        )}
      </p>
    </div>
  )
}

function Slider({ label, value, min, max, step, onChange }: { label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void }) {
  return (
    <label className="block">
      <span className="flex justify-between text-muted">{label}</span>
      <input type="range" className="mt-1 w-full accent-flame" min={min} max={max} step={step} value={value} onChange={(e) => onChange(+e.target.value)} />
    </label>
  )
}

function Game() {
  const { tests, candle } = useData()
  const threshold = candle.stats.mic1.out_us - candle.stats.mic1.threshold_us
  const [params, setParams] = useSearchParams()
  const key = params.get('at')
  const at = key && key in PLACES ? (key as PlaceKey) : null
  const place = at ? PLACES[at] : null
  const room = at ? ROOMS[at] : null

  const pilot = useMemo(newPilot, [])
  const reading = useMemo(newReading, [])
  const [air, setAir] = useState({ o2: 0.21, p: 1 })
  const [burn, setBurn] = useState<Burn | null>(null)
  const [flame, setFlame] = useState<LabFlame | null>(null)
  const [chosen, setChosen] = useState<LabFlame | null>(null)
  const [picked, setPicked] = useState<Test | null>(null)
  const [nope, setNope] = useState<string | null>(null)
  const [locked, setLocked] = useState(false)
  const [first, setFirst] = useState(false)
  const [free, setFree] = useState(false)
  const mouse = useMemo(() => window.matchMedia('(pointer: fine)').matches, [])
  const [fade, setFade] = useState(false)
  const lights = useRef(0)
  const busy = useRef(false)
  const webgl = useMemo(hasWebGL, [])

  const quiet = useCallback(() => Object.assign(reading, newReading()), [reading])

  useLayoutEffect(() => {
    pilot.pos.set(...(room ? room.start : HUB_START))
    pilot.target = null
    pilot.tap = null
    pilot.yaw = room ? room.yaw : 0
    pilot.pitch = room ? 0.1 : -0.04
    if (place) setAir({ o2: place.air.o2, p: place.air.p })
    setBurn(null)
    setFlame(null)
    setChosen(null)
    setPicked(null)
    setNope(null)
    quiet()
  }, [at, place, room, pilot, quiet])

  const timers = useRef<number[]>([])
  useEffect(() => () => timers.current.forEach((id) => window.clearTimeout(id)), [])
  const go = useCallback(
    (next: PlaceKey | null) => {
      if (busy.current) return
      busy.current = true
      setFade(true)
      timers.current = [
        window.setTimeout(() => {
          setParams(next ? { at: next } : {})
          timers.current.push(
            window.setTimeout(() => {
              setFade(false)
              busy.current = false
            }, 120),
          )
        }, 320),
      ]
    },
    [setParams],
  )

  const fly = useCallback(
    (k: PlaceKey) => {
      const w = WORLDS[k]
      const to = new THREE.Vector3(...w.at)
      pilot.target = to.clone().addScaledVector(pilot.pos.clone().sub(to).normalize(), w.reach * 0.7)
    },
    [pilot],
  )

  const droplets = useMemo(() => tests.map(labFlame).filter((f): f is LabFlame => f?.kind === 'droplet' && f.test.p != null), [tests])
  const nearest = useMemo(() => {
    const inN2 = droplets.filter((f) => f.test.dil === 'N2').sort((a, b) => gap(a.test, air.o2, air.p) - gap(b.test, air.o2, air.p))
    const best = inN2.length ? gap(inN2[0].test, air.o2, air.p) : 0
    return inN2.filter((f) => gap(f.test, air.o2, air.p) <= best + 0.15)
  }, [droplets, air])
  const next = chosen ?? nearest[lights.current % Math.max(1, nearest.length)] ?? null

  const light = (f: LabFlame | null = next) => {
    if (!place || !room) return
    quiet()
    setNope(null)
    if (room.bench) {
      lights.current += 1
      setFlame(null)
      setBurn({ fire: steadyFire(CANDLE.watts, CANDLE.seconds), air: place.air, at: room.bench, droplet: false, n: lights.current })
      return
    }
    if (!f) return
    const level = Math.cos(pilot.pitch)
    const spot = pilot.pos.clone().add(new THREE.Vector3(-Math.sin(pilot.yaw) * level, -Math.sin(pilot.pitch), -Math.cos(pilot.yaw) * level).multiplyScalar(0.6))
    room.keep(spot)
    const at: Vec = [spot.x, spot.y, spot.z]
    if (!room.warm(at)) {
      setBurn(null)
      setFlame(null)
      setNope(place.key === 'station' ? 'Fly back into the module to light a fire.' : 'There is no air to burn out here. Fly into the dome and light it there.')
      return
    }
    lights.current += 1
    setFlame(f)
    setBurn({ fire: f.fire, air: f.air, at, droplet: true, n: lights.current })
  }
  const out = () => {
    setBurn(null)
    setFlame(null)
    setNope(null)
    quiet()
  }
  const change = (next: { o2: number; p: number }) => {
    setAir(next)
    setChosen(null)
  }

  const pickedFlame = useMemo(() => (picked ? droplets.find((f) => f.test.id === picked.id) ?? null : null), [picked, droplets])
  const lightPicked = () => {
    if (!pickedFlame) return
    setAir({ o2: pickedFlame.air.o2, p: pickedFlame.air.p })
    setChosen(pickedFlame)
    light(pickedFlame)
    setPicked(null)
  }

  const labels = useMemo((): Label[] => {
    if (!room) return ORDER.map((k) => ({ at: [WORLDS[k].at[0], WORLDS[k].at[1] + WORLDS[k].radius * (k === 'station' ? 0.55 : 1.12), WORLDS[k].at[2]], className: note, text: PLACES[k].name }))
    const kit: Label[] = room.laptops.length
      ? room.laptops.map((l) => ({ at: [l.at[0], l.at[1] + 0.34, l.at[2]], className: tag, text: l.name }))
      : [{ at: [MIC[0], MIC[1] + 0.07, 0], className: note, text: 'Laptop mic' }, { at: [BAR.x, BAR.y + 0.1, 0], className: note, text: 'Soundbar' }]
    return [...kit, ...(room.wall ? boardLabels(room.wall) : [])]
  }, [room])

  const hubKeep = useCallback((p: THREE.Vector3) => void p.clampLength(0, 45), [])

  useEffect(() => {
    const change = () => setLocked(!!document.pointerLockElement)
    const refused = () => setFree(true)
    document.addEventListener('pointerlockchange', change)
    document.addEventListener('pointerlockerror', refused)
    return () => {
      document.removeEventListener('pointerlockchange', change)
      document.removeEventListener('pointerlockerror', refused)
    }
  }, [])
  const lightNow = useRef(light)
  lightNow.current = light
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.code === 'KeyF' && !e.repeat && !(e.target instanceof HTMLInputElement)) lightNow.current()
    }
    const button = (e: MouseEvent) => {
      if (e.button === 2 && document.pointerLockElement) lightNow.current()
    }
    window.addEventListener('keydown', key)
    window.addEventListener('mousedown', button)
    return () => {
      window.removeEventListener('keydown', key)
      window.removeEventListener('mousedown', button)
    }
  }, [])
  const missed = (e: MouseEvent) => {
    if ((e as PointerEvent).pointerType === 'touch') pilot.tap = { x: e.offsetX, y: e.offsetY }
  }
  const flip = () => {
    pilot.zoom = first ? 1 : 0
    setFirst(!first)
  }

  if (!webgl)
    return (
      <p className="p-6 text-muted">
        This browser can't draw 3D. <Link className={linkClass} to="/overview">Open the data and charts</Link> instead.
      </p>
    )

  const off = place && next && place.key !== 'earth' ? gap(next.test, air.o2, air.p) : 0
  return (
    <div className="fixed inset-0 bg-black" onContextMenu={(e) => e.preventDefault()}>
      <Stage eye={HUB_START} labels={labels} shadows always far={320} onMissed={missed}>
        <Suspense fallback={null}>
          {place && room ? (
            <>
              <RoomScene place={place.key} />
              <Bench place={place} room={room} burn={burn} threshold={threshold} reading={reading} />
              {room.wall && <Board tests={tests} wall={room.wall} o2={air.o2} p={air.p} picked={picked?.id ?? null} onPick={setPicked} legs={place.key !== 'station'} />}
            </>
          ) : (
            <Hub tests={tests} pilot={pilot} picked={picked?.id ?? null} onPick={setPicked} onGo={fly} onArrive={go} />
          )}
        </Suspense>
        <Echo pilot={pilot} speed={room ? room.speed : 6} back={room ? room.back : 3} side={room ? room.back * 0.2 : 0} size={room ? room.size : 1} keep={room ? room.keep : hubKeep} onFirst={setFirst} />
      </Stage>

      <div className="pointer-events-none absolute inset-x-0 top-0 h-44 bg-gradient-to-b from-black/70 to-transparent" />
      <div className="pointer-events-none absolute inset-0 flex flex-col justify-between gap-3 p-3 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="max-w-md">
            <p className="flex items-center gap-2.5 text-base font-semibold"><Mark />Early Echo</p>
            <h1 className="mt-3 text-2xl font-semibold sm:text-3xl">{place ? place.name : 'Fly Echo to a world and light a fire there'}</h1>
            <p className="mt-1 text-muted">
              {place ? place.line : `Echo is a small robot that starts test fires. Fly it to a world, light one, and see if the laptops there hear it. The ${int(tests.length)} lights around the station are NASA's records of fire tests in space, one each.`}
            </p>
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            {place && <button type="button" className={pill} onClick={press(() => go(null))}>Back to space</button>}
            <button type="button" className={pill} onClick={press(flip)}>{first ? "Echo's eyes" : 'Behind Echo'} (V)</button>
            <Link className={`${pill} grid place-items-center`} to="/overview">Data and charts</Link>
          </div>
        </div>

        {picked && (
          <div className={`${panel} absolute right-3 top-28 w-72 sm:right-5`}>
            <div className="flex items-start justify-between gap-3">
              <p className="font-semibold">{picked.exp} {picked.label}</p>
              <button type="button" className="pointer-events-auto -mr-1 -mt-1 cursor-pointer px-1 text-lg leading-none text-muted hover:text-ink" aria-label="Close" onClick={press(() => setPicked(null))}>×</button>
            </div>
            <p className="mt-1 text-muted">
              {picked.kind}{picked.fuel ? `, ${picked.fuel.toLowerCase()}` : ''}
              {picked.o2 != null && `. ${pct(picked.o2)} oxygen`}{picked.p != null && ` at ${atm(picked.p)}`}{picked.dil && picked.o2 != null ? `, the rest ${GAS[picked.dil] ?? picked.dil}` : ''}.
              {picked.burn_s != null && ` Burned ${seconds(picked.burn_s)}.`}
            </p>
            <p className="mt-2">{picked.end ? <EndMark end={picked.end} label={MARK_LABEL[MARK[picked.end]]} /> : <span className="text-faint">No ending on record</span>}</p>
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
              {pickedFlame && place && place.key !== 'earth' && <button type="button" className="h-8 cursor-pointer rounded-full bg-flame px-3.5 font-medium text-black" onClick={press(lightPicked)}>Light this one</button>}
              <Link className={linkClass} to={`/tests?t=${encodeURIComponent(picked.id)}`}>NASA's row</Link>
            </div>
          </div>
        )}

        {place && room ? (
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className={`${panel} w-full max-w-sm`}>
              {place.key === 'earth' ? (
                <p className="text-muted">{place.airName}. Our own test: a candle under the sound line from the soundbar to the laptop.</p>
              ) : (
                <>
                  <p className="text-muted">{Math.abs(air.o2 - place.air.o2) < 0.005 && Math.abs(air.p - place.air.p) < 0.005 ? place.airName : 'Your own air'}</p>
                  <div className="mt-2 grid grid-cols-2 gap-4">
                    <Slider label={`Oxygen ${pct(air.o2)}`} value={air.o2} min={O2_RANGE[0]} max={O2_RANGE[1]} step={0.01} onChange={(o2) => change({ ...air, o2 })} />
                    <Slider label={`Pressure ${atm(air.p)} (${(air.p * PSI).toFixed(1)} psi)`} value={air.p} min={0.5} max={1.1} step={0.01} onChange={(p) => change({ ...air, p })} />
                  </div>
                  {next && (
                    <p className="mt-2 text-xs leading-4 text-faint">
                      {chosen ? 'Picked from the board' : 'Nearest NASA droplet test'}: {next.test.exp} {next.test.label}, {pct(next.air.o2)} oxygen at {atm(next.air.p)}.
                      {off > 1 && ' NASA has no droplet test in exactly this air, so this is the closest one.'}
                      {!chosen && nearest.length > 1 && ` ${nearest.length} tests are this close: light again for another.`}
                    </p>
                  )}
                </>
              )}
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" className="h-9 cursor-pointer rounded-full bg-flame px-4 font-medium text-black" onClick={press(() => light())}>{room.bench ? (burn ? 'Light it again' : 'Light the candle') : 'Light a fire here'} (F)</button>
                {burn && <button type="button" className={pill} onClick={press(out)}>Clear</button>}
              </div>
              <div className="mt-3 border-t border-rule pt-3">
                <Readout reading={reading} threshold={threshold} burn={burn} flame={flame} lines={room.lines.length} nope={nope} />
              </div>
            </div>

            <details className={`${panel} w-full max-w-xs text-muted`}>
              <summary className="cursor-pointer text-ink">What is real here</summary>
              <p className="mt-2 text-xs text-faint">Real</p>
              <ul className="mt-1 list-disc space-y-1 pl-4">{place.real.map((s) => <li key={s}>{s}</li>)}</ul>
              <p className="mt-3 text-xs text-faint">Drawn or estimated</p>
              <ul className="mt-1 list-disc space-y-1 pl-4">{place.drawn.map((s) => <li key={s}>{s}</li>)}</ul>
            </details>
          </div>
        ) : (
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="flex flex-wrap gap-2">
              {ORDER.map((k) => <button key={k} type="button" className={pill} onClick={press(() => fly(k))}>{PLACES[k].name}</button>)}
            </div>
            <p className="text-xs text-faint">Bright orange kept burning, blue went out by itself, white broke up. Dim ones have no ending on record.</p>
          </div>
        )}
      </div>

      <div className="pointer-events-none absolute bottom-3 left-1/2 hidden -translate-x-1/2 text-xs text-faint lg:block">
        {locked || free ? 'Move the mouse to look · ' : ''}W A S D moves, W twice goes fast · Space up, Shift down{place ? ' · F or right click lights a fire' : ''} · V or the wheel changes the view{locked ? ' · Esc frees the mouse' : ''}
      </div>
      <div className="absolute right-3 top-1/2 flex -translate-y-1/2 flex-col gap-2 lg:hidden">
        {([['Up', 1], ['Down', -1]] as const).map(([name, lift]) => (
          <button key={name} type="button" className={`${pill} px-3`} onPointerDown={() => { pilot.lift = lift }} onPointerUp={() => { pilot.lift = 0 }} onPointerLeave={() => { pilot.lift = 0 }} onPointerCancel={() => { pilot.lift = 0 }}>
            {name}
          </button>
        ))}
      </div>
      {mouse && !locked && !free && !fade && (
        <div className="pointer-events-none absolute left-1/2 top-[74%] -translate-x-1/2 rounded-full bg-white px-5 py-2.5 text-base font-semibold text-black shadow-lg">Click to fly Echo</div>
      )}
      <Loading />
      {locked && <div className="pointer-events-none absolute left-1/2 top-1/2 size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/80 ring-1 ring-black/40" />}
      <div className={`pointer-events-none absolute inset-0 bg-black transition-opacity duration-300 ${fade ? 'opacity-100' : 'opacity-0'}`} />
    </div>
  )
}

export default function GameScreen() {
  return (
    <DataProvider>
      <Game />
    </DataProvider>
  )
}
