export type Vec = [number, number, number]

const R = 8.314
const ATM = 101325
export const CABIN_T = 295.65

const GASES: Record<string, { M: number; cp: number; alpha: number }> = {
  O2: { M: 0.032, cp: 29.4, alpha: 2.2e-5 },
  N2: { M: 0.028, cp: 29.1, alpha: 2.2e-5 },
  CO2: { M: 0.044, cp: 37.1, alpha: 1.1e-5 },
  He: { M: 0.004, cp: 20.8, alpha: 1.8e-4 },
}

export const FUELS: Record<string, { rho: number; heat: number }> = {
  Heptane: { rho: 684, heat: 44.6e6 },
  Methanol: { rho: 792, heat: 19.9e6 },
}

export const ASSUMED = {
  kept: 0.7,
  flameRatio: 7,
  mixLength: 0.005,
  probeHz: 20500,
  flameT: 2000,
}

export interface Air {
  o2: number
  p: number
  dil: string
}

export interface Gas {
  c: number
  H: number
  alpha: number
}

export function gas({ o2, p, dil }: Air): Gas {
  const a = GASES.O2
  const b = GASES[dil] ?? GASES.N2
  const M = o2 * a.M + (1 - o2) * b.M
  const cp = o2 * a.cp + (1 - o2) * b.cp
  return {
    c: Math.sqrt(((cp / (cp - R)) * R * CABIN_T) / M),
    H: (p * ATM * cp) / R,
    alpha: (o2 * a.alpha + (1 - o2) * b.alpha) / p,
  }
}

export interface Fire {
  heatBy: (t: number) => number
  burn: number
  radius: (t: number) => number
  heat: number
  wide?: number
  travel?: number
}

export function dropletFire(d0mm: number, fuel: string, burn: number, burned: number | null): Fire {
  const f = FUELS[fuel] ?? FUELS.Heptane
  const d0 = d0mm / 1000
  const share = burned ?? 1
  const heat = f.rho * (Math.PI / 6) * d0 ** 3 * f.heat * share * ASSUMED.kept
  const left = (1 - share) ** (2 / 3)
  const d2 = (t: number) => 1 - (1 - left) * Math.min(1, Math.max(0, t / burn))
  return {
    heat,
    burn,
    heatBy: (t) => (share > 0 ? (heat * (1 - d2(t) ** 1.5)) / share : 0),
    radius: (t) => (t < 0 || t > burn ? 0 : (ASSUMED.flameRatio * d0 * Math.sqrt(d2(t))) / 2),
  }
}

export function steadyFire(watts: number, burn: number, wide?: number, travel?: number): Fire {
  const heat = watts * burn * ASSUMED.kept
  return {
    heat,
    burn,
    wide,
    travel,
    heatBy: (t) => (heat * Math.min(1, Math.max(0, t / burn))),
    radius: (t) => (t < 0 || t > burn ? 0 : Math.cbrt((3 * watts) / (4 * Math.PI * 30e6))),
  }
}

export interface Setup {
  air: Air
  fire: Fire
  at: Vec
  flow: Vec
  lines: { a: Vec; b: Vec }[]
  mix?: number
}

export function fireAt({ fire, at, flow }: Pick<Setup, 'fire' | 'at' | 'flow'>, t: number): Vec {
  if (!fire.travel) return at
  const speed = Math.hypot(...flow)
  const d = fire.travel * (Math.min(1, Math.max(0, t / fire.burn)) - 0.5)
  return speed > 0 ? [at[0] + (flow[0] / speed) * d, at[1] + (flow[1] / speed) * d, at[2] + (flow[2] / speed) * d] : [at[0] + d, at[1], at[2]]
}

export interface Puff {
  at: Vec
  s2: number
  h: number
  dT: number
}

const STEPS = 160
const H_MAX = 1 - CABIN_T / ASSUMED.flameT

const LANES = 3
const patchSize = (fire: Fire) => (fire.wide ? fire.wide / 2.5 : Math.max(0.004, fire.radius(0)))

export function patchStep(fire: Fire, speed: number): number {
  const rows = fire.wide ? LANES : 1
  return fire.burn / Math.min(2400, Math.max(60, Math.ceil((rows * speed * fire.burn) / patchSize(fire))))
}

export function puffs(setup: Setup, t: number): Puff[] {
  const { air, fire, flow, mix = ASSUMED.mixLength } = setup
  const g = gas(air)
  const speed = Math.hypot(...flow)
  const D = g.alpha + mix * speed
  const s0 = patchSize(fire)
  const dt = patchStep(fire, speed)
  const out: Puff[] = []
  for (let i = 0; i * dt < fire.burn; i++) {
    const born = (i + 0.5) * dt
    if (born > t) break
    const q = fire.heatBy(born + dt / 2) - fire.heatBy(born - dt / 2)
    if (q <= 0) continue
    const age = t - born
    const s2 = s0 * s0 + 4 * D * age
    const h = q / (g.H * Math.PI ** 1.5 * s2 ** 1.5)
    const hc = Math.min(h, H_MAX)
    const across = fire.wide ? ((i % LANES) - 1) * 0.6 * fire.wide : 0
    const at = fireAt(setup, born)
    out.push({ at: [at[0] + flow[0] * age, at[1] + flow[1] * age, at[2] + flow[2] * age + across], s2, h, dT: (CABIN_T * hc) / (1 - hc) })
  }
  return out
}

export function early(setup: Setup, t: number, ps = puffs(setup, t)): number[] {
  const g = gas(setup.air)
  return setup.lines.map(({ a, b }) => {
    const u: Vec = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]
    const L = Math.hypot(...u)
    u[0] /= L; u[1] /= L; u[2] /= L
    const beam2 = ((g.c / ASSUMED.probeHz) * L) / 4
    const ds = L / STEPS
    const h = new Float64Array(STEPS)
    for (const p of ps) {
      const r: Vec = [p.at[0] - a[0], p.at[1] - a[1], p.at[2] - a[2]]
      const along = r[0] * u[0] + r[1] * u[1] + r[2] * u[2]
      const across2 = Math.max(0, r[0] * r[0] + r[1] * r[1] + r[2] * r[2] - along * along)
      const wide2 = p.s2 + beam2
      const s = Math.sqrt(p.s2)
      const sn = Math.max(s, 2 * ds)
      const peak = p.h * (p.s2 / wide2) * Math.exp(-across2 / wide2) * (s / sn)
      if (peak < 1e-9) continue
      const lo = Math.max(0, Math.floor((along - 4 * sn) / ds))
      const hi = Math.min(STEPS - 1, Math.ceil((along + 4 * sn) / ds))
      for (let k = lo; k <= hi; k++) {
        const x = (k + 0.5) * ds - along
        h[k] += peak * Math.exp(-(x * x) / (sn * sn))
      }
    }
    let sum = 0
    for (let k = 0; k < STEPS; k++) sum += 1 - Math.sqrt(1 - Math.min(h[k], H_MAX))
    return ((sum * ds) / g.c) * 1e6
  })
}

export interface Run {
  dt: number
  early: number[][]
  tripped: (number | null)[]
  peak: number[]
  alarm: number | null
}

export function run(setup: Setup, seconds: number, threshold: number, dt = 0.5): Run {
  const n = Math.round(seconds / dt) + 1
  const rows: number[][] = []
  const tripped: (number | null)[] = setup.lines.map(() => null)
  const peak = setup.lines.map(() => 0)
  for (let i = 0; i < n; i++) {
    const row = early(setup, i * dt)
    rows.push(row)
    row.forEach((v, j) => {
      if (v > peak[j]) peak[j] = v
      if (v >= threshold && tripped[j] == null) tripped[j] = i * dt
    })
  }
  const times = tripped.filter((v): v is number => v != null)
  return { dt, early: rows, tripped, peak, alarm: times.length ? Math.min(...times) : null }
}
