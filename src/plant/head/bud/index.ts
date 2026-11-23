import { norm } from '../../norm.ts'
import * as THREE from 'three'
import { config } from '../../../config.ts'
import { clamp, lerp, smoothstep } from '../../../core/curves.ts'
import { combine, hash01, streamSeed } from '../../../core/random.ts'
import { bodyRadius, bractAngle, bractCurl, bractLength, headOpen, heightAt, rayAngle, rayCount, rayLength, rayOpen, realOf, stemRadius } from '../../growth.ts'
import { createHairFrames, createHairs, packWay, type HairFrames, type HairSet } from '../../hairs/index.ts'
import { filling, makePartSurface, partGeometry, partMesh, stateUniforms, type PartDetail, type PartOptions, type PlantPart } from '../../part.ts'
import { FLOOR_DOME, FLOOR_RIM, NECK_FLARE, SEAT, floorAt, stemAt, type FloorPoint, type Pose } from '../../skeleton.ts'
import { flutter } from '../../wind.ts'
import { createCrystals, type CrystalSet } from '../../../weather/frost/index.ts'
import { fragment, vertex } from './shaders.ts'

const TAU = Math.PI * 2
const [bloom0] = config.plant.stages.bloom

interface Shape { sides: number; neck: number[]; dome: number[]; side: number[]; floor: number[]; bracts: number; nu: number; nv: number; stations: number[]; backHairs: number; edgeHairs: number; faceHairs: number; downHairs: number; crystals: number }

const steps = (n: number, from = 0): number[] => Array.from({ length: n + 1 - from }, (_, i) => (i + from) / n)

const HERO_SHAPE: Shape = {
  sides: 28,
  neck: [0.006, 0.003],
  dome: steps(6),
  side: [0.35, 0.72, 1],
  floor: [1, 0.65, 0.3, 0],
  bracts: 63,
  nu: 8,
  nv: 7,
  stations: [0, 1, 2, 3, 4, 5, 6, 7],
  backHairs: 10000,
  edgeHairs: 20000,
  faceHairs: 12000,
  downHairs: 56000,
  crystals: 9000,
}
const COMPANION_SHAPE: Shape = {
  sides: 16,
  neck: [0.006, 0.003],
  dome: steps(4),
  side: [0.5, 1],
  floor: [1, 0],
  bracts: 42,
  nu: 5,
  nv: 5,
  stations: [0, 2, 4],
  backHairs: 10000,
  edgeHairs: 20000,
  faceHairs: 12000,
  downHairs: 56000,
  crystals: 9000,
}
const SHAPE: Record<PartDetail, Shape> = {
  hero: HERO_SHAPE,
  near: { sides: 8, neck: [], dome: [0, 0.5, 1], side: [1], floor: [1, 0], bracts: 15, nu: 4, nv: 2, stations: [], backHairs: 0, edgeHairs: 0, faceHairs: 0, downHairs: 0, crystals: 0 },
  far: { sides: 5, neck: [], dome: [0], side: [1], floor: [0], bracts: 0, nu: 0, nv: 0, stations: [], backHairs: 0, edgeHairs: 0, faceHairs: 0, downHairs: 0, crystals: 0 },
}

// How far in front of the head's middle the body is widest, as a share of its half depth. Behind it the back is one shallow dome.
const WIDEST = 0.2
// How much wider than the floor the body is at its widest. From there it rounds in to the rim of the floor.
const SHOULDER = 0.04
const RAY_CLEAR = 0.21
const HUG_FROM = 0.04
const HAIR_WIDTH_M = 0.00005
const DOWN_WIDTH_M = 0.00016
const DOWN_SHUT = 0.15
// Each bract is rolled a little about its midrib so one margin lies over its neighbor's, like a roof tile.
const ROLL = 0.16
// A bract peels back ahead of the rays in front of it, this many seconds before them, outermost series first, so no ray has to push it. growth.ts has no sectors for bracts.
const FOLD_LEAD = [0.6, 0.5, 0.4]
// Three series, outermost first: where the foot sits (1 is the widest ring, over 1 is on the shoulder), how the bract stands round the shut rays and how far it folds back behind the open ones, in radians from the head's axis.
const FEET = [0.5, 0.78, 1]
const HUG = [0.39, 0.31, 0.23]
const STAND = [0.5, -0.5, -1.2]
// Where a bract stands once it has let go of the cone, on its way back.
const LOOSE = [0.5, 0.42, 0.14]
// From a second before the bloom stage the whole involucre lets go of the cone and stands round it as a collar, at these angles.
const COLLAR = [1.25, 0.95, 0.7]
const COLLAR_FROM = -1
const COLLAR_TAKES = 2.5
// Bracts on the side away from the first rays stay on the body this much longer, in seconds.
const COLLAR_LATE = 3
// The outer series stands out round the whole bud as a crown, so it waits far less than the two that cover the body.
const LATE_SHARE = [0.25, 1, 1]
// The rest of the way back follows the bract's own rays, this many seconds after them.
const BACK_LAG = [1.5, 1.6, 1.7]
// On the side away from the first rays the folded bracts stay spread behind the rays by this share and do not lie back on the stem.
const FOLD_STAY = 0.84
const FLARE = [0.25, 0.25, 0.5]
// The shut rays stand up from the rim and arch over the face as a tall cone. A bract lies on a shell this much wider and higher than that cone, as shares of the radius, until the rays in front of it open.
const CONE_WIDE = 0.1
const CONE_HIGH = 1.05
const BEND_FROM = [0.36, 0.4, 0.5]
// While the bud is shut each series leans in this much further than growth.ts says, so the inner points close over the face. In radians.
const SHUT = [0.3, 0.9, 1.7]
// A folded bract curls back on itself toward its point by up to this much, in radians.
const HOOK = 1.5
const FOLD_SLOW = 0.3
const FOLD = [2.7, 2.86, 2.86]
// A bract on the under side of the head folds straight back and curls up this much more, in radians, so it does not hang under the head.
const LOW_HOOK = 0.6
// and swings sideways round the head by up to this much as it folds, so it passes beside the head, not under it.
const LOW_SWING = 0.5
// Once it stands free in the collar a bract is folded along its midrib like a boat, by up to this angle each side, so it shows a lit flank and a dark one from any side. Flat again against the cone and behind the rays, where a deep fold would cut into them.
const KEEL = 0.55
// In the collar a bract under the head lies back toward the stem, from this angle off the axis, and curls under by up to this much, each by its own amount, so the lower ones are uneven and half hidden. The head looks up, so anything less would hang straight down.
const LOW_AWAY = 1.85
const LOW_CURL = 0.8
// With more bracts than this each one is narrower, so they still overlap by the same share.
const BRACTS_BROAD = 56
// A bract first folds only this far, out sideways just behind its rays, and goes the rest of the way back as the whole head opens.
const FOLD_FIRST = [1.95, 1.9, 1.86]
// On the plant the inner series is the longest, so it reaches up the cone of shut rays. A neighbor keeps shorter bracts: the companion's head stands just outside the bloom frames and longer ones would show in them. Width follows the length growth.ts gives, not this.
const LONG = [1.14, 1.08, 1.12]
// How much shorter the shortest bract of a series is. The inner series stays even so the shut bud is covered; the outer ones differ more.
const LONG_VARY = [0.3, 0.26, 0.12]
const LONG_NEIGHBOR = [0.92, 0.9, 0.84]
const BROAD = [0.27, 0.27, 0.25]
// The blade narrows to a slender point over its last third or more: half width of that point at its foot, as a share of the blade's.
const POINT_WIDE = 0.26
const SIDE_FEET = 0.9
// Where the rays leave the rim, as a share of the radius (the same number as rayFrameAt), and how far a bract keeps off the back of a ray, in meters.
const RAY_FOOT = 0.95
const RAY_GAP = 0.003
// Until four seconds before the bloom the bud is shut: its bracts stand off the receptacle as a globe wider than it by these shares of the radius, outermost first,
const BULGE = [0.21, 0.25, 0.06]
const BULGE_LATE = [0.16, 0.14, 0.1]
// The globe is widest below the rim: over the face only this share of the bulge is left, so the bracts close in to a point.
const BULGE_TOP = 0.3
const BULGE_HIGH = 0.7
// their feet sit this much nearer the neck, since the receptacle has not yet spread under them,
const FEET_LOW = [0.52, 0.12, 0]
// The shut bud is a flattened globe: its widest ring lies this share of its depth lower, and the feet of its bracts stand this much higher on it.
const SHUT_LOW = 0.6
const FEET_UP = [0.05, 0, 0.25]
// and each blade is this much broader and tapers evenly to its point.
const SHUT_BROAD = [1.45, 1.2, 0.6]
const SHUT_BROAD_LATE = [1.35, 1.1, 0.7]
// and its face swells between the margins by this share of its half width.
const SHUT_BELLY = 0.25
// Shut, the outer series leaves the globe near its base and curls up like a claw, the two inner ones lean in over the top and turn their points up again. Radians from the head's axis, then how far each curls in and how far its point turns out.
const SHUT_ANGLE = [0.7, 0, -0.6]
const SHUT_ANGLE_LATE = [0.95, 0, -0.8]
const SHUT_CURL = [0.6, 0, 0]
const SHUT_CURL_LATE = [0.8, 0, 0]
// A few of the outer series stand out further than the rest, by up to this much.
const SHUT_SPREAD = 0.8
// The outer series is the leafiest and reaches furthest while the bud is shut.
const SHUT_LONG = [0.5, 0.95, 0.98]
const SHUT_LONG_LATE = [0.9, 1.12, 0.95]
const SHUT_TIP = [0.5, 0.85, 0.1]
const SHUT_TIP_LATE = [0.35, 0.7, 0.7]
// One bract in three of the inner series (every other one in the old build the bloom keeps) stands up behind the middle one and leans its long point out: the crown round the tuft.
const CROWN_ANGLE = 1.0
const CROWN_ANGLE_LATE = 0.6
const CROWN_LONG = -0.1
const CROWN_LONG_LATE = 0.12
const CROWN_TIP = 0.15
const CROWN_TIP_LATE = 0.7
// Each crown point hooks at its tip, some in and some out.
const CROWN_HOOK = 1.4
// A crown point is this much narrower than the bracts of the dome.
const CROWN_SLIM = 0.35
// The inner bracts between the crown points are longer and broader and arch in over the top: the dome of the tuft.
const TUFT_LONG = 0.1
const TUFT_BROAD = 0
// The inner row of a shut bud is folded along its midribs like a roof, by this angle each side, so each bract shows two narrow flanks.
const TUFT_FOLD = 0.7
// A bract that spreads is longer by this much for each radian it stands out.
const SPREAD_LONG = 2.6
const SPREAD_LONG_LATE = 1.6
const SPREAD_OUT = 0.3
const SPREAD_OPEN = 0.1
const SPREAD_UP = 0.5
const SPREAD_SLIM = 0.2
// When the tip has just tightened the outer bracts are still young leaves standing out round a small bud.
const YOUNG_OUT = [0.4, 0.8, 0.5]
const YOUNG_OUT_VARY = [0.25, 0.25, 0]
const YOUNG_HUG = [0.1, 0.16, 0.23]
const YOUNG_WIDE = [0.5, 0.9, 0.3]
const YOUNG_LONG = [2.6, 0.9, 0]
const YOUNG_SHORT = [0, 0, 0.2]
// A young bract wears its hairs long for its size, as a young leaf does.
const YOUNG_FRINGE = 1.8
// Under rime the fringe of a margin stands out at its full length.
const FROST_FRINGE = 0.9
// The bud comes out wrapped: its first bracts stand on the stem's own tip, lean in over it by this much and take this long to unfold, so nothing comes out through the stem's skin.
// No two bracts of the shut bud are alike: each has its own length, width, lean and bend of the point.
const VARY = { long: 0.2, wide: 0.22, lean: 0.24, tip: 0.75 }
const AWN_WIDE = [0.15, 0.24]
const YOUNG_IN = [0.5, 0.6, 0.7]
const UNFOLD_S = [0, 0.3, 0.7]
const UNFOLD_TAKES_S = 1.0
const LENGTHEN_S = [0, 1.2]
const TIP_WIDE = 1.2
// Folded, the first bracts are long enough to meet in a point over the tip.
const WRAP_LONG = 0.9
// A shut bract is at least this many stem radii long, so the bud has points before its body has grown.
const WRAP_REACH = [1.9, 2.5, 3.1]
const WRAP_TIP = [0.55, 0.4, 0.15]
const WRAP_TALL = 0.5
const WRAP_WIDE = 0.5
const WRAP_BY_R = 0.002
const UNFOLD_VARY_S = 0.45
const HAIR_IN_M = 0.004
// The shut bud stands on the stem's tip before the body has a size of its own, and is the body's size again from 26.6 s.
const WRAP_IN_S = [20.5, 24.2]
const WRAP_R = 0.0035
const WRAP_DEEP = 0.85
const TIP_HIGH = 0.0048

interface Bract { leafy: number; claw: number; crown: number; spread: number; star: number; point: number; keel: number; low: number; away: number; series: number; rank: number; az: number; foot: number; long: number; wide: number; tail: number; twist: number; side: number; tip: number; lean: number; hook: number; reflex: number; phase: number; waves: number; hug: number; rmin: number; fold: number; seed: number }

export function create(options: PartOptions): PlantPart | null {
  const shape = options.detail === 'hero' && options.variant !== 0 ? COMPANION_SHAPE : SHAPE[options.detail]
  const seed = combine(streamSeed('bud'), options.variant)
  const rnd = (i: number, j: number): number => hash01(seed, i, j)
  const cols = shape.sides + 1
  const rings = shape.neck.length + shape.dome.length + shape.side.length + shape.floor.length
  const floorRow = rings - shape.floor.length
  const bodyCount = rings * cols
  const perBract = shape.nu * shape.nv
  const count = bodyCount + shape.bracts * perBract

  const bracts: Bract[] = []
  const narrow = Math.min(1, BRACTS_BROAD / Math.max(shape.bracts, 1))
  const edge = Float32Array.from({ length: shape.bracts * shape.nu * 2 }, (_, n) => 1 + 0.16 * (hash01(seed, 900, n) - 0.5))
  const turn = TAU * rnd(1, 0)
  const each = Math.max(1, Math.ceil(shape.bracts / 3))
  for (let i = 0; i < shape.bracts; i++) {
    const series = i % 3
    bracts.push({
      series,
      rank: series / 2,
      az: turn + ((Math.floor(i / 3) + series / 3 + (rnd(2, i) - 0.5) * 0.3) / each) * TAU,
      foot: FEET[series] + (rnd(15, i) - 0.5) * 0.07,
      long: options.variant === 0 ? LONG[series] * (1 - LONG_VARY[series] * rnd(3, i)) : LONG_NEIGHBOR[series] * (0.95 + 0.1 * rnd(3, i)),
      wide: ((series === 2 ? 0.98 : 0.9) + 0.16 * rnd(4, i)) * narrow,
      tail: 0.2 + 0.08 * rnd(5, i),
      point: 0.7 + 0.1 * rnd(903, i),
      twist: (rnd(6, i) - 0.5) * 0.6,
      side: (rnd(7, i) - 0.5) * 0.4,
      tip: (rnd(8, i) - 0.35) * 0.9,
      lean: (rnd(16, i) - 0.5) * 0.3,
      hook: HOOK * (0.5 + 0.5 * rnd(18, i)),
      low: series === 2 ? LOW_CURL * (0.9 + 0.45 * rnd(17, i)) : LOW_CURL * (0.35 + 0.75 * rnd(17, i)),
      away: LOW_AWAY + 0.75 * rnd(901, i),
      reflex: series === 2 ? 1.0 + 0.9 * rnd(19, i) : series === 1 ? 0.7 + 0.9 * rnd(19, i) : 0.3 + 0.8 * rnd(19, i),
      phase: TAU * rnd(9, i),
      waves: 2 + 2.5 * rnd(10, i),
      hug: HUG[series] + 0.05 * rnd(11, i),
      rmin: 0.0008 + 0.0045 * rnd(12, i),
      fold: 0.14 + 0.26 * rnd(13, i),
      keel: KEEL * (0.65 + 0.35 * rnd(902, i)),
      seed: rnd(14, i),
      spread: series === 0 ? SHUT_SPREAD * (Math.floor(i / 3) % 2 === 0 ? 0.75 + 0.25 * rnd(904, i) : 0.25 * rnd(904, i)) : 0,
      star: series === 0 ? SHUT_SPREAD * rnd(904, i) : 0,
      crown: series === 2 && Math.floor(i / 3) % 2 === 0 ? 1 : 0,
      claw: series === 2 && Math.floor(i / 3) % 3 === 0 ? 1 : 0,
      leafy: series === 0 ? (Math.floor(i / 3) % 2 === 0 ? 0.75 + 0.25 * rnd(904, i) : 0.25 * rnd(904, i)) : series === 1 ? smoothstep(0.6, 0.8, rnd(905, i)) : 0,
    })
  }

  const own = bracts.map((_, i) => ({ long: 2 * rnd(41, i) - 1, wide: 2 * rnd(42, i) - 1, lean: rnd(43, i) - 0.35, tip: 2 * rnd(44, i) - 1, bent: i % 3 < 2 && rnd(45, i) < 0.14 ? 0.9 + 0.7 * rnd(46, i) : 0 }))
  const geometry = partGeometry(options)
  const slots = [new Float32Array(count * 3), new Float32Array(count * 3)]
  const normalSlots = [new Float32Array(count * 3), options.places ? null : new Float32Array(count * 3)]
  const info = new Float32Array(count * 4)
  const index: number[] = []
  const grid = (base: number, nu: number, nv: number) => {
    for (let a = 0; a < nu - 1; a++) {
      for (let b = 0; b < nv - 1; b++) {
        const v = base + a * nv + b
        index.push(v, v + nv, v + 1, v + 1, v + nv, v + nv + 1)
      }
    }
  }
  grid(0, rings, cols)
  for (let i = 0; i < shape.bracts; i++) grid(bodyCount + i * perBract, shape.nu, shape.nv)

  const spans = shape.neck.length + shape.dome.length + shape.side.length - 1
  for (let a = 0; a < rings; a++) {
    for (let b = 0; b < cols; b++) {
      const v = (a * cols + b) * 4
      const onFloor = a >= floorRow
      info[v] = onFloor ? shape.floor[a - floorRow] : spans > 0 ? a / spans : 0
      info[v + 1] = (b / shape.sides) * TAU
      info[v + 3] = onFloor ? 1 : 0
    }
  }
  for (let i = 0; i < shape.bracts; i++) {
    for (let a = 0; a < shape.nu; a++) {
      for (let b = 0; b < shape.nv; b++) {
        const v = (bodyCount + i * perBract + a * shape.nv + b) * 4
        info[v] = a / (shape.nu - 1)
        info[v + 1] = (b / (shape.nv - 1)) * 2 - 1
        info[v + 2] = bracts[i].seed
        info[v + 3] = 2 + bracts[i].rank
      }
    }
  }

  const dynamic = (array: Float32Array, size: number) => new THREE.BufferAttribute(array, size).setUsage(THREE.DynamicDrawUsage)
  const position = dynamic(slots[0], 3)
  const positionB = options.places ? null : dynamic(slots[1], 3)
  const normal = dynamic(normalSlots[0] as Float32Array, 3)
  const normalB = normalSlots[1] ? dynamic(normalSlots[1], 3) : null
  geometry.setAttribute('position', position)
  if (positionB) geometry.setAttribute('positionB', positionB)
  geometry.setAttribute('normal', normal)
  if (normalB) geometry.setAttribute('normalB', normalB)
  // What each slot was filled with beside the shape: the head's middle and radius, how far the bud has opened, how shut it is and how early.
  const kept = [new Float32Array(7), new Float32Array(7)]
  const filled = [false, false]
  const led = [false, false]
  geometry.setAttribute('aInfo', new THREE.BufferAttribute(info, 4))
  geometry.setIndex(index)
  const uniforms = { uBudOpen: { value: 0 }, uBudShut: { value: 0 }, uBudEarly: { value: 0 }, uBudHead: { value: new THREE.Vector4(0, 0, 0, 1) } }
  const surface = makePartSurface(options, { name: 'bud', vertex, fragment, side: THREE.DoubleSide, uniforms })
  const mesh = partMesh(geometry, surface)

  const share = options.variant === 0 ? 1 : 0.25
  const backHairs = Math.floor(shape.backHairs * share)
  const edgeEach = shape.bracts > 0 ? Math.floor((shape.edgeHairs * share) / shape.bracts / 2) : 0
  const faceEach = shape.bracts > 0 ? Math.floor((shape.faceHairs * share) / shape.bracts) : 0
  const edgeCount = shape.bracts * edgeEach * 2
  const hairCount = backHairs + edgeCount + shape.bracts * faceEach
  const downEach = shape.bracts > 0 ? Math.floor((shape.downHairs * share) / shape.bracts / 2) : 0
  const downCount = shape.bracts * downEach * 2
  const iceEach = shape.bracts > 0 ? Math.floor((shape.crystals * share) / shape.bracts / 2) : 0
  const ice: CrystalSet | null = createCrystals(options, shape.bracts * iceEach * 2, 'bud crystals', false)
  const iceCount = ice ? ice.count : 0
  const furCount = hairCount + downCount
  const hairs: HairSet | null = hairCount > 0 ? createHairs(options, hairCount, 'bud hairs', [0.45, 0.48, 0.4], HAIR_WIDTH_M) : null
  const down: HairSet | null = downCount > 0 ? createHairs(options, downCount, 'bud down', [0.45, 0.48, 0.4], DOWN_WIDTH_M) : null

  const stations = shape.stations
  const stationCount = stations.length
  const lastBack = shape.neck.length + (shape.dome.length - 1) * 0.5
  const lastBackRing = Math.max(1, Math.ceil(lastBack))
  const backFrameCount = lastBackRing + 1
  const bractStationCount = shape.bracts * stationCount
  const edgeFrameBase = backFrameCount
  const faceFrameBase = edgeFrameBase + bractStationCount
  const openDownFrameBase = bractStationCount
  const hairFrames: HairFrames | null = hairs && stationCount >= 2 ? createHairFrames(backFrameCount + bractStationCount * 2) : null
  const downFrames: HairFrames | null = down && stationCount >= 2 ? createHairFrames(bractStationCount * 2) : null

  const bractStationOf = (u: number): [number, number] => {
    const nuSpan = Math.max(1, shape.nu - 1)
    let s = 0
    while (s < stationCount - 2 && stations[s + 1] / nuSpan < u) s++
    const u0 = stations[s] / nuSpan
    const u1 = stations[s + 1] / nuSpan
    return [s, clamp((u - u0) / Math.max(1e-6, u1 - u0), 0, 1)]
  }

  if (hairs && hairFrames) {
    const seats = hairs.bindFrames(hairFrames, 0.0015)
    let seatIdx = 0
    for (let i = 0; i < backHairs; i++, seatIdx++) {
      const along = Math.pow(rnd(20, i), 1.4)
      const fa = along * lastBack
      const r0 = Math.min(Math.floor(fa), lastBackRing - 1)
      const fu = clamp(fa - r0, 0, 1)
      const theta = rnd(21, i) * TAU
      const baseLen = (0.0011 + 0.0022 * rnd(22, i)) * lerp(1.25, 0.55, along)
      const j0 = hash01(seed, 700, i) - 0.5
      const j1 = hash01(seed, 701, i) - 0.5
      const j2 = hash01(seed, 702, i) - 0.5
      const ownVal = hash01(seed, 703, i)
      const domeFrac = fa >= shape.neck.length ? (fa - shape.neck.length) / Math.max(1, shape.dome.length - 1) : -1
      const psi = domeFrac >= 0 ? 0.42 + (Math.PI / 2 - 0.42) * domeFrac : Math.PI / 2
      const o = seatIdx * 12
      seats[o] = r0
      seats[o + 1] = r0 + 1
      seats[o + 2] = fu
      seats[o + 3] = baseLen
      seats[o + 4] = Math.cos(theta)
      seats[o + 5] = Math.sin(theta)
      seats[o + 6] = 1
      seats[o + 7] = ownVal
      seats[o + 8] = j1 * 0.5
      seats[o + 9] = -Math.cos(psi) - 0.15 + j2 * 0.5
      seats[o + 10] = Math.sin(psi) + j0 * 0.5
      seats[o + 11] = 0
    }
    const perBractHairs = edgeEach * 2 + faceEach
    for (let b = 0; b < shape.bracts; b++) {
      for (let i = 0; i < edgeEach * 2; i++, seatIdx++) {
        const origI = backHairs + b * perBractHairs + i
        const u = 0.03 + 0.97 * Math.pow(rnd(23 + b, i), 0.75)
        const left = i % 2 === 0
        const baseLen = 0.001 + 0.001 * rnd(123 + b, i)
        const [s, fu] = bractStationOf(u)
        const f0 = edgeFrameBase + b * stationCount + s
        const j0 = hash01(seed, 700, origI) - 0.5
        const j2 = hash01(seed, 702, origI) - 0.5
        const ownVal = hash01(seed, 703, origI)
        const o = seatIdx * 12
        seats[o] = f0
        seats[o + 1] = f0 + 1
        seats[o + 2] = fu
        seats[o + 3] = baseLen
        seats[o + 4] = left ? 1 : 0
        seats[o + 5] = left ? 0 : 1
        seats[o + 6] = 0
        seats[o + 7] = ownVal
        seats[o + 8] = left ? 1 : -1
        seats[o + 9] = 0.35 + j0 * 0.5
        seats[o + 10] = 0.15 + j2 * 0.9
        seats[o + 11] = 0
      }
    }
    for (let b = 0; b < shape.bracts; b++) {
      for (let i = 0; i < faceEach; i++, seatIdx++) {
        const origI = backHairs + b * perBractHairs + edgeEach * 2 + i
        const keel = rnd(223 + b, i) < 0.3
        const u = keel ? 0.08 + 0.9 * rnd(323 + b, i) : 0.15 + 0.8 * rnd(323 + b, i)
        const across = keel ? 0.5 + (rnd(423 + b, i) - 0.5) * 0.08 : 0.06 + 0.88 * rnd(423 + b, i)
        const baseLen = keel ? 0.0016 + 0.002 * rnd(523 + b, i) : 0.001 + 0.0016 * rnd(523 + b, i)
        const [s, fu] = bractStationOf(u)
        const f0 = faceFrameBase + b * stationCount + s
        const j0 = hash01(seed, 700, origI) - 0.5
        const j1 = hash01(seed, 701, origI) - 0.5
        const j2 = hash01(seed, 702, origI) - 0.5
        const ownVal = hash01(seed, 703, origI)
        const o = seatIdx * 12
        seats[o] = f0
        seats[o + 1] = f0 + 1
        seats[o + 2] = fu
        seats[o + 3] = baseLen
        seats[o + 4] = across <= 0.5 ? (0.5 - across) * 2 : 0
        seats[o + 5] = across > 0.5 ? (across - 0.5) * 2 : 0
        seats[o + 6] = 2
        seats[o + 7] = ownVal
        seats[o + 8] = -j1 * 0.5
        seats[o + 9] = 0.5 + j0 * 0.5
        seats[o + 10] = 1 + j2 * 0.5
        seats[o + 11] = 0
      }
    }
    hairs.sealSeats()
  }

  let shutDownCount = 0
  if (down && downFrames) {
    const seats = down.bindFrames(downFrames, 0.0008)
    for (let n = 0; n < downCount; n++) {
      if (hash01(seed, 703, hairCount + n) < DOWN_SHUT) shutDownCount++
    }
    let shutCursor = 0
    let openCursor = shutDownCount
    let rawIdx = 0
    for (let b = 0; b < shape.bracts; b++) {
      for (let i = 0; i < downEach * 2; i++, rawIdx++) {
        const origI = hairCount + rawIdx
        const left = i % 2 === 0
        const u = 0.02 + 0.98 * Math.pow(rnd(1023 + b, i), 0.75)
        const baseLen = 0.0005 + 0.0006 * rnd(1123 + b, i)
        const ownVal = hash01(seed, 703, origI)
        const isShut = ownVal < DOWN_SHUT
        const [s, fu] = bractStationOf(u)
        const f0 = (isShut ? 0 : openDownFrameBase) + b * stationCount + s
        const dst = isShut ? shutCursor++ : openCursor++
        const o = dst * 12
        seats[o] = f0
        seats[o + 1] = f0 + 1
        seats[o + 2] = fu
        seats[o + 3] = baseLen
        seats[o + 4] = left ? 1 : 0
        seats[o + 5] = left ? 0 : 1
        seats[o + 6] = 0
        seats[o + 7] = ownVal
        seats[o + 8] = left ? 1 : -1
        seats[o + 9] = 0
        seats[o + 10] = 0
        seats[o + 11] = 0
      }
    }
    down.sealSeats()
  }

  const iceV00 = new Int32Array(iceCount)
  const iceV10 = new Int32Array(iceCount)
  const iceW = new Float32Array(iceCount * 4)
  const iceKind = new Int8Array(iceCount)
  const iceLong = new Float32Array(iceCount)
  const iceOpen = new Float32Array(iceCount)
  const iceLeanW = new Float32Array(iceCount)
  const iceJitter = new Float32Array(iceCount * 3)
  if (ice) {
    let n = 0
    for (let b = 0; b < shape.bracts; b++) {
      const base = bodyCount + b * perBract
      const bSeed = bracts[b].seed
      for (let i = 0; i < iceEach * 2; i++, n++) {
        const origI = furCount + n
        const left = i % 2 === 0
        const u = rnd(2223 + b, i) < 0.12 ? 0.9 + 0.1 * rnd(2023 + b, i) : 0.22 + 0.78 * rnd(2023 + b, i)
        const fa = u * (shape.nu - 1)
        const fb = left ? 0 : shape.nv - 1
        const a = Math.min(Math.floor(fa), shape.nu - 2)
        const c = Math.min(Math.floor(fb), shape.nv - 2)
        const ga = fa - a
        const gb = fb - c
        const v00 = (base + a * shape.nv + c) * 3
        iceV00[n] = v00
        iceV10[n] = v00 + shape.nv * 3
        iceW[n * 4] = (1 - ga) * (1 - gb)
        iceW[n * 4 + 1] = (1 - ga) * gb
        iceW[n * 4 + 2] = ga * (1 - gb)
        iceW[n * 4 + 3] = ga * gb
        iceKind[n] = left ? -4 : 4
        iceLong[n] = (u < 0.9 ? 0.005 : 0.0018) * (0.75 + 0.5 * rnd(2123 + b, i)) * (bracts[b].series === 2 ? 0.4 : 1)
        const reached = smoothstep(0.1, 0.35, u) * (0.75 + 0.25 * smoothstep(-0.25, 0.25, Math.sin(u * 11 + bSeed * 40 + (left ? 0 : 2.1)) * Math.sin(u * 5.3 + bSeed * 17 + 1) + 0.15))
        iceOpen[n] = u >= 0.9 ? 1.3 : rnd(2323, n) < 0.1 ? 0 : 1.4 * reached
        iceJitter[n * 3] = hash01(seed, 700, origI) - 0.5
        iceJitter[n * 3 + 1] = hash01(seed, 701, origI) - 0.5
        iceJitter[n * 3 + 2] = hash01(seed, 702, origI) - 0.5
        iceLeanW[n] = (u < 0.9 ? 1 : 2) + Math.min(hash01(seed, 703, origI), 0.999)
      }
    }
  }

  const floor: FloorPoint = { x: 0, y: 0, z: 0, nx: 0, ny: 1, nz: 0, ox: 1, oy: 0, oz: 0 }
  const sub = shape.nu > 1 ? Math.max(2, Math.ceil((options.variant === 0 ? 21 : 8) / (shape.nu - 1))) : 1
  const totalSteps = Math.max(1, (shape.nu - 1) * sub)
  const rowR = new Float32Array(Math.max(shape.nu, 1))
  const rowH = new Float32Array(Math.max(shape.nu, 1))
  const rowT = new Float32Array(Math.max(shape.nu, 1))
  const hugs = new Float32Array(shape.bracts)

  const ringAz = new Float64Array(cols)
  const ringCos = new Float64Array(cols)
  const ringSin = new Float64Array(cols)
  for (let b = 0; b < cols; b++) {
    const t = (b / shape.sides) * TAU
    ringAz[b] = t
    ringCos[b] = Math.cos(t)
    ringSin[b] = Math.sin(t)
  }

  const bCosAz = new Float64Array(shape.bracts)
  const bSinAz = new Float64Array(shape.bracts)
  for (let i = 0; i < shape.bracts; i++) {
    bCosAz[i] = Math.cos(bracts[i].az)
    bSinAz[i] = Math.sin(bracts[i].az)
  }

  const stepU = new Float64Array(totalSteps + 1)
  const stepTipW2 = new Float64Array(totalSteps + 1)
  const stepSm60 = new Float64Array(totalSteps + 1)
  const stepSm40 = new Float64Array(totalSteps + 1)
  const stepSm65 = new Float64Array(totalSteps + 1)
  const stepSm74 = new Float64Array(totalSteps + 1)
  const stepSm20 = new Float64Array(totalSteps + 1)
  const stepBulgeU0 = new Float64Array(totalSteps + 1)
  const stepBulgeU = new Float64Array(totalSteps + 1)
  const stepBend = new Float64Array(3 * (totalSteps + 1))
  for (let step = 0; step <= totalSteps; step++) {
    const u = step / totalSteps
    stepU[step] = u
    const tw = smoothstep(0.55, 1, u)
    stepTipW2[step] = tw * tw
    stepSm60[step] = smoothstep(0.6, 1, u)
    stepSm40[step] = smoothstep(0.4, 1, u)
    stepSm65[step] = smoothstep(0.65, 1, u)
    stepSm74[step] = smoothstep(0.74, 0.92, u)
    stepSm20[step] = smoothstep(0.2, 1, u)
    stepBulgeU0[step] = smoothstep(0.12, 0.55, u)
    stepBulgeU[step] = smoothstep(0, 0.55, u)
    for (let s = 0; s < 3; s++) {
      stepBend[s * (totalSteps + 1) + step] = smoothstep(BEND_FROM[s], BEND_FROM[s] + 0.3, u)
    }
  }

  const rowU = new Float64Array(Math.max(shape.nu, 1))
  const rowU3 = new Float64Array(Math.max(shape.nu, 1))
  const rowTurnSm = new Float64Array(Math.max(shape.nu, 1))
  const rowBody = new Float64Array(Math.max(shape.nu, 1))
  const rowFoldSm = new Float64Array(Math.max(shape.nu, 1))
  const rowTuftTan = new Float64Array(Math.max(shape.nu, 1))
  const rowBellySin = new Float64Array(Math.max(shape.nu, 1))
  const rowHugTight = new Float64Array(Math.max(shape.nu, 1))
  for (let a = 0; a < shape.nu; a++) {
    const u = shape.nu > 1 ? a / (shape.nu - 1) : 0
    rowU[a] = u
    rowU3[a] = u * u * u
    rowTurnSm[a] = smoothstep(0.05, 0.35, u)
    rowBody[a] = 0.86 + 0.14 * Math.sin(Math.PI * clamp(u / 0.42))
    rowFoldSm[a] = smoothstep(0.25, 0.65, u)
    rowTuftTan[a] = Math.tan(TUFT_FOLD * smoothstep(0.05, 0.4, u))
    rowBellySin[a] = Math.sin(Math.PI * clamp(u / 0.75))
    rowHugTight[a] = 1 - smoothstep(0.55, 1, u)
  }

  const colX = new Float64Array(Math.max(shape.nv, 1))
  const colKeelExp = new Float64Array(Math.max(shape.nv, 1))
  const colBellyW = new Float64Array(Math.max(shape.nv, 1))
  for (let b = 0; b < shape.nv; b++) {
    const x = shape.nv > 1 ? (b / (shape.nv - 1)) * 2 - 1 : 0
    colX[b] = x
    colKeelExp[b] = Math.exp(-(x * x) / 0.0256)
    colBellyW[b] = 1 - x * x
  }

  const iaTwCos = new Float32Array(shape.bracts * shape.nu)
  const iaTwSin = new Float32Array(shape.bracts * shape.nu)
  const iaTail = new Float32Array(shape.bracts * shape.nu)
  const iaTailMix = new Float32Array(shape.bracts * shape.nu)
  const iabWave = new Float32Array(shape.bracts * perBract)
  for (let i = 0; i < shape.bracts; i++) {
    const k = bracts[i]
    for (let a = 0; a < shape.nu; a++) {
      const u = rowU[a]
      const ia = i * shape.nu + a
      const tw = k.twist * smoothstep(0.35, 1, u)
      iaTwCos[ia] = Math.cos(tw)
      iaTwSin[ia] = Math.sin(tw)
      iaTail[ia] = 0.95 * Math.pow(clamp((k.point - u) / (k.point - 0.2)), 0.8) + POINT_WIDE * Math.pow(1 - u, 0.9) + 0.004
      iaTailMix[ia] = smoothstep(k.tail + 0.02, k.tail + 0.2, u)
      const wSm = 0.07 * smoothstep(0.1, 0.4, u)
      for (let b = 0; b < shape.nv; b++) {
        const x = colX[b]
        iabWave[i * perBract + a * shape.nv + b] = wSm * Math.sin(u * TAU * k.waves + k.phase + (x > 0 ? 0 : 1.7)) * Math.abs(x * x * x)
      }
    }
  }

  const rLen = new Float64Array(rayCount)
  const rOpen = new Float64Array(rayCount)
  const rBehind = new Float64Array(rayCount)
  const rGrown = new Float64Array(rayCount)
  const rOpenedS = new Float64Array(3 * rayCount)
  const rPassedS = new Float64Array(3 * rayCount)

  const gridNormals = (pos: Float32Array, nor: Float32Array, base: number, nu: number, nv: number, wrap: boolean, fx: number, fy: number, fz: number) => {
    for (let a = 0; a < nu; a++) {
      const a0 = Math.max(0, a - 1)
      const a1 = Math.min(nu - 1, a + 1)
      for (let b = 0; b < nv; b++) {
        const b0 = b > 0 ? b - 1 : wrap ? nv - 2 : 0
        const b1 = b < nv - 1 ? b + 1 : wrap ? 1 : nv - 1
        const pa0 = (base + a0 * nv + b) * 3
        const pa1 = (base + a1 * nv + b) * 3
        const pb0 = (base + a * nv + b0) * 3
        const pb1 = (base + a * nv + b1) * 3
        const ux = pos[pa1] - pos[pa0]
        const uy = pos[pa1 + 1] - pos[pa0 + 1]
        const uz = pos[pa1 + 2] - pos[pa0 + 2]
        const vx = pos[pb1] - pos[pb0]
        const vy = pos[pb1 + 1] - pos[pb0 + 1]
        const vz = pos[pb1 + 2] - pos[pb0 + 2]
        let x = vy * uz - vz * uy
        let y = vz * ux - vx * uz
        let z = vx * uy - vy * ux
        const l = norm(x, y, z)
        if (l > 1e-14) {
          x /= l
          y /= l
          z /= l
        } else {
          x = fx
          y = fy
          z = fz
        }
        const v = (base + a * nv + b) * 3
        nor[v] = x
        nor[v + 1] = y
        nor[v + 2] = z
      }
    }
  }

  const loneAt = (time: number): number => (options.variant === 0 ? WRAP_R * smoothstep(WRAP_IN_S[0], WRAP_IN_S[1], time) * (1 - smoothstep(bloom0 - 17.4, bloom0 - 16.4, time)) : 0)

  const fillShape = (out: Float32Array, nor: Float32Array | null, pose: Pose) => {
    const time = pose.time
    const head = pose.head
    const lone = loneAt(time)
    const R = lone > 0 ? norm(head.radius, lone) : head.radius
    const D = lone > 0 ? norm(head.depth, WRAP_DEEP * lone) : head.depth
    const { ax, ay, az, px, py, pz, qx, qy, qz } = head
    const cx = head.cx + ax * (D - head.depth) * SEAT
    const cy = head.cy + ay * (D - head.depth) * SEAT
    const cz = head.cz + az * (D - head.depth) * SEAT
    if (R < 1e-6) {
      const end = stemAt(pose, 1)
      for (let v = 0; v < count; v++) {
        out[v * 3] = end.x
        out[v * 3 + 1] = end.y
        out[v * 3 + 2] = end.z
      }
      if (nor) {
        for (let v = 0; v < count; v++) {
          const nv = v * 3
          nor[nv] = 0
          nor[nv + 1] = 1
          nor[nv + 2] = 0
        }
      }
      return
    }
    const tight = 1 - smoothstep(bloom0 - 4, bloom0 - 0.7, time)
    const globe = tight * smoothstep(bloom0 - 15, bloom0 - 9, time)
    // The bloom is a kept unit: from 5.5 s before the bloom stage begins the low starred build eases into the build the bloom opens from, and is that exactly from 3 s before it, where the bloom's segment starts.
    // A neighbor's clock runs up to 4.6 s behind in the bloom, so it keeps the bloom's build throughout.
    const early = options.variant === 0 ? 1 - smoothstep(bloom0 - 5.5, bloom0 - 3, time) : 0
    const hw = (WIDEST - SHUT_LOW * globe * early) * D
    const hr = FLOOR_RIM * D
    const Hb = hw + D
    const grown = Math.min(1, heightAt(time) / 0.006)
    const stemR = (u: number): number => Math.max(stemRadius(time, u) * grown, NECK_FLARE * R * Math.max(0, (u - 0.97) / 0.03))
    // The dome starts where it is as wide as the stem's end, a hair behind the joint.
    const Rw = R * (1 + SHOULDER * (1 - 0.78 * smoothstep(0.15, 0.85, headOpen(time))))
    const sideR = (h: number): number => R + (Rw - R) * Math.sqrt(Math.max(0, 1 - ((h - hw) / (hr - hw)) ** 2))
    const sR1 = stemR(1)
    const sin0 = clamp(sR1 / Rw, 0.1, 0.92)
    const psi0 = Math.min(Math.asin(sin0), Math.acos(clamp((hw + SEAT * D) / Hb, 0, 1)) + 0.02)

    let row = 0
    const endNode = stemAt(pose, 1)
    const flip = qx * endNode.bx + qy * endNode.by + qz * endNode.bz < 0 ? -1 : 1
    // The sleeve round the stem's end comes out of the end itself: first as wide as the stem, then down along it.
    const wide = smoothstep(0, 0.0004, R)
    const down = smoothstep(0, WRAP_BY_R, R)
    for (const back of shape.neck) {
      const u = Math.max(0, 1 - (back * down) / Math.max(pose.length, 1e-6))
      const n = stemAt(pose, u)
      const radius = (stemR(u) + 0.0003) * wide
      for (let b = 0; b < cols; b++) {
        const c = ringCos[b]
        const s = ringSin[b] * flip
        const v = (row * cols + b) * 3
        out[v] = n.x + (n.rx * c + n.bx * s) * radius
        out[v + 1] = n.y + (n.ry * c + n.by * s) * radius
        out[v + 2] = n.z + (n.rz * c + n.bz * s) * radius
      }
      row++
    }
    const ring = (r: number, h: number) => {
      for (let b = 0; b < cols; b++) {
        const c = ringCos[b]
        const s = ringSin[b]
        const v = (row * cols + b) * 3
        out[v] = cx + ax * h + (px * c + qx * s) * r
        out[v + 1] = cy + ay * h + (py * c + qy * s) * r
        out[v + 2] = cz + az * h + (pz * c + qz * s) * r
      }
      row++
    }
    for (const f of shape.dome) {
      const psi = psi0 + (Math.PI / 2 - psi0) * f
      ring(Rw * Math.sin(psi), hw - Hb * Math.cos(psi))
    }
    for (const f of shape.side) ring(sideR(hw + (hr - hw) * f), hw + (hr - hw) * f)
    for (const rho of shape.floor) {
      for (let b = 0; b < cols; b++) {
        floorAt(pose, rho, ringAz[b], floor)
        const v = (row * cols + b) * 3
        out[v] = floor.x
        out[v + 1] = floor.y
        out[v + 2] = floor.z
      }
      row++
    }
    if (nor) {
      gridNormals(out, nor, 0, floorRow, cols, true, -ax, -ay, -az)
      gridNormals(out, nor, floorRow * cols, shape.floor.length, cols, true, ax, ay, az)
    }
    if (shape.bracts === 0) return

    const open = headOpen(time)
    const ready = smoothstep(bloom0 - 0.7, bloom0 + 1.2, time)
    const shut = smoothstep(bloom0 - 13, bloom0 - 5, time)
    const back = smoothstep(0.15, 0.9, open)
    const over = 1 - smoothstep(bloom0 - 0.7, bloom0 + 0.3, time)
    const Hf = FLOOR_DOME * D + 0.3 * R * (1 - 0.8 * open)
    const small = clamp(R / 0.03, 0.3, 1)
    const young = 1 - smoothstep(bloom0 - 17, bloom0 - 11, time)
    const lengthen = smoothstep(bloom0 - 18 + LENGTHEN_S[0], bloom0 - 18 + LENGTHEN_S[1], time)
    const tipR = (1 - smoothstep(bloom0 - 16, bloom0 - 14, time)) * (TIP_WIDE * sR1 + 0.0004)
    const tipH = -SEAT * D
    const wind = pose.inputs.wind
    const realTime = realOf(pose.inputs, time)
    const wrapLong = 1 + WRAP_LONG * (1 - smoothstep(bloom0 - 17.8, bloom0 - 17, time))
    const inBud = Math.min(time, bloom0 - 3)
    const ey = early * (1 - young)
    const awn = lerp(0.74, 0.66, ey)
    const awnSm0 = lerp(0.34, 0.28, ey)
    const awnWide = lerp(AWN_WIDE[0], AWN_WIDE[1], ey)
    const rollA = lerp(0.15, 0.45, tight)
    const rollB = lerp(0.6, 0.8, tight)

    for (let r = 0; r < rayCount; r++) {
      const rl = rayLength(r, time)
      rLen[r] = rl
      rOpen[r] = rayOpen(r, time)
      rBehind[r] = lerp(-1.9, rayAngle(r, time) + RAY_CLEAR, smoothstep(0.002, 0.03, rl))
      rGrown[r] = rl / rayLength(r, 1e3)
      for (let s = 0; s < 3; s++) {
        const sr = s * rayCount + r
        rOpenedS[sr] = (rayOpen(r, time + FOLD_LEAD[s]) + rayOpen(r, time + FOLD_LEAD[s] - FOLD_SLOW)) / 8
        rPassedS[sr] = rayOpen(r, time - BACK_LAG[s]) / 4
      }
    }

    for (let i = 0; i < shape.bracts; i++) {
      const k = bracts[i]
      const j = i * 3 + 2 - k.series
      const spread = lerp(k.star, k.spread, early)
      const crown = lerp(k.crown, k.claw, early)
      const tuft = k.series === 2 ? 1 - crown : 0
      const mine = own[i]
      const unfoldFrom = bloom0 - 18 + UNFOLD_S[k.series] + UNFOLD_VARY_S * (0.5 + 0.5 * mine.long)
      const unfold = smoothstep(unfoldFrom, unfoldFrom + UNFOLD_TAKES_S * (1 + 0.25 * mine.wide), time)
      const closed = (1 - unfold) * young
      const vary = early * globe
      const brLen = bractLength(i, time)
      const L = Math.max(WRAP_REACH[k.series] * k.long * sR1 * down * closed, brLen * k.long * wrapLong * (1 + VARY.long * mine.long * vary) * lerp(1, lerp(SHUT_LONG_LATE[k.series], SHUT_LONG[k.series], early), lerp(tight, globe, early)) * (1 + young * (YOUNG_LONG[k.series] * k.leafy * lengthen - YOUNG_SHORT[k.series] * (1 - k.leafy))) * (1 + (lerp(CROWN_LONG_LATE, CROWN_LONG, early) * crown + TUFT_LONG * tuft * early + lerp(SPREAD_LONG_LATE, SPREAD_LONG, early) * spread) * globe))
      const W = Math.max(WRAP_WIDE * sR1 * down * closed, Math.min(BROAD[k.series] * brLen, 0.48 * R * (1 + 1.2 * young), 0.019) * (1 + YOUNG_WIDE[k.series] * young) * k.wide * (1 + VARY.wide * mine.wide * vary) * lerp(1, lerp(SHUT_BROAD_LATE[k.series], SHUT_BROAD[k.series], early), tight) * (1 - SPREAD_SLIM * spread * globe * early) * (1 + TUFT_BROAD * tuft * globe * early) * (1 - CROWN_SLIM * crown * globe * early))
      // The bract stays behind the nearest rays once they have any length, so it swings back just ahead of them.
      const turns = k.az / TAU
      const atFloor = Math.floor((turns - Math.floor(turns)) * rayCount)
      let behind = -Math.PI
      let opened = 0
      let rayLong = 0
      let low = 1
      let grownR = 0
      let passed = 0
      const sOff = k.series * rayCount
      for (let m = -1; m <= 2; m++) {
        const ray = (((atFloor + m) % rayCount) + rayCount) % rayCount
        if (rBehind[ray] > behind) behind = rBehind[ray]
        opened += rOpenedS[sOff + ray]
        if (rLen[ray] > rayLong) rayLong = rLen[ray]
        passed += rPassedS[sOff + ray]
        if (rOpen[ray] < low) low = rOpen[ray]
        if (rGrown[ray] > grownR) grownR = rGrown[ray]
      }
      const co = bCosAz[i]
      const so = bSinAz[i]
      const ox = px * co + qx * so
      const oy = py * co + qy * so
      const oz = pz * co + qz * so
      const under = smoothstep(-0.1, 0.6, -oy)
      const upper = smoothstep(-0.22, 0.16, oy)
      const folded = smoothstep(0, 1, opened)
      const held = 1 - smoothstep(0.1, 0.5, low)
      const cone = Math.pow(smoothstep(0.1, 0.7, grownR), 0.6) * held
      const coneWide = smoothstep(0, 0.12, grownR) * held
      const near = smoothstep(-0.2, 0.4, ox)
      const stayFlank = near * (1 - smoothstep(-0.28, -0.04, oy)) * (1 - smoothstep(0.62, 0.92, -oy))
      const late = COLLAR_LATE * LATE_SHARE[k.series] * near * (1 - smoothstep(0.15, 0.55, oy))
      const collar = smoothstep(bloom0 + COLLAR_FROM + late, bloom0 + COLLAR_FROM + COLLAR_TAKES + late, time)
      const stand = lerp(lerp(STAND[k.series] + k.lean, Math.min(STAND[k.series], -0.35) + 0.3 * k.lean, under), lerp(COLLAR[k.series] + k.lean, k.away, under), collar)
      const upperGone = smoothstep(0.08, 0.58, opened) * upper
      const gone = Math.max(back, smoothstep(0.2, 1, passed), upperGone)
      const foldTo = lerp(FOLD[k.series], 3.92, upper)
      const leanKeep = 1 - 0.94 * upper * gone
      const wrapped = lerp(lerp(bractAngle(j, inBud) - SHUT[k.series] * shut + ((YOUNG_OUT[k.series] + YOUNG_OUT_VARY[k.series] * mine.tip + 0.3 * k.spread + (k.series === 1 ? 0.5 * (k.leafy - 0.5) : 0)) * unfold - YOUNG_IN[k.series] * (1 - unfold)) * young, lerp(SHUT_ANGLE_LATE[k.series], SHUT_ANGLE[k.series], early) + lerp(CROWN_ANGLE_LATE, CROWN_ANGLE, early) * crown + k.lean + VARY.lean * mine.lean * early + lerp(1, SPREAD_OUT, early) * spread, globe), stand, ready)
      const angle = lerp(lerp(wrapped, LOOSE[k.series] + k.lean, smoothstep(0, 0.5, folded)), lerp(FOLD_FIRST[k.series], foldTo, gone * (1 - FOLD_STAY * stayFlank)) + 0.5 * k.lean * leanKeep, folded)
      const hooked = smoothstep(0.3, 0.9, folded)
      const meet = -Math.asin(Math.min(0.8, (1.15 * tipR) / Math.max(L, 1e-6)))
      const hook = (k.hook * (1 - 0.75 * gone) * leanKeep + LOW_HOOK * under) * hooked + k.low * under * collar * (1 - hooked)
      const reflex = k.reflex * ready * (1 - folded) * (1 - 0.8 * under) * (1 - 0.9 * collar)
      const curl = lerp(lerp(lerp(bractCurl(j, inBud), lerp(SHUT_CURL_LATE[k.series], SHUT_CURL[k.series], early) + lerp(1, -SPREAD_OPEN, early) * spread, globe), -FLARE[k.series] * (1 - 0.7 * under), ready), lerp(-0.22, 0.28, upper * gone), folded)
      const hugEnd = lerp(k.hug * (1 - 0.78 * upper * gone), YOUNG_HUG[k.series], young * unfold)
      hugs[i] = hugEnd
      const rayS = Math.sin(behind - RAY_CLEAR)
      const rayC = Math.cos(behind - RAY_CLEAR)
      const pushed = smoothstep(0, 0.008, rayLong)
      const gap = RAY_GAP * pushed
      const sway = wind * 0.05 * flutter(realTime, k.seed)
      const tx = qx * co - px * so
      const ty = qy * co - py * so
      const tz = qz * co - pz * so

      const foot = Math.max(0, k.foot - FEET_LOW[k.series] * tight + (FEET_UP[k.series] + SPREAD_UP * spread) * globe * early)
      let psi = psi0 + (Math.PI / 2 - psi0) * Math.min(foot, 1)
      let h = hw - Hb * Math.cos(psi) + (hr - hw) * SIDE_FEET * clamp((foot - 1) / 0.5)
      let r = h > hw ? sideR(h) : Rw * Math.sin(psi)
      const ds = L / totalSteps
      const bulgeScale = lerp(BULGE_LATE[k.series], BULGE[k.series], early) * R * tight
      const bulgeArr = k.series === 0 ? stepBulgeU0 : stepBulgeU
      const bendBase = k.series * (totalSteps + 1)
      const tipTermA = k.tip * leanKeep * (1 - 0.7 * over * shut) * (1 - 0.5 * closed)
      const wrapTipC = WRAP_TIP[k.series] * closed
      const shutCrownTip = (lerp(SHUT_TIP_LATE[k.series], SHUT_TIP[k.series], early) + lerp(CROWN_TIP_LATE, CROWN_TIP, early) * crown) * globe
      const crownMineTip = (CROWN_HOOK * (2 * k.seed - 1) * crown + VARY.tip * mine.tip * (1 - crown)) * early * globe
      const mineBent = mine.bent * early * globe
      const liftSeries = (2 - k.series) * 0.0012
      const rMinScaled = k.rmin * small
      const tipHighInv = 1 / (TIP_HIGH * (1 + WRAP_TALL * closed))
      const coneEh0 = lerp(Hf, CONE_HIGH * R, cone)
      const coneEa0 = R * (1 + CONE_WIDE * coneWide)
      for (let step = 0; step <= totalSteps; step++) {
        const u = stepU[step]
        const s = u * L
        const lift = (-0.0008 + 0.0011 * smoothstep(0, 0.004, s) + 0.1 * s + liftSeries * smoothstep(0.003, 0.012, s)) * small
        const bulge = bulgeScale * bulgeArr[step]
        let cosPsi = 0
        let sinPsi = 1
        let surfaceAngle = 0
        if (psi < Math.PI / 2) {
          cosPsi = Math.cos(psi)
          sinPsi = Math.sin(psi)
          surfaceAngle = Math.atan2(Rw * cosPsi, Hb * sinPsi)
        }
        const u2 = u * u
        const free = Math.max(lerp(angle - 1.3 * curl * u2, meet, closed), behind, -1.75) + tipTermA * stepTipW2[step] + wrapTipC * stepSm60[step] + shutCrownTip * stepSm40[step] + crownMineTip * stepSm65[step] + mineBent * stepSm74[step] + reflex * stepBend[bendBase + step] + hook * stepSm20[step] + sway * u2
        const Ea = coneEa0 + lift + BULGE_TOP * bulge
        const Eh = coneEh0 + lift + BULGE_HIGH * bulge
        const fr = r / Ea
        const fh = Math.max(0, h - hr) / Eh
        const fh2 = fh * fh
        const onFace = 1 - smoothstep(1, 1.1, fr * fr + (1 - cone) * fh2 + cone * fh2 * fh2)
        const alongFace = onFace > 0 ? (h < hr ? -0.15 * (1 - cone) : Math.atan2(-((1 - cone) * fh + 2 * cone * fh2 * fh) / Eh, fr / Ea)) : -Math.PI
        const theta = Math.max(lerp(surfaceAngle, free, smoothstep(HUG_FROM, hugEnd, u)), lerp(-Math.PI, behind, smoothstep(hw - 0.4 * D, hw, h)), lerp(-Math.PI, alongFace, onFace))
        const Re = Rw + lift + bulge
        if (h < hw) {
          const HbL = Hb + lift
          const dh = h - hw
          const e = (r * r) / (Re * Re) + (dh * dh) / (HbL * HbL)
          if (e < 1) {
            const g = 1 / Math.sqrt(Math.max(e, 1e-9))
            r *= g
            h = hw + dh * g
          }
        } else if (h < hr) r = Math.max(r, sideR(h) + lift + bulge + (Ea - R - lift - bulge) * smoothstep(hw, hr, h))
        else {
          const B = fr * fr + (1 - cone) * fh2
          const G = 2 / (B + Math.sqrt(B * B + 4 * cone * fh2 * fh2) + 1e-12)
          if (G > 1) {
            const g = Math.sqrt(G)
            r *= g
            h = hr + (h - hr) * g
          }
        }
        if (gap > 0) {
          const vr = r - RAY_FOOT * R
          const vh = h - hr
          const al = vr * rayS + vh * rayC
          const clear = vr * rayC - vh * rayS
          if (clear < gap && clear > -0.012 && al > -0.004 && al < rayLong + 0.004) {
            const need = pushed * (gap - clear) * smoothstep(-0.004, 0, al) * (1 - smoothstep(rayLong, rayLong + 0.004, al)) * smoothstep(-0.012, -0.006, clear)
            if (need > 0) {
              r += rayC * need
              h -= rayS * need
            }
          }
        }
        if (r < rMinScaled) r = rMinScaled
        if (tipR > 0) {
          const z = (h - tipH) * tipHighInv
          if (z < 1) r = Math.max(r, tipR * (z > 0 ? Math.sqrt(1 - z * z) : 1))
        }
        if (step % sub === 0) {
          const a = step / sub
          rowR[a] = r
          rowH[a] = h
          rowT[a] = theta
        }
        r += Math.sin(theta) * ds
        h += Math.cos(theta) * ds
        if (psi < Math.PI / 2) psi = Math.min(Math.PI / 2, psi + ds / norm(Rw * cosPsi, Hb * sinPsi))
      }

      const base = bodyCount + i * perBract
      const size = L / 0.046
      const swing = LOW_SWING * under * clamp(ty * 3, -1, 1) * smoothstep(0.15, 0.6, folded) * (1 - 0.5 * gone)
      const foldTarget = lerp(k.fold, k.keel, collar * (1 - folded))
      const foldTightScale = lerp(1, 0.4, tight)
      const tuftTerm = k.series === 2 ? globe * early : 0
      for (let a = 0; a < shape.nu; a++) {
        const u = rowU[a]
        const ia = i * shape.nu + a
        const theta = rowT[a]
        const st = Math.sin(theta)
        const ct = Math.cos(theta)
        const bend = k.side * L * rowU3[a]
        const turn = swing * rowTurnSm[a]
        const cs = Math.cos(turn)
        const sn = Math.sin(turn)
        const o1x = ox * cs + tx * sn
        const o1y = oy * cs + ty * sn
        const o1z = oz * cs + tz * sn
        const t1x = tx * cs - ox * sn
        const t1y = ty * cs - oy * sn
        const t1z = tz * cs - oz * sn
        const reach = rowR[a] - rowR[0]
        const mx = cx + ax * rowH[a] + ox * rowR[0] + o1x * reach + t1x * bend
        const my = cy + ay * rowH[a] + oy * rowR[0] + o1y * reach + t1y * bend
        const mz = cz + az * rowH[a] + oz * rowR[0] + o1z * reach + t1z * bend
        const nx = o1x * ct - ax * st
        const ny = o1y * ct - ay * st
        const nz = o1z * ct - az * st
        const cw = iaTwCos[ia]
        const sw = iaTwSin[ia]
        const wx = t1x * cw + nx * sw
        const wy = t1y * cw + ny * sw
        const wz = t1z * cw + nz * sw
        const ux = nx * cw - t1x * sw
        const uy = ny * cw - t1y * sw
        const uz = nz * cw - t1z * sw
        const even = lerp(1.04, awnWide, smoothstep(awnSm0, awn, u)) * (1 - Math.pow(clamp((u - awn) / (1 - awn)), 1.4)) + 0.004
        const half = W * lerp(rowBody[a], lerp(iaTail[ia], even, tight), iaTailMix[ia])
        const hug = lerp(1 - smoothstep(HUG_FROM, hugs[i], u), rowHugTight[a], tight)
        const fold = Math.tan(lerp(0.03, foldTarget, rowFoldSm[a])) * foldTightScale + (tuftTerm > 0 ? rowTuftTan[a] * tuftTerm : 0)
        const soft = 0.2 * half + 1e-6
        const soft2 = soft * soft
        const keel = 0.0007 * size * (1 - 0.6 * u)
        const inv2Round = -hug / (2 * Math.max(rowR[a], 0.25 * R))
        const belly = SHUT_BELLY * half * tight * rowBellySin[a]
        const roll = ROLL * (1 - smoothstep(rollA, rollB, u))
        const iabBase = i * perBract + a * shape.nv
        for (let b = 0; b < shape.nv; b++) {
          const x = colX[b]
          const xi = x * half * (b === 0 ? edge[ia * 2] : b === shape.nv - 1 ? edge[ia * 2 + 1] : 1)
          const wave = half * iabWave[iabBase + b]
          const dn = xi * xi * inv2Round - fold * (Math.sqrt(xi * xi + soft2) - soft) + keel * colKeelExp[b] + wave + (xi + half) * roll + belly * colBellyW[b]
          const v = (base + a * shape.nv + b) * 3
          out[v] = mx + wx * xi + ux * dn
          out[v + 1] = my + wy * xi + uy * dn
          out[v + 2] = mz + wz * xi + uz * dn
        }
      }
      if (nor) {
        const tipAngle = rowT[shape.nu - 1]
        gridNormals(out, nor, base, shape.nu, shape.nv, false, ox * Math.cos(tipAngle) - ax * Math.sin(tipAngle), oy * Math.cos(tipAngle) - ay * Math.sin(tipAngle), oz * Math.cos(tipAngle) - az * Math.sin(tipAngle))
      }
    }
  }

  const poseMatrix = new THREE.Matrix4()
  const slotHairShown = [hairCount, hairCount]
  const slotDownShown = [downCount, downCount]
  let framesTouched = false
  let iceTouched = false

  const fillHairFrames = (slot: 0 | 1, pos: Float32Array, pose: Pose) => {
    if (!hairFrames) return
    const lone = loneAt(pose.time)
    const R = lone > 0 ? norm(pose.head.radius, lone) : pose.head.radius
    const scale = clamp(R / 0.012) * lerp(0.7, 1, smoothstep(0.015, 0.05, R))
    const h = pose.head
    const { px, py, pz, qx, qy, qz, ax, ay, az, cx: hcx, cy: hcy, cz: hcz } = h
    const tight = 1 - smoothstep(bloom0 - 4, bloom0 - 0.7, pose.time)
    const young = 1 - smoothstep(bloom0 - 17, bloom0 - 11, pose.time)
    const fringe = lerp(lerp(1, 0.45, tight), YOUNG_FRINGE, young)
    const early = options.variant === 0 ? 1 - smoothstep(bloom0 - 5.5, bloom0 - 3, pose.time) : 0
    const out = smoothstep(0.0004, WRAP_BY_R, R)
    const axisScale = Math.max(out, 1e-5)
    const end = stemAt(pose, 1)
    const invOut = 1 - out
    const tx = (end.x - ax * HAIR_IN_M) * invOut + hcx * out
    const ty = (end.y - ay * HAIR_IN_M) * invOut + hcy * out
    const tz = (end.z - az * HAIR_IN_M) * invOut + hcz * out
    poseMatrix.set(px, qx, ax, tx, py, qy, ay, ty, pz, qz, az, tz, 0, 0, 0, 1)
    hairFrames.pose(slot, poseMatrix)
    downFrames?.pose(slot, poseMatrix)

    const wornFace = Math.max(1 - tight, 0.8 * young) * scale * out
    const wornEdge = Math.max(fringe, FROST_FRINGE * early) * scale * out
    const wornBack = fringe * scale * out
    const wornDownShut = lerp(1, 0.7, tight) * scale * out
    const wornDownOpen = (1 - tight) * scale * out
    slotHairShown[slot] = wornFace > 0 ? hairCount : backHairs + edgeCount
    slotDownShown[slot] = wornDownOpen > 0 ? downCount : shutDownCount

    const hBuf = hairFrames.slot(slot)
    const dBuf = downFrames ? downFrames.slot(slot) : null
    const colsQ = Math.round(shape.sides / 4)
    const colsH = Math.round(shape.sides / 2)

    for (let rRow = 0; rRow < backFrameCount; rRow++) {
      const v0 = rRow * cols * 3
      const vQ = (rRow * cols + colsQ) * 3
      const vH = (rRow * cols + colsH) * 3
      const oxW = 0.5 * (pos[v0] + pos[vH])
      const oyW = 0.5 * (pos[v0 + 1] + pos[vH + 1])
      const ozW = 0.5 * (pos[v0 + 2] + pos[vH + 2])
      const rPrev = Math.max(0, rRow - 1)
      const rNext = Math.min(floorRow - 1, rRow + 1)
      const p0 = rPrev * cols * 3
      const pH = (rPrev * cols + colsH) * 3
      const n0 = rNext * cols * 3
      const nH = (rNext * cols + colsH) * 3
      let ux = 0.5 * (pos[n0] + pos[nH] - pos[p0] - pos[pH])
      let uy = 0.5 * (pos[n0 + 1] + pos[nH + 1] - pos[p0 + 1] - pos[pH + 1])
      let uz = 0.5 * (pos[n0 + 2] + pos[nH + 2] - pos[p0 + 2] - pos[pH + 2])
      const ul = Math.sqrt(ux * ux + uy * uy + uz * uz)
      if (ul > 1e-12) {
        ux /= ul
        uy /= ul
        uz /= ul
      } else {
        ux = ax
        uy = ay
        uz = az
      }
      const dx = (oxW - hcx) * out
      const dy = (oyW - hcy) * out
      const dz = (ozW - hcz) * out
      const axW = (pos[v0] - oxW) * axisScale
      const ayW = (pos[v0 + 1] - oyW) * axisScale
      const azW = (pos[v0 + 2] - ozW) * axisScale
      const bxW = (pos[vQ] - oxW) * axisScale
      const byW = (pos[vQ + 1] - oyW) * axisScale
      const bzW = (pos[vQ + 2] - ozW) * axisScale
      const alX = ux * px + uy * py + uz * pz
      const alY = ux * qx + uy * qy + uz * qz
      const alZ = ux * ax + uy * ay + uz * az
      const fo = rRow * 12
      hBuf[fo] = dx * px + dy * py + dz * pz
      hBuf[fo + 1] = dx * qx + dy * qy + dz * qz
      hBuf[fo + 2] = dx * ax + dy * ay + dz * az
      hBuf[fo + 3] = wornBack
      hBuf[fo + 4] = axW * px + ayW * py + azW * pz
      hBuf[fo + 5] = axW * qx + ayW * qy + azW * qz
      hBuf[fo + 6] = axW * ax + ayW * ay + azW * az
      hBuf[fo + 8] = bxW * px + byW * py + bzW * pz
      hBuf[fo + 9] = bxW * qx + byW * qy + bzW * qz
      hBuf[fo + 10] = bxW * ax + byW * ay + bzW * az
      packWay(hBuf, fo + 7, fo + 11, alX, alY, alZ)
    }

    const midCol = (shape.nv - 1) >> 1
    const rCol = shape.nv - 1
    for (let br = 0; br < shape.bracts; br++) {
      const base = bodyCount + br * perBract
      for (let s = 0; s < stationCount; s++) {
        const row = stations[s]
        const nextRow = Math.min(shape.nu - 1, row + 1)
        const prevRow = row === nextRow ? Math.max(0, row - 1) : row
        const mIdx = (base + row * shape.nv + midCol) * 3
        const lIdx = (base + row * shape.nv) * 3
        const rIdx = (base + row * shape.nv + rCol) * 3
        const u0Idx = (base + prevRow * shape.nv + midCol) * 3
        const u1Idx = (base + nextRow * shape.nv + midCol) * 3
        let ux = pos[u1Idx] - pos[u0Idx]
        let uy = pos[u1Idx + 1] - pos[u0Idx + 1]
        let uz = pos[u1Idx + 2] - pos[u0Idx + 2]
        const ul = Math.sqrt(ux * ux + uy * uy + uz * uz)
        if (ul > 1e-12) {
          ux /= ul
          uy /= ul
          uz /= ul
        } else {
          ux = ax
          uy = ay
          uz = az
        }
        const dx = (pos[mIdx] - hcx) * out
        const dy = (pos[mIdx + 1] - hcy) * out
        const dz = (pos[mIdx + 2] - hcz) * out
        const axW = (pos[lIdx] - pos[mIdx]) * axisScale
        const ayW = (pos[lIdx + 1] - pos[mIdx + 1]) * axisScale
        const azW = (pos[lIdx + 2] - pos[mIdx + 2]) * axisScale
        const bxW = (pos[rIdx] - pos[mIdx]) * axisScale
        const byW = (pos[rIdx + 1] - pos[mIdx + 1]) * axisScale
        const bzW = (pos[rIdx + 2] - pos[mIdx + 2]) * axisScale
        const alX = ux * px + uy * py + uz * pz
        const alY = ux * qx + uy * qy + uz * qz
        const alZ = ux * ax + uy * ay + uz * az
        const f0 = dx * px + dy * py + dz * pz
        const f1 = dx * qx + dy * qy + dz * qz
        const f2 = dx * ax + dy * ay + dz * az
        const f4 = axW * px + ayW * py + azW * pz
        const f5 = axW * qx + ayW * qy + azW * qz
        const f6 = axW * ax + ayW * ay + azW * az
        const f8 = bxW * px + byW * py + bzW * pz
        const f9 = bxW * qx + byW * qy + bzW * qz
        const f10 = bxW * ax + byW * ay + bzW * az
        const idx = br * stationCount + s
        const eo = (edgeFrameBase + idx) * 12
        hBuf[eo] = f0; hBuf[eo + 1] = f1; hBuf[eo + 2] = f2; hBuf[eo + 3] = wornEdge
        hBuf[eo + 4] = f4; hBuf[eo + 5] = f5; hBuf[eo + 6] = f6
        hBuf[eo + 8] = f8; hBuf[eo + 9] = f9; hBuf[eo + 10] = f10
        packWay(hBuf, eo + 7, eo + 11, alX, alY, alZ)
        const octX = hBuf[eo + 7]
        const octY = hBuf[eo + 11]
        const fao = (faceFrameBase + idx) * 12
        hBuf[fao] = f0; hBuf[fao + 1] = f1; hBuf[fao + 2] = f2; hBuf[fao + 3] = wornFace
        hBuf[fao + 4] = f4; hBuf[fao + 5] = f5; hBuf[fao + 6] = f6; hBuf[fao + 7] = octX
        hBuf[fao + 8] = f8; hBuf[fao + 9] = f9; hBuf[fao + 10] = f10; hBuf[fao + 11] = octY
        if (dBuf) {
          const dso = idx * 12
          dBuf[dso] = f0; dBuf[dso + 1] = f1; dBuf[dso + 2] = f2; dBuf[dso + 3] = wornDownShut
          dBuf[dso + 4] = f4; dBuf[dso + 5] = f5; dBuf[dso + 6] = f6; dBuf[dso + 7] = octX
          dBuf[dso + 8] = f8; dBuf[dso + 9] = f9; dBuf[dso + 10] = f10; dBuf[dso + 11] = octY
          const doo = (openDownFrameBase + idx) * 12
          dBuf[doo] = f0; dBuf[doo + 1] = f1; dBuf[doo + 2] = f2; dBuf[doo + 3] = wornDownOpen
          dBuf[doo + 4] = f4; dBuf[doo + 5] = f5; dBuf[doo + 6] = f6; dBuf[doo + 7] = octX
          dBuf[doo + 8] = f8; dBuf[doo + 9] = f9; dBuf[doo + 10] = f10; dBuf[doo + 11] = octY
        }
      }
    }
    framesTouched = true
  }

  const fillIce = (slot: 0 | 1, pos: Float32Array, nor: Float32Array, pose: Pose) => {
    if (!ice) return
    const iceRoot = ice.root(slot)
    const iceLean = ice.lean(slot)
    const lone = loneAt(pose.time)
    const R = lone > 0 ? norm(pose.head.radius, lone) : pose.head.radius
    const scale = clamp(R / 0.012) * lerp(0.7, 1, smoothstep(0.015, 0.05, R))
    const h = pose.head
    const early = options.variant === 0 ? 1 - smoothstep(bloom0 - 5.5, bloom0 - 3, pose.time) : 0
    const out = smoothstep(0.0004, WRAP_BY_R, R)
    const end = stemAt(pose, 1)
    const invOut = 1 - out
    const inXo = (end.x - h.ax * HAIR_IN_M) * invOut
    const inYo = (end.y - h.ay * HAIR_IN_M) * invOut
    const inZo = (end.z - h.az * HAIR_IN_M) * invOut
    for (let n = 0; n < iceCount; n++) {
      const v00 = iceV00[n]
      const v01 = v00 + 3
      const v10 = iceV10[n]
      const v11 = v10 + 3
      const wi = n * 4
      const w00 = iceW[wi]
      const w01 = iceW[wi + 1]
      const w10 = iceW[wi + 2]
      const w11 = iceW[wi + 3]
      const x = pos[v00] * w00 + pos[v01] * w01 + pos[v10] * w10 + pos[v11] * w11
      const y = pos[v00 + 1] * w00 + pos[v01 + 1] * w01 + pos[v10 + 1] * w10 + pos[v11 + 1] * w11
      const z = pos[v00 + 2] * w00 + pos[v01 + 2] * w01 + pos[v10 + 2] * w10 + pos[v11 + 2] * w11
      const nx = nor[v00] * w00 + nor[v01] * w01 + nor[v10] * w10 + nor[v11] * w11
      const ny = nor[v00 + 1] * w00 + nor[v01 + 1] * w01 + nor[v10 + 1] * w10 + nor[v11 + 1] * w11
      const nz = nor[v00 + 2] * w00 + nor[v01 + 2] * w01 + nor[v10 + 2] * w10 + nor[v11 + 2] * w11
      const ux = pos[v10] - pos[v00]
      const uy = pos[v10 + 1] - pos[v00 + 1]
      const uz = pos[v10 + 2] - pos[v00 + 2]
      const ul = Math.sqrt(ux * ux + uy * uy + uz * uz) || 1
      const ex = pos[v01] - pos[v00]
      const ey = pos[v01 + 1] - pos[v00 + 1]
      const ez = pos[v01 + 2] - pos[v00 + 2]
      const el = Math.sqrt(ex * ex + ey * ey + ez * ez) || 1
      const sgn = iceKind[n] > 0 ? 1 : -1
      const on = iceJitter[n * 3] * 0.8
      const up = iceJitter[n * 3 + 2] * 1.6
      const o = n * 4
      iceRoot[o] = inXo + x * out
      iceRoot[o + 1] = inYo + y * out
      iceRoot[o + 2] = inZo + z * out
      iceRoot[o + 3] = iceLong[n] * lerp(1, iceOpen[n], early) * scale * out
      iceLean[o] = (ex / el) * sgn + (ux / ul) * on + nx * up
      iceLean[o + 1] = (ey / el) * sgn + (uy / ul) * on + ny * up
      iceLean[o + 2] = (ez / el) * sgn + (uz / ul) * on + nz * up
      iceLean[o + 3] = iceLeanW[n]
    }
    iceTouched = true
  }

  const settle = (share: number): void => {
    const a = kept[0]
    const b = kept[share > 0 ? 1 : 0]
    const at = (n: number): number => a[n] + (b[n] - a[n]) * share
    uniforms.uBudHead.value.set(at(0), at(1), at(2), at(3))
    uniforms.uBudOpen.value = at(4)
    uniforms.uBudShut.value = at(5)
    uniforms.uBudEarly.value = at(6)
  }

  return {
    name: 'bud',
    meshes: [mesh, ...(hairs ? hairs.meshes : []), ...(down ? down.meshes : []), ...(ice ? ice.meshes : [])],
    casters: [{ mesh, surface }],
    fill(slot, pose) {
      if (slot === 1 && !positionB) return
      const frosty = Boolean(ice && stateUniforms.uPlantFrost.value > 0)
      const nor = filling.lead || frosty ? normalSlots[slot] : null
      fillShape(slots[slot], nor, pose)
      filled[slot] = true
      if (filling.lead) {
        led[slot] = true
        const time = pose.time
        const ks = kept[slot]
        ks[0] = pose.head.cx
        ks[1] = pose.head.cy
        ks[2] = pose.head.cz
        ks[3] = pose.head.radius
        ks[4] = headOpen(time)
        ks[5] = (1 - smoothstep(bloom0 - 4, bloom0 - 0.7, time)) * smoothstep(bloom0 - 16, bloom0 - 10, time)
        ks[6] = 1 - smoothstep(bloom0 - 5.5, bloom0 - 3, time)
      }
      if (hairFrames) fillHairFrames(slot, slots[slot], pose)
      if (frosty && nor) fillIce(slot, slots[slot], nor, pose)
    },
    absent: (time) => bodyRadius(time) <= 0 && loneAt(time) <= 0,
    finish() {
      if (!filled[0] && !filled[1]) return
      if (filled[0]) position.needsUpdate = true
      if (filled[1] && positionB) positionB.needsUpdate = true
      if (led[0]) normal.needsUpdate = true
      if (led[1] && normalB) normalB.needsUpdate = true
      filled.fill(false)
      led.fill(false)
      if (framesTouched) {
        hairFrames?.finish()
        downFrames?.finish()
        hairs?.finish(Math.max(slotHairShown[0], slotHairShown[1]))
        down?.finish(Math.max(slotDownShown[0], slotDownShown[1]))
        framesTouched = false
      }
      if (iceTouched) {
        ice?.finish()
        iceTouched = false
      }
      settle(0)
    },
    settle,
  }
}
