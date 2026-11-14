import { useFrame } from '@react-three/fiber'
import { memo, useMemo, useRef, useState } from 'react'
import { Candle, LAPTOP, Soundbar, Stand } from '../lab/EarthScene'
import { ASSUMED, early, puffs, type Air, type Fire, type Puff, type Setup, type Vec } from '../lab/model'
import { Beam, Flame, Haze, Laptop } from '../lab/parts'
import { lean, type Place } from './places'
import type { Room } from './Rooms'

export interface Burn {
  fire: Fire
  air: Air
  at: Vec
  droplet: boolean
  n: number
}

export interface Reading {
  t: number
  early: number[]
  heard: number | null
  burning: boolean
}
export const newReading = (): Reading => ({ t: 0, early: [], heard: null, burning: false })

export const BIG = 3
const STEEL = { color: '#3b3e43', roughness: 0.4, metalness: 0.8 }

function Rig({ at, bead }: { at: Vec; bead: number }) {
  const pole = at[1] - 0.14
  return (
    <group position={at}>
      <mesh position={[0, -0.14 - pole / 2, 0]} castShadow>
        <cylinderGeometry args={[0.012, 0.012, pole, 16]} />
        <meshStandardMaterial {...STEEL} />
      </mesh>
      <mesh position={[0, -0.14, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.1, 0.1, 0.008, 40]} />
        <meshStandardMaterial {...STEEL} />
      </mesh>
      {[-0.08, 0.08].map((x) => (
        <mesh key={x} position={[x, -0.07, 0]} castShadow>
          <cylinderGeometry args={[0.003, 0.003, 0.14, 10]} />
          <meshStandardMaterial {...STEEL} />
        </mesh>
      ))}
      <mesh rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.0008, 0.0008, 0.16, 6]} />
        <meshStandardMaterial color="#c9ccd2" roughness={0.3} metalness={0.9} />
      </mesh>
      {bead > 0 && (
        <mesh scale={bead}>
          <sphereGeometry args={[1, 20, 14]} />
          <meshPhysicalMaterial color="#dfeaff" roughness={0.05} transmission={0.9} thickness={0.5} ior={1.38} />
        </mesh>
      )}
    </group>
  )
}

const Laptops = memo(function Laptops({ room }: { room: Room }) {
  if (!room.laptops.length)
    return (
      <>
        <Laptop at={LAPTOP} turn={Math.PI / 2} />
        <Stand />
        <Soundbar />
      </>
    )
  return room.laptops.map((l) => (
    <group key={l.name}>
      <Laptop at={l.at} turn={l.turn} arm={l.arm} />
      {!l.arm && (
        <mesh position={[l.at[0], (l.at[1] - 0.03) / 2, l.at[2]]} castShadow>
          <cylinderGeometry args={[0.01, 0.01, l.at[1] - 0.03, 12]} />
          <meshStandardMaterial {...STEEL} />
        </mesh>
      )}
    </group>
  ))
})

function Kit({ room, early, threshold }: { room: Room; early: number[]; threshold: number }) {
  const ends = useMemo(() => room.lines.map((l) => [l.a, l.b]), [room])
  const desk = !room.laptops.length
  return (
    <>
      <Laptops room={room} />
      {ends.map((points, i) => {
        const v = early[i] ?? 0
        return <Beam key={i} points={points} warm={v / threshold} on={v >= threshold} phase={i * 0.37} {...(desk ? { dash: 0.03, gap: 0.27, speed: 0.5 } : {})} />
      })}
    </>
  )
}

function Lit({ place, burn, clock }: { place: Place; burn: Burn; clock: { t: number } }) {
  const { fire } = burn
  const [t, setT] = useState(0)
  useFrame(() => setT(clock.t))
  const size = burn.droplet ? BIG : 1
  const radius = fire.radius(t) * size
  const lit = t < fire.burn
  const bead = (fire.radius(Math.min(t, fire.burn - 0.01)) / ASSUMED.flameRatio) * size
  return (
    <>
      {burn.droplet ? <Rig at={burn.at} bead={bead} /> : <Candle lit={lit} />}
      <Flame at={burn.at} radius={radius} soot={burn.droplet ? Math.max(0, 1 - t / (fire.burn * 0.6)) : 1} t={t} rise={lean(place.g)} ring={false} />
      {lit && <pointLight position={[burn.at[0], burn.at[1] + radius, burn.at[2]]} color={burn.droplet ? '#b9ccff' : '#ffb066'} intensity={burn.droplet ? 0.35 : 0.5} distance={4} decay={2} />}
    </>
  )
}

function Burning({ place, room, burn, threshold, reading }: { place: Place; room: Room; burn: Burn; threshold: number; reading: Reading }) {
  const { fire } = burn
  const [now, setNow] = useState<{ warm: Puff[]; early: number[] }>({ warm: [], early: [] })
  const clock = useRef({ t: 0, due: 0 })
  const setup = useMemo((): Setup => ({ air: burn.air, fire, at: burn.at, flow: place.flow, lines: room.lines, mix: place.mix }), [burn, fire, room, place])
  useFrame((_, raw) => {
    const c = clock.current
    const dt = Math.min(raw, 0.1)
    c.t += dt
    c.due -= dt
    if (c.due > 0) return
    if (c.t > fire.burn + 60) {
      c.due = Infinity
      setNow({ warm: [], early: [] })
      reading.early = []
      return
    }
    c.due = 0.2
    const warm = puffs(setup, c.t)
    const v = early(setup, c.t, warm)
    setNow({ warm, early: v })
    reading.t = c.t
    reading.burning = c.t < fire.burn
    reading.early = v
    if (reading.heard == null && v.some((x) => x >= threshold)) reading.heard = c.t
  })
  return (
    <>
      <Kit room={room} early={now.early} threshold={threshold} />
      <Lit place={place} burn={burn} clock={clock.current} />
      <Haze puffs={now.warm} keep={room.warm} strength={burn.droplet ? 1.2 : 0.4} />
    </>
  )
}

const NONE: number[] = []

export default function Bench({ place, room, burn, threshold, reading }: { place: Place; room: Room; burn: Burn | null; threshold: number; reading: Reading }) {
  if (burn) return <Burning key={burn.n} place={place} room={room} burn={burn} threshold={threshold} reading={reading} />
  return (
    <>
      <Kit room={room} early={NONE} threshold={threshold} />
      {room.bench && <Candle lit={false} />}
    </>
  )
}
