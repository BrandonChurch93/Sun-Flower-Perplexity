// Dew on the skin: a mist of beads far finer than a pixel that stands on the down. Together they are a moist sheen the color of the light, not of the leaf, strongest against the light. The beads large enough to see are shapes: the bead set in ../wet.
export const dewGlsl = /* glsl */ `
const float DEW_PATCH_M = 0.004;
const float DEW_FINE_M = 0.0007;
const float DEW_BIG_M = 0.0022;
const float DEW_SUN = 0.09;
const float DEW_SKY = 0.07;
// The share of the light that the beads on a sheet's face send back to an eye on the lit side.
const float DEW_FACE = 0.02;
// The share of the sun that a full mist on both faces of a sheet turns back before it can cross it.
const float DEW_SHADE = 1.0;
// Of the sky's light a misted sheet passes more, and the mist spreads it: every blade passes the same even sky, whatever stands behind it.
const float DEW_SHEER = 1.0;
// On a dry skin the mist stands as separate beads, each a lens that throws the sky forward through the blade.
const float DEW_SHEER_DRY = 10.0;
// What hides the sun from a misted sheet hides less of the sky behind it: the mist gathers the sky from every side.
const float DEW_BEHIND = 0.8;
const float DEW_FORWARD = 1.0;
const float DEW_ROUGH = 0.42;
const float DEW_WAX = 0.7;
const float DEW_BREAK = 0.8;

vec3 dewBehind() {
  return 0.5 * (uSkyZenith + uSkyHorizon);
}

// One bead to a cell, whole inside it, round, and faint once it is finer than the pixel.
float dewBead(vec2 g, float chance, float least, float most) {
  vec2 cell = floor(g);
  if (hash21(cell + 5.0) >= chance) return 0.0;
  float r = mix(least, most, hash21(cell + 41.0) * hash21(cell + 67.0));
  vec2 middle = vec2(r) + (1.0 - 2.0 * r) * vec2(hash21(cell + 83.0), hash21(cell + 127.0));
  float reach = length(fwidth(g));
  return 1.0 - smoothstep(r - 0.5 * reach, r + 0.5 * reach, length(g - cell - middle));
}

// The share of the skin under dew at a place, 0 to 1. 'at' is in meters, 'gather' rises to 1 at an edge or a tip, where dew stands thickest.
// The dew stands as beads: many fine ones all over, and a few big ones where it gathers. Between them the skin wears a thin mist. Too far off to tell the beads apart, it is their even share.
float dewMist(vec2 at, float gather) {
  float stand = valueNoise(at * (1.0 / DEW_PATCH_M) + 23.0);
  float even = saturate(0.3 + 0.6 * stand + 0.5 * gather);
  vec2 g = at * (1.0 / DEW_FINE_M);
  float near = 1.0 - smoothstep(0.3, 0.9, length(fwidth(g)));
  if (near <= 0.0) return even;
  float fine = dewBead(g, 0.35 + 0.5 * stand, 0.12, 0.42);
  float big = dewBead(at * (1.0 / DEW_BIG_M) + 9.0, 0.5 * smoothstep(0.35, 0.9, gather + 0.3 * (stand - 0.5)), 0.2, 0.46);
  return mix(even, saturate(0.12 + 0.2 * gather + 1.5 * fine + 1.7 * big), near);
}
`
