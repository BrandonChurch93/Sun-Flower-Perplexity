import { soilHeight } from '../soil.ts'
import { standInBank } from './scratch.ts'

// How deep the water stands over a place on the ground, in meters; below zero the ground is dry land.
export const basin = /* glsl */ `
${soilHeight}
uniform vec2 uToward;
uniform vec2 uRight;
uniform vec2 uLevel;
${standInBank}
float waterDepth(vec2 p) {
  return uLevel.x - soilHeight(p, soilLod(p)) - furrowBank(p, uLevel.y);
}
`

// The square of ground whose ripples are kept, as its center along the line to the lens and its half size, in meters.
export const rippleBox = { aheadM: 0.25, halfM: 0.8 }
