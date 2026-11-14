import { useEffect, useRef, useState } from 'react'
import { buttonClass, Card, PageTitle, Seg } from '../components/ui'
import { APART, BANDS, db, floor, FS, makeProbe, P, top, type Band } from '../twoway/probe'

type Role = 'A' | 'B'

function wav(chunks: Float32Array[][], total: number) {
  const out = new DataView(new ArrayBuffer(44 + total * 4))
  const text = (at: number, s: string) => [...s].forEach((c, i) => out.setUint8(at + i, c.charCodeAt(0)))
  text(0, 'RIFF')
  out.setUint32(4, 36 + total * 4, true)
  text(8, 'WAVEfmt ')
  out.setUint32(16, 16, true)
  out.setUint16(20, 1, true)
  out.setUint16(22, 2, true)
  out.setUint32(24, FS, true)
  out.setUint32(28, FS * 4, true)
  out.setUint16(32, 4, true)
  out.setUint16(34, 16, true)
  text(36, 'data')
  out.setUint32(40, total * 4, true)
  let at = 44
  for (const [l, r] of chunks)
    for (let i = 0; i < l.length; i++) {
      out.setInt16(at, Math.max(-1, Math.min(1, l[i])) * 32767, true)
      out.setInt16(at + 2, Math.max(-1, Math.min(1, (r ?? l)[i])) * 32767, true)
      at += 4
    }
  return new Blob([out], { type: 'audio/wav' })
}

function save(blob: Blob, name: string) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 10000)
}

interface Live {
  seconds: number
  phase: string
  own: number | null
  other: number | null
  gap: number | null
  loud: number
}

interface Run {
  ctx: AudioContext
  stream: MediaStream
  chunks: Float32Array[][]
  total: number
  marks: { t: number; state: 'lit' | 'out' }[]
  stop: () => void
}

export default function TwoWay() {
  const [role, setRole] = useState<Role>('A')
  const [band, setBand] = useState<Band>('high')
  const [live, setLive] = useState<Live | null>(null)
  const [marks, setMarks] = useState<Run['marks']>([])
  const [error, setError] = useState<string | null>(null)
  const run = useRef<Run | null>(null)
  useEffect(() => () => run.current?.stop(), [])

  const start = async () => {
    setError(null)
    setMarks([])
    try {
      if (!navigator.mediaDevices) throw new Error('This page needs https to use the microphone.')
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 2 } })
      const ctx = new AudioContext({ sampleRate: FS })
      await ctx.audioWorklet.addModule(`${import.meta.env.BASE_URL}twoway-recorder.js`)
      const probe = makeProbe(BANDS[band])
      const buffer = ctx.createBuffer(1, P, FS)
      buffer.copyToChannel(probe.wave, 0)
      let source: AudioBufferSourceNode | null = null
      let t0 = 0
      const play = (at: number) => {
        source?.stop()
        source = ctx.createBufferSource()
        source.buffer = buffer
        source.loop = true
        source.connect(ctx.destination)
        source.start(at)
      }

      const recorder = new AudioWorkletNode(ctx, 'twoway-recorder', { channelCount: 2, channelCountMode: 'explicit' })
      const mute = ctx.createGain()
      mute.gain.value = 0
      ctx.createMediaStreamSource(stream).connect(recorder).connect(mute).connect(ctx.destination)

      const state: Run = { ctx, stream, chunks: [], total: 0, marks: [], stop: () => {} }
      const frame = new Float32Array(P)
      let ready: Float32Array | null = null
      let loud = 0
      recorder.port.onmessage = (e: MessageEvent<Float32Array[]>) => {
        const l = e.data[0]
        state.chunks.push(e.data)
        for (let i = 0; i < l.length; i++) {
          const at = (state.total + i) % P
          frame[at] = l[i]
          loud = Math.max(loud, Math.abs(l[i]))
          if (at === P - 1) ready = frame.slice()
        }
        state.total += l.length
      }

      let phase = role === 'A' ? 'run' : 'listen'
      let own: number | null = null
      let other: number | null = null
      let since = 0
      if (role === 'A') play((t0 = ctx.currentTime + 0.1))
      const timer = window.setInterval(() => {
        if (!ready) return
        const env = probe.hear(ready)
        const base = floor(env)
        const seconds = state.total / FS
        const heard = (j: number | null) => j != null && env[j] > 6 * base
        if (phase === 'listen' && seconds > 2) {
          other = top(env, null)
          if (heard(other)) {
            play((t0 = ctx.currentTime + 0.1))
            phase = 'measure'
            since = seconds
          }
        } else if (phase === 'measure' && seconds > since + 1.5) {
          other = top(env, null, other)
          own = top(env, other)
          const move = (((APART - (own - other!)) % P) + P) % P
          const T = P / FS
          play(t0 + Math.ceil((ctx.currentTime + 0.15 - t0) / T) * T + move / FS)
          phase = 'settle'
          since = seconds
        } else if (phase === 'settle' && seconds > since + 1) {
          own = top(env, other)
          phase = 'run'
        } else if (phase === 'run') {
          if (role === 'A') {
            own ??= seconds > 0.6 ? top(env, null) : null
            if (own != null) other = top(env, own)
          } else {
            other = top(env, own, other)
          }
        }
        setLive({
          seconds,
          phase,
          own: own != null && phase !== 'measure' ? db(env[own], base) : null,
          other: heard(other) ? db(env[other!], base) : null,
          gap: own != null && heard(other) ? ((((other! - own) % P) + P) % P) / FS : null,
          loud,
        })
        loud = 0
      }, 500)

      state.stop = () => {
        window.clearInterval(timer)
        source?.stop()
        stream.getTracks().forEach((t) => t.stop())
        void ctx.close()
        run.current = null
      }
      run.current = state
      setLive({ seconds: 0, phase, own: null, other: null, gap: null, loud: 0 })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const stop = () => {
    const r = run.current
    if (!r) return
    r.stop()
    const stamp = new Date().toTimeString().slice(0, 8).replaceAll(':', '')
    const [lo, hi] = BANDS[band]
    save(wav(r.chunks, r.total), `twoway-${role}-${stamp}.wav`)
    save(new Blob([JSON.stringify({ role, f_lo: lo, f_hi: hi, seconds: r.total / FS, marks: r.marks }, null, 1)], { type: 'application/json' }), `twoway-${role}-${stamp}.json`)
    setLive(null)
  }

  const mark = (state: 'lit' | 'out') => {
    const r = run.current
    if (!r) return
    r.marks.push({ t: +(r.total / FS).toFixed(2), state })
    setMarks([...r.marks])
  }

  const level = (v: number | null) => (v == null ? 'not heard' : `heard, ${Math.round(v)} dB over the noise`)
  return (
    <>
      <PageTitle title="Two-laptop test">
        Two laptops, each playing a sound and timing the other's. Adding the two directions together cancels what one direction can't tell apart from a fire: the laptops' clocks drifting, and a fan moving the air. Only warm air on the line is left.
      </PageTitle>
      <div className="grid items-start gap-4 xl:grid-cols-12">
        <Card className="xl:col-span-7" title="Record">
          {!live ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-3">
                <Seg label="Which laptop" options={[['A', 'Laptop A (start first)'], ['B', 'Laptop B (start second)']]} value={role} onChange={setRole} onCard />
                <Seg label="Pitch" options={[['high', '18 to 23 kHz, silent'], ['mid', '12 to 17 kHz, a hiss'], ['low', '6 to 11 kHz, loud']]} value={band} onChange={setBand} onCard />
              </div>
              <button type="button" className="h-10 cursor-pointer rounded-full bg-flame px-5 font-medium text-black" onClick={start}>Start</button>
              {error && <p className="text-wrong">{error}</p>}
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-2xl font-semibold">{live.seconds.toFixed(0)} s <span className="text-base font-normal text-muted">{live.phase === 'run' ? 'recording' : live.phase === 'listen' ? 'listening for laptop A' : 'lining up with laptop A'}</span></p>
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5">
                <dt className="text-muted">This laptop</dt>
                <dd>{level(live.own)}</dd>
                <dt className="text-muted">The other laptop</dt>
                <dd className={live.other == null ? 'text-wrong' : ''}>{level(live.other)}</dd>
                <dt className="text-muted">Apart by</dt>
                <dd>{live.gap == null ? 'no reading' : `${(live.gap * 1000).toFixed(1)} ms of the 40 ms loop`}</dd>
                <dt className="text-muted">Microphone</dt>
                <dd className={live.loud > 0.95 ? 'text-wrong' : ''}>{Math.round(live.loud * 100)}% of full{live.loud > 0.95 ? ': too loud, turn the speaker down' : ''}</dd>
              </dl>
              <div className="flex flex-wrap gap-2">
                <button type="button" className={buttonClass} onClick={() => mark('lit')}>Flame is lit now</button>
                <button type="button" className={buttonClass} onClick={() => mark('out')}>Flame is out now</button>
                <button type="button" className="h-[34px] cursor-pointer rounded-full bg-white px-4 font-medium text-black" onClick={stop}>Stop and save</button>
              </div>
              {marks.length > 0 && <p className="text-muted">{marks.map((m) => `${m.state} at ${m.t.toFixed(0)} s`).join(', ')}</p>}
            </div>
          )}
        </Card>
        <Card className="xl:col-span-5" title="How to run it">
          <ol className="list-decimal space-y-1.5 pl-5 text-muted">
            <li>Put the two laptops about a metre apart, screens facing each other. Speaker volume up, nothing else playing.</li>
            <li>Open this page on both. Pick Laptop A on one and press Start. Then pick Laptop B on the other and press Start.</li>
            <li>Wait until both say the other laptop is heard. If not, try a lower pitch on both.</li>
            <li>Leave it alone for 30 seconds. Then light a candle under the line between them and press "Flame is lit now" on one laptop. Press "Flame is out now" when you put it out. Repeat a few times.</li>
            <li>Press "Stop and save" on both. Each saves a sound file and a small notes file.</li>
            <li>Put all four files on one laptop and run <code>.venv/bin/python twoway.py A.wav B.wav --marks A.json</code> in the sound-fire folder (use the notes file of the laptop where you pressed the flame buttons).</li>
          </ol>
        </Card>
      </div>
    </>
  )
}
