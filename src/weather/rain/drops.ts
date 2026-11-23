import { combine, streamSeed } from '../../core/random.ts'
import { barAt, barTime, rainAtBar } from '../../v2/clock.ts'
import { WIND_TOWARD_DEG } from '../../v2/wind.ts'

// Every raindrop of the film, in closed form. The ground plane y = 0 is cut into square cells; each cell owns a few series of drops,
// and each series lands one drop per period at a fresh place inside the cell. The streaks in the air and every landing read from here.

export interface Drop {
  // Unique to the drop, for a reader's own seeded variation.
  id: number
  // Where its path meets the plane y = 0, in metres.
  x: number
  z: number
  // The film second at which it reaches y = 0.
  time: number
  // Of the drop itself, in metres.
  radius: number
  // Along `fallDir`, in metres a second.
  speed: number
}

export const RAIN_CELL_M = 0.25
// The first series of a cell carry the heavy drops, the ones that splash. The rest carry the fine rain between them.
export const RAIN_SERIES = 24
export const RAIN_FINE_SERIES = 620

const SLANT_DEG = 25
// The tangent of the slant in still air, what the storm's wind adds to it and what the front of a gust adds to that: 22 to 28 degrees in the storm.
export const SLANT_CALM = Math.tan((6 * Math.PI) / 180)
export const SLANT_WIND = Math.tan((22 * Math.PI) / 180) - SLANT_CALM
export const SLANT_GUST = Math.tan((28 * Math.PI) / 180) - Math.tan((22 * Math.PI) / 180)
// The rain leans the way the wind goes.
const LEAN_TOWARD_DEG = WIND_TOWARD_DEG
const PERIOD_MIN_S = 0.9
const PERIOD_MAX_S = 1.6
const RADIUS_MIN_M = 0.0005
const RADIUS_MAX_M = 0.0022
const FINE_MIN_M = 0.0001
const FINE_MAX_M = 0.0003
const SEED = streamSeed('rain drops')
const UNIT = 1 / 4294967296

const slant = (SLANT_DEG * Math.PI) / 180
const lean = (LEAN_TOWARD_DEG * Math.PI) / 180
export const LEAN_X = Math.sin(lean)
export const LEAN_Z = Math.cos(lean)

// The direction every drop travels in: down, with a slant.
export const fallDir: readonly [number, number, number] = [Math.sin(lean) * Math.sin(slant), -Math.cos(slant), Math.cos(lean) * Math.sin(slant)]

// The rain dial at a film second.
export function rainAt(time: number): number {
  return rainAtBar(barAt(time))
}

// How hard it rains at a film second, 0 to 1, with slow swells in it. A drop exists when its rank is under this at its landing.
export function rainStrength(time: number): number {
  const rain = rainAt(time)
  if (rain <= 0) return 0
  const swell = 0.5 + 0.5 * Math.sin(time * 0.83 + 1.3 + 0.9 * Math.sin(time * 0.37))
  return rain * rain * (0.7 + 0.3 * swell)
}

function seriesSeed(i: number, j: number, s: number): number {
  return combine(combine(combine(SEED, i | 0), j | 0), s)
}

function periodOf(seed: number): number {
  return PERIOD_MIN_S + (PERIOD_MAX_S - PERIOD_MIN_S) * combine(seed, 1) * UNIT
}

function phaseOf(seed: number): number {
  return combine(seed, 2) * UNIT
}

// The terminal speed of a drop of this radius in still air (Atlas and others, 1973).
export function fallSpeed(radius: number): number {
  return 9.65 - 10.3 * Math.exp(-1200 * radius)
}

// The n-th drop of series `s` in cell (i, j), or null where the rain is too thin for it to fall. Series from RAIN_SERIES up are the fine rain.
export function dropOf(i: number, j: number, s: number, n: number): Drop | null {
  const seed = seriesSeed(i, j, s)
  const time = (n + phaseOf(seed)) * periodOf(seed)
  const id = combine(seed, n | 0)
  if (combine(id, 5) * UNIT > rainStrength(time)) return null
  const size = combine(id, 3) * UNIT
  const radius = s < RAIN_SERIES ? RADIUS_MIN_M + (RADIUS_MAX_M - RADIUS_MIN_M) * size * size : FINE_MIN_M + (FINE_MAX_M - FINE_MIN_M) * size * size * size
  return { id, x: (i + combine(id, 1) * UNIT) * RAIN_CELL_M, z: (j + combine(id, 2) * UNIT) * RAIN_CELL_M, time, radius, speed: fallSpeed(radius) }
}

// The index of the first drop of a series that lands at or after `time`.
export function firstIndexFrom(i: number, j: number, s: number, time: number): number {
  const seed = seriesSeed(i, j, s)
  return Math.ceil(time / periodOf(seed) - phaseOf(seed))
}

// How often a series lands a drop, in seconds.
export function seriesPeriod(i: number, j: number, s: number): number {
  return periodOf(seriesSeed(i, j, s))
}

export function cellOf(x: number, z: number): [number, number] {
  return [Math.floor(x / RAIN_CELL_M), Math.floor(z / RAIN_CELL_M)]
}

// The heavy drops of the whole film round the plant are worked out once, at load, and kept by cell in the order they land: a frame then only reads the few that land within its window.
const TABLE_HALF_CELLS = 16
const TABLE_SIDE = 2 * TABLE_HALF_CELLS
const TABLE_FLOATS = 5
interface Table {
  // Where each cell's drops start in `at`, in drops; one more entry than there are cells.
  start: Int32Array
  // x, z, landing second, radius, speed.
  at: Float64Array
  ids: Uint32Array
}
let table: Table | null = null

// The first and the last film second on which rain falls.
export function rainSpan(): [number, number] {
  let first = Infinity
  let last = -Infinity
  for (let b = 0; b < 120; b += 1 / 64) {
    if (rainAtBar(b) <= 0) continue
    if (first === Infinity) first = barTime(b - 1 / 64)
    last = barTime(b + 1 / 64)
  }
  return [first, last]
}

function buildTable(): Table {
  const [t0, t1] = rainSpan()
  const start = new Int32Array(TABLE_SIDE * TABLE_SIDE + 1)
  const all: number[] = []
  const ids: number[] = []
  const cell: number[][] = []
  for (let c = 0; c < TABLE_SIDE * TABLE_SIDE; c++) {
    const i = (c % TABLE_SIDE) - TABLE_HALF_CELLS
    const j = Math.floor(c / TABLE_SIDE) - TABLE_HALF_CELLS
    cell.length = 0
    if (t1 > t0) {
      for (let s = 0; s < RAIN_SERIES; s++) {
        const seed = seriesSeed(i, j, s)
        const period = periodOf(seed)
        const phase = phaseOf(seed)
        for (let n = Math.ceil(t0 / period - phase); (n + phase) * period < t1; n++) {
          const drop = dropOf(i, j, s, n)
          if (drop) cell.push([drop.time, drop.x, drop.z, drop.radius, drop.speed, drop.id])
        }
      }
    }
    cell.sort((a, b) => a[0] - b[0])
    for (const d of cell) {
      all.push(d[1], d[2], d[0], d[3], d[4])
      ids.push(d[5])
    }
    start[c + 1] = ids.length
  }
  return { start, at: Float64Array.from(all), ids: Uint32Array.from(ids) }
}

// Call at load, so no frame pays for the table.
export function prepareDrops(): void {
  table ??= buildTable()
}

// The first drop of a run of the table that lands at or after `time`.
function firstFrom(at: Float64Array, low: number, high: number, time: number): number {
  while (low < high) {
    const mid = (low + high) >> 1
    if (at[mid * TABLE_FLOATS + 2] < time) low = mid + 1
    else high = mid
  }
  return low
}

export type Landing = (x: number, z: number, time: number, radius: number, speed: number) => void

// Every heavy drop that reaches y = 0 inside the square from (x0, z0) to (x1, z1) with from <= time < to is handed to `visit`. No drop is made for it.
export function scanLandings(x0: number, z0: number, x1: number, z1: number, from: number, to: number, visit: Landing): void {
  const t = (table ??= buildTable())
  const [i0, j0] = cellOf(x0, z0)
  const [i1, j1] = cellOf(x1, z1)
  for (let j = j0; j <= j1; j++) {
    for (let i = i0; i <= i1; i++) {
      if (i < -TABLE_HALF_CELLS || i >= TABLE_HALF_CELLS || j < -TABLE_HALF_CELLS || j >= TABLE_HALF_CELLS) {
        for (const d of landingsInCell(i, j, from, to)) if (d.x >= x0 && d.x <= x1 && d.z >= z0 && d.z <= z1) visit(d.x, d.z, d.time, d.radius, d.speed)
        continue
      }
      const c = (j + TABLE_HALF_CELLS) * TABLE_SIDE + i + TABLE_HALF_CELLS
      const end = t.start[c + 1]
      for (let k = firstFrom(t.at, t.start[c], end, from); k < end; k++) {
        const o = k * TABLE_FLOATS
        if (t.at[o + 2] >= to) break
        const x = t.at[o]
        const z = t.at[o + 1]
        if (x >= x0 && x <= x1 && z >= z0 && z <= z1) visit(x, z, t.at[o + 2], t.at[o + 3], t.at[o + 4])
      }
    }
  }
}

// Every drop that reaches y = 0 inside cell (i, j) with from <= time < to, appended to `out`.
export function landingsInCell(i: number, j: number, from: number, to: number, out: Drop[] = []): Drop[] {
  if (i >= -TABLE_HALF_CELLS && i < TABLE_HALF_CELLS && j >= -TABLE_HALF_CELLS && j < TABLE_HALF_CELLS) {
    const t = (table ??= buildTable())
    const c = (j + TABLE_HALF_CELLS) * TABLE_SIDE + i + TABLE_HALF_CELLS
    const end = t.start[c + 1]
    for (let k = firstFrom(t.at, t.start[c], end, from); k < end; k++) {
      const o = k * TABLE_FLOATS
      if (t.at[o + 2] >= to) break
      out.push({ id: t.ids[k], x: t.at[o], z: t.at[o + 1], time: t.at[o + 2], radius: t.at[o + 3], speed: t.at[o + 4] })
    }
    return out
  }
  for (let s = 0; s < RAIN_SERIES; s++) {
    const seed = seriesSeed(i, j, s)
    const period = periodOf(seed)
    const phase = phaseOf(seed)
    for (let n = Math.ceil(from / period - phase); (n + phase) * period < to; n++) {
      const drop = dropOf(i, j, s, n)
      if (drop && drop.time >= from) out.push(drop)
    }
  }
  return out
}

// Every drop that reaches y = 0 within `reach` metres of (x, z) with from <= time < to, appended to `out`.
export function landingsNear(x: number, z: number, reach: number, from: number, to: number, out: Drop[] = []): Drop[] {
  const [i0, j0] = cellOf(x - reach, z - reach)
  const [i1, j1] = cellOf(x + reach, z + reach)
  const start = out.length
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) landingsInCell(i, j, from, to, out)
  let kept = start
  for (let k = start; k < out.length; k++) {
    const d = out[k]
    if ((d.x - x) * (d.x - x) + (d.z - z) * (d.z - z) <= reach * reach) out[kept++] = d
  }
  out.length = kept
  return out
}

// Where the drop is at a film second, on its straight path. Past its landing the path runs on below y = 0.
export function dropAt(drop: Drop, time: number, out: [number, number, number] = [0, 0, 0]): [number, number, number] {
  const run = drop.speed * (time - drop.time)
  out[0] = drop.x + fallDir[0] * run
  out[1] = fallDir[1] * run
  out[2] = drop.z + fallDir[2] * run
  return out
}

// Where and when the drop passes the height y, for a leaf or a puddle that is not at y = 0.
export function dropCrossing(drop: Drop, y: number): { x: number; z: number; time: number } {
  const run = y / fallDir[1]
  return { x: drop.x + fallDir[0] * run, z: drop.z + fallDir[2] * run, time: drop.time + run / drop.speed }
}
