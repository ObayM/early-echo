export const FS = 48000
export const P = 1920
const GUARD = 60
export const APART = (P * 3) / 8
export const BANDS = { high: [18000, 23000], mid: [12000, 17000], low: [6000, 11000] } as const
export type Band = keyof typeof BANDS

export function makeProbe([lo, hi]: readonly [number, number]) {
  const bins: number[] = []
  for (let k = 0; k <= P / 2; k++) if ((k * FS) / P >= lo && (k * FS) / P <= hi) bins.push(k)
  const n = bins.length
  const edge = Math.floor((0.2 * (n - 1)) / 2)
  const re = new Float64Array(n)
  const im = new Float64Array(n)
  for (let m = 0; m < n; m++) {
    const w = m <= edge ? 0.5 * (1 + Math.cos(Math.PI * (-1 + (2 * m) / (0.2 * (n - 1))))) : m >= n - 1 - edge ? 0.5 * (1 + Math.cos(Math.PI * (-2 / 0.2 + 1 + (2 * m) / (0.2 * (n - 1))))) : 1
    re[m] = w * Math.cos((Math.PI * m * m) / n)
    im[m] = w * Math.sin((Math.PI * m * m) / n)
  }
  const cos = new Float64Array(P)
  const sin = new Float64Array(P)
  for (let j = 0; j < P; j++) {
    cos[j] = Math.cos((2 * Math.PI * j) / P)
    sin[j] = Math.sin((2 * Math.PI * j) / P)
  }
  const wave = new Float32Array(P)
  let peak = 0
  for (let j = 0; j < P; j++) {
    let v = 0
    for (let m = 0; m < n; m++) {
      const a = (bins[m] * j) % P
      v += re[m] * cos[a] - im[m] * sin[a]
    }
    wave[j] = v
    peak = Math.max(peak, Math.abs(v))
  }
  for (let j = 0; j < P; j++) wave[j] *= 0.7 / peak
  const hear = (frame: Float32Array) => {
    const sr = new Float64Array(n)
    const si = new Float64Array(n)
    for (let m = 0; m < n; m++) {
      let yr = 0
      let yi = 0
      for (let j = 0; j < P; j++) {
        const a = (bins[m] * j) % P
        yr += frame[j] * cos[a]
        yi -= frame[j] * sin[a]
      }
      sr[m] = yr * re[m] + yi * im[m]
      si[m] = yi * re[m] - yr * im[m]
    }
    const env = new Float32Array(P)
    for (let j = 0; j < P; j++) {
      let r = 0
      let i = 0
      for (let m = 0; m < n; m++) {
        const a = (bins[m] * j) % P
        r += sr[m] * cos[a] - si[m] * sin[a]
        i += sr[m] * sin[a] + si[m] * cos[a]
      }
      env[j] = Math.hypot(r, i)
    }
    return env
  }
  return { wave, hear }
}

const near = (a: number, b: number) => Math.abs(((a - b + P / 2 + P) % P) - P / 2)
export function top(env: Float32Array, skip: number | null, around: number | null = null) {
  let best = -1
  for (let j = 0; j < P; j++) {
    if (skip != null && near(j, skip) <= GUARD) continue
    if (around != null && near(j, around) > 12) continue
    if (best < 0 || env[j] > env[best]) best = j
  }
  return best
}
export const floor = (env: Float32Array) => Float32Array.from(env).sort()[P >> 1]
export const db = (v: number, base: number) => 20 * Math.log10(Math.max(v, 1e-12) / Math.max(base, 1e-12))
