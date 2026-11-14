import { Clone, Environment, Lightformer, RoundedBox, useGLTF } from '@react-three/drei'
import { Suspense, useMemo } from 'react'
import * as THREE from 'three'
import type { Puff, Vec } from './model'
import { Beam, Camera, chip, Flame, Haze, Laptop, Stage, type Label } from './parts'

export const MIC: Vec = [-0.45, 0.23, 0]
const STACK = 0.18
export const BAR = { x: 0.5, y: STACK + 0.034, deep: 0.07, high: 0.066, long: 0.36 }
const FACE = BAR.x - BAR.deep / 2
export const NEAR: Vec = [FACE, BAR.y, 0.105]
export const FAR: Vec = [FACE, BAR.y, -0.105]
export const CANDLE = { x: 0.008, z: 0.053, height: 0.07, radius: 0.019 }
export const WICK: Vec = [CANDLE.x, CANDLE.height + 0.012, CANDLE.z]

const CANDLE_LINE = [NEAR, MIC]
const OTHER_LINE = [FAR, MIC]
const HOME = { eye: [0.6, 0.45, 1.12] as Vec, look: [0.03, 0.13, 0] as Vec }
export const LAPTOP: Vec = [MIC[0] + 0.155, 0.021, 0]
const note = 'whitespace-nowrap text-[11px] text-muted'
const nearDesk = (at: Vec) => at[1] < 0.95

const TABLE = `${import.meta.env.BASE_URL}models/table.glb`
useGLTF.preload(TABLE, false, true)

export function Table() {
  const { scene } = useGLTF(TABLE, false, true)
  return <Clone object={scene} position={[0.05, -0.55, 0]} receiveShadow />
}

const METAL = { color: '#2c2e32', roughness: 0.38, metalness: 0.85 }

export function Stand() {
  return (
    <group position={[BAR.x, 0, 0]}>
      <RoundedBox args={[0.13, 0.008, 0.3]} radius={0.003} position={[0, 0.004, 0]} castShadow receiveShadow>
        <meshStandardMaterial {...METAL} />
      </RoundedBox>
      {[-0.1, 0.1].map((z) => (
        <mesh key={z} position={[0.02, STACK / 2, z]} castShadow>
          <cylinderGeometry args={[0.007, 0.007, STACK - 0.012, 20]} />
          <meshStandardMaterial {...METAL} />
        </mesh>
      ))}
      <RoundedBox args={[0.085, 0.006, BAR.long - 0.02]} radius={0.0025} position={[0, STACK - 0.003, 0]} castShadow>
        <meshStandardMaterial {...METAL} />
      </RoundedBox>
    </group>
  )
}

function grille() {
  const c = document.createElement('canvas')
  c.width = 1024
  c.height = 192
  const g = c.getContext('2d')!
  g.fillStyle = '#1b1c1f'
  g.fillRect(0, 0, c.width, c.height)
  for (const z of [-0.105, 0.105]) {
    g.fillStyle = '#131416'
    g.beginPath()
    g.arc(512 + (z / BAR.long) * 1024, 96, 62, 0, 7)
    g.fill()
  }
  g.fillStyle = '#0c0c0d'
  for (let y = 5; y < c.height; y += 7) for (let x = 5 + ((y / 7) % 2) * 3.5; x < c.width; x += 7) g.fillRect(x, y, 2.4, 2.4)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 4
  return t
}

export function Soundbar() {
  const cloth = useMemo(grille, [])
  return (
    <group position={[BAR.x, BAR.y, 0]}>
      <RoundedBox args={[BAR.deep, BAR.high, BAR.long]} radius={0.012} smoothness={4} castShadow>
        <meshStandardMaterial color="#3b3d42" roughness={0.5} metalness={0.25} />
      </RoundedBox>
      <mesh position={[-BAR.deep / 2 - 0.0005, 0, 0]} rotation={[0, -Math.PI / 2, 0]}>
        <planeGeometry args={[BAR.long - 0.03, BAR.high - 0.016]} />
        <meshStandardMaterial map={cloth} roughness={0.95} />
      </mesh>
    </group>
  )
}

export function Candle({ lit, at = [CANDLE.x, 0, CANDLE.z] }: { lit: boolean; at?: Vec }) {
  return (
    <group position={at}>
      <mesh position={[0, 0.002, 0]} receiveShadow>
        <cylinderGeometry args={[0.04, 0.036, 0.004, 40]} />
        <meshStandardMaterial color="#2b2c2f" roughness={0.35} metalness={0.8} />
      </mesh>
      <mesh position={[0, 0.004 + CANDLE.height / 2, 0]} castShadow>
        <cylinderGeometry args={[CANDLE.radius, CANDLE.radius, CANDLE.height, 40]} />
        <meshStandardMaterial color="#efe6d2" roughness={0.55} emissive="#ff8a3c" emissiveIntensity={lit ? 0.22 : 0} />
      </mesh>
      <mesh position={[0, 0.004 + CANDLE.height + 0.0005, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[CANDLE.radius * 0.72, 32]} />
        <meshStandardMaterial color="#d9cdb2" roughness={0.3} emissive="#ff8a3c" emissiveIntensity={lit ? 0.5 : 0} />
      </mesh>
      <mesh position={[0, 0.004 + CANDLE.height + 0.005, 0]}>
        <cylinderGeometry args={[0.0011, 0.0011, 0.011, 8]} />
        <meshStandardMaterial color="#1a1512" roughness={1} />
      </mesh>
    </group>
  )
}

export interface EarthSceneProps {
  t: number
  lit: boolean
  early: number | null
  need: number
  blocked: boolean
  puffs: Puff[]
}

export default function EarthScene({ t, lit, early, need, blocked, puffs }: EarthSceneProps) {
  const on = !blocked && early != null && early >= need
  const labels: Label[] = [
    { at: [MIC[0], MIC[1] + 0.07, 0], className: note, text: 'Laptop mic' },
    { at: [BAR.x, BAR.y + 0.1, 0], className: note, text: 'Soundbar' },
    { at: [CANDLE.x - 0.02, -0.045, CANDLE.z + 0.12], className: note, text: 'Candle' },
    {
      at: [(NEAR[0] + MIC[0]) / 2, (NEAR[1] + MIC[1]) / 2, (NEAR[2] + MIC[2]) / 2],
      className: chip(on, blocked || early != null),
      text: blocked ? 'Hand in the way' : `${Math.abs(early ?? 0).toFixed(1)} µs ${(early ?? 0) < 0 ? 'late' : 'early'}`,
    },
  ]
  const flicker = 0.86 + 0.09 * Math.sin(t * 11) + 0.05 * Math.sin(t * 23.7)
  return (
    <Stage eye={HOME.eye} labels={labels} shadows>
      <Environment resolution={64} frames={1} environmentIntensity={0.25}>
        <color attach="background" args={['#050608']} />
        <Lightformer form="rect" intensity={2} color="#cfd8e6" position={[0, 3, 1]} rotation={[Math.PI / 2, 0, 0]} scale={[5, 3, 1]} />
        <Lightformer form="rect" intensity={0.6} color="#cfd8e6" position={[-3, 1, 2]} rotation={[0, -Math.PI / 3, 0]} scale={[3, 2, 1]} />
      </Environment>
      <hemisphereLight args={['#cfd8e6', '#15171a', 0.5]} />
      <pointLight position={[-0.2, 1.1, 0.9]} color="#dfe6f2" intensity={1.1} distance={5} decay={1.6} />
      <pointLight position={[1.3, 0.7, -1]} color="#b9cdf0" intensity={1.6} distance={5} decay={1.6} />
      <pointLight position={[MIC[0] + 0.22, 0.14, 0]} color="#ffb070" intensity={0.03} distance={1} decay={2} />
      <pointLight position={[WICK[0], WICK[1] + 0.025, WICK[2]]} color="#ff9a4a" intensity={lit ? 0.16 * flicker : 0} distance={3} decay={2} castShadow shadow-mapSize={[512, 512]} shadow-bias={-0.002} shadow-radius={6} />
      <Suspense fallback={null}>
        <Table />
      </Suspense>
      <Laptop at={LAPTOP} turn={Math.PI / 2} />
      <Stand />
      <Soundbar />
      <Candle lit={lit} />
      <Beam points={OTHER_LINE} warm={0} on={false} dash={0.03} gap={0.27} speed={0.5} phase={0.11} />
      <Beam points={CANDLE_LINE} warm={(early ?? 0) / need} on={on} blocked={blocked} dash={0.03} gap={0.27} speed={0.5} />
      <Haze puffs={puffs} keep={nearDesk} strength={0.1} />
      <Flame at={WICK} radius={lit ? 0.006 : 0} t={t} tall ring={false} />
      <Camera eye={HOME.eye} look={HOME.look} fit={1.7} near={0.2} />
    </Stage>
  )
}
