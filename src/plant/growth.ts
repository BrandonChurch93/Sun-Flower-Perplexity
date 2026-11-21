import { config } from '../config.ts'
import { Monotone, clamp, lerp, smootherstep, smoothstep } from '../core/curves.ts'
import { combine, hash01, streamSeed } from '../core/random.ts'
import { STEM_LEAN, STEM_SWING, sway, windToward } from './wind.ts'

// What the world asks of the plant. The plant never knows which world it is in.
export interface PlantInputs {
  leanX: number
  leanZ: number
  lift: number
  // How hard the wind blows, 0 to 1. 0 is still air.
  wind: number
}

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
const RAD = Math.PI / 180
const heightCurve = new Monotone(config.plant.heightM)

const [emerge0, emerge1] = config.plant.stages.emerge
const [seed0, seed1] = config.plant.stages.seedLeaves
const [leaves0, leaves1] = config.plant.stages.leaves
const [bud0, bud1] = config.plant.stages.bud
const [bloom0, bloom1] = config.plant.stages.bloom
const inStage = (a: number, b: number, f: number) => a + (b - a) * f

export const leafCount = config.plant.leafCount
export const rayCount = config.plant.rayFlorets
export const bractCount = 21
const goldenRad = config.plant.goldenAngleDeg * RAD
const NUTATION_SECONDS = 3.7
const INTERNODE_SECONDS = 4
const OPPOSITE_LEAVES = 6
const HOOK_MAX = 172 * RAD
const HOOK_BACK = 0.3
const discRadius = config.plant.discDiameterM / 2
const rayFull = (config.plant.headDiameterM - config.plant.discDiameterM) / 2

// The top of the whole plant: the arch of the hook, then the leaf tips, then the bracts, then the petals.
export function heightAt(time: number): number {
  return heightCurve.at(time)
}

// A sprout is 2.4 mm through and thickens fast once its leaves work. From 40.3 s, when the youngest neighbor in the bloom is that old, the girth is the old curve to the last bit.
export function stemBaseRadius(time: number): number {
  const h = heightAt(time)
  const full = 0.0016 + 0.0145 * Math.pow(smoothstep(0.03, 1.7, h), 0.8)
  const settled = smoothstep(30, 40.3, time)
  if (settled >= 1) return full
  return lerp(0.0012 + 0.0149 * Math.pow(smoothstep(0.05, 1.7, h), 0.45), full, settled)
}

export function stemRadius(time: number, u: number): number {
  // Until the head is set the top of the stem is a slender shoot: it fills out under the bud in the last days before the bloom.
  const taper = 0.12 + 0.16 * smoothstep(0.05, 0.6, heightAt(time)) + 0.36 * smoothstep(14, 36, time) * (1 - smoothstep(36.5, 40.3, time))
  return stemBaseRadius(time) * (1 - taper * Math.pow(u, 1.5))
}

// The seedling comes up as an arch and straightens once it is in the light.
export function hookAngle(time: number): number {
  return HOOK_MAX * (1 - smootherstep(inStage(emerge0, emerge1, 0.55), emerge1, time))
}

export function hookShare(time: number): number {
  return lerp(0.92, 0.34, smoothstep(emerge0, inStage(emerge0, emerge1, 0.5), time))
}

export function paleness(time: number): number {
  return 1 - smoothstep(inStage(emerge0, emerge1, 0.35), inStage(seed0, seed1, 0.4), time)
}

// The bud body grows into the disc.
const bodyCurve = new Monotone([
  [bud0, 0],
  [inStage(bud0, bud1, 0.053), 0.015],
  [inStage(bud0, bud1, 0.263), 0.02],
  [inStage(bud0, bud1, 0.579), 0.037],
  [inStage(bud0, bud1, 0.79), 0.054],
  [inStage(bud0, bud1, 0.947), 0.061],
  [inStage(bloom0, bloom1, 0.25), discRadius * 0.825],
  [inStage(bloom0, bloom1, 0.5), discRadius * 0.9],
  [inStage(bloom0, bloom1, 0.75), discRadius * 0.965],
  [inStage(bloom0, bloom1, 0.9375), discRadius],
])

// A neighbor carries a smaller head than the plant.
const NEIGHBOR_HEAD = 0.7
const headScale = (): number => (variant === 0 ? 1 : NEIGHBOR_HEAD)

export function bodyRadius(time: number): number {
  return bodyCurve.at(time) * headScale()
}

export function headOpen(time: number): number {
  return smootherstep(inStage(bloom0, bloom1, 0.06), inStage(bloom0, bloom1, 0.82), time)
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
])

// The bud is a ball. It flattens into the disc as it opens.
export function bodyHalfDepth(time: number): number {
  return bodyRadius(time) * depthShare.at(time)
}
const elevationCurve = new Monotone([
  [tiltStart, 90],
  [turnStart, 34],
  [turnEnd, 9],
  [config.film.durationSeconds, 5],
])
const FACE_AZIMUTH = (config.field.companion.fromAzimuthDeg - 27) * RAD
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
  return (lerp(innerBracts.at(time), outerBracts.at(time), bractRing(j)) + (rnd(30, j) - 0.5) * 12) * RAD
}

// How far a bract curls in over the bud. It lets go as the head opens.
export function bractCurl(j: number, time: number): number {
  const closed = lerp(0.95, 0.1, bractRing(j))
  return lerp(closed, -0.12, smootherstep(bloom0 - 1, turnEnd, time))
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
const RAY_HELD = config.keys.find((key) => key.id === 'bloom-opening')!.time + config.film.shutterDegrees / 360 / config.film.fps
const RAY_FLAT = config.keys.find((key) => key.id === 'field')!.time - 0.2
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

const rayRise = (span: [number, number, number], time: number): number => lerp(smootherstep(span[0], span[1], time), smoothstep(span[0], span[1], time), span[2])

export function rayOpen(k: number, time: number): number {
  return rayRise(raySpan(k), time)
}

// A ray lies folded in over the face until it opens. It arrives cupped forward and flattens over the seconds that follow.
export function rayAngle(k: number, time: number): number {
  const span = raySpan(k)
  const open = rayRise(span, time)
  const lift = lerp(-68, 84 + 12 * (rnd(42, k) - 0.5), open)
  const held = rayRise(span, RAY_HELD)
  if (open <= held) return lift * RAD
  const cup = Math.min(RAY_CUP, 76 * (1 - held)) * (0.85 + 0.3 * rnd(44, k))
  const from = lerp(span[0], span[1], 0.69)
  const flat = smootherstep(from, Math.min(from + lerp(4.5, 8, rnd(45, k)) + 3.5 * span[2], RAY_FLAT), time)
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

export const huskLengthM = 0.011

// The husk lies in the crumbs until the rain has beaten the soil over it.
export function huskSize(time: number): number {
  return 1 - smoothstep(leaves0 + 3, leaves0 + 10, time)
}
export const huskRest: Vec3 = { x: -0.0165, y: 0.0028, z: 0.006 }

export function leafBirth(i: number): number {
  return leaves0 + (leaves1 - leaves0) * Math.pow(i / (leafCount - 1), 1.6)
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
const holdAt = (time: number): number => smoothstep(bloom0 - 7, bloom0, time)

export function leafAzimuth(i: number, time?: number): number {
  const turn = variant === 0 ? 0.6 : (leafTurns.get(variant) ?? 0.6 + TAU * rnd(2))
  const free = i < OPPOSITE_LEAVES ? turn + Math.floor(i / 2) * (Math.PI / 2) + (i % 2) * Math.PI : turn + (i - OPPOSITE_LEAVES + 1) * goldenRad
  const hold = time === undefined ? undefined : heldLeaf(i)
  const on = time === undefined ? 0 : holdAt(time)
  return hold?.swingDeg === undefined || on === 0 ? free : free + hold.swingDeg * RAD * on
}

export function leafAge(i: number, time: number): number {
  return time - leafBirth(i)
}

export function leafStemFraction(i: number, time: number): number {
  const age = leafAge(i, time)
  const h = heightAt(time)
  if (age <= 0 || h <= 0) return 0.97
  const rank = i / (leafCount - 1)
  const seconds = INTERNODE_SECONDS + 26 * rank * rank * rank
  const settled = heightAt(leafBirth(i) + seconds * (1 - Math.exp(-age / seconds)))
  return lerp(0.992 - 0.004 * Math.min(age, 6), Math.min(0.975, ((0.9 + 0.075 * rank * rank + (variant === 0 ? 0.042 * smoothstep(0.85, 0.93, rank) * (1 - 0.85 * smoothstep(0.93, 1, rank)) * (1 - smoothstep(inStage(bloom0, bloom1, 0.25), bloom1, time)) : 0)) * settled) / h), smoothstep(1.5, 7, age))
}

export function leafLength(i: number, time: number): number {
  const age = leafAge(i, time)
  if (age <= 0) return 0
  const rank = i / (leafCount - 1)
  const full = (0.135 + 0.095 * Math.sin(Math.PI * Math.pow(rank, 0.85)) + 0.045 * smoothstep(0.6, 1, rank)) * (1 + 0.25 * smoothstep(0.7, 0.83, rank) * smoothstep(bloom0 - 7, bloom0 + 1, time)) * (1 - 0.5 * smoothstep(0.92, 1, rank)) * (0.88 + 0.24 * rnd(10, i))
  const length = full * (1 - Math.exp(-Math.pow(age / lerp(7, 3.6, smoothstep(0.45, 0.8, rank)), 1.1)))
  const hold = heldLeaf(i)
  return hold?.lengthScale === undefined ? length : length * lerp(1, hold.lengthScale, holdAt(time))
}

// Leaves open upward, settle outward and hang when the light is gone.
export function leafElevation(i: number, time: number, inputs: PlantInputs): number {
  const age = Math.max(0, leafAge(i, time))
  const open = smoothstep(0, 5.5, age)
  const hang = (1 - inputs.lift) * (4 + 9 * smoothstep(2, 14, age))
  const settled = 24 - 26 * smoothstep(5, 30, age) + (rnd(11, i) - 0.5) * 16 - hang
  const angle = ((74 + (settled - 74) * open) * Math.PI) / 180
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
  const droop = 0.22 + 0.4 * rnd(22, i) + 0.22 * (1 - inputs.lift)
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
  const lean = 0.07 + 0.16 * young
  const circle = 0.016 + 0.085 * young * smoothstep(seed0, seed1, time)
  const phase = TAU * (time / NUTATION_SECONDS + rnd(1))
  const tilt = Math.PI / 2 - headElevation(time)
  const az = headAzimuth(time)
  const blow = standsAt && inputs.wind > 0 ? inputs.wind * (STEM_LEAN + STEM_SWING * sway(time, standsAt.x, standsAt.z)) : 0
  return {
    leanX: inputs.leanX * lean + Math.sin(phase) * circle + windToward.x * blow,
    leanZ: inputs.leanZ * lean + Math.cos(phase) * circle + windToward.z * blow,
    hook: hookAngle(time),
    hookShare: hookShare(time),
    back: HOOK_BACK * (hookAngle(time) / HOOK_MAX),
    tiltX: Math.sin(az) * tilt,
    tiltZ: Math.cos(az) * tilt,
    neckShare: h > 0 ? clamp(neckLength.at(time) / h, 0, 0.5) : 0.5,
  }
}

function fromTilt(ax: number, az: number, out: Vec3): Vec3 {
  const a = Math.hypot(ax, az)
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
