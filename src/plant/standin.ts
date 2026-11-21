import { leafAzimuth, leafCount, leafElevation, leafFold, leafLength, leafSeed, leafStemFraction, stemAxis, stemRadius, stemTangent, type PlantInputs, type Vec3 } from './growth.ts'

const STEM_RINGS = 40
const STEM_SIDES = 9
const LEAF_U = 11
const LEAF_V = 7
const STEM_VERTS = STEM_RINGS * STEM_SIDES
const LEAF_VERTS = LEAF_U * LEAF_V

export const standInVertexCount = STEM_VERTS + leafCount * LEAF_VERTS

export interface Topology { index: Uint16Array; uv: Float32Array; info: Float32Array }

export function standInTopology(): Topology {
  const index: number[] = []
  const uv = new Float32Array(standInVertexCount * 2)
  const info = new Float32Array(standInVertexCount * 3)
  for (let r = 0; r < STEM_RINGS; r++) {
    for (let s = 0; s < STEM_SIDES; s++) {
      const v = r * STEM_SIDES + s
      uv[v * 2] = s / (STEM_SIDES - 1)
      uv[v * 2 + 1] = r / (STEM_RINGS - 1)
      if (r < STEM_RINGS - 1 && s < STEM_SIDES - 1) index.push(v, v + 1, v + STEM_SIDES, v + 1, v + STEM_SIDES + 1, v + STEM_SIDES)
    }
  }
  for (let i = 0; i < leafCount; i++) {
    const base = STEM_VERTS + i * LEAF_VERTS
    for (let a = 0; a < LEAF_U; a++) {
      for (let b = 0; b < LEAF_V; b++) {
        const v = base + a * LEAF_V + b
        uv[v * 2] = b / (LEAF_V - 1)
        uv[v * 2 + 1] = a / (LEAF_U - 1)
        info[v * 3] = 1
        info[v * 3 + 1] = i
        info[v * 3 + 2] = leafSeed(i, 0)
        if (a < LEAF_U - 1 && b < LEAF_V - 1) index.push(v, v + LEAF_V, v + 1, v + 1, v + LEAF_V, v + LEAF_V + 1)
      }
    }
  }
  return { index: new Uint16Array(index), uv, info }
}

const axis: Vec3 = { x: 0, y: 0, z: 0 }
const tan: Vec3 = { x: 0, y: 0, z: 0 }

function bladeShape(s: number): number {
  return Math.pow(Math.sin(Math.PI * Math.pow(s, 0.55)), 0.9)
}

export function buildStandIn(time: number, inputs: PlantInputs, pos: Float32Array, nor: Float32Array | null): void {
  for (let r = 0; r < STEM_RINGS; r++) {
    const u = r / (STEM_RINGS - 1)
    stemAxis(time, inputs, u, axis)
    stemTangent(time, inputs, u, tan)
    const radius = r === STEM_RINGS - 1 ? 0 : stemRadius(time, u)
    let rx = 1 - tan.x * tan.x
    let ry = -tan.x * tan.y
    let rz = -tan.x * tan.z
    const rl = Math.hypot(rx, ry, rz) || 1
    rx /= rl
    ry /= rl
    rz /= rl
    const bx = tan.y * rz - tan.z * ry
    const by = tan.z * rx - tan.x * rz
    const bz = tan.x * ry - tan.y * rx
    for (let s = 0; s < STEM_SIDES; s++) {
      const a = (s / (STEM_SIDES - 1)) * Math.PI * 2
      const c = Math.cos(a)
      const d = Math.sin(a)
      const nx = rx * c + bx * d
      const ny = ry * c + by * d
      const nz = rz * c + bz * d
      const v = (r * STEM_SIDES + s) * 3
      pos[v] = axis.x + nx * radius
      pos[v + 1] = axis.y + ny * radius
      pos[v + 2] = axis.z + nz * radius
      if (nor) {
        nor[v] = nx
        nor[v + 1] = ny
        nor[v + 2] = nz
      }
    }
  }
  for (let i = 0; i < leafCount; i++) {
    const base = STEM_VERTS + i * LEAF_VERTS
    const length = leafLength(i, time)
    const u = leafStemFraction(i, time)
    stemAxis(time, inputs, u, axis)
    stemTangent(time, inputs, u, tan)
    const az = leafAzimuth(i)
    let ox = Math.cos(az)
    let oy = 0
    let oz = Math.sin(az)
    const along = ox * tan.x + oy * tan.y + oz * tan.z
    ox -= tan.x * along
    oy -= tan.y * along
    oz -= tan.z * along
    const ol = Math.hypot(ox, oy, oz) || 1
    ox /= ol
    oy /= ol
    oz /= ol
    const wx = tan.y * oz - tan.z * oy
    const wy = tan.z * ox - tan.x * oz
    const wz = tan.x * oy - tan.y * ox
    const el = leafElevation(i, time, inputs)
    const ce = Math.cos(el)
    const se = Math.sin(el)
    const mx = ox * ce + tan.x * se
    const my = oy * ce + tan.y * se
    const mz = oz * ce + tan.z * se
    const nx = tan.x * ce - ox * se
    const ny = tan.y * ce - oy * se
    const nz = tan.z * ce - oz * se
    const fold = leafFold(i, time)
    const cf = Math.cos(fold)
    const sf = Math.sin(fold)
    const width = length * (0.36 + 0.1 * leafSeed(i, 1))
    const droop = 0.25 + 0.5 * leafSeed(i, 2)
    const curl = (leafSeed(i, 3) - 0.5) * 0.5
    const stalk = length * 0.18
    const radius = stemRadius(time, u)
    for (let a = 0; a < LEAF_U; a++) {
      const s = a / (LEAF_U - 1)
      const half = width * bladeShape(s)
      const reach = radius + stalk + length * s
      const sag = -droop * length * s * s
      const cx = axis.x + mx * reach + nx * sag
      const cy = axis.y + my * reach + ny * sag
      const cz = axis.z + mz * reach + nz * sag
      for (let b = 0; b < LEAF_V; b++) {
        const w = (b / (LEAF_V - 1)) * 2 - 1
        const flat = w * half * cf
        const lift = Math.abs(w) * half * sf + curl * w * half * s
        const v = (base + a * LEAF_V + b) * 3
        pos[v] = cx + wx * flat + nx * lift
        pos[v + 1] = cy + wy * flat + ny * lift
        pos[v + 2] = cz + wz * flat + nz * lift
      }
    }
  }
  if (nor) leafNormals(pos, nor)
}

function leafNormals(pos: Float32Array, nor: Float32Array): void {
  for (let i = 0; i < leafCount; i++) {
    const base = STEM_VERTS + i * LEAF_VERTS
    for (let a = 0; a < LEAF_U; a++) {
      for (let b = 0; b < LEAF_V; b++) {
        const a0 = Math.max(0, a - 1)
        const a1 = Math.min(LEAF_U - 1, a + 1)
        const b0 = Math.max(0, b - 1)
        const b1 = Math.min(LEAF_V - 1, b + 1)
        const pa0 = (base + a0 * LEAF_V + b) * 3
        const pa1 = (base + a1 * LEAF_V + b) * 3
        const pb0 = (base + a * LEAF_V + b0) * 3
        const pb1 = (base + a * LEAF_V + b1) * 3
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
        if (l > 1e-12) {
          x /= l
          y /= l
          z /= l
        } else {
          x = 0
          y = 1
          z = 0
        }
        const v = (base + a * LEAF_V + b) * 3
        nor[v] = x
        nor[v + 1] = y
        nor[v + 2] = z
      }
    }
  }
}
