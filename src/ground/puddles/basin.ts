import { right, toward } from '../../field/layout.ts'
import { furrow, soilHeight } from '../soil.ts'

export const course = /* glsl */ `
uniform vec2 uToward;
uniform vec2 uRight;
uniform vec3 uBox;
// A place on the ground inside the square whose ripples are kept, -1 to 1 across it and along it.
vec2 boxPlace(vec2 p) {
  vec2 k = p - uBox.xy;
  return vec2(dot(k, uRight), dot(k, uToward)) * uBox.z;
}
`

// How deep the water stands over a place on the ground, in meters; below zero the ground is dry land.
export const basin = /* glsl */ `
${soilHeight}
uniform vec2 uLevel;
${course}
uniform vec2 uWater;
uniform float uWet;
// The furrow gathers the water: the dips of the ground more than a foot from its course drain into it and hold none.
// Beyond the square the soil shows its own standing water in its dips, at its own level: toward the edge of the square the dips fill to that level, so the two meet with no line between them.
float drained(vec2 p) {
  float a = dot(p, uFurrowAxes.xy);
  float d = -dot(p, uFurrowAxes.zw);
  float dc = clamp(d, uFurrow.z, uFurrow.w);
  float held = 0.03 * smoothstep(0.13, 0.33, length(vec2(a + uFurrow.x - uFurrow.y * dc, d - dc)));
  vec2 q = abs(boxPlace(p));
  return mix(held, min(held, max(uLevel.x - mix(uWater.x, uWater.y, uWet), 0.0)), smoothstep(0.4, 0.92, max(q.x, q.y)));
}
float waterDepthOver(float height, vec2 p) {
  return uLevel.x - height - drained(p);
}
float waterDepth(vec2 p) {
  return waterDepthOver(soilHeight(p, soilLod(p)), p);
}
`

// The square of ground whose ripples are kept, laid along the furrow: its center in the ground's own axes and its half size, in meters.
const middleAwayM = 0.5 * (furrow.fromM + furrow.toM)
export const rippleBox = { acrossM: furrow.slope * middleAwayM - furrow.leftM, awayM: middleAwayM, halfM: 0.6 }

// True within reach of the middle line of the soil's furrow, for the fine rain whose rings are kept only there.
export function nearFurrow(x: number, z: number, reachM: number): boolean {
  const a = x * right.x + z * right.z
  const d = -(x * toward.x + z * toward.z)
  return Math.abs(a + furrow.leftM - furrow.slope * d) < reachM && d > furrow.fromM - reachM && d < furrow.toM + reachM
}
