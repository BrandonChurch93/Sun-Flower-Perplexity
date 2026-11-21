// A film of water on the skin: it stands in sheets and gathers toward the edges, the tissue under it is darker and richer, and its face is a mirror of the sky.
export const wetGlsl = /* glsl */ `
const float WET_SHEET_M = 0.006;
const float WET_ROUGH_THIN = 0.3;
const float WET_ROUGH_DEEP = 0.08;
const float WET_WAX = 0.4;

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

// What a film of water mirrors: the bright band low in the sky where it faces it, the dark sky over that, the ground under it.
vec3 wetSky(vec3 d) {
  float band = smoothstep(-0.08, 0.04, d.y) * (1.0 - smoothstep(0.12, 0.4, d.y));
  return mix(mix(uGroundBounce, uSkyZenith, smoothstep(-0.05, 0.05, d.y)), uSkyHorizon, band);
}
`
