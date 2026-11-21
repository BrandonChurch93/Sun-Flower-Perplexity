// Dew on the skin: a mist of beads far finer than a pixel that stands on the down. Together they are a moist sheen the color of the light, not of the leaf, strongest against the light. The beads large enough to see are shapes: the bead set in ../wet.
export const dewGlsl = /* glsl */ `
const float DEW_PATCH_M = 0.004;
const float DEW_SUN = 0.09;
const float DEW_SKY = 0.07;
const float DEW_ROUGH = 0.42;
const float DEW_WAX = 0.7;
const float DEW_BREAK = 0.8;

// The share of the skin under dew at a place, 0 to 1. 'at' is in meters, 'gather' rises to 1 at an edge or a tip, where dew stands thickest.
float dewMist(vec2 at, float gather) {
  float stand = valueNoise(at * (1.0 / DEW_PATCH_M) + 23.0);
  return saturate(0.3 + 0.6 * stand + 0.5 * gather);
}
`
