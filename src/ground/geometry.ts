import * as THREE from 'three'
import { right, toward } from '../field/layout.ts'

// The stand-in keeps the disc of this radius round the plant's foot and everything further than `keepTowardM` on the camera's side.
export const keepRadiusM = 1.0
export const keepTowardM = 0.3

const GROWTH = 1.3
const INNER_RINGS = 21
const OUTER_RINGS = 35
const SOIL_SIDES = 40
const NEAR_SIDES = 28

const edge = (r: number): number => Math.acos(Math.max(-1, -keepTowardM / r))

function sector(rings: number[], sides: number, angle: (r: number, s: number) => number): THREE.BufferGeometry {
  const row = sides + 1
  const position = new Float32Array(rings.length * row * 3)
  const index: number[] = []
  rings.forEach((r, j) => {
    for (let s = 0; s < row; s++) {
      const a = angle(r, s)
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

const outer = (): number[] => Array.from({ length: OUTER_RINGS + 1 }, (_, k) => keepRadiusM * Math.pow(GROWTH, k))

const soilAngle = (r: number, s: number): number => edge(r) * (2 * s / SOIL_SIDES - 1)
const nearAngle = (r: number, s: number): number => edge(r) + (2 * Math.PI - 2 * edge(r)) * (s / NEAR_SIDES)

export function soilGeometry(): THREE.BufferGeometry {
  return sector(outer(), SOIL_SIDES, soilAngle)
}

export function nearGeometry(): THREE.BufferGeometry[] {
  const inner = [0, ...Array.from({ length: INNER_RINGS + 1 }, (_, k) => keepRadiusM * Math.pow(GROWTH, k - INNER_RINGS))]
  const all = SOIL_SIDES + NEAR_SIDES
  const disc = sector(inner, all, (_, s) => (s <= SOIL_SIDES ? soilAngle(keepRadiusM, s) : nearAngle(keepRadiusM, s - SOIL_SIDES)))
  return [disc, sector(outer(), NEAR_SIDES, nearAngle)]
}
