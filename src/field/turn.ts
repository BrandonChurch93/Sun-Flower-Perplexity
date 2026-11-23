import * as THREE from 'three'
import type { PlantInputs } from '../plant/growth.ts'
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

// Hands the graphics card the part of a list that is not what it already has. In still air that is nothing.
export function send(buffer: THREE.InstancedInterleavedBuffer, sent: Float32Array, length: number): void {
  const list = buffer.array as Float32Array
  let first = 0
  while (first < length && list[first] === sent[first]) first++
  if (first === length) return
  let last = length - 1
  while (last > first && list[last] === sent[last]) last--
  sent.set(list.subarray(first, last + 1), first)
  buffer.addUpdateRange(first, last + 1 - first)
  buffer.needsUpdate = true
}

// What a neighbor's shape feels. The field sways it, so its own air is still. Its lean after the sun moves in steps too fine to see, and it twitches on the film second only while the days run: in a hold nothing grows and its shape is the same frame after frame.
const STEP = 256
const HELD = 0.05
const fine = (value: number): number => Math.round(value * STEP) / STEP

export function shapeInputs(inputs: PlantInputs): PlantInputs {
  const { real, ...rest } = inputs
  const lapse = Math.max(0, ((inputs.lapse ?? 0) - HELD) / (1 - HELD))
  const calmed = { ...rest, wind: 0, calm: 0, lapse, leanX: fine(inputs.leanX), leanZ: fine(inputs.leanZ), lift: fine(inputs.lift), liftLow: fine(inputs.liftLow ?? inputs.lift) }
  return lapse > 0 && real !== undefined ? { ...calmed, real } : calmed
}

// A shape is made again only when its clock or what it feels has moved.
export class Shaped {
  private open = Number.NaN
  private close = Number.NaN
  private felt = ''

  again(open: number, close: number, felt: string): boolean {
    if (open === this.open && close === this.close && felt === this.felt) return false
    this.open = open
    this.close = close
    this.felt = felt
    return true
  }

  // The shape was laid by other hands: whatever is asked next is laid.
  forget(): void {
    this.open = Number.NaN
  }
}
