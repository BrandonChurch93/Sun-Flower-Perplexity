import { config, frameCount } from '../../../src/config.ts'
import type { Moment } from '../../../src/v2/api.ts'
import { barAt, barTime, hitFrame } from '../../../src/v2/clock.ts'
import { blankMoment, momentAt } from '../../../src/v2/now.ts'

export const FPS = config.film.fps
export const FRAMES = frameCount
export const FRAME = 1 / FPS
export const secondsOf = (frame: number): number => frame / FPS

export interface Instant { t: number; bar: number; tau: number; sunElevationDeg: number; flash: number; rain: number; burst: number }

// What a check reads the film through. The checks never read the clock any other way, so a broken film can be put in its place.
export interface Clock { name: string; at(seconds: number): Instant }

const scratch: Moment = blankMoment()

export const filmClock: Clock = {
  name: 'the film',
  at(seconds) {
    const m = momentAt(seconds, scratch)
    return { t: seconds, bar: m.bar, tau: m.tau, sunElevationDeg: m.sunElevationDeg, flash: m.dials.flash, rain: m.dials.rain, burst: m.dials.burst }
  },
}

export interface Hold { id: string; name: string; fromBar: number; toBar: number; first: number; last: number }

// A hold owns the frames from the one that holds its first bar line to the one before the frame that holds its last.
export const holds: Hold[] = config.sections
  .filter((s) => s.kind === 'hold')
  .map((s) => ({ id: s.id, name: s.name, fromBar: s.fromBar, toBar: s.toBar, first: hitFrame(s.fromBar), last: hitFrame(s.toBar) - 1 }))

export function inHold(seconds: number): Hold | null {
  for (const h of holds) if (seconds >= secondsOf(h.first) && seconds <= secondsOf(h.last)) return h
  return null
}

// Films that break one rule each, to prove that the check of that rule fails.
export const broken: Record<string, (film: Clock) => Clock> = {
  // The plant gains a little on every frame of the storm hold.
  'hold-grows': (film) => ({
    name: 'a film whose storm hold grows',
    at(seconds) {
      const i = film.at(seconds)
      const h = holds[holds.length - 1]
      const into = Math.min(seconds, secondsOf(h.last)) - secondsOf(h.first)
      return into > 0 ? { ...i, tau: i.tau + 0.02 * into } : i
    },
  }),
  // The plant creeps by a thousandth of its clock over the frost hold: too little to see in one frame.
  'hold-creeps': (film) => ({
    name: 'a film whose frost hold creeps',
    at(seconds) {
      const i = film.at(seconds)
      const h = holds[0]
      const into = Math.min(seconds, secondsOf(h.last)) - secondsOf(h.first)
      return into > 0 ? { ...i, tau: i.tau + 0.0001 * into } : i
    },
  }),
  // The second night stands still for three seconds.
  'long-night': (film) => ({
    name: 'a film with a night of three seconds',
    at(seconds) {
      const from = barTime(8.93)
      const warped = seconds < from ? seconds : seconds < from + 3 ? from : seconds - 3
      return { ...film.at(warped), t: seconds }
    },
  }),
  // Everything arrives three frames late.
  late: (film) => ({
    name: 'a film that runs three frames late',
    at(seconds) {
      return { ...film.at(seconds - 3 * FRAME), t: seconds }
    },
  }),
  // The lightning comes two frames after its bar line.
  'flash-late': (film) => ({
    name: 'a film whose lightning is two frames late',
    at(seconds) {
      return { ...film.at(seconds), flash: film.at(seconds - 2 * FRAME).flash }
    },
  }),
  // The frost hold lets go one frame early: its last frame already grows.
  'hold-early': (film) => ({
    name: 'a film whose frost hold ends one frame early',
    at(seconds) {
      const i = film.at(seconds)
      const from = secondsOf(holds[0].last)
      return seconds >= from - 1e-9 ? { ...i, tau: i.tau + 1e-4 * Math.min(seconds - from + 0.25 * FRAME, 2 * FRAME) } : i
    },
  }),
  // The frost hold lets go one frame late: the frame after the one that holds its closing bar line still stands.
  'hold-late': (film) => ({
    name: 'a film whose frost hold ends one frame late',
    at(seconds) {
      const h = holds[0]
      const from = secondsOf(h.last + 1)
      if (seconds < from - 1e-9) return film.at(seconds)
      return seconds < from + 2 * FRAME - 1e-9 ? { ...film.at(seconds), tau: film.at(secondsOf(h.first + 2)).tau } : film.at(seconds)
    },
  }),
  // The frost hold lets go half a bar early.
  'hold-short': (film) => ({
    name: 'a film whose frost hold ends half a bar early',
    at(seconds) {
      const i = film.at(seconds)
      const h = holds[0]
      const from = barTime(h.toBar - 0.5)
      return seconds > from && seconds <= barTime(h.toBar) ? { ...i, tau: i.tau + 0.4 * (seconds - from) } : i
    },
  }),
}

export function clockOf(name: string | null): Clock {
  if (!name) return filmClock
  const make = broken[name]
  if (!make) throw new Error(`unknown --break "${name}". One of: ${Object.keys(broken).join(', ')}`)
  return make(filmClock)
}

// The film second at which `value` crosses `level` between two seconds, by halving.
export function crossing(value: (seconds: number) => number, lo: number, hi: number, level = 0): number {
  const rising = value(hi) > value(lo)
  let a = lo
  let b = hi
  for (let i = 0; i < 50; i++) {
    const mid = 0.5 * (a + b)
    if (value(mid) > level === rising) b = mid
    else a = mid
  }
  return 0.5 * (a + b)
}

export const nearestBar = (seconds: number): number => Math.round(barAt(seconds))
export const clockText = (seconds: number): string => `${seconds.toFixed(3)} s`
export const barText = (seconds: number): string => `bar ${barAt(seconds).toFixed(2)}`
export { barAt, barTime, hitFrame }

export const FLASH_STEP = 0.2

// The frames on which the film's own lightning dial jumps: there the picture is meant to jump.
export function lightningFrames(): Set<number> {
  const out = new Set<number>()
  for (let f = 1; f < FRAMES; f++) if (Math.abs(filmClock.at(secondsOf(f)).flash - filmClock.at(secondsOf(f - 1)).flash) > FLASH_STEP) out.add(f)
  return out
}
