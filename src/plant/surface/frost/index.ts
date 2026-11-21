// Frost on the skin: a thin veil, grains of ice that stand apart, frozen beads, and the flash of a grain turned to the sun.
export const frostGlsl = /* glsl */ `
const float FROST_GRAIN_M = 0.0012;
const float FROST_BEAD_M = 0.0034;
const vec3 FROST_RIME = vec3(0.74, 0.79, 0.86);
const float FROST_FLASH = 5.0;
const vec3 FROST_COLD = vec3(0.45, 1.2, 0.5);
// The share of the sun that the rime on the down of a round body sends on, on the sun's side.
const float FROST_SIDE = 1.0;

// One grain to a cell, whole inside it. x: its share of the pixel, y: the flash of its face when it mirrors the sun to the eye.
vec2 frostGrain(vec2 g, float reach, float chance, float least, float most, vec3 N, vec3 view) {
  vec2 cell = floor(g);
  float h = hash21(cell);
  if (h >= chance) return vec2(0.0);
  float r = mix(least, most, hash21(cell + 37.0));
  vec2 middle = vec2(r) + (1.0 - 2.0 * r) * vec2(hash21(cell + 71.0), hash21(cell + 113.0));
  float grain = 1.0 - smoothstep(r - 0.5 * reach, r + 0.5 * reach, length(g - cell - middle));
  vec3 facet = normalize(N + 1.6 * (vec3(hash21(cell + 151.0), hash21(cell + 193.0), hash21(cell + 229.0)) - 0.5));
  float flash = saturate(dot(facet, normalize(uSunDir + view)));
  flash *= flash;
  flash *= flash;
  flash *= flash;
  flash *= flash;
  flash *= flash;
  flash *= flash;
  return vec2(grain, grain * flash * flash);
}

// x: the share of the pixel that is ice. y: the flash of the ice in it.
// 'at' is in meters on the skin. 'gather' is where frost grows first: 0 in the middle of a face to 1 at an edge, a tip or the ridge of a vein.
vec2 frostCrust(vec2 at, float gather, vec3 N, vec3 F, vec3 view, float sheen, float rim) {
  float up = saturate(F.y);
  float bank = valueNoise(at * (1.0 / 0.006));
  float fine = valueNoise(at * (1.0 / 0.0013) + 17.0);
  float grown = saturate((0.06 + 0.5 * up * up) * (0.3 + 1.4 * bank * bank) * (0.2 + 0.8 * sheen) + gather * sqrt(gather));
  float veil = 0.02 + 0.2 * grown * fine + 0.65 * grown * grown;

  vec2 g = at * (1.0 / FROST_GRAIN_M);
  // A grain finer than the pixel is its share of the pixel: it never flickers.
  float reach = length(fwidth(g));
  float sharp = 1.0 - smoothstep(0.35, 1.1, reach);
  float chance = 0.04 + 0.9 * grown;
  float most = 0.17 + 0.18 * grown;
  vec2 dust = frostGrain(g, reach, chance, 0.08, most, N, view);
  float mean = chance * 3.1416 * (0.08 * 0.08 + 0.08 * most + most * most) / 3.0;

  float wide = FROST_GRAIN_M / FROST_BEAD_M;
  // Frozen beads stand where the dew stood: along edges, tips and veins, not on an open face.
  float lone = (0.2 + 0.3 * up) * smoothstep(0.0, 0.5, gather);
  vec2 bead = frostGrain(g * wide + 53.0, reach * wide, lone, 0.05, 0.15, N, view);
  float still = 1.0 - smoothstep(0.35, 1.1, reach * wide);
  float ice = mix(mean, dust.x, sharp) + mix(lone * 0.034, bead.x, still);
  return vec2(saturate(veil + ice + 0.34 * rim * (0.55 + 0.45 * sheen)), dust.y * sharp + 2.0 * bead.y * still);
}
`
