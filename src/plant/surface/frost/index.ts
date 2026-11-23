// Frost on the skin: a thin veil, grains of ice that stand apart, frozen beads, and the flash of a grain turned to the sun.
export const frostGlsl = /* glsl */ `
const float FROST_GRAIN_M = 0.0012;
const float FROST_BEAD_M = 0.0034;
const vec3 FROST_RIME = vec3(0.74, 0.79, 0.86);
const float FROST_FLASH = 5.0;
const vec3 FROST_COLD = vec3(0.45, 1.2, 0.5);
// The share of the sun that the rime on the down of a round body sends on, on the sun's side.
const float FROST_SIDE = 0.12;
const float FROST_DOWN = 0.3;
const float FROST_MATT = 0.8;
const float FROST_BLOOM = 0.6;
// The share of the sun a frozen blade no longer passes.
const float FROST_SHUT = 0.4;
// The sugar a close lens sees: the cells of its two sizes of chip in meters, how sharply a chip's face mirrors the sun, and how bright against the flash of a grain.
const float FROST_CHIP_M = 0.00052;
const float FROST_FINE_M = 0.00023;
const float FROST_DUST_M = 0.00011;
const float FROST_CHIP_SHARP = 600.0;
const float FROST_CHIP_FLASH = 4.0;
// A chip is clear ice: the sun goes through it from any side and it stands pale on a face the sun does not reach. Its light as a share of the flash of a grain.
const float FROST_CHIP_LIT = 0.03;
// The share of the skin the coat hides at the hold, seen close: in the middle of a field of the blade, and at its edge and along a vein.
const float FROST_COAT_FIELD = 0.5;
const float FROST_COAT_EDGE = 0.9;
const float FROST_COAT_BED = 0.55;

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
  // No two grains are as thick: one alone on a bare skin is a faint fleck, not a white tile.
  float grain = (1.0 - smoothstep(r - 0.5 * reach - 0.3 * r, r + 0.5 * reach, mix(length(p), 1.25 * max(abs(p.x), abs(p.y)), 0.35))) * (0.25 + 0.75 * hash21(cell + 401.0) * hash21(cell + 433.0));
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

// Seen close the coat is grains of ice, each with its own tilt: x its share of the pixel, y the flash of the one face that mirrors the sun to the eye.
vec2 frostChip(vec2 g, float reach, float chance, vec3 N, vec3 view) {
  vec2 cell = floor(g);
  float there = hash21(cell + 19.0);
  // A grain finer than the pixel is its share of the pixel.
  float mean = chance * 0.36;
  float sharp = 1.0 - smoothstep(0.45, 1.2, reach);
  if (sharp <= 0.0) return vec2(mean, 0.0);
  if (there >= chance) return vec2(mean * (1.0 - sharp), 0.0);
  float r = mix(0.24, 0.5, hash21(cell + 43.0));
  vec2 p = g - cell - (vec2(r) + (1.0 - 2.0 * r) * vec2(hash21(cell + 77.0), hash21(cell + 131.0)));
  float spin = 6.2832 * hash21(cell + 263.0);
  p = vec2(p.x * cos(spin) - p.y * sin(spin), p.x * sin(spin) + p.y * cos(spin)) * vec2(1.0, 0.6 + 0.8 * hash21(cell + 317.0));
  // A grain has corners and a slope: thick and white on one side, thinner on the other.
  float d = mix(length(p), 1.3 * max(abs(p.x), abs(p.y)), 0.6);
  float chip = (1.0 - smoothstep(r - 0.5 * reach - 0.2 * r, r + 0.5 * reach, d)) * mix(0.62, 1.0, smoothstep(-0.12, 0.12, p.x / r)) * (0.8 + 0.2 * hash21(cell + 409.0));
  vec3 facet = normalize(N + 1.8 * (vec3(hash21(cell + 157.0), hash21(cell + 199.0), hash21(cell + 233.0)) - 0.5));
  float flash = pow(saturate(dot(facet, normalize(uSunDir + view))), FROST_CHIP_SHARP);
  return vec2(mix(mean, chip, sharp), sharp * flash * (1.0 - smoothstep(0.0, 0.5 * r + reach, d)));
}

// The three sizes of grain at a place: x their share of the pixel, y their flash. 'skin' is how many meters of the skin's own measure a true meter is, 'want' the share of the skin the coat should hide.
vec3 frostSugar(vec2 at, float pixel, float skin, float want, vec3 N, vec3 view) {
  vec2 chips = frostChip(at * (1.0 / (FROST_CHIP_M * skin)) + 91.0, pixel / (FROST_CHIP_M * skin), 0.55 * want, N, view);
  vec2 sugar = frostChip(at * (1.0 / (FROST_FINE_M * skin)) + 37.0, pixel / (FROST_FINE_M * skin), saturate(1.1 * want), N, view);
  vec2 dust = frostChip(at * (1.0 / (FROST_DUST_M * skin)) + 11.0, pixel / (FROST_DUST_M * skin), saturate(1.5 * want), N, view);
  return vec3(1.0 - (1.0 - chips.x) * (1.0 - sugar.x) * (1.0 - dust.x), chips.y + 0.6 * sugar.y + 0.3 * dust.y, 0.0);
}

// How far along its blade the skin being shaded lies, 0 at the stalk and 1 at the tip. A wearer that knows sets it before it shades; under 0 it is not known.
float frostAlong = -1.0;

// How far the thaw has come: 0 while the frost holds, 1 when the last of it is water. The dew comes up with the thaw and never with the freeze.
float frostThaw() {
  return smoothstep(0.0, 0.15, uPlantDew) * (1.0 - uPlantFrost);
}

// x: the share of the pixel that is ice. y: the flash of the ice in it.
// 'at' is in meters on the skin. 'gather' is where frost grows first: 0 in the middle of a face to 1 at an edge, a tip or the ridge of a vein.
// 'world' is the place in the world, for the true size of a pixel on the skin; 'near' is 0 for a caller that cannot say it.
vec2 frostCrustOn(vec2 at, float gather, vec3 N, vec3 F, vec3 view, float sheen, float rim, vec3 world, float near) {
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
  float thaw = frostThaw();
  float held = come * (1.0 - smoothstep(turn, turn + 0.3, 1.15 * thaw));
  // On a blade the thaw is one front that comes down from the tip, the same the crystals and the water keep, ragged, and soonest on the side the sun is on.
  if (frostAlong >= 0.0) held = come * (1.0 - saturate((thaw + (0.16 * (bank - 0.5) + 0.1 * (fine - 0.5) + 0.06 * dot(N, uSunDir)) * smoothstep(0.0, 0.1, thaw) - 0.75 * (1.0 - frostAlong)) / 0.12));
  // The fringe: a crust that closes along the margin, the tip and the ridge of each vein.
  float fringe = smoothstep(0.76, 0.98, ragged) * mix(0.6, 0.15 + 0.85 * fine * fine, seen);
  // The sugar: grains that stand apart on the face, thin in the middle of it, with the green between them.
  float thick = saturate(0.36 + 0.3 * up * up + 0.6 * gather + 0.45 * (bank * bank - 0.3));
  // The dusting: about a third of the upper face is pale at full frost. A thin veil all over, and banks of rime that lie thicker along the veins and the margin.
  float banks = smoothstep(0.5, 0.85, 0.6 * bank + 0.4 * fine + 0.35 * gather + 0.12 * up);
  float veil = 0.02 + 0.08 * thick * (0.4 + 1.2 * bank * bank) * (0.6 + 0.4 * sheen) + 0.22 * banks * (0.55 + 0.45 * fine);
  float sharp = 1.0 - smoothstep(0.35, 1.1, reach);
  // Fewer than one grain to a cell, or the cells show as a lattice of dots.
  float chance = 0.6 * thick;
  float least = 0.05;
  float most = 0.12 + 0.16 * thick;
  vec2 dust = frostGrain(g, reach, chance, least, most, N, view);
  float mean = 0.44 * chance * 2.6 * (least * least + least * most + most * most) / 3.0;

  float wide = FROST_GRAIN_M / FROST_BEAD_M;
  // Frozen beads stand where the dew stood: along edges, tips and veins, not on an open face.
  float lone = (0.08 + 0.17 * up) * smoothstep(0.35, 0.8, gather);
  vec2 bead = frostGrain(g * wide + 53.0, reach * wide, lone, 0.04, 0.1, N, view);
  float still = 1.0 - smoothstep(0.35, 1.1, reach * wide);
  float ice = 0.85 * mix(mean, dust.x, sharp) + mix(lone * 0.014, bead.x, still);
  vec2 crust = vec2(veil + ice + fringe + 0.3 * rim * (0.55 + 0.45 * sheen), dust.y * sharp + 2.0 * bead.y * still + 0.02 * fringe * fine);
  // A close lens tells the sugar apart: chips that lie thickest beside the veins and at the margin and thin out toward the middle of each field, where the green shows between them.
  // How close is told by the angle between the lines of sight of two pixels and the way to the skin, never by the slope of the skin: every fold of a blade is as close as the blade.
  vec3 ray = world - uCamPos;
  float close = near * smoothstep(8.0, 16.0, 1.08 / max(length(ray) * length(dFdy(normalize(ray))) * uSize.y, 1e-9));
  if (close > 0.0) {
    // The coat hides most of the skin at an edge and along a vein and a third of it in the middle of a field, in banks, so the veins still read through it as lines of thicker grain.
    float want = saturate(mix(FROST_COAT_FIELD, FROST_COAT_EDGE, smoothstep(0.0, 0.75, gather)) + 0.3 * (bank - 0.45)) * (0.45 + 0.55 * smoothstep(-0.3, 0.2, F.y));
    // The skin is measured as the grown blade's: on a young one a meter of it is a fraction of a true meter. The grains keep their true size, so they are laid on the size of cell nearest to it, and between two sizes on both.
    vec2 ax = dFdx(at);
    vec2 ay = dFdy(at);
    float level = 0.5 * log2(max(abs(ax.x * ay.y - ax.y * ay.x), 1e-20) / max(length(cross(dFdx(world), dFdy(world))), 1e-20));
    float lower = exp2(floor(level));
    float upper = smoothstep(0.3, 0.7, fract(level));
    vec3 laid = vec3(0.0);
    if (upper < 1.0) laid += (1.0 - upper) * frostSugar(at, reach * FROST_GRAIN_M, lower, want, N, view);
    if (upper > 0.0) laid += upper * frostSugar(at, reach * FROST_GRAIN_M, 2.0 * lower, want, N, view);
    // Between the grains lies ice too fine to tell, thickest where the grains are.
    float bed = FROST_COAT_BED * want * (0.6 + 0.8 * fine);
    crust.x = mix(crust.x, max(crust.x, bed + (1.0 - bed) * laid.x), close);
    crust.y += close * (FROST_CHIP_FLASH * laid.y + FROST_CHIP_LIT * laid.x);
  }
  return vec2(saturate(crust.x), crust.y) * held;
}

vec2 frostCrust(vec2 at, float gather, vec3 N, vec3 F, vec3 view, float sheen, float rim, vec3 world) {
  return frostCrustOn(at, gather, N, F, view, sheen, rim, world, 1.0);
}

vec2 frostCrust(vec2 at, float gather, vec3 N, vec3 F, vec3 view, float sheen, float rim) {
  return frostCrustOn(at, gather, N, F, view, sheen, rim, vec3(0.0), 0.0);
}
`
