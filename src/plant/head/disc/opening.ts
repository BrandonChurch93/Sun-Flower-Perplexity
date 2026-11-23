import { config } from '../../../config.ts'
import { Monotone, clamp, smoothstep } from '../../../core/curves.ts'
import { RAY_FIRST } from '../../growth.ts'

const [bloom0, bloom1] = config.plant.stages.bloom
const end = config.growth.seconds

export const RIM_SHARE = 0.95
export const SHOWN_FROM = bloom0 - 5
export const FIRST_SIDE = RAY_FIRST
export const RING_SHARE = 0.925
export const FIRST_OPEN = bloom0 + 4.65
const OPENING_S = 0.85

const startAt = new Monotone([
  [0, end + 20],
  [0.36, end],
  [0.50, bloom1 + 1.05],
  [0.63, bloom1],
  [0.78, bloom0 + 6.4],
  [RING_SHARE, FIRST_OPEN],
])
const openAt = new Monotone([
  [0, end + 20 + OPENING_S],
  [0.36, end + OPENING_S],
  [0.50, bloom1 + 1.05 + OPENING_S],
  [0.63, bloom1 + OPENING_S],
  [0.78, bloom0 + 6.4 + OPENING_S],
  [RING_SHARE, FIRST_OPEN + OPENING_S],
])

export function schedule(rho: number): { start: number; length: number } {
  const r = clamp(rho, 0, RING_SHARE)
  const start = startAt.at(r)
  return { start, length: Math.max(0.8 * OPENING_S, openAt.at(r) - start) }
}

function reached(curve: Monotone, time: number): number {
  let lo = 0
  let hi = RING_SHARE
  if (curve.at(hi) > time) return 1
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2
    if (curve.at(mid) > time) lo = mid
    else hi = mid
  }
  return hi
}

export function fronts(time: number): { start: number; open: number } {
  return { start: reached(startAt, time), open: reached(openAt, time) }
}

export const RIPE_FROM = bloom0 + 4.2
export const RIPENS_S = [0.85, 0.25]

export function youth(time: number): number {
  return 1 - smoothstep(RIPE_FROM, bloom1 - 0.3, time)
}

export function cover(time: number): number {
  return 1 - smoothstep(bloom0 + 0.5, bloom0 + 6.4, time)
}
