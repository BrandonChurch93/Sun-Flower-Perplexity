import * as THREE from 'three'
import { config } from '../../../config.ts'
import { clamp, lerp, smoothstep } from '../../../core/curves.ts'
import { combine, hash01, streamSeed } from '../../../core/random.ts'
import { bractAngle, bractCurl, bractLength, headOpen, heightAt, rayAngle, rayCount, rayLength, rayOpen, stemRadius } from '../../growth.ts'
import { createHairs, type HairSet } from '../../hairs/index.ts'
import { makePartSurface, partGeometry, partMesh, stateUniforms, type PartDetail, type PartOptions, type PlantPart } from '../../part.ts'
import { FLOOR_DOME, FLOOR_RIM, NECK_FLARE, SEAT, floorAt, stemAt, type FloorPoint, type Pose } from '../../skeleton.ts'
import { flutter } from '../../wind.ts'
import { createCrystals, type CrystalSet } from '../../../weather/frost/index.ts'
import { fragment, vertex } from './shaders.ts'

const TAU = Math.PI * 2
const [bloom0] = config.plant.stages.bloom

interface Shape { sides: number; neck: number[]; dome: number[]; side: number[]; floor: number[]; bracts: number; nu: number; nv: number; backHairs: number; edgeHairs: number; faceHairs: number; downHairs: number; crystals: number }

const steps = (n: number, from = 0): number[] => Array.from({ length: n + 1 - from }, (_, i) => (i + from) / n)

const SHAPE: Record<PartDetail, Shape> = {
  hero: { sides: 64, neck: [0.006, 0.003], dome: steps(16), side: [0.3, 0.55, 0.75, 0.9, 0.97, 1], floor: steps(10).reverse(), bracts: 63, nu: 32, nv: 13, backHairs: 10000, edgeHairs: 20000, faceHairs: 12000, downHairs: 56000, crystals: 20000 },
  near: { sides: 8, neck: [], dome: [0, 0.5, 1], side: [1], floor: [1, 0], bracts: 15, nu: 4, nv: 2, backHairs: 0, edgeHairs: 0, faceHairs: 0, downHairs: 0, crystals: 0 },
  far: { sides: 5, neck: [], dome: [0], side: [1], floor: [0], bracts: 0, nu: 0, nv: 0, backHairs: 0, edgeHairs: 0, faceHairs: 0, downHairs: 0, crystals: 0 },
}

// How far in front of the head's middle the body is widest, as a share of its half depth. Behind it the back is one shallow dome.
const WIDEST = 0.2
// How much wider than the floor the body is at its widest. From there it rounds in to the rim of the floor.
const SHOULDER = 0.04
const RAY_CLEAR = 0.21
const HUG_FROM = 0.04
const HAIR_WIDTH_M = 0.00005
const DOWN_WIDTH_M = 0.00016
const DOWN_SHUT = 0.4
// Each bract is rolled a little about its midrib so one margin lies over its neighbor's, like a roof tile.
const ROLL = 0.16
// A bract stands cupped round the face until the rays in front of it have opened, and folds back this many seconds after them, outermost series first. growth.ts has no sectors for bracts.
const FOLD_LAG = [0.2, 0.3, 0.4]
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
const BACK_LAG = 1.3
// On the side away from the first rays the folded bracts stay spread behind the rays by this share and do not lie back on the stem.
const FOLD_STAY = 0.65
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
const FOLD = [2.7, 2.78, 2.86]
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
const LONG = [0.95, 1, 1.1]
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
const BULGE = [0.25, 0.24, 0.2]
// The globe is widest below the rim: over the face only this share of the bulge is left, so the bracts close in to a point.
const BULGE_TOP = 0.3
const BULGE_HIGH = 0.7
// their feet sit this much nearer the neck, since the receptacle has not yet spread under them,
const FEET_LOW = [0.52, 0.25, 0.1]
// and each blade is this much broader and tapers evenly to its point.
const SHUT_BROAD = [1.45, 1.4, 0.9]
// Shut, the outer series leaves the globe near its base and curls up like a claw, the two inner ones lean in over the top and turn their points up again. Radians from the head's axis, then how far each curls in and how far its point turns out.
const SHUT_ANGLE = [0.95, -0.2, -0.95]
const SHUT_CURL = [0.75, 0, 0]
// A few of the outer series stand out further than the rest, by up to this much.
const SHUT_SPREAD = 0.6
// The outer series is the leafiest and reaches furthest while the bud is shut.
const SHUT_LONG = [1.5, 1.15, 1.2]
const SHUT_TIP = [0.35, 0.8, 1]
// When the tip has just tightened the outer bracts are still young leaves standing out round a small bud.
const YOUNG_OUT = [0.4, 0.2, 0]
const YOUNG_LONG = [0.8, 0.35, 0]

interface Bract { spread: number; point: number; keel: number; low: number; away: number; series: number; rank: number; az: number; foot: number; long: number; wide: number; tail: number; twist: number; side: number; tip: number; lean: number; hook: number; reflex: number; phase: number; waves: number; hug: number; rmin: number; fold: number; seed: number }

export function create(options: PartOptions): PlantPart | null {
  const shape = SHAPE[options.detail]
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
      spread: series === 0 ? SHUT_SPREAD * rnd(904, i) ** 2 : 0,
    })
  }

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
  geometry.setAttribute('position', position)
  if (positionB) geometry.setAttribute('positionB', positionB)
  geometry.setAttribute('normal', normal)
  geometry.setAttribute('aInfo', new THREE.BufferAttribute(info, 4))
  geometry.setIndex(index)
  const uniforms = { uBudOpen: { value: 0 }, uBudShut: { value: 0 }, uBudHead: { value: new THREE.Vector4(0, 0, 0, 1) } }
  const surface = makePartSurface(options, { name: 'bud', vertex, fragment, side: THREE.DoubleSide, uniforms })
  const mesh = partMesh(geometry, surface)

  const share = options.variant === 0 ? 1 : 0.25
  const backHairs = Math.floor(shape.backHairs * share)
  const edgeEach = shape.bracts > 0 ? Math.floor((shape.edgeHairs * share) / shape.bracts / 2) : 0
  const faceEach = shape.bracts > 0 ? Math.floor((shape.faceHairs * share) / shape.bracts) : 0
  const hairCount = backHairs + shape.bracts * (edgeEach * 2 + faceEach)
  const downEach = shape.bracts > 0 ? Math.floor((shape.downHairs * share) / shape.bracts / 2) : 0
  const downCount = shape.bracts * downEach * 2
  const iceEach = shape.bracts > 0 ? Math.floor((shape.crystals * share) / shape.bracts / 2) : 0
  const ice: CrystalSet | null = createCrystals(options, shape.bracts * iceEach * 2, 'bud crystals')
  const iceCount = ice ? ice.count : 0
  const furCount = hairCount + downCount
  const allCount = furCount + iceCount
  const hairs: HairSet | null = hairCount > 0 ? createHairs(options, hairCount, 'bud hairs', [0.45, 0.48, 0.4], HAIR_WIDTH_M) : null
  const down: HairSet | null = downCount > 0 ? createHairs(options, downCount, 'bud down', [0.45, 0.48, 0.4], DOWN_WIDTH_M) : null
  const hairBase = new Int32Array(allCount)
  const hairWidth = new Int32Array(allCount)
  const hairAt = new Float32Array(allCount * 2)
  // kind: 0 the back of the receptacle, 1 and -1 the two margins of a bract, 2 its outer face, 3 and -3 the down on the margins, 4 and -4 the hoarfrost on them.
  const hairKind = new Int8Array(allCount)
  const hairLong = new Float32Array(allCount)
  if (hairs) {
    let n = 0
    const lastBack = shape.neck.length + (shape.dome.length - 1) * 0.5
    for (let i = 0; i < backHairs; i++, n++) {
      const along = Math.pow(rnd(20, i), 1.4)
      hairBase[n] = 0
      hairWidth[n] = cols
      hairAt[n * 2] = along * lastBack
      hairAt[n * 2 + 1] = rnd(21, i) * shape.sides
      hairKind[n] = 0
      hairLong[n] = (0.0011 + 0.0022 * rnd(22, i)) * lerp(1.25, 0.55, along)
    }
    for (let b = 0; b < shape.bracts; b++) {
      const base = bodyCount + b * perBract
      for (let i = 0; i < edgeEach * 2; i++, n++) {
        const u = 0.03 + 0.97 * Math.pow(rnd(23 + b, i), 0.75)
        const left = i % 2 === 0
        hairBase[n] = base
        hairWidth[n] = shape.nv
        hairAt[n * 2] = u * (shape.nu - 1)
        hairAt[n * 2 + 1] = left ? 0 : shape.nv - 1
        hairKind[n] = left ? -1 : 1
        hairLong[n] = 0.001 + 0.001 * rnd(123 + b, i)
      }
      for (let i = 0; i < faceEach; i++, n++) {
        const keel = rnd(223 + b, i) < 0.3
        const u = keel ? 0.08 + 0.9 * rnd(323 + b, i) : 0.15 + 0.8 * rnd(323 + b, i)
        const across = keel ? 0.5 + (rnd(423 + b, i) - 0.5) * 0.08 : 0.06 + 0.88 * rnd(423 + b, i)
        hairBase[n] = base
        hairWidth[n] = shape.nv
        hairAt[n * 2] = u * (shape.nu - 1)
        hairAt[n * 2 + 1] = across * (shape.nv - 1)
        hairKind[n] = 2
        hairLong[n] = keel ? 0.0016 + 0.002 * rnd(523 + b, i) : 0.001 + 0.0016 * rnd(523 + b, i)
      }
    }
  }
  if (down) {
    let n = hairCount
    for (let b = 0; b < shape.bracts; b++) {
      for (let i = 0; i < downEach * 2; i++, n++) {
        const left = i % 2 === 0
        hairBase[n] = bodyCount + b * perBract
        hairWidth[n] = shape.nv
        hairAt[n * 2] = (0.02 + 0.98 * Math.pow(rnd(1023 + b, i), 0.75)) * (shape.nu - 1)
        hairAt[n * 2 + 1] = left ? 0 : shape.nv - 1
        hairKind[n] = left ? -3 : 3
        hairLong[n] = 0.0005 + 0.0006 * rnd(1123 + b, i)
      }
    }
  }
  if (ice) {
    let n = furCount
    for (let b = 0; b < shape.bracts; b++) {
      for (let i = 0; i < iceEach * 2; i++, n++) {
        const left = i % 2 === 0
        hairBase[n] = bodyCount + b * perBract
        hairWidth[n] = shape.nv
        // One in five sits on the point itself, the rest thicken toward it: the foot of a margin is tucked under the next bract.
        const u = rnd(2223 + b, i) < 0.2 ? 0.9 + 0.1 * rnd(2023 + b, i) : 0.3 + 0.7 * Math.pow(rnd(2023 + b, i), 0.7)
        hairAt[n * 2] = u * (shape.nu - 1)
        hairAt[n * 2 + 1] = left ? 0 : shape.nv - 1
        hairKind[n] = left ? -4 : 4
        hairLong[n] = lerp(0.0015, 0.0025, u * u) * (0.75 + 0.5 * rnd(2123 + b, i))
      }
    }
  }
  const jitter = hairs ? Float32Array.from({ length: allCount * 4 }, (_, i) => hash01(seed, 700 + (i % 4), i >> 2)) : null

  const floor: FloorPoint = { x: 0, y: 0, z: 0, nx: 0, ny: 1, nz: 0, ox: 1, oy: 0, oz: 0 }
  const sub = shape.nu > 1 ? Math.max(2, Math.ceil(48 / (shape.nu - 1))) : 1
  const rowR = new Float32Array(Math.max(shape.nu, 1))
  const rowH = new Float32Array(Math.max(shape.nu, 1))
  const rowT = new Float32Array(Math.max(shape.nu, 1))
  const hugs = new Float32Array(shape.bracts)

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
        const l = Math.hypot(x, y, z)
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

  const fillShape = (out: Float32Array, nor: Float32Array | null, pose: Pose) => {
    const time = pose.time
    const head = pose.head
    const R = head.radius
    const D = head.depth
    const { cx, cy, cz, ax, ay, az, px, py, pz, qx, qy, qz } = head
    if (R < 1e-6) {
      const end = stemAt(pose, 1)
      for (let v = 0; v < count; v++) {
        out[v * 3] = end.x
        out[v * 3 + 1] = end.y
        out[v * 3 + 2] = end.z
      }
      if (nor) for (let v = 0; v < count; v++) nor.set([0, 1, 0], v * 3)
      return
    }
    const hw = WIDEST * D
    const hr = FLOOR_RIM * D
    const Hb = hw + D
    const grown = Math.min(1, heightAt(time) / 0.006)
    const stemR = (u: number): number => Math.max(stemRadius(time, u) * grown, NECK_FLARE * R * Math.max(0, (u - 0.97) / 0.03))
    // The dome starts where it is as wide as the stem's end, a hair behind the joint.
    const Rw = R * (1 + SHOULDER)
    const sideR = (h: number): number => R + (Rw - R) * Math.sqrt(Math.max(0, 1 - ((h - hw) / (hr - hw)) ** 2))
    const sin0 = clamp(stemR(1) / Rw, 0.1, 0.92)
    const psi0 = Math.min(Math.asin(sin0), Math.acos(clamp((hw + SEAT * D) / Hb, 0, 1)) + 0.02)

    let row = 0
    const endNode = stemAt(pose, 1)
    const flip = qx * endNode.bx + qy * endNode.by + qz * endNode.bz < 0 ? -1 : 1
    for (const back of shape.neck) {
      const u = Math.max(0, 1 - back / Math.max(pose.length, 1e-6))
      const n = stemAt(pose, u)
      const radius = stemR(u) + 0.0003
      for (let b = 0; b < cols; b++) {
        const t = (b / shape.sides) * TAU
        const c = Math.cos(t)
        const s = Math.sin(t) * flip
        const v = (row * cols + b) * 3
        out[v] = n.x + (n.rx * c + n.bx * s) * radius
        out[v + 1] = n.y + (n.ry * c + n.by * s) * radius
        out[v + 2] = n.z + (n.rz * c + n.bz * s) * radius
      }
      row++
    }
    const ring = (r: number, h: number) => {
      for (let b = 0; b < cols; b++) {
        const t = (b / shape.sides) * TAU
        const c = Math.cos(t)
        const s = Math.sin(t)
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
        floorAt(pose, rho, (b / shape.sides) * TAU, floor)
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
    const tight = 1 - smoothstep(bloom0 - 4, bloom0 - 0.7, time)
    const globe = tight * smoothstep(bloom0 - 15, bloom0 - 9, time)
    const young = 1 - smoothstep(bloom0 - 17, bloom0 - 11, time)
    const wind = pose.inputs.wind
    for (let i = 0; i < shape.bracts; i++) {
      const k = bracts[i]
      const j = i * 3 + 2 - k.series
      const L = bractLength(i, time) * k.long * lerp(1, SHUT_LONG[k.series], tight) * (1 + YOUNG_LONG[k.series] * young)
      const W = Math.min(BROAD[k.series] * bractLength(i, time), 0.48 * R, 0.019) * k.wide * lerp(1, SHUT_BROAD[k.series], tight)
      // The bract stays behind the nearest rays once they have any length, so it swings back just ahead of them.
      const turns = k.az / TAU
      const at = (turns - Math.floor(turns)) * rayCount
      let behind = -Math.PI
      let opened = 0
      let rayLong = 0
      let low = 1
      let grown = 0
      let passed = 0
      for (let m = -1; m <= 2; m++) {
        const ray = (((Math.floor(at) + m) % rayCount) + rayCount) % rayCount
        behind = Math.max(behind, lerp(-1.9, rayAngle(ray, time) + RAY_CLEAR, smoothstep(0.002, 0.03, rayLength(ray, time))))
        opened += (rayOpen(ray, time - FOLD_LAG[k.series]) + rayOpen(ray, time - FOLD_LAG[k.series] - FOLD_SLOW)) / 8
        rayLong = Math.max(rayLong, rayLength(ray, time))
        passed += rayOpen(ray, time - FOLD_LAG[k.series] - BACK_LAG) / 4
        low = Math.min(low, rayOpen(ray, time))
        grown = Math.max(grown, rayLength(ray, time) / rayLength(ray, 1e3))
      }
      const co = Math.cos(k.az)
      const so = Math.sin(k.az)
      const ox = px * co + qx * so
      const oy = py * co + qy * so
      const oz = pz * co + qz * so
      const under = smoothstep(-0.1, 0.6, -oy)
      const folded = smoothstep(0, 1, opened)
      const held = 1 - smoothstep(0.1, 0.5, low)
      const cone = Math.pow(smoothstep(0.1, 0.7, grown), 0.6) * held
      const coneWide = smoothstep(0, 0.12, grown) * held
      const inBud = Math.min(time, bloom0 - 3)
      const near = smoothstep(-0.2, 0.4, ox)
      const late = COLLAR_LATE * LATE_SHARE[k.series] * near * (1 - smoothstep(0.45, 0.85, oy))
      const collar = smoothstep(bloom0 + COLLAR_FROM + late, bloom0 + COLLAR_FROM + COLLAR_TAKES + late, time)
      const stand = lerp(lerp(STAND[k.series] + k.lean, Math.min(STAND[k.series], -0.35) + 0.3 * k.lean, under), lerp(COLLAR[k.series] + k.lean, k.away, under), collar)
      const gone = Math.max(back, smoothstep(0.2, 1, passed))
      const wrapped = lerp(lerp(bractAngle(j, inBud) - SHUT[k.series] * shut + (YOUNG_OUT[k.series] + k.spread) * young, SHUT_ANGLE[k.series] + k.lean + k.spread, globe), stand, ready)
      const angle = lerp(lerp(wrapped, LOOSE[k.series] + k.lean, smoothstep(0, 0.5, folded)), lerp(FOLD_FIRST[k.series], FOLD[k.series], gone * (1 - FOLD_STAY * near)) + 0.5 * k.lean, folded)
      const hooked = smoothstep(0.3, 0.9, folded)
      const hook = (k.hook * (1 - 0.75 * gone) + LOW_HOOK * under) * hooked + k.low * under * collar * (1 - hooked)
      const reflex = k.reflex * ready * (1 - folded) * (1 - 0.8 * under) * (1 - 0.9 * collar)
      const curl = lerp(lerp(lerp(bractCurl(j, inBud), SHUT_CURL[k.series] + k.spread, globe), -FLARE[k.series] * (1 - 0.7 * under), ready), -0.22, folded)
      const hugEnd = k.hug
      hugs[i] = hugEnd
      const rayS = Math.sin(behind - RAY_CLEAR)
      const rayC = Math.cos(behind - RAY_CLEAR)
      const pushed = smoothstep(0, 0.008, rayLong)
      const gap = RAY_GAP * pushed
      const sway = wind * 0.05 * flutter(time, k.seed)
      const tx = qx * co - px * so
      const ty = qy * co - py * so
      const tz = qz * co - pz * so

      const foot = Math.max(0, k.foot - FEET_LOW[k.series] * tight)
      let psi = psi0 + (Math.PI / 2 - psi0) * Math.min(foot, 1)
      let h = hw - Hb * Math.cos(psi) + (hr - hw) * SIDE_FEET * clamp((foot - 1) / 0.5)
      let r = h > hw ? sideR(h) : Rw * Math.sin(psi)
      const total = (shape.nu - 1) * sub
      const ds = L / total
      for (let step = 0; step <= total; step++) {
        const u = step / total
        const s = u * L
        const lift = (-0.0008 + 0.0011 * smoothstep(0, 0.004, s) + 0.1 * s + (2 - k.series) * 0.0012 * smoothstep(0.003, 0.012, s)) * small
        const bulge = BULGE[k.series] * R * tight * smoothstep(k.series === 0 ? 0.12 : 0, 0.55, u)
        const surfaceAngle = psi < Math.PI / 2 ? Math.atan2(Rw * Math.cos(psi), Hb * Math.sin(psi)) : 0
        const tipW = smoothstep(0.55, 1, u)
        const free = Math.max(angle - 1.3 * curl * u * u, behind, -1.75) + (k.tip * (1 - 0.7 * over * shut) + SHUT_TIP[k.series] * globe) * tipW * tipW + reflex * smoothstep(BEND_FROM[k.series], BEND_FROM[k.series] + 0.3, u) + hook * smoothstep(0.2, 1, u) + sway * u * u
        const Ea = R * (1 + CONE_WIDE * coneWide) + lift + BULGE_TOP * bulge
        const Eh = lerp(Hf, CONE_HIGH * R, cone) + lift + BULGE_HIGH * bulge
        const fr = r / Ea
        const fh = Math.max(0, h - hr) / Eh
        const onFace = 1 - smoothstep(1, 1.1, fr * fr + (1 - cone) * fh * fh + cone * fh * fh * fh * fh)
        const along = h < hr ? -0.15 * (1 - cone) : Math.atan2(-((1 - cone) * fh + 2 * cone * fh * fh * fh) / Eh, fr / Ea)
        const theta = Math.max(lerp(surfaceAngle, free, smoothstep(HUG_FROM, hugEnd, u)), lerp(-Math.PI, behind, smoothstep(hw - 0.4 * D, hw, h)), lerp(-Math.PI, along, onFace))
        const Re = Rw + lift + bulge
        if (h < hw) {
          const e = (r * r) / (Re * Re) + ((h - hw) * (h - hw)) / ((Hb + lift) * (Hb + lift))
          if (e < 1) {
            const g = 1 / Math.sqrt(Math.max(e, 1e-9))
            r *= g
            h = hw + (h - hw) * g
          }
        } else if (h < hr) r = Math.max(r, sideR(h) + lift + bulge + (Ea - R - lift - bulge) * smoothstep(hw, hr, h))
        else {
          const B = fr * fr + (1 - cone) * fh * fh
          const G = 2 / (B + Math.sqrt(B * B + 4 * cone * fh * fh * fh * fh) + 1e-12)
          if (G > 1) {
            const g = Math.sqrt(G)
            r *= g
            h = hr + (h - hr) * g
          }
        }
        if (gap > 0) {
          const vr = r - RAY_FOOT * R
          const vh = h - hr
          const along = vr * rayS + vh * rayC
          const clear = vr * rayC - vh * rayS
          const need = pushed * (gap - clear) * smoothstep(-0.004, 0, along) * (1 - smoothstep(rayLong, rayLong + 0.004, along)) * smoothstep(-0.012, -0.006, clear)
          if (need > 0) {
            r += rayC * need
            h -= rayS * need
          }
        }
        r = Math.max(r, k.rmin * small)
        if (step % sub === 0) {
          const a = step / sub
          rowR[a] = r
          rowH[a] = h
          rowT[a] = theta
        }
        r += Math.sin(theta) * ds
        h += Math.cos(theta) * ds
        if (psi < Math.PI / 2) psi = Math.min(Math.PI / 2, psi + ds / Math.hypot(Rw * Math.cos(psi), Hb * Math.sin(psi)))
      }

      const base = bodyCount + i * perBract
      const size = L / 0.046
      const swing = LOW_SWING * under * clamp(ty * 3, -1, 1) * smoothstep(0.15, 0.6, folded) * (1 - 0.5 * gone)
      for (let a = 0; a < shape.nu; a++) {
        const u = a / (shape.nu - 1)
        const theta = rowT[a]
        const st = Math.sin(theta)
        const ct = Math.cos(theta)
        const bend = k.side * L * u * u * u
        const turn = swing * smoothstep(0.05, 0.35, u)
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
        const tw = k.twist * smoothstep(0.35, 1, u)
        const cw = Math.cos(tw)
        const sw = Math.sin(tw)
        const wx = t1x * cw + nx * sw
        const wy = t1y * cw + ny * sw
        const wz = t1z * cw + nz * sw
        const ux = nx * cw - t1x * sw
        const uy = ny * cw - t1y * sw
        const uz = nz * cw - t1z * sw
        const body = 0.86 + 0.14 * Math.sin(Math.PI * clamp(u / 0.42))
        const tail = 0.95 * Math.pow(clamp((k.point - u) / (k.point - 0.2)), 0.8) + POINT_WIDE * Math.pow(1 - u, 0.9) + 0.004
        const even = lerp(1.04, 0.16, smoothstep(0.42, 0.84, u)) * (1 - Math.pow(clamp((u - 0.7) / 0.3), 1.4)) + 0.004
        const half = W * lerp(body, lerp(tail, even, tight), smoothstep(k.tail + 0.02, k.tail + 0.2, u))
        const hug = lerp(1 - smoothstep(HUG_FROM, hugs[i], u), 1 - smoothstep(0.55, 1, u), tight)
        const fold = Math.tan(lerp(0.03, lerp(k.fold, k.keel, collar * (1 - folded)), smoothstep(0.25, 0.65, u))) * lerp(1, 0.4, tight)
        const soft = 0.2 * half + 1e-6
        const keel = 0.0007 * size * (1 - 0.6 * u)
        const round = Math.max(rowR[a], 0.25 * R)
        const roll = ROLL * (1 - smoothstep(0.15, 0.6, u))
        for (let b = 0; b < shape.nv; b++) {
          const x = (b / (shape.nv - 1)) * 2 - 1
          const xi = x * half * (b === 0 ? edge[(i * shape.nu + a) * 2] : b === shape.nv - 1 ? edge[(i * shape.nu + a) * 2 + 1] : 1)
          const wave = 0.07 * half * smoothstep(0.1, 0.4, u) * Math.sin(u * TAU * k.waves + k.phase + (x > 0 ? 0 : 1.7)) * Math.abs(x * x * x)
          const dn = (-xi * xi * hug) / (2 * round) - fold * (Math.sqrt(xi * xi + soft * soft) - soft) + keel * Math.exp(-(x * x) / 0.0256) + wave + (xi + half) * roll
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

  const fillHairs = (slot: 0 | 1, pos: Float32Array, nor: Float32Array, pose: Pose) => {
    if (!hairs || !jitter) return
    const hairRoot = hairs.root(slot)
    const hairLean = hairs.lean(slot)
    const downRoot = down ? down.root(slot) : hairRoot
    const downLean = down ? down.lean(slot) : hairLean
    const R = pose.head.radius
    const scale = clamp(R / 0.012) * lerp(0.7, 1, smoothstep(0.015, 0.05, R))
    const h = pose.head
    const tight = 1 - smoothstep(bloom0 - 4, bloom0 - 0.7, pose.time)
    const fringe = lerp(1, 0.45, tight)
    const iceRoot = ice ? ice.root(slot) : hairRoot
    const iceLean = ice ? ice.lean(slot) : hairLean
    const upTo = stateUniforms.uPlantFrost.value > 0 ? allCount : furCount
    for (let i = 0; i < upTo; i++) {
      const nv = hairWidth[i]
      const fa = hairAt[i * 2]
      const fb = hairAt[i * 2 + 1]
      const kind = hairKind[i]
      const rows = kind === 0 ? floorRow : shape.nu
      const a = Math.min(Math.floor(fa), rows - 2)
      const b = Math.min(Math.floor(fb), nv - 2)
      const ga = fa - a
      const gb = fb - b
      const v00 = (hairBase[i] + a * nv + b) * 3
      const v01 = v00 + 3
      const v10 = v00 + nv * 3
      const v11 = v10 + 3
      const w00 = (1 - ga) * (1 - gb)
      const w01 = (1 - ga) * gb
      const w10 = ga * (1 - gb)
      const w11 = ga * gb
      const x = pos[v00] * w00 + pos[v01] * w01 + pos[v10] * w10 + pos[v11] * w11
      const y = pos[v00 + 1] * w00 + pos[v01 + 1] * w01 + pos[v10 + 1] * w10 + pos[v11 + 1] * w11
      const z = pos[v00 + 2] * w00 + pos[v01 + 2] * w01 + pos[v10 + 2] * w10 + pos[v11 + 2] * w11
      let nx = nor[v00] * w00 + nor[v01] * w01 + nor[v10] * w10 + nor[v11] * w11
      let ny = nor[v00 + 1] * w00 + nor[v01 + 1] * w01 + nor[v10 + 1] * w10 + nor[v11 + 1] * w11
      let nz = nor[v00 + 2] * w00 + nor[v01 + 2] * w01 + nor[v10 + 2] * w10 + nor[v11 + 2] * w11
      const j0 = jitter[i * 4] - 0.5
      const j1 = jitter[i * 4 + 1] - 0.5
      const j2 = jitter[i * 4 + 2] - 0.5
      let dx: number
      let dy: number
      let dz: number
      if (kind === 0) {
        dx = nx + j0 * 0.5 - h.ax * 0.15
        dy = ny + j1 * 0.5 - h.ay * 0.15
        dz = nz + j2 * 0.5 - h.az * 0.15
      } else {
        let ux = pos[v10] - pos[v00]
        let uy = pos[v10 + 1] - pos[v00 + 1]
        let uz = pos[v10 + 2] - pos[v00 + 2]
        const ul = Math.hypot(ux, uy, uz) || 1
        ux /= ul
        uy /= ul
        uz /= ul
        if (kind === 2) {
          const nl = Math.hypot(nx, ny, nz) || 1
          nx /= nl
          ny /= nl
          nz /= nl
          dx = nx + ux * 0.5 + j0 * 0.5
          dy = ny + uy * 0.5 + j1 * 0.5
          dz = nz + uz * 0.5 + j2 * 0.5
        } else {
          let ex = (pos[v01] - pos[v00]) * kind
          let ey = (pos[v01 + 1] - pos[v00 + 1]) * kind
          let ez = (pos[v01 + 2] - pos[v00 + 2]) * kind
          const el = Math.hypot(ex, ey, ez) || 1
          ex /= el
          ey /= el
          ez /= el
          const plain = kind > 2 || kind < -2 ? 0 : 1
          const frozen = kind > 3 || kind < -3 ? 1 : 0
          const up = (0.15 + j2 * 0.9) * plain + j2 * 1.6 * frozen
          const on = (0.35 + j0 * 0.5) * plain + j0 * 0.8 * frozen
          dx = ex + ux * on + nx * up
          dy = ey + uy * on + ny * up
          dz = ez + uz * on + nz * up
        }
      }
      const root = i < hairCount ? hairRoot : i < furCount ? downRoot : iceRoot
      const lean = i < hairCount ? hairLean : i < furCount ? downLean : iceLean
      const o = (i < hairCount ? i : i < furCount ? i - hairCount : i - furCount) * 4
      // Shut, the bud wears a short fringe and only part of its down: the rest grows as the bracts loosen.
      const worn = kind === 2 ? 1 - tight : kind === 1 || kind === -1 || kind === 0 ? fringe : kind === 3 || kind === -3 ? lerp(1, jitter[i * 4 + 3] < DOWN_SHUT ? 0.7 : 0, tight) : 1
      root[o] = x
      root[o + 1] = y
      root[o + 2] = z
      root[o + 3] = hairLong[i] * scale * worn
      lean[o] = dx
      lean[o + 1] = dy
      lean[o + 2] = dz
      lean[o + 3] = jitter[i * 4 + 3]
    }
  }

  return {
    name: 'bud',
    meshes: [mesh, ...(hairs ? hairs.meshes : []), ...(down ? down.meshes : []), ...(ice ? ice.meshes : [])],
    casters: [{ mesh, surface }],
    fill(slot, pose) {
      if (slot === 1 && !positionB) return
      const nor = normalSlots[slot]
      fillShape(slots[slot], nor, pose)
      if (slot === 0) uniforms.uBudHead.value.set(pose.head.cx, pose.head.cy, pose.head.cz, pose.head.radius)
      if (nor) fillHairs(slot, slots[slot], nor, pose)
    },
    finish(time) {
      uniforms.uBudOpen.value = headOpen(time)
      uniforms.uBudShut.value = (1 - smoothstep(bloom0 - 4, bloom0 - 0.7, time)) * smoothstep(bloom0 - 16, bloom0 - 10, time)
      position.needsUpdate = true
      if (positionB) positionB.needsUpdate = true
      normal.needsUpdate = true
      hairs?.finish()
      down?.finish()
      ice?.finish()
    },
  }
}
