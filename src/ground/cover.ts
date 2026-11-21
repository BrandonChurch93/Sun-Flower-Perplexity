import { toward } from '../field/layout.ts'

// Grass and weeds come up through the film. At dawn a few small ones stand on bare soil, by the last shot the ground in front of the crop is grass.
// The tufts are born between the first and the last of these seconds of film, each takes the third to grow, and none is born in the dawn camera's way before the fourth.
export const grassTimes = { firstS: 9, lastS: 37, growS: 12, laneS: 16 }
const smooth = (a: number, b: number, v: number): number => {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

// The same uneven pattern here and in the shaders, so that the tufts stand where the soil is matted.
export const patchy = (x: number, z: number): number => 0.5 + 0.25 * Math.sin(x * 1.7 + 1.3 * Math.sin(z * 1.1)) + 0.25 * Math.sin(z * 2.3 + 1.7 * Math.sin(x * 0.9 + 2))
export const grassMask = (x: number, z: number): number => smooth(-1.25, -0.85, x * toward.x + z * toward.z + 0.3 * (patchy(x, z) - 0.5))

export const grassCover = /* glsl */ `
uniform vec4 uGrassTimes;
float patchy(vec2 p) {
  return 0.5 + 0.25 * sin(p.x * 1.7 + 1.3 * sin(p.y * 1.1)) + 0.25 * sin(p.y * 2.3 + 1.7 * sin(p.x * 0.9 + 2.0));
}
float grassMask(vec2 p, vec2 towardCamera) {
  return smoothstep(-1.25, -0.85, dot(p, towardCamera) + 0.3 * (patchy(p) - 0.5));
}
float grassSeason() {
  return smoothstep(uGrassTimes.x, uGrassTimes.y + uGrassTimes.z, uTime);
}
`
