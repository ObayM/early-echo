export type End = 'out' | 'burned' | 'stopped' | 'broke' | 'noign'
export type Kind = 'Droplet' | 'Gas flame' | 'Solid' | 'Smoke'

export interface Test {
  id: string
  exp: string
  label: string
  kind: Kind
  date: string | null
  fuel: string | null
  o2: number | null
  p: number | null
  dil: string | null
  flow: number | null
  burn_s: number | null
  end: End | null
  flames: number | null
  note: string | null
  raw: Record<string, string>
  d0?: number | null
  burned?: number | null
  feed_o2?: number | null
  co_rise_ppm?: number
}

export interface Tally {
  tests: number
  out: number
  alive: number
  broke: number
  noign: number
}

export interface Experiment {
  key: string
  psi: string
  name: string
  unit: string
  what: string
  rows: number
  flames: number | null
  kind: Kind
  years: [string, string] | null
  with_outcome: number
  doi: string
  url: string
  title: string
  objective: string
  hardware: string
  publications: number
  license: string
}

export interface RankGroup extends Tally {
  exp: string
  fuel: string
  dil: string
  pressure: string
  oxygen: string
  ids: string[]
  median_burn_s: number | null
  median_fuel_burned: number | null
}

export interface AirGroup extends Tally {
  label: string
  detail: string
  ids: string[]
  d0: number
}

export interface Cabin {
  key: 'station' | 'prep' | 'habitat'
  name: string
  short: string
  o2: number
  p: number
  psi: number
  source: string
  url?: string
}

export interface Summary {
  outcomes: Record<End, string>
  experiments: Experiment[]
  not_tests: [name: string, psi: string, why: string][]
  cabins: Cabin[]
  totals: {
    rows: number
    experiments: number
    single_tests: number
    day_rows: number
    flames_by_day: number
    with_outcome: number
    with_air: number
    outcomes: Record<End, number>
    flex: Tally
  }
  ranking: RankGroup[]
  finding: { station: AirGroup; habitat: AirGroup; caveats: string[] }
}

export interface MicStats {
  lit_us: number
  lit_sd: number
  lit_n: number
  out_us: number
  out_sd: number
  out_n: number
  shift_us: number
  threshold_us: number
  right: number
  clean_seconds: number
  shake_lit_us: number
  shake_out_us: number
}

export interface Candle {
  recording: string
  date: string
  seconds: number
  setup: string
  truth: string
  t: number[]
  lit: boolean[]
  clean: boolean[]
  blocked: boolean[]
  mic1_us: number[]
  mic0_us: number[]
  mic1_shake_us: number[]
  mic0_shake_us: number[]
  changes: number[]
  periods: { state: 'lit' | 'out'; start: number; end: number; mic1_us: number | null }[]
  stats: { mic0: MicStats; mic1: MicStats }
}

export interface ModelScore {
  name?: string
  input?: string
  auc: number
  right: number
  of: number
  brier: number
}

export interface ModelLine {
  key: string
  short: string
  points: { x: number; p: number; lo: number; hi: number; tested: number }[]
  tests: { x: number; alive: boolean; id: string }[]
}

export interface ModelView {
  x: { key: string; say: string; log: boolean; lo: number; hi: number; ticks: number[] }
  lines: ModelLine[]
  pick: string
  note: string
}

export interface FlameStudy {
  key: 'gas' | 'droplet' | 'inverse'
  name: string
  about: string
  model: string
  use: string[]
  tests: number
  dropped: number
  days: number
  out: number
  alive: number
  always: ModelScore
  scores: Record<'near_air' | 'near_plus' | 'line' | 'forest' | 'boosted' | 'kept', ModelScore>
  weight: Record<string, number>
  start?: number
  terms?: { input: string; level: string | null; of: string | null; weight: number; log: boolean; say: string; odds: number }[]
  raw: { say: string; alive: number; tests: number }[]
  view: ModelView
  calls?: Record<string, number>
}

export type FlameModel = Record<FlameStudy['key'], FlameStudy>
