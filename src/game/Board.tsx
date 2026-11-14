import { useMemo } from 'react'
import type { Test } from '../data/types'
import type { Label } from '../lab/parts'
import type { Vec } from '../lab/model'
import type { Room } from './Rooms'
import Sparks, { scatter } from './Sparks'

type Wall = NonNullable<Room['wall']>

export const O2_RANGE = [0.12, 0.4] as const
export const P_RANGE = [0.5, 5] as const

const spot = (o2: number, p: number, wall: Wall): [number, number] => [
  ((o2 - O2_RANGE[0]) / (O2_RANGE[1] - O2_RANGE[0]) - 0.5) * wall.wide * 0.86,
  (Math.log(p / P_RANGE[0]) / Math.log(P_RANGE[1] / P_RANGE[0]) - 0.5) * wall.high * 0.8,
]

const note = 'whitespace-nowrap rounded-full bg-black/70 px-2 py-0.5 text-[11px] text-muted'

export const boardLabels = (wall: Wall): Label[] => [
  { at: [wall.at[0], wall.at[1] + wall.high / 2 + 0.09, wall.at[2]], className: note, text: "NASA's tests, by the air they burned in. Tap one." },
  { at: [wall.at[0] + wall.wide * 0.3, wall.at[1] - wall.high / 2 - 0.07, wall.at[2]], className: note, text: 'more oxygen →' },
  { at: [wall.at[0] - wall.wide / 2 - 0.05, wall.at[1] + wall.high * 0.25, wall.at[2]], className: note, text: '↑ more pressure' },
]

export default function Board({ tests, wall, o2, p, picked, onPick, legs }: { tests: Test[]; wall: Wall; o2: number; p: number; picked: string | null; onPick: (t: Test) => void; legs: boolean }) {
  const shown = useMemo(() => tests.filter((t) => t.o2 != null && t.p != null), [tests])
  const at = useMemo(
    () =>
      shown.map((t, i): Vec => {
        const [x, y] = spot(t.o2!, t.p!, wall)
        return [x + (scatter(i, 5) - 0.5) * 0.09, y + (scatter(i, 6) - 0.5) * 0.09, 0.012]
      }),
    [shown, wall],
  )
  const [mx, my] = spot(Math.min(O2_RANGE[1], Math.max(O2_RANGE[0], o2)), p, wall)
  return (
    <group position={wall.at} rotation={[0, wall.turn, 0]}>
      <mesh receiveShadow castShadow>
        <boxGeometry args={[wall.wide, wall.high, 0.012]} />
        <meshStandardMaterial color="#0a0b0d" roughness={0.6} metalness={0.4} />
      </mesh>
      {legs &&
        [-1, 1].map((s) => (
          <mesh key={s} position={[s * (wall.wide / 2 - 0.04), -(wall.at[1] + wall.high / 2) / 2, -0.01]} castShadow>
            <cylinderGeometry args={[0.012, 0.012, wall.at[1] - wall.high / 2, 12]} />
            <meshStandardMaterial color="#3b3e43" roughness={0.4} metalness={0.8} />
          </mesh>
        ))}
      <Sparks tests={shown} at={at} size={0.011} picked={picked} onPick={onPick} />
      <mesh position={[mx, my, 0.014]}>
        <ringGeometry args={[0.05, 0.056, 48]} />
        <meshBasicMaterial color={[2.2, 2.2, 2.2]} toneMapped={false} />
      </mesh>
    </group>
  )
}
