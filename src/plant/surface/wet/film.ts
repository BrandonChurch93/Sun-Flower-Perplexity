// A film of water on the skin: it stands in sheets and gathers toward the edges, the tissue under it is darker and richer, and its face is a mirror of the sky.
export const wetUniforms = { uWetMoon: { value: 0 } }

export const wetGlsl = /* glsl */ `
// 1 under the moon: its picture in the water on a skin is a quarter of the sun's.
uniform float uWetMoon;
const float WET_SHEET_M = 0.006;
#define WET_ROUGH_THIN mix(0.3, 0.7, uWetMoon)
#define WET_ROUGH_DEEP mix(0.08, 0.5, uWetMoon)
#define WET_WAX mix(0.8, 0.2, uWetMoon)
const float WET_DARK = 0.8;
// What a film of water over a skin sends back seen square on: more than the wax under it, since every small rise of it is turned its own way.
const float WET_F0 = 0.1;
const float WET_SHEER = 1.0;
// How far the water levels the relief under it: little where the skin is damp, more under a standing sheet.
const float WET_LEVEL_THIN = 0.25;
const float WET_LEVEL_DEEP = 0.45;
// The share of the sky behind it that a soaked blade passes between its veins, and how little a vein passes.
const float WET_PASS = 0.05;
const float WET_VEIN = 0.03;
const float WET_RIPPLE_M = 0.0014;
const float WET_RIPPLE = 0.4;
const float WET_FORWARD = 0.6;

// Water in a tissue keeps the light inside it for longer: each color is taken again, so the dark deepens and the hue grows.
vec3 wetAlbedo(vec3 albedo) {
  return pow(albedo, vec3(1.4)) * 0.9;
}

// How deep the water stands at a place on the skin, 0 a damp skin to 1 a standing sheet. 'at' is in meters, 'gather' rises to 1 where water collects before it falls.
float wetFilm(vec2 at, float gather) {
  float sheet = valueNoise(at * (1.0 / WET_SHEET_M) + 9.0);
  float rill = valueNoise(at * (1.0 / (0.35 * WET_SHEET_M)) + 41.0);
  return saturate(smoothstep(0.38, 0.62, sheet + 0.25 * (rill - 0.5)) * 0.8 + 0.2 + 0.5 * gather * gather);
}

// On a round body the water does not stand in sheets: it comes down in narrow runs, each broken along its length, with fine moisture between them. 'at' has the body's axis as y.
float wetRuns(vec2 at) {
  float track = valueNoise(vec2(at.x * (1.0 / 0.007), at.y * (1.0 / 0.06)) + 23.0);
  float wander = valueNoise(vec2(at.x * (1.0 / 0.02), at.y * (1.0 / 0.012)) + 61.0);
  float run = smoothstep(0.66, 0.72, track + 0.12 * (wander - 0.5));
  float fine = valueNoise(at * (1.0 / 0.0022) + 5.0);
  return saturate(0.12 + 0.3 * smoothstep(0.55, 0.8, fine) + 0.85 * run);
}

// How the small rises of a wet skin turn its mirror, along the two directions of the face. Finer than a pixel they are no longer turned one by one.
vec3 wetRipple(vec2 at, vec3 t1, vec3 t2) {
  vec2 g = at * (1.0 / WET_RIPPLE_M);
  float seen = 1.0 - smoothstep(0.35, 1.1, length(fwidth(g)));
  vec2 turn = vec2(valueNoise(g + 3.0), valueNoise(g + 71.0)) - 0.5;
  return (t1 * turn.x + t2 * turn.y) * (2.0 * WET_RIPPLE * seen);
}

// The sky a blade is seen against: the dome, and the break in the cloud low over the land.
vec3 wetBehind(vec3 d) {
  float band = smoothstep(-0.1, 0.03, d.y) * (1.0 - smoothstep(0.1, 0.45, d.y));
  return mix(skyAmbient(d), uSkyHorizon * 1.5, band);
}

// What a film of water mirrors: the bright band low in the sky where it faces it. The dark cloud over that and the ground under it are broken up by the rain on the film and all but gone.
vec3 wetSky(vec3 d) {
  float band = smoothstep(-0.08, 0.04, d.y) * (1.0 - smoothstep(0.2, 0.7, d.y));
  return mix(WET_DARK * mix(uGroundBounce, uAirZenith, smoothstep(-0.05, 0.05, d.y)), uAirHorizon, band);
}
`
