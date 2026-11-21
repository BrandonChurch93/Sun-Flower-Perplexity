// Fits the camera at every key to the approved image of that key, by solving for where the plant, the horizon and the sun land in the frame.
// usage: tsx tools/fit.ts [--write]            solve the camera keys, and with --write put them in config/showcase.json
//        tsx tools/fit.ts --companion [--write] find where the companion can stand, from the camera path now in the config
import { readFileSync, writeFileSync } from 'node:fs'
import * as THREE from 'three'
import { config, type CameraKey } from '../src/config.ts'
import type { WorldSettings } from '../src/core/world.ts'
import { horizonY, nearPlane, poseOf, project } from '../src/director/pose.ts'
import { rigPathAt, type RigPath } from '../src/director/rig.ts'
import { companionMatrix } from '../src/director/companion.ts'
import { companionVariant } from '../src/field/layout.ts'
import { usePlant, type PlantInputs } from '../src/plant/growth.ts'
import { PART, buildStandIn, headAt, standInTopology, standInVertexCount, tipAt } from '../src/plant/standin.ts'
import { world as dawn } from '../src/worlds/dawn/index.ts'
import { world as frost } from '../src/worlds/frost/index.ts'
import { world as golden } from '../src/worlds/golden/index.ts'
import { world as night } from '../src/worlds/night/index.ts'
import { world as rain } from '../src/worlds/rain/index.ts'

const worlds: Record<string, WorldSettings> = { dawn, rain, night, frost, golden }
const ASPECT = config.formats.master.width / config.formats.master.height
const RAD = Math.PI / 180
const CONFIG = 'config/showcase.json'
const write = process.argv.includes('--write')

type Param = 'distanceM' | 'heightM' | 'aimHeightM' | 'frameX' | 'azimuthDeg'
type What = 'base' | 'top' | 'tip' | 'stemEnd' | 'stemLow' | 'head' | 'sun' | 'horizon' | 'headSpanY' | 'headSpanX'
interface Target { what: What; axis: 'x' | 'y'; value: number }
interface Spec { key: string; free: Param[]; targets: Target[]; checks: Target[] }

const t = (what: What, axis: 'x' | 'y', value: number): Target => ({ what, axis, value })

// What each approved image shows, measured on the image: x from the left, y from the top, as fractions of the frame.
const specs: Spec[] = [
  { key: 'dawn-sprout', free: ['distanceM', 'heightM', 'aimHeightM', 'frameX', 'azimuthDeg'], targets: [t('base', 'x', 0.6), t('base', 'y', 0.77), t('top', 'y', 0.22), t('horizon', 'y', 0.33), t('sun', 'x', 0.84)], checks: [t('top', 'x', 0.63), t('sun', 'y', 0.27)] },
  { key: 'dawn-seedling', free: ['distanceM', 'heightM', 'aimHeightM', 'frameX'], targets: [t('base', 'x', 0.605), t('base', 'y', 0.775), t('stemEnd', 'y', 0.42), t('horizon', 'y', 0.33)], checks: [t('stemEnd', 'x', 0.6), t('top', 'y', 0.21)] },
  { key: 'rain', free: ['distanceM', 'heightM', 'aimHeightM', 'frameX'], targets: [t('base', 'x', 0.62), t('base', 'y', 0.8), t('top', 'y', 0.12), t('horizon', 'y', 0.5)], checks: [t('tip', 'x', 0.61), t('tip', 'y', 0.17)] },
  { key: 'night', free: ['heightM', 'aimHeightM', 'frameX'], targets: [t('tip', 'x', 0.575), t('tip', 'y', 0.3), t('horizon', 'y', 0.84)], checks: [t('top', 'y', 0.265), t('stemLow', 'x', 0.585)] },
  { key: 'frost', free: ['heightM', 'aimHeightM', 'frameX'], targets: [t('head', 'x', 0.535), t('head', 'y', 0.3), t('horizon', 'y', 0.6)], checks: [t('stemLow', 'x', 0.555), t('headSpanX', 'x', 0.19), t('headSpanY', 'y', 0.23)] },
  // The stand-in bud is slimmer than the approved one, so the fit sits between the approved width and the approved height of the head.
  { key: 'bloom-opening', free: ['distanceM', 'heightM', 'aimHeightM', 'frameX', 'azimuthDeg'], targets: [t('head', 'x', 0.565), t('head', 'y', 0.345), t('horizon', 'y', 0.47), t('sun', 'x', 0.15), t('headSpanY', 'y', 0.465)], checks: [t('stemLow', 'x', 0.625), t('headSpanX', 'x', 0.32), t('sun', 'y', 0.4)] },
  { key: 'bloom-hero', free: ['distanceM', 'heightM', 'aimHeightM', 'frameX'], targets: [t('head', 'x', 0.545), t('head', 'y', 0.42), t('horizon', 'y', 0.47), t('headSpanY', 'y', 0.63)], checks: [t('headSpanX', 'x', 0.31), t('stemLow', 'x', 0.615)] },
  { key: 'field', free: ['distanceM', 'heightM', 'aimHeightM', 'frameX', 'azimuthDeg'], targets: [t('base', 'x', 0.505), t('base', 'y', 0.9), t('head', 'y', 0.505), t('horizon', 'y', 0.215), t('sun', 'x', 0.2)], checks: [t('head', 'x', 0.487), t('sun', 'y', 0.17)] },
]

const keys: CameraKey[] = config.camera.keys.map((k) => ({ ...k }))
const keyAt = (time: number): CameraKey => {
  const k = keys.find((c) => c.time === time)
  if (!k) throw new Error(`no camera key at ${time} s`)
  return k
}
const rigOf = (k: CameraKey): RigPath => ({ distanceM: k.distanceM, heightM: k.heightM, aimHeightM: k.aimHeightM, frameX: k.frameX, azimuthRad: k.azimuthDeg * RAD, focalMm: k.focalMm })
const filmKey = (id: string) => {
  const k = config.keys.find((c) => c.id === id)
  if (!k) throw new Error(`unknown key "${id}"`)
  return k
}
const worldIdOf = (unit: string): string => config.segments.find((s) => s.id === unit)!.world

// The direction of the light in a world, the way the film works it out: from where the sun sits in the backdrop of the world's key.
function sunOf(worldId: string): THREE.Vector3 {
  const w = worlds[worldId]
  if (w.backdrop.file && w.backdrop.sunAt) {
    const pose = poseOf({ ...rigOf(keyAt(filmKey(w.backdrop.key).time)), fNumber: 4 }, new THREE.Vector3())
    const sx = pose.focalMm / config.camera.gateWidthMm
    const d = pose.forward.clone().addScaledVector(pose.right, (w.backdrop.sunAt[0] - 0.5) / sx).addScaledVector(pose.up, (0.5 - w.backdrop.sunAt[1]) / (sx * ASPECT)).normalize()
    const elevation = Math.max(2 * RAD, Math.asin(d.y))
    const azimuth = Math.atan2(d.x, d.z)
    return new THREE.Vector3(Math.sin(azimuth) * Math.cos(elevation), Math.sin(elevation), Math.cos(azimuth) * Math.cos(elevation))
  }
  const az = w.sun.azimuthDeg * RAD
  const el = w.sun.elevationDeg * RAD
  return new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el))
}

function inputsOf(worldId: string): PlantInputs {
  const s = sunOf(worldId)
  const flat = Math.hypot(s.x, s.z) || 1
  const w = worlds[worldId]
  return { leanX: (s.x / flat) * w.sun.lean, leanZ: (s.z / flat) * w.sun.lean, lift: w.sun.lift, wind: 0 }
}

const topology = standInTopology()
const positions = new Float32Array(standInVertexCount * 3)
const point = new THREE.Vector3()

interface Seen { x: number; y: number }

function measure(spec: Spec, what: What): Seen {
  const fk = filmKey(spec.key)
  const worldId = worldIdOf(fk.unit)
  const inputs = inputsOf(worldId)
  const pose = poseOf({ ...rigOf(keyAt(fk.time)), fNumber: 4 }, new THREE.Vector3())
  const at = (x: number, y: number, z: number): Seen => project(pose, point.set(x, y, z), ASPECT)
  if (what === 'base') return at(0, 0, 0)
  if (what === 'horizon') return { x: 0.5, y: horizonY(pose, ASPECT) }
  if (what === 'sun') {
    const s = sunOf(worldId)
    const w = worlds[worldId]
    // The sun of the picture is the sun of the backdrop, which may sit below the least height the light is allowed.
    if (w.backdrop.file && w.backdrop.sunAt) {
      const lock = poseOf({ ...rigOf(keyAt(filmKey(w.backdrop.key).time)), fNumber: 4 }, new THREE.Vector3())
      const sx = lock.focalMm / config.camera.gateWidthMm
      s.copy(lock.forward).addScaledVector(lock.right, (w.backdrop.sunAt[0] - 0.5) / sx).addScaledVector(lock.up, (0.5 - w.backdrop.sunAt[1]) / (sx * ASPECT)).normalize()
    }
    return at(pose.position.x + s.x * 1e6, pose.position.y + s.y * 1e6, pose.position.z + s.z * 1e6)
  }
  if (what === 'tip') {
    const p = tipAt(fk.time, inputs, { x: 0, y: 0, z: 0 })
    return at(p.x, p.y, p.z)
  }
  if (what === 'head' || what === 'stemEnd') {
    const h = headAt(fk.time, inputs)
    const p = what === 'head' ? h.center : h.stemEnd
    return at(p.x, p.y, p.z)
  }
  buildStandIn(fk.time, inputs, positions, null)
  if (what === 'top') {
    let best = 0
    for (let i = 0; i < standInVertexCount; i++) if (positions[i * 3 + 1] > positions[best * 3 + 1]) best = i
    return at(positions[best * 3], positions[best * 3 + 1], positions[best * 3 + 2])
  }
  if (what === 'stemLow') {
    // Where the stem crosses the frame four fifths of the way down.
    let sum = 0
    let n = 0
    for (let i = 0; i < standInVertexCount; i++) {
      if (topology.info[i * 3] !== PART.stem) continue
      const p = at(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2])
      if (Math.abs(p.y - 0.8) > 0.04) continue
      sum += p.x
      n++
    }
    return { x: n ? sum / n : NaN, y: 0.8 }
  }
  let x0 = Infinity
  let x1 = -Infinity
  let y0 = Infinity
  let y1 = -Infinity
  for (let i = 0; i < standInVertexCount; i++) {
    const part = topology.info[i * 3]
    if (part !== PART.ray && part !== PART.bract && part !== PART.body) continue
    const p = at(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2])
    x0 = Math.min(x0, p.x)
    x1 = Math.max(x1, p.x)
    y0 = Math.min(y0, p.y)
    y1 = Math.max(y1, p.y)
  }
  return { x: x1 - x0, y: y1 - y0 }
}

const residual = (spec: Spec, target: Target): number => measure(spec, target.what)[target.axis] - target.value

function solve(spec: Spec): void {
  const k = keyAt(filmKey(spec.key).time)
  const errors = (): number[] => spec.targets.map((target) => residual(spec, target))
  let lambda = 1e-3
  let now = errors()
  let cost = now.reduce((s, e) => s + e * e, 0)
  for (let step = 0; step < 60 && cost > 1e-14; step++) {
    const n = spec.free.length
    const m = now.length
    const jac: number[][] = []
    for (let j = 0; j < n; j++) {
      const p = spec.free[j]
      const keep = k[p]
      const h = p === 'azimuthDeg' ? 0.01 : p === 'frameX' ? 1e-4 : Math.max(1e-6, Math.abs(keep) * 1e-4)
      k[p] = keep + h
      const moved = errors()
      k[p] = keep
      jac.push(moved.map((e, i) => (e - now[i]) / h))
    }
    const a: number[][] = []
    const b: number[] = []
    for (let i = 0; i < n; i++) {
      a.push([])
      for (let j = 0; j < n; j++) {
        let s = 0
        for (let r = 0; r < m; r++) s += jac[i][r] * jac[j][r]
        a[i].push(s)
      }
      let g = 0
      for (let r = 0; r < m; r++) g += jac[i][r] * now[r]
      b.push(-g)
    }
    for (let i = 0; i < n; i++) a[i][i] *= 1 + lambda
    const delta = gauss(a, b)
    const before = spec.free.map((p) => k[p])
    spec.free.forEach((p, i) => { k[p] = before[i] + delta[i] })
    if (k.distanceM <= 0.01 || k.heightM <= 0.002) {
      spec.free.forEach((p, i) => { k[p] = before[i] })
      lambda *= 10
      continue
    }
    const next = errors()
    const nextCost = next.reduce((s, e) => s + e * e, 0)
    if (nextCost < cost) {
      now = next
      cost = nextCost
      lambda = Math.max(1e-9, lambda / 5)
    } else {
      spec.free.forEach((p, i) => { k[p] = before[i] })
      lambda *= 10
    }
  }
}

function gauss(a: number[][], b: number[]): number[] {
  const n = b.length
  const m = a.map((row, i) => [...row, b[i]])
  for (let c = 0; c < n; c++) {
    let pivot = c
    for (let r = c + 1; r < n; r++) if (Math.abs(m[r][c]) > Math.abs(m[pivot][c])) pivot = r
    ;[m[c], m[pivot]] = [m[pivot], m[c]]
    if (Math.abs(m[c][c]) < 1e-18) continue
    for (let r = 0; r < n; r++) {
      if (r === c) continue
      const f = m[r][c] / m[c][c]
      for (let q = c; q <= n; q++) m[r][q] -= f * m[c][q]
    }
  }
  return m.map((row, i) => (Math.abs(row[i]) < 1e-18 ? 0 : row[n] / row[i]))
}

const PARAMS: Param[] = ['distanceM', 'heightM', 'aimHeightM', 'frameX', 'azimuthDeg']
const digits: Record<Param, number> = { distanceM: 4, heightM: 4, aimHeightM: 4, frameX: 4, azimuthDeg: 2 }
const round = (v: number, d: number): number => Number(v.toFixed(d))

function fitCamera(): void {
  const before = keys.map((k) => ({ ...k }))
  // The keys that hold a backdrop set the light, and the light leans the plant, so the whole set is solved a few times over.
  for (let pass = 0; pass < 5; pass++) for (const spec of specs) solve(spec)
  for (const k of keys) for (const p of PARAMS) k[p] = round(k[p], digits[p])

  // The keys that are not on an approved image keep their place relative to the key next to them.
  const follow = (time: number, lead: number): void => {
    const k = keyAt(time)
    const was = before.find((b) => b.time === time)!
    const leadWas = before.find((b) => b.time === lead)!
    const leadNow = keyAt(lead)
    k.distanceM = round((was.distanceM / leadWas.distanceM) * leadNow.distanceM, 4)
    k.heightM = round((was.heightM / leadWas.heightM) * leadNow.heightM, 4)
    k.aimHeightM = round((was.aimHeightM / leadWas.aimHeightM) * leadNow.aimHeightM, 4)
    k.frameX = round(was.frameX - leadWas.frameX + leadNow.frameX, 4)
    k.azimuthDeg = round(was.azimuthDeg - leadWas.azimuthDeg + leadNow.azimuthDeg, 2)
  }
  if (!process.argv.includes('--no-follow')) {
    follow(0, 1.5)
    // The camera drifts one way through the whole of dawn, so the first key sits a little past the sprout key.
    keyAt(0).azimuthDeg = round(keyAt(1.5).azimuthDeg + 0.35, 2)
    follow(52, 50.5)
    follow(60, 58.5)
  }

  for (const spec of specs) {
    const fk = filmKey(spec.key)
    const k = keyAt(fk.time)
    const was = before.find((b) => b.time === fk.time)!
    console.log(`\n${spec.key} (${fk.time} s)`)
    for (const p of PARAMS) if (k[p] !== was[p]) console.log(`  ${p}: ${was[p]} -> ${k[p]}`)
    for (const target of spec.targets) console.log(`  fit   ${target.what} ${target.axis}: ${measure(spec, target.what)[target.axis].toFixed(3)} (approved ${target.value})`)
    for (const target of spec.checks) console.log(`  check ${target.what} ${target.axis}: ${measure(spec, target.what)[target.axis].toFixed(3)} (approved ${target.value})`)
    if (spec.targets.some((target) => target.what === 'head')) {
      const h = headAt(fk.time, inputsOf(worldIdOf(fk.unit)))
      const pose = poseOf({ ...rigOf(k), fNumber: 4 }, new THREE.Vector3())
      const toCamera = pose.position.clone().sub(point.set(h.center.x, h.center.y, h.center.z)).normalize()
      const off = Math.acos(Math.max(-1, Math.min(1, toCamera.x * h.axis.x + toCamera.y * h.axis.y + toCamera.z * h.axis.z))) / RAD
      const side = pose.right.x * h.axis.x + pose.right.y * h.axis.y + pose.right.z * h.axis.z
      console.log(`  face  ${off.toFixed(1)} deg off the camera, turned to the ${side < 0 ? 'left' : 'right'} of the frame`)
    }
  }
  for (const time of [0, 52, 60]) {
    const k = keyAt(time)
    const was = before.find((b) => b.time === time)!
    console.log(`\n${time} s (follows its neighbor)`)
    for (const p of PARAMS) if (k[p] !== was[p]) console.log(`  ${p}: ${was[p]} -> ${k[p]}`)
  }
  if (write) {
    let text = readFileSync(CONFIG, 'utf8')
    for (const k of keys) {
      const line = new RegExp(`\\{"time": ${String(k.time).replace('.', '\\.')}, "distanceM": [^}]*\\}`)
      if (!line.test(text)) throw new Error(`camera key at ${k.time} s not found in ${CONFIG}`)
      text = text.replace(line, `{"time": ${k.time}, "distanceM": ${k.distanceM}, "heightM": ${k.heightM}, "aimHeightM": ${k.aimHeightM}, "frameX": ${k.frameX}, "azimuthDeg": ${k.azimuthDeg}, "focalMm": ${k.focalMm}}`)
    }
    writeFileSync(CONFIG, text)
    console.log(`\nwrote camera.keys to ${CONFIG}`)
  }
}

// Where the companion's parts land in the frame along the camera path now in the config, leaning as the film leans it.
// This measures the stand-in's shapes, to try places quickly. The rule itself is held on the real parts by tests/companion.test.ts.
const leaning = new THREE.Matrix4()
function companionSeen(leftM: number, towardCameraM: number, frame: number, variant = companionVariant): { inFrame: number; maxX: number; leafX0: number; leafX1: number } {
  const time = frame / config.film.fps
  const from = config.field.companion.fromAzimuthDeg * RAD
  const px = Math.sin(from) * towardCameraM - Math.cos(from) * leftM
  const pz = Math.cos(from) * towardCameraM + Math.sin(from) * leftM
  companionMatrix(leaning, { x: px, z: pz })
  const seg = config.segments.find((s) => time < s.end) ?? config.segments[config.segments.length - 1]
  const rig = rigPathAt(time)
  const pose = poseOf({ ...rig, fNumber: 4 }, new THREE.Vector3())
  usePlant(variant, { x: px, z: pz })
  buildStandIn(time, inputsOf(seg.world), positions, null)
  usePlant(0)
  const near = nearPlane(rig)
  let inFrame = 0
  let maxX = -Infinity
  let leafX0 = Infinity
  let leafX1 = -Infinity
  for (let i = 0; i < standInVertexCount; i++) {
    const p = project(pose, point.set(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]).applyMatrix4(leaning), ASPECT)
    if (p.depthM <= near) continue
    if (p.y < 0 || p.y > 1) continue
    maxX = Math.max(maxX, p.x)
    if (p.x >= 0 && p.x <= 1) {
      inFrame++
      leafX0 = Math.min(leafX0, p.x)
      leafX1 = Math.max(leafX1, p.x)
    }
  }
  return { inFrame, maxX, leafX0, leafX1 }
}

function fitCompanion(): void {
  const fps = config.film.fps
  const frostKey = Math.round(filmKey('frost').time * fps)
  const quiet: number[] = []
  for (let f = 0; f < 30 * fps; f += 5) quiet.push(f)
  quiet.push(30 * fps - 1, frostKey)
  const bloom = [Math.round(filmKey('bloom-opening').time * fps), Math.round(filmKey('bloom-hero').time * fps)]
  const c = config.field.companion
  const report = (leftM: number, towardM: number): { worst: number; at: number; reach: number[] } => {
    let worst = -Infinity
    let at = 0
    for (const f of quiet) {
      const s = companionSeen(leftM, towardM, f)
      if (s.maxX > worst) {
        worst = s.maxX
        at = f
      }
    }
    return { worst, at, reach: bloom.map((f) => companionSeen(leftM, towardM, f).leafX1) }
  }
  const now = report(c.leftM, c.towardCameraM)
  console.log(`now: leftM ${c.leftM}, towardCameraM ${c.towardCameraM}: farthest right before bloom x ${now.worst.toFixed(3)} at frame ${now.at}; reaches x ${now.reach.map((r) => (Number.isFinite(r) ? r.toFixed(3) : 'out')).join(' and ')} in the two bloom keys`)
  if (!process.argv.includes('--scan')) return
  // Try other plants and other places: out of the frame through the early worlds first, then as far into the two bloom frames as the approved images show.
  const tight: number[] = []
  for (let f = 600; f <= 730; f += 10) tight.push(f)
  tight.push(frostKey)
  const found: { variant: number; leftM: number; towardM: number; worst: number; reach: number[] }[] = []
  for (let variant = 1; variant <= 90; variant++) {
    for (let leftM = 0.6; leftM <= 0.9001; leftM += 0.025) {
      for (let towardM = 0.05; towardM <= 0.2001; towardM += 0.05) {
        let worst = -Infinity
        for (const f of tight) worst = Math.max(worst, companionSeen(leftM, towardM, f, variant).maxX)
        if (worst > -0.02) continue
        const reach = bloom.map((f) => companionSeen(leftM, towardM, f, variant).leafX1)
        if (!reach.every((r) => Number.isFinite(r) && r > 0.06)) continue
        let all = -Infinity
        for (const f of quiet) all = Math.max(all, companionSeen(leftM, towardM, f, variant).maxX)
        if (all > -0.02) continue
        found.push({ variant, leftM: round(leftM, 2), towardM: round(towardM, 2), worst: all, reach })
      }
    }
  }
  found.sort((a, b) => Math.min(...b.reach) - Math.min(...a.reach))
  for (const r of found.slice(0, 25)) console.log(`plant ${r.variant} · leftM ${r.leftM.toFixed(2)} toward ${r.towardM.toFixed(2)} · before bloom max x ${r.worst.toFixed(3)} · bloom keys reach ${r.reach.map((v) => v.toFixed(3)).join(', ')}`)
  if (!found.length) console.log('no plant and place keeps the companion out of the early frames and puts its leaves in both bloom frames')
}

if (process.argv.includes('--companion')) fitCompanion()
else fitCamera()
