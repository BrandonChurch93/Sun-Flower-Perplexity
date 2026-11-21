import { clamp, lerp, smoothstep } from '../core/curves.ts'
import {
  archShare,
  bodyHalfDepth,
  bodyRadius,
  bractAngle,
  bractCurl,
  bractCount,
  bractLength,
  headOpen,
  headDirection,
  heightAt,
  huskDrop,
  huskLengthM,
  huskRest,
  leafAzimuth,
  leafCount,
  leafDroop,
  leafElevation,
  leafFold,
  leafLength,
  leafSeed,
  leafStemFraction,
  rayAngle,
  rayCount,
  rayLength,
  rayOpen,
  seedLeafAngle,
  seedLeafFraction,
  seedLeafLength,
  stemBaseRadius,
  stemBend,
  stemDirection,
  stemRadius,
  type PlantInputs,
  type StemBend,
  type Vec3,
} from './growth.ts'

const STEM_RINGS = 40
const STEM_SIDES = 9
const STEM_STEPS = 4
const SEED_U = 9
const SEED_V = 5
const HUSK_RINGS = 7
const HUSK_SIDES = 8
const LEAF_U = 11
const LEAF_V = 7
const BODY_RINGS = 10
const BODY_SIDES = 14
const BRACT_U = 6
const BRACT_V = 3
const RAY_U = 5
const RAY_V = 3

const STEM0 = 0
const SEED0 = STEM0 + STEM_RINGS * STEM_SIDES
const HUSK0 = SEED0 + 2 * SEED_U * SEED_V
const LEAF0 = HUSK0 + HUSK_RINGS * HUSK_SIDES
const BODY0 = LEAF0 + leafCount * LEAF_U * LEAF_V
const BRACT0 = BODY0 + BODY_RINGS * BODY_SIDES
const RAY0 = BRACT0 + bractCount * BRACT_U * BRACT_V

export const standInVertexCount = RAY0 + rayCount * RAY_U * RAY_V

export const PART = { stem: 0, leaf: 1, seedLeaf: 2, husk: 3, body: 4, bract: 5, ray: 6 } as const

export interface Topology { index: Uint16Array; uv: Float32Array; info: Float32Array }

export function standInTopology(): Topology {
  const index: number[] = []
  const uv = new Float32Array(standInVertexCount * 2)
  const info = new Float32Array(standInVertexCount * 3)
  const grid = (base: number, nu: number, nv: number, part: number, id: number, seed: number) => {
    for (let a = 0; a < nu; a++) {
      for (let b = 0; b < nv; b++) {
        const v = base + a * nv + b
        uv[v * 2] = b / (nv - 1)
        uv[v * 2 + 1] = a / (nu - 1)
        info[v * 3] = part
        info[v * 3 + 1] = id
        info[v * 3 + 2] = seed
        if (a < nu - 1 && b < nv - 1) index.push(v, v + nv, v + 1, v + 1, v + nv, v + nv + 1)
      }
    }
  }
  grid(STEM0, STEM_RINGS, STEM_SIDES, PART.stem, 0, 0)
  for (let i = 0; i < 2; i++) grid(SEED0 + i * SEED_U * SEED_V, SEED_U, SEED_V, PART.seedLeaf, i, 0.3 + 0.4 * i)
  grid(HUSK0, HUSK_RINGS, HUSK_SIDES, PART.husk, 0, 0)
  for (let i = 0; i < leafCount; i++) grid(LEAF0 + i * LEAF_U * LEAF_V, LEAF_U, LEAF_V, PART.leaf, i, leafSeed(i, 0))
  grid(BODY0, BODY_RINGS, BODY_SIDES, PART.body, 0, 0)
  for (let j = 0; j < bractCount; j++) grid(BRACT0 + j * BRACT_U * BRACT_V, BRACT_U, BRACT_V, PART.bract, j, leafSeed(j, 4))
  for (let k = 0; k < rayCount; k++) grid(RAY0 + k * RAY_U * RAY_V, RAY_U, RAY_V, PART.ray, k, leafSeed(k, 5))
  return { index: new Uint16Array(index), uv, info }
}

// The stem as a line of unit length: where each ring sits, which way it runs, and a side direction carried along it without twist.
const sx = new Float64Array(STEM_RINGS)
const sy = new Float64Array(STEM_RINGS)
const sz = new Float64Array(STEM_RINGS)
const tx = new Float64Array(STEM_RINGS)
const ty = new Float64Array(STEM_RINGS)
const tz = new Float64Array(STEM_RINGS)
const rx = new Float64Array(STEM_RINGS)
const ry = new Float64Array(STEM_RINGS)
const rz = new Float64Array(STEM_RINGS)
const dir: Vec3 = { x: 0, y: 1, z: 0 }
let bend: StemBend = stemBend(0, { leanX: 0, leanZ: 0, lift: 1 })

function layStem(time: number, inputs: PlantInputs): void {
  bend = stemBend(time, inputs)
  let x = 0
  let y = 0
  let z = 0
  let px = 1
  let py = 0
  let pz = 0
  const step = 1 / ((STEM_RINGS - 1) * STEM_STEPS)
  for (let r = 0; r < STEM_RINGS; r++) {
    const u = r / (STEM_RINGS - 1)
    stemDirection(bend, u, dir)
    sx[r] = x
    sy[r] = y
    sz[r] = z
    tx[r] = dir.x
    ty[r] = dir.y
    tz[r] = dir.z
    const along = px * dir.x + py * dir.y + pz * dir.z
    px -= dir.x * along
    py -= dir.y * along
    pz -= dir.z * along
    const l = Math.hypot(px, py, pz) || 1
    px /= l
    py /= l
    pz /= l
    rx[r] = px
    ry[r] = py
    rz[r] = pz
    if (r === STEM_RINGS - 1) break
    for (let k = 0; k < STEM_STEPS; k++) {
      stemDirection(bend, u + (k + 0.5) * step, dir)
      x += dir.x * step
      y += dir.y * step
      z += dir.z * step
    }
  }
}

interface Node { x: number; y: number; z: number; tx: number; ty: number; tz: number; rx: number; ry: number; rz: number; bx: number; by: number; bz: number }
const node: Node = { x: 0, y: 0, z: 0, tx: 0, ty: 1, tz: 0, rx: 1, ry: 0, rz: 0, bx: 0, by: 0, bz: -1 }

// A place on the stem at a share u of its length, with the stem's direction and two directions across it.
function stemNode(u: number, length: number): Node {
  const f = clamp(u) * (STEM_RINGS - 1)
  const i = Math.min(STEM_RINGS - 2, Math.floor(f))
  const k = f - i
  node.x = lerp(sx[i], sx[i + 1], k) * length
  node.y = lerp(sy[i], sy[i + 1], k) * length
  node.z = lerp(sz[i], sz[i + 1], k) * length
  let ax = lerp(tx[i], tx[i + 1], k)
  let ay = lerp(ty[i], ty[i + 1], k)
  let az = lerp(tz[i], tz[i + 1], k)
  let l = Math.hypot(ax, ay, az) || 1
  ax /= l
  ay /= l
  az /= l
  let qx = lerp(rx[i], rx[i + 1], k)
  let qy = lerp(ry[i], ry[i + 1], k)
  let qz = lerp(rz[i], rz[i + 1], k)
  const along = qx * ax + qy * ay + qz * az
  qx -= ax * along
  qy -= ay * along
  qz -= az * along
  l = Math.hypot(qx, qy, qz) || 1
  node.tx = ax
  node.ty = ay
  node.tz = az
  node.rx = qx / l
  node.ry = qy / l
  node.rz = qz / l
  node.bx = ay * node.rz - az * node.ry
  node.by = az * node.rx - ax * node.rz
  node.bz = ax * node.ry - ay * node.rx
  return node
}

interface Frame { ox: number; oy: number; oz: number; mx: number; my: number; mz: number; wx: number; wy: number; wz: number; nx: number; ny: number; nz: number }
const frame: Frame = { ox: 0, oy: 0, oz: 0, mx: 1, my: 0, mz: 0, wx: 0, wy: 0, wz: 1, nx: 0, ny: 1, nz: 0 }

// A blade that leaves the point o. It runs outward along `out`, raised toward `axis` by the angle `rise`.
function setFrame(ox: number, oy: number, oz: number, ax: number, ay: number, az: number, outX: number, outY: number, outZ: number, rise: number): Frame {
  const c = Math.cos(rise)
  const s = Math.sin(rise)
  frame.ox = ox
  frame.oy = oy
  frame.oz = oz
  frame.mx = outX * c + ax * s
  frame.my = outY * c + ay * s
  frame.mz = outZ * c + az * s
  frame.nx = ax * c - outX * s
  frame.ny = ay * c - outY * s
  frame.nz = az * c - outZ * s
  frame.wx = ay * outZ - az * outY
  frame.wy = az * outX - ax * outZ
  frame.wz = ax * outY - ay * outX
  return frame
}

// Turns a blade about its own length.
function roll(f: Frame, angle: number): Frame {
  const c = Math.cos(angle)
  const s = Math.sin(angle)
  const wx = f.wx * c + f.nx * s
  const wy = f.wy * c + f.ny * s
  const wz = f.wz * c + f.nz * s
  f.nx = f.nx * c - f.wx * s
  f.ny = f.ny * c - f.wy * s
  f.nz = f.nz * c - f.wz * s
  f.wx = wx
  f.wy = wy
  f.wz = wz
  return f
}

type Outline = (s: number) => number

const leafOutline: Outline = (s) => {
  const q = clamp((s - 0.2) / 0.8)
  return 0.06 * (1 - s) + 0.94 * Math.pow(Math.sin(Math.PI * Math.pow(q, 0.55)), 0.9)
}
const ovalOutline: Outline = (s) => Math.pow(Math.sin(Math.PI * Math.pow(s, 0.8)), 0.6)
const pointOutline: Outline = (s) => Math.pow(1 - s, 0.75) * (0.55 + 0.45 * smoothstep(0, 0.3, s))
const rayOutline: Outline = (s) => Math.pow(Math.sin(Math.PI * Math.pow(s, 0.62)), 0.7)

function blade(pos: Float32Array, base: number, nu: number, nv: number, f: Frame, length: number, half: number, outline: Outline, droop: number, fold: number, curl: number): void {
  const cf = Math.cos(fold)
  const sf = Math.sin(fold)
  for (let a = 0; a < nu; a++) {
    const s = a / (nu - 1)
    const h = half * outline(s)
    const reach = length * s
    const sag = -droop * length * s * s
    const cx = f.ox + f.mx * reach + f.nx * sag
    const cy = f.oy + f.my * reach + f.ny * sag
    const cz = f.oz + f.mz * reach + f.nz * sag
    for (let b = 0; b < nv; b++) {
      const w = (b / (nv - 1)) * 2 - 1
      const flat = w * h * cf
      const lift = Math.abs(w) * h * sf + curl * w * h * s
      const v = (base + a * nv + b) * 3
      pos[v] = cx + f.wx * flat + f.nx * lift
      pos[v + 1] = cy + f.wy * flat + f.ny * lift
      pos[v + 2] = cz + f.wz * flat + f.nz * lift
    }
  }
}

function gridNormals(pos: Float32Array, nor: Float32Array, base: number, nu: number, nv: number): void {
  for (let a = 0; a < nu; a++) {
    for (let b = 0; b < nv; b++) {
      const a0 = Math.max(0, a - 1)
      const a1 = Math.min(nu - 1, a + 1)
      const b0 = Math.max(0, b - 1)
      const b1 = Math.min(nv - 1, b + 1)
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
      let x = uy * vz - uz * vy
      let y = uz * vx - ux * vz
      let z = ux * vy - uy * vx
      const l = Math.hypot(x, y, z)
      if (l > 1e-14) {
        x /= l
        y /= l
        z /= l
      } else {
        x = 0
        y = 1
        z = 0
      }
      const v = (base + a * nv + b) * 3
      nor[v] = x
      nor[v + 1] = y
      nor[v + 2] = z
    }
  }
}

// A rounded body about the axis a through the point c, with two directions p and q across it.
function ellipsoid(pos: Float32Array, nor: Float32Array | null, base: number, rings: number, sides: number, cx: number, cy: number, cz: number, ax: number, ay: number, az: number, px: number, py: number, pz: number, across: number, along: number): void {
  const qx = ay * pz - az * py
  const qy = az * px - ax * pz
  const qz = ax * py - ay * px
  for (let r = 0; r < rings; r++) {
    const lat = (r / (rings - 1)) * Math.PI
    const h = -Math.cos(lat)
    const w = Math.sin(lat)
    for (let s = 0; s < sides; s++) {
      const a = (s / (sides - 1)) * Math.PI * 2
      const c = Math.cos(a)
      const d = Math.sin(a)
      const ox = px * c + qx * d
      const oy = py * c + qy * d
      const oz = pz * c + qz * d
      const v = (base + r * sides + s) * 3
      pos[v] = cx + ax * h * along + ox * w * across
      pos[v + 1] = cy + ay * h * along + oy * w * across
      pos[v + 2] = cz + az * h * along + oz * w * across
      if (nor) {
        let nx = ax * h * across + ox * w * along
        let ny = ay * h * across + oy * w * along
        let nz = az * h * across + oz * w * along
        const l = Math.hypot(nx, ny, nz) || 1
        nx /= l
        ny /= l
        nz /= l
        nor[v] = nx
        nor[v + 1] = ny
        nor[v + 2] = nz
      }
    }
  }
}

interface Head { cx: number; cy: number; cz: number; ax: number; ay: number; az: number; px: number; py: number; pz: number; qx: number; qy: number; qz: number; radius: number; depth: number }
const head: Head = { cx: 0, cy: 0, cz: 0, ax: 0, ay: 1, az: 0, px: 1, py: 0, pz: 0, qx: 0, qy: 0, qz: 1, radius: 0, depth: 0 }

// The bud and the head sit on the end of the stem. Their axis is the direction of the stem's end with the whole tilt of the head in it.
function layHead(time: number, length: number): Head {
  const end = stemNode(1, length)
  headDirection(bend, dir)
  head.ax = dir.x
  head.ay = dir.y
  head.az = dir.z
  const along = end.rx * head.ax + end.ry * head.ay + end.rz * head.az
  let px = end.rx - head.ax * along
  let py = end.ry - head.ay * along
  let pz = end.rz - head.az * along
  const l = Math.hypot(px, py, pz) || 1
  px /= l
  py /= l
  pz /= l
  head.px = px
  head.py = py
  head.pz = pz
  head.qx = head.ay * pz - head.az * py
  head.qy = head.az * px - head.ax * pz
  head.qz = head.ax * py - head.ay * px
  head.radius = bodyRadius(time)
  head.depth = bodyHalfDepth(time)
  head.cx = end.x + head.ax * head.depth
  head.cy = end.y + head.ay * head.depth
  head.cz = end.z + head.az * head.depth
  return head
}

// Builds the whole plant on a stem of the given length and returns the height of its highest point.
function place(time: number, inputs: PlantInputs, length: number, pos: Float32Array, nor: Float32Array | null): number {
  layStem(time, inputs)
  const grown = smoothstep(0, 0.006, heightAt(time))
  for (let r = 0; r < STEM_RINGS; r++) {
    const u = r / (STEM_RINGS - 1)
    const radius = r === STEM_RINGS - 1 ? 0 : stemRadius(time, u) * grown
    const bx = ty[r] * rz[r] - tz[r] * ry[r]
    const by = tz[r] * rx[r] - tx[r] * rz[r]
    const bz = tx[r] * ry[r] - ty[r] * rx[r]
    for (let s = 0; s < STEM_SIDES; s++) {
      const a = (s / (STEM_SIDES - 1)) * Math.PI * 2
      const c = Math.cos(a)
      const d = Math.sin(a)
      const nx = rx[r] * c + bx * d
      const ny = ry[r] * c + by * d
      const nz = rz[r] * c + bz * d
      const v = (STEM0 + r * STEM_SIDES + s) * 3
      pos[v] = sx[r] * length + nx * radius
      pos[v + 1] = sy[r] * length + ny * radius
      pos[v + 2] = sz[r] * length + nz * radius
      if (nor) {
        nor[v] = nx
        nor[v + 1] = ny
        nor[v + 2] = nz
      }
    }
  }

  const seedLength = seedLeafLength(time)
  const seedAt = seedLeafFraction(time)
  for (let i = 0; i < 2; i++) {
    const n = stemNode(seedAt, length)
    const side = i === 0 ? -1 : 1
    const radius = stemRadius(time, seedAt) * 0.6 * grown
    const f = setFrame(n.x + n.rx * side * radius, n.y + n.ry * side * radius, n.z + n.rz * side * radius, n.tx, n.ty, n.tz, n.rx * side, n.ry * side, n.rz * side, Math.PI / 2 - seedLeafAngle(i, time))
    roll(f, side * 0.7 * smoothstep(0.2, 0.9, seedLeafAngle(i, time)))
    blade(pos, SEED0 + i * SEED_U * SEED_V, SEED_U, SEED_V, f, seedLength, seedLength * 0.3, ovalOutline, 0.12, 0.12, 0)
  }

  {
    const end = stemNode(1, length)
    const k = huskDrop(time)
    const ride = seedLength * 0.62
    const hx = lerp(end.x + end.tx * ride, huskRest.x, k)
    const hy = lerp(end.y + end.ty * ride, huskRest.y, k)
    const hz = lerp(end.z + end.tz * ride, huskRest.z, k)
    let ax = lerp(end.tx, 0.94, k)
    let ay = lerp(end.ty, 0.04, k)
    let az = lerp(end.tz, 0.34, k)
    const l = Math.hypot(ax, ay, az) || 1
    ax /= l
    ay /= l
    az /= l
    let px = end.bx - ax * (end.bx * ax + end.by * ay + end.bz * az)
    let py = end.by - ay * (end.bx * ax + end.by * ay + end.bz * az)
    let pz = end.bz - az * (end.bx * ax + end.by * ay + end.bz * az)
    const pl = Math.hypot(px, py, pz) || 1
    px /= pl
    py /= pl
    pz /= pl
    ellipsoid(pos, nor, HUSK0, HUSK_RINGS, HUSK_SIDES, hx, hy, hz, ax, ay, az, px, py, pz, huskLengthM * 0.3 * grown, huskLengthM * 0.5 * grown)
  }

  for (let i = 0; i < leafCount; i++) {
    const base = LEAF0 + i * LEAF_U * LEAF_V
    const size = leafLength(i, time)
    const u = leafStemFraction(i, time)
    const n = stemNode(u, length)
    const az = leafAzimuth(i)
    const c = Math.cos(az)
    const s = Math.sin(az)
    const ox = n.rx * s - n.bx * c
    const oy = n.ry * s - n.by * c
    const oz = n.rz * s - n.bz * c
    const radius = stemRadius(time, u) * 0.7 * grown
    const f = setFrame(n.x + ox * radius, n.y + oy * radius, n.z + oz * radius, n.tx, n.ty, n.tz, ox, oy, oz, leafElevation(i, time, inputs))
    blade(pos, base, LEAF_U, LEAF_V, f, size * 1.25, size * (0.36 + 0.1 * leafSeed(i, 1)), leafOutline, leafDroop(i, inputs), leafFold(i, time), (leafSeed(i, 3) - 0.5) * 0.5)
  }

  const h = layHead(time, length)
  ellipsoid(pos, nor, BODY0, BODY_RINGS, BODY_SIDES, h.cx, h.cy, h.cz, h.ax, h.ay, h.az, h.px, h.py, h.pz, h.radius, h.depth)
  for (let j = 0; j < bractCount; j++) {
    const around = (j / bractCount) * Math.PI * 2 + 0.1
    const c = Math.cos(around)
    const s = Math.sin(around)
    const ox = h.px * c + h.qx * s
    const oy = h.py * c + h.qy * s
    const oz = h.pz * c + h.qz * s
    const at = h.radius * 0.92
    const back = -0.35 * h.depth
    const size = bractLength(j, time)
    const f = setFrame(h.cx + h.ax * back + ox * at, h.cy + h.ay * back + oy * at, h.cz + h.az * back + oz * at, h.ax, h.ay, h.az, ox, oy, oz, Math.PI / 2 - bractAngle(j, time))
    blade(pos, BRACT0 + j * BRACT_U * BRACT_V, BRACT_U, BRACT_V, f, size, size * 0.24, pointOutline, -bractCurl(j, time), 0.3, 0)
  }
  for (let k = 0; k < rayCount; k++) {
    const around = (k / rayCount) * Math.PI * 2
    const c = Math.cos(around)
    const s = Math.sin(around)
    const ox = h.px * c + h.qx * s
    const oy = h.py * c + h.qy * s
    const oz = h.pz * c + h.qz * s
    const at = h.radius * 0.95
    const front = 0.5 * h.depth
    const size = rayLength(k, time)
    const f = setFrame(h.cx + h.ax * front + ox * at, h.cy + h.ay * front + oy * at, h.cz + h.az * front + oz * at, h.ax, h.ay, h.az, ox, oy, oz, Math.PI / 2 - rayAngle(k, time))
    blade(pos, RAY0 + k * RAY_U * RAY_V, RAY_U, RAY_V, f, size, size * 0.2, rayOutline, 0.12 * rayOpen(k, time), 1.0 * (1 - rayOpen(k, time)), 0)
  }

  if (nor) {
    for (let i = 0; i < 2; i++) gridNormals(pos, nor, SEED0 + i * SEED_U * SEED_V, SEED_U, SEED_V)
    for (let i = 0; i < leafCount; i++) gridNormals(pos, nor, LEAF0 + i * LEAF_U * LEAF_V, LEAF_U, LEAF_V)
    for (let j = 0; j < bractCount; j++) gridNormals(pos, nor, BRACT0 + j * BRACT_U * BRACT_V, BRACT_U, BRACT_V)
    for (let k = 0; k < rayCount; k++) gridNormals(pos, nor, RAY0 + k * RAY_U * RAY_V, RAY_U, RAY_V)
  }

  let top = 0
  for (let v = 1; v < pos.length; v += 3) if (pos[v] > top) top = pos[v]
  return top
}

interface Solved { time: number; leanX: number; leanZ: number; lift: number; length: number }
const solved: Solved[] = []
const KEEP = 16
const scratch = new Float32Array(standInVertexCount * 3)

// The stem is as long as it must be for the top of the whole plant to stand at the height the film gives for this moment.
export function stemLength(time: number, inputs: PlantInputs): number {
  for (const s of solved) if (s.time === time && s.leanX === inputs.leanX && s.leanZ === inputs.leanZ && s.lift === inputs.lift) return s.length
  const target = heightAt(time)
  let length = 0
  if (target > 0) {
    let l0 = target
    let f0 = place(time, inputs, l0, scratch, null) - target
    let l1 = Math.max(1e-7, (l0 * target) / (f0 + target))
    let f1 = place(time, inputs, l1, scratch, null) - target
    for (let i = 0; i < 8 && Math.abs(f1) > 1e-7 && l1 !== l0; i++) {
      const slope = (f1 - f0) / (l1 - l0)
      if (!(slope > 1e-6)) break
      const l2 = Math.max(0, l1 - f1 / slope)
      l0 = l1
      f0 = f1
      l1 = l2
      f1 = place(time, inputs, l1, scratch, null) - target
    }
    length = l1
  }
  solved.push({ time, leanX: inputs.leanX, leanZ: inputs.leanZ, lift: inputs.lift, length })
  if (solved.length > KEEP) solved.shift()
  return length
}

export function buildStandIn(time: number, inputs: PlantInputs, pos: Float32Array, nor: Float32Array | null): number {
  return place(time, inputs, stemLength(time, inputs), pos, nor)
}

// The point the lens holds: the top of the arch, then the end of the stem, then the bud, then the middle of the open face.
export function tipAt(time: number, inputs: PlantInputs, out: Vec3): Vec3 {
  const length = stemLength(time, inputs)
  layStem(time, inputs)
  const n = stemNode(archShare(time), length)
  const x = n.x
  const y = n.y
  const z = n.z
  const h = layHead(time, length)
  const reach = h.depth * (1 + headOpen(time))
  out.x = x + h.ax * reach
  out.y = y + h.ay * reach
  out.z = z + h.az * reach
  return out
}

export function plantNumbers(time: number, inputs: PlantInputs): number[] {
  const tip = tipAt(time, inputs, { x: 0, y: 0, z: 0 })
  let leafSum = 0
  for (let i = 0; i < leafCount; i++) leafSum += leafLength(i, time)
  return [heightAt(time), tip.x, tip.y, tip.z, stemBaseRadius(time), leafSum, inputs.leanX, inputs.leanZ, inputs.lift]
}

// Where the middle of the head and the end of the stem are, for fitting the camera.
export function headAt(time: number, inputs: PlantInputs): { center: Vec3; axis: Vec3; stemEnd: Vec3; radius: number } {
  const length = stemLength(time, inputs)
  layStem(time, inputs)
  const end = stemNode(1, length)
  const stemEnd = { x: end.x, y: end.y, z: end.z }
  const h = layHead(time, length)
  return { center: { x: h.cx, y: h.cy, z: h.cz }, axis: { x: h.ax, y: h.ay, z: h.az }, stemEnd, radius: h.radius }
}

