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
export const grassMask = (x: number, z: number): number => smooth(-1.75, -1.35, x * toward.x + z * toward.z + 0.3 * (patchy(x, z) - 0.5))

export const patchyCover = /* glsl */ `
float patchy(vec2 p) {
  return 0.5 + 0.25 * sin(p.x * 1.7 + 1.3 * sin(p.y * 1.1)) + 0.25 * sin(p.y * 2.3 + 1.7 * sin(p.x * 0.9 + 2.0));
}
`
export const grassCover = /* glsl */ `
uniform vec4 uGrassTimes;
${patchyCover}
float grassMask(vec2 p, vec2 towardCamera) {
  return smoothstep(-1.75, -1.35, dot(p, towardCamera) + 0.3 * (patchy(p) - 0.5));
}
float grassSeason() {
  return smoothstep(uGrassTimes.x, uGrassTimes.y + uGrassTimes.z, uTime);
}
`

// The turf of the field shot: how rank it stands here and how bare the soil lies, the same in the tufts and in the soil under them.
export const turfCover = /* glsl */ `
vec2 turf(vec2 p) {
  float rank = smoothstep(0.22, 0.8, 0.5 * valueNoise(p * 1.1 + 7.0) + 0.35 * valueNoise(p * 3.3 + 21.0) + 0.15 * valueNoise(p * 9.0 + 4.0));
  float bare = smoothstep(0.66, 0.76, 0.6 * valueNoise(p * 1.7 + 40.0) + 0.4 * valueNoise(p * 5.1 + 9.0));
  return vec2(rank, bare);
}
`
// Round each stem the soil lies open to bareM and the turf stands full from fullM; the stem and its leaves keep the sky off the ground within shadeM.
export const stemFoot = { bareM: 0.05, fullM: 0.16, shadeM: 0.12 }
