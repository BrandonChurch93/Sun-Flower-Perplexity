import { RAIN_FINE_SERIES, RAIN_SERIES, cellOf, dropCrossing, dropOf, firstIndexFrom, landingsNear, seriesPeriod, type Drop } from '../../weather/rain/drops.ts'

export const LANDING_FLOATS = 4

const found: Drop[] = []

// Every drop that meets the level `y` inside the square of this half size round (cx, cz) with from <= time < to: x, z, the second it lands, its radius.
export function landings(cx: number, cz: number, half: number, y: number, from: number, to: number, out: Float32Array): number {
  found.length = 0
  landingsNear(cx, cz, half * Math.SQRT2, from - 0.01, to + 0.01, found)
  const max = out.length / LANDING_FLOATS
  let n = 0
  for (const drop of found) {
    const hit = dropCrossing(drop, y)
    if (hit.time < from || hit.time >= to || Math.abs(hit.x - cx) > half || Math.abs(hit.z - cz) > half || n >= max) continue
    out[n * 4] = hit.x
    out[n * 4 + 1] = hit.z
    out[n * 4 + 2] = hit.time
    out[n * 4 + 3] = drop.radius
    n++
  }
  return n
}

// The same for the fine rain, kept only where `keep` says so, written after the first `start` drops of `out`. Returns the new count.
export function fineLandings(x0: number, z0: number, x1: number, z1: number, keep: (x: number, z: number) => boolean, y: number, from: number, to: number, out: Float32Array, start: number): number {
  const [i0, j0] = cellOf(x0, z0)
  const [i1, j1] = cellOf(x1, z1)
  const max = out.length / LANDING_FLOATS
  let n = start
  for (let j = j0; j <= j1; j++) {
    for (let i = i0; i <= i1; i++) {
      for (let s = RAIN_SERIES; s < RAIN_SERIES + RAIN_FINE_SERIES; s++) {
        const first = firstIndexFrom(i, j, s, from - 0.01)
        const last = first + Math.ceil((to - from + 0.02) / seriesPeriod(i, j, s))
        for (let k = first; k <= last; k++) {
          const drop = dropOf(i, j, s, k)
          if (!drop) continue
          const hit = dropCrossing(drop, y)
          if (hit.time < from || hit.time >= to || n >= max || !keep(hit.x, hit.z)) continue
          out[n * 4] = hit.x
          out[n * 4 + 1] = hit.z
          out[n * 4 + 2] = hit.time
          out[n * 4 + 3] = drop.radius
          n++
        }
      }
    }
  }
  return n
}
