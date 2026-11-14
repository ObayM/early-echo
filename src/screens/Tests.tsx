import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { rankAir, rankTitle } from '../components/RankRow'
import { useOpenTest } from '../components/TestDrawer'
import { buttonClass, EndMark, PageTitle } from '../components/ui'
import { airTests, near, type ExpFilter } from '../data/air'
import { useData, type Data } from '../data/DataProvider'
import { atm, GAS, int, pct, seconds } from '../data/format'
import type { Test } from '../data/types'

const PAGE = 100
const selectClass = 'h-[34px] min-w-0 flex-1 rounded-full border border-control bg-ground pl-3.5 pr-2 sm:flex-none'
const Dash = () => <span className="text-broke">–</span>

function namedSet(params: URLSearchParams, { tests, summary }: Data): { label: string; ids: Set<string> } | null {
  const set = params.get('set')
  if (set === 'station' || set === 'habitat') {
    const g = summary.finding[set]
    return { label: `${g.label}: ${g.detail}`, ids: new Set(g.ids) }
  }
  const rank = params.get('rank') ? summary.ranking[Number(params.get('rank'))] : undefined
  if (rank) return { label: `${rankTitle(rank)}, ${rankAir(rank)}`, ids: new Set(rank.ids) }
  const o2 = Number(params.get('o2'))
  const p = Number(params.get('p'))
  if (o2 && p) {
    const exps = (params.get('exps') ?? 'both') as ExpFilter
    const ids = airTests(tests, exps, params.get('n2') !== '0').filter((t) => near(t, o2, p)).map((t) => t.id)
    return { label: `Flames near ${pct(o2)} oxygen and ${atm(p)}`, ids: new Set(ids) }
  }
  return null
}

export default function Tests() {
  const data = useData()
  const { tests, summary } = data
  const [params, setParams] = useSearchParams()
  const openTest = useOpenTest()
  const [limit, setLimit] = useState(PAGE)

  const q = params.get('q') ?? ''
  const exp = params.get('exp') ?? ''
  const kind = params.get('kind') ?? ''
  const end = params.get('end') ?? ''
  const named = useMemo(() => namedSet(params, data), [params, data])

  const set = (key: string, value: string) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        if (value) next.set(key, value)
        else next.delete(key)
        return next
      },
      { replace: true },
    )
  const clearNamed = () =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        for (const key of ['set', 'rank', 'o2', 'p', 'exps', 'n2']) next.delete(key)
        return next
      },
      { replace: true },
    )

  const shown = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean)
    return tests.filter(
      (t) =>
        (!named || named.ids.has(t.id)) &&
        (!exp || t.exp === exp) &&
        (!kind || t.kind === kind) &&
        (!end || (end === 'none' ? t.end == null : t.end === end)) &&
        words.every((w) => `${t.exp} ${t.label} ${t.fuel ?? ''} ${t.note ?? ''}`.toLowerCase().includes(w)),
    )
  }, [tests, named, q, exp, kind, end])
  useEffect(() => setLimit(PAGE), [shown])

  const air = (t: Test) => (t.o2 != null && t.dil ? GAS[t.dil] : null)
  const ending = (t: Test) =>
    t.end ? <EndMark end={t.end} label={summary.outcomes[t.end]} /> : t.flames != null ? <span className="text-muted">{t.flames} flames that day</span> : <Dash />

  return (
    <>
      <PageTitle title="All tests">
        Every row NASA publishes for its space fire experiments, in one table. <b>{int(summary.totals.with_outcome)}</b> of {int(summary.totals.rows)} say how the flame ended.
      </PageTitle>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={q}
          onChange={(e) => set('q', e.target.value)}
          placeholder="Search fuel, test name or note"
          aria-label="Search tests"
          className="h-[34px] w-full rounded-full border border-control bg-ground px-3.5 placeholder:text-faint sm:w-64"
        />
        <select aria-label="Experiment" value={exp} onChange={(e) => set('exp', e.target.value)} className={selectClass}>
          <option value="">All experiments</option>
          {summary.experiments.map((e) => <option key={e.key} value={e.key}>{e.key} ({int(e.rows)})</option>)}
        </select>
        <select aria-label="What burned" value={kind} onChange={(e) => set('kind', e.target.value)} className={selectClass}>
          <option value="">Anything that burned</option>
          <option value="Droplet">Fuel droplets</option>
          <option value="Gas flame">Gas flames</option>
          <option value="Solid">Solid materials</option>
          <option value="Smoke">Smoke tests</option>
        </select>
        <select aria-label="How it ended" value={end} onChange={(e) => set('end', e.target.value)} className={selectClass}>
          <option value="">Any ending</option>
          {Object.entries(summary.outcomes).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
          <option value="none">Ending not recorded</option>
        </select>
        {named && (
          <span className="inline-flex h-[34px] max-w-full items-center gap-1 rounded-full bg-active pl-3.5 pr-1">
            <span className="truncate">{named.label}</span>
            <button type="button" className="cursor-pointer rounded-full px-2 py-1 text-muted hover:text-ink" onClick={clearNamed} aria-label="Remove this filter">
              ✕
            </button>
          </span>
        )}
        <span className="w-full whitespace-nowrap text-muted sm:ml-auto sm:w-auto">
          {shown.length > limit ? `First ${limit} of ${int(shown.length)}` : int(shown.length)} {shown.length === 1 ? 'test' : 'tests'}
        </span>
      </div>

      <section className="rounded-2xl bg-surface px-5 py-4">
        {shown.length === 0 ? (
          <p className="py-6 text-muted">No test matches these filters.</p>
        ) : (
          <>
            <table className="hidden w-full border-collapse md:table">
              <thead>
                <tr className="text-left text-xs text-faint [&>th]:pb-2 [&>th]:pr-3 [&>th]:font-normal">
                  <th>Test</th>
                  <th>What burned</th>
                  <th className="text-right">Oxygen</th>
                  <th className="text-right">Pressure</th>
                  <th>Rest of the air</th>
                  <th className="text-right">Air flow</th>
                  <th className="text-right">Burned for</th>
                  <th className="!pr-0">How it ended</th>
                </tr>
              </thead>
              <tbody>
                {shown.slice(0, limit).map((t) => (
                  <tr key={t.id} onClick={() => openTest(t.id)} className="cursor-pointer align-top hover:bg-[#161616] [&>td]:border-t [&>td]:border-rule [&>td]:py-[11px] [&>td]:pr-3">
                    <td>
                      <button type="button" className="cursor-pointer text-left font-medium" onClick={() => openTest(t.id)}>
                        {t.exp}
                      </button>
                      <span className="block max-w-[200px] truncate text-xs text-faint">{t.label}</span>
                    </td>
                    <td className="text-muted">{t.fuel ?? <Dash />}</td>
                    <td className="text-right">{t.o2 != null ? pct(t.o2) : <Dash />}</td>
                    <td className="whitespace-nowrap text-right">{t.p != null ? atm(t.p) : <Dash />}</td>
                    <td className="text-muted">{air(t) ?? <Dash />}</td>
                    <td className="whitespace-nowrap text-right">{t.flow != null ? `${t.flow} cm/s` : <Dash />}</td>
                    <td className="whitespace-nowrap text-right">{t.burn_s != null ? seconds(t.burn_s) : <Dash />}</td>
                    <td className="!pr-0">{ending(t)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <ul className="md:hidden">
              {shown.slice(0, limit).map((t) => (
                <li key={t.id} className="border-t border-rule first:border-0">
                  <button type="button" className="block w-full cursor-pointer py-3 text-left" onClick={() => openTest(t.id)}>
                    <span className="flex items-baseline justify-between gap-3">
                      <span className="min-w-0 truncate">
                        <b className="font-medium">{t.exp}</b> <span className="text-faint">{t.label}</span>
                      </span>
                      <span className="flex-none text-[13px]">{ending(t)}</span>
                    </span>
                    <span className="mt-0.5 block text-[13px] text-muted">
                      {[t.fuel, t.o2 != null && `${pct(t.o2)} oxygen`, t.p != null && atm(t.p), t.flow != null && `${t.flow} cm/s`, t.burn_s != null && `burned ${seconds(t.burn_s)}`]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  </button>
                </li>
              ))}
            </ul>

            {shown.length > limit && (
              <p className="border-t border-rule pt-4">
                <button type="button" className={buttonClass} onClick={() => setLimit(limit + PAGE)}>
                  Show {Math.min(PAGE, shown.length - limit)} more
                </button>
              </p>
            )}
          </>
        )}
      </section>
    </>
  )
}
