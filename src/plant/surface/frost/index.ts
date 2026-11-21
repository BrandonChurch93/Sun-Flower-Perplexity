// Frost on the skin: a thin veil, grains of ice that stand apart, frozen beads, and the flash of a grain turned to the sun.
export const frostGlsl = /* glsl */ `
const float FROST_GRAIN_M = 0.0012;
const float FROST_BEAD_M = 0.0034;
const vec3 FROST_RIME = vec3(0.74, 0.79, 0.86);
const float FROST_FLASH = 5.0;
const vec3 FROST_COLD = vec3(0.45, 1.2, 0.5);
// The share of the sun that the rime on the down of a round body sends on, on the sun's side.
const float FROST_SIDE = 1.0;
const float FROST_DOWN = 0.08;
const float FROST_MATT = 0.8;
const float FROST_BLOOM = 0.6;
// The share of the sun a frozen blade no longer passes.
const float FROST_SHUT = 0.4;

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
  // Hoar grows on what is open to the sky: a face turned to the side holds it only at its very edge.
  float open = (0.01 + 0.55 * up * up) * (0.2 + 0.8 * sheen);
  // A fine powder lies on every face, the under one too, thicker toward what gathers it and in drifts.
  float dusted = (0.07 + 0.2 * up * up) * (0.15 + 1.2 * bank * bank) + 0.22 * gather;
  float grown = saturate(open * (0.3 + 1.4 * bank * bank) + 0.34 * gather * gather * (0.4 + 0.6 * up) + 0.45 * smoothstep(0.9, 1.0, gather));
  vec2 g = at * (1.0 / FROST_GRAIN_M);
  // A grain finer than the pixel is its share of the pixel: it never flickers.
  float reach = length(fwidth(g));
  // A crust has a border: where the hoar is thick enough it closes, and the border is ragged at the scale of its grains.
  float seen = 1.0 - smoothstep(0.4, 1.2, reach * (FROST_GRAIN_M / 0.0013));
  float ragged = grown + 0.3 * (fine - 0.5) * seen + 0.2 * (bank - 0.5);
  // Under the grains a face open to the sky wears a thin grey bloom all over, in drifts.
  float veil = 0.02 + 0.1 * grown + dusted * mix(1.0, 0.6 + 0.8 * fine, seen) + FROST_BLOOM * open * (0.04 + 0.96 * bank * bank * bank) * mix(1.0, 0.5 + fine, seen) + smoothstep(0.38, 0.66, ragged) * mix(0.6, 0.12 + 0.88 * fine * fine, seen);
  float sharp = 1.0 - smoothstep(0.35, 1.1, reach);
  float chance = 0.94 * grown;
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
