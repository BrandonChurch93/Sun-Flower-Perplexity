import { right, toward } from '../../field/layout.ts'
import { soilHeight } from '../soil.ts'
import { standInBank } from './scratch.ts'

// The course of the furrow the rain fills, in the ground's own axes (across the view and away from the lens, in meters from the plant's foot), measured on the approved image and agreed with the soil.
export const furrowCourse = { acrossAtPlantM: -0.1, acrossPerAwayM: 0.18, nearAwayM: -0.75, endAwayM: 0.27 }

export const course = /* glsl */ `
uniform vec2 uToward;
uniform vec2 uRight;
// x is the signed distance from the furrow's middle line, y the distance away from the lens along it.
vec2 furrowPlace(vec2 p) {
  float d = -dot(p, uToward);
  return vec2(dot(p, uRight) - ${furrowCourse.acrossAtPlantM.toFixed(3)} - ${furrowCourse.acrossPerAwayM.toFixed(3)} * d - 0.015 * sin(d * 13.0 + 1.0), d);
}
uniform vec3 uBox;
// A place on the ground inside the square whose ripples are kept, -1 to 1 across it and along it.
vec2 boxPlace(vec2 p) {
  vec2 k = p - uBox.xy;
  return vec2(dot(k, uRight), dot(k, uToward)) * uBox.z;
}
float furrowHalf(float away) {
  return mix(0.057, 0.04, saturate((away + 0.6) / 0.6)) - 0.02 * saturate(away / 0.25);
}
`

// How deep the water stands over a place on the ground, in meters; below zero the ground is dry land.
export const basin = /* glsl */ `
${soilHeight}
uniform vec2 uLevel;
${course}
${standInBank}
float waterDepth(vec2 p) {
  return uLevel.x - soilHeight(p, soilLod(p)) - furrowBank(p, uLevel.y);
}
`

// The square of ground whose ripples are kept, laid along the furrow: its center in the ground's own axes and its half size, in meters.
export const rippleBox = { acrossM: -0.14, awayM: -0.24, halfM: 0.6 }

// True within reach of the furrow's middle line, for the fine rain whose rings are kept only there.
export function nearFurrow(x: number, z: number, reachM: number): boolean {
  const a = x * right.x + z * right.z
  const d = -(x * toward.x + z * toward.z)
  const off = a - furrowCourse.acrossAtPlantM - furrowCourse.acrossPerAwayM * d - 0.015 * Math.sin(d * 13 + 1)
  return Math.abs(off) < reachM && d > furrowCourse.nearAwayM - reachM && d < furrowCourse.endAwayM + reachM
}
