import { config } from '../config.ts'
import { Monotone, clamp, lerp } from '../core/curves.ts'

const M = config.music
const G = config.growth
const FPS = config.film.fps

export const BAR1 = M.bar1Seconds
export const BEATS = M.beatsPerBar
export const BAR = (60 / M.bpm) * BEATS
export const END = config.film.durationSeconds
// The share of a day with the sun up, and the sun's height at noon in degrees.
export const DAY = 0.86
export const NOON_DEG = 62
export const MIDNIGHT_DEG = -14

export function barTime(bar: number, beat = 1): number {
  return BAR1 + (bar - 1) * BAR + ((beat - 1) * BAR) / BEATS
}

export function barAt(seconds: number): number {
  return (seconds - BAR1) / BAR + 1
}

// A sharp event starts on the frame that holds its beat, never on the one after.
export function hitFrame(bar: number, beat = 1): number {
  return Math.floor(barTime(bar, beat) * FPS + 1e-6)
}

export function hitTime(bar: number, beat = 1): number {
  return hitFrame(bar, beat) / FPS
}

export function hitBar(bar: number, beat = 1): number {
  return barAt(hitTime(bar, beat))
}

const B0 = barAt(0)
const BEND = barAt(END)

const smooth = (x: number): number => {
  const t = clamp(x)
  return t * t * (3 - 2 * t)
}

function hermite(b: number, b0: number, w0: number, m0: number, b1: number, w1: number, m1: number): number {
  const d = b1 - b0
  const u = clamp((b - b0) / d)
  const u2 = u * u
  const u3 = u2 * u
  return (2 * u3 - 3 * u2 + 1) * w0 + (u3 - 2 * u2 + u) * d * m0 + (-2 * u3 + 3 * u2) * w1 + (u3 - u2) * d * m1
}

// Position under a speed that ramps up over `rampIn`, runs flat and ramps down over `rampOut`. 0 to 1 gives 0 to 1.
export function trapezoid(x: number, rampIn: number, rampOut: number): number {
  const u = clamp(x)
  const area = 1 - rampIn / 2 - rampOut / 2
  let p: number
  if (u < rampIn) p = (u * u) / (2 * rampIn)
  else if (u <= 1 - rampOut) p = rampIn / 2 + (u - rampIn)
  else p = area - ((1 - u) * (1 - u)) / (2 * rampOut)
  return p / area
}

// The sun's height through a day: it lingers low at both ends and runs fast across the top. It crosses the horizon at one speed,
// so dusk and dawn dim and brighten evenly, and it runs fast across midnight as it does across noon.
const LOW_DAY = 0.35
const LOW_NIGHT = (LOW_DAY * NOON_DEG * (1 - DAY)) / (DAY * -MIDNIGHT_DEG)
export function sunElevationOfPhase(phase: number): number {
  if (phase >= DAY) {
    const s = Math.sin((Math.PI * (phase - DAY)) / (1 - DAY))
    return MIDNIGHT_DEG * (LOW_NIGHT * s + (1 - LOW_NIGHT) * s * s)
  }
  const s = Math.sin((Math.PI * phase) / DAY)
  return NOON_DEG * (LOW_DAY * s + (1 - LOW_DAY) * s * s)
}

// How long after sunset, in days, the sun stands `degrees` under the horizon.
function sinceSunset(degrees: number): number {
  let lo = DAY
  let hi = DAY + (1 - DAY) / 2
  for (let i = 0; i < 48; i++) {
    const mid = 0.5 * (lo + hi)
    if (sunElevationOfPhase(mid) > -degrees) lo = mid
    else hi = mid
  }
  return 0.5 * (lo + hi) - DAY
}

// The phase of the day at which the sun stands `degrees` high, before noon or after it.
export function phaseOfElevation(degrees: number, afternoon: boolean): number {
  let lo = 0
  let hi = DAY / 2
  for (let i = 0; i < 48; i++) {
    const mid = 0.5 * (lo + hi)
    if (sunElevationOfPhase(mid) < degrees) lo = mid
    else hi = mid
  }
  const morning = 0.5 * (lo + hi)
  return afternoon ? DAY - morning : morning
}

// The sun's height at the marks the film is built on, in degrees.
export const SUN = { frostFrom: 1.6, frostMid: 3.6, frostEnd: 6.5, stormFrom: 16, stormTo: 11.5, bloom: 8, open: 5, crane: 3, last: 0 } as const

const W_FROST_FROM = 4 + phaseOfElevation(SUN.frostFrom, false)
const W_FROST_MID = 4 + phaseOfElevation(SUN.frostMid, false)
const W_FROST_END = 4 + phaseOfElevation(SUN.frostEnd, false)
const W_STORM_FROM = 7 + phaseOfElevation(SUN.stormFrom, true)
const W_STORM_TO = 7 + phaseOfElevation(SUN.stormTo, true)
const STORM_RATE = (W_STORM_TO - W_STORM_FROM) / 8
const BREAK_POWER = (2 * (0.5 - STORM_RATE)) / (8 - W_STORM_TO - 2 * STORM_RATE)
const W_BLOOM = 14 + phaseOfElevation(SUN.bloom, true)
const W_OPEN = 14 + phaseOfElevation(SUN.open, true)
const W_CRANE = 14 + phaseOfElevation(SUN.crane, true)
const W_LAST = 14 + phaseOfElevation(SUN.last, true)
// The film opens with the sun 5 degrees under the horizon and closes with it 3 under, while the field can still be read.
const DUSK = sinceSunset(5)
const W_END = W_LAST + sinceSunset(3)
const BLOOM_RATE = (W_OPEN - W_BLOOM) / 4
const LEAD_RATE = DUSK / (1 - B0)
// In the fast time lapse the sun sets on beat 3 of every second bar and rises on the next bar line: a night of two beats.
// The world runs slower through it and makes the time up across noon.
const FAST_SET = 0.75
const FAST_LAG = FAST_SET / 2
const FAST_GAIN = (DAY - FAST_SET) / (2 * Math.sin(2 * Math.PI * FAST_LAG))
const BREAK_NIGHT_FROM = 42
const frostHold = new Monotone(
  [
    [17, 4],
    [17.2, W_FROST_FROM],
    [21, W_FROST_MID],
    [25, W_FROST_END],
  ],
  [
    [17, 0.25],
    [25, 0.012],
  ],
)
const evening = new Monotone(
  [
    [57, W_BLOOM],
    [61, W_OPEN],
    [65, W_CRANE],
    [73, W_LAST],
    [BEND, W_END],
  ],
  [[57, BLOOM_RATE]],
)

// The world clock before the nights of the fast time lapse are stretched: it sets the speed of the clouds.
function evenWorldAtBar(b: number): number {
  if (b < 1) return LEAD_RATE * (b - 1)
  if (b < 5) return hermite(b, 1, 0, LEAD_RATE, 5, 1, 0.25)
  if (b < 17) return (b - 1) / 4
  if (b < 25) return frostHold.at(b)
  if (b < 25.4) return hermite(b, 25, W_FROST_END, 0.012, 25.4, 4.2, 0.5)
  if (b < 27) return 5 - 0.5 * (27 - b)
  if (b < 31.5) return 5 + (b - 27) / 2
  if (b < 33) return hermite(b, 31.5, 7.25, 0.5, 33, W_STORM_FROM, STORM_RATE)
  if (b < 41) return W_STORM_FROM + STORM_RATE * (b - 33)
  if (b < 43) return W_STORM_TO + STORM_RATE * (b - 41) + (8 - W_STORM_TO - 2 * STORM_RATE) * Math.pow((b - 41) / 2, BREAK_POWER)
  if (b < 55) return 8 + (b - 43) / 2
  if (b < 57) return hermite(b, 55, 14.0, 0.5, 57, W_BLOOM, BLOOM_RATE)
  return evening.at(Math.min(b, BEND))
}

function fastAtBar(b: number): number {
  if (b < 25) return 0
  if (b < 26) return smooth(b - 25)
  if (b < 31) return 1
  if (b < 32.6) return 1 - smooth((b - 31) / 1.6)
  if (b < BREAK_NIGHT_FROM) return 0
  if (b < 43) return smooth((b - BREAK_NIGHT_FROM) / (43 - BREAK_NIGHT_FROM))
  if (b < 55) return 1
  if (b < 56.6) return 1 - smooth((b - 55) / 1.6)
  return 0
}

// The world clock in days at a bar. The whole part is the day, the fraction its phase, 0 at sunrise.
export function worldAtBar(b: number): number {
  const w = evenWorldAtBar(b)
  const fast = fastAtBar(b)
  if (fast === 0) return w
  const u = w - Math.floor(w)
  return w + fast * FAST_GAIN * (Math.sin(2 * Math.PI * (u - FAST_LAG)) + Math.sin(2 * Math.PI * FAST_LAG))
}

// A hold begins on the frame that holds its bar line, and that frame opens up to a frame before the line: growth has ended by then.
const FROST_FROM = hitBar(17)
const STORM_FROM = hitBar(33)
// A hold ends on the frame that holds its bar line: that frame opens at rest and has moved by the time its shutter closes.
const FROST_TO = hitBar(25)
const STORM_TO = hitBar(41)
const germination = new Monotone(
  G.germination.map((m) => [m.seconds ?? hitTime(m.bar ?? 1), m.tau] as const),
  [[hitTime(17), 0]],
)
const BLOOM_FROM = hitBar(57)
const settle = new Monotone(
  [
    [61, G.open],
    [65, G.crane],
    [69, G.field],
    [BEND, G.seconds],
  ],
  [[61, 0]],
)

// The plant's clock at a bar. It does not move in the two holds.
export function tauAtBar(b: number): number {
  if (b < FROST_FROM) return germination.at(barTime(b))
  if (b < FROST_TO) return G.frostHold
  if (b < STORM_FROM) return G.frostHold + (G.stormHold - G.frostHold) * trapezoid((b - FROST_TO) / (STORM_FROM - FROST_TO), 0.05, 0.14)
  if (b < STORM_TO) return G.stormHold
  if (b < 55.5) return G.stormHold + (G.bud - G.stormHold) * trapezoid((b - STORM_TO) / (55.5 - STORM_TO), 0.07, 0.12)
  if (b < BLOOM_FROM) return G.bud
  if (b < 61) return G.bud + (G.open - G.bud) * trapezoid((b - BLOOM_FROM) / (61 - BLOOM_FROM), 0.05, 0.55)
  return settle.at(Math.min(b, BEND))
}

export function tauAt(seconds: number): number {
  return tauAtBar(barAt(seconds))
}

export function worldAt(seconds: number): number {
  return worldAtBar(barAt(seconds))
}

const FLASH_BARS = [33, 37]

export function flashAt(seconds: number): number {
  let f = 0
  for (const n of FLASH_BARS) {
    const x = seconds - hitTime(n)
    if (x >= -1e-6) f = Math.max(f, Math.exp(-x / 0.17) + (x >= 0.13 ? 0.7 * Math.exp(-(x - 0.13) / 0.11) : 0))
  }
  return clamp(f)
}

// The frost forms in the last night of the first growth, when the plant has all but stopped, and has melted to a trace before the plant grows again.
const FROST_LEFT = 0.15

export function frostAtBar(b: number): number {
  if (b < 16.9) return 0
  if (b < 18) return smooth((b - 16.9) / 1.1)
  if (b < 22.5) return 1
  if (b < 25) return lerp(1, FROST_LEFT, smooth((b - 22.5) / 2.5))
  return FROST_LEFT * (1 - smooth((b - 25) / 0.4))
}

export function fogAtBar(b: number): number {
  if (b < 16.5) return 0
  if (b < 17) return 0.8 * smooth((b - 16.5) / 0.5)
  if (b < 21) return 0.8
  if (b < 25) return lerp(0.8, 0.35, smooth((b - 21) / 4))
  return 0.35 * (1 - smooth((b - 25) / 0.5))
}

const BREAK = hitBar(41)
const RAIN_FROM = hitBar(33)

// The deck stays over the break: the sun comes through a tear in it and sets under it, and the night takes the deck away.
const DECK_GOES = 42.3

export function overcastAtBar(b: number): number {
  if (b < 31.6) return 0
  if (b < 32.9) return smooth((b - 31.6) / 1.3)
  if (b < 40) return 1
  if (b < BREAK) return lerp(1, 0.74, smooth((b - 40) / (BREAK - 40)))
  if (b < DECK_GOES) return lerp(0.74, 0.58, smooth((b - BREAK) / (DECK_GOES - BREAK)))
  return 0.58 * (1 - smooth((b - DECK_GOES) / 0.62))
}

const RAIN_FULL = hitBar(34)
// The rain thins before the break and its last drops fall into the first sun. They are gone before the plant has grown a centimetre.
const rainEnd = new Monotone(
  [
    [39.5, 1],
    [40.25, 0.74],
    [BREAK, 0.45],
    [41.4, 0.18],
    [41.8, 0],
  ],
  [
    [39.5, 0],
    [41.8, 0],
  ],
)

// The first drops fall with the lightning and the curtain closes within a bar.
export function rainAtBar(b: number): number {
  if (b < RAIN_FROM) return 0
  if (b < RAIN_FULL) return smooth((b - RAIN_FROM) / (RAIN_FULL - RAIN_FROM))
  if (b < 39.5) return 1
  if (b < 41.8) return rainEnd.at(b)
  return 0
}

export function wetAtBar(b: number): number {
  if (b < 23) return 0
  if (b < 25) return 0.45 * smooth((b - 23) / 2)
  if (b < 27) return 0.45 * (1 - smooth((b - 25) / 2))
  if (b < RAIN_FROM) return 0
  if (b < 36) return smooth((b - RAIN_FROM) / (36 - RAIN_FROM))
  if (b < 41) return 1
  return 1 - smooth((b - 41) / 3.5)
}

export function puddleAtBar(b: number): number {
  if (b < 33.4) return 0
  if (b < 36.5) return smooth((b - 33.4) / 3.1)
  if (b < 41) return 1
  return 1 - smooth((b - 41) / 4)
}

// The burst comes up over four frames with its middle on the bar line, so the lens does not step and the hit still reads on the beat.
export function burstAtBar(b: number): number {
  const rise = smooth((b - BREAK + 0.04) / 0.08)
  return b < BREAK ? rise : rise * (1 - smooth((b - BREAK) / 1.8))
}

export function eveningAtBar(b: number): number {
  return smooth((b - 55) / 2)
}

// Fair weather cloud by day, so that no two days of the time lapse have the same sky.
const FAIR = [0.1, 0.16, 0.3, 0.2, 0.08, 0.24, 0.36, 0.44, 0.34, 0.2, 0.3, 0.14, 0.26, 0.2, 0.32, 0.3]

function fairAt(world: number): number {
  const w = Math.max(0, world - 0.35)
  const i = Math.min(FAIR.length - 2, Math.floor(w))
  return lerp(FAIR[i], FAIR[i + 1], smooth(w - i))
}

export function coverAtBar(b: number): number {
  const fair = fairAt(worldAtBar(b))
  const frost = fogAtBar(b)
  const over = overcastAtBar(b)
  return Math.max(lerp(fair, 0.12, frost), lerp(fair, 1, Math.pow(over, 0.55)))
}

export function sunThroughAtBar(b: number): number {
  const mist = 1 - 0.8 * smooth((fogAtBar(b) - 0.3) / 0.5)
  let storm = 1
  if (b >= 31.8 && b < BREAK - 0.04) storm = 1 - smooth((b - 31.8) / 0.9)
  else if (b >= BREAK - 0.04) storm = lerp(0.9, 1, smooth((b - BREAK) / 2)) * smooth((b - BREAK + 0.04) / 0.1)
  return clamp(mist * storm)
}

export function coldAtBar(b: number): number {
  return Math.max(frostAtBar(b), fogAtBar(b) * 0.9)
}

export function dewAtBar(b: number): number {
  const w = worldAtBar(b)
  const phase = w - Math.floor(w)
  const morning = Math.max(1 - smooth(phase / 0.3), smooth((phase - 0.88) / 0.12))
  const early = 1 - smooth((b - 14) / 2.4)
  const thaw = b >= 23 && b < 27 ? smooth((b - 23) / 2) * (1 - smooth((b - 25.2) / 1.6)) : 0
  return clamp(Math.max(morning * early, thaw))
}

export function windAtBar(b: number): number {
  const still = 1 - Math.max(frostAtBar(b), smooth((b - 16) / 1) * (1 - smooth((b - 25) / 1)))
  const fair = lerp(0.1, 0.24, smooth((b - 25) / 6))
  const storm = 0.3 * Math.max(smooth((b - 31.8) / 1.2) * (1 - smooth((b - 40.4) / 2.6)), 0)
  const late = 0.26 * smooth((b - 56) / 6)
  return clamp(fair * still + storm + late)
}

const WORLD_RATE_FASTEST = 0.5 / BAR

export function lapseAt(seconds: number): number {
  const h = 0.5 / FPS
  const rate = (evenWorldAtBar(barAt(seconds + h)) - evenWorldAtBar(barAt(seconds - h))) / (2 * h)
  return clamp(rate / WORLD_RATE_FASTEST)
}
