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

// The kinds of neighbor, each its own plant: seven for the full plants, four for the simpler ones and the pictures made of them.
export const nearVariants = [41, 53, 67, 71, 83, 97, 113]
export const farVariants = [131, 149, 157, 173]

// How many seconds of film a kind is behind the plant. None is ahead, so none blooms before the plant.
const MAX_LAG_S = 1.5
export const lagOf = (index: number, count: number): number => -MAX_LAG_S * (((index * 3) % count) / Math.max(1, count - 1))

// Full plants to here, simpler ones to the next, pictures of plants to the third, and one carpet from there to the last.
export const fieldNearM = 12
export const fieldFarM = 42
export const fieldPicturesM = 150
export const fieldEndM = 600
const NEAR_BAND_M = 4
const FAR_BAND_M = 12
export const carpetBandM = 30

// Two turns of each simpler kind are drawn as pictures.
export const pictureTurns = 2
export const pictureCount = farVariants.length * pictureTurns

// The heads face the camera's side of the field, with scatter. The plant's own head faces 27 degrees to the left of it.
export const meanTurn = 0.25
const TURN_SCATTER = 0.42
const STRAGGLERS = 0.05
export const pictureTurn = (turn: number): number => meanTurn + (turn - (pictureTurns - 1) / 2) * 0.6

export const fieldHalfWidth = (depth: number): number => 10 + 0.85 * depth

export function companionPlace(): { x: number; z: number } {
  const c = config.field.companion
  return { x: toward.x * c.towardCameraM - right.x * c.leftM, z: toward.z * c.towardCameraM - right.z * c.leftM }
}

const fade = (t: number): number => t * t * (3 - 2 * t)
const step = (a: number, b: number, x: number): number => fade(Math.min(1, Math.max(0, (x - a) / (b - a))))

function noise(channel: number, x: number, z: number): number {
  const ix = Math.floor(x)
  const iz = Math.floor(z)
  const fx = fade(x - ix)
  const fz = fade(z - iz)
  const at = (i: number, j: number) => hash01(SEED, channel, (i * 73856093) ^ (j * 19349663))
  const a = at(ix, iz) + (at(ix + 1, iz) - at(ix, iz)) * fx
  const b = at(ix, iz + 1) + (at(ix + 1, iz + 1) - at(ix, iz + 1)) * fx
  return a + (b - a) * fz
}

const bell = (id: number, channel: number): number => (hash01(SEED, channel, id) + hash01(SEED, channel + 1, id) + hash01(SEED, channel + 2, id) - 1.5) / 0.5

// The front edge of the field wanders by up to two rows. Behind the plant it stands back by two, as far as the lens of the bloom sees,
// so the nearest heads in those frames are the size the approved image gives them.
const BAY = { left: -3.1, right: 2.1, soft: 0.9, rows: 2 }
function edgeRows(across: number): number {
  const bay = step(BAY.left - BAY.soft, BAY.left, across) * (1 - step(BAY.right, BAY.right + BAY.soft, across))
  const wander = step(0.5, 0.78, noise(20, across * 0.11, 3.7)) * 2
  return Math.max(bay * BAY.rows, wander)
}

export interface FieldPlaces { near: Float32Array; far: Float32Array; pictures: Float32Array }

let made: FieldPlaces | null = null

// Every neighbor: where it stands, how it is turned, its size, its lean and its tone. Eight numbers each.
// A picture's third number is which picture it shows.
export function fieldPlaces(): FieldPlaces {
  if (made) return made
  const near: number[] = []
  const far: number[] = []
  const pictures: number[] = []
  const { plantSpacingM, rowSpacingM, plantAheadOfRowM } = config.field
  let id = 0
  for (let k = 0; plantAheadOfRowM + k * rowSpacingM <= fieldPicturesM; k++) {
    const depth = plantAheadOfRowM + k * rowSpacingM
    const half = fieldHalfWidth(depth)
    const phase = hash01(SEED, 1, k)
    const count = Math.floor(half / plantSpacingM)
    for (let n = -count; n <= count; n++) {
      id++
      const across = (n + phase) * plantSpacingM + (hash01(SEED, 2, id) - 0.5) * 0.12
      const along = depth + (hash01(SEED, 3, id) - 0.5) * 0.1
      if (k < edgeRows(across) - 0.5) continue
      if (hash01(SEED, 9, id) < 0.03 + 0.05 * step(0.62, 0.8, noise(21, across * 0.5, depth * 0.5))) continue
      const x = -toward.x * along + right.x * across
      const z = -toward.z * along + right.z * across
      const reach = Math.hypot(x, z)
      const pick = hash01(SEED, 10, id)
      const patch = noise(22, x * 0.16, z * 0.16)
      const size = 0.7 + 0.15 * Math.min(1, Math.max(0, 0.5 + (patch - 0.5) * 0.9 + (hash01(SEED, 5, id) - 0.5) * 0.8))
      const leanX = Math.max(-0.16, Math.min(0.16, bell(id, 30) * 0.055))
      const leanZ = Math.max(-0.16, Math.min(0.16, bell(id, 33) * 0.055))
      const tone = Math.min(1, Math.max(0, 0.65 * hash01(SEED, 8, id) + 0.35 * noise(23, x * 0.09, z * 0.09) + 0.1 * (patch - 0.5)))
      if (reach < fieldFarM + (pick - 0.5) * FAR_BAND_M) {
        const straggler = hash01(SEED, 11, id) < STRAGGLERS
        const turn = straggler ? (hash01(SEED, 12, id) - 0.5) * 2 * Math.PI : meanTurn + bell(id, 36) * TURN_SCATTER
        const list = reach < fieldNearM + (pick - 0.5) * NEAR_BAND_M ? near : far
        list.push(x, z, turn, size, leanX, leanZ, tone, id)
        continue
      }
      // The pictures thin out with distance and hand over to the carpet plant by plant.
      const keep = (1 - 0.55 * step(70, 120, reach)) * (1 - step(fieldPicturesM - carpetBandM, fieldPicturesM, reach))
      if (hash01(SEED, 13, id) >= keep) continue
      pictures.push(x, z, Math.floor(hash01(SEED, 14, id) * pictureCount), size, leanX, leanZ, tone, id)
    }
  }
  made = { near: new Float32Array(near), far: new Float32Array(far), pictures: new Float32Array(pictures) }
  return made
}

// The share of a list that one kind of neighbor draws: every neighbor belongs to one kind for good.
export function shareOf(list: Float32Array, index: number, count: number): Float32Array {
  const out: number[] = []
  for (let i = 0; i < list.length; i += PLACE) {
    if (Math.floor(hash01(SEED, 15, list[i + 7]) * count) !== index) continue
    for (let j = 0; j < PLACE; j++) out.push(list[i + j])
  }
  return new Float32Array(out)
}
