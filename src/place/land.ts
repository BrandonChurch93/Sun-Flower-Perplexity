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

// Where the sun comes up and where it goes down on the last day. The hills fall to a saddle at both.

// How high the hills may stand above the horizon, in degrees seen from the plant, bearing by bearing. The sun comes up between 175 and 187 over the days of the film and goes down between 198 and 226: a wide flat saddle for the mornings, a long ridge that falls to a second saddle for the evenings, the last one lowest.
const CREST: [number, number][] = [
  [100, 1.5], [128, 1.7], [150, 2.0], [162, 1.7], [169, 1.05], [174, 0.24], [188, 0.24], [193, 0.8], [198, 1.15], [214, 1.15], [219, 0.8], [223, 0.12], [228.5, 0.12], [235, 0.9], [244, 1.7], [255, 2.0], [275, 1.7], [300, 1.5], [460, 1.5],
]

export function crestDeg(azDeg: number): number {
  const az = azDeg < 100 ? azDeg + 360 : azDeg
  for (let i = 1; i < CREST.length; i++) {
    if (az <= CREST[i][0]) return CREST[i - 1][1] + (CREST[i][1] - CREST[i - 1][1]) * smooth(CREST[i - 1][0], CREST[i][0], az)
  }
  return 1.5
}

// One in the two saddles the sun uses, nothing where the hills stand.
export function gateAt(azDeg: number): number {
  return 1 - smooth(0.26, 0.8, crestDeg(azDeg))
}

// The nearest range is the dark ridge behind the field: it stands highest and most even, the two behind it show over its dips.
const RANGES = [
  { radiusM: 2350, widthM: 520, share: 1.0, even: 0.55, floorDeg: 0.34, cells: 13, salt: 100 },
  { radiusM: 3550, widthM: 660, share: 0.85, even: 0, floorDeg: 0.24, cells: 10, salt: 200 },
  { radiusM: 5000, widthM: 740, share: 0.95, even: 0, floorDeg: 0.42, cells: 8, salt: 300 },
]

export interface LandAt { height: number; wood: number; hill: number }

// The planted field, as its owner lays it out: a wedge that opens away from the plant toward depthDeg, to endM.
export const PLANTED = { depthDeg: 200, endM: 290, west: [13, 1.8], east: [10, 1.05], underM: -0.35, rampM: 22, sideM: 30 }
const DEPTH = { x: Math.sin(PLANTED.depthDeg * RAD), z: Math.cos(PLANTED.depthDeg * RAD) }
const ACROSS = { x: Math.sin((PLANTED.depthDeg - 90) * RAD), z: Math.cos((PLANTED.depthDeg - 90) * RAD) }

// 1 where the planted field stands, falling to 0 just past its far end and its sides.
export function plantedAt(x: number, z: number): number {
  const depth = x * DEPTH.x + z * DEPTH.z
  const across = x * ACROSS.x + z * ACROSS.z
  const reach = Math.max(depth, 0)
  const west = across + PLANTED.west[0] + PLANTED.west[1] * reach
  const east = PLANTED.east[0] + PLANTED.east[1] * reach - across
  const side = Math.min(west / Math.hypot(1, PLANTED.west[1]), east / Math.hypot(1, PLANTED.east[1]))
  return smooth(-PLANTED.sideM, 0, side) * smooth(-PLANTED.sideM, 0, depth) * (1 - smooth(PLANTED.endM + 2, PLANTED.endM + 2 + PLANTED.rampM, depth))
}

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
    const rough = 0.3 + 1.1 * (0.62 * ring(turn, range.cells, range.salt) + 0.38 * ring(turn * 2.7, Math.round(range.cells * 2.7), range.salt + 1))
    const shape = rough + (1 - rough) * range.even
    const radius = range.radiusM * (1 + 0.1 * (ring(turn * 0.6, Math.max(2, Math.round(range.cells * 0.6)), range.salt + 2) - 0.5))
    // The far ranges never sink to nothing: in the saddles they stay as low pale shapes behind the open land.
    const least = range.floorDeg * (0.45 + 0.7 * ring(turn * 5.3, Math.round(range.cells * 5.3), range.salt + 3) + 0.5 * ring(turn * 13.7, Math.round(range.cells * 13.7), range.salt + 4))
    const top = radius * Math.tan(Math.max(crest * range.share * shape, least) * RAD)
    const across = (wr - radius) / range.widthM
    const body = across < 0 ? bell(across * 1.15) : bell(across * 1.5)
    hill = Math.max(hill, top * body)
  }
  hill *= 0.7 + 0.6 * fbm2(x / 640, z / 640, 50, 4)
  out.hill = hill
  // Out to where the land takes its own depth it stays above the flat soil, so the soil never shows through a dip.
  const rise = basin + roll * (1 - 0.6 * smooth(10, 60, hill)) + hill
  const kept = 0.5 * (rise - 0.1 + Math.sqrt((rise + 0.1) * (rise + 0.1) + 0.04))
  const natural = verge + rise + (kept - rise) * (1 - smooth(420, 620, r))
  // Under the planted field the land lies under the soil, so the field and its soil are all there is to see.
  out.height = natural + (PLANTED.underM - natural) * plantedAt(x, z)
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
  const clear = 1 - 0.9 * gateAt(az)
  const copse = smooth(0.66, 0.72, fbm2(x / 330, z / 330, 70, 2)) * smooth(900, 1300, r) * clear
  return Math.max(onHill, copse)
}

export const CANOPY_M = 15

const scratch: LandAt = { height: 0, wood: 0, hill: 0 }

// The land with its woods standing on it: what the terrain mesh is made of.
export function landAt(x: number, z: number, out: LandAt = scratch): LandAt {
  bare(x, z, out)
  out.wood = woodAt(x, z, out.hill)
  const crowns = 0.56 + 0.44 * noise2(x / 12, z / 12, 80) + 0.16 * (noise2(x / 4.6, z / 4.6, 81) - 0.5)
  // Far off a wood is a soft swell on the ridge, not a step.
  const far = smooth(2600, 4600, Math.hypot(x, z))
  out.height += CANOPY_M * (1 - 0.5 * far) * smooth(0.4 - 0.25 * far, 0.6 + 0.3 * far, out.wood) * (crowns + (1 - crowns) * far)
  return out
}

export function landHill(x: number, z: number): number {
  return bare(x, z, scratch).hill
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

// The sunflowers go on beyond the planted field: these strips and fields round the plant are the same crop, one field with no hedge across it.
export const HOME = { strips: [-1, 1], fields: [-2, 1] }
export const isHome = (i: number, j: number): boolean => i >= HOME.strips[0] && i <= HOME.strips[1] && j >= HOME.fields[0] && j <= HOME.fields[1]

// The strip and the field a point of the fields' frame lies in.
export function cellAt(u: number, v: number): { i: number; j: number } {
  const su = u / FIELDS.stripM
  let i = Math.floor(su)
  if (su < stripEdge(i)) i -= 1
  else if (su > stripEdge(i + 1)) i += 1
  const sv = v / FIELDS.lengthM
  let j = Math.floor(sv - fieldHash(i, 0, 2))
  if (sv < fieldEdge(i, j)) j -= 1
  else if (sv > fieldEdge(i, j + 1)) j += 1
  return { i, j }
}

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
