import { useCallback, useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useData } from '../data/DataProvider'
import { atm, GAS, pct, seconds } from '../data/format'
import { BURNER_MM, calm, fileUrl, speedSay, useVideos, videoOf, type VideoRead } from '../data/videos'
import { labFlame } from '../lab/flames'
import { EndMark, linkClass } from './ui'

export function useOpenTest() {
  const [, setParams] = useSearchParams()
  return useCallback(
    (id: string | null) =>
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          if (id) next.set('t', id)
          else next.delete('t')
          return next
        },
        { replace: true, preventScrollReset: true },
      ),
    [setParams],
  )
}

export default function TestDrawer() {
  const { byId, summary } = useData()
  const [params] = useSearchParams()
  const open = useOpenTest()
  const videos = useVideos()
  const t = byId.get(params.get('t') ?? '')

  useEffect(() => {
    if (!t) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && open(null)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [t, open])

  if (!t) return null
  const video = videoOf(videos, t)
  const exp = summary.experiments.find((e) => e.key === t.exp)!
  const facts: [string, string | null][] = [
    ['Fuel', t.fuel],
    ['Oxygen in the air', t.o2 != null ? pct(t.o2) : null],
    ['Oxygen in the feed gas', t.feed_o2 != null ? pct(t.feed_o2) : null],
    ['Pressure', t.p != null ? atm(t.p) : null],
    ['Rest of the air', t.dil && t.o2 != null ? GAS[t.dil] : null],
    ['Air flow', t.flow != null ? `${t.flow} cm/s` : null],
    ['Droplet size at the start', t.d0 != null ? `${t.d0} mm` : null],
    ['Burned for', t.burn_s != null ? seconds(t.burn_s) : null],
    ['Fuel burned while the flame was visible', t.burned != null ? pct(t.burned) : null],
    ['Carbon monoxide rise', t.co_rise_ppm != null ? `${t.co_rise_ppm} ppm` : null],
    ['Flames lit that day', t.flames != null ? String(t.flames) : null],
    ['Date', t.date],
  ]

  return (
    <aside aria-label="Test details" className="fixed inset-y-0 right-0 z-30 w-full max-w-[440px] overflow-y-auto bg-[#161616] p-6 shadow-[-20px_0_60px_rgba(0,0,0,.6)]">
      <header className="mb-1 flex items-start justify-between gap-3">
        <h2 className="text-lg font-semibold leading-6">{t.exp} {t.label}</h2>
        <button type="button" className="h-8 cursor-pointer rounded-full border border-control px-3 hover:border-[#888]" onClick={() => open(null)}>
          Close
        </button>
      </header>
      <p className="text-muted">{exp.name}. {exp.what}.</p>
      {t.end && (
        <p className="mt-4">
          <EndMark end={t.end} label={summary.outcomes[t.end]} />
        </p>
      )}
      {t.note && <p className="mt-3 text-[13px] leading-[19px] text-muted">{t.note}</p>}
      {labFlame(t) && (
        <Link className="mt-4 grid h-10 place-items-center rounded-full bg-white font-medium text-black transition-colors hover:bg-[#ddd]" to={`/lab?flame=${encodeURIComponent(t.id)}`}>
          Burn this test in the lab
        </Link>
      )}
      <dl className="mt-4 grid grid-cols-[minmax(0,1fr)_auto] gap-x-4">
        {facts.map(([k, v]) => v && <Row key={k} k={k} v={v} />)}
      </dl>
      {video?.clip && videos && <Watch key={t.id} v={video} base={videos.clip_base} nasa={video.nasa_burn_s ?? t.burn_s} />}
      <h3 className="mb-2 mt-6 text-[13px] font-medium text-muted">NASA's row, as published</h3>
      <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4">
        {Object.entries(t.raw).map(([k, v]) => <Row key={k} k={k} v={v} />)}
      </dl>
      <p className="mt-3">
        <a className={linkClass} href={exp.url} target="_blank" rel="noreferrer">NASA's record for {exp.key} ({exp.psi})</a>
      </p>
    </aside>
  )
}

function Watch({ v, base, nasa }: { v: VideoRead; base: string; nasa: number | null }) {
  const [failed, setFailed] = useState(false)
  const read = v.video_burn_s
  const gap = nasa != null && read != null ? Math.abs(read - nasa) : null
  const rows: [string, string | null][] = [
    ["NASA's burn time", nasa != null ? seconds(nasa) : null],
    ['Burn time in the video', read != null ? seconds(read) : 'Not read'],
    ['Peak flame radius', v.peak_bd != null ? `${+v.peak_bd.toFixed(1)} burner widths, about ${Math.round(v.peak_bd * BURNER_MM)} mm` : null],
  ]
  return (
    <>
      <h3 className="mb-2 mt-6 text-[13px] font-medium text-muted">Watch NASA's video</h3>
      {failed ? (
        <p className="text-[13px] leading-[19px] text-muted">The video didn't load.</p>
      ) : (
        <video
          src={fileUrl(base, v.clip!)}
          poster={v.poster ? fileUrl(base, v.poster) : undefined}
          className="aspect-[4/3] w-full rounded-lg bg-black"
          controls
          muted
          loop
          playsInline
          autoPlay={!calm()}
          preload="metadata"
          onError={() => setFailed(true)}
        />
      )}
      <p className="mt-2 text-[13px] leading-[19px] text-muted">
        {speedSay(v.clip_speed)} Times and sizes are read from the video's pixels{v.peak_bd != null ? ', with the 6.4 mm burner as the ruler' : ''}.
      </p>
      <dl className="mt-2 grid grid-cols-[minmax(0,1fr)_auto] gap-x-4">
        {rows.map(([k, val]) => val && <Row key={k} k={k} v={val} />)}
      </dl>
      {gap != null && gap > 3 && <p className="mt-2 text-[13px] leading-[19px] text-muted">The video and the table disagree by {+gap.toFixed(1)} s.</p>}
      {v.calibration && <p className="mt-2 text-[13px] leading-[19px] text-muted">This test was used to tune the program, so it isn't in its score.</p>}
    </>
  )
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <>
      <dt className="min-w-0 border-t border-[#242424] py-[7px] text-muted [overflow-wrap:anywhere]">{k}</dt>
      <dd className="max-w-[220px] border-t border-[#242424] py-[7px] text-right [overflow-wrap:anywhere]">{v}</dd>
    </>
  )
}
