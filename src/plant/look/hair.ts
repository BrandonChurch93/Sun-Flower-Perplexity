// The tone of a bristle, for each point of a strand in the hair vertex shader: t from 0 at its foot to 1 at its tip, the frost, and the strand's length in pixels.
export const hairToneGlsl = /* glsl */ `
void hairTone(float t, float frost, float px, inout vec3 sun, inout vec3 sky) {
  // A bristle is one clear glassy cell, near white, on a foot of many small dark cells. Both show only once the strand is long enough on the screen to have a foot; farther off it is the halo it always was.
  vec3 tone = mix(vec3(0.22, 0.2, 0.15), vec3(1.0, 1.06, 1.1), smoothstep(0.03, 0.22, t));
  tone = mix(vec3(1.0), tone, smoothstep(12.0, 40.0, px) * (1.0 - frost));
  sun *= tone;
  sky *= tone;
}
`
