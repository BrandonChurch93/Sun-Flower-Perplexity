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
