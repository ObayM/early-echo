import { Clone, Environment, Lightformer, Stars, useGLTF, useTexture } from '@react-three/drei'
import { Suspense, useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { FAR, MIC, NEAR, WICK } from '../lab/EarthScene'
import type { Vec } from '../lab/model'
import { Module } from '../lab/StationScene'
import { LAPTOPS, LINES, MODULE } from '../lab/station'
import type { PlaceKey } from './places'
import { scatter } from './Sparks'

const BASE = import.meta.env.BASE_URL
const TABLE = `${BASE}models/table.glb`
const EARTH = `${BASE}models/earth.glb`
const GROUND = [`${BASE}textures/ground_diff.jpg`, `${BASE}textures/ground_nor.jpg`]

export interface Room {
  start: Vec
  yaw: number
  back: number
  size: number
  speed: number
  keep: (p: THREE.Vector3) => void
  bench?: Vec
  laptops: { name: string; at: Vec; turn: number; arm: number }[]
  lines: { a: Vec; b: Vec }[]
  warm: (at: Vec) => boolean
  wall?: { at: Vec; turn: number; wide: number; high: number }
}

const box = (lo: Vec, hi: Vec) => (p: THREE.Vector3) => {
  p.set(Math.min(hi[0], Math.max(lo[0], p.x)), Math.min(hi[1], Math.max(lo[1], p.y)), Math.min(hi[2], Math.max(lo[2], p.z)))
}
const field = (p: THREE.Vector3) => {
  const r = Math.hypot(p.x, p.z)
  if (r > 11) p.multiplyScalar(11 / r).setY(p.y)
  p.y = Math.min(3.2, Math.max(0.35, p.y))
}

const DOME = 2.4
const DOME_LAPTOPS = ([['A', [-1.5, 0.9, -0.9]], ['B', [1.2, 1.5, -0.9]], ['C', [1.5, 0.7, 1.0]], ['D', [-1.3, 1.3, 1.1]]] as [string, Vec][]).map(([name, at]) => ({ name, at, turn: Math.atan2(-at[0], -at[2]), arm: 0 }))
const between = (all: { at: Vec }[]) => all.flatMap((a, i) => all.slice(i + 1).map((b) => ({ a: a.at, b: b.at })))
const surface: Room = {
  start: [1.1, 1.25, 5.6],
  yaw: 0.18,
  back: 1.9,
  size: 0.6,
  speed: 2.2,
  keep: field,
  laptops: DOME_LAPTOPS,
  lines: between(DOME_LAPTOPS),
  warm: (at) => Math.hypot(...at) < DOME - 0.05,
  wall: { at: [0, 1.45, -1.55], turn: 0, wide: 2.1, high: 1.05 },
}

export const ROOMS: Record<PlaceKey, Room> = {
  station: {
    start: [-1.5, 1.12, 0.3],
    yaw: -Math.PI / 2 + 0.25,
    back: 1.35,
    size: 0.6,
    speed: 1.3,
    keep: box([-2.95, 0.3, -0.85], [2.95, MODULE.height - 0.3, 0.85]),
    laptops: LAPTOPS.map((l) => ({ ...l, turn: l.at[2] > 0 ? Math.PI : 0, arm: MODULE.width / 2 - Math.abs(l.at[2]) })),
    lines: LINES,
    warm: (at) => Math.abs(at[0]) < 3.1 && Math.abs(at[2]) < 1 && at[1] > 0.05 && at[1] < MODULE.height - 0.05,
    wall: { at: [-0.7, 1.15, -1.0], turn: 0, wide: 1.9, high: 0.95 },
  },
  earth: {
    start: [-0.15, 0.4, 0.6],
    yaw: -0.3,
    back: 1.05,
    size: 0.4,
    speed: 0.7,
    keep: box([-1.4, 0.14, -1], [1.4, 0.95, 1]),
    bench: WICK,
    laptops: [],
    lines: [{ a: NEAR, b: MIC }, { a: FAR, b: MIC }],
    warm: (at) => at[1] < 0.95,
  },
  moon: surface,
  mars: surface,
}

function StationRoom() {
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
        <pointLight key={x} position={[x, MODULE.height - 0.25, 0]} color="#e6eeff" intensity={1.1} distance={6} decay={1.7} />
      ))}
      <Suspense fallback={null}>
        <Module />
      </Suspense>
    </>
  )
}

const OUR_ROOM: Vec = [4.6, 3.04, 3.41]

function EarthRoom() {
  const { scene } = useGLTF(TABLE, false, true)
  return (
    <>
      <Environment resolution={64} frames={1} environmentIntensity={0.25}>
        <color attach="background" args={['#050608']} />
        <Lightformer form="rect" intensity={2} color="#cfd8e6" position={[0, 3, 1]} rotation={[Math.PI / 2, 0, 0]} scale={[5, 3, 1]} />
      </Environment>
      <hemisphereLight args={['#cfd8e6', '#15171a', 0.5]} />
      <pointLight position={[-0.2, 1.1, 0.9]} color="#dfe6f2" intensity={1.1} distance={5} decay={1.6} />
      <pointLight position={[1.3, 0.7, -1]} color="#b9cdf0" intensity={1.6} distance={5} decay={1.6} />
      <Clone object={scene} position={[0.05, -0.55, 0]} receiveShadow />
      <mesh position={[0.4, OUR_ROOM[1] / 2 - 0.55, -0.6]} receiveShadow>
        <boxGeometry args={OUR_ROOM} />
        <meshStandardMaterial color="#8d8a84" roughness={0.95} side={THREE.BackSide} />
      </mesh>
    </>
  )
}

const RIB = { color: '#3a3d43', roughness: 0.4, metalness: 0.85 }

function Dome() {
  return (
    <group>
      <mesh position={[0, 0.012, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[DOME, 64]} />
        <meshStandardMaterial color="#4a4d53" roughness={0.55} metalness={0.6} />
      </mesh>
      <mesh position={[0, 0.03, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <torusGeometry args={[DOME, 0.05, 12, 96]} />
        <meshStandardMaterial {...RIB} />
      </mesh>
      {[0, 1, 2].map((i) => (
        <mesh key={i} rotation={[0, (i * Math.PI) / 3, 0]} castShadow>
          <torusGeometry args={[DOME, 0.018, 8, 64, Math.PI]} />
          <meshStandardMaterial {...RIB} />
        </mesh>
      ))}
      <mesh renderOrder={5}>
        <sphereGeometry args={[DOME, 64, 32, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshPhysicalMaterial color="#cfe6ff" transparent opacity={0.1} roughness={0.05} metalness={0} side={THREE.DoubleSide} depthWrite={false} envMapIntensity={1.5} />
      </mesh>
      <pointLight position={[0, 2.05, 0]} color="#e6eeff" intensity={1.6} distance={5} decay={1.8} />
    </group>
  )
}

function Ground({ tint }: { tint: string }) {
  const [map, normal] = useTexture(GROUND)
  useMemo(() => {
    for (const t of [map, normal]) {
      t.wrapS = t.wrapT = THREE.RepeatWrapping
      t.repeat.set(45, 45)
      t.anisotropy = 4
    }
    map.colorSpace = THREE.SRGBColorSpace
  }, [map, normal])
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
      <planeGeometry args={[180, 180]} />
      <meshStandardMaterial map={map} normalMap={normal} normalScale={new THREE.Vector2(1.6, 1.6)} color={tint} roughness={1} />
    </mesh>
  )
}

function stone() {
  const g = mergeVertices(new THREE.IcosahedronGeometry(1, 3))
  const at = g.attributes.position
  const v = new THREE.Vector3()
  for (let i = 0; i < at.count; i++) {
    v.fromBufferAttribute(at, i)
    const lump = 0.82 + 0.16 * Math.sin(v.x * 3.1 + 1) * Math.sin(v.y * 2.7 + 2) + 0.1 * Math.sin(v.z * 5.3) * Math.sin(v.x * 4.1 + v.y * 3.3)
    at.setXYZ(i, v.x * lump, v.y * lump, v.z * lump)
  }
  g.computeVertexNormals()
  return g
}

function Rocks({ tint }: { tint: string }) {
  const ref = useRef<THREE.InstancedMesh>(null)
  const shape = useMemo(stone, [])
  useLayoutEffect(() => {
    const mesh = ref.current!
    const m = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    const e = new THREE.Euler()
    for (let i = 0; i < ROCKS; i++) {
      const a = scatter(i, 11) * Math.PI * 2
      const r = 3.4 + 55 * scatter(i, 12) ** 1.6
      const size = (0.03 + 0.3 * scatter(i, 13) ** 4) * (1 + r / 25)
      q.setFromEuler(e.set(scatter(i, 14) * 3, scatter(i, 15) * 6, scatter(i, 16) * 3))
      m.compose(new THREE.Vector3(Math.cos(a) * r, size * 0.15, Math.sin(a) * r), q, new THREE.Vector3(size, size * (0.45 + 0.35 * scatter(i, 17)), size * (0.7 + 0.5 * scatter(i, 18))))
      mesh.setMatrixAt(i, m)
    }
    mesh.instanceMatrix.needsUpdate = true
  }, [])
  return (
    <instancedMesh ref={ref} args={[shape, undefined, ROCKS]} castShadow receiveShadow frustumCulled={false}>
      <meshStandardMaterial color={tint} roughness={1} />
    </instancedMesh>
  )
}
const ROCKS = 320

function Sun({ at, color, power }: { at: Vec; color: string; power: number }) {
  return (
    <directionalLight position={at} color={color} intensity={power} castShadow shadow-mapSize={[1024, 1024]} shadow-bias={-0.0005}>
      <orthographicCamera attach="shadow-camera" args={[-7, 7, 7, -7, 1, 40]} />
    </directionalLight>
  )
}

function FarEarth() {
  const { scene } = useGLTF(EARTH, false, true)
  const fit = useMemo(() => {
    const ball = new THREE.Box3().setFromObject(scene).getBoundingSphere(new THREE.Sphere())
    return 2.6 / ball.radius
  }, [scene])
  return <Clone object={scene} scale={fit} position={[-16, 13, -42]} rotation={[0.4, 2, 0]} />
}

function MoonRoom() {
  return (
    <>
      <Stars radius={90} depth={30} count={3500} factor={3} saturation={0} fade speed={0} />
      <Environment resolution={64} frames={1} environmentIntensity={0.3}>
        <color attach="background" args={['#020203']} />
        <Lightformer form="rect" intensity={6} color="#fff4e6" position={[8, 6, 6]} scale={[6, 6, 1]} />
      </Environment>
      <hemisphereLight args={['#8a93a6', '#1a1a1c', 0.12]} />
      <Sun at={[9, 5.5, 7]} color="#fff4e6" power={3.6} />
      <Suspense fallback={null}>
        <Ground tint="#b9b9bb" />
        <Rocks tint="#77777a" />
        <FarEarth />
      </Suspense>
      <Dome />
    </>
  )
}

const SKY = '#b88a68'

function MarsRoom() {
  return (
    <>
      <color attach="background" args={[SKY]} />
      <fog attach="fog" args={[SKY, 14, 85]} />
      <Environment resolution={64} frames={1} environmentIntensity={0.5}>
        <color attach="background" args={[SKY]} />
        <Lightformer form="rect" intensity={4} color="#ffe2c4" position={[8, 7, 4]} scale={[6, 6, 1]} />
      </Environment>
      <hemisphereLight args={['#e0b08a', '#4a2c20', 0.7]} />
      <Sun at={[8, 7, 5]} color="#ffe2c4" power={2.4} />
      <Suspense fallback={null}>
        <Ground tint="#c0694a" />
        <Rocks tint="#8a4632" />
      </Suspense>
      <Dome />
    </>
  )
}

export default function RoomScene({ place }: { place: PlaceKey }) {
  return place === 'station' ? <StationRoom /> : place === 'earth' ? <EarthRoom /> : place === 'moon' ? <MoonRoom /> : <MarsRoom />
}
