import * as THREE from 'three'
import { right, toward } from '../field/layout.ts'

// The puddle's sheet lies within this radius of the plant's foot.
export const nearRadiusM = 1.0
// The near ground is the disc of this radius round the plant's foot: the soil has its relief as shape there, and as shading beyond.
export const reliefRadiusM = 2.6

// Each ring of the near ground is this much wider than the one inside it, so its cells are near square and finest at the stem.
export const nearGrowth = 1.0175
const NEAR_SIDES = 360
const INNER_M = 0.002
const NEAR_RINGS = Math.round(Math.log(reliefRadiusM / INNER_M) / Math.log(nearGrowth))
// The coarse near ground of the low quality: every second ring and every second side.
export const coarseGrowth = nearGrowth * nearGrowth
const SIDES = 180
const FAR_GROWTH = 1.3
const FAR_RINGS = 32

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
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), rings[rings.length - 1] + 0.1)
  return geometry
}

const far = (): number[] => Array.from({ length: FAR_RINGS + 1 }, (_, k) => reliefRadiusM * Math.pow(FAR_GROWTH, k))

export function nearGeometry(coarse = false): THREE.BufferGeometry {
  const count = coarse ? Math.round(NEAR_RINGS / 2) : NEAR_RINGS
  const growth = coarse ? coarseGrowth : nearGrowth
  const rings = [0, ...Array.from({ length: count + 1 }, (_, k) => reliefRadiusM * Math.pow(growth, k - count))]
  return disc(rings, coarse ? NEAR_SIDES / 2 : NEAR_SIDES)
}

export function soilGeometry(): THREE.BufferGeometry {
  return disc(far(), SIDES)
}
