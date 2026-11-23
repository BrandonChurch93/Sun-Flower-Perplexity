// Frost on the skin: a thin veil, grains of ice that stand apart, frozen beads, and the flash of a grain turned to the sun.
export const frostGlsl = /* glsl */ `
const float FROST_GRAIN_M = 0.0012;
const float FROST_BEAD_M = 0.0034;
const vec3 FROST_RIME = vec3(0.74, 0.79, 0.86);
const float FROST_FLASH = 5.0;
const vec3 FROST_COLD = vec3(0.45, 1.2, 0.5);
// The share of the sun that the rime on the down of a round body sends on, on the sun's side.
const float FROST_SIDE = 0.12;
const float FROST_DOWN = 0.03;
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
  // A grain of ice has corners: it is not a bead.
  vec2 p = g - cell - middle;
  float spin = 6.2832 * hash21(cell + 257.0);
  p = vec2(p.x * cos(spin) - p.y * sin(spin), p.x * sin(spin) + p.y * cos(spin)) * vec2(1.0, 0.6 + 0.8 * hash21(cell + 311.0));
  float grain = 1.0 - smoothstep(r - 0.5 * reach, r + 0.5 * reach, mix(length(p), 1.25 * max(abs(p.x), abs(p.y)), 0.7));
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

// How far the thaw has come: 0 while the frost holds, 1 when the last of it is water. The dew comes up with the thaw and never with the freeze.
float frostThaw() {
  return smoothstep(0.0, 0.15, uPlantDew) * (1.0 - uPlantFrost);
}

// x: the share of the pixel that is ice. y: the flash of the ice in it.
// 'at' is in meters on the skin. 'gather' is where frost grows first: 0 in the middle of a face to 1 at an edge, a tip or the ridge of a vein.
vec2 frostCrust(vec2 at, float gather, vec3 N, vec3 F, vec3 view, float sheen, float rim) {
  float up = saturate(F.y);
  // Round a stalk the place on the skin runs one way only: the way the skin faces breaks the rings that would give.
  vec2 round = at + 0.003 * vec2(N.x + N.y, N.z - N.y);
  float bank = valueNoise(round * (1.0 / 0.006));
  float fine = valueNoise(round * (1.0 / 0.0013) + 17.0);
  vec2 g = at * (1.0 / FROST_GRAIN_M);
  // A grain finer than the pixel is its share of the pixel: it never flickers.
  float reach = length(fwidth(g));
  float seen = 1.0 - smoothstep(0.4, 1.2, reach * (FROST_GRAIN_M / 0.0013));
  float ragged = gather + 0.3 * (bank - 0.5) + 0.16 * (fine - 0.5) * seen;
  // It comes in from the edges and the ridges, and the open face is the last to whiten.
  float front = mix(1.2 - 2.0 * uPlantFrost, -0.8, smoothstep(0.0, 0.15, uPlantDew));
  float come = smoothstep(front, front + 0.3, ragged);
  // It goes first where the sun is on it and where it is thin, and the thick fringe is the last ice on the leaf.
  float turn = 0.5 * (1.0 - dot(N, uSunDir)) * 0.5 + 0.3 * bank + 0.25 * smoothstep(0.3, 0.9, ragged);
  float held = come * (1.0 - smoothstep(turn, turn + 0.3, 1.15 * frostThaw()));
  // The fringe: a crust that closes along the margin, the tip and the ridge of each vein.
  float fringe = smoothstep(0.76, 0.98, ragged) * mix(0.6, 0.15 + 0.85 * fine * fine, seen);
  // The sugar: grains that stand apart on the face, thin in the middle of it, with the green between them.
  float thick = saturate(0.36 + 0.3 * up * up + 0.6 * gather + 0.45 * (bank * bank - 0.3));
  float veil = 0.012 + 0.05 * thick * (0.4 + 1.2 * bank * bank) * (0.6 + 0.4 * sheen);
  float sharp = 1.0 - smoothstep(0.35, 1.1, reach);
  float chance = 0.9 * thick;
  float most = 0.13 + 0.15 * thick;
  vec2 dust = frostGrain(g, reach, chance, 0.06, most, N, view);
  float mean = chance * 2.6 * (0.06 * 0.06 + 0.06 * most + most * most) / 3.0;

  float wide = FROST_GRAIN_M / FROST_BEAD_M;
  // Frozen beads stand where the dew stood: along edges, tips and veins, not on an open face.
  float lone = (0.08 + 0.17 * up) * smoothstep(0.35, 0.8, gather);
  vec2 bead = frostGrain(g * wide + 53.0, reach * wide, lone, 0.04, 0.1, N, view);
  float still = 1.0 - smoothstep(0.35, 1.1, reach * wide);
  float ice = 0.85 * mix(mean, dust.x, sharp) + mix(lone * 0.014, bead.x, still);
  return vec2(saturate(veil + ice + fringe + 0.3 * rim * (0.55 + 0.45 * sheen)), dust.y * sharp + 2.0 * bead.y * still + 0.02 * fringe * fine) * held;
}
`
