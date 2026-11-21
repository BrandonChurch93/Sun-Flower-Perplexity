import { dropCrossing, landingsNear, type Drop } from '../../weather/rain/drops.ts'

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
