// The ray florets: 34 strips round the rim of the head, folded shut in the bud and unfurled by `rayOpen`.
import * as THREE from 'three'
import type { Assets } from '../../../core/assets.ts'
import { combine, hash01, streamSeed } from '../../../core/random.ts'
import { RAY_FIRST, rayAngle, rayCount, rayLength, rayOpen } from '../../growth.ts'
import { createHairs, type HairSet } from '../../hairs/index.ts'
import { makePartSurface, partGeometry, partMesh, type PartDetail, type PartOptions, type PlantPart } from '../../part.ts'
import { rayFrameAt, type Pose } from '../../skeleton.ts'
import { flutter } from '../../wind.ts'
import { fragment, vertex } from './skin.ts'

interface Shape { us: number[]; vs: number[]; hairs: number }

const heroRows = 21
const SHAPE: Record<PartDetail, Shape> = {
  hero: { us: Array.from({ length: heroRows }, (_, i) => 1 - Math.pow(1 - i / (heroRows - 1), 1.3)), vs: [-1, -0.93, -0.62, -0.34, 0, 0.34, 0.62, 0.93, 1], hairs: 2000 },
  near: { us: [0, 0.18, 0.42, 0.72, 1], vs: [-1, 1], hairs: 0 },
  far: { us: [0.1, 1], vs: [-1, 1], hairs: 0 },
}

// The slope of each strip across a ray, as shares of the fold angle: shut like a fan in the bud, two lasting pleats when open.
const FOLD_OPEN = [0.5, 1, -0.6, 0.6, -1, -0.5]
// A shut ray is a strap folded once: a ridge down the middle, and two low wings that lie on the neighbors like shingles.
const FOLD_BUD = [-0.6, -0.6, -0.6, 0.6, 0.6, 0.6]
// A shut strap fills its own place round the rim and narrows toward the eye, and each is rolled the same way so its edge lies on the next one.
const STRAP_FILL = 1.2
const SHINGLE = 0.3
// One ray in three just behind the sector that opens first stays shut a while longer and spreads over the place its neighbors left, so the young florets stay covered.
const LAG_EVERY = 3
const LAG_S = 3.0
const STRAP_COVER = 0.6
// A lifting ray is creased down its midrib: a V that shows about half its open width.
const LIFT_FOLD = 1.75
const RANK_PITCH = 0.55
const RIM_TURN = 1.1
const SAG = 0.38
const FOOT_SHUT = 0.05
const FOOT_OPEN = -0.06

// How far each column of the tip stands out or back, in shares of the length: three teeth, a notch, or a slant.
const TEETH = [
  [-0.03, -0.016, 0.002, -0.006, 0.008, -0.006, 0.002, -0.016, -0.03],
  [-0.03, -0.014, 0.004, 0.008, -0.006, 0.008, 0.004, -0.014, -0.03],
  [-0.034, -0.02, -0.004, 0.006, -0.006, 0.002, 0.008, -0.01, -0.026],
]

const smooth = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}
const mix = (a: number, b: number, t: number): number => a + (b - a) * t

interface Ray {
  rank: number
  cup: number
  lag: number
  short: number
  nod: number
  width: number
  droop: number
  tipCurl: number
  hard: number
  hardAt: number
  twist: number
  yaw: number
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
  teeth: number
  nickRow: number
  nickSide: number
  seed: number
}

function outline(u: number): number {
  const peak = 0.44
  const rise = Math.pow(Math.sin((Math.PI / 2) * Math.min(1, u / peak)), 0.55)
  const s = Math.max(0, (u - peak) / (1 - peak))
  return (0.34 + 0.66 * rise) * (0.04 + 0.96 * Math.pow(1 - Math.pow(s, 1.7), 0.75))
}

function makeRays(seed: number): Ray[] {
  const r = (i: number, k: number) => hash01(seed, i, k)
  const order = (i: number, pick: (k: number) => boolean) =>
    Array.from({ length: rayCount }, (_, k) => k)
      .filter(pick)
      .sort((a, b) => r(i, a) - r(i, b))
  // The rays that bend back hard stand in the rear rank, so the bend never cuts a neighbor.
  const hard = order(20, (k) => k % 2 === 1).slice(0, 4)
  const half = order(21, (k) => !hard.includes(k)).slice(0, 2)
  const nick = order(22, (k) => !hard.includes(k) && !half.includes(k))[0]
  const opens = Array.from({ length: rayCount }, (_, k) => {
    let a = 0
    let b = 60
    for (let n = 0; n < 24; n++) {
      const m = (a + b) * 0.5
      if (rayOpen(k, m) < 0.5) a = m
      else b = m
    }
    return a
  })
  const first = Math.min(...opens)
  const last = Math.max(...opens)
  return Array.from({ length: rayCount }, (_, k) => {
    const rank = k % 2
    const strong = r(5, k) > 0.6 ? 3.6 : 1
    return {
      rank,
      lag: k % LAG_EVERY === 0 ? LAG_S * smooth(0.8, 1.1, Math.acos(Math.cos((k / rayCount) * Math.PI * 2 - RAY_FIRST))) * (1 - smooth(0.25, 0.7, (opens[k] - first) / Math.max(last - first, 1e-3))) : 0,
      short: r(37, k) < 0.14 ? 0.8 + 0.1 * r(38, k) : 1,
      nod: r(39, k) < 0.3 ? 0.6 + 0.9 * r(46, k) : 0,
      width: 0.5 + 0.12 * r(1, k),
      droop: rank ? 0.15 + 0.7 * r(2, k) : 0.7 * r(2, k) * r(2, k),
      tipCurl: (r(3, k) - 0.45) * 1.0 + (r(3, k) > 0.7 ? 1.6 : 0),
      hard: hard.includes(k) ? 1.0 + 0.6 * r(13, k) : 0,
      hardAt: 0.34 + 0.22 * r(14, k),
      twist: (r(4, k) < 0.5 ? -1 : 1) * (0.12 + 0.3 * r(36, k)) * strong,
      yaw: (r(6, k) - 0.5) * 0.5,
      lean: 0.07 * Math.sin(k * 2.4 + 6.283 * r(24, 0)) + (r(25, k) - 0.5) * 0.2,
      clump: 0.11 * Math.sin(k * 1.9 + 6.283 * r(26, 0)) + (r(27, k) - 0.5) * 0.16,
      arch: r(28, k),
      cup: 0.17 + 0.27 * r(47, k),
      hook: (r(29, k) - 0.4) * 0.9,
      pleat: half.includes(k) ? 1.1 : 0.7 + 0.4 * r(7, k),
      trough: half.includes(k) ? 0.8 : 0.1 + 0.5 * r(8, k),
      lay: rank ? -0.34 + (r(9, k) - 0.5) * 0.4 : 0.0 + (r(9, k) - 0.5) * 0.24,
      roll: 0.07 + (r(10, k) - 0.5) * 0.5,
      buckle: 0.08 + 0.26 * r(30, k),
      buckleFreq: 6 + 5 * r(31, k),
      sway: (r(32, k) - 0.5) * 0.36,
      edgeCurl: r(33, k) < 0.6 ? 0.4 + 0.9 * r(34, k) : 0,
      edgeSide: r(35, k) < 0.5 ? -1 : 1,
      wave: 0.02 + 0.03 * r(15, k),
      waveFreq: 8 + 8 * r(16, k),
      wavePhase: 6.283 * r(17, k),
      crumple: 0.01 + 0.016 * r(18, k),
      teeth: r(11, k) < 0.2 ? 0 : r(11, k) < 0.8 ? 1 : 2,
      nickRow: k === nick ? 7 + Math.floor(5 * r(19, k)) : -1,
      nickSide: r(23, k) < 0.5 ? -1 : 1,
      seed: r(12, k),
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
  const count = rayCount * per
  const seed = combine(streamSeed('petals'), options.variant)
  const rays = makeRays(seed)

  const geometry = partGeometry(options)
  const slots = [new Float32Array(count * 3), new Float32Array(count * 3)]
  const normals = new Float32Array(count * 3)
  const state = new Float32Array(count * 3)
  const uv = new Float32Array(count * 2)
  const info = new Float32Array(count * 4)
  const index: number[] = []
  for (let k = 0; k < rayCount; k++) {
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
  const normal = dynamic(normals, 3)
  const states = dynamic(state, 3)
  geometry.setAttribute('position', position)
  if (positionB) geometry.setAttribute('positionB', positionB)
  geometry.setAttribute('normal', normal)
  geometry.setAttribute('aState', states)
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
  // Each hair keeps its ray and its place on the back of it: mostly the foot, the rest along the pleats and the middle vein.
  const where = hairs
    ? Float32Array.from({ length: hairs.count * 4 }, (_, n) => {
        const i = n >> 2
        const h = hash01(seed, 40 + (n & 3), i)
        if ((n & 3) === 0) return Math.floor(h * rayCount)
        if ((n & 3) === 1) return hash01(seed, 44, i) < 0.55 ? 0.02 + 0.2 * h * h : 0.05 + 0.6 * h
        if ((n & 3) === 2) return hash01(seed, 44, i) < 0.55 ? h * 2 - 1 : [-0.62, -0.34, 0, 0.34, 0.62][Math.floor(hash01(seed, 45, i) * 5)] + (h - 0.5) * 0.08
        return h
      })
    : null

  const cx = new Float64Array(nv)
  const cy = new Float64Array(nv)
  const frame = { ox: 0, oy: 0, oz: 0, mx: 0, my: 0, mz: 0, wx: 0, wy: 0, wz: 0, nx: 0, ny: 0, nz: 0 }

  const layRay = (out: Float32Array, k: number, pose: Pose, slot: 0 | 1): void => {
    const ray = rays[k]
    const base = k * per
    const time = pose.time
    const full = rayLength(k, 1e3)
    const grown = full > 0 ? rayLength(k, time) / full : 0
    const h = pose.head
    const open = rayOpen(k, time - ray.lag)
    const near = 0.5 * (rayOpen((k + 1) % rayCount, time) + rayOpen((k + rayCount - 1) % rayCount, time))
    const cover = ray.lag > 0 ? smooth(0.1, 0.7, near) : 0
    // An open ray lies in over the outer florets, and it is that much longer so its tip stays where the growth puts it.
    const lifted = smooth(0.1, 0.9, open)
    const foot = mix(FOOT_SHUT, FOOT_OPEN, lifted)
    // A shut ray lies over the face as far as the eye in the middle. Once the ray across from it has opened it draws back toward the rim.
    const around = (k / rayCount) * Math.PI * 2
    const ca = Math.cos(around)
    const sa = Math.sin(around)
    const ox = h.px * ca + h.qx * sa
    const oy = h.py * ca + h.qy * sa
    const oz = h.pz * ca + h.qz * sa
    // The straps on the upper side of the bud curve sideways and lie across each other; the lower ones run straight in.
    const swirl = smooth(-0.3, 0.5, oy) * (0.85 + 0.3 * hash01(seed, 33, k))
    const alone = smooth(0.3, 1, rayOpen((k + (rayCount >> 1)) % rayCount, time))
    const length = (rayLength(k, time) + mix(mix(1.13 - 0.03 * swirl, 0.8, alone) * (0.95 + 0.1 * ray.arch) * h.radius * Math.min(1, grown / 0.72) - rayLength(k, time), (FOOT_SHUT - FOOT_OPEN) * h.radius + 0.06 * full, lifted)) * ray.short
    Object.assign(frame, rayFrameAt(pose, k))
    const outward = foot * h.radius
    const back = (ray.rank * 0.025 * lifted - mix(0.178, 0.145, lifted) - 0.3 * lifted * (1 - lifted)) * full
    let px = frame.ox + ox * outward - h.ax * back
    let py = frame.oy + oy * outward - h.ay * back
    let pz = frame.oz + oz * outward - h.az * back
    const rise = Math.PI / 2 - rayAngle(k, time)
    // A lifting ray stays rolled and narrow, cupped forward with a hooked tip, and spreads flat only at the end of its lift.
    const unfold = smooth(0.8, 1, open)
    const young = (0.1 + 0.15 * ray.arch) * (1 - unfold)
    const shaped = mix(0.2, 1, unfold)
    let tx = frame.mx
    let ty = frame.my
    let tz = frame.mz
    let wx = frame.wx
    let wy = frame.wy
    let wz = frame.wz
    let nx = frame.nx
    let ny = frame.ny
    let nz = frame.nz
    const wind = pose.inputs.wind * flutter(time, ray.seed)
    const wide = ray.width * full * Math.pow(grown, 0.75) * 0.5 * (options.detail === 'far' ? 1.5 : 1)
    const fresh = 1 - smooth(0.02, 0.45, open)
    const ripe = smooth(0.8, 1, open)
    let pitch0 = 0
    let yaw0 = 0
    let twist0 = 0
    let u0 = 0
    for (let i = 0; i < nu; i++) {
      const u = us[i]
      // The curve is read at the middle of each step, so a coarse ray runs the same way as a fine one.
      const e = (u0 + u) * 0.5
      // The foot opens first and the tip uncurls a little later, so a rising ray stays a long blade.
      const along = smooth(0, 1, open * 2.7 - 0.22 * Math.pow(e, 1.5))
      const across = smooth(0, 1, unfold * 1.25 - 0.25 * u)
      // A shut ray stands up from the rim and arches over the face, so the shut rays make a low cone that swirls to a point.
      const shut = 1.75 + 0.55 * smooth(0, 0.15, e) + 0.95 * e + 0.12 * (ray.arch - 0.5) - 0.35 * alone * smooth(0.1, 0.6, e) + 0.2 * ray.hook * smooth(0.75, 1, e) + RANK_PITCH * (0.5 - ray.rank) * smooth(0.15, 0.6, e)
      const openPitch = ray.lay + ray.cup * unfold + young - shaped * (ray.droop * Math.pow(e, 1.3) - ray.nod * smooth(0.25, 0.9, e) + ray.tipCurl * Math.pow(smooth(0.68, 1, e), 1.5) + ray.hard * smooth(ray.hardAt, ray.hardAt + 0.3, e)) - 0.2 * (1 - unfold) * smooth(0.7, 1, e)
      // An open ray sags a little under its own weight, whichever way it points.
      const sag = SAG * along * Math.pow(e, 1.5)
      const ripple = along * smooth(0.1, 0.4, e)
      const pitch = mix(shut - rise, openPitch, along) - sag * frame.ny + 0.03 * wind * e * e + ripple * ray.buckle * Math.sin(e * ray.buckleFreq + ray.wavePhase)
      const yaw = mix((0.08 + 0.62 * e) * swirl + 0.25 * ray.clump * e, ray.lean + ray.yaw * Math.pow(e, 1.5), along) - sag * frame.wy + ripple * ray.sway * Math.sin(e * 4.3 + ray.wavePhase * 1.7)
      const twist = mix(SHINGLE, ray.roll + ray.twist * Math.pow(e, 1.25), along) + 0.02 * wind * e * e

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

      const strap = 1.1 * (0.05 + 0.95 * Math.pow(1 - Math.pow(u, 1.5), 0.9))
      const place = h.radius * (Math.PI / rayCount) * (0.95 - 0.76 * u) * (1 - 0.85 * smooth(0.9, 1, u)) * STRAP_FILL * Math.min(1, grown / 0.72)
      const halfWidth = mix(mix(place * (1 + STRAP_COVER * cover), wide * strap, along * smooth(0.2, 0.5, open)), wide * outline(u), across)
      const ragged = 0.075 * smooth(0.05, 0.3, u)
      const left = 1 + ragged * (Math.sin(u * 9.1 + ray.seed * 53) + 0.6 * Math.sin(u * 21.3 + ray.seed * 97))
      const right = 1 + ragged * (Math.sin(u * 8.3 + ray.seed * 31) + 0.6 * Math.sin(u * 19.7 + ray.seed * 11))
      const trough = mix(0.85 * along, ray.trough, across) + 1.3 * (1 - smooth(0, 0.22, u)) * across
      cx[0] = 0
      cy[0] = 0
      for (let j = 0; j < nv - 1; j++) {
        let angle = 0
        if (rimmed) {
          const strip = Math.min(nv - 4, Math.max(0, j - 1))
          angle = mix(mix(FOLD_BUD[strip] * (1 - 0.6 * cover), FOLD_BUD[strip] * LIFT_FOLD, along), FOLD_OPEN[strip] * ray.pleat, across) + trough * (vs[strip + 1] + vs[strip + 2]) * 0.5
          const mid = (vs[strip + 1] + vs[strip + 2]) * 0.5
          if (mid * ray.edgeSide > 0.4) angle += ray.edgeSide * ray.edgeCurl * across * smooth(0.15, 0.6, u) * (Math.abs(mid) > 0.7 ? 1 : 0.45)
          if (j === 0) angle += RIM_TURN
          if (j === nv - 2) angle -= RIM_TURN
        }
        const run = (vs[j + 1] - vs[j]) * halfWidth
        cx[j + 1] = cx[j] + Math.cos(angle) * run
        cy[j + 1] = cy[j] + Math.sin(angle) * run
      }
      const midX = rimmed ? cx[(nv - 1) / 2] : (cx[0] + cx[nv - 1]) * 0.5
      const midY = rimmed ? cy[(nv - 1) / 2] : (cy[0] + cy[nv - 1]) * 0.5
      const tipShare = smooth(0.8, 1, u)
      const rumple = ray.crumple * full * (1 + 2.2 * fresh) * Math.min(1, halfWidth / (0.004 * (full / 0.07)))
      for (let j = 0; j < nv; j++) {
        const v = vs[j]
        let x = (cx[j] - midX) * (v < 0 ? left : right)
        let y = cy[j] - midY
        const edge = Math.abs(v) * v * v
        y += ray.wave * full * grown * (0.35 + 0.65 * u) * edge * Math.sin(ray.waveFreq * u + ray.wavePhase + (v > 0 ? 1.9 : 0)) * (0.5 + 0.5 * across)
        y += rumple * (0.6 * Math.sin(v * 7.3 + u * 2.1 + ray.seed * 40) * Math.sin(u * 5.2 + ray.seed * 17) + 0.4 * Math.sin(v * 12.1 - u * 3.4 + ray.seed * 71)) * smooth(0, 0.15, u)
        if (i === ray.nickRow && v * ray.nickSide > 0.6) x -= ray.nickSide * 0.04 * full * grown * (Math.abs(v) > 0.95 ? 1 : Math.abs(v) > 0.9 ? 0.85 : 0.25)
        const reach = rimmed ? TEETH[ray.teeth][j] * length * tipShare * tipShare : 0
        const at = (base + i * nv + j) * 3
        out[at] = px + wx * x + nx * y + tx * reach
        out[at + 1] = py + wy * x + ny * y + ty * reach
        out[at + 2] = pz + wz * x + nz * y + tz * reach
        if (slot === 0) {
          const st = (base + i * nv + j) * 3
          state[st] = fresh
          state[st + 1] = across
          state[st + 2] = ripe
        }
      }
    }
  }

  const layNormals = (pos: Float32Array): void => {
    for (let k = 0; k < rayCount; k++) {
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
          const l = Math.hypot(x, y, z)
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

  const layHairs = (set: HairSet, at: Float32Array, pos: Float32Array, slot: 0 | 1, time: number): void => {
    const root = set.root(slot)
    const lean = set.lean(slot)
    for (let n = 0; n < set.count; n++) {
      const k = at[n * 4]
      const u = at[n * 4 + 1]
      const v = at[n * 4 + 2]
      let i = 0
      while (i < nu - 2 && us[i + 1] < u) i++
      let j = 1
      while (j < nv - 3 && vs[j + 1] < v) j++
      const fu = Math.min(1, Math.max(0, (u - us[i]) / (us[i + 1] - us[i])))
      const fv = Math.min(1, Math.max(0, (v - vs[j]) / (vs[j + 1] - vs[j])))
      const a = (k * per + i * nv + j) * 3
      const b = a + nv * 3
      const p = (o: number) => mix(mix(pos[a + o], pos[a + 3 + o], fv), mix(pos[b + o], pos[b + 3 + o], fv), fu)
      const ux = pos[b] - pos[a]
      const uy = pos[b + 1] - pos[a + 1]
      const uz = pos[b + 2] - pos[a + 2]
      const vx = pos[a + 3] - pos[a]
      const vy = pos[a + 4] - pos[a + 1]
      const vz = pos[a + 5] - pos[a + 2]
      const lu = Math.hypot(ux, uy, uz) || 1
      let x = uy * vz - uz * vy
      let y = uz * vx - ux * vz
      let z = ux * vy - uy * vx
      const l = Math.hypot(x, y, z) || 1
      x /= l
      y /= l
      z /= l
      const full = rayLength(k, 1e3)
      const grown = full > 0 ? rayLength(k, time) / full : 0
      root[n * 4] = p(0) - x * 0.00005
      root[n * 4 + 1] = p(1) - y * 0.00005
      root[n * 4 + 2] = p(2) - z * 0.00005
      root[n * 4 + 3] = (0.0005 + 0.0008 * at[n * 4 + 3]) * (full / 0.07) * smooth(0, 0.5, grown) * (1 - 0.5 * u)
      lean[n * 4] = -x + (ux / lu) * 0.6
      lean[n * 4 + 1] = -y + (uy / lu) * 0.6
      lean[n * 4 + 2] = -z + (uz / lu) * 0.6
      lean[n * 4 + 3] = at[n * 4 + 3]
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
      for (let k = 0; k < rayCount; k++) layRay(out, k, pose, slot)
      if (slot === 0) layNormals(out)
      if (hairs && where) layHairs(hairs, where, out, slot, pose.time)
    },
    finish() {
      position.needsUpdate = true
      if (positionB) positionB.needsUpdate = true
      normal.needsUpdate = true
      states.needsUpdate = true
      hairs?.finish()
    },
  }
}
