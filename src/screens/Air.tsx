import AirExplorer from '../components/AirExplorer'
import { Card, linkClass, PageTitle } from '../components/ui'
import { useData } from '../data/DataProvider'
import { pct } from '../data/format'

export default function Air() {
  const { summary } = useData()
  const { cabins, finding } = summary
  const habitat = cabins.find((c) => c.key === 'habitat')!

  return (
    <>
      <PageTitle title="Cabin air">
        NASA recommends thinner air with more oxygen for Moon and Mars habitats: <b>{habitat.psi} psi and {pct(habitat.o2)} oxygen</b>, against {cabins[0].psi} psi and{' '}
        {pct(cabins[0].o2)} on the station. Pick any air to see what the nearest flames did.
      </PageTitle>

      <AirExplorer />

      <div className="mt-4 grid items-start gap-4 xl:grid-cols-12">
        <Card className="xl:col-span-6" title="What to be careful with">
          <ul className="grid list-disc gap-2 pl-[18px] text-[13px] leading-[19px] text-muted">
            {finding.caveats.map((c) => <li key={c}>{c}</li>)}
            <li>Dots that share the same air are spread out a little so they can all be seen.</li>
          </ul>
        </Card>
        <Card className="xl:col-span-6" title="Where the cabin figures come from">
          <table className="w-full border-collapse">
            <thead>
              <tr className="text-left text-xs text-faint [&>th]:pb-2 [&>th]:pr-3 [&>th]:font-normal">
                <th>Cabin</th>
                <th className="text-right">Oxygen</th>
                <th className="text-right">Pressure</th>
                <th className="!pr-0">Source</th>
              </tr>
            </thead>
            <tbody>
              {cabins.map((c) => (
                <tr key={c.key} className="align-top [&>td]:border-t [&>td]:border-rule [&>td]:py-2.5 [&>td]:pr-3">
                  <td className="font-medium">{c.name}</td>
                  <td className="text-right">{pct(c.o2)}</td>
                  <td className="whitespace-nowrap text-right">{c.psi} psi</td>
                  <td className="!pr-0 text-[13px] text-muted">{c.url ? <a className={linkClass} href={c.url} target="_blank" rel="noreferrer">{c.source}</a> : c.source}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>
    </>
  )
}
