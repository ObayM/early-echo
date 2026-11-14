import type { End, Test } from './types'

export type AirTest = Test & { o2: number; p: number; end: Exclude<End, 'noign'> }

export type ExpFilter = 'both' | 'FLEX' | 'CFI-G'

export const WINDOW = { do2: 0.04, fp: 1.3 }

export const isAirTest = (t: Test): t is AirTest => t.o2 != null && t.p != null && t.end != null && t.end !== 'noign'

export function airTests(tests: Test[], exps: ExpFilter, nitrogenOnly: boolean): AirTest[] {
  return tests.filter(isAirTest).filter((t) => (exps === 'both' || t.exp === exps) && (!nitrogenOnly || t.dil === 'N2'))
}

export const near = (t: AirTest, o2: number, p: number) =>
  Math.abs(t.o2 - o2) <= WINDOW.do2 + 1e-9 && Math.abs(Math.log(t.p / p)) <= Math.log(WINDOW.fp) + 1e-9
