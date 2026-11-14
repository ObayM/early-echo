import { Billboard, Line, OrbitControls, RoundedBox } from '@react-three/drei'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Bloom, EffectComposer, ToneMapping } from '@react-three/postprocessing'
import { ToneMappingMode } from 'postprocessing'
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ComponentRef, type ReactNode, type RefObject } from 'react'
import * as THREE from 'three'
import { ASSUMED, CABIN_T, type Puff, type Vec } from './model'

export const FLAME = new THREE.Color('#ff9a3d')
export const QUIET = new THREE.Color('#6f6f6f')

export { hasWebGL } from './webgl'

function rounded(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath()
  g.roundRect(x, y, w, h, r)
  g.fill()
}

function picture(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  draw(c.getContext('2d')!)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 4
  return t
}

let keys: THREE.Texture | undefined
let screen: THREE.Texture | undefined

const keysPicture = () =>
  (keys ??= picture(512, 352, (g) => {
    g.fillStyle = '#141518'
    g.fillRect(0, 0, 512, 352)
    g.fillStyle = '#2a2c31'
    ;[15, 14, 14, 13, 12].forEach((n, r) => {
      const w = 484 / n
      for (let i = 0; i < n; i++) rounded(g, 14 + i * w + 2, 16 + r * 30, w - 4, 25, 4)
    })
    ;[[14, 58], [76, 40], [120, 40], [164, 184], [352, 40], [396, 40], [440, 58]].forEach(([x, w]) => rounded(g, x + 2, 166, w - 4, 25, 4))
    g.fillStyle = '#1d1f23'
    rounded(g, 176, 212, 160, 118, 8)
    g.fillStyle = '#c8372d'
    g.beginPath()
    g.arc(256, 104, 5, 0, 7)
    g.fill()
  }))

const screenPicture = () =>
  (screen ??= picture(640, 400, (g) => {
    g.fillStyle = '#06080b'
    g.fillRect(0, 0, 640, 400)
    g.fillStyle = '#fff'
    g.font = '600 26px system-ui, sans-serif'
    g.fillText('Early Echo', 28, 48)
    g.fillStyle = '#8b9199'
    g.font = '18px system-ui, sans-serif'
    g.fillText('Listening', 28, 78)
    g.strokeStyle = '#1c2128'
    g.lineWidth = 1
    for (let y = 130; y <= 340; y += 42) {
      g.beginPath()
      g.moveTo(28, y)
      g.lineTo(612, y)
      g.stroke()
    }
    g.strokeStyle = '#ff9a3d'
    g.lineWidth = 3
    g.beginPath()
    for (let x = 28; x <= 612; x += 2) {
      const u = (x - 28) / 584
      const burst = Math.exp(-(((u - 0.3) / 0.07) ** 2)) + 0.45 * Math.exp(-(((u - 0.68) / 0.05) ** 2))
      const y = 235 + 95 * burst * Math.sin(u * 190)
      if (x === 28) g.moveTo(x, y)
      else g.lineTo(x, y)
    }
    g.stroke()
  }))

const BODY = { color: '#1a1b1e', roughness: 0.5, metalness: 0.35 }

export function Laptop({ at, turn = 0, arm = 0, lit = 1.6 }: { at: Vec; turn?: number; arm?: number; lit?: number }) {
  return (
    <group position={at} rotation={[0, turn, 0]}>
      <RoundedBox args={[0.34, 0.018, 0.235]} radius={0.006} smoothness={3} position={[0, -0.012, 0.03]}>
        <meshStandardMaterial {...BODY} />
      </RoundedBox>
      <mesh position={[0, -0.0025, 0.03]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[0.325, 0.22]} />
        <meshStandardMaterial map={keysPicture()} roughness={0.7} metalness={0.1} />
      </mesh>
      <mesh position={[0, -0.006, -0.088]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.007, 0.007, 0.3, 12]} />
        <meshStandardMaterial {...BODY} />
      </mesh>
      <group position={[0, -0.004, -0.088]} rotation={[-0.3, 0, 0]}>
        <RoundedBox args={[0.34, 0.225, 0.009]} radius={0.004} smoothness={3} position={[0, 0.115, 0]}>
          <meshStandardMaterial {...BODY} />
        </RoundedBox>
        <mesh position={[0, 0.118, 0.0048]}>
          <planeGeometry args={[0.312, 0.195]} />
          <meshBasicMaterial map={screenPicture()} color={[lit, lit, lit]} toneMapped={false} />
        </mesh>
      </group>
      {arm > 0 && (
        <group>
          <mesh position={[0, -0.03, -0.02]}>
            <cylinderGeometry args={[0.05, 0.05, 0.012, 20]} />
            <meshStandardMaterial color="#5b5e63" roughness={0.35} metalness={0.9} />
          </mesh>
          <mesh position={[0, -0.05, -0.02 - arm / 2]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.011, 0.011, arm, 12]} />
            <meshStandardMaterial color="#5b5e63" roughness={0.35} metalness={0.9} />
          </mesh>
          <mesh position={[0, -0.04, -0.02]}>
            <sphereGeometry args={[0.02, 16, 12]} />
            <meshStandardMaterial color="#2a2b2e" roughness={0.5} metalness={0.6} />
          </mesh>
        </group>
      )}
    </group>
  )
}

export interface Label {
  at: Vec
  className: string
  text: ReactNode
}

function Pin({ els, labels }: { els: RefObject<(HTMLElement | null)[]>; labels: RefObject<Label[]> }) {
  const v = useMemo(() => new THREE.Vector3(), [])
  useFrame(({ camera, size }) => {
    labels.current.forEach(({ at }, i) => {
      const el = els.current[i]
      if (!el) return
      v.set(...at).project(camera)
      el.style.transform = `translate(${((v.x + 1) / 2) * size.width}px, ${((1 - v.y) / 2) * size.height}px) translate(-50%, -50%)`
      el.style.visibility = v.z < 1 ? 'visible' : 'hidden'
    })
  })
  return null
}

function Pace({ slowAt, onSlow }: { slowAt: number; onSlow: () => void }) {
  const seen = useRef({ n: 0, late: 0 })
  useFrame((_, dt) => {
    if (dt > 0.25) return
    const s = seen.current
    s.n++
    if (dt > slowAt) s.late++
    if (s.n < 60) return
    if (s.late >= 45) onSlow()
    s.n = s.late = 0
  })
  return null
}

export function Stage({ eye, labels, glow = 0.7, shadows = false, always = false, far = 60, onMissed, children }: { eye: Vec; labels: Label[]; glow?: number; shadows?: boolean; always?: boolean; far?: number; onMissed?: (e: MouseEvent) => void; children: ReactNode }) {
  const els = useRef<(HTMLElement | null)[]>([])
  const latest = useRef(labels)
  latest.current = labels
  const [slow, setSlow] = useState(0)
  return (
    <div className="relative size-full">
      <Canvas flat shadows={shadows && slow < 2} frameloop={always ? 'always' : 'demand'} dpr={slow === 0 ? [1, 1.5] : slow === 1 ? 1 : 0.75} camera={{ position: eye, fov: 36, near: 0.05, far }} gl={{ antialias: false, powerPreference: 'high-performance' }} onPointerMissed={onMissed}>
        <color attach="background" args={['#000']} />
        {children}
        <Pin els={els} labels={latest} />
        {slow < 2 && <Pace slowAt={always ? 0.025 : 0.05} onSlow={() => setSlow((n) => n + 1)} />}
        <EffectComposer multisampling={slow ? 0 : 4}>
          <Bloom mipmapBlur luminanceThreshold={1} luminanceSmoothing={0.2} intensity={glow} radius={0.7} />
          <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
        </EffectComposer>
      </Canvas>
      <div className="pointer-events-none absolute inset-0 select-none overflow-hidden">
        {labels.map((l, i) => (
          <span key={i} ref={(el) => { els.current[i] = el }} className={`invisible absolute left-0 top-0 ${l.className}`}>
            {l.text}
          </span>
        ))}
      </div>
    </div>
  )
}

const CALM = new THREE.Color('#9fd0ff')
const HOT = FLAME.clone().multiplyScalar(2.4)

export function Beam({ points, warm, on, blocked = false, phase = 0, dash = 0.1, gap = 1.15, speed = 1.6 }: { points: Vec[]; warm: number; on: boolean; blocked?: boolean; phase?: number; dash?: number; gap?: number; speed?: number }) {
  const pulse = useRef<ComponentRef<typeof Line>>(null)
  useFrame((_, dt) => {
    const m = pulse.current?.material
    if (m) m.dashOffset -= Math.min(dt, 0.1) * speed
  })
  if (blocked) return <Line points={points} color="#777" lineWidth={1.25} dashed dashSize={dash * 0.6} gapSize={dash * 0.4} />
  const color = CALM.clone().lerp(HOT, Math.min(1, Math.max(0, warm)))
  return (
    <>
      <Line points={points} color={color} lineWidth={on ? 2.5 : 1} transparent opacity={on ? 0.9 : 0.3} toneMapped={false} />
      <Line ref={pulse} points={points} color={color.clone().multiplyScalar(on ? 1.6 : 2.2)} lineWidth={on ? 4.5 : 2.5} dashed dashSize={dash} gapSize={gap} dashOffset={phase} transparent toneMapped={false} />
    </>
  )
}

export const chip = (on: boolean, shown = true) => `whitespace-nowrap rounded-full px-1.5 py-0.5 text-[11px] font-medium ${on ? 'bg-flame text-black' : 'bg-black/80 text-muted'} ${shown ? '' : 'opacity-0'}`
export const tag = 'grid size-5 place-items-center rounded-full bg-white text-[11px] font-semibold text-black'

const HAZE_MAX = 400
const H_MAX = 1 - CABIN_T / ASSUMED.flameT
const hazeMaterial = () =>
  new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: THREE.AdditiveBlending,
    vertexShader: `
      varying vec3 vN; varying vec3 vV; varying vec3 vC;
      void main() {
        vec4 mv = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
        vN = normalize(normalMatrix * mat3(instanceMatrix) * normal);
        vV = normalize(-mv.xyz);
        #ifdef USE_INSTANCING_COLOR
          vC = instanceColor;
        #else
          vC = vec3(0.0);
        #endif
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      varying vec3 vN; varying vec3 vV; varying vec3 vC;
      void main() {
        float a = pow(max(dot(normalize(vN), normalize(vV)), 0.0), 3.0);
        gl_FragColor = vec4(vC * a, 1.0);
      }`,
  })

export function Haze({ puffs, keep, strength = 1 }: { puffs: Puff[]; keep: (at: Vec) => boolean; strength?: number }) {
  const ref = useRef<THREE.InstancedMesh>(null)
  const material = useMemo(hazeMaterial, [])
  const invalidate = useThree((s) => s.invalidate)
  useLayoutEffect(() => {
    const mesh = ref.current!
    const balls: { at: Vec; s: number; h: number }[] = []
    for (const p of puffs) {
      if (!keep(p.at)) continue
      const s = Math.sqrt(p.s2)
      let home = null
      for (let k = balls.length - 1; k >= Math.max(0, balls.length - 24) && !home; k--) {
        const b = balls[k]
        if (Math.abs(s - b.s) < 0.35 * b.s && Math.hypot(p.at[0] - b.at[0], p.at[1] - b.at[1], p.at[2] - b.at[2]) < 0.5 * b.s) home = b
      }
      if (home) home.h += p.h
      else if (balls.length < HAZE_MAX) balls.push({ at: p.at, s, h: p.h })
    }
    const m = new THREE.Matrix4()
    const c = new THREE.Color()
    balls.forEach((b, i) => {
      const h = Math.min(b.h, H_MAX)
      const heat = Math.min(1, Math.max(0, (Math.log10(Math.max((CABIN_T * h) / (1 - h), 1e-6)) + 1.5) / 4.5))
      const r = 1.8 * b.s
      m.makeScale(r, r, r).setPosition(b.at[0], b.at[1], b.at[2])
      mesh.setMatrixAt(i, m)
      mesh.setColorAt(i, c.copy(FLAME).multiplyScalar(0.4 * strength * heat))
    })
    mesh.count = balls.length
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    invalidate()
  }, [puffs, keep, strength, invalidate])
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, HAZE_MAX]} material={material} frustumCulled={false} renderOrder={2}>
      <sphereGeometry args={[1, 16, 12]} />
    </instancedMesh>
  )
}

const flameMaterial = () =>
  new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    premultipliedAlpha: true,
    uniforms: { uTime: { value: 0 }, uSoot: { value: 1 }, uTall: { value: 0 }, uWide: { value: 0 }, uGain: { value: 1 } },
    vertexShader: `
      uniform float uTall;
      varying vec3 vN; varying vec3 vV; varying vec3 vP;
      void main() {
        vec3 p = position;
        p.xz *= mix(1.0, mix(1.0, 0.1, smoothstep(-0.4, 1.0, p.y)), uTall);
        p.y = mix(p.y, (p.y + 1.0) * 2.6, uTall);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        vN = normalize(normalMatrix * normal);
        vV = normalize(-mv.xyz);
        vP = position;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform float uTime; uniform float uSoot; uniform float uTall; uniform float uWide; uniform float uGain;
      varying vec3 vN; varying vec3 vV; varying vec3 vP;
      void main() {
        float face = max(dot(normalize(vN), normalize(vV)), 0.0);
        float rim = 1.0 - face;
        float flick = 0.92 + 0.08 * sin(uTime * 9.0 + vP.y * 7.0 + vP.x * 5.0);
        vec3 col;
        float up = (vP.y + 1.0) / 2.0;
        vec3 tall = mix(vec3(0.22, 0.42, 1.0), vec3(1.0, 0.92, 0.66), smoothstep(0.05, 0.4, up));
        tall = mix(tall, vec3(1.0, 0.55, 0.16), smoothstep(0.6, 1.0, up));
        tall *= pow(face, 0.9) * (0.7 + 0.5 * smoothstep(0.1, 0.5, up));
        if (uWide > 0.5) {
          float along = vP.x * 0.5 + 0.5;
          col = mix(vec3(0.12, 0.32, 1.0), vec3(1.0, 0.56, 0.10), smoothstep(0.02, 0.3, along));
          col = mix(col, vec3(1.0, 0.26, 0.04), smoothstep(0.45, 1.0, along));
          col *= (0.5 + 0.6 * face) * smoothstep(1.0, 0.55, abs(vP.z)) * (1.0 - 0.75 * smoothstep(0.5, 1.0, along));
        } else {
          float shell = pow(rim, 1.6) * smoothstep(1.0, 0.8, rim);
          float core = pow(face, 2.5) * uSoot;
          col = vec3(0.30, 0.52, 1.0) * shell * 1.5 + vec3(1.0, 0.50, 0.12) * core * 1.1 + vec3(0.20, 0.30, 0.65) * pow(face, 1.2) * 0.35;
          col = mix(col, tall, uTall);
        }
        gl_FragColor = vec4(col * flick * uGain, clamp(max(col.r, max(col.g, col.b)), 0.0, 1.0) * 0.9);
      }`,
  })

export function Flame({ at, radius, wide, soot = 1, t, tall = false, rise = tall ? 1 : 0, ring = true, gain = 1.6 }: { at: Vec; radius: number; wide?: number; soot?: number; t: number; tall?: boolean; rise?: number; ring?: boolean; gain?: number }) {
  const material = useMemo(flameMaterial, [])
  material.uniforms.uTime.value = t
  material.uniforms.uSoot.value = soot
  material.uniforms.uTall.value = rise
  material.uniforms.uWide.value = wide ? 1 : 0
  material.uniforms.uGain.value = gain
  return (
    <group position={at}>
      {radius > 0 && (
        <mesh material={material} position={[wide ? 2.6 * radius : 0, 0, 0]} scale={[wide ? 3.6 * radius : radius, wide ? 1.3 * radius : radius, wide ?? radius]} renderOrder={3}>
          <sphereGeometry args={[1, 40, 28]} />
        </mesh>
      )}
      {ring && (
        <Billboard>
          <mesh>
            <ringGeometry args={[0.09, 0.094, 64]} />
            <meshBasicMaterial color="#fff" transparent opacity={0.6} depthTest={false} />
          </mesh>
        </Billboard>
      )}
    </group>
  )
}

export function Camera({ eye, look, fit = 0, near = 0.25, fov = 36, tilt = 0.62 }: { eye: Vec; look: Vec; fit?: number; near?: number; fov?: number; tilt?: number }) {
  const { camera, invalidate } = useThree()
  const back = useThree((s) => Math.max(1, fit / (s.size.width / s.size.height)))
  const controls = useRef<React.ComponentRef<typeof OrbitControls>>(null)
  const [ex, ey, ez] = eye
  const [lx, ly, lz] = look
  useEffect(() => {
    const c = controls.current
    if (!c) return
    c.target.set(lx, ly, lz)
    camera.position.set(ex, ey, ez).sub(c.target).multiplyScalar(back).add(c.target)
    if (camera instanceof THREE.PerspectiveCamera) {
      camera.fov = fov
      camera.updateProjectionMatrix()
    }
    c.update()
    invalidate()
  }, [ex, ey, ez, lx, ly, lz, back, fov, camera, invalidate])
  return <OrbitControls ref={controls} enablePan={false} minDistance={near} maxDistance={20} maxPolarAngle={Math.PI * tilt} />
}
