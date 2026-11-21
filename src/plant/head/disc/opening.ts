// When each floret of the disc opens: a ring that starts at the rim once the rays are out and moves toward the middle, fast at first and then slowly.
import { config } from '../../../config.ts'
import { Monotone, clamp, smoothstep } from '../../../core/curves.ts'
import { RAY_FIRST } from '../../growth.ts'

const [bloom0, bloom1] = config.plant.stages.bloom
const end = config.film.durationSeconds

// The outermost floret stands at this share of the head's radius.
export const RIM_SHARE = 0.93
// The bud is closed over the disc before this.
export const SHOWN_FROM = bloom0 - 5
// The side of the head whose rays open first, as an angle round the axis. The disc leads there too.
export const FIRST_SIDE = RAY_FIRST

// No floret starts to open before this.
export const FIRST_OPEN = bloom0 + 5

// The film time at which a floret at a share rho of the radius starts to open, and at which its anthers stand full of pollen.
const startAt = new Monotone([
  [0, end + 20],
  [0.36, end],
  [0.66, bloom1 - 0.5],
  [RIM_SHARE, FIRST_OPEN],
])
const openAt = new Monotone([
  [0, end + 26],
  [0.25, end + 12],
  [0.5, end],
  [0.77, bloom1 - 0.5],
  [RIM_SHARE, bloom0 + 6.6],
])

export function schedule(rho: number): { start: number; length: number } {
  const r = clamp(rho, 0, RIM_SHARE)
  const start = startAt.at(r)
  return { start, length: Math.max(1.2, openAt.at(r) - start) }
}

function reached(curve: Monotone, time: number): number {
  let lo = 0
  let hi = RIM_SHARE
  if (curve.at(hi) > time) return 1
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2
    if (curve.at(mid) > time) lo = mid
    else hi = mid
  }
  return hi
}

// How far in the ring has come at a time: the share of the radius where florets start to open, and where they stand open.
export function fronts(time: number): { start: number; open: number } {
  return { start: reached(startAt, time), open: reached(openAt, time) }
}

// The rim starts to lose its young green at this time. The middle follows a few seconds later.
export const RIPE_FROM = bloom0 + 3.5

// 1 while the bud is young and its florets green, 0 once the disc has its grown colors.
export function youth(time: number): number {
  return 1 - smoothstep(RIPE_FROM, bloom1 - 0.5, time)
}

// How much the folded rays and the bracts still shade the face of the bud, 1 to 0.
export function cover(time: number): number {
  return 1 - smoothstep(bloom0 + 0.5, bloom0 + 6.6, time)
}
