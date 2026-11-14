import { useCallback, useEffect, useRef, useState } from 'react'
import { buttonClass, Seg } from '../components/ui'

type Speed = '1' | '4' | '16'

export function usePlayback(seconds: number, restartOn: string) {
  const [t, setT] = useState(0)
  const [playing, setPlaying] = useState(true)
  const [speed, setSpeed] = useState<Speed>('4')

  useEffect(() => {
    setT(0)
    setPlaying(true)
  }, [restartOn])

  const rate = useRef(4)
  rate.current = Number(speed)
  useEffect(() => {
    if (!playing) return
    let last = performance.now()
    let frame = requestAnimationFrame(function tick(time) {
      const step = Math.min(0.1, Math.max(0, (time - last) / 1000)) * rate.current
      last = time
      setT((v) => Math.min(seconds, v + step))
      frame = requestAnimationFrame(tick)
    })
    return () => cancelAnimationFrame(frame)
  }, [playing, seconds])
  useEffect(() => {
    if (t >= seconds) setPlaying(false)
  }, [t, seconds])

  const seek = useCallback((to: number) => {
    setPlaying(false)
    setT(Math.min(seconds, Math.max(0, to)))
  }, [seconds])
  const toggle = () => {
    if (t >= seconds) setT(0)
    setPlaying(!playing)
  }
  return { t, playing, speed, setSpeed, seek, toggle, ended: t >= seconds }
}

export function Transport({ play }: { play: ReturnType<typeof usePlayback> }) {
  return (
    <>
      <button type="button" className={`${buttonClass} min-w-[84px]`} onClick={play.toggle}>
        {play.playing ? 'Pause' : play.ended ? 'Replay' : 'Play'}
      </button>
      <Seg onCard label="Speed" value={play.speed} onChange={play.setSpeed} options={[['1', '1×'], ['4', '4×'], ['16', '16×']]} />
    </>
  )
}
