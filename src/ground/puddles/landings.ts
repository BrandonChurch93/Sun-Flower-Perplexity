import { RAIN_FINE_SERIES, RAIN_SERIES, cellOf, dropOf, fallDir, firstIndexFrom, rainSpan, scanLandings } from '../../weather/rain/drops.ts'

export const LANDING_FLOATS = 4

// The window before and after a frame's own in which a drop is looked for at y = 0, since it meets the water a little off that instant.
const SLACK_S = 0.01

const job: { cx: number; cz: number; half: number; y: number; from: number; to: number; out: Float32Array; n: number } = { cx: 0, cz: 0, half: 0, y: 0, from: 0, to: 0, out: new Float32Array(0), n: 0 }

function take(x: number, z: number, time: number, radius: number, speed: number): void {
  const run = job.y / fallDir[1]
  const hx = x + fallDir[0] * run
  const hz = z + fallDir[2] * run
  const at = time + run / speed
  if (at < job.from || at >= job.to || Math.abs(hx - job.cx) > job.half || Math.abs(hz - job.cz) > job.half || job.n >= job.out.length / LANDING_FLOATS) return
  const o = job.n * LANDING_FLOATS
  job.out[o] = hx
  job.out[o + 1] = hz
  job.out[o + 2] = at
  job.out[o + 3] = radius
  job.n++
}

// Every drop that meets the level `y` inside the square of this half size round (cx, cz) with from <= time < to: x, z, the second it lands, its radius.
export function landings(cx: number, cz: number, half: number, y: number, from: number, to: number, out: Float32Array): number {
  job.cx = cx
  job.cz = cz
  job.half = half
  job.y = y
  job.from = from
  job.to = to
  job.out = out
  job.n = 0
  const reach = half + 0.05
  scanLandings(cx - reach, cz - reach, cx + reach, cz + reach, from - SLACK_S, to + SLACK_S, take)
  return job.n
}

const FINE_FLOATS = 5

// The fine rain over one patch of ground, worked out once at load and kept in the order it lands. `near` says where it is kept, a little wider than any frame will ask.
export class FineRain {
  // x, z, landing second at y = 0, radius, speed.
  private readonly at: Float64Array

  constructor(x0: number, z0: number, x1: number, z1: number, near: (x: number, z: number) => boolean) {
    const [t0, t1] = rainSpan()
    const [i0, j0] = cellOf(x0, z0)
    const [i1, j1] = cellOf(x1, z1)
    const found: number[][] = []
    if (t1 > t0) {
      for (let j = j0; j <= j1; j++) {
        for (let i = i0; i <= i1; i++) {
          for (let s = RAIN_SERIES; s < RAIN_SERIES + RAIN_FINE_SERIES; s++) {
            const last = firstIndexFrom(i, j, s, t1)
            for (let k = firstIndexFrom(i, j, s, t0); k <= last; k++) {
              const drop = dropOf(i, j, s, k)
              if (drop && near(drop.x, drop.z)) found.push([drop.time, drop.x, drop.z, drop.radius, drop.speed])
            }
          }
        }
      }
    }
    found.sort((a, b) => a[0] - b[0])
    this.at = new Float64Array(found.length * FINE_FLOATS)
    found.forEach((d, n) => this.at.set([d[1], d[2], d[0], d[3], d[4]], n * FINE_FLOATS))
  }

  // Its drops of at least the radius `least` that meet the level `y` where `keep` says so with from <= time < to, written after the first `start` drops of `out`. Returns the new count.
  landings(keep: (x: number, z: number) => boolean, y: number, from: number, to: number, out: Float32Array, start: number, least = 0): number {
    const at = this.at
    const count = at.length / FINE_FLOATS
    const max = out.length / LANDING_FLOATS
    const run = y / fallDir[1]
    let low = 0
    let high = count
    while (low < high) {
      const mid = (low + high) >> 1
      if (at[mid * FINE_FLOATS + 2] < from - SLACK_S) low = mid + 1
      else high = mid
    }
    let n = start
    for (let k = low; k < count; k++) {
      const o = k * FINE_FLOATS
      if (at[o + 2] >= to + SLACK_S) break
      if (at[o + 3] < least) continue
      const hx = at[o] + fallDir[0] * run
      const hz = at[o + 1] + fallDir[2] * run
      const hit = at[o + 2] + run / at[o + 4]
      if (hit < from || hit >= to || n >= max || !keep(hx, hz)) continue
      const w = n * LANDING_FLOATS
      out[w] = hx
      out[w + 1] = hz
      out[w + 2] = hit
      out[w + 3] = at[o + 3]
      n++
    }
    return n
  }
}
