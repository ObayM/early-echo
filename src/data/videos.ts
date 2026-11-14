import { useEffect, useState, type RefObject } from 'react'
import type { FlameStudy, Test } from './types'

export interface VideoRead {
  status: string
  nasa_burn_s?: number | null
  video_burn_s?: number | null
  clip?: string | null
  poster?: string | null
  clip_speed?: number | null
  clip_seconds?: number | null
  peak_bd?: number | null
  fade?: string | null
  cool_flame?: boolean | null
  calibration?: boolean | null
}

export interface Videos {
  clip_base: string
  reader?: string
  summary?: { with_video?: number; read_ok?: number; scored?: number; burn_within_3s?: number; median_diff_s?: number
    flicker?: { right: number; of: number; always: number; min_oxygen: number }
  }
  tests: Record<string, VideoRead>
}

export const BURNER_MM = 6.4

let loading: Promise<Videos | null> | null = null

function load() {
  loading ??= fetch(`${import.meta.env.BASE_URL}data/videos.json`)
    .then((r) => (r.ok ? r.json() : null))
    .then((v) => (v && typeof v.tests === 'object' && typeof v.clip_base === 'string' ? (v as Videos) : null))
    .catch(() => null)
  return loading
}

export function useVideos(): Videos | null {
  const [videos, setVideos] = useState<Videos | null>(null)
  useEffect(() => {
    let live = true
    load().then((v) => live && setVideos(v))
    return () => {
      live = false
    }
  }, [])
  return videos
}

export const fileUrl = (base: string, file: string) => (/^https?:\/\//.test(file) ? file : base + file)

export const inGasModel = (t: Test) => t.exp === 'CFI-G' && t.raw['Flame Type'] === 'Normal' && (t.end === 'out' || t.end === 'stopped')

export const videoKey = (t: Test) => t.label.replace(/\s+/g, '')

export function videoOf(videos: Videos | null, t: Test): VideoRead | null {
  if (!videos || !inGasModel(t)) return null
  return videos.tests[videoKey(t)] ?? null
}

export function modelRight(study: FlameStudy, t: Test): boolean | null {
  const p = study.calls?.[t.id]
  if (p == null) return null
  return p >= 0.5 === (t.end === 'stopped')
}

export const calm = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

export const speedSay = (s: number | null | undefined) =>
  s == null ? null : s <= 1.05 ? 'Shown at real speed.' : `Shown ${+s.toFixed(s < 3 ? 1 : 0)}x faster.`

const MAX_PLAYING = 6
const inView = new Set<HTMLVideoElement>()
function refresh() {
  let n = 0
  for (const v of inView) {
    if (n++ < MAX_PLAYING) v.play().catch(() => {})
    else v.pause()
  }
}

export function useAutoPlay(ref: RefObject<HTMLVideoElement | null>, on: boolean) {
  useEffect(() => {
    const v = ref.current
    if (!v || !on || calm()) return
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) inView.add(v)
        else {
          inView.delete(v)
          v.pause()
        }
        refresh()
      },
      { threshold: 0.5 },
    )
    io.observe(v)
    return () => {
      io.disconnect()
      inView.delete(v)
      refresh()
    }
  }, [ref, on])
}
