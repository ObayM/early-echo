import { Link } from 'react-router-dom'
import { GAS, pct, seconds } from '../data/format'
import type { RankGroup } from '../data/types'
import { Stack } from './ui'

export const rankTitle = (g: RankGroup) => `${g.fuel} ${g.exp === 'FLEX' ? 'droplets' : 'gas flames'}`
export const rankAir = (g: RankGroup) => `${g.pressure} · ${g.oxygen} oxygen · ${GAS[g.dil]}`

export default function RankRow({ g, place, index, full = false }: { g: RankGroup; place: number; index: number; full?: boolean }) {
  return (
    <Link
      to={`/tests?rank=${index}`}
      className={`-mx-2 grid items-center gap-x-3 gap-y-1.5 rounded-lg px-2 py-[9px] transition-colors hover:bg-raised ${
        full ? 'grid-cols-[22px_minmax(0,1fr)_112px] md:grid-cols-[26px_minmax(0,2.2fr)_minmax(90px,1fr)_124px_84px_76px]' : 'grid-cols-[22px_minmax(0,1fr)_112px] md:grid-cols-[26px_minmax(0,2.4fr)_minmax(56px,1fr)_124px]'
      }`}
    >
      <span className="text-right text-faint">{place}</span>
      <span className="min-w-0">
        <b className="block truncate font-medium">{rankTitle(g)}</b>
        <span className="block truncate text-xs text-faint">{rankAir(g)}</span>
      </span>
      <Stack tally={g} className="col-start-2 col-end-4 row-start-2 md:col-auto md:row-auto" />
      <span className="whitespace-nowrap text-right text-muted">
        <b className="font-medium text-ink">{g.out}</b> of {g.out + g.alive} went out
      </span>
      {full && (
        <>
          <span className="hidden text-right text-muted md:block">{g.median_fuel_burned != null ? pct(g.median_fuel_burned) : <span className="text-broke">–</span>}</span>
          <span className="hidden text-right text-muted md:block">{g.median_burn_s != null ? seconds(g.median_burn_s) : <span className="text-broke">–</span>}</span>
        </>
      )}
    </Link>
  )
}
