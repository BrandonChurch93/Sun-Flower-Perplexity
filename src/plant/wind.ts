// The wind as a closed-form function of time and place. Film seconds are real seconds for the weather.
// A part scales what it does with these by `pose.inputs.wind`, which is 0 in still air.
const TOWARD = { x: 0.92, z: 0.39 }
const SPEED_M_PER_S = 1.6

// The slow wave that crosses the field, about -1 to 1, at a place in meters.
export function gust(time: number, x: number, z: number): number {
  const along = x * TOWARD.x + z * TOWARD.z - time * SPEED_M_PER_S
  const across = z * TOWARD.x - x * TOWARD.z
  return 0.55 * Math.sin(along * 0.9 + 0.6 * Math.sin(across * 0.31 + time * 0.13)) + 0.3 * Math.sin(along * 2.3 + 1.7 + across * 0.9) + 0.15 * Math.sin(along * 5.1 + 4.2 - across * 1.7)
}

// The part of that wave a whole plant follows, about -1 to 1: its slowest swell alone, because a stem with a head on it is too heavy for the rest.
export function sway(time: number, x: number, z: number): number {
  const along = x * TOWARD.x + z * TOWARD.z - time * SPEED_M_PER_S
  const across = z * TOWARD.x - x * TOWARD.z
  return Math.sin(along * 0.9 + 0.6 * Math.sin(across * 0.31 + time * 0.13))
}

// How far a stem leans with the wind at full strength, as angles at its top in radians: a steady lean downwind and the swing round it.
export const STEM_LEAN = 0.03
export const STEM_SWING = 0.05

// The same swell for a shader, as `plantSway(time, place)`.
export const swayGlsl = /* glsl */ `
float plantSway(float time, vec2 at) {
  float along = at.x * ${TOWARD.x.toFixed(4)} + at.y * ${TOWARD.z.toFixed(4)} - time * ${SPEED_M_PER_S.toFixed(4)};
  float across = at.y * ${TOWARD.x.toFixed(4)} - at.x * ${TOWARD.z.toFixed(4)};
  return sin(along * 0.9 + 0.6 * sin(across * 0.31 + time * 0.13));
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
  const t = time - (x * TOWARD.x + z * TOWARD.z) / 6
  const slow = 0.5 + 0.5 * Math.sin(t * 1.9 + 1.2 * Math.sin(t * 0.53 + 0.7) + 1.7)
  const quick = 0.5 + 0.5 * Math.sin(t * 2.7 + 1.3 * Math.sin(t * 0.83 + 2.1))
  // Between two gusts the storm still leans on everything.
  const push = (0.22 + 0.78 * slow * slow) * (0.65 + 0.35 * quick)
  return push + 0.12 * slow * Math.sin(t * 7.3 + 2 * quick)
}

const cell = (n: number, seed: number): number => {
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
