import { config } from '../config.ts'
import { hash01, streamSeed } from '../core/random.ts'
import { PLACE } from '../plant/part.ts'

export { PLACE }

const SEED = streamSeed('field')
const RAD = Math.PI / 180
const from = config.field.companion.fromAzimuthDeg * RAD

// The direction from the plant toward a camera standing at `field.companion.fromAzimuthDeg`, and that camera's right.
// Rows run along `right`, so they lie square to that camera. The field is on the far side.
export const toward = { x: Math.sin(from), z: Math.cos(from) }
export const right = { x: Math.cos(from), z: -Math.sin(from) }

// Which neighbor the companion is: its own seed, so its own leaf angles and timing.
export const companionVariant = 37

export const fieldNearM = 12
export const fieldFarM = 60

export const fieldHalfWidth = (depth: number): number => 10 + 0.85 * depth

export function companionPlace(): { x: number; z: number } {
  const c = config.field.companion
  return { x: toward.x * c.towardCameraM - right.x * c.leftM, z: toward.z * c.towardCameraM - right.z * c.leftM }
}

export interface FieldPlaces { near: Float32Array; far: Float32Array }

// Every neighbor: where it stands, how it is turned, its size, its lean and its tone. Eight numbers each.
export function fieldPlaces(): FieldPlaces {
  const near: number[] = []
  const far: number[] = []
  const { plantSpacingM, rowSpacingM, plantAheadOfRowM } = config.field
  let id = 0
  for (let k = 0; plantAheadOfRowM + k * rowSpacingM <= fieldFarM; k++) {
    const depth = plantAheadOfRowM + k * rowSpacingM
    const half = fieldHalfWidth(depth)
    const phase = hash01(SEED, 1, k)
    const count = Math.floor(half / plantSpacingM)
    for (let n = -count; n <= count; n++) {
      id++
      const across = (n + phase) * plantSpacingM + (hash01(SEED, 2, id) - 0.5) * 0.12
      const along = depth + (hash01(SEED, 3, id) - 0.5) * 0.1
      const x = -toward.x * along + right.x * across
      const z = -toward.z * along + right.z * across
      const list = Math.hypot(x, z) < fieldNearM ? near : far
      list.push(x, z, (hash01(SEED, 4, id) - 0.5) * 1.0, 0.8 + 0.13 * hash01(SEED, 5, id), (hash01(SEED, 6, id) - 0.5) * 0.1, (hash01(SEED, 7, id) - 0.5) * 0.1, hash01(SEED, 8, id), id)
    }
  }
  return { near: new Float32Array(near), far: new Float32Array(far) }
}
