import { RoundedBox } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'

export interface Pilot {
  pos: THREE.Vector3
  target: THREE.Vector3 | null
  yaw: number
  pitch: number
  tap: { x: number; y: number } | null
  lift: number
  zoom: number
}

export const newPilot = (): Pilot => ({ pos: new THREE.Vector3(), target: null, yaw: 0, pitch: 0.18, tap: null, lift: 0, zoom: 1 })

const WHITE = { color: '#f1f0ec', roughness: 0.32, metalness: 0.08 }
const DARK = { color: '#0b0c0f', roughness: 0.18, metalness: 0.6 }
const GLOW = new THREE.Color('#ff9a3d')

function Body() {
  const eyes = useRef<THREE.Group>(null)
  const tip = useRef<THREE.MeshBasicMaterial>(null)
  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    if (eyes.current) eyes.current.scale.y = t % 3.7 < 0.12 ? 0.15 : 1
    if (tip.current) tip.current.color.copy(GLOW).multiplyScalar(1.2 + 1.2 * Math.max(0, Math.sin(t * 3)))
  })
  return (
    <group>
      <RoundedBox args={[0.3, 0.26, 0.26]} radius={0.11} smoothness={5}>
        <meshStandardMaterial {...WHITE} />
      </RoundedBox>
      <mesh position={[0, 0.005, 0.118]}>
        <circleGeometry args={[0.098, 48]} />
        <meshStandardMaterial {...DARK} />
      </mesh>
      <group ref={eyes} position={[0, 0.02, 0.121]}>
        {[-0.038, 0.038].map((x) => (
          <mesh key={x} position={[x, 0, 0]}>
            <capsuleGeometry args={[0.011, 0.022, 4, 12]} />
            <meshBasicMaterial color={[2.2, 2.6, 3]} toneMapped={false} />
          </mesh>
        ))}
      </group>
      {[-1, 1].map((s) => (
        <group key={s} position={[s * 0.165, 0.03, 0.01]} rotation={[0, s * 0.5, 0]}>
          <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0, 0.02]}>
            <coneGeometry args={[0.075, 0.07, 32, 1, true]} />
            <meshStandardMaterial {...WHITE} side={THREE.DoubleSide} />
          </mesh>
          <mesh position={[0, 0, 0.012]}>
            <sphereGeometry args={[0.014, 16, 12]} />
            <meshBasicMaterial color={GLOW.clone().multiplyScalar(1.6)} toneMapped={false} />
          </mesh>
        </group>
      ))}
      <mesh position={[0, 0.16, -0.02]}>
        <cylinderGeometry args={[0.004, 0.004, 0.08, 8]} />
        <meshStandardMaterial {...DARK} />
      </mesh>
      <mesh position={[0, 0.205, -0.02]}>
        <sphereGeometry args={[0.013, 16, 12]} />
        <meshBasicMaterial ref={tip} toneMapped={false} />
      </mesh>
      <mesh position={[0, -0.135, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.07, 0.008, 12, 40]} />
        <meshBasicMaterial color={[0.9, 1.5, 2.4]} toneMapped={false} />
      </mesh>
      <pointLight color="#bcd9ff" intensity={0.25} distance={2.5} decay={2} position={[0, -0.1, 0.1]} />
    </group>
  )
}

const KEYS: Record<string, [number, number, number]> = {
  KeyW: [0, 0, 1], ArrowUp: [0, 0, 1], KeyS: [0, 0, -1], ArrowDown: [0, 0, -1],
  KeyA: [-1, 0, 0], ArrowLeft: [-1, 0, 0], KeyD: [1, 0, 0], ArrowRight: [1, 0, 0],
  Space: [0, 1, 0], ShiftLeft: [0, -1, 0], ShiftRight: [0, -1, 0],
}

const SPRINT = 2.2

export default function Echo({ pilot, speed, back, side = 0, size = 1, fov = 50, keep, onFirst }: { pilot: Pilot; speed: number; back: number; side?: number; size?: number; fov?: number; keep: (p: THREE.Vector3) => void; onFirst?: (first: boolean) => void }) {
  const body = useRef<THREE.Group>(null)
  const { camera, gl, size: view } = useThree()
  const setEvents = useThree((st) => st.setEvents)
  const s = useMemo(() => ({ down: new Set<string>(), vel: new THREE.Vector3(), want: new THREE.Vector3(), turn: Math.PI, dist: 1, fast: false, lastW: 0, armed: false, free: false, ray: new THREE.Raycaster(), plane: new THREE.Plane(), hit: new THREE.Vector3(), dir: new THREE.Vector3(), look: new THREE.Vector3() }), [])
  const told = useRef(onFirst)
  told.current = onFirst

  useEffect(() => {
    setEvents({
      compute: (event, state) => {
        if (event.type === 'pointermove' ? document.pointerLockElement : s.armed) state.pointer.set(0, 0)
        else state.pointer.set((event.offsetX / state.size.width) * 2 - 1, 1 - (event.offsetY / state.size.height) * 2)
        state.raycaster.setFromCamera(state.pointer, state.camera)
      },
    })
  }, [setEvents, s])
  useEffect(() => {
    if (!(camera instanceof THREE.PerspectiveCamera)) return
    camera.fov = fov
    camera.updateProjectionMatrix()
  }, [camera, fov])

  useEffect(() => {
    const typing = (e: KeyboardEvent) => e.target instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)
    let wide = 1
    const zoom = (to: number) => {
      const was = pilot.zoom === 0
      pilot.zoom = to
      if (to > 0) wide = to
      if (was !== (to === 0)) told.current?.(to === 0)
    }
    const press = (e: KeyboardEvent) => {
      if (typing(e)) return
      if (e.code === 'KeyV' && !e.repeat) zoom(pilot.zoom === 0 ? wide : 0)
      if (!(e.code in KEYS)) return
      if (e.code === 'KeyW' && !e.repeat) {
        s.fast = e.timeStamp - s.lastW < 300
        s.lastW = e.timeStamp
      }
      s.down.add(e.code)
      e.preventDefault()
    }
    const release = (e: KeyboardEvent) => {
      s.down.delete(e.code)
      if (e.code === 'KeyW') s.fast = false
    }
    const clear = () => s.down.clear()
    const turn = (dx: number, dy: number, k: number) => {
      pilot.yaw -= dx * k
      pilot.pitch = Math.min(1.45, Math.max(-1.45, pilot.pitch + dy * k))
    }
    const el = gl.domElement
    let drag: { x: number; y: number } | null = null
    const start = (e: PointerEvent) => {
      s.armed = document.pointerLockElement === el
      drag = { x: e.clientX, y: e.clientY }
      if (e.pointerType === 'mouse' && !s.armed && !s.free) Promise.resolve(el.requestPointerLock()).catch(() => {})
    }
    const refused = () => { s.free = true }
    const move = (e: PointerEvent) => {
      if (document.pointerLockElement === el) turn(e.movementX, e.movementY, 0.0022)
      else if (s.free && e.pointerType === 'mouse') turn(e.movementX, e.movementY, 0.0035)
      else if (drag) {
        turn(e.clientX - drag.x, e.clientY - drag.y, 0.005)
        drag = { x: e.clientX, y: e.clientY }
      }
    }
    const end = () => { drag = null }
    const wheel = (e: WheelEvent) => {
      e.preventDefault()
      const to = (pilot.zoom === 0 ? 0.4 : pilot.zoom) * Math.exp(e.deltaY * 0.0012)
      zoom(to < 0.42 ? 0 : Math.min(2.5, to))
    }
    window.addEventListener('keydown', press)
    window.addEventListener('keyup', release)
    window.addEventListener('blur', clear)
    el.addEventListener('pointerdown', start, true)
    document.addEventListener('pointerlockerror', refused)
    el.addEventListener('wheel', wheel, { passive: false })
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', end)
    return () => {
      window.removeEventListener('keydown', press)
      window.removeEventListener('keyup', release)
      window.removeEventListener('blur', clear)
      el.removeEventListener('pointerdown', start, true)
      document.removeEventListener('pointerlockerror', refused)
      el.removeEventListener('wheel', wheel)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', end)
      if (document.pointerLockElement === el) document.exitPointerLock()
    }
  }, [gl, pilot, s])

  useFrame(({ clock }, raw) => {
    const dt = Math.min(raw, 0.05)
    const { pos } = pilot
    if (pilot.tap) {
      s.ray.setFromCamera(new THREE.Vector2((pilot.tap.x / view.width) * 2 - 1, 1 - (pilot.tap.y / view.height) * 2), camera)
      s.plane.set(new THREE.Vector3(0, 1, 0), -pos.y)
      if (s.ray.ray.intersectPlane(s.plane, s.hit) && s.hit.distanceTo(pos) < 60) {
        pilot.target = s.hit.clone()
        keep(pilot.target)
      }
      pilot.tap = null
    }

    let x = 0
    let y = pilot.lift
    let z = 0
    for (const code of s.down) {
      x += KEYS[code][0]
      y += KEYS[code][1]
      z += KEYS[code][2]
    }
    const sin = Math.sin(pilot.yaw)
    const cos = Math.cos(pilot.yaw)
    const fast = s.fast && z > 0
    if (x || y || z) {
      pilot.target = null
      s.want.set(-sin * z + cos * x, y, -cos * z - sin * x)
      if (s.want.lengthSq() > 1) s.want.normalize()
      s.want.multiplyScalar(speed * (fast ? SPRINT : 1))
    } else if (pilot.target) {
      s.want.copy(pilot.target).sub(pos)
      const far = s.want.length()
      if (far < 0.03) {
        pilot.target = null
        s.want.set(0, 0, 0)
      } else {
        s.want.multiplyScalar(Math.min(speed * 1.6, far * 2.5 + 0.15) / far)
      }
    } else {
      s.want.set(0, 0, 0)
    }
    s.vel.lerp(s.want, 1 - Math.exp(-dt * (pilot.target ? 5 : 11)))
    pos.addScaledVector(s.vel, dt)
    keep(pos)

    s.dist += (pilot.zoom - s.dist) * (1 - Math.exp(-dt * 12))
    const far = back * s.dist
    const b = body.current
    if (b) {
      b.visible = far > 0.25 * size + 0.12
      b.position.copy(pos)
      b.position.y += 0.012 * Math.sin(clock.elapsedTime * 1.7)
      const aim = pilot.target ? Math.atan2(s.vel.x, s.vel.z) : pilot.yaw + Math.PI
      const d = THREE.MathUtils.euclideanModulo(aim - s.turn + Math.PI, Math.PI * 2) - Math.PI
      s.turn += d * (1 - Math.exp(-dt * 14))
      const ahead = (-sin * s.vel.x - cos * s.vel.z) / speed
      const across = (cos * s.vel.x - sin * s.vel.z) / speed
      b.rotation.set(Math.max(-0.3, Math.min(0.4, ahead * 0.22)), s.turn, Math.max(-0.3, Math.min(0.3, across * 0.22)), 'YXZ')
    }

    const cp = Math.cos(pilot.pitch)
    s.dir.set(-sin * cp, -Math.sin(pilot.pitch), -cos * cp)
    camera.position.set(pos.x + side * s.dist * cos, pos.y + 0.1 * far, pos.z - side * s.dist * sin).addScaledVector(s.dir, -far)
    camera.lookAt(s.look.copy(camera.position).add(s.dir))
    if (camera instanceof THREE.PerspectiveCamera) {
      const want = fov * (fast ? 1.12 : 1)
      if (Math.abs(camera.fov - want) > 0.05) {
        camera.fov += (want - camera.fov) * (1 - Math.exp(-dt * 8))
        camera.updateProjectionMatrix()
      }
    }
  })

  return (
    <group ref={body}>
      <group scale={size}>
        <Body />
      </group>
    </group>
  )
}
