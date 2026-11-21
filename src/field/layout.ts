import { config } from '../config.ts'
import { hash01, streamSeed } from '../core/random.ts'
import { heightAt, setLeafHold, setLeafTurn } from '../plant/growth.ts'
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
setLeafTurn(companionVariant, 228.3 * RAD)
// Its upper leaves are held by hand for the bloom frames, as a cluster along the left edge: one swung round the stem and turned broadside across the sun
// on a stalk that rises from the lower left, a small dark one above it, three under it and two in the bottom corner. The one that grew toward the sun
// is swung out of the frame. They sink through the bloom as the stem carries them up, so that they stay where they are in the frame.
setLeafHold(companionVariant, 20, { droop: 0.2, lengthScale: 0.7, swingDeg: 180 })
setLeafHold(companionVariant, 19, { droop: 0.059, liftDeg: 39.433, sinkDeg: -4.919, lengthScale: 1.2, rollDeg: -81.181, foldScale: 0.826, swingDeg: 179.321 })
setLeafHold(companionVariant, 18, { droop: 0.107, liftDeg: 22.9, sinkDeg: 12.3, lengthScale: 1.079, rollDeg: 1.9, foldScale: 0.093, swingDeg: -23.7 })
setLeafHold(companionVariant, 16, { droop: 0.194, liftDeg: 5.7, sinkDeg: -8.3, lengthScale: 2.391, rollDeg: 8.1, foldScale: 0.741, swingDeg: -95 })
setLeafHold(companionVariant, 14, { droop: 0.005, liftDeg: 67.6, sinkDeg: -4.2, lengthScale: 1.853, rollDeg: 65.8, foldScale: 0.037, swingDeg: 146.3 })
setLeafHold(companionVariant, 17, { droop: 0.047, liftDeg: 34, sinkDeg: 6, lengthScale: 1.404, rollDeg: -1.9, foldScale: 0.413, swingDeg: 108.5 })
setLeafHold(companionVariant, 15, { droop: 0.191, liftDeg: 40.5, sinkDeg: -1.7, lengthScale: 1.841, rollDeg: 4.2, foldScale: 0.86, swingDeg: 13.3 })
setLeafHold(companionVariant, 23, { droop: 0, liftDeg: -16, sinkDeg: 53.6, lengthScale: 1.212, rollDeg: -3.4, foldScale: 0.022, swingDeg: 17 })

// The kinds of neighbor, each its own plant: seven for the full plants, four for the simpler ones and the pictures made of them.
export const nearVariants = [41, 53, 67, 71, 83, 97, 113]
export const farVariants = [131, 149, 157, 173]

// The field never opens in step with the plant. Through the bloom each kind runs on its own clock: a few are seconds ahead of the plant,
// most are behind it and still buds when it is open. The clocks part slowly before the bloom and meet again before the last frame.
export type Tier = 'near' | 'far' | 'pictures'
const AHEAD_S: Record<Tier, number[]> = {
  near: [-4.5, -0.6, 0.8, -1.5, -3.5, 0.4, -2.5],
  far: [-4.5, 1.5, -3, -4],
  pictures: [-4.6, -2.5, -4.2, -3.5],
}
const EARLY_S = 3
const ramp = (a: number, b: number, t: number): number => {
  const x = Math.min(1, Math.max(0, (t - a) / (b - a)))
  return x * x * (3 - 2 * x)
}
export const opensEarly = (index: number, tier: Tier): boolean => AHEAD_S[tier][index] >= EARLY_S
export const kindTime = (time: number, index: number, tier: Tier): number => time + AHEAD_S[tier][index] * ramp(34, 44, time) * (1 - ramp(55, 60, time))

// Young, every neighbor is nearly as tall as the plant. The rows are sown thick and stop sooner: each keeps the height it has
// while the plant, out in the open, goes on to its own. From the bloom on a neighbor has its own size.
const SETTLED_S = 45
const KNEE = 12
const softMin = (a: number, b: number): number => -Math.log(Math.exp(-KNEE * a) + Math.exp(-KNEE * b)) / KNEE
export const plantAhead = (time: number): number => Math.min(4, Math.max(1, heightAt(SETTLED_S) / Math.max(heightAt(time), 0.001)))
// Before the bloom the rows are uneven: the plants in poorer ground are well behind, and catch up as the buds fill.
export const lagAt = (time: number): number => 0.3 * (1 - ramp(35, 40, time))
export const youngOf = (tone: number, lag = 0): number => 0.9 + 0.1 * tone - lag * (1 - step(0.25, 0.55, tone))
export const sizeAt = (size: number, young: number, ahead: number): number => size * (softMin(young / size, ahead) - softMin(young / size, 1) + 1)
// At night the rows are low and broad, leaf over leaf; before the frost they shoot up to the plant's height.
export const squatAt = (time: number): number => 0.05 + 0.22 * ramp(15, 25, time) - 0.27 * ramp(27, 35.5, time)
// In the thick of the rows a young leaf hangs outward from its stalk; by the bloom it is held as the plant holds its own.
export const hangAt = (time: number): number => 0.5 * ramp(12, 24, time) * (1 - ramp(36.5, 40, time))
export const sizeGlsl = /* glsl */ `
uniform float uLag;float softMin(float a, float b) { return -log(exp(-${KNEE.toFixed(1)} * a) + exp(-${KNEE.toFixed(1)} * b)) / ${KNEE.toFixed(1)}; }
float sizeAt(float size, float tone, float ahead) {
  float a = (0.9 + 0.1 * tone - uLag * (1.0 - smoothstep(0.25, 0.55, tone))) / size;
  return size * (softMin(a, ahead) - softMin(a, 1.0) + 1.0);
}
`

// A bud follows the sun through the day and at sunset has its back to the lens. As it opens it comes round to face the morning, and stays.
const AWAY_SHARE = 0.85
export const budTurn = (time: number, id: number): number => {
  if (hash01(SEED, 40, id) >= AWAY_SHARE) return 0
  const start = 45.2 + 0.9 * hash01(SEED, 41, id)
  const away = (hash01(SEED, 42, id) < 0.5 ? -1 : 1) * (2.0 + 0.9 * hash01(SEED, 43, id))
  return away * (1 - ramp(start, start + 3.4, time))
}

// Full plants to here, simpler ones to the next, pictures of plants to the last row, where the field ends on a straight edge.
// A carpet closes the tops over the last rows.
export const fieldNearM = 12
export const fieldFarM = 40
export const fieldPicturesM = 66
const NEAR_BAND_M = 4
const FAR_BAND_M = 12
export const carpetBandM = 14

// Two turns of each simpler kind are drawn as pictures.
export const pictureTurns = 2
export const pictureCount = farVariants.length * pictureTurns

// The heads face the camera's side of the field, with scatter. The plant's own head faces 27 degrees to the left of it.
export const meanTurn = 0.25
const TURN_SCATTER = 0.8
const SIDEWAYS = 0.2
const BEHIND = 0.22
const SHORT = 0.1
const STRAGGLERS = 0.05
const SKIRT_GAPS = 0.25
const SKIRT_SIZE = [0.4, 0.46]
const UNDER_FROM_M = 7
const UNDER_TO_M = 18
const UNDER_PER_GAP = 2
const UNDER_ID = 1000000
// Each kind of picture is drawn once from the front and once from the side or from behind, no two at the same angle.
const PICTURE_TURNS = [[-0.1, 1.55], [0.35, 3.0], [0.7, -1.2], [0.15, 2.3]]
export const pictureTurn = (kind: number, turn: number): number => PICTURE_TURNS[kind][turn]

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
const bayAt = (across: number): number => step(BAY.left - BAY.soft, BAY.left, across) * (1 - step(BAY.right, BAY.right + BAY.soft, across))
function edgeRows(across: number): number {
  const bay = bayAt(across)
  const wander = step(0.56, 0.8, noise(20, across * 0.3, 3.7)) * 2
  return Math.max(bay * BAY.rows, wander)
}

// Three neighbors of the second row are set by hand, to the right of the plant at sunset: a group of tall heads, one of the early kind facing the lens, one turned part away, one seen from the side.
const EDGE = [
  { row: 1, across: 0.762, size: 0.859, turn: 0.2, kind: 5, more: false },
  { row: 1, across: 0.896, size: 0.88, turn: -0.6, kind: 1, more: true },
  { row: 1, across: 1.132, size: 0.877, turn: 1.3, kind: 3, more: true },
]

// The crop's front comes forward round the companion, so that only the plant stands free: the first row is at full height beside the bay
// the plant stands in, a third of it short, and five neighbors stand before the rows at the companion's side,
// each set by hand: how far behind the plant's line, how far to its right, its size, its turn and its kind.
const FRONT_SHORT = 0.35
const FRONT_CHANNEL = 75
const frontRow = (across: number): boolean => (across > -2.6 && across < -0.85) || (across > 1.5 && across < 6)
const FRONT = [
  { along: 0.78, across: -1.32, size: 0.7, turn: 0.35, kind: 1 },
  { along: 0.7, across: -1.8, size: 0.78, turn: -0.15, kind: 5 },
  { along: 0.83, across: -2.22, size: 0.62, turn: 0.7, kind: 3 },
  { along: 0.04, across: -1.52, size: 0.67, turn: 0.25, kind: 6 },
  { along: 0.02, across: -1.98, size: 0.6, turn: -0.4, kind: 0 },
]
export const frontM = config.field.plantAheadOfRowM

export interface FieldPlaces { near: Float32Array; far: Float32Array; pictures: Float32Array; under: Float32Array; front: Float32Array }

let made: FieldPlaces | null = null

// Every neighbor: where it stands, how it is turned, its size, its lean and its tone. Eight numbers each.
// A picture's third number is which picture it shows.
export function fieldPlaces(): FieldPlaces {
  if (made) return made
  const near: number[] = []
  const far: number[] = []
  const pictures: number[] = []
  const under: number[] = []
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
      // Before the edge the crop is thin and stays short: a skirt of low plants, far under the plant's head when it opens.
      const skirt = k < edgeRows(across) - 0.5 && !(k === 0 && frontRow(across))
      if (skirt && hash01(SEED, 71, id) < SKIRT_GAPS) continue
      const x = -toward.x * along + right.x * across
      const z = -toward.z * along + right.z * across
      const reach = Math.hypot(x, z)
      // A crop sown thick: in the first rows a shorter plant stands in every gap of the row, in the shade of the tall ones, so there are leaves at every height.
      for (let u = 0; !skirt && reach < UNDER_TO_M && u < UNDER_PER_GAP; u++) {
        const uid = UNDER_ID + id * UNDER_PER_GAP + u
        if (hash01(SEED, 50, uid) >= 1 - 0.85 * step(UNDER_FROM_M, UNDER_TO_M, reach)) continue
        const off = across + ((u + 0.5) / UNDER_PER_GAP + (hash01(SEED, 51, uid) - 0.5) * 0.3) * plantSpacingM
        if (k < edgeRows(off) - 0.5 && !(k === 0 && frontRow(off))) continue
        const back = along + (hash01(SEED, 52, uid) - 0.5) * 0.1
        under.push(-toward.x * back + right.x * off, -toward.z * back + right.z * off, meanTurn + bell(uid, 53) * 1.2, 0.5 + 0.4 * hash01(SEED, 56, uid), bell(uid, 57) * 0.09, bell(uid, 60) * 0.09, -0.9 + 0.5 * hash01(SEED, 63, uid), uid)
      }
      const away = step(20, 60, reach)
      const wide = noise(25, x * 0.035, z * 0.035)
      const thin = 0.05 * step(0.62, 0.8, noise(21, across * 0.5, depth * 0.5)) + 0.3 * away * step(0.55, 0.72, noise(27, x * 0.05, z * 0.05))
      if (!skirt && hash01(SEED, 9, id) < 0.03 + thin) continue
      const pick = hash01(SEED, 10, id)
      const patch = noise(22, x * 0.16, z * 0.16)
      const short = skirt || hash01(SEED, 15, id) < SHORT || (k === 0 && frontRow(across) && hash01(SEED, FRONT_CHANNEL, id) < FRONT_SHORT)
      const size = skirt ? SKIRT_SIZE[0] + (SKIRT_SIZE[1] - SKIRT_SIZE[0]) * hash01(SEED, 72, id) : short ? 0.45 + 0.15 * hash01(SEED, 16, id) : 0.6 + 0.2 * Math.min(1, Math.max(0, 0.5 + (patch - 0.5) * 0.9 + (wide - 0.5) * 1.4 * away + (hash01(SEED, 5, id) - 0.5) * 0.8))
      const leanX = Math.max(-0.2, Math.min(0.2, bell(id, 30) * 0.075))
      const leanZ = Math.max(-0.2, Math.min(0.2, bell(id, 33) * 0.075))
      const tone = Math.min(1, Math.max(0, (0.65 - 0.3 * away) * hash01(SEED, 8, id) + 0.35 * noise(23, x * 0.09, z * 0.09) + 0.1 * (patch - 0.5) + away * (0.15 + 0.9 * (noise(26, x * 0.03, z * 0.03) - 0.5))))
      if (reach < fieldFarM + (pick - 0.5) * FAR_BAND_M) {
        const straggler = hash01(SEED, 11, id) < STRAGGLERS
        const side = hash01(SEED, 17, id) < SIDEWAYS ? (hash01(SEED, 18, id) < 0.5 ? -1 : 1) * (1.0 + 0.6 * hash01(SEED, 19, id)) : 0
        const close = reach < fieldNearM + (pick - 0.5) * NEAR_BAND_M
        // Past the full plants one head in five has its back to the lens.
        const behind = !close && hash01(SEED, 46, id) < BEHIND
        const turn = straggler ? (hash01(SEED, 12, id) - 0.5) * 2 * Math.PI : behind ? Math.PI + bell(id, 36) * 0.6 : meanTurn + side + bell(id, 36) * TURN_SCATTER
        // Near the lens the kinds that open first are the tall ones, so the open heads are few and large.
        const tall = close && !short && AHEAD_S.near[Math.floor(hash01(SEED, 15, id) * nearVariants.length)] > 0.5
        const list = close ? near : far
        list.push(x, z, turn, tall ? 0.72 + 0.09 * hash01(SEED, 5, id) : close ? size : size - 0.05, leanX, leanZ, tone, id)
        continue
      }
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
    near.splice(at, edge.more ? 0 : PLACE, x, z, edge.turn, edge.size, 0, 0, 0.6, id)
  }
  const front: number[] = []
  FRONT.forEach((f, n) => {
    do id++
    while (kindOf(id) !== f.kind)
    const lean = (channel: number) => Math.max(-0.2, Math.min(0.2, bell(id, channel) * 0.075))
    front.push(-toward.x * f.along + right.x * f.across, -toward.z * f.along + right.z * f.across, meanTurn + f.turn, f.size, lean(30), lean(33), 0.35 + 0.5 * hash01(SEED, 8, id), id)
    for (let u = 0; u < UNDER_PER_GAP; u++) {
      const uid = UNDER_ID * 2 + n * UNDER_PER_GAP + u
      const off = f.across + ((u + 0.5) / UNDER_PER_GAP + (hash01(SEED, 51, uid) - 0.5) * 0.3) * plantSpacingM
      const back = f.along + (hash01(SEED, 52, uid) - 0.5) * 0.1
      under.push(-toward.x * back + right.x * off, -toward.z * back + right.z * off, meanTurn + bell(uid, 53) * 1.2, 0.5 + 0.3 * hash01(SEED, 56, uid), bell(uid, 57) * 0.09, bell(uid, 60) * 0.09, -0.9 + 0.5 * hash01(SEED, 63, uid), uid)
    }
  })
  made = { near: new Float32Array(near), far: new Float32Array(far), pictures: new Float32Array(pictures), under: new Float32Array(under), front: new Float32Array(front) }
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
