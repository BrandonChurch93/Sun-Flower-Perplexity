import * as THREE from 'three'
import { config, timeOf, type CameraKey } from '../../src/config.ts'
import { smootherstep, lerp } from '../../src/core/curves.ts'
import type { WorldSettings } from '../../src/core/world.ts'
import { companionMatrix } from '../../src/director/companion.ts'
import { horizonY, nearPlane, poseOf, project } from '../../src/director/pose.ts'
import { rigPathAt, type RigPath } from '../../src/director/rig.ts'
import { cuts, segmentAt, segmentById } from '../../src/director/timeline.ts'
import { companionPlace, companionVariant } from '../../src/field/layout.ts'
import { headOpen, usePlant, type PlantInputs } from '../../src/plant/growth.ts'
import { PART, buildStandIn, headAt, standInTopology, standInVertexCount } from '../../src/plant/standin.ts'
import { world as dawn } from '../../src/worlds/dawn/index.ts'
import { world as frost } from '../../src/worlds/frost/index.ts'
import { world as golden } from '../../src/worlds/golden/index.ts'
import { world as night } from '../../src/worlds/night/index.ts'
import { world as rain } from '../../src/worlds/rain/index.ts'

export interface Region { id: string; label: string; left: number; top: number; width: number; height: number }
export interface Absent { id: string; label: string; why: string }
export interface Found { regions: Region[]; absent: Absent[] }

const worlds: Record<string, WorldSettings> = { dawn, rain, night, frost, golden }
const master = config.formats.master
const ASPECT = master.width / master.height
const RAD = Math.PI / 180

const cameraKeys: CameraKey[] = config.camera.keys
const rigOf = (k: CameraKey): RigPath => ({ distanceM: k.distanceM, heightM: k.heightM, aimHeightM: k.aimHeightM, frameX: k.frameX, azimuthRad: k.azimuthDeg * RAD, focalMm: k.focalMm })
const worldIdAt = (time: number): string => (config.segments.find((s) => time < s.end) ?? config.segments[config.segments.length - 1]).world

function sunOf(worldId: string, clampUp: boolean): THREE.Vector3 {
  const w = worlds[worldId]
  const filmKey = config.keys.find((k) => k.id === w.backdrop.key)
  const cameraKey = filmKey ? cameraKeys.find((c) => c.time === filmKey.time) : undefined
  if (w.backdrop.file && w.backdrop.sunAt && cameraKey) {
    const pose = poseOf({ ...rigOf(cameraKey), fNumber: 4 }, new THREE.Vector3())
    const sx = pose.focalMm / config.camera.gateWidthMm
    const d = pose.forward.clone().addScaledVector(pose.right, (w.backdrop.sunAt[0] - 0.5) / sx).addScaledVector(pose.up, (0.5 - w.backdrop.sunAt[1]) / (sx * ASPECT)).normalize()
    if (!clampUp) return d
    const elevation = Math.max(2 * RAD, Math.asin(d.y))
    const azimuth = Math.atan2(d.x, d.z)
    return new THREE.Vector3(Math.sin(azimuth) * Math.cos(elevation), Math.sin(elevation), Math.cos(azimuth) * Math.cos(elevation))
  }
  const az = w.sun.azimuthDeg * RAD
  const el = w.sun.elevationDeg * RAD
  return new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el))
}

function inputsOf(worldId: string): PlantInputs {
  const s = sunOf(worldId, true)
  const flat = Math.hypot(s.x, s.z) || 1
  const w = worlds[worldId]
  return { leanX: (s.x / flat) * w.sun.lean, leanZ: (s.z / flat) * w.sun.lean, lift: w.sun.lift, wind: 0 }
}

export function inputsAt(time: number): PlantInputs {
  const now = inputsOf(worldIdAt(time))
  let cut = null
  for (const c of cuts) if (c.time <= time) cut = c
  if (!cut) return now
  const before = inputsOf(cut.fromWorld)
  const k = smootherstep(0, config.plant.leanEaseSeconds, time - cut.time)
  return { leanX: lerp(before.leanX, now.leanX, k), leanZ: lerp(before.leanZ, now.leanZ, k), lift: lerp(before.lift, now.lift, k), wind: 0 }
}

const topology = standInTopology()
const positions = new Float32Array(standInVertexCount * 3)
const other = new Float32Array(standInVertexCount * 3)
const point = new THREE.Vector3()

interface Seen { x: number; y: number }
const inside = (p: Seen): boolean => p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1

// Where each surface of a frame lands in the master format, as crop boxes of one size. Nothing here is typed in per frame.
export function regionsOf(frame: number, width: number, height: number): Found {
  const time = timeOf(frame)
  const unit = segmentAt(frame)
  const rig = rigPathAt(time)
  const pose = poseOf({ ...rig, fNumber: 4 }, new THREE.Vector3())
  const near = nearPlane(rig)
  const inputs = inputsAt(time)
  const see = (x: number, y: number, z: number): Seen & { depthM: number } => project(pose, point.set(x, y, z), ASPECT)
  usePlant(0)
  buildStandIn(time, inputs, positions, null)
  const parts = new Map<number, Seen[]>()
  for (let i = 0; i < standInVertexCount; i++) {
    const p = see(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2])
    if (p.depthM <= near || !inside(p)) continue
    const part = topology.info[i * 3]
    parts.set(part, [...(parts.get(part) ?? []), p])
  }
  const companion: Seen[] = []
  const place = companionPlace()
  const leaning = companionMatrix(new THREE.Matrix4(), place)
  usePlant(companionVariant, place)
  buildStandIn(time, inputs, other, null)
  usePlant(0)
  for (let i = 0; i < standInVertexCount; i++) {
    if (topology.info[i * 3] !== PART.leaf) continue
    const p = project(pose, point.set(other[i * 3], other[i * 3 + 1], other[i * 3 + 2]).applyMatrix4(leaning), ASPECT)
    if (p.depthM > near && inside(p)) companion.push(p)
  }
  const head = headAt(time, inputs)
  const headSeen = see(head.center.x, head.center.y, head.center.z)
  const base = see(0, 0, 0)
  const horizon = horizonY(pose, ASPECT)
  const s = sunOf(unit.world, false)
  const sun = see(pose.position.x + s.x * 1e6, pose.position.y + s.y * 1e6, pose.position.z + s.z * 1e6)
  const sunSeen = sun.depthM > 0 && inside(sun)
  const fw = width / master.width
  const fh = height / master.height

  // The box of this size that holds the most of the given points, in steps of a quarter box.
  const densest = (points: Seen[], weight: (p: Seen) => number = () => 1): Seen | null => {
    if (points.length === 0) return null
    let best: Seen | null = null
    let most = 0
    for (let cy = fh / 2; cy <= 1 - fh / 2 + 1e-9; cy += fh / 4) {
      for (let cx = fw / 2; cx <= 1 - fw / 2 + 1e-9; cx += fw / 4) {
        let n = 0
        for (const p of points) if (Math.abs(p.x - cx) <= fw / 2 && Math.abs(p.y - cy) <= fh / 2) n += weight(p)
        if (n > most) {
          most = n
          best = { x: cx, y: cy }
        }
      }
    }
    return best
  }
  const regions: Region[] = []
  const absent: Absent[] = []
  const add = (id: string, label: string, center: Seen | null, why: string): void => {
    if (!center) {
      absent.push({ id, label, why })
      return
    }
    const left = Math.round(Math.min(master.width - width, Math.max(0, center.x * master.width - width / 2)))
    const top = Math.round(Math.min(master.height - height, Math.max(0, center.y * master.height - height / 2)))
    regions.push({ id, label, left, top, width, height })
  }
  const leaves = parts.get(PART.leaf) ?? []
  const stem = parts.get(PART.stem) ?? []
  const rays = parts.get(PART.ray) ?? []
  const crown = [...(parts.get(PART.body) ?? []), ...(parts.get(PART.bract) ?? []), ...rays]
  const sunSide = sun.depthM > 0 ? sun.x : 0.5
  const away = sunSide < 0.5 ? 1 : -1
  const open = headOpen(time)
  const front = densest(leaves)
  add('head', open > 0.5 ? 'the flower head' : 'the head or bud', crown.length || inside(headSeen) ? densest(crown) ?? headSeen : null, 'the plant has no head or bud in this frame')
  add('petals', 'the petals', open > 0 && rays.length ? densest(rays, (p) => 1 + Math.hypot(p.x - headSeen.x, (p.y - headSeen.y) / ASPECT) * 20) : null, 'no petals have opened in this frame')
  const crownLow = crown.reduce((m, p) => Math.max(m, p.y), -Infinity)
  const bare = crown.length ? stem.filter((p) => p.y > Math.min(crownLow, headSeen.y + fh / 2)) : stem
  add('stem', 'the stem and its hairs', densest(bare.length ? bare : stem), 'the stem is outside this frame')
  add('leaf-front', 'a leaf seen from the front', front, 'no leaf is inside this frame')
  add('leaf-lit', 'a leaf with the light behind it', densest(leaves, (p) => (front && Math.abs(p.x - front.x) < fw / 2 && Math.abs(p.y - front.y) < fh / 2 ? 0 : 1 / (0.05 + Math.abs(p.x - sunSide)))), 'no second leaf is inside this frame')
  const wet = unit.world === 'rain' ? 'water drops' : unit.world === 'frost' ? 'frost' : unit.world === 'dawn' ? 'dew' : null
  add('wet', `${wet ?? 'water, frost or dew'} on the plant`, wet ? densest([...leaves, ...(parts.get(PART.seedLeaf) ?? []), ...stem], (p) => p.y) : null, 'this part of the film has no water, frost or dew')
  add('soil', 'the soil where the stem meets it', inside(base) ? { x: base.x, y: base.y } : null, 'the foot of the stem is below the bottom edge of this frame')
  const groundTop = Math.max(horizon, 0)
  const ground = groundTop < 1 - fh * 0.75
  add('grass', 'the ground nearest the lens, with its grass, soil or nearest rows', ground ? { x: away > 0 ? 1 : 0, y: 1 } : null, 'too little ground is in this frame')
  add('neighbors', 'the near neighbor at the edge of the frame', densest(companion), 'the neighbor is outside this frame')
  add('field', 'the field behind the plant', ground ? { x: away > 0 ? 1 : 0, y: groundTop + fh * 0.6 } : null, 'too little ground is in this frame')
  add('far', 'the far background at the skyline', horizon > 0 && horizon < 1 ? { x: away > 0 ? 0.85 : 0.15, y: horizon - fh * 0.1 } : null, 'the skyline is outside this frame')
  add('sun', 'the sun and the sky round it', sunSeen ? sun : null, 'the sun is outside this frame')
  add('sky', 'the sky', horizon > fh * 0.75 ? { x: sunSeen ? (sun.x < 0.5 ? 0.7 : 0.3) : 0.5, y: 0 } : null, 'too little sky is in this frame')
  return { regions, absent }
}

// The first frame of the run of `count` consecutive frames inside the unit where the plant's growth changes its shape the most, under a steady light. The head's parts are measured against the head, so being carried by the stem does not count.
export function fastestRun(unitId: string, count: number): { first: number; change: number } {
  const unit = segmentById(unitId)
  usePlant(0)
  const moves: number[] = []
  let before = new Float32Array(standInVertexCount * 3)
  let now = new Float32Array(standInVertexCount * 3)
  const inputs = inputsOf(unit.world)
  const onHead = (i: number): boolean => topology.info[i * 3] === PART.body || topology.info[i * 3] === PART.bract || topology.info[i * 3] === PART.ray
  buildStandIn(timeOf(unit.firstFrame), inputs, before, null)
  for (let f = unit.firstFrame + 1; f <= unit.lastFrame; f++) {
    buildStandIn(timeOf(f), inputs, now, null)
    const carry = [0, 0, 0]
    let bodies = 0
    for (let i = 0; i < standInVertexCount; i++) {
      if (topology.info[i * 3] !== PART.body) continue
      for (let a = 0; a < 3; a++) carry[a] += now[i * 3 + a] - before[i * 3 + a]
      bodies++
    }
    for (let a = 0; a < 3; a++) carry[a] /= Math.max(1, bodies)
    let sum = 0
    for (let i = 0; i < standInVertexCount; i++) {
      const c = onHead(i) ? carry : [0, 0, 0]
      sum += Math.hypot(now[i * 3] - before[i * 3] - c[0], now[i * 3 + 1] - before[i * 3 + 1] - c[1], now[i * 3 + 2] - before[i * 3 + 2] - c[2])
    }
    moves.push(sum / standInVertexCount)
    const swap = before
    before = now
    now = swap
  }
  let best = 0
  let most = -1
  let run = 0
  for (let i = 0; i < moves.length; i++) {
    run += moves[i]
    if (i >= count - 1) run -= moves[i - (count - 1)]
    if (i >= count - 2 && run > most) {
      most = run
      best = i - (count - 2)
    }
  }
  return { first: unit.firstFrame + best, change: most }
}
