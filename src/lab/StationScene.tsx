import { Environment, Lightformer, Line, useGLTF } from '@react-three/drei'
import { useThree } from '@react-three/fiber'
import { Suspense, useLayoutEffect } from 'react'
import * as THREE from 'three'
import type { Puff, Vec } from './model'
import { Beam, Camera, chip, Flame, Haze, Laptop, Stage, tag, type Label } from './parts'
import { inside, LAPTOPS, LINES, MODULE } from './station'

const { length: LEN, width: WID, height: HGT } = MODULE
const HOME = { eye: [1.1, 3.3, 6.7] as Vec, look: [0, 0.9, 0] as Vec }
const AISLE = { eye: [-3.75, 1.15, 0.05] as Vec, look: [0.6, 1.0, 0] as Vec }

export type View = 'module' | 'aisle' | 'flame'

export interface SceneProps {
  t: number
  at: Vec
  sheet?: { mid: Vec; length: number; wide: number; burned: number }
  flame: number
  wide?: number
  soot: number
  puffs: Puff[]
  early: number[]
  threshold: number
  flow: number
  view: View
  fit?: number
  onPlace: (at: Vec) => void
}

export const LAB = `${import.meta.env.BASE_URL}models/uslab.glb`
useGLTF.preload(LAB, false, true)

const DEPTH = 0.35
const CUT = [
  new THREE.Plane(new THREE.Vector3(0, -1, 0), HGT + DEPTH),
  new THREE.Plane(new THREE.Vector3(0, 1, 0), DEPTH),
  new THREE.Plane(new THREE.Vector3(0, 0, -1), WID / 2 + DEPTH),
  new THREE.Plane(new THREE.Vector3(0, 0, 1), WID / 2 + DEPTH),
]

export function Module() {
  const { scene } = useGLTF(LAB, false, true)
  const invalidate = useThree((s) => s.invalidate)
  const gl = useThree((s) => s.gl)
  useLayoutEffect(() => {
    gl.localClippingEnabled = true
    scene.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined
      if (!m) return
      m.side = THREE.FrontSide
      m.clippingPlanes = CUT
      m.envMapIntensity = 0.6
      if (/lights/i.test(m.name)) {
        m.emissive = new THREE.Color('#dfeaff')
        m.emissiveIntensity = 3
      }
    })
    invalidate()
  }, [scene, gl, invalidate])
  return <primitive object={scene} position={[-LEN, HGT / 2, 3.4]} scale={10} />
}

function Lights({ at, flame, t }: { at: Vec; flame: number; t: number }) {
  const flicker = 0.88 + 0.08 * Math.sin(t * 11) + 0.04 * Math.sin(t * 23.7)
  return (
    <>
      <Environment resolution={64} frames={1} environmentIntensity={0.22}>
        <color attach="background" args={['#07090c']} />
        <Lightformer form="rect" intensity={3} color="#dfeaff" position={[0, 4, 0]} rotation={[Math.PI / 2, 0, 0]} scale={[10, 1.2, 1]} />
        <Lightformer form="rect" intensity={1} color="#dfeaff" position={[0, 0, 5]} scale={[10, 3, 1]} />
        <Lightformer form="rect" intensity={1} color="#dfeaff" position={[0, 0, -5]} rotation={[0, Math.PI, 0]} scale={[10, 3, 1]} />
      </Environment>
      <hemisphereLight args={['#dfeaff', '#20242a', 0.22]} />
      {[-2.1, 0, 2.1].map((x) => (
        <pointLight key={x} position={[x, HGT - 0.25, 0]} color="#e6eeff" intensity={1.1} distance={6} decay={1.7} />
      ))}
      <pointLight position={at} color="#ff8a3c" intensity={flame > 0 ? (1.6 + 14 * flame) * flicker : 0} distance={6} decay={2} />
    </>
  )
}

const CLOTH = { color: '#e8e2d2', roughness: 0.95, side: THREE.DoubleSide }
const ASH = { color: '#2a2622', roughness: 1, side: THREE.DoubleSide }
const RAIL = { color: '#3b3e43', roughness: 0.4, metalness: 0.8 }

function Sheet({ mid, length, wide, burned }: { mid: Vec; length: number; wide: number; burned: number }) {
  const done = length * burned
  return (
    <group position={mid}>
      {done > 0 && (
        <mesh position={[-length / 2 + done / 2, 0, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[done, 2 * wide]} />
          <meshStandardMaterial {...ASH} />
        </mesh>
      )}
      {done < length && (
        <mesh position={[done / 2, 0, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[length - done, 2 * wide]} />
          <meshStandardMaterial {...CLOTH} />
        </mesh>
      )}
      {[-1, 1].map((s) => (
        <mesh key={s} position={[0, 0, s * (wide + 0.008)]}>
          <boxGeometry args={[length + 0.05, 0.012, 0.016]} />
          <meshStandardMaterial {...RAIL} />
        </mesh>
      ))}
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * (length / 2 + 0.017), 0, 0]}>
          <boxGeometry args={[0.016, 0.012, 2 * wide + 0.032]} />
          <meshStandardMaterial {...RAIL} />
        </mesh>
      ))}
    </group>
  )
}

function Walls({ onPlace }: { onPlace: (at: Vec) => void }) {
  return (
    <mesh
      position={[0, HGT / 2, 0]}
      onClick={(e) => {
        if (e.delta > 4) return
        e.stopPropagation()
        const p = e.point.clone().lerp(new THREE.Vector3(0, HGT / 2, 0), 0.14)
        onPlace(inside([p.x, p.y, p.z]))
      }}
    >
      <boxGeometry args={[LEN, HGT, WID]} />
      <meshBasicMaterial transparent opacity={0} depthWrite={false} side={THREE.BackSide} />
    </mesh>
  )
}

const ENDS = LINES.map((l) => [l.a, l.b])
const ARROW: Vec[] = [[0, 0, 0], [0.42, 0, 0]]
function FlowArrows({ flow }: { flow: number }) {
  if (flow <= 0) return null
  return (
    <>
      {[-0.55, 0, 0.55].map((z) => (
        <group key={z} position={[-LEN / 2 + 0.25, HGT - 0.2, z]}>
          <Line points={ARROW} color="#d8dde3" lineWidth={1.5} />
          <mesh position={[0.47, 0, 0]} rotation={[0, 0, -Math.PI / 2]}>
            <coneGeometry args={[0.035, 0.11, 12]} />
            <meshBasicMaterial color="#d8dde3" />
          </mesh>
        </group>
      ))}
    </>
  )
}

const inModule = (at: Vec) => Math.abs(at[0]) <= LEN / 2 && Math.abs(at[2]) <= WID / 2
const MIDDLES = LINES.map(({ a, b }): Vec => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2])

export default function StationScene({ t, at, sheet, flame, wide, soot, puffs, early, threshold, flow, view, fit = 1.9, onPlace }: SceneProps) {
  const labels: Label[] = [
    ...LAPTOPS.map((l) => ({ at: [l.at[0], l.at[1] + 0.36, l.at[2]] as Vec, className: tag, text: l.name })),
    ...LINES.map((_, j) => {
      const v = early[j] ?? 0
      return { at: MIDDLES[j], className: chip(v >= threshold, v >= 0.1), text: `${v < 10 ? v.toFixed(1) : Math.round(v)} µs` }
    }),
  ]
  const near = sheet?.mid ?? at
  const cam = view === 'flame' ? { eye: [near[0] - (sheet ? 0.9 : -0.25), near[1] + (sheet ? 0.28 : 0.3), near[2] + (sheet ? 0.85 : 0.75)] as Vec, look: near } : view === 'aisle' ? AISLE : HOME
  return (
    <Stage eye={HOME.eye} labels={labels}>
      <Lights at={at} flame={wide ?? flame} t={t} />
      <Suspense fallback={null}>
        <Module />
      </Suspense>
      <Walls onPlace={onPlace} />
      {sheet && <Sheet {...sheet} />}
      {LAPTOPS.map((l) => <Laptop key={l.name} at={l.at} turn={l.at[2] > 0 ? Math.PI : 0} arm={WID / 2 - Math.abs(l.at[2])} />)}
      <FlowArrows flow={flow} />
      {LINES.map((l, i) => <Beam key={l.name} points={ENDS[i]} warm={(early[i] ?? 0) / threshold} on={(early[i] ?? 0) >= threshold} phase={i * 0.37} />)}
      <Haze puffs={puffs} keep={inModule} strength={0.22} />
      <Flame at={at} radius={flame} wide={wide} soot={soot} t={t} ring={!wide} />
      <Camera eye={cam.eye} look={cam.look} fit={view === 'module' ? fit : 0} fov={view === 'aisle' ? 64 : 36} tilt={view === 'aisle' ? 0.8 : 0.62} near={view === 'aisle' ? 0.6 : 0.25} />
    </Stage>
  )
}
