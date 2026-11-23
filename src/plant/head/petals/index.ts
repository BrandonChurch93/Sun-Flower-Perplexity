import { norm } from '../../norm.ts'
import * as THREE from 'three'
import type { Assets } from '../../../core/assets.ts'
import { config } from '../../../config.ts'
import { combine, hash01, streamSeed } from '../../../core/random.ts'
import { RAY_FIRST, headOpen, rayAngle, rayCount, rayLength, rayOpen, realOf } from '../../growth.ts'
import { createHairs, type HairSet } from '../../hairs/index.ts'
import { filling, makePartSurface, partGeometry, partMesh, type PartDetail, type PartOptions, type PlantPart } from '../../part.ts'
import { setFrame, type Pose } from '../../skeleton.ts'
import { flutter, gust } from '../../wind.ts'
import { fragment, vertex } from './skin.ts'

interface Shape { us: number[]; vs: number[]; hairs: number; count: number }

const heroRows = 19
const HERO_RAYS = 38
const SHAPE: Record<PartDetail, Shape> = {
  hero: { us: Array.from({ length: heroRows }, (_, i) => 1 - Math.pow(1 - i / (heroRows - 1), 1.3)), vs: [-1, -0.92, -0.62, -0.34, 0, 0.34, 0.62, 0.92, 1], hairs: 2000, count: HERO_RAYS },
  near: { us: [0, 0.18, 0.38, 0.62, 0.84, 1], vs: [-1, 0, 1], hairs: 0, count: HERO_RAYS },
  far: { us: [0.1, 1], vs: [-1, 1], hairs: 0, count: rayCount },
}

const FOLD_OPEN = [0.42, 0.88, -0.52, 0.52, -0.88, -0.42]
const FOLD_BUD = [-0.15, -0.85, -0.2, 0.2, 0.85, 0.15]
const FOLD_LIFT = [-0.88, 0.22, -0.68, 0.68, -0.22, 0.88]
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
  const shape = SHAPE[options.detail]
  const { us, vs } = shape
  const nu = us.length
  const nv = vs.length
  const rimmed = nv >= 5
  const per = nu * nv
  const total = shape.count
  const count = total * per
  const seed = combine(streamSeed('petals'), options.variant)
  const rays = makeRays(seed, total)
  const hero = options.variant === 0

  const geometry = partGeometry(options)
  const slots = [new Float32Array(count * 3), new Float32Array(count * 3)]
  const both = options.places ? [0] : [0, 1]
  const normalSets = both.map(() => new Float32Array(count * 3))
  const stateSets = both.map(() => new Float32Array(count * 4))
  let normals = normalSets[0]
  let state = stateSets[0]
  const filled = [false, false]
  const led = [false, false]
  const uv = new Float32Array(count * 2)
  const info = new Float32Array(count * 4)
  const index: number[] = []
  for (let k = 0; k < total; k++) {
    const base = k * per
    const ray = rays[k]
    const flip = hash01(seed, 30, k) < 0.5 ? -1 : 1
    for (let i = 0; i < nu; i++) {
      for (let j = 0; j < nv; j++) {
        const v = base + i * nv + j
        uv[v * 2] = us[i]
        uv[v * 2 + 1] = vs[j] * 0.5 + 0.5
        info[v * 4] = ray.seed
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
  const positionB = options.places ? null : dynamic(slots[1], 3)
  const carried = both.map((k) => [dynamic(normalSets[k], 3), dynamic(stateSets[k], 4)])
  geometry.setAttribute('position', position)
  if (positionB) geometry.setAttribute('positionB', positionB)
  carried.forEach(([n, st], k) => {
    geometry.setAttribute(k === 1 ? 'normalB' : 'normal', n)
    geometry.setAttribute(k === 1 ? 'aStateB' : 'aState', st)
  })
  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
  geometry.setAttribute('aRay', new THREE.BufferAttribute(info, 4))
  geometry.setIndex(index)

  const mapped = options.detail === 'hero'
  const blank = new THREE.DataTexture(new Uint8Array([200, 200, 60, 255]), 1, 1)
  blank.needsUpdate = true
  const uniforms = { uRayColor: { value: blank as THREE.Texture }, uRayData: { value: blank as THREE.Texture }, uRaySize: { value: new THREE.Vector2(1, 1) } }
  const surface = makePartSurface(options, { name: 'petals', vertex, fragment, side: THREE.DoubleSide, uniforms: mapped ? uniforms : {} })
  const mesh = partMesh(geometry, surface)

  const hairCount = options.variant === 0 ? shape.hairs : Math.round(shape.hairs / 4)
  const hairs: HairSet | null = hairCount > 0 ? createHairs(options, hairCount, 'petal hairs', [0.95, 0.93, 0.7], 0.00003) : null
  const where = hairs
    ? Float32Array.from({ length: hairs.count * 4 }, (_, n) => {
        const i = n >> 2
        const h = hash01(seed, 40 + (n & 3), i)
        if ((n & 3) === 0) return Math.floor(h * total)
        if ((n & 3) === 1) return hash01(seed, 44, i) < 0.55 ? 0.02 + 0.2 * h * h : 0.05 + 0.6 * h
        if ((n & 3) === 2) return hash01(seed, 44, i) < 0.55 ? h * 2 - 1 : [-0.62, -0.34, 0, 0.34, 0.62][Math.floor(hash01(seed, 45, i) * 5)] + (h - 0.5) * 0.08
        return h
      })
    : null

  const cx = new Float64Array(nv)
  const cy = new Float64Array(nv)

  const growthAt = (fk: number, time: number, lag: number): { open: number; angle: number; full: number; len: number } => {
    const t = time - lag
    const g0 = Math.floor(fk) % rayCount
    if (!hero) {
      const full = rayLength(g0, 1e3)
      return { open: rayOpen(g0, t), angle: rayAngle(g0, t), full, len: rayLength(g0, t) }
    }
    const g1 = (g0 + 1) % rayCount
    const f = fk - Math.floor(fk)
    return {
      open: mix(rayOpen(g0, t), rayOpen(g1, t), f),
      angle: mix(rayAngle(g0, t), rayAngle(g1, t), f),
      full: mix(rayLength(g0, 1e3), rayLength(g1, 1e3), f),
      len: mix(rayLength(g0, t), rayLength(g1, t), f),
    }
  }

  const layRay = (out: Float32Array, k: number, pose: Pose, _slot: 0 | 1): void => {
    const ray = rays[k]
    const base = k * per
    const time = pose.time
    const around = ((k + ray.jitter) / total) * Math.PI * 2
    const fk = (((k + ray.jitter) / total) * rayCount + rayCount) % rayCount
    const awayShare = 0.5 * (1 - Math.cos(around - RAY_FIRST))
    const awayFlank = 0.5 + 0.5 * Math.sin(around - RAY_FIRST)
    const latePeel = smooth(0.22, 0.94, awayShare) * (0.20 * awayFlank + 0.52 * hash01(seed, 64, k >> 1) + 0.24 * ray.rank)
    const lag = hero ? 0.14 * ray.rank + 0.14 * awayShare + latePeel + ray.lagExtra : 0.12 * ray.rank
    const g = growthAt(fk, time, lag)
    const full = g.full
    const grown = full > 0 ? g.len / full : 0
    const h = pose.head
    const open = g.open
    const unfold = smooth(0.75, 1, open)
    const rawAngle = g.angle
    const flatten = unfold * Math.max(0, Math.PI / 2 - rawAngle - 0.16) * 0.24
    const angle = rawAngle + flatten

    const late = (slot: number, lead: number, spread: number, least: number, most: number): number => {
      const start = LATE_FROM_S + lead + spread * hash01(seed, slot, k)
      return smooth(start, start + mix(least, most, hash01(seed, slot + 1, k)), time)
    }
    const longer = late(70, 0, 3.5, 3, 5)
    const drawnFrom = DRAWN_FROM_S + 1.2 * hash01(seed, 84, k)
    const drawn = smooth(drawnFrom, drawnFrom + mix(2.2, 3.5, hash01(seed, 85, k)), time)
    const sunk = late(72, 0, 2.5, 3, 4.5)
    const curled = late(74, 0.5, 4, 2.5, 4)
    const twisted = late(76, 0.3, 4.5, 2.5, 4)

    const lifted = smooth(0.1, 0.9, open)
    const seat = smooth(0.2, 0.65, Math.PI / 2 - angle) * smooth(0.8, 1, open)
    const rankOut = ray.rank * 0.036 * lifted
    const foot = mix(FOOT_SHUT, FOOT_OPEN, lifted) + rankOut + 0.5 * (FOOT_SHUT - FOOT_OPEN) * seat
    const ca = Math.cos(around)
    const sa = Math.sin(around)
    const ox = h.px * ca + h.qx * sa
    const oy = h.py * ca + h.qy * sa
    const oz = h.pz * ca + h.qz * sa
    const swirl = (0.5 + 0.5 * smooth(-0.3, 0.5, oy)) * (0.85 + 0.3 * hash01(seed, 33, k))

    const opp = Math.floor(((k + (total >> 1)) % total) * (rayCount / total)) % rayCount
    const across = rayOpen(opp, time)
    const alone = smooth(0.75, 1, across)
    const reach = GAP_REACH * smooth(0.15, 0.7, across) * (1 - alone)
    const gIdx = Math.floor(fk) % rayCount
    const side = (n: number) => (rayOpen((gIdx + n + rayCount) % rayCount, time) + rayOpen((gIdx + 2 * n + rayCount) % rayCount, time)) * 0.5
    const comb = GAP_COMB * (side(2) - side(-2))
    const tuck = (1 - smooth(0.1, 0.5, across)) * smooth(0.9, 1, ray.short) * (1 - smooth(0.02, 0.1, ray.cut)) * (1 - smooth(0, 0.1, open)) * (1 - smooth(0, 0.3, Math.abs(comb) / GAP_COMB))
    const openReach = (FOOT_SHUT - FOOT_OPEN) * h.radius + (ray.rank ? 0.15 : 0.11) * full
    const standUp = smooth(0.06, 0.48, headOpen(time)) * (1 - smooth(0.55, 0.95, open))
    const standYaw = standUp * (hash01(seed, 62, k) - 0.5) * 0.30
    const standTwist = standUp * (hash01(seed, 63, k) - 0.5) * 0.44
    const length = (g.len + mix(mix(1.13 - 0.03 * swirl + reach - ray.cut, 0.96, alone) * (0.95 + 0.1 * ray.arch) * h.radius * Math.min(1, grown / 0.72) - g.len, openReach, lifted)) * ray.short * (1 + ray.lateLong * longer + ray.lateDrawn * drawn)

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
      Math.PI / 2 - angle,
    )
    const outward = foot * h.radius
    const apart = smooth(0.02, 0.1, headOpen(time))
    const back = (ray.rank * 0.048 * lifted - FOOT_STAGGER * ray.deep * lifted - ((RANK_UP + RANK_APART_UP * apart) * ray.rank - (RANK_DOWN + RANK_APART_DOWN * apart) * (1 - ray.rank) * (1 - 0.6 * smooth(0, 0.6, Math.abs(comb) / GAP_COMB))) * (1 - smooth(0, 0.5, open)) - 0.145 - 0.28 * lifted * (1 - lifted) + 0.04 * seat) * full
    let px = frame.ox + ox * outward - h.ax * back
    let py = frame.oy + oy * outward - h.ay * back
    let pz = frame.oz + oz * outward - h.az * back
    const rise = Math.PI / 2 - angle
    const young = (0.08 + 0.12 * ray.arch) * (1 - unfold)
    const shaped = mix(0.2, 1, unfold)
    const cupped = smooth(0.2, 0.65, rise) * unfold
    let tx = frame.mx
    let ty = frame.my
    let tz = frame.mz
    let wx = frame.wx
    let wy = frame.wy
    let wz = frame.wz
    let nx = frame.nx
    let ny = frame.ny
    let nz = frame.nz
    const real = realOf(pose.inputs, time)
    const wind = pose.inputs.wind * flutter(real, ray.seed)
    const surplus = (pose.inputs.wind - Math.min(pose.inputs.calm ?? pose.inputs.wind, pose.inputs.wind)) * smooth(0.8, 1, open)
    let flap = 0
    let roll = 0
    let wag = 0
    if (surplus > 0) {
      const limp = surplus * (0.55 + 0.9 * hash01(seed, 91, k))
      const blow = gust(real, frame.ox, frame.oz)
      const hard = 0.6 + 0.4 * blow
      flap = limp * (FLAP * hard * flutter(real, ray.seed * 0.83 + 0.09) + FLAP_GUST * blow)
      roll = limp * ROLL * hard * flutter(real - 0.07, ray.seed * 0.41 + 0.37)
      wag = limp * WAG * flutter(real - 0.13, ray.seed * 0.67 + 0.21)
    }
    const wide = ray.width * length * Math.pow(Math.max(0, grown), 0.35) * 0.5 * (options.detail === 'far' ? 1.85 : 1) * (1 + ray.lateWide * longer - ray.lateSlim * drawn)
    const fresh = 1 - smooth(0.02, 0.45, open)
    const ripe = smooth(0.78, 1, open)
    let pitch0 = 0
    let yaw0 = 0
    let twist0 = 0
    let u0 = 0
    for (let i = 0; i < nu; i++) {
      const u = us[i]
      const e = (u0 + u) * 0.5
      const along = smooth(0, 1, open * 2.7 - 0.22 * Math.pow(e, 1.5))
      const flat = smooth(0, 1, unfold * 1.25 - 0.22 * u)
      const standLift = standUp * (0.84 + 0.34 * ray.arch + 0.14 * ray.rank) * (1 - 0.36 * e)
      const shut = 1.52 + 0.50 * smooth(0, 0.15, e) + 1.16 * e - 0.10 * Math.sin(Math.PI * e) + 0.12 * (ray.arch - 0.5) - standLift + (0.2 * ray.hook + TIP_TUCK * tuck) * smooth(0.75, 1, e) + RANK_PITCH * (0.5 - ray.rank) * smooth(0.15, 0.6, e)
      const openPitch = ray.lay + ray.lateLay * sunk + ray.cup * unfold + young - shaped * ((ray.droop + ray.lateDroop * sunk) * Math.pow(e, 1.35) - ray.nod * smooth(0.25, 0.9, e) + (ray.tipCurl + ray.lateCurl * curled) * Math.pow(smooth(0.62, 1, e), 1.3) + ray.hard * (1 + 0.3 * curled) * smooth(ray.hardAt, ray.hardAt + 0.3, e)) - 0.48 * (1 - unfold) * smooth(0.68, 1, e)
      const sag = SAG * along * Math.pow(e, 1.5)
      const tipward = surplus > 0 ? Math.pow(e, 1.8) : 0
      const ripple = along * smooth(0.1, 0.4, e)
      const pitch = mix(shut - rise, openPitch, along) - sag * frame.ny + 0.03 * wind * e * e + ripple * ray.buckle * Math.sin(e * ray.buckleFreq + ray.wavePhase) + flap * tipward
      const yaw = mix((0.08 + 0.62 * e) * (1 - 0.55 * standUp) * swirl + standYaw * (0.35 + 0.65 * e) + 0.8 * ray.clump * e + 0.08 * Math.sin(e * 6 + ray.wavePhase) * smooth(0.2, 0.6, e) + comb * smooth(0.05, 0.7, e), ray.lean + 0.62 * ray.clump * smooth(0, 0.52, e) + ray.yaw * Math.pow(e, 1.35) + ray.tipSweep * Math.pow(smooth(0.36, 1, e), 1.45), along) - 0.4 * sag * frame.wy + ripple * ray.sway * Math.sin(e * 4.1 + ray.wavePhase * 1.7) + wag * tipward
      const twist = mix(SHINGLE * (1 - 0.5 * standUp) + standTwist * (0.3 + 0.7 * e), ray.roll + (ray.twist + ray.lateTwist * twisted) * Math.pow(e, 1.2) + ray.tipTwist * Math.pow(smooth(0.52, 1, e), 1.35), along) + 0.02 * wind * e * e + 0.75 * (ray.hook - 0.05) * cupped * e + roll * tipward

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
      const step = (u - u0) * length
      px += tx * step
      py += ty * step
      pz += tz * step
      u0 = u

      const strap = mix(1.08 * (0.05 + 0.95 * Math.pow(1 - Math.pow(u, 1.5), 0.9)), 0.85 * lance(u), smooth(0.28, 0.62, open))
      const place = h.radius * (Math.PI / total) * (0.95 - 0.7 * u) * (1 - 0.92 * smooth(0.55, 1, u)) * STRAP_FILL * mix(1, 0.5, standUp) * (0.94 + 1.55 * (ray.width - 0.245)) * Math.min(1, grown / 0.72)
      const baseBlade = mix(outline(u), lance(u), 0.65 * cupped)
      const openBlade = ray.tipShape === 1 ? baseBlade + 0.2 * smooth(0.76, 1, u) : ray.tipShape === 2 ? baseBlade * (1 - 0.46 * smooth(0.6, 0.94, u)) : baseBlade
      const halfWidth = mix(mix(place, wide * strap, along * smooth(0.2, 0.5, open)), wide * openBlade, flat)
      const ragged = 0.016 * smooth(0.05, 0.3, u)
      const left = 1 + ragged * (Math.sin(u * 7.1 + ray.seed * 53) + 0.45 * Math.sin(u * 15.3 + ray.seed * 97))
      const right = 1 + ragged * (Math.sin(u * 6.7 + ray.seed * 31) + 0.45 * Math.sin(u * 14.7 + ray.seed * 11))
      const trough = mix(0.75 * along + 0.62 * standUp, ray.trough, flat) + 0.95 * (1 - smooth(0, 0.22, u)) * flat
      const rimPinch = ray.tipShape === 2 ? 0.55 * flat * smooth(0.62, 0.96, u) : 0
      cx[0] = 0
      cy[0] = 0
      for (let j = 0; j < nv - 1; j++) {
        let foldAngle = 0
        if (rimmed) {
          const strip = Math.min(nv - 4, Math.max(0, j - 1))
          foldAngle = mix(mix(FOLD_BUD[strip], FOLD_LIFT[strip], along), mix(FOLD_OPEN[strip] * ray.pleat * (1.55 - 0.65 * smooth(0.15, 0.75, u)), FOLD_LIFT[strip] * 1.1, 0.75 * cupped), flat) + trough * (vs[strip + 1] + vs[strip + 2]) * 0.5
          const mid = (vs[strip + 1] + vs[strip + 2]) * 0.5
          if (mid * ray.edgeSide > 0.4) foldAngle += ray.edgeSide * ray.edgeCurl * flat * smooth(0.15, 0.65, u) * (Math.abs(mid) > 0.7 ? 1 : 0.45)
          if (j === 0) foldAngle += RIM_TURN * (1 - 0.45 * smooth(0.75, 1, u)) + rimPinch
          if (j === nv - 2) foldAngle -= RIM_TURN * (1 - 0.45 * smooth(0.75, 1, u)) + rimPinch
        }
        const run = (vs[j + 1] - vs[j]) * halfWidth
        cx[j + 1] = cx[j] + Math.cos(foldAngle) * run
        cy[j + 1] = cy[j] + Math.sin(foldAngle) * run
      }
      const midX = rimmed ? cx[(nv - 1) / 2] : (cx[0] + cx[nv - 1]) * 0.5
      const midY = rimmed ? cy[(nv - 1) / 2] : (cy[0] + cy[nv - 1]) * 0.5
      const tipShare = smooth(0.82, 1, u)
      const root = i === 0 ? ROOT_DROP * lifted * (1 - lifted) * full : 0
      const rumple = ray.crumple * full * (1 + 2 * fresh) * Math.min(1, halfWidth / (0.004 * (full / 0.07)))
      for (let j = 0; j < nv; j++) {
        const v = vs[j]
        let x = (cx[j] - midX) * (v < 0 ? left : right)
        let y = cy[j] - midY
        const edge = Math.abs(v) * v * v
        y += ray.wave * full * grown * (0.35 + 0.65 * u) * edge * Math.sin(ray.waveFreq * u + ray.wavePhase + (v > 0 ? 1.9 : 0)) * (0.5 + 0.5 * flat)
        y += rumple * (0.6 * Math.sin(v * 7.3 + u * 2.1 + ray.seed * 40) * Math.sin(u * 5.2 + ray.seed * 17) + 0.4 * Math.sin(v * 12.1 - u * 3.4 + ray.seed * 71)) * smooth(0, 0.15, u)
        if (i === ray.nickRow && v * ray.nickSide > 0.6) x -= ray.nickSide * 0.025 * full * grown * (Math.abs(v) > 0.95 ? 1 : Math.abs(v) > 0.9 ? 0.85 : 0.25)
        const reachTip = rimmed ? TEETH[ray.teeth][j] * length * tipShare * tipShare : 0
        const at = (base + i * nv + j) * 3
        out[at] = px + wx * x + nx * y + tx * reachTip - h.ax * root
        out[at + 1] = py + wy * x + ny * y + ty * reachTip - h.ay * root
        out[at + 2] = pz + wz * x + nz * y + tz * reachTip - h.az * root
        if (filling.lead) {
          const st = (base + i * nv + j) * 4
          state[st] = fresh
          state[st + 1] = flat
          state[st + 2] = ripe
          state[st + 3] = fresh * (1 - 0.6 * alone)
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

  const hairA = where ? new Int32Array(hairs!.count) : null
  const hairB = where ? new Int32Array(hairs!.count) : null
  const hairW = where ? new Float32Array(hairs!.count * 4) : null
  const hairG = where ? new Int32Array(hairs!.count) : null
  const hairFull = where ? new Float32Array(hairs!.count) : null
  const hairScale = where ? new Float32Array(hairs!.count) : null
  const hairLeanW = where ? new Float32Array(hairs!.count) : null
  if (where && hairs && hairA && hairB && hairW && hairG && hairFull && hairScale && hairLeanW) {
    for (let n = 0; n < hairs.count; n++) {
      const k = where[n * 4]
      const u = where[n * 4 + 1]
      const v = where[n * 4 + 2]
      const w = where[n * 4 + 3]
      let i = 0
      while (i < nu - 2 && us[i + 1] < u) i++
      let j = 1
      while (j < nv - 3 && vs[j + 1] < v) j++
      const fu = Math.min(1, Math.max(0, (u - us[i]) / (us[i + 1] - us[i])))
      const fv = Math.min(1, Math.max(0, (v - vs[j]) / (vs[j + 1] - vs[j])))
      const a = (k * per + i * nv + j) * 3
      hairA[n] = a
      hairB[n] = a + nv * 3
      const o = n * 4
      hairW[o] = (1 - fu) * (1 - fv)
      hairW[o + 1] = (1 - fu) * fv
      hairW[o + 2] = fu * (1 - fv)
      hairW[o + 3] = fu * fv
      const g = Math.floor((k * rayCount) / total) % rayCount
      const full = rayLength(g, 1e3)
      hairG[n] = g
      hairFull[n] = full
      hairScale[n] = (0.0005 + 0.0008 * w) * (full / 0.07) * (1 - 0.5 * u)
      hairLeanW[n] = w
    }
  }

  const layHairs = (set: HairSet, pos: Float32Array, slot: 0 | 1, time: number): void => {
    if (!hairA || !hairB || !hairW || !hairG || !hairFull || !hairScale || !hairLeanW) return
    const root = set.root(slot)
    const lean = set.lean(slot)
    for (let n = 0; n < set.count; n++) {
      const a = hairA[n]
      const b = hairB[n]
      const o = n * 4
      const w00 = hairW[o]
      const w01 = hairW[o + 1]
      const w10 = hairW[o + 2]
      const w11 = hairW[o + 3]
      const px = pos[a] * w00 + pos[a + 3] * w01 + pos[b] * w10 + pos[b + 3] * w11
      const py = pos[a + 1] * w00 + pos[a + 4] * w01 + pos[b + 1] * w10 + pos[b + 4] * w11
      const pz = pos[a + 2] * w00 + pos[a + 5] * w01 + pos[b + 2] * w10 + pos[b + 5] * w11
      const ux = pos[b] - pos[a]
      const uy = pos[b + 1] - pos[a + 1]
      const uz = pos[b + 2] - pos[a + 2]
      const vx = pos[a + 3] - pos[a]
      const vy = pos[a + 4] - pos[a + 1]
      const vz = pos[a + 5] - pos[a + 2]
      const lu = Math.sqrt(ux * ux + uy * uy + uz * uz) || 1
      let x = uy * vz - uz * vy
      let y = uz * vx - ux * vz
      let z = ux * vy - uy * vx
      const l = Math.sqrt(x * x + y * y + z * z) || 1
      x /= l
      y /= l
      z /= l
      const full = hairFull[n]
      const grown = full > 0 ? rayLength(hairG[n], time) / full : 0
      root[o] = px - x * 0.00005
      root[o + 1] = py - y * 0.00005
      root[o + 2] = pz - z * 0.00005
      root[o + 3] = hairScale[n] * smooth(0, 0.5, grown)
      lean[o] = -x + (ux / lu) * 0.6
      lean[o + 1] = -y + (uy / lu) * 0.6
      lean[o + 2] = -z + (uz / lu) * 0.6
      lean[o + 3] = hairLeanW[n]
    }
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
      uniforms.uRayColor.value = color
      uniforms.uRayData.value = data
      uniforms.uRaySize.value.set(size.width, size.height)
    },
    fill(slot, pose) {
      if (slot === 1 && !positionB) return
      const out = slots[slot]
      const of = filling.lead ? slot : 0
      normals = normalSets[of]
      state = stateSets[of]
      filled[slot] = true
      if (filling.lead) led[slot] = true
      for (let k = 0; k < total; k++) layRay(out, k, pose, slot)
      if (filling.lead) layNormals(out)
      if (hairs && where) layHairs(hairs, out, slot, pose.time)
    },
    absent: (time) => rayLength(0, time) <= 0,
    finish() {
      if (filled[0]) position.needsUpdate = true
      if (filled[1] && positionB) positionB.needsUpdate = true
      for (let k = 0; k < carried.length; k++) if (led[k]) for (const a of carried[k]) a.needsUpdate = true
      filled.fill(false)
      led.fill(false)
      hairs?.finish()
    },
  }
}
