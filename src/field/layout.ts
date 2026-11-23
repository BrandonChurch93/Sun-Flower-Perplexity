import { config } from '../config.ts'
import { hash01, streamSeed } from '../core/random.ts'
import { gustAt, windWay } from '../v2/wind.ts'
import { heightAt, setLeafHold, setLeafTurn } from '../plant/growth.ts'
import { PLACE } from '../plant/part.ts'

export { PLACE }

const SEED = streamSeed('field')
const RAD = Math.PI / 180
// The marks of the plant's clock: where the bud stands closed, where the flower is open, where the crane starts and where growth ends.
const BUD_T = config.growth.bud
const OPEN_T = config.growth.open
const END_T = config.growth.seconds
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
// Its leaves from the foot to the middle are those of a grown plant of its height, as long as the plant's own: none of them reaches a bloom frame.
for (const leaf of [4, 5, 6, 7, 8, 9, 10, 11, 12, 13]) setLeafHold(companionVariant, leaf, { lengthScale: 1.42 })

// The kinds of neighbor, each its own plant: seven for the full plants, four for the simpler ones and the pictures made of them.
export const nearVariants = [41, 53, 67, 71, 83, 97, 113]
export const farVariants = [131, 149, 157, 173]

// Every kind of neighbor runs on the plant's clock, each a little behind it or ahead of it, so no two kinds are at the same stage.
// While the crop is young every kind is behind the plant, which stands in the open. Through the bloom a few open with it and most are still buds;
// by the last frame all have caught up. Each clock only ever runs forward.
export type Tier = 'near' | 'far' | 'pictures'
const AHEAD_T: Record<Tier, number[]> = {
  near: [-4.5, -0.6, 0.8, -1.5, -3.5, 0.4, -2.5],
  far: [-4.5, 1.5, -3, -4],
  pictures: [-4.6, -2.5, -4.2, -3.5],
}
const EARLY_T = 3
const ramp = (a: number, b: number, t: number): number => {
  const x = Math.min(1, Math.max(0, (t - a) / (b - a)))
  return x * x * (3 - 2 * x)
}
export const opensEarly = (index: number, tier: Tier): boolean => AHEAD_T[tier][index] >= EARLY_T
const BEHIND_T: Record<Tier, number[]> = {
  near: [-3.4, -1.5, -4.2, -2.4, -1.0, -3.0, -2.0],
  far: [-2.0, -3.8, -1.2, -3.0],
  pictures: [-3.2, -1.4, -2.4, -4.0],
}
// The age of the middle of the field, for the height its tops stand at.
// As seedlings the rows are close behind the plant; they fall back as it shoots up, and catch up by the bud.
const youngLag = (time: number): number => ramp(1.5, 9, time) * (0.35 + 0.65 * ramp(12, 20, time)) * (1 - ramp(36, BUD_T + 2.5, time))
export const fieldAge = (time: number): number => time - 2.4 * youngLag(time)
// One kind of the near rows is a slow grower: it falls further and further behind and is still in bud when the rest of the field is open.
const SLOW_KIND = 4
const SLOW_T = -12.5
export const kindTime = (time: number, index: number, tier: Tier): number =>
  time +
  BEHIND_T[tier][index] * youngLag(time) +
  (tier === 'near' && index === SLOW_KIND ? SLOW_T * ramp(30, 57, time) : AHEAD_T[tier][index] * ramp(BUD_T - 3.5, OPEN_T - 1, time) * (1 - ramp(56, END_T, time)))

// Young, every neighbor is nearly as tall as the plant. The rows are sown thick and stop sooner: each keeps the height it has
// while the plant, out in the open, goes on to its own. From the bloom on a neighbor has its own size.
export const SETTLED_T = 45
const KNEE = 12
export const SIZE_KNEE = KNEE
const softMin = (a: number, b: number): number => -Math.log(Math.exp(-KNEE * a) + Math.exp(-KNEE * b)) / KNEE
// After the bud the lead is given up more slowly than the neighbors still grow, so none of them gets shorter while it goes.
const SETTLE_SLOW = 0.5
const SETTLE_FROM_T = BUD_T - 0.4
export const plantAhead = (time: number): number => Math.min(4, Math.max(1, heightAt(SETTLED_T) / Math.max(heightAt(time <= SETTLE_FROM_T ? time : SETTLE_FROM_T + (time - SETTLE_FROM_T) * SETTLE_SLOW), 0.001)))
// The plant towers over a young field. As seedlings the rows are its size; in the storm they stand at half of it and close into one band,
// and on the way up to the bud they stay under the lens that rises with the plant. By the bud they have their full size.
// Each pair is a mark of the plant's clock and the share of its full height the tallest neighbor stands at.
const STAND: [number, number][] = [[9, 1], [12, 0.66], [16, 0.56], [20, 0.52], [23.1, 0.505], [25.35, 0.462], [29.2, 0.405], [30.03, 0.41], [31.19, 0.5], [32.35, 0.62], [33.5, 0.72], [34.66, 0.76], [38.14, 0.8], [41.6, 0.84], [BUD_T, 1]]
// While the field is low its plants are nearly of a height: how much of each one's own size shows, as a power of it.
const EVEN_LOW = 0.12
const EVEN_FROM_T = 29.2
export const SHARE_LOW = 0.05
const EVEN_STORM = 0.07
const EVEN: [number, number][] = [[9, 1], [12, EVEN_LOW], [20, EVEN_STORM], [23.1, EVEN_STORM], [28.6, EVEN_LOW], [EVEN_FROM_T, EVEN_LOW]]
// A curve through the marks that never turns back between two of them.
function curve(marks: [number, number][]): (time: number) => number {
  const n = marks.length
  const d = marks.slice(1).map((p, i) => (p[1] - marks[i][1]) / (p[0] - marks[i][0]))
  const m = marks.map((_, i) => (i === 0 || i === n - 1 ? 0 : d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2))
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) {
      m[i] = 0
      m[i + 1] = 0
      continue
    }
    const a = m[i] / d[i]
    const b = m[i + 1] / d[i]
    const r = Math.hypot(a, b)
    if (r > 3) {
      m[i] = (3 * a * d[i]) / r
      m[i + 1] = (3 * b * d[i]) / r
    }
  }
  return (time: number): number => {
    if (time <= marks[0][0]) return marks[0][1]
    if (time >= marks[n - 1][0]) return marks[n - 1][1]
    let i = 0
    while (time > marks[i + 1][0]) i++
    const h = marks[i + 1][0] - marks[i][0]
    const t = (time - marks[i][0]) / h
    const t2 = t * t
    const t3 = t2 * t
    return (2 * t3 - 3 * t2 + 1) * marks[i][1] + (t3 - 2 * t2 + t) * h * m[i] + (-2 * t3 + 3 * t2) * marks[i + 1][1] + (t3 - t2) * h * m[i + 1]
  }
}
export const standAt = curve(STAND)
const evenEarly = curve(EVEN)
// Past the storm it is tied to how tall the field stands, so a neighbor cannot get shorter while the rest catch up.
export const evenAt = (time: number): number =>
  time <= EVEN_FROM_T ? evenEarly(time) : time >= BUD_T ? 1 : EVEN_LOW + (1 - EVEN_LOW) * Math.min(1, Math.max(0, Math.log(standAt(time) / standAt(EVEN_FROM_T)) / Math.log(1 / standAt(EVEN_FROM_T))))
// The rows nearest the plant are the tallest of the young field: by how much the far ones are shorter.
export const farShortAt = (time: number): number => 0.05 * ramp(9, 14, time) * (1 - ramp(36, BUD_T, time))
// What a neighbor's size is multiplied by: `share` is its height as a share of the plant's, `reach` how far from the plant it stands.
export const standOf = (share: number, reach: number, stand: number, even: number, farShort: number): number =>
  stand * Math.pow(Math.max(share, SHARE_LOW), even - 1) * (1 - farShort * step(2, 9, reach))
// Before the bloom the rows are uneven: the plants in poorer ground are well behind, and catch up as the buds fill.
export const lagAt = (time: number): number => 0.3 * ramp(12, 22, time) * (1 - ramp(35, 40, time))
export const youngOf = (tone: number, lag = 0): number => 0.9 + 0.1 * tone - lag * (1 - step(0.25, 0.55, tone))
export const sizeAt = (size: number, young: number, ahead: number): number => size * (softMin(young / size, ahead) - softMin(young / size, 1) + 1)
// The young crop stands a little short of its age, and loses that as it shoots up.
export const squatAt = (time: number): number => 0.05 * (1 - ramp(27, 35.5, time))
// In the thick of the rows a young leaf hangs outward from its stalk; by the bud it is held as the plant holds its own.
export const hangAt = (time: number): number => 0.3 * ramp(14, 24, time) * (1 - ramp(30, 38, time))
// The seedlings are broad: each spreads its leaves over the open ground before the rows close.
export const wideAt = (time: number): number => 0.25 * ramp(6, 11, time) * (1 - ramp(16, 24, time))
// From the crane's start the heads are heavy and every neighbor goes its own way: `late` is how far that has come.
// A neighbor's own turn, its height, the size of its head and how far the head nods.
export const lateAt = (time: number): number => ramp(OPEN_T - 3, 57, time)
// Before the bloom every neighbor is its own: how far it has come, how long its stalk and its leaves are, how its leaves hang, which way it leans. Out by the bloom's start.
// As the crop fills out the leaves are held out stiff, none hangs far, and every leaf reaches a third farther.
export const STIFF_LEAF = 0.3
export const stiffAt = (time: number): number => ramp(28, 34, time)
export const earlyAt = (time: number): number => 1 - ramp(35.5, 40, time)
// How far behind a neighbor is shows while the rows are open: by the frost the crop has closed and the laggards have caught up.
export const behindAt = (time: number): number => 1 - ramp(27, 35.5, time)
const handSet = new Set<number>()
// At the low quality the simpler plants thin out with distance: which of them go first, 0 to 1, for good.
export const thinOrder = (id: number): number => hash01(SEED, 170, id)
export interface Own { turn: number; tall: number; head: number; nod: number; low: number; young: number; stalk: number; leaf: number; droop: number; bud: number; leanX: number; leanZ: number }
export function ownOf(id: number): Own {
  // The neighbors set by hand keep their turn and their height: only their heads differ.
  if (handSet.has(id)) return { turn: 0, tall: 1, head: 0.85 + 0.2 * hash01(SEED, 117, id), nod: 0.15 + 0.5 * hash01(SEED, 87, id), low: 0, young: 1, stalk: 0.9 + 0.25 * hash01(SEED, 101, id), leaf: 0.85 + 0.3 * hash01(SEED, 102, id), droop: 0.5 * hash01(SEED, 103, id), bud: 1.1 + 0.4 * hash01(SEED, 108, id), leanX: 0, leanZ: 0 }
  // One in twelve is far behind, a gap in its row; one in twenty five is bent well over.
  const young = hash01(SEED, 100, id) < 0.085 ? 0.35 + 0.25 * hash01(SEED, 104, id) : 0.84 + 0.26 * hash01(SEED, 104, id)
  const way = hash01(SEED, 105, id) * 2 * Math.PI
  const lean = hash01(SEED, 106, id) < 0.04 ? 0.25 + 0.2 * hash01(SEED, 107, id) : 0.12 * hash01(SEED, 107, id)
  const off = hash01(SEED, 80, id) < 0.4 ? (hash01(SEED, 81, id) < 0.5 ? -1 : 1) * (0.5 + 0.55 * hash01(SEED, 82, id)) : (hash01(SEED, 81, id) < 0.5 ? -1 : 1) * (0.12 + 0.33 * hash01(SEED, 82, id))
  return { turn: off, tall: 0.85 + 0.25 * hash01(SEED, 83, id), head: 0.75 + 0.4 * hash01(SEED, 117, id), nod: hash01(SEED, 154, id) < 0.3 ? 1.0 + 0.45 * hash01(SEED, 87, id) : 0.2 + 0.9 * Math.pow(hash01(SEED, 87, id), 1.2), low: 0, young, stalk: 0.82 + 0.33 * hash01(SEED, 101, id), leaf: 0.75 + 0.5 * hash01(SEED, 102, id), droop: -0.15 + 0.75 * hash01(SEED, 103, id), bud: 1.0 + 0.7 * hash01(SEED, 108, id), leanX: Math.cos(way) * lean, leanZ: Math.sin(way) * lean }
}
// Every neighbor wears its leaves its own way round its stem, for good: the same kind is never seen twice from the same side. Those set by hand keep theirs, as do the three that stand clear under the moon.
export const leafSpin = (id: number): number => (handSet.has(id) ? 0 : 2 * Math.PI * hash01(SEED, 121, id))
// Late in the bloom the stalk under a heavy head has gone on growing past its last leaves: each neighbor has its own length of bare neck.
export const leafShort = (id: number): number => (handSet.has(id) ? 0 : 0.2 * Math.pow(hash01(SEED, 122, id), 1.5))
// Under a heavy head no stalk stays plumb: from the field's start every neighbor comes to stand off its line its own way, most by 1 to 5 degrees, one in ten by 6 to 9.
// Those set by hand stand as they stood.
export function lateLean(id: number): { x: number; z: number } {
  if (handSet.has(id)) return { x: 0, z: 0 }
  const way = 2 * Math.PI * hash01(SEED, 151, id)
  const lean = hash01(SEED, 152, id) < 0.1 ? 0.1 + 0.05 * hash01(SEED, 153, id) : 0.02 + 0.07 * hash01(SEED, 153, id)
  return { x: Math.cos(way) * lean, z: Math.sin(way) * lean }
}
// Open and heavy, the heads of a field face the morning for good: east, each a little differently, so a lens that looks into the evening sun sees
// most of them from the side or from three quarters and some from behind. One in six faces its own way.
const FACE_EAST = 84 * RAD
export const faceToward = (id: number): number => (hash01(SEED, 156, id) < 0.16 ? 2 * Math.PI * hash01(SEED, 155, id) : FACE_EAST + 0.5 * bell(id, 157))
// How far a head has come round to that side, by its own clock: a bud stands as it grew, an open head has settled.
export const settled = (clock: number, id: number): number => settledBy(clock, settleOf(id))
export const settleOf = (id: number): number => hash01(SEED, 41, id)
export const settledBy = (clock: number, own: number): number => ramp(BUD_T - 1.5 + 2 * own, OPEN_T - 1.5 + 2 * own, clock)
// The middle and far rows lift their heads from their hang and fill out to the size of the larger heads.
export const faceAt = (id: number, reach: number): number => (hash01(SEED, 156, id) < 0.1 ? 0 : step(9, 17, reach))
export const shortWay = (turn: number): number => turn - 2 * Math.PI * Math.round(turn / (2 * Math.PI))
// The two a head's own shape needs, as one number: the nod in 64ths of a radian, whole, and half the size of the head after the point.
export const ownCode = (own: Own, nod = 0, face = 0): number => Math.max(0, Math.round((own.nod + nod - face * 0.7 * Math.max(own.nod - 0.2, 0)) * 64)) + (own.head + face * 0.6 * (1.15 - own.head)) * 0.5
// Before the bloom the same slot carries the stalk, the leaves, their droop and the bud, 32 steps each.
const steps = (v: number, from: number, to: number): number => Math.min(31, Math.max(0, Math.round(((v - from) / (to - from)) * 31)))
export const earlyCode = (own: Own, bud = own.bud, leaf = own.leaf, droop = own.droop): number => steps(own.stalk, 0.75, 1.3) + 32 * steps(leaf, 0.75, 1.6) + 1024 * steps(droop, -0.15, 0.6) + 32768 * steps(bud, 0.8, 2.6)
// Late in the bloom the leaves use the same slot for their own: how far each neighbor's leaves reach and how far they hang. Its stalk stays as it is.
export const lateLeafCode = (id: number): number => (handSet.has(id) ? steps(1, 0.75, 1.3) + 32 * steps(1, 0.75, 1.6) + 1024 * steps(0, -0.15, 0.6) : steps(1, 0.75, 1.3) + 32 * steps(0.78 + 0.62 * hash01(SEED, 123, id), 0.75, 1.6) + 1024 * steps(-0.12 + 0.66 * Math.pow(hash01(SEED, 124, id), 1.3), -0.15, 0.6))
export const sizeGlsl = /* glsl */ `
uniform float uLag;float softMin(float a, float b) { return -log(exp(-${KNEE.toFixed(1)} * a) + exp(-${KNEE.toFixed(1)} * b)) / ${KNEE.toFixed(1)}; }
float sizeAt(float size, float tone, float ahead) {
  float a = (0.9 + 0.1 * tone - uLag * (1.0 - smoothstep(0.25, 0.55, tone))) / size;
  return size * (softMin(a, ahead) - softMin(a, 1.0) + 1.0);
}
`

// How far a stem leans under the wind at full strength, as a slope: a steady lean and the gust on top of it.
export const LEAN_STEADY = 0.08
export const LEAN_GUST = 0.56
export interface Blown { x: number; z: number; head: number; leaves: number; nod: number }
const blown: Blown = { x: 0, z: 0, head: 0, leaves: 0, nod: 0 }
// What the wind does to one neighbor: it is pushed over as the front strikes, shakes while it is held, and swings back on a period of its own; its head and its leaves turn with it, each its own way.
export const blownOf = (id: number, x: number, z: number, seconds: number, wind: number, leafWind: number): Blown => blownBy(windOf(id, 0), windOf(id, 1), windOf(id, 2), x, z, seconds, wind, leafWind)
// A neighbor's three numbers for the wind: they never change, so they are worked out once.
export const windOf = (id: number, which: number): number => hash01(SEED, 141 + which, id)
export function blownBy(a: number, b: number, c: number, x: number, z: number, seconds: number, wind: number, leafWind: number): Blown {
  const g = gustAt(x, z, seconds - 0.25 * a)
  const turn = 2 * Math.PI
  const shake = Math.sin(turn * (seconds / (0.9 + 0.8 * b) + c))
  const quick = Math.sin(turn * (seconds / (0.31 + 0.2 * c) + a))
  const lean = wind * (0.7 + 0.6 * b) * (LEAN_STEADY + LEAN_GUST * g + 0.045 * shake * (0.35 + g))
  const way = (c - 0.5) * 0.5 + 0.25 * shake * g
  const cw = Math.cos(way)
  const sw = Math.sin(way)
  const side = a < 0.5 ? -1 : 1
  blown.x = (cw * windWay.x - sw * windWay.z) * lean
  blown.z = (sw * windWay.x + cw * windWay.z) * lean
  blown.head = wind * side * (0.6 * g + 0.12 * shake)
  blown.leaves = leafWind * (b < 0.5 ? -1 : 1) * (0.75 * g + 0.15 * quick * (0.4 + g))
  blown.nod = wind * (0.3 * g + 0.06 * shake)
  return blown
}

// Full plants to here, simpler ones to the next, pictures of plants to the last row, where the field ends on a straight edge.
// A carpet closes the tops over the last rows.
export const fieldNearM = 12
// The size the tops of the crop stand at: the light and the sky a neighbor keeps are counted down from there.
export const CANOPY_SIZE = 0.65
export const fieldFarM = 40
export const fieldPicturesM = 66
const NEAR_BAND_M = 4
const FAR_BAND_M = 12
export const carpetBandM = 26

// Two turns of each simpler kind are drawn as pictures.
export const pictureTurns = 2
export const pictureCount = farVariants.length * pictureTurns

// A neighbor stands turned its own way round its stem. Its head comes round to the east as it opens.
export const meanTurn = 0.25
const TURN_SCATTER = 0.8
const SIDEWAYS = 0.2
// How tall the neighbors stand at one moment of the plant's clock, and the size of one of them: what its copy of the plant is multiplied by.
export interface Stature { ahead: number; lag: number; uneven: number; behind: number; stand: number; even: number; farShort: number; plantTall: number; young: boolean }
export function statureAt(time: number, into: Stature = { ahead: 1, lag: 0, uneven: 0, behind: 0, stand: 1, even: 1, farShort: 0, plantTall: 1, young: false }): Stature {
  into.ahead = plantAhead(time)
  into.lag = lagAt(time)
  // From knee height on no two neighbors stand as tall: the spread of their heights comes in as they grow.
  into.uneven = Math.max(lateAt(time), ramp(14, 30, time))
  into.behind = behindAt(time)
  into.stand = standAt(time)
  into.even = evenAt(time)
  into.farShort = farShortAt(time)
  into.plantTall = Math.max(heightAt(time), 1e-4)
  into.young = into.stand < 1 || into.even < 1 || into.farShort > 0
  return into
}
// `kindTall` is the height of the neighbor's kind at its own clock, `reach` how far from the plant it stands.
export function sizeOf(s: Stature, size: number, tone: number, own: Own, kindTall: number, reach: number): number {
  // A kind on a slower clock keeps its lead by its own height, not the plant's: so its lead never goes faster than it grows.
  const ahead = Math.max(s.ahead, Math.min(4, heightAt(SETTLED_T) / Math.max(kindTall, 0.001)))
  const full = sizeAt(size, youngOf(tone, s.lag), ahead) * (1 + s.uneven * (own.tall - 1)) * (1 + s.behind * (own.young - 1))
  return s.young ? full * standOf((full * kindTall) / s.plantTall, reach, s.stand, s.even, s.farShort) : full
}
const BEHIND = 0.22
const SHORT = 0.1
const STRAGGLERS = 0.05
const SKIRT_GAPS = 0.25
const SKIRT_SIZE = [0.4, 0.46]
const UNDER_FROM_M = 7
const UNDER_TO_M = 18
const UNDER_PER_GAP = 2
const UNDER_ID = 1000000
// How far along its line a row starts behind the front edge, in plants.
const ROW_STEP = 1
// Each kind of picture is drawn twice, no two heads facing the same way: most to the east and its sides, one to the west with its back to the morning.
const PICTURE_FACES_DEG = [[62, 98], [80, 128], [104, 38], [72, 232]]
export const pictureFace = (kind: number, turn: number): number => PICTURE_FACES_DEG[kind][turn] * RAD

// The field is a wedge that opens away from the plant, wider on the west, where the lens of the last shot looks.
// `depth` is measured from the plant against `toward`, `across` along `right`: east is positive.
const WEST = { baseM: 13, slope: 1.8 }
const EAST = { baseM: 10, slope: 1.05 }
export const fieldWest = (depth: number): number => WEST.baseM + WEST.slope * depth
export const fieldEast = (depth: number): number => EAST.baseM + EAST.slope * depth
// Past the last row of plants the tops go on as pictures, ever fewer, and as one carpet that stands whole to where the land takes over and frays only in its last rows.
export const fieldThinM = 112
export const fieldEndM: [number, number] = [272, 290]

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
  // A row is a line that runs away from the plant. A lane, not a row, lies on the plant's own axis, and no two rows start in step.
  for (let k = 0; plantAheadOfRowM + k * plantSpacingM <= fieldThinM; k++) {
    const sown = plantAheadOfRowM + k * plantSpacingM
    for (let n = Math.ceil(-fieldWest(sown) / rowSpacingM - 0.5); n <= Math.floor(fieldEast(sown) / rowSpacingM - 0.5); n++) {
      id++
      const depth = sown + ROW_STEP * hash01(SEED, 1, n + 100000) * plantSpacingM
      // How many old rows of depth lie between the front edge and this plant.
      const k0 = (depth - plantAheadOfRowM) / rowSpacingM
      // Past the last full row the pictures thin out: most of them at first, one in four at the end.
      if (depth > fieldPicturesM && hash01(SEED, 6, id) > 0.85 - 0.6 * step(fieldPicturesM, fieldThinM, depth)) continue
      // A plant stands a hand off its line at most, so a row can be followed to the far end of the field.
      const out = Math.hypot(depth, (n + 0.5) * rowSpacingM)
      const across = (n + 0.5) * rowSpacingM + (hash01(SEED, 2, id) - 0.5) * (0.1 + 0.08 * step(8, 40, out))
      const along = depth + (hash01(SEED, 3, id) - 0.5) * (0.12 + 0.2 * step(fieldFarM + FAR_BAND_M, fieldFarM + 30, out))
      // Before the edge the crop is thin and stays short: a skirt of low plants, far under the plant's head when it opens.
      const skirt = k0 < edgeRows(across) - 0.5 && !(k0 < 0.5 && frontRow(across))
      if (skirt && hash01(SEED, 71, id) < SKIRT_GAPS) continue
      const x = -toward.x * along + right.x * across
      const z = -toward.z * along + right.z * across
      const reach = Math.hypot(x, z)
      // A crop sown thick: in the first rows a shorter plant stands in every gap of the row, in the shade of the tall ones, so there are leaves at every height.
      for (let u = 0; !skirt && reach < UNDER_TO_M && u < UNDER_PER_GAP; u++) {
        const uid = UNDER_ID + id * UNDER_PER_GAP + u
        if (hash01(SEED, 50, uid) >= 1 - 0.85 * step(UNDER_FROM_M, UNDER_TO_M, reach)) continue
        const off = across + (hash01(SEED, 52, uid) - 0.5) * 0.1
        const back = along + ((u + 0.5) / UNDER_PER_GAP + (hash01(SEED, 51, uid) - 0.5) * 0.3) * plantSpacingM
        under.push(-toward.x * back + right.x * off, -toward.z * back + right.z * off, meanTurn + bell(uid, 53) * 1.2, 0.5 + 0.4 * hash01(SEED, 56, uid), bell(uid, 57) * 0.09, bell(uid, 60) * 0.09, -0.9 + 0.5 * hash01(SEED, 63, uid), uid)
      }
      const away = step(20, 60, Math.min(reach, 60))
      const wide = noise(25, x * 0.035, z * 0.035)
      const thin = 0.05 * step(0.62, 0.8, noise(21, across * 0.5, depth * 0.5)) + 0.3 * away * step(0.55, 0.72, noise(27, x * 0.05, z * 0.05))
      if (!skirt && hash01(SEED, 9, id) < 0.03 + thin) continue
      const pick = hash01(SEED, 10, id)
      const patch = noise(22, x * 0.16, z * 0.16)
      const short = skirt || hash01(SEED, 15, id) < SHORT || (k0 < 0.5 && frontRow(across) && hash01(SEED, FRONT_CHANNEL, id) < FRONT_SHORT)
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
        const tall = close && !short && AHEAD_T.near[Math.floor(hash01(SEED, 15, id) * nearVariants.length)] > 0.5
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
    while (kindOf(id) !== edge.kind)
    near.splice(at, edge.more ? 0 : PLACE, x, z, edge.turn, edge.size, 0, 0, 0.6, id)
    handSet.add(id)
  }
  const front: number[] = []
  FRONT.forEach((f, n) => {
    do id++
    while (kindOf(id) !== f.kind)
    handSet.add(id)
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
