import type { End, Tally, Test } from './types'

export type Mark = 'out' | 'alive' | 'broke' | 'noign'

export const MARK: Record<End, Mark> = { out: 'out', burned: 'alive', stopped: 'alive', broke: 'broke', noign: 'noign' }

export const MARK_LABEL: Record<Mark, string> = {
  alive: 'Kept burning',
  broke: 'Droplet broke up',
  out: 'Went out on its own',
  noign: 'Did not ignite',
}

export const MARK_CLASS: Record<Mark, string> = {
  alive: 'bg-flame',
  broke: 'bg-broke',
  out: 'bg-out',
  noign: 'ring-[1.5px] ring-inset ring-broke',
}

export function tally(tests: Test[]): Tally {
  const n = (end: End) => tests.filter((t) => t.end === end).length
  const noign = n('noign')
  return { tests: tests.length - noign, out: n('out'), alive: n('burned') + n('stopped'), broke: n('broke'), noign }
}

export function others(t: Tally): string {
  const parts = []
  if (t.alive) parts.push(`${t.alive} kept burning`)
  if (t.broke) parts.push(`${t.broke} ${t.broke === 1 ? 'droplet' : 'droplets'} broke up`)
  return parts.join(', ')
}
