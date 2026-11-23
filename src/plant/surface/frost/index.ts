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
// The coat a close lens sees. The cells of its two sizes of crystal and of the two sizes of grain under them, in meters; how high a crystal stands, for its shadow; the share of the crystals that are plates and not tufts of needles.
const float FROST_FORM_M = 0.0022;
const float FROST_FORM_FINE_M = 0.001;
const float FROST_FINE_M = 0.0004;
const float FROST_DUST_M = 0.00016;
const float FROST_FORM_HIGH_M = 0.0002;
const float FROST_PLATES = 0.25;
// How sharply a crystal's face mirrors the sun, and how bright against the flash of a grain.
const float FROST_CHIP_SHARP = 600.0;
const float FROST_CHIP_FLASH = 2.0;
// The share of the skin the coat hides at the hold, seen close: in the middle of a field of the blade, and at its edge and along a vein. How pale the sugar under the crystals is, and how much of that a crystal's shadow takes.
const float FROST_COAT_FIELD = 0.5;
const float FROST_COAT_EDGE = 0.85;
const float FROST_COAT_BED = 0.72;
// How far the coat has come where the close lens first sees it, and the share of the far veil that still lies under it there.
const float FROST_COAT_FIRST = 0.4;
const float FROST_COAT_UNDER = 0.4;
const float FROST_FORM_SHADE = 0.8;

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

// A crystal of the coat, one to a cell and whole inside it: a fan of one to four short needles from one foot, or a plate. x: its share of the pixel. y: how pale it is there, a face in the light against one turned away. z: the flash of the one face that mirrors the sun to the eye.
vec3 frostForm(vec2 g, float reach, float chance, float grown, vec3 N, vec3 view) {
  vec2 cell = floor(g);
  if (hash21(cell + 19.0) >= chance) return vec3(0.0);
  // Each starts at its own moment and grows to its own size.
  float start = 0.5 * hash21(cell + 43.0);
  float size = smoothstep(start, start + 0.5, grown) * (0.45 + 0.55 * hash21(cell + 59.0));
  if (size <= 0.0) return vec3(0.0);
  float most = 0.42 * size;
  vec2 p = g - cell - 0.5 - (0.47 - most) * (2.0 * vec2(hash21(cell + 77.0), hash21(cell + 131.0)) - 1.0);
  float spin = 6.2832 * hash21(cell + 263.0);
  float cover = 0.0;
  float pale = 0.0;
  if (hash21(cell + 317.0) < FROST_PLATES) {
    vec2 r = vec2(p.x * cos(spin) - p.y * sin(spin), p.x * sin(spin) + p.y * cos(spin));
    float across = 0.55 * most;
    vec2 q = abs(r);
    float d = max(0.866 * q.x + 0.5 * q.y, q.y);
    cover = 1.0 - smoothstep(across - 0.5 * reach, across + 0.5 * reach, d);
    // A plate lies tilted: one half of it is up in the light, the other turned from it.
    pale = mix(0.45, 1.0, smoothstep(-0.25 * across, 0.25 * across, r.x)) + 0.2 * smoothstep(0.7 * across, across, d);
  } else {
    float count = 1.0 + floor(3.99 * hash21(cell + 367.0));
    for (int i = 0; i < 4; i++) {
      float n = float(i);
      if (n >= count) break;
      float angle = spin + 2.6 * (hash21(cell + 409.0 + 13.0 * n) - 0.5);
      vec2 dir = vec2(cos(angle), sin(angle));
      float span = most * (i == 0 ? 1.0 : 0.45 + 0.55 * hash21(cell + 433.0 + 17.0 * n));
      float t = clamp(dot(p, dir) / span, 0.0, 1.0);
      float wide = (0.045 + 0.06 * size) * (1.0 - 0.8 * t);
      float c = (1.0 - smoothstep(wide - 0.5 * reach, wide + 0.5 * reach, length(p - dir * (span * t)))) * min(1.0, 2.0 * wide / max(reach, 1e-5));
      // A needle has a ridge: the side of it turned from the light is grey.
      float tone = (dot(p, vec2(-dir.y, dir.x)) > 0.0 ? 1.0 : 0.5) * (0.8 + 0.2 * hash21(cell + 457.0 + 19.0 * n));
      if (c * tone > cover * pale) {
        cover = c;
        pale = tone;
      }
    }
  }
  vec3 facet = normalize(N + 1.8 * (vec3(hash21(cell + 157.0), hash21(cell + 199.0), hash21(cell + 233.0)) - 0.5));
  float flash = pow(saturate(dot(facet, normalize(uSunDir + view))), FROST_CHIP_SHARP);
  return vec3(cover, min(pale, 1.0), flash * cover);
}

// The coat at a place: x how pale the skin is under it, y its flash. 'skin' is how many meters of the skin's own measure a true meter is, 'want' the share of the skin the coat hides, 'grown' how far it has come, 'shade' the step on the skin toward the sun that a crystal's height throws its shadow back along.
vec2 frostCoat(vec2 at, float pixel, float skin, float want, float grown, vec2 shade, vec3 N, vec3 view) {
  vec2 q = at * (1.0 / skin);
  vec2 off = shade * (1.0 / skin);
  float px = pixel / skin;
  // Under the crystals lies a sugar of grains that stand apart, the skin bare between them: two sizes, turned against each other so they never stand in rows, fewer where the coat thins.
  vec2 q1 = vec2(0.8 * q.x + 0.6 * q.y, 0.8 * q.y - 0.6 * q.x);
  vec2 q2 = vec2(0.6 * q.x - 0.8 * q.y, 0.6 * q.y + 0.8 * q.x);
  float n = 0.6 * valueNoise(q1 * (1.0 / FROST_FINE_M) + 37.0) + 0.4 * valueNoise(q2 * (1.0 / FROST_DUST_M) + 11.0);
  float share = want * smoothstep(0.0, 1.0, grown);
  float cut = 0.5 - 0.55 * (share - 0.5);
  float soft = 0.02 + 0.25 * px / FROST_DUST_M;
  float grains = smoothstep(cut - soft, cut + soft, n) * (0.7 + 0.3 * valueNoise(q2 * (1.3 / FROST_DUST_M) + 5.0));
  grains = mix(grains, 0.85 * share, smoothstep(0.7, 1.8, px / FROST_DUST_M));
  // On it stand the crystals a lens can tell apart, two sizes of them, each with its shadow on the sugar beside it.
  float far = 1.0 - smoothstep(0.25, 0.7, px / FROST_FORM_M);
  vec3 big = vec3(0.0);
  vec3 small = vec3(0.0);
  float dark = 0.0;
  if (far > 0.0) {
    vec2 b = q2 * (1.0 / FROST_FORM_M) + 91.0;
    vec2 f = q1 * (1.0 / FROST_FORM_FINE_M) + 37.0;
    float many = 0.45 + 0.5 * want;
    float more = 0.55 + 0.4 * want;
    big = frostForm(b, px / FROST_FORM_M, many, grown, N, view);
    small = frostForm(f, px / FROST_FORM_FINE_M, more, grown, N, view);
    vec2 turned = vec2(0.6 * off.x - 0.8 * off.y, 0.6 * off.y + 0.8 * off.x);
    vec2 turned1 = vec2(0.8 * off.x + 0.6 * off.y, 0.8 * off.y - 0.6 * off.x);
    dark = max(frostForm(b + turned * (1.0 / FROST_FORM_M), px / FROST_FORM_M, many, grown, N, view).x, frostForm(f + 0.6 * turned1 * (1.0 / FROST_FORM_FINE_M), px / FROST_FORM_FINE_M, more, grown, N, view).x);
    dark *= (1.0 - big.x) * (1.0 - small.x) * far;
  }
  float forms = max(big.x * big.y, small.x * small.y) * far;
  // Too far to tell them, the crystals are their share of the sugar.
  float bed = FROST_COAT_BED * grains * (1.0 - FROST_FORM_SHADE * dark) + (1.0 - far) * 0.12 * share;
  return vec2(max(bed, forms), (big.z + 0.6 * small.z) * far);
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
  // How close is told by the angle between the lines of sight of two pixels and the way to the skin, never by the slope of the skin: every fold of a blade is as close as the blade.
  vec3 ray = world - uCamPos;
  float close = near * smoothstep(8.0, 16.0, 1.08 / max(length(ray) * length(dFdy(normalize(ray))) * uSize.y, 1e-9));
  vec2 ax = dFdx(at);
  vec2 ay = dFdy(at);
  vec3 wx = dFdx(world);
  vec3 wy = dFdy(world);
  if (close > 0.0) {
    // A close lens tells the coat apart. It hides most of the skin at an edge and along a vein and a third of it in the middle of a field, in banks, so the veins read through it as lines of thicker grain.
    float want = saturate(mix(FROST_COAT_FIELD, FROST_COAT_EDGE, smoothstep(0.0, 0.75, gather)) + 0.3 * (bank - 0.45)) * (0.85 + 0.15 * smoothstep(-0.3, 0.2, F.y));
    // It is the last of the frost to come, over the last third of the freeze: from the edge and the veins inward, and the fields between the veins last.
    float late = mix(mix(FROST_COAT_FIRST, 1.0, saturate((uPlantFrost - 0.7) / 0.3)), 1.0, smoothstep(0.0, 0.15, uPlantDew));
    float grown = saturate((late - 0.45 * saturate(1.0 - smoothstep(0.0, 0.75, gather) + 0.5 * (bank - 0.5))) / 0.55);
    // The skin is measured as the grown blade's: on a young one a meter of it is a fraction of a true meter. The crystals keep their true size, so they are laid on the size of cell nearest to it, and between two sizes on both.
    float level = 0.5 * log2(max(abs(ax.x * ay.y - ax.y * ay.x), 1e-20) / max(length(cross(wx, wy)), 1e-20));
    float lower = exp2(floor(level));
    float upper = smoothstep(0.3, 0.7, fract(level));
    // The step on the skin toward the sun, for the shadows.
    vec3 low = uSunDir - F * dot(F, uSunDir);
    float xx = dot(wx, wx);
    float xy = dot(wx, wy);
    float yy = dot(wy, wy);
    vec2 toSun = ((yy * dot(wx, low) - xy * dot(wy, low)) * ax + (xx * dot(wy, low) - xy * dot(wx, low)) * ay) / max(xx * yy - xy * xy, 1e-24);
    vec2 shade = toSun * (FROST_FORM_HIGH_M / max(abs(dot(F, uSunDir)), 0.3));
    vec2 laid = vec2(0.0);
    if (upper < 1.0) laid += (1.0 - upper) * frostCoat(at, reach * FROST_GRAIN_M, lower, want, grown, shade, N, view);
    if (upper > 0.0) laid += upper * frostCoat(at, reach * FROST_GRAIN_M, 2.0 * lower, want, grown, shade, N, view);
    crust.x = mix(crust.x, max(FROST_COAT_UNDER * crust.x, laid.x), close);
    crust.y += close * FROST_CHIP_FLASH * laid.y;
  }
  return vec2(saturate(crust.x), crust.y) * held;
}

vec2 frostCrust(vec2 at, float gather, vec3 N, vec3 F, vec3 view, float sheen, float rim, vec3 world) {
  return frostCrustOn(at, gather, N, F, view, sheen, rim, world, 1.0);
}
`
