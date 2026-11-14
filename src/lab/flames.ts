import type { Test } from '../data/types'
import { ASSUMED, dropletFire, FUELS, steadyFire, type Air, type Fire } from './model'

export const CLOTH = { mgPerCm2: 18.05, cotton: 0.75, heat: 16e6 }

export const GAS_HEAT: Record<string, number> = { ethane: 47.5e6, propane: 46.4e6, butane: 45.7e6 }

export interface LabFlame {
  test: Test
  kind: 'droplet' | 'cloth' | 'gas'
  title: string
  air: Air
  assumedPressure: boolean
  fire: Fire
  released: number
  gas?: string
}

const size = (t: Test, name: string) => {
  const key = Object.keys(t.raw).find((k) => k.startsWith(name))
  return key ? parseFloat(t.raw[key]) : NaN
}

export function labFlame(t: Test | undefined): LabFlame | null {
  if (!t || t.burn_s == null || t.o2 == null) return null
  const air = { o2: t.o2, p: t.p ?? 1, dil: t.dil ?? 'N2' }
  const base = { test: t, air, assumedPressure: t.p == null }
  if (t.d0 != null && t.fuel != null && t.fuel in FUELS) {
    const fire = dropletFire(t.d0, t.fuel, t.burn_s, t.burned ?? null)
    return { ...base, kind: 'droplet', title: `${t.exp} ${t.label}: a ${t.d0} mm droplet of ${t.fuel.toLowerCase()}`, fire, released: fire.heat / ASSUMED.kept }
  }
  const a = size(t, 'Sample Length')
  const b = size(t, 'Sample Width')
  if (t.fuel?.includes('SIBAL') && a > 0 && b > 0) {
    const released = (a * b * CLOTH.mgPerCm2 * CLOTH.cotton * CLOTH.heat) / 1e6
    const fire = steadyFire(released / t.burn_s, t.burn_s, Math.min(a, b) / 200, Math.max(a, b) / 100)
    return { ...base, kind: 'cloth', title: `${t.exp} ${t.label}: a ${Math.max(a, b)} by ${Math.min(a, b)} cm cotton sheet`, fire, released }
  }
  const rate = size(t, 'mHC') || size(t, 'HC burnrate')
  const gas = Object.keys(GAS_HEAT).find((k) => t.fuel?.toLowerCase().includes(k))
  if (gas && rate > 0 && t.burn_s > 0) {
    const watts = (rate / 1e6) * GAS_HEAT[gas]
    return { ...base, kind: 'gas', gas, title: `${t.exp} ${t.label}: ${gas} burning at ${rate} mg a second`, fire: steadyFire(watts, t.burn_s), released: watts * t.burn_s }
  }
  return null
}
