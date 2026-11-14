import { Stars, useGLTF, useTexture } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import type { Test } from '../data/types'
import type { Vec } from '../lab/model'
import type { Pilot } from './Echo'
import type { PlaceKey } from './places'
import Sparks, { scatter } from './Sparks'

const BASE = import.meta.env.BASE_URL
const EARTH = `${BASE}models/earth.glb`
const MOON = `${BASE}models/moon.glb`
const ISS = `${BASE}models/iss.glb`
const MARS = `${BASE}textures/mars.jpg`
useGLTF.preload(EARTH, false, true)
useGLTF.preload(MOON, false, true)
useGLTF.preload(ISS, false, true)

export const WORLDS: Record<PlaceKey, { at: Vec; radius: number; reach: number }> = {
  station: { at: [0, 0.2, -6], radius: 2.6, reach: 1.6 },
  earth: { at: [-10.5, -4, -21], radius: 7, reach: 9 },
  moon: { at: [6.2, 3.6, -15], radius: 1.8, reach: 3 },
  mars: { at: [11.5, -2.2, -11.5], radius: 3, reach: 4.4 },
}
export const HUB_START: Vec = [0, 0, 5]

function fitted(scene: THREE.Object3D, radius: number) {
  const box = new THREE.Box3().setFromObject(scene)
  const size = box.getSize(new THREE.Vector3())
  const k = radius / (Math.max(size.x, size.y, size.z) / 2)
  return { scale: k, offset: box.getCenter(new THREE.Vector3()).multiplyScalar(-k) }
}

function Model({ url, radius, spin = 0, tilt = 0, onClick }: { url: string; radius: number; spin?: number; tilt?: number; onClick: () => void }) {
  const { scene } = useGLTF(url, false, true)
  const fit = useMemo(() => fitted(scene, radius), [scene, radius])
  const ref = useRef<THREE.Group>(null)
  const gl = useThree((s) => s.gl)
  useFrame((_, dt) => {
    if (ref.current) ref.current.rotation.y += dt * spin
  })
  return (
    <group
      rotation={[tilt, 0, 0]}
      onClick={(e) => {
        if (e.delta > 4) return
        e.stopPropagation()
        onClick()
      }}
      onPointerOver={() => { gl.domElement.style.cursor = 'pointer' }}
      onPointerOut={() => { gl.domElement.style.cursor = '' }}
    >
      <group ref={ref}>
        <primitive object={scene} scale={fit.scale} position={fit.offset} />
      </group>
    </group>
  )
}

function Mars({ radius, onClick }: { radius: number; onClick: () => void }) {
  const map = useTexture(MARS)
  map.colorSpace = THREE.SRGBColorSpace
  const ref = useRef<THREE.Mesh>(null)
  const gl = useThree((s) => s.gl)
  useFrame((_, dt) => {
    if (ref.current) ref.current.rotation.y += dt * 0.03
  })
  return (
    <mesh
      ref={ref}
      rotation={[0.3, 0, 0]}
      onClick={(e) => {
        if (e.delta > 4) return
        e.stopPropagation()
        onClick()
      }}
      onPointerOver={() => { gl.domElement.style.cursor = 'pointer' }}
      onPointerOut={() => { gl.domElement.style.cursor = '' }}
    >
      <sphereGeometry args={[radius, 64, 48]} />
      <meshStandardMaterial map={map} roughness={1} />
    </mesh>
  )
}

function Air({ radius, color }: { radius: number; color: string }) {
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        side: THREE.BackSide,
        blending: THREE.AdditiveBlending,
        uniforms: { uColor: { value: new THREE.Color(color) } },
        vertexShader: `varying vec3 vN; varying vec3 vV; void main() { vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
        fragmentShader: `uniform vec3 uColor; varying vec3 vN; varying vec3 vV; void main() { float a = pow(smoothstep(0.0, 0.32, abs(dot(normalize(vN), normalize(vV)))), 1.5); gl_FragColor = vec4(uColor * a * 1.4, 1.0); }`,
      }),
    [color],
  )
  return (
    <mesh material={material}>
      <sphereGeometry args={[radius, 48, 32]} />
    </mesh>
  )
}

export default function Hub({ tests, pilot, picked, onPick, onGo, onArrive }: { tests: Test[]; pilot: Pilot; picked: string | null; onPick: (t: Test) => void; onGo: (k: PlaceKey) => void; onArrive: (k: PlaceKey) => void }) {
  const ring = useRef<THREE.Group>(null)
  const at = useMemo(
    () =>
      tests.map((_, i): Vec => {
        const a = i * 2.39996
        const r = 3.3 + 2.1 * scatter(i, 1)
        return [Math.cos(a) * r, (scatter(i, 2) - 0.5) * 1.3, Math.sin(a) * r]
      }),
    [tests],
  )
  const here = useMemo(() => new THREE.Vector3(), [])
  useFrame((_, dt) => {
    if (ring.current) ring.current.rotation.y += dt * 0.02
    for (const key of Object.keys(WORLDS) as PlaceKey[]) {
      const w = WORLDS[key]
      if (pilot.pos.distanceTo(here.set(...w.at)) < w.reach) onArrive(key)
    }
  })
  return (
    <>
      <Stars radius={90} depth={40} count={5000} factor={3.2} saturation={0} fade speed={0.4} />
      <ambientLight intensity={0.12} />
      <directionalLight position={[14, 6, 10]} intensity={3.2} color="#fff6ea" />
      <group position={WORLDS.station.at}>
        <group rotation={[0.25, 0.6, 0.1]}>
          <Model url={ISS} radius={WORLDS.station.radius} onClick={() => onGo('station')} />
        </group>
        <group ref={ring} rotation={[0.18, 0, 0.08]}>
          <Sparks tests={tests} at={at} size={0.028} picked={picked} onPick={onPick} />
        </group>
      </group>
      <group position={WORLDS.earth.at}>
        <Model url={EARTH} radius={WORLDS.earth.radius} spin={0.02} tilt={0.4} onClick={() => onGo('earth')} />
        <Air radius={WORLDS.earth.radius * 1.022} color="#4f9dff" />
      </group>
      <group position={WORLDS.moon.at}>
        <Model url={MOON} radius={WORLDS.moon.radius} spin={0.015} onClick={() => onGo('moon')} />
      </group>
      <group position={WORLDS.mars.at}>
        <Mars radius={WORLDS.mars.radius} onClick={() => onGo('mars')} />
        <Air radius={WORLDS.mars.radius * 1.018} color="#ff8a4f" />
      </group>
    </>
  )
}
