import { combine, streamSeed } from '../../core/random.ts'

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
export const RAIN_SERIES = 8
export const RAIN_FINE_SERIES = 620

const SLANT_DEG = 15
// The level bearing the rain leans toward: to the left of the frame at the rain's key, as in the approved image.
const LEAN_TOWARD_DEG = -80.5
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

// The direction every drop travels in: down, with a slant.
export const fallDir: readonly [number, number, number] = [Math.sin(lean) * Math.sin(slant), -Math.cos(slant), Math.cos(lean) * Math.sin(slant)]

// How hard it rains, 0.55 to 1: slow swells with a burst now and then. A drop exists when its rank is under this at its landing.
export function rainStrength(time: number): number {
  const swell = 0.5 + 0.5 * Math.sin(time * 0.83 + 1.3 + 0.9 * Math.sin(time * 0.37))
  const burst = Math.max(0, Math.sin(time * 0.52 + 0.4)) ** 6
  return 0.55 + 0.45 * Math.min(1, 0.55 * swell + 0.75 * burst + 0.2)
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

// Every drop that reaches y = 0 inside cell (i, j) with from <= time < to, appended to `out`.
export function landingsInCell(i: number, j: number, from: number, to: number, out: Drop[] = []): Drop[] {
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
