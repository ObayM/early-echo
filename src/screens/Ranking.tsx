import { useState } from 'react'
import RankRow from '../components/RankRow'
import { Card, Legend, PageTitle, Seg } from '../components/ui'
import { useData } from '../data/DataProvider'

type Show = 'all' | 'FLEX' | 'CFI-G'

export default function Ranking() {
  const { summary } = useData()
  const [show, setShow] = useState<Show>('all')
  const { ranking } = summary
  const rows = ranking.map((g, index) => ({ g, index })).filter(({ g }) => show === 'all' || g.exp === show)
  const none = ranking.filter((g) => g.out === 0)
  const all = ranking.filter((g) => g.out === g.tests)

  return (
    <>
      <PageTitle
        title="What keeps a flame alive"
        aside={<Seg<Show> label="Which flames" value={show} onChange={setShow} options={[['all', 'All flames'], ['FLEX', 'Droplets'], ['CFI-G', 'Gas flames']]} />}
      >
        Every group of flames NASA lit in the same fuel and the same air, ordered by how few went out on their own. Droplets that broke up are left out of the count, because they say nothing either way.{' '}
        {none.length ? <>In <b>{none.length} of {ranking.length}</b> groups no flame did.</> : 'Every group had at least one flame go out.'}
      </PageTitle>

      <div className="grid items-start gap-4 xl:grid-cols-12">
        <Card className="xl:col-span-8" title={`${rows.length} groups, hardest to put out first`} aside={<Legend />}>
          <div className="-mx-2 hidden grid-cols-[26px_minmax(0,2.2fr)_minmax(90px,1fr)_124px_84px_76px] gap-x-3 px-2 pb-1 text-xs text-faint md:grid">
            <span />
            <span>Fuel and air</span>
            <span>How the flames ended</span>
            <span className="text-right">Went out</span>
            <span className="text-right">Fuel burned</span>
            <span className="text-right">Burned for</span>
          </div>
          <div className="grid gap-0.5">
            {rows.map(({ g, index }, i) => <RankRow key={index} g={g} place={i + 1} index={index} full />)}
          </div>
        </Card>

        <Card className="xl:col-span-4" title="How to read this">
          <ul className="grid list-disc gap-2 pl-[18px] text-[13px] leading-[19px] text-muted">
            <li>A group is every flame from one experiment with the same fuel, the same pressure and the same band of oxygen. Groups with fewer than five flames that either went out or kept burning are left out.</li>
            <li>The order is by the share that went out on their own, among flames that did not break up, smallest first. Ties go to the bigger group.</li>
            <li>"Kept burning" means the flame burned all its fuel, or was still alight when the fuel was shut off.</li>
            <li>"Droplet broke up" means the test ended early, so it says nothing either way about that flame.</li>
            <li>Fuel burned and burn time are the middle value of the group. Fuel burned is the share used up while the flame could be seen, and exists for droplets only.</li>
            <li>In {all.length} groups every flame went out on its own. Most of those ran in low oxygen, or with carbon dioxide or helium in the air.</li>
            <li>Choose a row to see its tests.</li>
          </ul>
        </Card>
      </div>
    </>
  )
}
