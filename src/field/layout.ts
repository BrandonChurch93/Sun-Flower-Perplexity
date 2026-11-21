import { config } from '../config.ts'
import { hash01, streamSeed } from '../core/random.ts'
import { setLeafTurn } from '../plant/growth.ts'
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
export const companionVariant = 77
// Its leaf spiral is turned by hand so that a large upper leaf reaches in from the left edge to the sun in both bloom frames.
setLeafTurn(companionVariant, 118 * RAD)

// The kinds of neighbor, each its own plant: seven for the full plants, four for the simpler ones and the pictures made of them.
export const nearVariants = [41, 53, 67, 71, 83, 97, 113]
export const farVariants = [131, 149, 157, 173]

// The field never opens in step with the plant. Through the bloom each kind runs on its own clock: a few are seconds ahead of the plant,
// most are behind it and still buds when it is open. The clocks part slowly before the bloom and meet again before the last frame.
export type Tier = 'near' | 'far' | 'pictures'
const AHEAD_S: Record<Tier, number[]> = {
  near: [-4.5, 1.5, 3.6, -1.5, -3.5, -0.5, -2.5],
  far: [-5, 1.5, -3, -4],
  pictures: [-5, -2.5, -4.5, -3.5],
}
const EARLY_S = 3
const ramp = (a: number, b: number, t: number): number => {
  const x = Math.min(1, Math.max(0, (t - a) / (b - a)))
  return x * x * (3 - 2 * x)
}
export const opensEarly = (index: number, tier: Tier): boolean => AHEAD_S[tier][index] >= EARLY_S
export const kindTime = (time: number, index: number, tier: Tier): number => time + AHEAD_S[tier][index] * ramp(34, 44, time) * (1 - ramp(53, 59, time))

// A bud follows the sun through the day and at sunset has its back to the lens. As it opens it comes round to face the morning, and stays.
const AWAY_SHARE = 0.85
export const budTurn = (time: number, id: number): number => {
  if (hash01(SEED, 40, id) >= AWAY_SHARE) return 0
  const start = 45.2 + 0.9 * hash01(SEED, 41, id)
  const away = (hash01(SEED, 42, id) < 0.5 ? -1 : 1) * (2.0 + 0.9 * hash01(SEED, 43, id))
  return away * (1 - ramp(start, start + 3.4, time))
}

// Full plants to here, simpler ones to the next, pictures of plants to the third, and one carpet from there to the last.
export const fieldNearM = 12
export const fieldFarM = 40
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
const TURN_SCATTER = 1.0
const SIDEWAYS = 0.28
const SHORT = 0.1
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

// The front edge of the field wanders by up to two rows. Right behind the plant it stands back by one, so no head crowds the plant's own.
const BAY = { left: -0.45, right: 0.45, soft: 0.3, rows: 1 }
function edgeRows(across: number): number {
  const bay = step(BAY.left - BAY.soft, BAY.left, across) * (1 - step(BAY.right, BAY.right + BAY.soft, across))
  const wander = step(0.56, 0.8, noise(20, across * 0.3, 3.7)) * 2
  return Math.max(bay * BAY.rows, wander)
}

// Two neighbors of the third row are set by hand, to the right of the plant at sunset: both in a lane the sun comes down, one of the early kind facing the lens, one turned three quarters.
const EDGE = [
  { row: 2, across: 0.93, size: 0.82, turn: 0.2, kind: 2 },
  { row: 2, across: 1.31, size: 0.8, turn: 1.0, kind: 1 },
]

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
      // Past the near rows the plants stand off their lines, so no row can be followed to the horizon.
      const out = Math.hypot(depth, n * plantSpacingM)
      const across = (n + phase) * plantSpacingM + (hash01(SEED, 2, id) - 0.5) * (0.12 + 0.3 * step(8, 40, out))
      const along = depth + (hash01(SEED, 3, id) - 0.5) * (0.1 + 0.65 * step(fieldFarM + FAR_BAND_M, fieldFarM + 30, out))
      if (k < edgeRows(across) - 0.5) continue
      const x = -toward.x * along + right.x * across
      const z = -toward.z * along + right.z * across
      const reach = Math.hypot(x, z)
      const away = step(20, 60, reach)
      const wide = noise(25, x * 0.035, z * 0.035)
      const thin = 0.05 * step(0.62, 0.8, noise(21, across * 0.5, depth * 0.5)) + 0.3 * away * step(0.55, 0.72, noise(27, x * 0.05, z * 0.05))
      if (hash01(SEED, 9, id) < 0.03 + thin) continue
      const pick = hash01(SEED, 10, id)
      const patch = noise(22, x * 0.16, z * 0.16)
      const short = hash01(SEED, 15, id) < SHORT
      const size = short ? 0.45 + 0.15 * hash01(SEED, 16, id) : 0.6 + 0.2 * Math.min(1, Math.max(0, 0.5 + (patch - 0.5) * 0.9 + (wide - 0.5) * 1.4 * away + (hash01(SEED, 5, id) - 0.5) * 0.8))
      const leanX = Math.max(-0.2, Math.min(0.2, bell(id, 30) * 0.075))
      const leanZ = Math.max(-0.2, Math.min(0.2, bell(id, 33) * 0.075))
      const tone = Math.min(1, Math.max(0, (0.65 - 0.3 * away) * hash01(SEED, 8, id) + 0.35 * noise(23, x * 0.09, z * 0.09) + 0.1 * (patch - 0.5) + away * (0.15 + 0.9 * (noise(26, x * 0.03, z * 0.03) - 0.5))))
      if (reach < fieldFarM + (pick - 0.5) * FAR_BAND_M) {
        const straggler = hash01(SEED, 11, id) < STRAGGLERS
        const side = hash01(SEED, 17, id) < SIDEWAYS ? (hash01(SEED, 18, id) < 0.5 ? -1 : 1) * (1.0 + 0.6 * hash01(SEED, 19, id)) : 0
        const turn = straggler ? (hash01(SEED, 12, id) - 0.5) * 2 * Math.PI : meanTurn + side + bell(id, 36) * TURN_SCATTER
        const close = reach < fieldNearM + (pick - 0.5) * NEAR_BAND_M
        // Near the lens the kinds that open first are the tall ones, so the open heads are few and large.
        const tall = close && !short && AHEAD_S.near[Math.floor(hash01(SEED, 15, id) * nearVariants.length)] > 0
        const list = close ? near : far
        list.push(x, z, turn, tall ? 0.76 + 0.1 * hash01(SEED, 5, id) : close ? size : size - 0.05, leanX, leanZ, tone, id)
        continue
      }
      // The pictures thin out with distance and hand over to the carpet plant by plant.
      const keep = (1 - 0.6 * step(58, 110, reach)) * (1 - step(fieldPicturesM - carpetBandM, fieldPicturesM, reach))
      if (hash01(SEED, 13, id) >= keep) continue
      const kind = 0.45 * hash01(SEED, 14, id) + 0.55 * Math.min(1, Math.max(0, 0.5 + (noise(28, x * 0.06, z * 0.06) - 0.5) * 2.4))
      pictures.push(x, z, Math.min(pictureCount - 1, Math.floor(kind * pictureCount)) + 0.98 * Math.min(1, Math.max(0, 0.6 * hash01(SEED, 44, id) + 0.4 * wide + 0.25 * (hash01(SEED, 45, id) - 0.5))), size, leanX, leanZ, tone, id)
    }
  }
  const kindOf = (n: number): number => Math.floor(hash01(SEED, 15, n) * nearVariants.length)
  for (const edge of EDGE) {
    const x = -toward.x * (plantAheadOfRowM + edge.row * rowSpacingM) + right.x * edge.across
    const z = -toward.z * (plantAheadOfRowM + edge.row * rowSpacingM) + right.z * edge.across
    let at = 0
    for (let i = 0; i < near.length; i += PLACE) if (Math.hypot(near[i] - x, near[i + 1] - z) < Math.hypot(near[at] - x, near[at + 1] - z)) at = i
    do id++
    while (kindOf(id) !== edge.kind || hash01(SEED, 40, id) < AWAY_SHARE)
    near.splice(at, PLACE, x, z, edge.turn, edge.size, 0, 0, 0.6, id)
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
