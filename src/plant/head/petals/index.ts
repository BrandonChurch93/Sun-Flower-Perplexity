import { norm } from '../../norm.ts'
import * as THREE from 'three'
import type { Assets } from '../../../core/assets.ts'
import { config } from '../../../config.ts'
import { combine, hash01, streamSeed } from '../../../core/random.ts'
import { RAY_FIRST, headOpen, rayAngle, rayCount, rayLength, rayOpen, realOf } from '../../growth.ts'
import { createHairFrames, createHairs, packWay, type HairFrames, type HairSet } from '../../hairs/index.ts'
import { filling, makePartSurface, partGeometry, partMesh, type PartDetail, type PartOptions, type PlantPart } from '../../part.ts'
import { setFrame, type Pose } from '../../skeleton.ts'
import { flutter, gust } from '../../wind.ts'
import { fragment, vertex } from './skin.ts'

interface Shape { us: number[]; vs: number[]; stations: number[]; hairs: number; count: number }

const heroRows = 19
const HERO_RAYS = 38
const HERO_SHAPE: Shape = {
  us: Array.from({ length: heroRows }, (_, i) => 1 - Math.pow(1 - i / (heroRows - 1), 1.3)),
  vs: [-1, -0.92, -0.62, -0.34, 0, 0.34, 0.62, 0.92, 1],
  stations: [0, 3, 9, 15],
  hairs: 2000,
  count: HERO_RAYS,
}
const COMPANION_SHAPE: Shape = {
  us: Array.from({ length: 7 }, (_, i) => 1 - Math.pow(1 - i / 6, 1.3)),
  vs: [-1, -0.9, 0, 0.9, 1],
  stations: [0, 2, 5],
  hairs: 1000,
  count: HERO_RAYS,
}
const SHAPE: Record<PartDetail, Shape> = {
  hero: HERO_SHAPE,
  near: { us: [0, 0.18, 0.38, 0.62, 0.84, 1], vs: [-1, 0, 1], stations: [], hairs: 0, count: HERO_RAYS },
  far: { us: [0.1, 1], vs: [-1, 1], stations: [], hairs: 0, count: rayCount },
}

const FOLD_OPEN = [0.42, 0.88, -0.52, 0.52, -0.88, -0.42]
const FOLD_BUD = [-0.15, -0.85, -0.2, 0.2, 0.85, 0.15]
const FOLD_LIFT = [-0.88, 0.22, -0.68, 0.68, -0.22, 0.88]
const FOLD_MID = [-0.77, -0.48, -0.17, 0.17, 0.48, 0.77]
const STRAP_FILL = 2.75
const SHINGLE = 0.13
const RANK_PITCH = 0.56
const RANK_UP = 0.0
const RANK_DOWN = 0.075
const RANK_APART_UP = 0
const RANK_APART_DOWN = 0.055
const RIM_TURN = 0.95
const SAG = 0.13
const FLAP = 0.28
const FLAP_GUST = 0.12
const ROLL = 0.32
const WAG = 0.08
const FOOT_SHUT = 0.05
const FOOT_OPEN = -0.055
const FOOT_STAGGER = 0.022
const ROOT_DROP = 0.62
const TIP_TUCK = 0.34
const GAP_COMB = 0.45
const GAP_REACH = 0.15
const LATE_FROM_S = config.growth.open
const DRAWN_FROM_S = 53.55

const TEETH = [
  [-0.0028, -0.0014, 0.0, 0.001, 0.0022, 0.001, 0.0, -0.0014, -0.0028],
  [-0.016, -0.003, 0.011, 0.02, -0.022, 0.02, 0.011, -0.003, -0.016],
  [-0.018, -0.004, 0.01, 0.022, -0.02, 0.017, 0.008, -0.005, -0.018],
]

const smooth = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}
const mix = (a: number, b: number, t: number): number => a + (b - a) * t

interface Ray {
  rank: number
  deep: number
  cut: number
  cup: number
  short: number
  nod: number
  width: number
  droop: number
  tipCurl: number
  hard: number
  hardAt: number
  twist: number
  tipTwist: number
  yaw: number
  tipSweep: number
  lagExtra: number
  lean: number
  clump: number
  arch: number
  hook: number
  buckle: number
  buckleFreq: number
  sway: number
  edgeCurl: number
  edgeSide: number
  pleat: number
  trough: number
  lay: number
  roll: number
  wave: number
  waveFreq: number
  wavePhase: number
  crumple: number
  tipShape: number
  teeth: number
  nickRow: number
  nickSide: number
  seed: number
  jitter: number
  lateLong: number
  lateDrawn: number
  lateSlim: number
  lateWide: number
  lateLay: number
  lateDroop: number
  lateCurl: number
  lateTwist: number
}

function outline(u: number): number {
  const peak = 0.38
  const rise = Math.pow(Math.sin((Math.PI / 2) * Math.min(1, u / peak)), 0.65)
  const s = Math.max(0, (u - peak) / (1 - peak))
  return (0.22 + 0.78 * rise) * (0.014 + 0.986 * Math.pow(1 - Math.pow(s, 1.44), 1.12))
}

function lance(u: number): number {
  const peak = 0.36
  const rise = Math.pow(Math.sin((Math.PI / 2) * Math.min(1, u / peak)), 0.67)
  const s = Math.max(0, (u - peak) / (1 - peak))
  return (0.22 + 0.78 * rise) * (0.014 + 0.986 * Math.pow(1 - Math.pow(s, 1.34), 1.15))
}

function makeRays(seed: number, total: number): Ray[] {
  const r = (i: number, k: number) => hash01(seed, i, k)
  const order = (i: number, pick: (k: number) => boolean) =>
    Array.from({ length: total }, (_, k) => k)
      .filter(pick)
      .sort((a, b) => r(i, a) - r(i, b))
  const hard = order(20, () => true).slice(0, 8)
  const twistedTips = order(51, () => true).slice(0, 11)
  const half = order(21, (k) => !hard.includes(k)).slice(0, 6)
  const lagged = order(42, (k) => k % 2 === 1).slice(0, 5)
  const nick = order(22, (k) => !hard.includes(k) && !half.includes(k))[0]
  return Array.from({ length: total }, (_, k) => {
    const rank = k % 2
    const folded = half.includes(k)
    const raySeed = r(12, k)
    const tipShape = raySeed < 0.34 ? 1 : raySeed < 0.64 ? 2 : 0
    const lenPick = r(37, k)
    const short =
      lenPick < 0.24
        ? 0.64 + 0.14 * r(38, k)
        : lenPick < 0.54
          ? 0.8 + 0.12 * r(38, k)
          : lenPick < 0.8
            ? 0.95 + 0.12 * r(38, k)
            : (rank ? 1.07 : 1.12) + 0.13 * r(38, k)
    const tipSign = r(4, k) < 0.5 ? -1 : 1
    return {
      rank,
      deep: r(48, k),
      cut: rank * 0.24 * r(49, k) * r(49, k),
      short,
      nod: r(39, k) < 0.3 ? 0.22 + 0.3 * r(46, k) : 0,
      width: (rank ? 0.245 : 0.285) + 0.105 * r(1, k),
      droop: rank ? 0.14 + 0.24 * r(2, k) : 0.06 + 0.21 * r(2, k),
      tipCurl: (r(3, k) - 0.42) * 1.05,
      hard: hard.includes(k) ? (r(52, k) < 0.44 ? -1 : 1) * (0.42 + 0.38 * r(13, k)) : 0,
      hardAt: 0.44 + 0.26 * r(14, k),
      twist: tipSign * ((folded ? 0.36 : 0.15) + 0.32 * r(36, k)),
      tipTwist: twistedTips.includes(k) ? tipSign * (1.02 + 0.62 * r(53, k)) : tipSign * 0.24 * r(53, k),
      yaw: (r(6, k) - 0.5) * 0.4,
      tipSweep: r(50, k) < 0.4 ? (r(5, k) < 0.5 ? -1 : 1) * (0.44 + 0.46 * r(5, k)) : (r(5, k) - 0.5) * 0.4,
      lagExtra: lagged.includes(k) ? 0.1 + 0.1 * r(43, k) : 0,
      lean: 0.048 * Math.sin(k * 2.1 + 6.283 * r(24, 0)) + (r(25, k) - 0.5) * 0.125,
      clump: 0.11 * Math.sin(k * 1.9 + 6.283 * r(26, 0)) + (r(27, k) - 0.5) * 0.18,
      arch: r(28, k),
      cup: rank ? 0.03 + 0.08 * r(47, k) : 0.06 + 0.11 * r(47, k),
      hook: (r(29, k) - 0.45) * 0.52,
      pleat: folded ? 0.2 : 0.72 + 0.38 * r(7, k),
      trough: folded ? (r(54, k) < 0.45 ? -1.55 : 1.75) + 0.25 * r(8, k) : 0.22 + 0.42 * r(8, k),
      lay: rank ? -0.19 + (r(9, k) - 0.5) * 0.12 : 0.05 + (r(9, k) - 0.5) * 0.11,
      roll: 0.02 + (r(10, k) - 0.5) * 0.24,
      buckle: 0.015 + 0.032 * r(30, k),
      buckleFreq: 3.6 + 2.4 * r(31, k),
      sway: (r(32, k) - 0.5) * 0.06,
      edgeCurl: r(33, k) < 0.5 ? 0.22 + 0.42 * r(34, k) : 0,
      edgeSide: r(35, k) < 0.5 ? -1 : 1,
      wave: 0.005 + 0.008 * r(15, k),
      waveFreq: 4.5 + 3.5 * r(16, k),
      wavePhase: 6.283 * r(17, k),
      crumple: 0.005 + 0.008 * r(18, k),
      tipShape,
      teeth: tipShape === 1 ? (r(11, k) < 0.5 ? 1 : 2) : 0,
      nickRow: k === nick ? 8 + Math.floor(4 * r(19, k)) : -1,
      nickSide: r(23, k) < 0.5 ? -1 : 1,
      seed: raySeed,
      jitter: (r(81, k) - 0.5) * 0.48,
      lateLong: 0.03 + 0.06 * r(60, k),
      lateWide: 0.04 * r(61, k),
      lateDrawn: 0.04 + 0.05 * r(60, k),
      lateSlim: 0.05 + 0.12 * r(61, k),
      lateLay: rank ? -0.03 - 0.05 * r(62, k) : -0.03 * r(63, k),
      lateDroop: 0.02 + 0.05 * r(64, k),
      lateCurl: 0.05 + 0.12 * r(66, k),
      lateTwist: (r(4, k) < 0.5 ? -1 : 1) * 0.06 * r(68, k),
    }
  })
}

export function create(options: PartOptions): PlantPart | null {
  const hero = options.variant === 0
  const shape = options.detail === 'hero' && !hero ? COMPANION_SHAPE : SHAPE[options.detail]
  const { us, vs, stations } = shape
  const nu = us.length
  const nv = vs.length
  const rimmed = nv >= 5
  const stripMap = nv === 9 ? [0, 0, 1, 2, 3, 4, 5, 5] : nv === 7 ? [0, 1, 2, 3, 4, 5] : [0, 2, 3, 5]
  const teethMap = nv === 9 ? [0, 1, 2, 3, 4, 5, 6, 7, 8] : nv === 7 ? [0, 1, 3, 4, 5, 7, 8] : [0, 1, 4, 7, 8]
  const per = nu * nv
  const total = shape.count
  const count = total * per
  const seed = combine(streamSeed('petals'), options.variant)
  const rays = makeRays(seed, total)
  const field = Boolean(options.places)

  const geometry = partGeometry(options)
  const slots = [new Float32Array(count * 3), new Float32Array(count * 3)]
  const both = field ? [0] : [0, 1]
  const normalSets = both.map(() => new Float32Array(count * 3))
  const fieldState = field ? new Float32Array(count * 4) : null
  const rayStateA = field ? null : Array.from({ length: HERO_RAYS }, () => new THREE.Vector4())
  const rayStateB = field ? null : Array.from({ length: HERO_RAYS }, () => new THREE.Vector4())
  let normals = normalSets[0]
  const filled = [false, false]
  const led = [false, false]
  const uv = new Float32Array(count * 2)
  const info = new Float32Array(count * 4)
  const index: number[] = []
  for (let k = 0; k < total; k++) {
    const base = k * per
    const ray = rays[k]
    const flip = hash01(seed, 30, k) < 0.5 ? -1 : 1
    const packedSeed = field ? ray.seed : Math.min(k, HERO_RAYS - 1) + Math.min(ray.seed, 0.999) * 0.999
    for (let i = 0; i < nu; i++) {
      for (let j = 0; j < nv; j++) {
        const v = base + i * nv + j
        uv[v * 2] = us[i]
        uv[v * 2 + 1] = vs[j] * 0.5 + 0.5
        info[v * 4] = packedSeed
        info[v * 4 + 1] = 0.32 + 0.36 * hash01(seed, 31, k)
        info[v * 4 + 2] = flip
        info[v * 4 + 3] = 0.03 + 0.1 * hash01(seed, 32, k)
      }
    }
    if (options.detail === 'far') {
      index.push(base, base + 2, base + 1)
      continue
    }
    for (let i = 0; i < nu - 1; i++) {
      for (let j = 0; j < nv - 1; j++) {
        const a = base + i * nv + j
        const b = a + nv
        index.push(a, b, a + 1, a + 1, b, b + 1)
      }
    }
  }
  const dynamic = (array: Float32Array, size: number) => new THREE.BufferAttribute(array, size).setUsage(THREE.DynamicDrawUsage)
  const position = dynamic(slots[0], 3)
  const positionB = field ? null : dynamic(slots[1], 3)
  const normalAttrs = both.map((k) => dynamic(normalSets[k], 3))
  const fieldStateAttr = fieldState ? dynamic(fieldState, 4) : null
  geometry.setAttribute('position', position)
  if (positionB) geometry.setAttribute('positionB', positionB)
  normalAttrs.forEach((n, k) => geometry.setAttribute(k === 1 ? 'normalB' : 'normal', n))
  if (fieldStateAttr) geometry.setAttribute('aState', fieldStateAttr)
  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
  geometry.setAttribute('aRay', new THREE.BufferAttribute(info, 4))
  geometry.setIndex(index)

  const mapped = options.detail === 'hero'
  const blank = new THREE.DataTexture(new Uint8Array([200, 200, 60, 255]), 1, 1)
  blank.needsUpdate = true
  const uniforms: Record<string, { value: unknown }> = mapped
    ? { uRayColor: { value: blank as THREE.Texture }, uRayData: { value: blank as THREE.Texture }, uRaySize: { value: new THREE.Vector2(1, 1) } }
    : {}
  if (!field && rayStateA && rayStateB) {
    uniforms.uRayStateA = { value: rayStateA }
    uniforms.uRayStateB = { value: rayStateB }
  }
  const surface = makePartSurface(options, { name: 'petals', vertex, fragment, side: THREE.DoubleSide, uniforms })
  const mesh = partMesh(geometry, surface)

  const hairCount = hero ? shape.hairs : Math.round(shape.hairs / 4)
  const hairs: HairSet | null = hairCount > 0 ? createHairs(options, hairCount, 'petal hairs', [0.95, 0.93, 0.7], 0.00003) : null
  const stationCount = stations.length
  const hairFrames: HairFrames | null = hairs && stationCount >= 2 ? createHairFrames(total * stationCount) : null
  const poseMatrix = new THREE.Matrix4()
  let framesFilled = false
  if (hairs && hairFrames) {
    const seats = hairs.bindFrames(hairFrames, 0.0006)
    for (let n = 0; n < hairs.count; n++) {
      const h0 = hash01(seed, 40, n)
      const h1 = hash01(seed, 41, n)
      const h2 = hash01(seed, 42, n)
      const w = hash01(seed, 43, n)
      const edgePick = hash01(seed, 44, n) < 0.55
      const k = Math.min(total - 1, Math.floor(h0 * total))
      const u = edgePick ? 0.02 + 0.2 * h1 * h1 : 0.05 + 0.6 * h1
      const v = edgePick ? h2 * 2 - 1 : [-0.62, -0.34, 0, 0.34, 0.62][Math.floor(hash01(seed, 45, n) * 5)] + (h2 - 0.5) * 0.08
      let s = 0
      while (s < stationCount - 2 && us[stations[s + 1]] < u) s++
      const u0 = us[stations[s]]
      const u1 = us[stations[s + 1]]
      const fu = Math.min(1, Math.max(0, (u - u0) / Math.max(1e-6, u1 - u0)))
      const g = Math.floor((k * rayCount) / total) % rayCount
      const full = rayLength(g, 1e3)
      const scale = (0.0005 + 0.0008 * w) * (full / 0.07) * (1 - 0.5 * u)
      const f0 = k * stationCount + s
      const o = n * 12
      seats[o] = f0
      seats[o + 1] = f0 + 1
      seats[o + 2] = fu
      seats[o + 3] = scale
      seats[o + 4] = v >= 0 ? Math.min(1, v) : 0
      seats[o + 5] = v < 0 ? Math.min(1, -v) : 0
      seats[o + 6] = edgePick ? 0 : 2
      seats[o + 7] = w
      seats[o + 8] = 0
      seats[o + 9] = 0.6
      seats[o + 10] = 1
      seats[o + 11] = 0
    }
    hairs.sealSeats()
  }

  const uStep = new Float64Array(nu)
  const uE = new Float64Array(nu)
  const uE12 = new Float64Array(nu)
  const uE135 = new Float64Array(nu)
  const uE15 = new Float64Array(nu)
  const uE18 = new Float64Array(nu)
  const uSm015 = new Float64Array(nu)
  const uSinPi = new Float64Array(nu)
  const uSm75 = new Float64Array(nu)
  const uSm1560 = new Float64Array(nu)
  const uSm2590 = new Float64Array(nu)
  const uCurlW = new Float64Array(nu)
  const uSm68 = new Float64Array(nu)
  const uSm1040 = new Float64Array(nu)
  const uSm2060 = new Float64Array(nu)
  const uSm0570 = new Float64Array(nu)
  const uSm0052 = new Float64Array(nu)
  const uSweepW = new Float64Array(nu)
  const uTwistW = new Float64Array(nu)
  const uStrap0 = new Float64Array(nu)
  const uOutline = new Float64Array(nu)
  const uLance = new Float64Array(nu)
  const uPlaceW = new Float64Array(nu)
  const uRagged = new Float64Array(nu)
  const uSm0022 = new Float64Array(nu)
  const uSm6296 = new Float64Array(nu)
  const uSm1575 = new Float64Array(nu)
  const uSm1565 = new Float64Array(nu)
  const uRimW = new Float64Array(nu)
  const uTipSq = new Float64Array(nu)
  const uRumpleSm = new Float64Array(nu)
  for (let i = 0; i < nu; i++) {
    const u = us[i]
    const prev = i === 0 ? 0 : us[i - 1]
    const e = (prev + u) * 0.5
    uStep[i] = u - prev
    uE[i] = e
    uE12[i] = Math.pow(e, 1.2)
    uE135[i] = Math.pow(e, 1.35)
    uE15[i] = Math.pow(e, 1.5)
    uE18[i] = Math.pow(e, 1.8)
    uSm015[i] = smooth(0, 0.15, e)
    uSinPi[i] = Math.sin(Math.PI * e)
    uSm75[i] = smooth(0.75, 1, e)
    uSm1560[i] = smooth(0.15, 0.6, e)
    uSm2590[i] = smooth(0.25, 0.9, e)
    uCurlW[i] = Math.pow(smooth(0.62, 1, e), 1.3)
    uSm68[i] = smooth(0.68, 1, e)
    uSm1040[i] = smooth(0.1, 0.4, e)
    uSm2060[i] = smooth(0.2, 0.6, e)
    uSm0570[i] = smooth(0.05, 0.7, e)
    uSm0052[i] = smooth(0, 0.52, e)
    uSweepW[i] = Math.pow(smooth(0.36, 1, e), 1.45)
    uTwistW[i] = Math.pow(smooth(0.52, 1, e), 1.35)
    uStrap0[i] = 1.08 * (0.05 + 0.95 * Math.pow(1 - Math.pow(u, 1.5), 0.9))
    uOutline[i] = outline(u)
    uLance[i] = lance(u)
    uPlaceW[i] = (Math.PI / total) * (0.95 - 0.7 * u) * (1 - 0.92 * smooth(0.55, 1, u)) * STRAP_FILL
    uRagged[i] = 0.016 * smooth(0.05, 0.3, u)
    uSm0022[i] = smooth(0, 0.22, u)
    uSm6296[i] = smooth(0.62, 0.96, u)
    uSm1575[i] = smooth(0.15, 0.75, u)
    uSm1565[i] = smooth(0.15, 0.65, u)
    uRimW[i] = RIM_TURN * (1 - 0.45 * smooth(0.75, 1, u))
    const ts = smooth(0.82, 1, u)
    uTipSq[i] = ts * ts
    uRumpleSm[i] = smooth(0, 0.15, u)
  }

  const rayAround = new Float64Array(total)
  const rayCosA = new Float64Array(total)
  const raySinA = new Float64Array(total)
  const rayFk = new Float64Array(total)
  const rayGIdx = new Int32Array(total)
  const rayOpp = new Int32Array(total)
  const rayLag = new Float64Array(total)
  const raySwirlRand = new Float64Array(total)
  const rayStandYaw = new Float64Array(total)
  const rayStandTwist = new Float64Array(total)
  const rayLimpW = new Float64Array(total)
  const rayLate70Start = new Float64Array(total)
  const rayLate70Span = new Float64Array(total)
  const rayDrawnStart = new Float64Array(total)
  const rayDrawnSpan = new Float64Array(total)
  const rayLate72Start = new Float64Array(total)
  const rayLate72Span = new Float64Array(total)
  const rayLate74Start = new Float64Array(total)
  const rayLate74Span = new Float64Array(total)
  const rayLate76Start = new Float64Array(total)
  const rayLate76Span = new Float64Array(total)
  const kiHardSm = new Float32Array(total * nu)
  const kiBuckleSin = new Float32Array(total * nu)
  const kiSin6 = new Float32Array(total * nu)
  const kiSwaySin = new Float32Array(total * nu)
  const kiLeft = new Float32Array(total * nu)
  const kiRight = new Float32Array(total * nu)
  const vWave = new Float32Array(count)
  const vRumple = new Float32Array(count)
  for (let k = 0; k < total; k++) {
    const ray = rays[k]
    const around = ((k + ray.jitter) / total) * Math.PI * 2
    const fk = (((k + ray.jitter) / total) * rayCount + rayCount) % rayCount
    const awayShare = 0.5 * (1 - Math.cos(around - RAY_FIRST))
    const awayFlank = 0.5 + 0.5 * Math.sin(around - RAY_FIRST)
    const latePeel = smooth(0.22, 0.94, awayShare) * (0.20 * awayFlank + 0.52 * hash01(seed, 64, k >> 1) + 0.24 * ray.rank)
    rayAround[k] = around
    rayCosA[k] = Math.cos(around)
    raySinA[k] = Math.sin(around)
    rayFk[k] = fk
    rayGIdx[k] = Math.floor(fk) % rayCount
    rayOpp[k] = Math.floor(((k + (total >> 1)) % total) * (rayCount / total)) % rayCount
    rayLag[k] = hero ? 0.14 * ray.rank + 0.14 * awayShare + latePeel + ray.lagExtra : 0.12 * ray.rank
    raySwirlRand[k] = 0.85 + 0.3 * hash01(seed, 33, k)
    rayStandYaw[k] = (hash01(seed, 62, k) - 0.5) * 0.30
    rayStandTwist[k] = (hash01(seed, 63, k) - 0.5) * 0.44
    rayLimpW[k] = 0.55 + 0.9 * hash01(seed, 91, k)
    rayLate70Start[k] = LATE_FROM_S + 3.5 * hash01(seed, 70, k)
    rayLate70Span[k] = mix(3, 5, hash01(seed, 71, k))
    rayDrawnStart[k] = DRAWN_FROM_S + 1.2 * hash01(seed, 84, k)
    rayDrawnSpan[k] = mix(2.2, 3.5, hash01(seed, 85, k))
    rayLate72Start[k] = LATE_FROM_S + 2.5 * hash01(seed, 72, k)
    rayLate72Span[k] = mix(3, 4.5, hash01(seed, 73, k))
    rayLate74Start[k] = LATE_FROM_S + 0.5 + 4 * hash01(seed, 74, k)
    rayLate74Span[k] = mix(2.5, 4, hash01(seed, 75, k))
    rayLate76Start[k] = LATE_FROM_S + 0.3 + 4.5 * hash01(seed, 76, k)
    rayLate76Span[k] = mix(2.5, 4, hash01(seed, 77, k))
    for (let i = 0; i < nu; i++) {
      const u = us[i]
      const e = uE[i]
      const ki = k * nu + i
      kiHardSm[ki] = smooth(ray.hardAt, ray.hardAt + 0.3, e)
      kiBuckleSin[ki] = ray.buckle * Math.sin(e * ray.buckleFreq + ray.wavePhase)
      kiSin6[ki] = 0.08 * Math.sin(e * 6 + ray.wavePhase) * uSm2060[i]
      kiSwaySin[ki] = ray.sway * Math.sin(e * 4.1 + ray.wavePhase * 1.7)
      kiLeft[ki] = 1 + uRagged[i] * (Math.sin(u * 7.1 + ray.seed * 53) + 0.45 * Math.sin(u * 15.3 + ray.seed * 97))
      kiRight[ki] = 1 + uRagged[i] * (Math.sin(u * 6.7 + ray.seed * 31) + 0.45 * Math.sin(u * 14.7 + ray.seed * 11))
      for (let j = 0; j < nv; j++) {
        const v = vs[j]
        const edge = Math.abs(v) * v * v
        const vi = k * per + i * nv + j
        vWave[vi] = ray.wave * (0.35 + 0.65 * u) * edge * Math.sin(ray.waveFreq * u + ray.wavePhase + (v > 0 ? 1.9 : 0))
        vRumple[vi] = (0.6 * Math.sin(v * 7.3 + u * 2.1 + ray.seed * 40) * Math.sin(u * 5.2 + ray.seed * 17) + 0.4 * Math.sin(v * 12.1 - u * 3.4 + ray.seed * 71)) * uRumpleSm[i]
      }
    }
  }

  const cx = new Float64Array(nv)
  const cy = new Float64Array(nv)
  const nowOpen = new Float64Array(rayCount)
  const nowFull = new Float64Array(rayCount)
  const nowLen = new Float64Array(rayCount)

  let goOpen = 0
  let goAngle = 0
  let goFull = 0
  let goLen = 0
  const evalGrowth = (fk: number, time: number, lag: number): void => {
    const t = time - lag
    const g0 = Math.floor(fk) % rayCount
    if (!hero) {
      goOpen = rayOpen(g0, t)
      goAngle = rayAngle(g0, t)
      goFull = nowFull[g0]
      goLen = rayLength(g0, t)
      return
    }
    const g1 = (g0 + 1) % rayCount
    const f = fk - Math.floor(fk)
    goOpen = mix(rayOpen(g0, t), rayOpen(g1, t), f)
    goAngle = mix(rayAngle(g0, t), rayAngle(g1, t), f)
    goFull = mix(nowFull[g0], nowFull[g1], f)
    goLen = mix(rayLength(g0, t), rayLength(g1, t), f)
  }

  const layRay = (out: Float32Array, k: number, pose: Pose, slot: 0 | 1, hOpen: number, real: number): void => {
    const ray = rays[k]
    const base = k * per
    const time = pose.time
    const fk = rayFk[k]
    evalGrowth(fk, time, rayLag[k])
    const full = goFull
    const grown = full > 0 ? goLen / full : 0
    const h = pose.head
    const open = goOpen
    const unfold = smooth(0.75, 1, open)
    const rawAngle = goAngle
    const flatten = unfold * Math.max(0, Math.PI / 2 - rawAngle - 0.16) * 0.24
    const angle = rawAngle + flatten

    const longer = smooth(rayLate70Start[k], rayLate70Start[k] + rayLate70Span[k], time)
    const drawn = smooth(rayDrawnStart[k], rayDrawnStart[k] + rayDrawnSpan[k], time)
    const sunk = smooth(rayLate72Start[k], rayLate72Start[k] + rayLate72Span[k], time)
    const curled = smooth(rayLate74Start[k], rayLate74Start[k] + rayLate74Span[k], time)
    const twisted = smooth(rayLate76Start[k], rayLate76Start[k] + rayLate76Span[k], time)

    const lifted = smooth(0.1, 0.9, open)
    const rise = Math.PI / 2 - angle
    const seat = smooth(0.2, 0.65, rise) * smooth(0.8, 1, open)
    const rankOut = ray.rank * 0.036 * lifted
    const foot = mix(FOOT_SHUT, FOOT_OPEN, lifted) + rankOut + 0.5 * (FOOT_SHUT - FOOT_OPEN) * seat
    const ca = rayCosA[k]
    const sa = raySinA[k]
    const ox = h.px * ca + h.qx * sa
    const oy = h.py * ca + h.qy * sa
    const oz = h.pz * ca + h.qz * sa
    const swirl = (0.5 + 0.5 * smooth(-0.3, 0.5, oy)) * raySwirlRand[k]

    const across = nowOpen[rayOpp[k]]
    const alone = smooth(0.75, 1, across)
    const reach = GAP_REACH * smooth(0.15, 0.7, across) * (1 - alone)
    const gIdx = rayGIdx[k]
    const sidePos = (nowOpen[(gIdx + 2) % rayCount] + nowOpen[(gIdx + 4) % rayCount]) * 0.5
    const sideNeg = (nowOpen[(gIdx - 2 + rayCount) % rayCount] + nowOpen[(gIdx - 4 + rayCount) % rayCount]) * 0.5
    const comb = GAP_COMB * (sidePos - sideNeg)
    const absCombNorm = Math.abs(comb) / GAP_COMB
    const tuck = (1 - smooth(0.1, 0.5, across)) * smooth(0.9, 1, ray.short) * (1 - smooth(0.02, 0.1, ray.cut)) * (1 - smooth(0, 0.1, open)) * (1 - smooth(0, 0.3, absCombNorm))
    const openReach = (FOOT_SHUT - FOOT_OPEN) * h.radius + (ray.rank ? 0.15 : 0.11) * full
    const standUp = smooth(0.06, 0.48, hOpen) * (1 - smooth(0.55, 0.95, open))
    const standYaw = standUp * rayStandYaw[k]
    const standTwist = standUp * rayStandTwist[k]
    const length = (goLen + mix(mix(1.13 - 0.03 * swirl + reach - ray.cut, 0.96, alone) * (0.95 + 0.1 * ray.arch) * h.radius * Math.min(1, grown / 0.72) - goLen, openReach, lifted)) * ray.short * (1 + ray.lateLong * longer + ray.lateDrawn * drawn)

    const frame = setFrame(
      h.cx + h.ax * (0.5 * h.depth) + ox * (h.radius * 0.95),
      h.cy + h.ay * (0.5 * h.depth) + oy * (h.radius * 0.95),
      h.cz + h.az * (0.5 * h.depth) + oz * (h.radius * 0.95),
      h.ax,
      h.ay,
      h.az,
      ox,
      oy,
      oz,
      rise,
    )
    const outward = foot * h.radius
    const apart = smooth(0.02, 0.1, hOpen)
    const back = (ray.rank * (0.055 + 0.095 * lifted) + (k % 4 === 2 ? 0.028 : 0) * lifted - FOOT_STAGGER * ray.deep * lifted - ((RANK_UP + RANK_APART_UP * apart) * ray.rank - (RANK_DOWN + RANK_APART_DOWN * apart) * (1 - ray.rank) * (1 - 0.6 * smooth(0, 0.6, absCombNorm))) * (1 - smooth(0, 0.72, open)) - 0.145 - 0.28 * lifted * (1 - lifted) + 0.04 * seat) * full
    let px = frame.ox + ox * outward - h.ax * back
    let py = frame.oy + oy * outward - h.ay * back
    let pz = frame.oz + oz * outward - h.az * back
    const young = (0.08 + 0.12 * ray.arch) * (1 - unfold)
    const shaped = mix(0.2, 1, unfold)
    const cupped = smooth(0.2, 0.65, rise) * unfold
    const fny = frame.ny
    const fwy = frame.wy
    let tx = frame.mx
    let ty = frame.my
    let tz = frame.mz
    let wx = frame.wx
    let wy = fwy
    let wz = frame.wz
    let nx = frame.nx
    let ny = fny
    let nz = frame.nz
    const wind = pose.inputs.wind * flutter(real, ray.seed)
    const surplus = (pose.inputs.wind - Math.min(pose.inputs.calm ?? pose.inputs.wind, pose.inputs.wind)) * smooth(0.8, 1, open)
    let flap = 0
    let roll = 0
    let wag = 0
    if (surplus > 0) {
      const limp = surplus * rayLimpW[k]
      const blow = gust(real, frame.ox, frame.oz)
      const hard = 0.6 + 0.4 * blow
      flap = limp * (FLAP * hard * flutter(real, ray.seed * 0.83 + 0.09) + FLAP_GUST * blow)
      roll = limp * ROLL * hard * flutter(real - 0.07, ray.seed * 0.41 + 0.37)
      wag = limp * WAG * flutter(real - 0.13, ray.seed * 0.67 + 0.21)
    }
    const wide = ray.width * length * Math.pow(Math.max(0, grown), 0.35) * 0.5 * (options.detail === 'far' ? 1.85 : 1) * (1 + ray.lateWide * longer - ray.lateSlim * drawn)
    const fresh = 1 - smooth(0.02, 0.45, open)
    const ripe = smooth(0.78, 1, open)
    const freshAlone = fresh * (1 - 0.6 * alone)
    if (filling.lead && !fieldState) {
      ;(slot === 0 ? rayStateA : rayStateB)![k].set(fresh, unfold, ripe, freshAlone)
    }
    const strapMix = smooth(0.28, 0.62, open)
    const openSm25 = smooth(0.2, 0.5, open)
    const placeScale = h.radius * mix(1, 0.5, standUp) * (0.94 + 1.55 * (ray.width - 0.245)) * Math.min(1, grown / 0.72)
    const standBase = standUp * (0.84 + 0.34 * ray.arch + 0.14 * ray.rank)
    const droopSunk = ray.droop + ray.lateDroop * sunk
    const curlCurled = ray.tipCurl + ray.lateCurl * curled
    const hardCurled = ray.hard * (1 + 0.3 * curled)
    const openPitchBase = ray.lay + ray.lateLay * sunk + ray.cup * unfold + young
    const twistOpenRate = ray.twist + ray.lateTwist * twisted
    const nickScale = ray.nickRow >= 0 ? ray.nickSide * 0.025 * full * grown : 0
    const teethRow = TEETH[ray.teeth]
    let pitch0 = 0
    let yaw0 = 0
    let twist0 = 0
    for (let i = 0; i < nu; i++) {
      const u = us[i]
      const e = uE[i]
      const ki = k * nu + i
      const along = smooth(0, 1, open * 2.7 - 0.22 * uE15[i])
      const flat = smooth(0, 1, unfold * 1.25 - 0.22 * u)
      const standLift = standBase * (1 - 0.36 * e)
      const shut = 1.52 + 0.50 * uSm015[i] + 1.16 * e - 0.10 * uSinPi[i] + 0.12 * (ray.arch - 0.5) - standLift + (0.2 * ray.hook + TIP_TUCK * tuck) * uSm75[i] + RANK_PITCH * (0.5 - ray.rank) * uSm1560[i]
      const openPitch = openPitchBase - shaped * (droopSunk * uE135[i] - ray.nod * uSm2590[i] + curlCurled * uCurlW[i] + hardCurled * kiHardSm[ki]) - 0.48 * (1 - unfold) * uSm68[i]
      const sag = SAG * along * uE15[i]
      const tipward = surplus > 0 ? uE18[i] : 0
      const ripple = along * uSm1040[i]
      const pitch = mix(shut - rise, openPitch, along) - sag * fny + 0.03 * wind * e * e + ripple * kiBuckleSin[ki] + flap * tipward
      const yaw = mix((0.08 + 0.62 * e) * (1 - 0.55 * standUp) * swirl + standYaw * (0.35 + 0.65 * e) + 0.8 * ray.clump * e + kiSin6[ki] + comb * uSm0570[i], ray.lean + 0.62 * ray.clump * uSm0052[i] + ray.yaw * uE135[i] + ray.tipSweep * uSweepW[i], along) - 0.4 * sag * fwy + ripple * kiSwaySin[ki] + wag * tipward
      const twist = mix(SHINGLE * (1 - 0.5 * standUp) + standTwist * (0.3 + 0.7 * e), ray.roll + twistOpenRate * uE12[i] + ray.tipTwist * uTwistW[i], along) + 0.02 * wind * e * e + 0.75 * (ray.hook - 0.05) * cupped * e + roll * tipward

      let d = pitch - pitch0
      let c = Math.cos(d)
      let s = Math.sin(d)
      let ax = tx * c + nx * s
      let ay = ty * c + ny * s
      let az = tz * c + nz * s
      nx = nx * c - tx * s
      ny = ny * c - ty * s
      nz = nz * c - tz * s
      tx = ax
      ty = ay
      tz = az
      d = yaw - yaw0
      c = Math.cos(d)
      s = Math.sin(d)
      ax = tx * c + wx * s
      ay = ty * c + wy * s
      az = tz * c + wz * s
      wx = wx * c - tx * s
      wy = wy * c - ty * s
      wz = wz * c - tz * s
      tx = ax
      ty = ay
      tz = az
      d = twist - twist0
      c = Math.cos(d)
      s = Math.sin(d)
      ax = wx * c + nx * s
      ay = wy * c + ny * s
      az = wz * c + nz * s
      nx = nx * c - wx * s
      ny = ny * c - wy * s
      nz = nz * c - wz * s
      wx = ax
      wy = ay
      wz = az
      pitch0 = pitch
      yaw0 = yaw
      twist0 = twist
      const step = uStep[i] * length
      px += tx * step
      py += ty * step
      pz += tz * step

      const strap = mix(uStrap0[i], 0.85 * uLance[i], strapMix)
      const place = uPlaceW[i] * placeScale
      const baseBlade = mix(uOutline[i], uLance[i], 0.65 * cupped)
      const openBlade = ray.tipShape === 1 ? baseBlade + 0.2 * smooth(0.76, 1, u) : ray.tipShape === 2 ? baseBlade * (1 - 0.46 * smooth(0.6, 0.94, u)) : baseBlade
      const halfWidth = mix(mix(place, wide * strap, along * openSm25), wide * openBlade, flat)
      const left = kiLeft[ki]
      const right = kiRight[ki]
      const trough = mix(0.75 * along + 0.62 * standUp, ray.trough, flat) + 0.95 * (1 - uSm0022[i]) * flat
      const rimPinch = ray.tipShape === 2 ? 0.55 * flat * uSm6296[i] : 0
      cx[0] = 0
      cy[0] = 0
      for (let j = 0; j < nv - 1; j++) {
        let foldAngle = 0
        if (rimmed) {
          const strip = stripMap[j]
          const mid = FOLD_MID[strip]
          foldAngle = mix(mix(FOLD_BUD[strip], FOLD_LIFT[strip], along), mix(FOLD_OPEN[strip] * ray.pleat * (1.55 - 0.65 * uSm1575[i]), FOLD_LIFT[strip] * 1.1, 0.75 * cupped), flat) + trough * mid
          if (mid * ray.edgeSide > 0.4) foldAngle += ray.edgeSide * ray.edgeCurl * flat * uSm1565[i] * (Math.abs(mid) > 0.7 ? 1 : 0.45)
          if (j === 0) foldAngle += uRimW[i] + rimPinch
          if (j === nv - 2) foldAngle -= uRimW[i] + rimPinch
        }
        const run = (vs[j + 1] - vs[j]) * halfWidth
        cx[j + 1] = cx[j] + Math.cos(foldAngle) * run
        cy[j + 1] = cy[j] + Math.sin(foldAngle) * run
      }
      const midX = rimmed ? cx[(nv - 1) >> 1] : (cx[0] + cx[nv - 1]) * 0.5
      const midY = rimmed ? cy[(nv - 1) >> 1] : (cy[0] + cy[nv - 1]) * 0.5
      const tipSq = uTipSq[i]
      const root = i === 0 ? ROOT_DROP * lifted * (1 - lifted) * full : 0
      const rumple = ray.crumple * full * (1 + 2 * fresh) * Math.min(1, halfWidth / (0.004 * (full / 0.07)))
      const waveScale = full * grown * (0.5 + 0.5 * flat)
      const isNickRow = i === ray.nickRow
      for (let j = 0; j < nv; j++) {
        const v = vs[j]
        const vi = base + i * nv + j
        let x = (cx[j] - midX) * (v < 0 ? left : right)
        if (isNickRow && v * ray.nickSide > 0.6) x -= nickScale * (Math.abs(v) > 0.95 ? 1 : Math.abs(v) > 0.9 ? 0.85 : 0.25)
        const y = cy[j] - midY + vWave[vi] * waveScale + rumple * vRumple[vi]
        const reachTip = rimmed ? teethRow[teethMap[j]] * length * tipSq : 0
        const at = vi * 3
        out[at] = px + wx * x + nx * y + tx * reachTip - h.ax * root
        out[at + 1] = py + wy * x + ny * y + ty * reachTip - h.ay * root
        out[at + 2] = pz + wz * x + nz * y + tz * reachTip - h.az * root
        if (filling.lead && fieldState) {
          const st = vi * 4
          fieldState[st] = fresh
          fieldState[st + 1] = flat
          fieldState[st + 2] = ripe
          fieldState[st + 3] = freshAlone
        }
      }
    }
  }

  const layNormals = (pos: Float32Array): void => {
    for (let k = 0; k < total; k++) {
      const base = k * per
      for (let i = 0; i < nu; i++) {
        const i0 = Math.max(0, i - 1)
        const i1 = Math.min(nu - 1, i + 1)
        for (let j = 0; j < nv; j++) {
          const j0 = Math.max(0, j - 1)
          const j1 = Math.min(nv - 1, j + 1)
          const a0 = (base + i0 * nv + j) * 3
          const a1 = (base + i1 * nv + j) * 3
          const b0 = (base + i * nv + j0) * 3
          const b1 = (base + i * nv + j1) * 3
          const ux = pos[a1] - pos[a0]
          const uy = pos[a1 + 1] - pos[a0 + 1]
          const uz = pos[a1 + 2] - pos[a0 + 2]
          const vx = pos[b1] - pos[b0]
          const vy = pos[b1 + 1] - pos[b0 + 1]
          const vz = pos[b1 + 2] - pos[b0 + 2]
          let x = uy * vz - uz * vy
          let y = uz * vx - ux * vz
          let z = ux * vy - uy * vx
          const l = norm(x, y, z)
          if (l > 1e-12) {
            x /= l
            y /= l
            z /= l
          } else {
            x = 0
            y = 1
            z = 0
          }
          const at = (base + i * nv + j) * 3
          normals[at] = x
          normals[at + 1] = y
          normals[at + 2] = z
        }
      }
    }
  }

  const layHairFrames = (pos: Float32Array, slot: 0 | 1, pose: Pose): void => {
    if (!hairFrames) return
    const h = pose.head
    const { px, py, pz, qx, qy, qz, ax, ay, az, cx: hcx, cy: hcy, cz: hcz } = h
    poseMatrix.set(px, qx, ax, hcx, py, qy, ay, hcy, pz, qz, az, hcz, 0, 0, 0, 1)
    hairFrames.pose(slot, poseMatrix)
    const fBuf = hairFrames.slot(slot)
    const midCol = (nv - 1) >> 1
    const rCol = Math.max(midCol + 1, nv - 2)
    const lCol = Math.min(midCol - 1, 1)
    for (let k = 0; k < total; k++) {
      const g = Math.floor((k * rayCount) / total) % rayCount
      const full = nowFull[g]
      const lenScale = full > 0 ? smooth(0, 0.5, nowLen[g] / full) : 0
      const base = k * per
      for (let s = 0; s < stationCount; s++) {
        const row = stations[s]
        const nextRow = Math.min(nu - 1, row + 1)
        const prevRow = row === nextRow ? Math.max(0, row - 1) : row
        const mIdx = (base + row * nv + midCol) * 3
        const rIdx = (base + row * nv + rCol) * 3
        const lIdx = (base + row * nv + lCol) * 3
        const u0Idx = (base + prevRow * nv + midCol) * 3
        const u1Idx = (base + nextRow * nv + midCol) * 3
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
        const axW = pos[rIdx] - pos[mIdx]
        const ayW = pos[rIdx + 1] - pos[mIdx + 1]
        const azW = pos[rIdx + 2] - pos[mIdx + 2]
        const bxW = pos[lIdx] - pos[mIdx]
        const byW = pos[lIdx + 1] - pos[mIdx + 1]
        const bzW = pos[lIdx + 2] - pos[mIdx + 2]
        let nx = uy * azW - uz * ayW
        let ny = uz * axW - ux * azW
        let nz = ux * ayW - uy * axW
        const nl = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1
        const dx = pos[mIdx] - (nx / nl) * 0.00005 - hcx
        const dy = pos[mIdx + 1] - (ny / nl) * 0.00005 - hcy
        const dz = pos[mIdx + 2] - (nz / nl) * 0.00005 - hcz
        const alX = ux * px + uy * py + uz * pz
        const alY = ux * qx + uy * qy + uz * qz
        const alZ = ux * ax + uy * ay + uz * az
        const fo = (k * stationCount + s) * 12
        fBuf[fo] = dx * px + dy * py + dz * pz
        fBuf[fo + 1] = dx * qx + dy * qy + dz * qz
        fBuf[fo + 2] = dx * ax + dy * ay + dz * az
        fBuf[fo + 3] = lenScale
        fBuf[fo + 4] = axW * px + ayW * py + azW * pz
        fBuf[fo + 5] = axW * qx + ayW * qy + azW * qz
        fBuf[fo + 6] = axW * ax + ayW * ay + azW * az
        fBuf[fo + 8] = bxW * px + byW * py + bzW * pz
        fBuf[fo + 9] = bxW * qx + byW * qy + bzW * qz
        fBuf[fo + 10] = bxW * ax + byW * ay + bzW * az
        packWay(fBuf, fo + 7, fo + 11, alX, alY, alZ)
      }
    }
    framesFilled = true
  }

  return {
    name: 'petals',
    meshes: hairs ? [mesh, ...hairs.meshes] : [mesh],
    casters: [{ mesh, surface }],
    async load(assets: Assets) {
      if (!mapped) return
      const color = await assets.texture('plant/petals', 'ray-color.jpg', { color: true, anisotropy: 4 })
      const data = await assets.texture('plant/petals', 'ray-data.png', { color: false, anisotropy: 4 })
      const size = color.userData.size as { width: number; height: number }
      ;(uniforms.uRayColor.value as THREE.Texture) = color
      ;(uniforms.uRayData.value as THREE.Texture) = data
      ;(uniforms.uRaySize.value as THREE.Vector2).set(size.width, size.height)
    },
    fill(slot, pose) {
      if (slot === 1 && !positionB) return
      const out = slots[slot]
      const of = filling.lead ? slot : 0
      normals = normalSets[of]
      filled[slot] = true
      if (filling.lead) led[slot] = true
      const time = pose.time
      for (let g = 0; g < rayCount; g++) {
        nowOpen[g] = rayOpen(g, time)
        nowFull[g] = rayLength(g, 1e3)
        nowLen[g] = rayLength(g, time)
      }
      const hOpen = headOpen(time)
      const real = realOf(pose.inputs, time)
      for (let k = 0; k < total; k++) layRay(out, k, pose, slot, hOpen, real)
      if (filling.lead) layNormals(out)
      if (hairFrames) layHairFrames(out, slot, pose)
    },
    absent: (time) => rayLength(0, time) <= 0,
    finish() {
      if (!filled[0] && !filled[1]) return
      if (filled[0]) position.needsUpdate = true
      if (filled[1] && positionB) positionB.needsUpdate = true
      for (let k = 0; k < normalAttrs.length; k++) if (led[k]) normalAttrs[k].needsUpdate = true
      if (led[0] && fieldStateAttr) fieldStateAttr.needsUpdate = true
      filled.fill(false)
      led.fill(false)
      if (framesFilled) {
        hairFrames?.finish()
        hairs?.finish(hairs.count)
        framesFilled = false
      }
    },
  }
}
