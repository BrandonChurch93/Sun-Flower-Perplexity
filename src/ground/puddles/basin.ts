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

// The square of ground whose ripples are kept, as its center along the line to the lens and its half size, in meters.
export const rippleBox = { aheadM: 0.25, halfM: 0.8 }
