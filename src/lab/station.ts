import type { Vec } from './model'

export const MODULE = { length: 6.4, width: 2.14, height: 2.14, rack: 1.07 }

export const LAPTOPS: { name: string; at: Vec }[] = [
  { name: 'A', at: [-2.3, 1.35, -0.9] },
  { name: 'B', at: [-0.7, 0.6, 0.9] },
  { name: 'C', at: [0.9, 1.55, -0.9] },
  { name: 'D', at: [2.4, 0.95, 0.9] },
]

export const LINES = LAPTOPS.flatMap((a, i) => LAPTOPS.slice(i + 1).map((b) => ({ name: `${a.name} to ${b.name}`, a: a.at, b: b.at, length: Math.hypot(a.at[0] - b.at[0], a.at[1] - b.at[1], a.at[2] - b.at[2]) })))

export const START: Vec = [-2.6, 1.0, -0.1]

const MARGIN = 0.15
export function inside([x, y, z]: Vec, reach = 0): Vec {
  const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
  return [
    clamp(x, -MODULE.length / 2 + MARGIN + reach, MODULE.length / 2 - MARGIN - reach),
    clamp(y, MARGIN, MODULE.height - MARGIN),
    clamp(z, -MODULE.width / 2 + MARGIN, MODULE.width / 2 - MARGIN),
  ]
}
