import { useEffect, useMemo, useRef, useState } from 'react'
import { useData } from '../data/DataProvider'
import { MARK } from '../data/outcome'
import type { Test } from '../data/types'
import { calm, fileUrl, inGasModel, modelRight, useAutoPlay, useVideos, videoKey, type VideoRead, type Videos } from '../data/videos'
import { useOpenTest } from './TestDrawer'
import { buttonClass, Card, Dot, LegendItem, linkClass, Seg } from './ui'

const note = 'text-[13px] leading-[19px] text-muted'
const THESIS = 'https://drum.lib.umd.edu/items/9ab92529-d125-4385-993b-6e65a8479831/full'

export default function FlameVideos() {
  const videos = useVideos()
  if (!videos) return null
  return (
    <>
      <Story base={videos.clip_base} />
      <Wall videos={videos} />
    </>
  )
}

const SPAN = 54
const at = (s: number) => `${(s / SPAN) * 100}%`

function Story({ base }: { base: string }) {
  const [failed, setFailed] = useState(false)
  const vid = useRef<HTMLVideoElement>(null)
  useAutoPlay(vid, !failed)
  return (
    <Card title="The fire the camera can't see">
      <div className={`grid items-start gap-5 ${failed ? '' : 'md:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]'}`}>
        {!failed && (
          <video
            ref={vid}
            src={fileUrl(base, 'story-21174C3.mp4')}
            className="aspect-[4/3] w-full max-w-[520px] rounded-lg bg-black"
            muted
            loop
            playsInline
            controls
            preload="metadata"
            onError={() => setFailed(true)}
          />
        )}
        <div className="grid max-w-[60ch] gap-3 text-[15px] leading-[22px]">
          <p>
            Test 21174 C3, butane in 39% oxygen at 2 bar. NASA's table lists a 35 s flame that went out on its own, with the note "Cool flame!".
          </p>
          <p>
            A thesis from the experiment's team says the visible flame went out at 36 s, then a cool flame burned until the fuel was cut at 50 s. Only their
            low-light camera could see it, so this video looks dark for those 13 s.
          </p>
          <p className="text-muted">
            Early Echo times sound, which measures heat, not light. So it could notice a fire a camera can't see. We have not tested it on a cool flame.
          </p>
        </div>
      </div>
      <div className="mt-5 grid grid-cols-1 items-center gap-x-3 gap-y-1.5 text-xs text-muted sm:grid-cols-[56px_minmax(0,1fr)] [&>span:nth-child(odd)]:sm:text-right">
        <span>Video</span>
        <Bar parts={[[0, 36, 'bg-flame']]} />
        <span>Records</span>
        <Bar parts={[[0, 36, 'bg-flame'], [37, 50, 'bg-flame/35']]} />
        <span className="hidden sm:block" />
        <span className="relative h-4 text-faint" aria-hidden="true">
          {[0, 10, 20, 30, 40, 50].map((s) => (
            <span key={s} className="absolute top-0 -translate-x-1/2 first:translate-x-0" style={{ left: at(s) }}>
              {s}
            </span>
          ))}
        </span>
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
        <LegendItem swatch={<span className="h-2.5 w-3.5 rounded-sm bg-flame" />}>Flame visible</LegendItem>
        <LegendItem swatch={<span className="h-2.5 w-3.5 rounded-sm bg-flame/35" />}>Dark but still burning</LegendItem>
        <LegendItem swatch={<span className="h-3 w-0.5 bg-white" />}>Fuel cut, 50 s</LegendItem>
      </div>
      <p className={`mt-3 ${note}`}>
        Seconds after ignition. Video: what this camera shows. Records: NASA's table and{' '}
        <a className={linkClass} href={THESIS} target="_blank" rel="noreferrer">M. Kim's thesis</a> (University of Maryland, 2022, section 4.2).
      </p>
    </Card>
  )
}

function Bar({ parts }: { parts: [number, number, string][] }) {
  return (
    <span className="relative h-3 overflow-hidden rounded-[3px] bg-raised" aria-hidden="true">
      {parts.map(([a, b, c]) => <i key={a} className={`absolute inset-y-0 ${c}`} style={{ left: at(a), width: at(b - a) }} />)}
      <i className="absolute inset-y-0 w-0.5 -translate-x-1/2 bg-white" style={{ left: at(50) }} />
    </span>
  )
}

type Order = 'o2' | 'burn' | 'end'
const ORDERS: [Order, string][] = [['o2', 'Oxygen'], ['burn', 'Burn time'], ['end', 'Outcome']]
const FIRST = 16

const byO2 = (a: Test, b: Test) => (a.o2 ?? 0) - (b.o2 ?? 0)
const SORT: Record<Order, (a: Test, b: Test) => number> = {
  o2: byO2,
  burn: (a, b) => (a.burn_s ?? Infinity) - (b.burn_s ?? Infinity) || byO2(a, b),
  end: (a, b) => Number(a.end === 'stopped') - Number(b.end === 'stopped') || byO2(a, b),
}

function Wall({ videos }: { videos: Videos }) {
  const { tests, model } = useData()
  const openTest = useOpenTest()
  const [order, setOrder] = useState<Order>('o2')
  const [whole, setWhole] = useState(false)
  const study = model.gas
  const rows = useMemo(
    () =>
      tests
        .filter(inGasModel)
        .map((t) => ({ t, v: videos.tests[videoKey(t)] }))
        .filter((r): r is { t: Test; v: VideoRead } => !!r.v?.clip)
        .sort((a, b) => SORT[order](a.t, b.t)),
    [tests, videos, order],
  )
  if (!rows.length) return null
  const marks = rows.some(({ t }) => modelRight(study, t) != null)
  const s = videos.summary ?? {}
  return (
    <Card
      title={`${rows.length} gas ${rows.length === 1 ? 'flame' : 'flames'} on NASA's video`}
      aside={<Seg<Order> onCard dense label="Sort by" value={order} onChange={setOrder} options={ORDERS} />}
      footer={
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          {rows.length > FIRST && (
            <button type="button" className={buttonClass} aria-expanded={whole} onClick={() => setWhole(!whole)}>
              {whole ? 'Show fewer' : `Show all ${rows.length}`}
            </button>
          )}
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
            <LegendItem swatch={<Dot mark="out" />}>Went out on its own</LegendItem>
            <LegendItem swatch={<Dot mark="alive" />}>Still burning when the fuel was cut</LegendItem>
            {marks && <LegendItem swatch={<Call right />}>Model called it right</LegendItem>}
            {marks && <LegendItem swatch={<Call right={false} />}>Model called it wrong</LegendItem>}
          </div>
        </div>
      }
    >
      <p className={`mb-3.5 max-w-[78ch] ${note}`}>
        A program timed each flame from the video's pixels. It is not AI.{' '}
        {s.scored
          ? `Its burn time is within 3 s of NASA's for ${s.burn_within_3s ?? 0} of ${s.scored} tests it was scored on.`
          : "It hasn't been scored against NASA's table yet."}
      </p>
      {s.flicker && (
        <p className={`mb-3.5 max-w-[78ch] ${note}`}>
          A dying flame flickers first. In air with {Math.round(s.flicker.min_oxygen * 100)}% oxygen or more, how much a flame flickered in its last 10 s
          tells "went out on its own" from "still burning when the fuel was cut" for {s.flicker.right} of {s.flicker.of} flames, judged by a rule that
          never saw that flame's test day. Always saying "it went out" gets {s.flicker.always}.
        </p>
      )}
      <div className="grid grid-cols-2 gap-x-3 gap-y-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8">
        {rows.slice(0, whole ? rows.length : FIRST).map(({ t, v }) => (
          <Tile key={t.id} t={t} v={v} base={videos.clip_base} right={modelRight(study, t)} onOpen={() => openTest(t.id)} />
        ))}
      </div>
    </Card>
  )
}

function Tile({ t, v, base, right, onOpen }: { t: Test; v: VideoRead; base: string; right: boolean | null; onOpen: () => void }) {
  const box = useRef<HTMLButtonElement>(null)
  const vid = useRef<HTMLVideoElement>(null)
  const [near, setNear] = useState(false)
  useEffect(() => {
    const el = box.current
    if (!el) return
    const io = new IntersectionObserver(([e]) => setNear(e.isIntersecting), { rootMargin: '300px 0px' })
    io.observe(el)
    return () => io.disconnect()
  }, [])
  useAutoPlay(vid, near)
  const poster = v.poster ? fileUrl(base, v.poster) : undefined
  const o2 = t.o2 != null ? `${Math.round(t.o2 * 100)}% oxygen` : 'Oxygen not listed'
  const end = t.end === 'stopped' ? 'Burning at fuel cut' : 'Went out'
  const call = right == null ? '' : right ? ' The model called it right.' : ' The model called it wrong.'
  return (
    <button ref={box} type="button" className="group grid cursor-pointer content-start text-left" onClick={onOpen} aria-label={`Test ${t.label}, ${o2}, ${end.toLowerCase()}.${call} Open its details and video.`}>
      <span className="relative block aspect-[4/3] overflow-hidden rounded-lg bg-[#0a0a0a] ring-white/40 transition-shadow group-hover:ring-1">
        {near ? (
          <video
            ref={vid}
            src={fileUrl(base, v.clip!)}
            poster={poster}
            muted
            loop
            playsInline
            preload={poster || calm() ? 'none' : 'metadata'}
            className="size-full object-cover"
          />
        ) : (
          poster && <img src={poster} alt="" loading="lazy" className="size-full object-cover" />
        )}
        {right != null && (
          <span className="absolute right-1.5 top-1.5 grid size-5 place-items-center rounded-full bg-black/75">
            <Call right={right} />
          </span>
        )}
      </span>
      <span className="mt-1.5 text-xs leading-4">{o2}</span>
      <span className="mt-0.5 inline-flex items-center gap-1.5 text-xs leading-4 text-muted">
        <Dot mark={MARK[t.end!]} />
        {end}
      </span>
    </button>
  )
}

function Call({ right }: { right: boolean }) {
  return (
    <svg viewBox="0 0 12 12" className={`size-3 ${right ? 'stroke-muted' : 'stroke-wrong'}`} fill="none" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {right ? <path d="M2.5 6.3 5 8.7l4.5-5" /> : <path d="M3 3l6 6M9 3l-6 6" />}
    </svg>
  )
}
