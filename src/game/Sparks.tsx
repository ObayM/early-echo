import { useThree } from '@react-three/fiber'
import { useLayoutEffect, useRef } from 'react'
import * as THREE from 'three'
import type { End, Test } from '../data/types'
import type { Vec } from '../lab/model'

const ENDS: Record<End | 'none', [number, number, number]> = {
  burned: [2.4, 1.1, 0.25],
  stopped: [2.4, 1.1, 0.25],
  out: [0.5, 1.1, 2.4],
  broke: [1.3, 1.3, 1.3],
  noign: [0.32, 0.32, 0.36],
  none: [0.75, 0.5, 0.22],
}
export const endHex: Record<End | 'none', string> = { burned: '#ff9a3d', stopped: '#ff9a3d', out: '#6fb1ff', broke: '#d0d0d0', noign: '#5a5a63', none: '#8f6a3a' }

export const scatter = (i: number, salt = 0) => {
  const v = Math.sin(i * 12.9898 + salt * 78.233) * 43758.5453
  return v - Math.floor(v)
}

export default function Sparks({ tests, at, size, picked, onPick }: { tests: Test[]; at: Vec[]; size: number; picked?: string | null; onPick: (t: Test) => void }) {
  const ref = useRef<THREE.InstancedMesh>(null)
  const gl = useThree((s) => s.gl)
  useLayoutEffect(() => {
    const mesh = ref.current!
    const m = new THREE.Matrix4()
    const c = new THREE.Color()
    tests.forEach((t, i) => {
      const on = t.id === picked
      const r = size * (on ? 2.6 : 0.75 + 0.5 * scatter(i, 3))
      m.makeScale(r, r, r).setPosition(at[i][0], at[i][1], at[i][2])
      mesh.setMatrixAt(i, m)
      const [red, green, blue] = ENDS[t.end ?? 'none']
      mesh.setColorAt(i, on ? c.setRGB(4, 4, 4) : c.setRGB(red, green, blue))
    })
    mesh.count = tests.length
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    mesh.computeBoundingSphere()
  }, [tests, at, size, picked])
  return (
    <instancedMesh
      ref={ref}
      args={[undefined, undefined, Math.max(1, tests.length)]}
      onClick={(e) => {
        if (e.delta > 4 || e.instanceId == null) return
        e.stopPropagation()
        onPick(tests[e.instanceId])
      }}
      onPointerOver={() => { gl.domElement.style.cursor = 'pointer' }}
      onPointerOut={() => { gl.domElement.style.cursor = '' }}
    >
      <sphereGeometry args={[1, 10, 8]} />
      <meshBasicMaterial toneMapped={false} />
    </instancedMesh>
  )
}
