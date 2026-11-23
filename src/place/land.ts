import { hash32, streamSeed } from '../core/random.ts'

// The one place of the film, as numbers: how high the land stands at any point, where woods grow on it, and how its fields are cut. Everything here is fixed at load and never follows the film second.
const SEED = streamSeed('place')
const RAD = Math.PI / 180

export const LAND_FROM_M = 64
export const LAND_TO_M = 5850

const smooth = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

function lattice(ix: number, iz: number, salt: number): number {
  return hash32((ix + 40000) ^ hash32((iz + 40000) ^ hash32(SEED + salt))) / 4294967296
}

export function noise2(x: number, z: number, salt: number): number {
  const ix = Math.floor(x)
  const iz = Math.floor(z)
  const fx = x - ix
  const fz = z - iz
  const ux = fx * fx * fx * (fx * (fx * 6 - 15) + 10)
  const uz = fz * fz * fz * (fz * (fz * 6 - 15) + 10)
  const a = lattice(ix, iz, salt)
  const b = lattice(ix + 1, iz, salt)
  const c = lattice(ix, iz + 1, salt)
  const d = lattice(ix + 1, iz + 1, salt)
  return a + (b - a) * ux + (c - a) * uz + (a - b - c + d) * ux * uz
}

function fbm2(x: number, z: number, salt: number, octaves: number): number {
  let s = 0
  let a = 0.5
  let total = 0
  for (let i = 0; i < octaves; i++) {
    s += a * noise2(x, z, salt + i)
    total += a
    x = x * 2.03 + 17.1
    z = z * 2.03 + 9.2
    a *= 0.5
  }
  return s / total
}

const bell = (x: number): number => Math.exp(-x * x)

function off(azDeg: number, centerDeg: number): number {
  return ((azDeg - centerDeg + 540) % 360) - 180
}

// Where the sun comes up and where it goes down on the last day. The hills fall to a saddle at both.
export const SUNRISE_DEG = 181
export const SUNSET_DEG = 226

// How high the hills may stand above the horizon at a bearing, in degrees seen from the plant.
export function crestDeg(azDeg: number): number {
  const rise = bell(off(azDeg, SUNRISE_DEG) / 13)
  const set = bell(off(azDeg, SUNSET_DEG) / 9)
  const between = bell(off(azDeg, 204) / 14)
  const left = bell(off(azDeg, 252) / 15)
  const right = bell(off(azDeg, 157) / 11)
  return 1.45 * (1 - 0.86 * rise) * (1 - 0.87 * set) * (1 - 0.34 * between) + 0.75 * left + 0.55 * right
}

const RANGES = [
  { radiusM: 2350, widthM: 560, share: 0.72, cells: 9, salt: 100 },
  { radiusM: 3550, widthM: 700, share: 0.88, cells: 7, salt: 200 },
  { radiusM: 5000, widthM: 760, share: 1.0, cells: 6, salt: 300 },
]

export interface LandAt { height: number; wood: number; hill: number }

// The bare land, without its woods.
function bare(x: number, z: number, out: LandAt): LandAt {
  const r = Math.hypot(x, z)
  const az = (Math.atan2(x, z) / RAD + 360) % 360
  const crest = crestDeg(az)
  const open = Math.min(1, crest / 1.2)
  const verge = -0.35 + 0.75 * smooth(LAND_FROM_M, 82, r)
  const basin = (6 + 20 * open) * Math.pow(smooth(140, 2400, r), 1.25)
  const roll = (fbm2(x / 520, z / 520, 10, 3) - 0.5) * 2 * (2 + 5 * open) * smooth(130, 650, r) + (fbm2(x / 1500, z / 1500, 20, 3) - 0.5) * 2 * (3 + 14 * open) * smooth(500, 1700, r)
  let hill = 0
  const wx = x + 420 * (fbm2(x / 1900, z / 1900, 30, 2) - 0.5)
  const wz = z + 420 * (fbm2(x / 1900, z / 1900, 40, 2) - 0.5)
  const wr = Math.hypot(wx, wz)
  for (const range of RANGES) {
    const turn = (az / 360) * range.cells
    const shape = 0.45 + 0.9 * (0.6 * ring(turn, range.cells, range.salt) + 0.4 * ring(turn * 2.7, Math.round(range.cells * 2.7), range.salt + 1))
    const radius = range.radiusM * (1 + 0.1 * (ring(turn * 0.6, Math.max(2, Math.round(range.cells * 0.6)), range.salt + 2) - 0.5))
    const top = radius * Math.tan(crest * range.share * shape * RAD)
    const across = (wr - radius) / range.widthM
    const body = across < 0 ? bell(across * 1.15) : bell(across * 1.5)
    hill = Math.max(hill, top * body)
  }
  hill *= 0.82 + 0.36 * fbm2(x / 760, z / 760, 50, 3)
  out.hill = hill
  out.height = verge + basin + roll * (1 - 0.6 * smooth(10, 60, hill)) + hill
  out.wood = 0
  return out
}

function ring(turn: number, cells: number, salt: number): number {
  const i = Math.floor(turn)
  const f = turn - i
  const s = f * f * (3 - 2 * f)
  const a = lattice(((i % cells) + cells) % cells, 7, salt)
  const b = lattice((((i + 1) % cells) + cells) % cells, 7, salt)
  return a + (b - a) * s
}

// Woods: on the hills, and in a few copses on the open land well beyond the field.
export function woodAt(x: number, z: number, hill: number): number {
  const r = Math.hypot(x, z)
  const patch = fbm2(x / 640, z / 640, 60, 3)
  const onHill = smooth(14, 42, hill) * smooth(0.3, 0.5, patch + 0.25 * smooth(40, 120, hill))
  const az = (Math.atan2(x, z) / RAD + 360) % 360
  const clear = 1 - 0.85 * Math.max(bell(off(az, SUNRISE_DEG) / 7), bell(off(az, SUNSET_DEG) / 5))
  const copse = smooth(0.66, 0.72, fbm2(x / 330, z / 330, 70, 2)) * smooth(520, 800, r) * clear
  return Math.max(onHill, copse)
}

export const CANOPY_M = 15

const scratch: LandAt = { height: 0, wood: 0, hill: 0 }

// The land with its woods standing on it: what the terrain mesh is made of.
export function landAt(x: number, z: number, out: LandAt = scratch): LandAt {
  bare(x, z, out)
  out.wood = woodAt(x, z, out.hill)
  const crowns = 0.72 + 0.28 * noise2(x / 11, z / 11, 80) + 0.12 * (noise2(x / 4.3, z / 4.3, 81) - 0.5)
  out.height += CANOPY_M * smooth(0.4, 0.6, out.wood) * crowns
  return out
}

// The soil a tree or a hedge stands on.
export function soilAt(x: number, z: number): number {
  return bare(x, z, scratch).height
}

// The fields: long strips, cut across into fields, in a gently bent frame. The shader draws the same cut from the same numbers.
// The strips lie across the way the lens looks, so they are crossed one after another on the way to the hills.
export const FIELDS = { stripM: 150, lengthM: 420, acrossDeg: 199, bendM: [46, 70], waveM: [560, 830] }
const TURN = FIELDS.acrossDeg * RAD
export const fieldAxes = { ux: Math.sin(TURN), uz: Math.cos(TURN), vx: Math.cos(TURN), vz: -Math.sin(TURN) }

export function fieldHash(i: number, j: number, salt: number): number {
  return hash32(((i + 32768) ^ hash32(((j + 32768) ^ (salt << 20)) >>> 0)) >>> 0) / 4294967296
}

// Where the edge between strip i - 1 and strip i lies, and the edge between field j - 1 and field j of strip i, in units of a strip and of a field.
export const stripEdge = (i: number): number => i + 0.5 * (fieldHash(i, 0, 1) - 0.5)
export const fieldEdge = (i: number, j: number): number => j + fieldHash(i, 0, 2) + 0.6 * (fieldHash(i, j, 3) - 0.5)

// From a point in the frame of the fields, in meters, to the land.
export function fromFields(u: number, v: number): { x: number; z: number } {
  let u0 = u
  let v0 = v
  for (let k = 0; k < 8; k++) {
    v0 = v - FIELDS.bendM[1] * Math.sin(u0 / FIELDS.waveM[1] + 2.1)
    u0 = u - FIELDS.bendM[0] * Math.sin(v0 / FIELDS.waveM[0] + 0.7)
  }
  return { x: u0 * fieldAxes.ux + v0 * fieldAxes.vx, z: u0 * fieldAxes.uz + v0 * fieldAxes.vz }
}

export function toFields(x: number, z: number): { u: number; v: number } {
  const u0 = x * fieldAxes.ux + z * fieldAxes.uz
  const v0 = x * fieldAxes.vx + z * fieldAxes.vz
  return { u: u0 + FIELDS.bendM[0] * Math.sin(v0 / FIELDS.waveM[0] + 0.7), v: v0 + FIELDS.bendM[1] * Math.sin(u0 / FIELDS.waveM[1] + 2.1) }
}
