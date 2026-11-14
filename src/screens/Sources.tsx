import { Link } from 'react-router-dom'
import { Card, linkClass, PageTitle } from '../components/ui'
import { useData } from '../data/DataProvider'
import { int } from '../data/format'

export default function Sources() {
  const { summary } = useData()
  const { experiments, totals, not_tests } = summary

  return (
    <>
      <PageTitle title="Sources and checks">
        Every number here is computed from NASA's published tables, or from our own recording. <b>{int(totals.rows)}</b> rows from <b>{totals.experiments}</b> experiments:{' '}
        {int(totals.single_tests)} single tests, and {totals.day_rows} test days that cover {int(totals.flames_by_day)} more flames.
      </PageTitle>

      <Card title="NASA's experiments">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] border-collapse">
            <thead>
              <tr className="text-left text-xs text-faint [&>th]:pb-2 [&>th]:pr-4 [&>th]:font-normal">
                <th>Experiment</th>
                <th>What it burned</th>
                <th className="text-right">Rows</th>
                <th>One row is</th>
                <th className="text-right">With an ending</th>
                <th>Years</th>
                <th className="text-right">Papers</th>
                <th className="!pr-0">NASA record</th>
              </tr>
            </thead>
            <tbody>
              {experiments.map((e) => (
                <tr key={e.key} className="align-top [&>td]:border-t [&>td]:border-rule [&>td]:py-2.5 [&>td]:pr-4">
                  <td>
                    <Link className="font-medium" to={`/tests?exp=${encodeURIComponent(e.key)}`}>{e.key}</Link>
                    <span className="block text-xs text-faint">{e.name}</span>
                  </td>
                  <td className="max-w-[340px] text-[13px] text-muted">{e.what}</td>
                  <td className="text-right">{int(e.rows)}</td>
                  <td className="whitespace-nowrap text-muted">{e.unit}{e.flames ? ` (${int(e.flames)} flames)` : ''}</td>
                  <td className="text-right">{e.with_outcome ? int(e.with_outcome) : <span className="text-broke">–</span>}</td>
                  <td className="whitespace-nowrap text-muted">{e.years ? (e.years[0] === e.years[1] ? e.years[0] : `${e.years[0]} to ${e.years[1]}`) : <span className="text-broke">–</span>}</td>
                  <td className="text-right">{e.publications}</td>
                  <td className="!pr-0"><a className={linkClass} href={e.url} target="_blank" rel="noreferrer">{e.psi}</a></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="mt-4 grid items-start gap-4 xl:grid-cols-12">
        <Card className="xl:col-span-4" title="How the numbers are made">
          <ul className="grid list-disc gap-2 pl-[18px] text-[13px] leading-[19px] text-muted">
            <li>NASA's tables come from the Physical Sciences Informatics repository (psi.nasa.gov) and are in the public domain (CC0).</li>
            <li>
              The station module in the 3D lab is cut from NASA's model "International Space Station (ISS) (E) (Internal)" (
              <a className={linkClass} href="https://science.nasa.gov/3d-resources/international-space-station-iss-e-internal/" target="_blank" rel="noreferrer">
                NASA 3D Resources
              </a>
              ). We kept the US Lab and made its pictures smaller so it loads fast.
            </li>
            <li>The table on the 3D lab's desk is a free model from Poly Haven (polyhaven.com, public domain, CC0).</li>
            <li>
              In the game, the Earth and Moon globes, the outside of the station and the colour map of Mars are NASA's (NASA 3D Resources, science.nasa.gov, public domain). The ground of the Moon and Mars is a free texture from Poly Haven (moon_01, CC0), tinted red for
              Mars. The habitat dome, the stones and Echo are drawn by us.
            </li>
            <li>One script reads the tables and writes the data this dashboard shows. The build fails if two copies of the same number disagree.</li>
            <li>Repeated rows are counted once, and rows that are not tests (flow checks, notes) are left out.</li>
            <li>Oxygen and pressure are shown only where NASA's table gives them for the air around the flame.</li>
            <li>The candle numbers come from our own recording and its webcam frames.</li>
          </ul>
        </Card>
        <Card className="xl:col-span-4" title="Tables we did not count">
          <ul className="grid list-disc gap-2 pl-[18px] text-[13px] leading-[19px] text-muted">
            {not_tests.map(([name, psi, why]) => <li key={psi}>{name === psi ? psi : `${name} (${psi})`}: {why.charAt(0).toLowerCase() + why.slice(1)}.</li>)}
            <li>Four more combustion records in the repository have no per-test table at all.</li>
            <li>NASA's raw video and sensor files (about 6,300 GB) are not used here.</li>
          </ul>
        </Card>
        <Card className="xl:col-span-4" title="Not checked yet">
          <ul className="grid list-disc gap-2 pl-[18px] text-[13px] leading-[19px] text-muted">
            <li>The gas and temperature readings of the large Saffire fires. Ten of NASA's Saffire files are missing from its own server.</li>
            <li>Whether the solid-fuel tests (BASS, BASS-II) recorded how each flame ended. The published tables don't say.</li>
            <li>A blind run of the sound alarm.</li>
          </ul>
        </Card>
      </div>
    </>
  )
}
