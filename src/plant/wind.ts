import { bentBy, frontGlsl, gustAt, patchyAt, windWay } from '../v2/wind.ts'

// The wind as a closed-form function of time and place. Film seconds are real seconds for the weather.
// A part scales what it does with these by `pose.inputs.wind`, which is 0 in still air.
// Its direction and its gust front are the film's own, so the plant leans with the field, the grass and the rain.
const TOWARD = windWay
const SPEED_M_PER_S = 1.6
// A stem is heavy: it answers the front this many seconds late, and what it feels is rounded off over the time between.
const HEAVY_LAGS = [0.05, 0.15, 0.25, 0.35, 0.45]
// A leaf is light and answers sooner.
const LIGHT_LAGS = [0.04, 0.12, 0.2]

// Three numbers that are a plant's own, each 0 to 1, from where it stands.
const own = (x: number, z: number, which: number): number => {
  const v = Math.sin(x * 12.9898 + z * 78.233 + which * 37.719) * 43758.5453
  return v - Math.floor(v)
}

const front = (lags: number[], time: number, x: number, z: number): number => {
  let sum = 0
  for (const lag of lags) sum += gustAt(x, z, time - lag)
  return sum / lags.length
}

// The slow wave that crosses the field, about -1 to 1, at a place in meters.
export function gust(time: number, x: number, z: number): number {
  const along = x * TOWARD.x + z * TOWARD.z - time * SPEED_M_PER_S
  const across = z * TOWARD.x - x * TOWARD.z
  return 0.55 * (2 * gustAt(x, z, time) - 1) + 0.3 * Math.sin(along * 2.3 + 1.7 + across * 0.9) + 0.15 * Math.sin(along * 5.1 + 4.2 - across * 1.7)
}

// The part of that wave a whole plant follows, about -1 to 1: its slowest swell alone, because a stem with a head on it is too heavy for the rest.
export function sway(time: number, x: number, z: number): number {
  const patchy = patchyAt(time)
  const one = patchy < 1 ? 2 * front(HEAVY_LAGS, time, x, z) - 1 : 0
  if (patchy <= 0) return one
  // In the last shot it gives to the gusts that reach it and swings on a note of its own, as its neighbors do. It stands a little short of the middle at rest, as it did between two fronts.
  const bent = bentBy(own(x, z, 0.13), own(x, z, 0.47), own(x, z, 0.71), x, z, time)
  const given = Math.min(1, Math.max(-1, (bent.x * TOWARD.x + bent.z * TOWARD.z - REST) / (1 - REST / 2)))
  return one + (given - one) * patchy
}
// How far downwind a stem that has given this much of a full gust stands at the middle of its swing.
const REST = 0.35

// The swell of the first film, for inputs that carry no film second. The checks in `tests/` still pose the plant with those.
export const firstWay = { x: 0.92, z: 0.39 }
export function swell(time: number, x: number, z: number): number {
  const along = x * firstWay.x + z * firstWay.z - time * SPEED_M_PER_S
  const across = z * firstWay.x - x * firstWay.z
  return Math.sin(along * 0.9 + 0.6 * Math.sin(across * 0.31 + time * 0.13))
}

// How far a stem leans with the wind at full strength, as angles at its top in radians: a steady lean downwind and the swing round it.
export const STEM_LEAN = 0.03
export const STEM_SWING = 0.05

// The same swell for a shader, as `plantSway(time, place)`.
export const swayGlsl = /* glsl */ `${frontGlsl.replace(/gustPulse/g, 'plantGustPulse').replace(/gustAt/g, 'plantGust')}
float plantSway(float time, vec2 at) {
  return 2.0 * (${HEAVY_LAGS.map((lag) => `plantGust(at, time - ${lag.toFixed(2)})`).join(' + ')}) / ${HEAVY_LAGS.length.toFixed(1)} - 1.0;
}
`

// The faster small motion that is one organ's own, about -1 to 1. `seed` is 0 to 1 and belongs to the organ.
export function flutter(time: number, seed: number): number {
  const p = seed * Math.PI * 2
  return 0.6 * Math.sin(time * (5.3 + 2.1 * seed) + p * 3.1) + 0.4 * Math.sin(time * (9.7 + 3.3 * seed) + p * 7.3)
}

// The direction the wind blows toward, level with the ground.
export const windToward = TOWARD

// A storm's gusts at a place, 0 to about 1: each one rises fast, holds unevenly and lets go slower, and no two are alike.
export function squall(time: number, x: number, z: number): number {
  const push = front(LIGHT_LAGS, time, x, z)
  const quick = 0.5 + 0.5 * Math.sin(time * 2.7 + 1.3 * Math.sin(time * 0.83 + 2.1))
  // Between two gusts the storm still leans on everything, and inside one the air is torn.
  return (0.2 + 0.8 * push) * (0.8 + 0.2 * quick) + 0.1 * push * Math.sin(time * 7.3 + 2 * quick)
}

export const cell = (n: number, seed: number): number => {
  let h = (Math.imul(n | 0, 0x9e3779b1) ^ Math.imul((seed * 65536) | 0, 0x85ebca6b)) >>> 0
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d) >>> 0
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39) >>> 0
  return ((h ^ (h >>> 15)) >>> 0) / 2147483648 - 1
}

const eased = (x: number, seed: number): number => {
  const n = Math.floor(x)
  const f = x - n
  const a = cell(n, seed)
  return a + (cell(n + 1, seed) - a) * f * f * (3 - 2 * f)
}

// What a time lapse does to an organ, about -1 to 1: every frame is a moment minutes from the last, so it sits a little differently in each, and now and then it settles to a new rest.
export function restless(time: number, frame: number, seed: number): number {
  const settle = eased(time * 1.9 + seed * 17, seed)
  const hop = Math.floor(time * 3.1 + seed * 29)
  const jump = cell(hop, seed + 0.31) > 0.55 ? cell(hop, seed + 0.57) : 0
  return 0.4 * settle + 0.25 * jump + 0.35 * cell(frame, seed + 0.11)
}
