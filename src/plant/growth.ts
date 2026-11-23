import { config } from '../config.ts'
import { Monotone, clamp, lerp, smootherstep, smoothstep } from '../core/curves.ts'
import { combine, hash01, streamSeed } from '../core/random.ts'
import { STEM_LEAN, STEM_SWING, firstWay, restless, squall, sway, swell as swellOf, windToward } from './wind.ts'
import { norm } from './norm.ts'

// What the world asks of the plant. The plant never knows which world it is in.
export interface PlantInputs {
  // Where the growing tip leans: the level part of the direction to the sun a moment ago, times how hard the plant follows it.
  leanX: number
  leanZ: number
  // The light the top leaves feel, 0 to 1: they stand in it and hang without it.
  lift: number
  // How hard the air moves the light parts, the leaves and the rays. 0 is still air.
  wind: number
  // The steady wind the heavy parts follow, the stem and the far rows. Left out, or more than `wind`, it is `wind`.
  calm?: number
  // The film second. Wind, drops and twitches run on it and never on the plant's clock. Left out, the air stands still.
  real?: number
  // The light the lowest leaves feel: the same as `lift`, a moment later, so a change runs down the plant.
  liftLow?: number
  // How fast the days run, 0 real time to 1 the fastest time lapse: the leaves are restless in a time lapse.
  lapse?: number
  // How much of a time lapse's restlessness is in the shape, 0 to 1: all of it when left out. The film lays none and draws it where the plant is drawn, so a laying differs from the next by growth and air alone.
  twitch?: number
  // 0 to 1: frost in the tissue. The leaves stand lower, cupped and stiff.
  cold?: number
  // 0 to 1: drops falling on the leaves.
  rain?: number
  // 0 to 1: a storm's gusts, over and above the steady wind.
  gust?: number
  // The stem is measured and the lens is aimed on the plant at rest, so the lean and the air move it inside a frame that holds still.
  steady?: boolean
  // 0 to 1: the plant's clock stands. The air then moves the plant where it is drawn, on the film second, and nothing of its shape is filled again.
  held?: number
  // The film second at which the plant's clock stopped, while it stands. Water that sits on the plant is laid as of then.
  stood?: number
}

// The film second the air moves by, and the inputs of still air and even light, which the stem is measured in and the lens is aimed by.
export const realOf = (inputs: PlantInputs, time: number): number => inputs.real ?? time
export const REST: PlantInputs = { leanX: 0, leanZ: 0, lift: 1, wind: 0 }

export interface Vec3 { x: number; y: number; z: number }

const SEED = streamSeed('plant')

// Which plant is being asked about. 0 is the plant. Any other number is a neighbor with its own small differences.
let variant = 0
let seedNow = SEED

// Where that plant stands, for the wind that reaches it. Null for a shape drawn once per neighbor: the field sways those itself.
let standsAt: Place | null = { x: 0, z: 0 }
export interface Place { x: number; z: number }
const ORIGIN: Place = { x: 0, z: 0 }

export function usePlant(v: number, at: Place | null = ORIGIN): void {
  variant = v
  seedNow = v === 0 ? SEED : combine(SEED, v)
  standsAt = at
}

export function plantVariant(): number {
  return variant
}

const rnd = (i: number, j = 0): number => hash01(seedNow, i, j)
const TAU = Math.PI * 2
const FPS = config.film.fps
// How far a storm's gust bends the stem at its top, in radians: with the wind, the spring back, and across the wind.
export const GUST_LEAN = 0.3
// How far the water lying on a blade lets it hang for as long as it rains, in radians.
export const RAIN_WEIGHT = 0.1
const GUST_SPRING = 0.5
const GUST_ACROSS = 0.025
// How far a head hangs back behind its stem in moving air, in radians for each unit of the stem's swing, and how late it is, in seconds.
const HEAD_NOD = 0.5
const HEAD_LATE_S = 0.3
const RAD = Math.PI / 180
const heightCurve = new Monotone(config.plant.heightM)

const [emerge0, emerge1] = config.plant.stages.emerge
const [seed0, seed1] = config.plant.stages.seedLeaves
const [leaves0, leaves1] = config.plant.stages.leaves
const [bud0, bud1] = config.plant.stages.bud
const [bloom0, bloom1] = config.plant.stages.bloom
const inStage = (a: number, b: number, f: number) => a + (b - a) * f
// Marks on the plant's own clock: the plant is set from SET_S, its bud is formed at BUDDED_S and it begins to open at BLOOM_S. LEAFY_S and STOUT_S are where the young plant is leafy and where its shoot is stoutest.
const SET_S = 20
const BUDDED_S = 30
const BLOOM_S = 40
const LEAFY_S = 14
const STOUT_S = 36
// From here the open head only settles.
const SETTLE_S = config.growth.crane
// How far an old leaf of the open plant has settled below where it opened, in degrees, and the share of its hang in the dark that it keeps.
const SETTLE_OPEN = 8
const DARK_OPEN = 0.5

export const leafCount = config.plant.leafCount
export const rayCount = config.plant.rayFlorets
export const bractCount = 21
const goldenRad = config.plant.goldenAngleDeg * RAD
const NUTATION_SECONDS = 3.7
// The seedling's own quick circle. The plant's phase puts the dawn's two keys and the rain's key where the tip crosses the middle, so the judged frames keep their pose.
const DANCE_SECONDS = 2.5
const DANCE_PHASE = 0.4
const INTERNODE_SECONDS = 4
const OPPOSITE_LEAVES = 6
const STACK_SECONDS = 5.5
const CROWD_START = SET_S
const CROWD_END = BLOOM_S
const CROWD_SECONDS = 1.5
const CROWD_TIP = 0.006
const CROWD_STEP = 0.012
const CROWD_SPREAD = 0.003
const CROWD_PACE = 0.3
const CROWD_LEAVES = 6
const HOOK_MAX = 164 * RAD
const HOOK_BACK = 0.3
const discRadius = config.plant.discDiameterM / 2
const rayFull = (config.plant.headDiameterM - config.plant.discDiameterM) / 2

// The top of the whole plant: the arch of the hook, then the leaf tips, then the bracts, then the petals.
// The sprout has a head start of five frames when the film opens, so the pale arch stands in the cleft in the first frame; it is gone by 1.4 s.
export const headStartSeconds = 1 / 6
export function heightAt(time: number): number {
  return heightCurve.at(time + headStartSeconds * (1 - smoothstep(0, 1.4, time)))
}

// A sprout is 2.4 mm through and thickens fast once its leaves work. From 40.3 s, when the youngest neighbor in the bloom is that old, the girth is the old curve to the last bit.
export function stemBaseRadius(time: number): number {
  const h = heightAt(time)
  const full = 0.0016 + 0.0145 * Math.pow(smoothstep(0.03, 1.7, h), 0.8)
  const settled = smoothstep(BUDDED_S, 40.3, time)
  if (settled >= 1) return full
  const lean = 1 - 0.14 * smoothstep(15, 24, time) * (1 - smoothstep(28, 36.5, time))
  return lerp(0.0012 + 0.0149 * Math.pow(smoothstep(0.05, 1.7, h), 0.45), full, settled) * lean
}

export function stemRadius(time: number, u: number): number {
  // Until the head is set the top of the stem is a slender shoot: it fills out under the bud in the last days before the bloom.
  const taper = 0.12 + 0.16 * smoothstep(0.05, 0.6, heightAt(time)) + 0.36 * smoothstep(LEAFY_S, STOUT_S, time) * (1 - smoothstep(36.5, 40.3, time))
  const slim = 0.18 * smoothstep(15, 24, time) * (1 - smoothstep(28, 36.5, time))
  const base = stemBaseRadius(time)
  return base * (1 - taper * Math.pow(u, 1.5)) * (1 - slim * smoothstep(0.67, 0.78, u)) * shootTip(time, u, base * (1 - taper) * (1 - slim))
}

// While the plant has true leaves and no bud, its stem does not end as a cut pipe: the last stretch, 2.6 times as long as the stem is thick there, narrows to the growing point between the youngest leaves. The stem fills out again over the four seconds in which the wrapped bud comes out of its end.
const TIP_END = 0.35
const TIP_REACH = 2.6
const TIP_OF_HEIGHT = 0.78
function shootTip(time: number, u: number, top: number): number {
  const on = smoothstep(leafBirth(0), leafBirth(0) + 2, time) * (1 - smoothstep(SET_S, SET_S + 4, time))
  if (on <= 0) return 1
  const reach = (TIP_REACH * top) / Math.max(TIP_OF_HEIGHT * heightAt(time), 1e-6)
  const under = Math.min(1, (1 - u) / reach)
  return 1 - on * (1 - TIP_END) * (1 - under) * (1 - under)
}

// How much of the stem is still under the soil, in meters. The arch is as large under the ground as over it: it comes up through the soil in three heaves, held and let go, and does not grow from a small arch into a large one.
const SUNK_M = 0.011
const HEAVES = [[0, 0.24, 0.3], [0.34, 0.6, 0.3], [0.7, 1.02, 0.4]]
export function stemSunk(time: number): number {
  let up = 0
  for (const [from, to, share] of HEAVES) up += share * smoothstep(from, to, time)
  return SUNK_M * (1 - up)
}

// The seedling comes up as an arch and straightens once it is in the light.
export function hookAngle(time: number): number {
  const settle = 5 * RAD * smoothstep(seed0 + 0.9, seed0 + 1.5, time) * (1 - smoothstep(seed0 + 1.5, seed0 + 2.6, time))
  return HOOK_MAX * (1 - smootherstep(inStage(emerge0, emerge1, 0.55), seed0 + 1.5, time)) - settle
}

export function hookShare(time: number): number {
  return lerp(0.92, 0.34, smoothstep(emerge0, inStage(emerge0, emerge1, 0.5), time)) * lerp(1, 0.5, smoothstep(inStage(emerge0, emerge1, 0.55), seed0 + 1.2, time))
}

export function paleness(time: number): number {
  return 1 - smoothstep(inStage(emerge0, emerge1, 0.35), inStage(seed0, seed1, 0.4), time)
}

// The bud body grows into the disc.
const bodyCurve = new Monotone([
  [bud0, 0],
  [inStage(bud0, bud1, 0.053), 0.009],
  [inStage(bud0, bud1, 0.263), 0.02],
  [inStage(bud0, bud1, 0.579), 0.037],
  [inStage(bud0, bud1, 0.79), 0.054],
  [inStage(bud0, bud1, 0.947), 0.061],
  [inStage(bloom0, bloom1, 0.25), discRadius * 0.825],
  [inStage(bloom0, bloom1, 0.5), discRadius * 0.9],
  [inStage(bloom0, bloom1, 0.75), discRadius * 0.965],
  [inStage(bloom0, bloom1, 0.9375), discRadius],
])

// A neighbor carries a smaller head than the plant. Its bud swells like the plant's until it has the size its own head starts the bloom's unit with, and waits there.
const NEIGHBOR_HEAD = 0.7
const headScale = (): number => (variant === 0 ? 1 : NEIGHBOR_HEAD)
const NEIGHBOR_HELD = NEIGHBOR_HEAD * bodyCurve.at(BLOOM_S)

export function bodyRadius(time: number): number {
  const body = bodyCurve.at(time)
  return variant === 0 ? body : Math.max(NEIGHBOR_HEAD * body, Math.min(body, NEIGHBOR_HELD))
}

// The director may keep one neighbor's head young, as a later sowing is: past the second given, its bracts, rays and disc stay as they were then.
// The stem under it goes on as before, so nothing else of that plant moves. The plant itself is never kept.
const headKeeps = new Map<number, number>()
export function setHeadKeep(v: number, second: number | null): void {
  if (second === null) headKeeps.delete(v)
  else headKeeps.set(v, second)
}
// The stem is measured against the head the plant would have had unkept: a kept head sits on the same stem, under the same leaves.
let measuring = false
export function measureStem(on: boolean): void {
  measuring = on
}
const headTime = (time: number): number => (variant === 0 || measuring ? time : Math.min(time, headKeeps.get(variant) ?? time))

export function headOpen(time: number): number {
  return smootherstep(inStage(bloom0, bloom1, 0.06), inStage(bloom0, bloom1, 0.82), headTime(time))
}

const tiltStart = bloom0 - 3
const turnStart = inStage(bloom0, bloom1, 0.25)
const turnEnd = inStage(bloom0, bloom1, 0.9375)
const depthShare = new Monotone([
  [bud0, 0.85],
  [bloom0, 0.82],
  [turnStart, 0.8],
  [turnEnd, 0.375],
])
const neckLength = new Monotone([
  [tiltStart, 0.07],
  [turnStart, 0.07],
  [turnEnd, 0.17],
  [config.growth.seconds, 0.2],
])

// The bud is a ball. It flattens into the disc as it opens.
export function bodyHalfDepth(time: number): number {
  return bodyRadius(time) * depthShare.at(time)
}
// The open head fills with seed and bows: where its face points at the end, in degrees above the level.
const HEAD_BOWED = -3
const elevationCurve = new Monotone([
  [tiltStart, 90],
  [turnStart, 34],
  [turnEnd, 9],
  [config.growth.seconds, HEAD_BOWED],
])
const FACE_AZIMUTH = (config.field.companion.fromAzimuthDeg - 12) * RAD
const EARLY_TURN = 6 * RAD
// Where round the head the first rays open, an angle from the head's `p` toward `q`.
export const RAY_FIRST = 2.8
// How long a shut ray is, as a share of its open length.
const RAY_SHUT = 0.85
const BRACT_LONGEST = 0.085

// The head stands upright as a bud, then leans over to the side it will face for good. It never turns back.
export function headElevation(time: number): number {
  return elevationCurve.at(time) * RAD
}

export function headAzimuth(time: number): number {
  return FACE_AZIMUTH - EARLY_TURN * (1 - smootherstep(turnStart, turnEnd, time))
}

const outerBracts = new Monotone([
  [bud0, 34],
  [inStage(bud0, bud1, 0.579), 66],
  [bloom0, 76],
  [turnStart, 132],
  [inStage(bloom0, bloom1, 0.6), 136],
  [turnEnd, 138],
])
const innerBracts = new Monotone([
  [bud0, 14],
  [inStage(bud0, bud1, 0.579), 20],
  [bloom0, 34],
  [turnStart, 58],
  [inStage(bloom0, bloom1, 0.6), 92],
  [turnEnd, 106],
])

// Bracts stand in three rings: the inner ring closes over the bud, the outer ring stands away from it.
export function bractRing(j: number): number {
  return (j % 3) / 2
}

export function bractAngle(j: number, time: number): number {
  const kept = headTime(time)
  return (lerp(innerBracts.at(kept), outerBracts.at(kept), bractRing(j)) + (rnd(30, j) - 0.5) * 12) * RAD
}

// How far a bract curls in over the bud. It lets go as the head opens.
export function bractCurl(j: number, time: number): number {
  const closed = lerp(0.95, 0.1, bractRing(j))
  return lerp(closed, -0.12, smootherstep(bloom0 - 1, turnEnd, headTime(time)))
}

// A bract grows with the bud and keeps its length for good.
export function bractLength(j: number, time: number): number {
  const r = bodyRadius(time)
  return r <= 0 ? 0 : Math.min(0.01 * smoothstep(0, 0.01, r) + r, BRACT_LONGEST * headScale()) * (0.85 + 0.3 * rnd(31, j))
}

// A ray grows folded inside the shut bud to most of its length, so nothing lengthens across the disc once the bracts part. It stretches the rest of the way as it opens.
export function rayLength(k: number, time: number): number {
  const grown = smootherstep(inStage(bud0, bud1, 0.58), inStage(bud0, bud1, 0.87), time)
  return rayFull * headScale() * grown * lerp(RAY_SHUT, 1, rayOpen(k, time)) * (0.92 + 0.16 * rnd(40, k))
}

// Rays open as a front inside the bloom stage: the sector round `RAY_FIRST` lifts together and the front travels on to `RAY_NEAR`.
// Past `RAY_NEAR` no front runs: each ray has its own start, well apart from its neighbors', and its own pace.
// Whatever a ray had done by `RAY_HELD` it keeps.
const RAY_SECONDS = 3
const RAY_NEAR = 95 * RAD
const RAY_HELD = 45 + 1 / 60
const RAY_FLAT = 58.3
const RAY_CUP = 32
const GOLDEN = (Math.sqrt(5) - 1) / 2
const frontCurve = new Monotone([
  [0, bloom0],
  [45 * RAD, bloom0],
  [RAY_NEAR, bloom0 + 2.4],
  [140 * RAD, bloom0 + 4],
  [Math.PI, bloom1 - RAY_SECONDS - 0.3],
])

function raySpan(k: number): [number, number, number] {
  const away = Math.acos(Math.cos((k / rayCount) * TAU - RAY_FIRST))
  if (away <= RAY_NEAR) {
    const start = frontCurve.at(away) + 0.3 * rnd(41, k)
    return [start, start + RAY_SECONDS, 0]
  }
  const far = (away - RAY_NEAR) / (Math.PI - RAY_NEAR)
  const turn = (k * GOLDEN + rnd(46)) % 1
  const start = RAY_HELD + 0.004 + (0.3 * far + 0.1 * rnd(41, k)) * smoothstep(0, 0.3, turn) + turn
  const seconds = lerp(1.8, lerp(RAY_SECONDS, 3.8, far), smoothstep(0, 0.5, turn)) * (0.9 + 0.2 * rnd(43, k))
  return [start, Math.min(start + seconds, bloom1), 1]
}

const rayRise = (span: [number, number, number], at: number): number => {
  const time = headTime(at)
  return lerp(smootherstep(span[0], span[1], time), smoothstep(span[0], span[1], time), span[2])
}

// A ray that has not begun to lift by `RAY_HELD` waits its turn: the lift runs on round the rim from where the front stands then, on both sides, to the point across from `RAY_FIRST`, each ray a little after the one before it and none faster than the rays of the front. The last is open when the last was open before. What `raySpan` gives such a ray still times its cup and its flattening. The neighbors in the field, far off, keep their own starts.
const RAY_TURN_FROM = 84 * RAD
function rayTurn(k: number): [number, number, number] {
  const span = raySpan(k)
  if (variant !== 0 || span[0] <= RAY_HELD + 0.01) return span
  const away = Math.acos(Math.cos((k / rayCount) * TAU - RAY_FIRST))
  const along = Math.min(1, Math.max(0, (away - RAY_TURN_FROM) / (Math.PI - RAY_TURN_FROM)))
  const start = RAY_HELD + 0.13 + 1.15 * along + 0.04 * rnd(41, k)
  return [start, start + lerp(RAY_SECONDS, 3.59, along), 1]
}

export function rayOpen(k: number, time: number): number {
  return rayRise(rayTurn(k), time)
}

// A ray lies folded in over the face until it opens. It arrives cupped forward and flattens over the seconds that follow.
export function rayAngle(k: number, time: number): number {
  const span = raySpan(k)
  const open = rayOpen(k, time)
  const lift = lerp(-68, 84 + 12 * (rnd(42, k) - 0.5), open)
  const held = rayRise(span, RAY_HELD)
  if (open <= held) return lift * RAD
  const cup = Math.min(RAY_CUP, 76 * (1 - held)) * (0.85 + 0.3 * rnd(44, k))
  const from = lerp(span[0], span[1], 0.69)
  const flat = smootherstep(from, Math.min(from + lerp(4.5, 8, rnd(45, k)) + 3.5 * span[2], RAY_FLAT), headTime(time))
  return (lift - cup * smoothstep(held, 1, open) * (1 - flat)) * RAD
}

// The seed leaves shrink as the true leaves take over, then wither and are shed before the bud swells.
export function seedLeafLength(time: number): number {
  const grown = 0.013 + 0.031 * smoothstep(inStage(emerge0, emerge1, 0.8), seed1 + 1, time)
  const kept = (1 - 0.6 * smoothstep(leaves0 + 8, leaves0 + 16, time)) * (1 - smoothstep(leaves0 + 16, leaves0 + 21, time))
  return grown * kept * smoothstep(0, 0.006, heightAt(time))
}

const seedLeafSpread = new Monotone([
  [seed0, 0.05],
  [inStage(seed0, seed1, 0.7), 0.72],
  [seed1, 1.0],
  [seed1 + 6, 1.4],
])

export function seedLeafAngle(side: number, time: number): number {
  return seedLeafSpread.at(time) * (1 + (side === 0 ? 0.13 : -0.13) * smoothstep(seed0, seed1, time))
}

// Where the seed leaves sit on the stem, as a share of its length: at its end until the true leaves push up past them.
export function seedLeafFraction(time: number): number {
  const h = heightAt(time)
  if (time <= seed1 || h <= 0) return 1
  const age = time - seed1
  const node = heightAt(seed1) * 0.76 + 0.2 * (heightAt(seed1 + 2 * (1 - Math.exp(-age / 2))) - heightAt(seed1))
  return clamp(lerp(1, node / h, smoothstep(0, 1.5, age)))
}

// The husk rides the tip of the seed leaves, then falls beside the stem.
export function huskDrop(time: number): number {
  const k = clamp((time - (seed0 + 0.2)) / 0.5)
  return k * k
}

// Once pushed off the tips it slides clear of them.
export function huskFall(time: number): number {
  return clamp((time - (seed0 + 0.62)) / 0.4)
}

// How far down its tumble the shell is. Half of the way goes at an even pace; over the rest it loses its speed frame by frame and lies still, with no rock.
const HUSK_BRAKE = 0.5
export function huskLand(time: number): number {
  const k = (time - (seed0 + 0.72)) / 0.3
  if (k <= HUSK_BRAKE) return clamp(k)
  const left = 1 - HUSK_BRAKE
  return 1 - left * (1 - clamp((k - HUSK_BRAKE) / (3 * left))) ** 3
}

export const huskLengthM = 0.0143

// The husk lies in the crumbs until the rain has beaten the soil over it.
export function huskSize(time: number): number {
  return 1 - smoothstep(leaves0 + 3, leaves0 + 10, time)
}
export const huskRest: Vec3 = { x: -0.0095, y: 0.0028, z: 0.006 }

// When a leaf leaves the tip for good and grows at its own pace.
const leafStarts = Float64Array.from({ length: leafCount }, (_, i) => leaves0 + (leaves1 - leaves0) * Math.pow(i / (leafCount - 1), 1.6))
function leafStart(i: number): number {
  return leafStarts[i]
}

// The first pair shows early, small and upright between the seed leaves, and waits there for the rain.
const PAIR_EARLY_S = 2.8
const PAIR_PACE = 0.28

export function leafBirth(i: number): number {
  return i < 2 ? leafStart(i) - PAIR_EARLY_S : leafStart(i)
}

// Where a plant's leaf spiral starts is its own, from its seed. The director may turn one neighbor by hand, as a gardener turns a pot.
const leafTurns = new Map<number, number>()
export function setLeafTurn(v: number, turn: number | null): void {
  if (turn === null) leafTurns.delete(v)
  else leafTurns.set(v, turn)
}

// The director may also hold single leaves of one neighbor by hand, as a gardener ties a leaf back: how far it droops, how high
// it is held (at a set angle, or lifted by an angle while it goes on settling as it would), how long it is and how far round the stem it is swung. A hold comes on over the seven seconds before the bloom begins, so nothing differs up to the frost.
// The plant itself is never held.
export interface LeafHold { droop?: number; elevationDeg?: number; liftDeg?: number; lengthScale?: number; rollDeg?: number; foldScale?: number; sinkDeg?: number; swingDeg?: number }
const leafHolds = new Map<number, Map<number, LeafHold>>()
export function setLeafHold(v: number, leaf: number, hold: LeafHold | null): void {
  if (v === 0) throw new Error('The plant itself is never held.')
  const held = leafHolds.get(v) ?? new Map<number, LeafHold>()
  if (hold === null) held.delete(leaf)
  else held.set(leaf, hold)
  if (held.size > 0) leafHolds.set(v, held)
  else leafHolds.delete(v)
}
const heldLeaf = (i: number): LeafHold | undefined => (variant === 0 ? undefined : leafHolds.get(variant)?.get(i))
const holdAt = (time: number): number => smoothstep(bloom0 - 7, bloom0 - 4, time)

export function leafAzimuth(i: number, time?: number): number {
  const turn = variant === 0 ? 0.6 : (leafTurns.get(variant) ?? 0.6 + TAU * rnd(2))
  const free = i < OPPOSITE_LEAVES ? turn + Math.floor(i / 2) * (Math.PI / 2) + (i % 2) * Math.PI : turn + (i - OPPOSITE_LEAVES + 1) * goldenRad
  const hold = time === undefined ? undefined : heldLeaf(i)
  const on = time === undefined ? 0 : holdAt(time)
  return hold?.swingDeg === undefined || on === 0 ? free : free + hold.swingDeg * RAD * on
}

export function leafAge(i: number, time: number): number {
  const start = leafStart(i)
  if (i >= 2 || time >= SET_S) return time - start
  const head = PAIR_PACE * PAIR_EARLY_S
  return time < start ? PAIR_PACE * (time - start + PAIR_EARLY_S) : time - start + head * (1 - smoothstep(start, SET_S, time))
}

function jointFraction(i: number, time: number): number {
  const age = leafAge(i, time)
  const h = heightAt(time)
  if (age <= 0 || h <= 0) return 0.97
  const rank = i / (leafCount - 1)
  const seconds = INTERNODE_SECONDS + 26 * rank * rank * rank
  const settled = heightAt(leafStart(i) + seconds * (1 - Math.exp(-age / seconds)))
  const grown = lerp(0.992 - 0.004 * Math.min(age, 6), Math.min(0.975, ((0.9 + 0.075 * rank * rank + (variant === 0 ? 0.042 * smoothstep(0.85, 0.93, rank) * (1 - 0.85 * smoothstep(0.93, 1, rank)) * (1 - smoothstep(inStage(bloom0, bloom1, 0.25), bloom1, time)) : 0)) * settled) / h), smoothstep(1.5, 7, age))
  const late = smoothstep(SET_S, BLOOM_S, time)
  if (late >= 1) return grown
  // The first joints of the young plant stop rising early, so in the rain it is leafy from low on the stem.
  // From the night on a joint under the tip stretches late, so the youngest leaves stand crowded round the bud.
  // A joint born late in the rain goes on rising through the night to near its last height: the leaves stand in a close stack under the bud.
  const quick = Math.min(seconds, Math.max(lerp(1.6, 8, smoothstep(16, 21, leafStart(i))), lerp(1.6, STACK_SECONDS, smoothstep(13, 14.5, leafStart(i)))))
  // The first leaves stand in opposite pairs: the two of a pair leave the tip together, when the second is born. A later leaf rides the tip for a second.
  const start = i < OPPOSITE_LEAVES ? leafStart(i | 1) : leafStart(i) + 1
  const tip = 0.99 * heightAt(start)
  const rest = Math.max(tip, (0.9 + 0.075 * rank * rank) * heightAt(start + quick))
  const young = Math.min(0.992 - 0.004 * Math.min(age, 6), lerp(tip, rest, 1 - Math.exp(-Math.max(0, time - start) / quick)) / h)
  return lerp(young, grown, late)
}

// From the night to the frost the plant's upper internodes stay short: a joint rides close under the tip, the leaves above it crowded round the bud, until it reaches the height it will have at the bloom.
// Every part asks for the same joints at the same few moments of a frame: they are worked out once for each.
interface Joints { variant: number; time: number; at: Float64Array }
const joints: Joints[] = Array.from({ length: 6 }, () => ({ variant: -1, time: NaN, at: new Float64Array(leafCount) }))
let jointsNext = 0
export function leafStemFraction(i: number, time: number): number {
  for (const j of joints) if (j.variant === variant && j.time === time) return Number.isNaN(j.at[i]) ? (j.at[i] = jointAt(i, time)) : j.at[i]
  const j = joints[jointsNext]
  jointsNext = (jointsNext + 1) % joints.length
  j.variant = variant
  j.time = time
  j.at.fill(NaN)
  return (j.at[i] = jointAt(i, time))
}

// A leaf that is not born yet waits where it will leave the tip, so nothing of it moves at its birth.
const waits = new Map<number, Float64Array>()
function waitingAt(i: number): number {
  let w = waits.get(variant)
  if (!w) waits.set(variant, (w = new Float64Array(leafCount).fill(NaN)))
  return Number.isNaN(w[i]) ? (w[i] = jointAt(i, leafBirth(i) + 1e-6)) : w[i]
}

function jointAt(i: number, time: number): number {
  if (leafAge(i, time) <= 0 && heightAt(leafBirth(i)) > 0) return waitingAt(i)
  const fraction = jointFraction(i, time)
  if (variant !== 0 || time <= CROWD_START || time >= CROWD_END || leafAge(i, time) <= 0) return fraction
  const h = heightAt(time)
  let above = 0
  for (let k = i + 1; k < leafCount; k++) above += smoothstep(0, CROWD_SECONDS, time - leafStart(k))
  // Only the leaves near the tip are crowded: lower down a joint stands at its own height.
  const count = Math.min(above, CROWD_LEAVES)
  const crowded = h - CROWD_TIP - count * (CROWD_STEP + CROWD_SPREAD * count)
  const ahead = CROWD_END - CROWD_PACE * (CROWD_END - time)
  const stop = jointFraction(i, ahead) * heightAt(ahead)
  return lerp(fraction, Math.max(fraction, Math.min(crowded, stop) / h), smoothstep(CROWD_START, CROWD_START + 3, time) * smoothstep(12.5, 14.5, leafStart(i)))
}

// In the wide shot the leaves go on growing, each in its own two and a half seconds. On the plant the upper ones go first, where the lens sees them against the sky; on its neighbors the lower ones.
const LATE_START = SETTLE_S
export function leafLateGrowth(i: number, time: number, lag = 0): number {
  // A time past the film's end asks what a leaf was planned to be: the parts size their grids by it.
  if (time <= LATE_START || time > config.growth.seconds) return 0
  const rank = i / (leafCount - 1)
  const start = LATE_START + lag + 3.2 * (0.6 * (variant === 0 ? 1 - rank : rank) + 0.4 * rnd(13, i))
  return smoothstep(start, start + 2.5, time)
}

// The plant fills out most: its neighbors stand in each other's shade and are nearly done.
const lateShare = (): number => (variant === 0 ? 1 : 0.3)

// A blade fills out in width a little after it has lengthened.
export function leafBroadening(i: number, time: number): number {
  return 1 + 0.22 * lateShare() * leafLateGrowth(i, time, 0.8)
}

export function leafLength(i: number, time: number): number {
  const age = leafAge(i, time)
  if (age <= 0) return 0
  const rank = i / (leafCount - 1)
  const full = (0.135 + 0.095 * Math.sin(Math.PI * Math.pow(rank, 0.85)) + 0.045 * smoothstep(0.6, 1, rank)) * (1 + 0.25 * smoothstep(0.7, 0.83, rank) * smoothstep(bloom0 - 7, bloom0 + 1, time)) * (1 - 0.5 * smoothstep(0.92, 1, rank)) * (0.88 + 0.24 * rnd(10, i))
  const slow = lerp(7, 3.6, smoothstep(0.45, 0.8, rank))
  const late = smoothstep(SET_S, BLOOM_S, time)
  const share = (seconds: number): number => 1 - Math.exp(-Math.pow(age / seconds, 1.1))
  // The first leaves of the young plant fill out fast: in the rain the largest is a third of the plant's height.
  const length = full * (late >= 1 ? share(slow) : lerp(share(Math.min(slow, 4.6)), share(slow), late))
  const hold = heldLeaf(i)
  const held = hold?.lengthScale === undefined ? length : length * lerp(1, hold.lengthScale, holdAt(time))
  return time <= LATE_START || time > config.growth.seconds ? held : held * (1 + (0.3 + 0.3 * Math.sin(Math.PI * rank)) * lateShare() * leafLateGrowth(i, time))
}

// How many leaves have left the tip.
let bornFor = { variant: -1, time: NaN, count: 0 }
function leavesBorn(time: number): number {
  if (bornFor.variant === variant && bornFor.time === time) return bornFor.count
  let count = 0
  while (count < leafCount && leafAge(count, time) > 0) count++
  bornFor = { variant, time, count }
  return count
}

// The light a leaf feels. A change reaches the youngest leaves first and runs down the plant, each leaf a little early or late.
export function leafLift(i: number, time: number, inputs: PlantInputs): number {
  const low = inputs.liftLow
  if (low === undefined) return inputs.lift
  const born = leavesBorn(time)
  const down = born > 1 ? clamp((born - 1 - i) / (born - 1) + 0.3 * (rnd(14, i) - 0.5)) : 0
  return lerp(inputs.lift, low, down)
}

// From the thaw until it blooms the plant stands open, 0 to 1: its older leaves settle less far, hang less in the dark and their blades fall less from their stalks.
export function leafOpen(time: number): number {
  return smoothstep(config.growth.frostHold + 0.1, LEAFY_S + 2, time) * (1 - smoothstep(STOUT_S, BLOOM_S, time))
}

// How far the open plant holds a blade above where it would have settled, in radians, and how much less it droops along its length.
export function leafOpening(i: number, time: number, inputs: PlantInputs, out: { lift: number; droop: number }): void {
  const opened = leafOpen(time)
  out.lift = 0
  out.droop = 0
  if (opened <= 0) return
  const age = Math.max(0, leafAge(i, time))
  const grown = smoothstep(2, 14, age)
  const dark = (1 - DARK_OPEN) * (1 - leafLift(i, time, inputs))
  const deep = inputs.liftLow === undefined ? 4 + 9 * grown : 5 + (13 + 8 * rnd(15, i)) * grown
  out.lift = opened * smoothstep(0, 5.5, age) * ((26 - SETTLE_OPEN) * smoothstep(5, 30, age) + dark * deep) * RAD
  out.droop = opened * (inputs.liftLow === undefined ? 0.22 : 0.3) * dark
}

// Leaves open upward, settle outward and hang when the light is gone or the cold is in them.
export function leafElevation(i: number, time: number, inputs: PlantInputs): number {
  const age = Math.max(0, leafAge(i, time))
  const open = smoothstep(0, 5.5, age)
  const grown = smoothstep(2, 14, age)
  const deep = inputs.liftLow === undefined ? 4 + 9 * grown : 5 + (13 + 8 * rnd(15, i)) * grown
  const hang = (1 - leafLift(i, time, inputs)) * deep + (inputs.cold ?? 0) * (4 + 9 * grown) * smoothstep(0.5, 3, age)
  const settled = 24 - 26 * smoothstep(5, 30, age) + (rnd(11, i) - 0.5) * 16 - hang
  // A leaf that fills out lifts as it stretches and settles lower than it began.
  const late = leafLateGrowth(i, time)
  const angle = ((74 + (settled - 74) * open + (late > 0 ? 9 * Math.sin(Math.PI * late) - 5 * late : 0)) * Math.PI) / 180
  const hold = heldLeaf(i)
  if (hold === undefined) return angle
  const on = holdAt(time)
  const held = (hold.elevationDeg === undefined ? angle : lerp(angle, hold.elevationDeg * RAD, on)) + (hold.liftDeg ?? 0) * RAD * on
  const sunk = smoothstep(bloom0, bloom1, time)
  return hold.sinkDeg === undefined || sunk === 0 ? held : held - hold.sinkDeg * RAD * sunk
}

export function leafFold(i: number, time: number): number {
  const age = Math.max(0, leafAge(i, time))
  return ((80 - 70 * smoothstep(0, 4, age) + (rnd(12, i) - 0.5) * 8) * Math.PI) / 180
}

export function leafRoll(i: number, time: number): number {
  const hold = heldLeaf(i)
  const on = holdAt(time)
  return hold?.rollDeg === undefined || on === 0 ? 0 : hold.rollDeg * RAD * on
}

export function leafFoldScale(i: number, time: number): number {
  const hold = heldLeaf(i)
  return hold?.foldScale === undefined ? 1 : lerp(1, hold.foldScale, holdAt(time))
}

export function leafDroop(i: number, inputs: PlantInputs, time: number): number {
  const droop = 0.22 + 0.4 * rnd(22, i) + (inputs.liftLow === undefined ? 0.22 : 0.3) * (1 - leafLift(i, time, inputs)) + 0.12 * (inputs.cold ?? 0)
  const hold = heldLeaf(i)
  return hold?.droop === undefined ? droop : lerp(droop, hold.droop, holdAt(time))
}

export function leafSeed(i: number, j: number): number {
  return rnd(20 + j, i)
}

export interface StemBend { leanX: number; leanZ: number; hook: number; hookShare: number; back: number; tiltX: number; tiltZ: number; neckShare: number }

// The share of the head's tilt that the neck of the stem takes up. The rest is the head's own.
const NECK_TILT = 0.78

// How the stem leans, as angles from upright at its top. The tip circles while it grows and only the upper part bends.
export function stemBend(time: number, inputs: PlantInputs): StemBend {
  const h = heightAt(time)
  const young = 1 - smoothstep(0.25, 1.3, h)
  // A young plant follows the sun with its whole top. Once the bud leans over to face east the head stays where it is.
  const lean = (0.1 + 0.2 * young) * smoothstep(seed0, seed1, time) * (1 - 0.85 * smoothstep(STOUT_S, bloom0 + 1, time)) + 0.07 * (1 - smoothstep(seed0, seed1, time))
  const circle = 0.016 + 0.085 * young * smoothstep(seed0, seed1, time)
  const phase = TAU * (time / NUTATION_SECONDS + rnd(1))
  const tilt = Math.PI / 2 - headElevation(time)
  const az = headAzimuth(time)
  const steady = Math.min(inputs.calm ?? inputs.wind, inputs.wind)
  const real = realOf(inputs, time)
  const lapse = inputs.lapse ?? 0
  const slender = smoothstep(0.04, 0.5, h)
  let blow = 0
  let across = 0
  let nod = 0
  // Inputs without a film second are the first film's, and keep its wind.
  const first = inputs.real === undefined
  const way = first ? firstWay : windToward
  if (standsAt && (steady > 0 || (inputs.gust ?? 0) > 0)) {
    // In real time the stem rides the swell. In a time lapse each frame catches it somewhere else on that swell.
    const ride = first ? swellOf : sway
    const swell = lapse < 1 ? ride(real, standsAt.x, standsAt.z) : 0
    const caught = lapse > 0 ? restless(real, Math.floor(real * FPS + 1e-6), 0.37 + 0.11 * variant) : 0
    blow = steady * (STEM_LEAN + STEM_SWING * lerp(swell, 0.5 * caught * (inputs.twitch ?? 1), lapse))
    // A bud or a head has weight: it comes after the stem that carries it and passes it on the way back.
    const heavy = smoothstep(bud0 + 6, bloom1, time)
    if (heavy > 0 && lapse < 1) nod = HEAD_NOD * heavy * steady * (1 - lapse) * (ride(real - HEAD_LATE_S, standsAt.x, standsAt.z) - swell)
    const gust = inputs.gust ?? 0
    if (gust > 0) {
      const push = squall(real, standsAt.x, standsAt.z)
      // The stem gives to a gust, swings back past its rest and whips a little across the wind.
      blow += gust * slender * (GUST_LEAN * push + GUST_SPRING * (squall(real - 0.35, standsAt.x, standsAt.z) - push))
      across = gust * slender * GUST_ACROSS * Math.sin(real * 3.9 + 1.7 * push + rnd(4) * TAU) * (0.3 + 0.7 * push)
      nod += gust * HEAD_NOD * smoothstep(bud0 + 2, bloom0, time) * (squall(real - HEAD_LATE_S, standsAt.x, standsAt.z) - push)
    }
  }
  // A seedling's tip also turns a quicker, smaller circle of its own. A plant half a meter tall no longer does.
  const dance = h < 0.5 ? (0.012 + 0.058 * (1 - smoothstep(0.03, 0.3, h))) * (1 - smoothstep(0.3, 0.5, h)) : 0
  const turn = dance > 0 ? TAU * (time / DANCE_SECONDS + (variant === 0 ? DANCE_PHASE : rnd(3))) : 0
  return {
    leanX: inputs.leanX * lean + Math.sin(phase) * circle + way.x * blow - way.z * across + (dance > 0 ? Math.sin(turn) * dance : 0),
    leanZ: inputs.leanZ * lean + Math.cos(phase) * circle + way.z * blow + way.x * across + (dance > 0 ? 0.5 * Math.cos(turn) * dance : 0),
    hook: hookAngle(time),
    hookShare: hookShare(time),
    back: HOOK_BACK * (hookAngle(time) / HOOK_MAX),
    tiltX: Math.sin(az) * tilt + way.x * nod,
    tiltZ: Math.cos(az) * tilt + way.z * nod,
    neckShare: h > 0 ? clamp(neckLength.at(time) / h, 0, 0.5) : 0.5,
  }
}

function fromTilt(ax: number, az: number, out: Vec3): Vec3 {
  const a = norm(ax, az)
  if (a < 1e-9) {
    out.x = 0
    out.y = 1
    out.z = 0
    return out
  }
  const s = Math.sin(a) / a
  out.x = ax * s
  out.y = Math.cos(a)
  out.z = az * s
  return out
}

// The direction of the stem at a share u of its length.
export function stemDirection(bend: StemBend, u: number, out: Vec3): Vec3 {
  const upper = smoothstep(0.3, 1, u)
  const hook = bend.hook * smoothstep(1 - bend.hookShare, 1, u)
  const neck = NECK_TILT * smoothstep(1 - bend.neckShare, 1, u)
  const back = bend.back * smoothstep(0, 0.3, u)
  return fromTilt(bend.leanX * upper + back - hook + bend.tiltX * neck, bend.leanZ * upper + bend.tiltZ * neck, out)
}

// The direction the bud and the head point in.
export function headDirection(bend: StemBend, out: Vec3): Vec3 {
  return fromTilt(bend.leanX + bend.tiltX, bend.leanZ + bend.tiltZ, out)
}

// How far along the stem the top of the arch is, as a share of its length. It is the end of the stem once the arch has gone.
export function archShare(time: number): number {
  return 1 - 0.48 * hookShare(time) * (hookAngle(time) / HOOK_MAX)
}

export function plantReach(time: number): number {
  let reach = 0
  for (let i = 0; i < leafCount; i++) reach = Math.max(reach, leafLength(i, time) * 1.3)
  const head = bodyRadius(time) + Math.max(rayLength(0, time) * 1.1, 0.085 * smoothstep(0, 0.02, bodyRadius(time)))
  return stemBaseRadius(time) + heightAt(time) * 0.2 + Math.max(reach, head + 0.12 * smoothstep(tiltStart, turnStart, time), seedLeafLength(time) * 1.2, 0.024 * smoothstep(0, 0.01, heightAt(time)))
}
