import { config } from '../../../src/config.ts'
import { nightsOf } from '../nights.ts'
import { FPS, FRAMES, filmClock, hitFrame, lightningFrames } from './film.ts'
import { meantCuts } from './meant.ts'

// The frames a review round draws: every frame through each dusk, night and dawn, every `stride`th frame of the whole film,
// and every frame inside `CUE_FRAMES` frames of a bar line that carries a cue.
export const CUE_FRAMES = 12
export const DUSK_FRAMES = 8

export interface Twilight { night: number; first: number; last: number; sunset: number; sunrise: number }

// Each night with the frames round it: from `DUSK_FRAMES` before the sunset to `DUSK_FRAMES` after the sunrise.
export function twilights(): Twilight[] {
  return nightsOf(filmClock).map((n, i) => {
    const sunset = Math.ceil(n.from * FPS)
    const sunrise = Math.ceil(n.to * FPS)
    return { night: i + 1, first: Math.max(0, sunset - DUSK_FRAMES), last: Math.min(FRAMES - 1, sunrise + DUSK_FRAMES), sunset, sunrise }
  })
}

// The frames that hold a bar line with a cue on it: each section's first bar, each stroke of lightning, each sunrise, each hard cut the film means.
export function cueFrames(): number[] {
  const out = new Set<number>()
  for (const s of config.sections) out.add(hitFrame(s.fromBar))
  for (const f of lightningFrames()) out.add(f)
  for (const t of twilights()) if (t.sunrise < FRAMES - 1) out.add(t.sunrise)
  for (const f of meantCuts()) out.add(f)
  return [...out].filter((f) => f >= 0 && f < FRAMES).sort((a, b) => a - b)
}

// 0: a dusk, a night or a dawn. 1: on the stride. 2: beside a cue. 3: not drawn in a review round.
export function ranker(stride: number): (frame: number) => number {
  const rank = new Uint8Array(FRAMES).fill(3)
  for (const c of cueFrames()) for (let f = Math.max(0, c - CUE_FRAMES); f <= Math.min(FRAMES - 1, c + CUE_FRAMES); f++) rank[f] = 2
  for (let f = 0; f < FRAMES; f += stride) rank[f] = 1
  for (const t of twilights()) for (let f = t.first; f <= t.last; f++) rank[f] = 0
  return (frame) => rank[frame]
}

export function strideFrames(stride: number, from = 0, to = FRAMES - 1): number[] {
  const rank = ranker(stride)
  const out: number[] = []
  for (let f = from; f <= to; f++) if (rank(f) < 3) out.push(f)
  return out
}
