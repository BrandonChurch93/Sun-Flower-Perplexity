import * as THREE from 'three'
import type { Plant } from '../plant/index.ts'
import { PLACE } from './layout.ts'

// A head turns on its stem and the leaves stay where they stand: the leaves read their places from a list of their own.
export function leavesApart(plant: Plant, count: number): THREE.InstancedInterleavedBuffer {
  const still = new THREE.InstancedInterleavedBuffer(new Float32Array(count * PLACE), PLACE)
  still.setUsage(THREE.DynamicDrawUsage)
  for (const part of plant.parts) {
    if (part.name !== 'leaves') continue
    for (const mesh of part.meshes) {
      mesh.geometry.setAttribute('aPlace', new THREE.InterleavedBufferAttribute(still, 4, 0))
      mesh.geometry.setAttribute('aVary', new THREE.InterleavedBufferAttribute(still, 4, 4))
    }
  }
  return still
}

// Writes one neighbor into both lists. The stem and the head go round the stem's own line by `turn`, so the lean stays where it was.
export function placeTurned(from: ArrayLike<number>, at: number, turned: Float32Array, still: Float32Array, to: number, turn: number): void {
  for (let j = 0; j < PLACE; j++) turned[to + j] = still[to + j] = from[at + j]
  if (turn === 0) return
  const c = Math.cos(turn)
  const s = Math.sin(turn)
  turned[to + 2] += turn
  turned[to + 4] = c * from[at + 4] - s * from[at + 5]
  turned[to + 5] = c * from[at + 5] + s * from[at + 4]
}

// Turns one neighbor of a list round its own stem's line, its lean with it.
export function turnBy(list: Float32Array, at: number, turn: number): void {
  if (turn === 0) return
  const c = Math.cos(turn)
  const s = Math.sin(turn)
  const x = list[at + 4]
  const z = list[at + 5]
  list[at + 2] += turn
  list[at + 4] = c * x - s * z
  list[at + 5] = c * z + s * x
}

// Leans one neighbor of a list by a slope given in the field's own directions, whichever way it is turned.
export function leanBy(list: Float32Array, at: number, x: number, z: number): void {
  const c = Math.cos(list[at + 2])
  const s = Math.sin(list[at + 2])
  list[at + 4] += c * x - s * z
  list[at + 5] += c * z + s * x
}
