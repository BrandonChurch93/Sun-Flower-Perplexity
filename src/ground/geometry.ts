import * as THREE from 'three'
import { right, toward } from '../field/layout.ts'

// The near ground is the disc of this radius round the plant's foot.
export const nearRadiusM = 1.0

// Each ring of the near ground is this much wider than the one inside it, so its cells are near square and finest at the stem.
export const nearGrowth = 1.035
const NEAR_RINGS = 181
const SIDES = 180
const FAR_GROWTH = 1.3
const FAR_RINGS = 35

function disc(rings: number[], sides: number): THREE.BufferGeometry {
  const row = sides + 1
  const position = new Float32Array(rings.length * row * 3)
  const index: number[] = []
  rings.forEach((r, j) => {
    for (let s = 0; s < row; s++) {
      const a = Math.PI * ((2 * s) / sides - 1)
      const c = -Math.cos(a) * r
      const k = Math.sin(a) * r
      const v = (j * row + s) * 3
      position[v] = toward.x * c + right.x * k
      position[v + 1] = 0
      position[v + 2] = toward.z * c + right.z * k
      if (j > 0 && s < sides) {
        const p = (j - 1) * row
        const q = j * row
        index.push(p + s, q + s + 1, q + s, p + s, p + s + 1, q + s + 1)
      }
    }
  })
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(position, 3))
  geometry.setIndex(index)
  return geometry
}

const far = (): number[] => Array.from({ length: FAR_RINGS + 1 }, (_, k) => nearRadiusM * Math.pow(FAR_GROWTH, k))

export function nearGeometry(): THREE.BufferGeometry {
  const rings = [0, ...Array.from({ length: NEAR_RINGS + 1 }, (_, k) => nearRadiusM * Math.pow(nearGrowth, k - NEAR_RINGS))]
  return disc(rings, SIDES)
}

export function soilGeometry(): THREE.BufferGeometry {
  return disc(far(), SIDES)
}
