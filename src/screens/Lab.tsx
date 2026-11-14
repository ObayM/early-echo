import { useSearchParams } from 'react-router-dom'
import { Seg } from '../components/ui'
import EarthLab from '../lab/EarthLab'
import StationLab from '../lab/StationLab'

type Place = 'station' | 'earth'

export default function Lab() {
  const [params, setParams] = useSearchParams()
  const asked = params.get('place')
  const place: Place = asked === 'earth' ? asked : 'station'
  const pick = (
    <div className="max-w-full overflow-x-auto">
      <Seg<Place>
        label="Setting"
        value={place}
        onChange={(v) => setParams((prev) => { const next = new URLSearchParams(prev); next.set('place', v); return next }, { replace: true })}
        options={[['station', 'Station: NASA\'s flames'], ['earth', 'Earth: our candle']]}
      />
    </div>
  )
  return place === 'earth' ? <EarthLab pick={pick} /> : <StationLab pick={pick} />
}
