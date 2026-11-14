import type { Tally } from './types'

export const ENOUGH = 5

export function verdict(t: Tally): { head: string; text: string } {
  if (t.tests === 0) return { head: 'No data', text: 'NASA lit no flames near this air.' }
  const ran = t.out + t.alive
  const broke = t.broke ? ` ${t.broke} more broke up early.` : ''
  if (ran < ENOUGH) return { head: 'Too few to call', text: `Only ${ran} of ${t.tests} ran to an end.` }
  const share = t.out / ran
  if (share >= 0.75) return { head: 'Flames mostly die here', text: `${t.out} of ${ran} went out on their own.${broke}` }
  if (share <= 0.25) return { head: 'Flames mostly live here', text: `${t.alive} of ${ran} kept burning.${broke}` }
  return { head: 'Mixed', text: `${t.out} of ${ran} went out, ${t.alive} kept burning.${broke}` }
}
