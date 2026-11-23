// The thaw's front on a blade, for any shader that has uPlantFrost and uPlantDew: it needs no texture and no normal, so the seat of a bead can ask it.
export const frostFrontGlsl = /* glsl */ `
// How far the front has to travel from the tip to the stalk, and how much longer the thick coat by the stalk lasts, in the measure of the thaw.
const float FROST_TRAVEL = 0.75;
const float FROST_LASTS = 0.15;
const float FROST_EDGE_LASTS = 0.07;

// How far the thaw has come: 0 while the frost holds, 1 when the last of it is water. The dew comes up with the thaw and never with the freeze.
float frostThaw() {
  return smoothstep(0.0, 0.15, uPlantDew) * (1.0 - uPlantFrost);
}

// How far the front has come past a place along a blade, 0 at the stalk and 1 at the tip, in the middle of what the grain of the coat does to it: under 0 the ice holds there. The ice itself may hold up to 0.31 past this at a margin by the stalk, 0.26 at a margin elsewhere and 0.19 on an open face, and is gone 0.12 after that.
float frostPastAlong(float along) {
  return frostThaw() - FROST_TRAVEL * (1.0 - along) - 0.675 * FROST_LASTS * (1.0 - smoothstep(0.1, 0.45, along));
}
`

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
const float FROST_SHUT = 0.75;
// The coat a close lens sees. The cells of its two sizes of crystal and of the two sizes of grain under them, in meters; how high a crystal stands, for its shadow; the share of the crystals that are plates and not tufts of needles.
const float FROST_FORM_FINE_M = 0.001;
const float FROST_FINE_M = 0.0005;
const float FROST_GRIT_M = 0.0002;
const float FROST_DUST_M = 0.00013;
const float FROST_MOTE_M = 0.00008;
const float FROST_FORM_HIGH_M = 0.00012;
// How sharply a crystal's face mirrors the sun, and how bright against the flash of a grain.
const float FROST_CHIP_SHARP = 1400.0;
const float FROST_CHIP_FLASH = 3.0;
const float FROST_PLATE_FLASH = 6.0;
// The upper face of a crystal: how far it tilts from the skin, how sharply it mirrors the sun in its wide glow and in its flare, and the glow against the flare.
const float FROST_FACE_TILT = 1.6;
const float FROST_FACE_SHARP = 120.0;
const float FROST_FACE_CORE = 4000.0;
const float FROST_FACE_GLOW = 0.5;
// The cells of the grains with faces and of the plates, in meters: a grain is up to 0.6 mm across, a plate up to 1.6 mm.
const float FROST_CHIP_M = 0.0008;
const float FROST_PLATE_M = 0.0021;
// How pale a face turned from the light is against one turned to it, and how far the foot's shade reaches, in the crystal's own size.
const float FROST_FACE_MID = 0.8;
// The sun on a face of ice turned to it, against the flash of a face that mirrors it.
const float FROST_FACE_SUN = 0.09;
// Of the faces that flash, the share that mirror the sky, and the color of that flash.
const float FROST_SKY_SHARE = 0.2;
const float FROST_SKY_UP = 0.5;
const float FROST_SKY_THAW = 0.8;
const float FROST_SKY_SHADE = 7.0;
const vec3 FROST_SKY_SPARK = vec3(0.88, 0.95, 1.12);
const float FROST_FOOT = 0.3;
// The share of the skin the coat hides at the hold, seen close: in the middle of a field of the blade, and at its edge and along a vein. How pale the sugar under the crystals is, and how much of that a crystal's shadow takes.
const float FROST_COAT_FIELD = 0.55;
const float FROST_COAT_EDGE = 0.92;
const float FROST_COAT_BED = 1.0;
const float FROST_COAT_THIN = 0.18;
const float FROST_GRIT_FLASH = 7.0;
// How far the coat has come where the close lens first sees it, and the share of the far veil that still lies under it there.
const float FROST_COAT_FIRST = 0.8;
const float FROST_COAT_FLASH = 2.0;
const float FROST_COAT_UNDER = 0.2;
// The banks the coat lies in on an open field, in meters across.
const float FROST_BANK_M = 0.0035;
const float FROST_TONGUE_M = 0.011;
const float FROST_FORM_SHADE = 0.3;
// How pale the side of a grain turned from the light is against the lit side, and how sharply its face mirrors the sun.
const float FROST_GRIT_SHADE = 0.4;
// Heaped on a ridge the grains lie on grains, and the dark side of one is the pale of another.
const float FROST_GRIT_HEAPED = 0.75;
const float FROST_GRIT_SHARP = 450.0;
// How far behind the thaw's front the skin is still wet, and where it is dry again, in the measure of the thaw.
const float FROST_WET_FROM = 0.3;
const float FROST_WET_UNTIL = 0.7;
// The size of a millimeter on a frame of 1080 lines from which the coat is told apart, and from which it is whole: a grain of the sugar is then a pixel and more.
const float FROST_CLOSE_AHEAD = 0.3;
const float FROST_CLOSE_FROM = 8.0;
const float FROST_CLOSE_WHOLE = 16.0;
// Under this much frost the ice that is left thins with it.
const float FROST_WHOLE_LEAST = 0.25;

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

// Where a place lies in a crystal with flat sides: 0 at its middle, 1 on a side. 'sides' of them round the middle, 'r' from the middle to a corner.
float frostSided(vec2 q, float r, float sides) {
  float seg = 6.2832 / sides;
  return length(q) * cos(mod(atan(q.y, q.x) + 3.1416, seg) - 0.5 * seg) / (r * cos(0.5 * seg));
}

// A crystal with flat faces, one to a cell and whole inside it: a grain of three to six sides, or one drawn out into a stubby blade. Each face has one tone, pale where it is turned to the light and mid where not, and its own moment at which it mirrors the sun to the eye.
// x: its share of the pixel. y: how pale it is there. z: the flash of the face. w: the shade its foot throws on what lies beside it, away from the light. 'lit' is the way to the light along the skin, 'blades' the share that are blades. more.x: the part of the flash that mirrors the sky and not the sun, more.y: the share of the pixel that is a face turned to the sun.
vec4 frostChip(vec2 g, float reach, float chance, float grown, float packed, float blades, vec2 lit, vec3 N, vec3 view, out vec2 more) {
  more = vec2(0.0);
  // They do not stand in rows: the ground is pulled about by a third of a cell.
  g += 0.35 * (vec2(valueNoise(g * 0.37 + 7.0), valueNoise(g * 0.37 + 19.0)) - 0.5);
  vec2 cell = floor(g);
  float h = hash21(cell + 19.0);
  if (h >= chance) return vec4(0.0);
  // Each starts at its own moment and grows to its own size.
  float start = 0.4 * hash21(cell + 43.0);
  // Most are small and a few large, and where the coat is closed they are a little larger.
  float most = hash21(cell + 59.0);
  float r = min(0.45, 0.38 * (0.4 + 0.6 * smoothstep(start, start + 0.6, grown)) * (0.35 + 0.65 * most * most) * (1.0 + 0.3 * packed)) * smoothstep(0.0, 0.1, chance - h);
  if (r <= 0.0) return vec4(0.0);
  vec2 p = g - cell - 0.5 - max(0.0, 0.49 - r * (1.0 + FROST_FOOT)) * (2.0 * vec2(hash21(cell + 77.0), hash21(cell + 131.0)) - 1.0);
  float spin = 6.2832 * hash21(cell + 263.0);
  float co = cos(spin);
  float si = sin(spin);
  bool blade = hash21(cell + 317.0) < blades;
  float sides = blade ? 4.0 : 3.0 + floor(3.99 * hash21(cell + 367.0));
  // A blade is a grain of four sides drawn out to three or four times its width.
  vec2 thin = vec2(1.0, blade ? 3.0 + 1.5 * hash21(cell + 409.0) : 1.0);
  vec2 q = vec2(p.x * co - p.y * si, p.x * si + p.y * co);
  vec2 to = vec2(lit.x * co - lit.y * si, lit.x * si + lit.y * co);
  float soft = 0.5 * reach * thin.y / (r * cos(3.1416 / sides));
  float inside = frostSided(q * thin, r, sides);
  float cover = 1.0 - smoothstep(1.0 - soft, 1.0 + soft, inside);
  float foot = (1.0 - smoothstep(0.7, 1.0 + soft, frostSided(q * thin + to * (FROST_FOOT * r + reach), r, sides))) * (1.0 - cover);
  if (cover <= 0.0) return vec4(0.0, 0.0, 0.0, foot);
  float seg = 6.2832 / sides;
  float face = floor((atan(q.y * thin.y, q.x) + 3.1416) / seg);
  float way = (face + 0.5) * seg - 3.1416;
  float own = hash21(cell + 457.0 + 19.0 * face);
  float turned = smoothstep(-0.15, 0.35, dot(normalize(vec2(cos(way), sin(way) * thin.y)), to));
  // No two crystals are as pale: each is a little clearer or whiter than the next.
  float tone = mix(FROST_FACE_MID, 1.0, turned) * (0.84 + 0.16 * hash21(cell + 613.0)) * (0.92 + 0.08 * own);
  // The edge it turns to the light is its brightest part.
  tone = mix(tone, 1.0, turned * smoothstep(0.5, 0.9, inside));
  // Its flat upper face lies nearly as the skin does, tilted its own way: it mirrors the sun to the eye over a wide angle faintly and over a narrow one hard, so it glows, flares as the lens passes its angle and dies down again.
  vec3 facet = normalize(N + FROST_FACE_TILT * (vec3(hash21(cell + 163.0), hash21(cell + 199.0), hash21(cell + 233.0)) - 0.5));
  float mirror = saturate(dot(facet, normalize(uSunDir + view)));
  float flash = FROST_FACE_GLOW * pow(mirror, FROST_FACE_SHARP) + pow(mirror, FROST_FACE_CORE);
  // The face is brightest at one point of it and falls off toward its edge.
  vec2 spot = 0.35 * r * (2.0 * vec2(hash21(cell + 541.0), hash21(cell + 577.0)) - 1.0);
  vec2 off = (q * thin - spot) * (1.0 / r);
  flash *= cover * (0.03 + 0.97 * exp(-5.0 * dot(off, off))) * smoothstep(2.0, 3.0, r / max(reach, 1e-6));
  more = vec2(hash21(cell + 521.0) < FROST_SKY_SHARE ? flash : 0.0, cover * (0.4 + 0.6 * turned) * (0.5 + 0.5 * own));
  return vec4(cover, tone, flash, foot);
}

// A crystal of the coat, one to a cell and whole inside it: a fan of one to four short needles from one foot. x: its share of the pixel. y: how pale it is there, a face in the light against one turned away. z: the flash of the one face that mirrors the sun to the eye.
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
  float count = 1.0 + floor(3.99 * hash21(cell + 367.0));
  for (int i = 0; i < 4; i++) {
    float n = float(i);
    if (n >= count) break;
    float angle = spin + 2.6 * (hash21(cell + 409.0 + 13.0 * n) - 0.5);
    vec2 dir = vec2(cos(angle), sin(angle));
    float span = most * (i == 0 ? 1.0 : 0.45 + 0.55 * hash21(cell + 433.0 + 17.0 * n));
    float t = clamp(dot(p, dir) / span, 0.0, 1.0);
    float wide = (0.03 + 0.035 * size) * (1.0 - 0.8 * t);
    float c = (1.0 - smoothstep(wide - 0.5 * reach, wide + 0.5 * reach, length(p - dir * (span * t)))) * min(1.0, 2.0 * wide / max(reach, 1e-5));
    // A needle has a ridge: the side of it turned from the light is grey.
    float tone = (dot(p, vec2(-dir.y, dir.x)) > 0.0 ? 1.0 : 0.5) * (0.8 + 0.2 * hash21(cell + 457.0 + 19.0 * n));
    if (c * tone > cover * pale) {
      cover = c;
      pale = tone;
    }
  }
  vec3 facet = normalize(N + 1.8 * (vec3(hash21(cell + 157.0), hash21(cell + 199.0), hash21(cell + 233.0)) - 0.5));
  float flash = pow(saturate(dot(facet, normalize(uSunDir + view))), FROST_CHIP_SHARP);
  return vec3(cover, min(pale, 1.0), flash * step(0.01, cover));
}

// A grain of the sugar, one to a cell and whole inside it, with corners, a side to the light and a side away. x: its share of the pixel. y: how pale it is there. z: the flash of its face, for the few that mirror the sun to the eye. 'lit' is the way to the light along the skin.
vec3 frostGrit(vec2 g, float reach, float chance, float packed, float heaped, vec2 lit, vec3 N, vec3 view) {
  vec2 cell = floor(g);
  float h = hash21(cell + 23.0);
  if (h >= chance) return vec3(0.0);
  // Where they pack close the grains are larger, and still each stands alone.
  float r = min(0.34, (0.15 + 0.3 * hash21(cell + 41.0) * hash21(cell + 47.0)) * (0.85 + 0.95 * packed)) * smoothstep(0.0, 0.12, chance - h);
  vec2 p = g - cell - vec2(r) - (1.0 - 2.0 * r) * vec2(hash21(cell + 67.0), hash21(cell + 109.0));
  float spin = 6.2832 * hash21(cell + 251.0);
  vec2 q = vec2(p.x * cos(spin) - p.y * sin(spin), p.x * sin(spin) + p.y * cos(spin)) * vec2(1.0, 0.7 + 0.7 * hash21(cell + 307.0));
  float cover = 1.0 - smoothstep(r - 0.5 * reach, r + 0.5 * reach, mix(length(q), 1.25 * max(abs(q.x), abs(q.y)), 0.5));
  // Its face looks its own way, fixed on the skin: it flashes while it mirrors the sun to the eye and goes out as the eye moves on.
  vec3 facet = normalize(N + 3.0 * (vec3(hash21(cell + 163.0), hash21(cell + 211.0), hash21(cell + 239.0)) - 0.5));
  float flash = pow(saturate(dot(facet, normalize(uSunDir + view))), FROST_GRIT_SHARP);
  return vec3(cover, mix(mix(FROST_GRIT_SHADE, FROST_GRIT_HEAPED, heaped), 1.0, smoothstep(-0.4 * r, 0.4 * r, dot(p, lit))) * (0.7 + 0.3 * hash21(cell + 353.0)), cover * flash * 6.0 * smoothstep(0.82, 0.95, hash21(cell + 379.0)) * (0.4 + 0.6 * hash21(cell + 397.0)) * smoothstep(1.3, 1.7, r / max(reach, 1e-6)));
}

// The coat at a place: x how pale the skin is under it, y its flash, z the part of the flash that mirrors the sky, w the share of the place that is ice turned to the sun. 'skin' is how many meters of the skin's own measure a true meter is, 'want' the share of the skin the coat hides, 'grown' how far it has come, 'shade' the step on the skin toward the sun that a crystal's height throws its shadow back along.
vec4 frostCoat(vec2 at, float pixel, float skin, float want, float heaped, float grown, vec2 shade, vec3 N, vec3 view) {
  vec2 q = at * (1.0 / skin);
  vec2 off = shade * (1.0 / skin);
  float px = pixel / skin;
  // The crystals do not stand in rows: the ground they are laid on is pulled about by a grain's width.
  q += FROST_GRIT_M * 0.9 * (vec2(valueNoise(q * (1.0 / 0.00045) + 3.0), valueNoise(q * (1.0 / 0.00045) + 29.0)) - 0.5);
  // The ground of the coat is a sugar of grains one can count, the skin between them: three sizes on grids turned against each other, packed where the coat is thick and fewer where it thins, so it ends in single grains. Nowhere is it a closed white.
  vec2 q1 = vec2(0.8 * q.x + 0.6 * q.y, 0.8 * q.y - 0.6 * q.x);
  vec2 q2 = vec2(0.6 * q.x - 0.8 * q.y, 0.6 * q.y + 0.8 * q.x);
  vec2 q3 = vec2(0.28 * q.x + 0.96 * q.y, 0.28 * q.y - 0.96 * q.x);
  float come = smoothstep(0.0, 1.0, grown);
  float share = want * come;
  float patchy = valueNoise(q1 * (1.0 / FROST_FINE_M) + 37.0);
  float heap = heaped * come;
  // Fewer than one grain to a cell, or the cells show as a lattice.
  float local = min(share * (0.45 + 1.1 * patchy) + 0.3 * heap, 0.78);
  float packed = max(smoothstep(0.25, 0.75, share), heap);
  vec2 lit = normalize(off + vec2(1e-9, 0.0));
  vec2 lit1 = vec2(0.8 * lit.x + 0.6 * lit.y, 0.8 * lit.y - 0.6 * lit.x);
  vec2 lit2 = vec2(0.6 * lit.x - 0.8 * lit.y, 0.6 * lit.y + 0.8 * lit.x);
  vec2 lit3 = vec2(0.28 * lit.x + 0.96 * lit.y, 0.28 * lit.y - 0.96 * lit.x);
  vec3 one = frostGrit(q1 * (1.0 / FROST_GRIT_M) + 37.0, px / FROST_GRIT_M, local, packed, heap, lit1, N, view);
  vec3 two = frostGrit(q2 * (1.0 / FROST_DUST_M) + 11.0, px / FROST_DUST_M, 0.9 * local, packed, heap, lit2, N, view);
  vec3 three = frostGrit(q3 * (1.0 / FROST_MOTE_M) + 71.0, px / FROST_MOTE_M, 0.8 * local, packed, heap, lit3, N, view);
  // A grain smaller than a pixel is its share of the pixel.
  float told = 1.0 - smoothstep(0.7, 1.4, px / FROST_GRIT_M);
  float fine = 1.0 - smoothstep(0.7, 1.4, px / FROST_DUST_M);
  float least = 1.0 - smoothstep(0.7, 1.4, px / FROST_MOTE_M);
  float mean = 0.3 * local * (0.6 + 0.8 * packed);
  float grains = max(max(mix(mean, one.x * one.y, told), mix(mean, two.x * two.y, fine)), mix(0.6 * mean, three.x * three.y, least));
  // Of the sugar only the largest grains flash: a spark is two pixels and more. Seen along the face the grains hide each other, and only the crystals that stand above them flash.
  float spark = FROST_GRIT_FLASH * one.z * told * smoothstep(0.1, 0.45, abs(dot(N, view)));
  // On the sugar lie the crystals a lens tells apart: grains with flat faces, a third to half a millimeter across, wherever the coat has any body, and plates and stubby blades of a millimeter where it is thick. Each shades the sugar at its foot.
  float far = 1.0 - smoothstep(0.25, 0.7, px / FROST_CHIP_M);
  // Under the grains lies a bloom of rime too fine to tell, thin enough for the green to show through: no skin a coat has reached reads as bare.
  float body = max(FROST_COAT_BED * grains, FROST_COAT_THIN * smoothstep(0.0, 0.25, share) * (0.7 + 0.6 * patchy) / mix(max(uPlantFrost, 0.6), 1.0, smoothstep(0.0, 0.15, uPlantDew)));
  float cool = 0.0;
  float sunny = grains * saturate(2.0 * max(max(one.y * told, two.y * fine), three.y * least) - 1.0);
  if (far > 0.0) {
    float thick = smoothstep(0.12, 0.6, share);
    // Where the coat is closed, at a margin and on a ridge, the sugar under the crystals is packed. The crystals lie in groups with the sugar between them.
    float closed = max(smoothstep(0.55, 0.85, share), heap);
    vec2 c = q2 * (1.0 / FROST_CHIP_M) + 91.0;
    vec2 chipMore;
    vec2 plateMore;
    float groups = smoothstep(0.3, 0.62, valueNoise(q2 * (1.0 / 0.0019) + 83.0));
    float clumps = smoothstep(0.35, 0.62, valueNoise(q3 * (1.0 / 0.0043) + 61.0));
    vec4 chip = frostChip(c, px / FROST_CHIP_M, min(0.9, thick * (0.2 + 0.75 * groups) * (0.6 + 0.6 * patchy) + 0.25 * closed * groups), grown, closed, 0.25, lit2, N, view, chipMore);
    vec2 f = q1 * (1.0 / FROST_FORM_FINE_M) + 37.0;
    vec3 fan = frostForm(f, px / FROST_FORM_FINE_M, min(1.0, 0.1 + 0.9 * want + 0.4 * heap), grown, N, view);
    vec2 b = q3 * (1.0 / FROST_PLATE_M) + 17.0;
    vec4 plate = frostChip(b, px / FROST_PLATE_M, min(0.85, smoothstep(0.2, 0.7, share) * (0.08 + 0.85 * clumps) * (0.6 + 0.6 * patchy) + 0.3 * closed * clumps), grown, closed, 0.5, lit3, N, view, plateMore);
    body = max(body, far * closed * (0.62 + 0.3 * valueNoise(q1 * (1.0 / FROST_GRIT_M) + 53.0)));
    body *= 1.0 - FROST_FORM_SHADE * far * chip.w;
    body = mix(body, chip.y, chip.x * far);
    body = max(body, fan.x * fan.y * far);
    body = mix(body * (1.0 - FROST_FORM_SHADE * far * plate.w), plate.y, plate.x * far);
    sunny = mix(mix(sunny, chipMore.y, chip.x * far), plateMore.y, plate.x * far);
    spark += far * (FROST_CHIP_FLASH * chip.z + 0.6 * fan.z + FROST_PLATE_FLASH * plate.z);
    cool = far * (FROST_CHIP_FLASH * chipMore.x + FROST_PLATE_FLASH * plateMore.x);
  }
  // Too far to tell them, the crystals are their share of the sugar.
  return vec4(body + (1.0 - far) * 0.25 * share, spark, cool, sunny);
}

// How far along its blade the skin being shaded lies, 0 at the stalk and 1 at the tip. A wearer that knows sets it before it shades; under 0 it is not known.
float frostAlong = -1.0;
// The tint of the flash at the skin last shaded, against the sun's own color.
vec3 frostSpark = vec3(1.0);
// The share of the sky's light that the upper faces of the crystals standing there take, over what the skin under them takes.
float frostSky = 0.0;

${frostFrontGlsl}
// How far the thaw's front has come past a place on a blade, in the measure of the thaw: under 0 the ice holds there.
float frostPast(float bank, float fine, float gather, vec3 N, float thaw) {
  // By the stalk the coat is thick, and thickest at the edge and along the veins: there a trace outlasts the front. The bank at a margin outlasts it a little everywhere.
  float lasts = FROST_LASTS * (1.0 - smoothstep(0.1, 0.45, frostAlong)) * (0.35 + 0.65 * smoothstep(0.1, 0.5, gather + 0.3 * (bank - 0.5))) + FROST_EDGE_LASTS * smoothstep(0.5, 0.9, gather + 0.3 * (bank - 0.5));
  return thaw + (0.16 * (bank - 0.5) + 0.1 * (fine - 0.5) + 0.06 * dot(N, uSunDir)) * smoothstep(0.0, 0.1, thaw) - FROST_TRAVEL * (1.0 - frostAlong) - lasts;
}

// How far the thaw has come past a place on any skin, in the measure of the thaw: under 0 the ice holds there. The crust keeps the same front.
float frostPastAt(vec2 at, float gather, vec3 N, float thaw) {
  vec2 round = at + 0.003 * vec2(N.x + N.y, N.z - N.y);
  float bank = valueNoise(round * (1.0 / 0.006));
  float fine = valueNoise(round * (1.0 / 0.0013) + 17.0);
  return frostAlong >= 0.0 ? frostPast(bank, fine, gather, N, thaw) : 0.4 * (1.15 * thaw - 0.25 * (1.0 - dot(N, uSunDir)) - 0.3 * bank - 0.25 * smoothstep(0.3, 0.9, gather + 0.3 * (bank - 0.5)));
}

// The skin the ice has just left: 0 where the coat still holds and where there was no frost, 1 just behind the front, and back to 0 as the skin dries.
float frostGone(vec2 at, float gather, vec3 N) {
  float thaw = frostThaw();
  if (thaw <= 0.0) return 0.0;
  float past = frostPastAt(at, gather, N, thaw);
  return smoothstep(0.0, 0.12, past) * (1.0 - smoothstep(FROST_WET_FROM, FROST_WET_UNTIL, past));
}

// The skin the ice still holds: 1 before the thaw and ahead of its front, 0 behind it for good.
float frostLeft(vec2 at, float gather, vec3 N) {
  float thaw = frostThaw();
  if (thaw <= 0.0) return 1.0;
  return 1.0 - smoothstep(0.0, 0.12, frostPastAt(at, gather, N, thaw));
}

// x: the share of the pixel that is ice. y: the flash of the ice in it.
// 'at' is in meters on the skin. 'gather' is where frost grows first: 0 in the middle of a face to 1 at an edge, a tip or the ridge of a vein.
// 'world' is the place in the world, for the true size of a pixel on the skin; 'near' is 0 for a caller that cannot say it.
vec2 frostCrustOn(vec2 at, float gather, vec3 N, vec3 F, vec3 view, float sheen, float rim, vec3 world, float near) {
  // On a pixel the skin only partly covers, what the skin hands down is carried on past its edge.
  gather = saturate(gather);
  sheen = saturate(sheen);
  rim = saturate(rim);
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
  // How close is told by the angle between the lines of sight of two pixels and the way to the skin, never by the slope of the skin: every fold of a blade is as close as the blade.
  vec3 ray = world - uCamPos;
  float close = near * smoothstep(FROST_CLOSE_FROM, FROST_CLOSE_WHOLE, 1.08 / max(length(ray) * length(dFdy(normalize(ray))) * uSize.y, 1e-9));
  // It comes in from the edges and the ridges, and the open face is the last to whiten. Where a close lens first sees it, it has reached the whole face, and what grows from there is the coat.
  float front = mix(1.2 - 2.0 * uPlantFrost, -0.8, smoothstep(0.0, 0.15, uPlantDew)) - FROST_CLOSE_AHEAD * close;
  float come = smoothstep(front, front + 0.3, ragged);
  // It goes first where the sun is on it and where it is thin, and the thick fringe is the last ice on the leaf.
  float turn = 0.5 * (1.0 - dot(N, uSunDir)) * 0.5 + 0.3 * bank + 0.25 * smoothstep(0.3, 0.9, ragged);
  float thaw = frostThaw();
  float held = come * (1.0 - smoothstep(turn, turn + 0.3, 1.15 * thaw));
  // On a blade the thaw is one front that comes down from the tip, the same the crystals and the water keep, ragged, and soonest on the side the sun is on.
  if (frostAlong >= 0.0) held = come * (1.0 - saturate(frostPast(bank, fine, gather, N, thaw) / 0.12));
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
  vec2 ax = dFdx(at);
  vec2 ay = dFdy(at);
  vec3 wx = dFdx(world);
  vec3 wy = dFdy(world);
  if (close > 0.0) {
    // A close lens tells the coat apart. It hides most of the skin at an edge and along a vein and a third of it in the middle of a field, in banks, so the veins read through it as lines of thicker grain.
    float level = clamp(0.5 * log2(max(abs(ax.x * ay.y - ax.y * ay.x), 1e-20) / max(length(cross(wx, wy)), 1e-20)), -6.0, 6.0);
    // Where the close lens first sees it the leaf is frosted already. Over the last third of the freeze the coat thickens, its crystals grow and its front creeps in from the edge and the veins over the green that is left.
    float came = mix(saturate((uPlantFrost - 0.7) / 0.3), 1.0, smoothstep(0.0, 0.15, uPlantDew));
    float late = mix(FROST_COAT_FIRST, 1.0, came);
    // The crystals stand up from the skin: seen along the face they hide the skin between them.
    float slant = 1.0 / max(abs(dot(F, view)), 0.25);
    // A blade is coated thickest by its stalk, where it is thick and the cold holds longest.
    float base = frostAlong >= 0.0 ? 1.0 - smoothstep(0.12, 0.45, frostAlong + 0.2 * (bank - 0.5)) : 0.0;
    // How thick it lies falls away from the margin and the ridges over the whole of a field, and its front is ragged at every size: tongues and bays a centimeter across, islands of a millimeter and stragglers. No line runs along the margin.
    float broad = valueNoise(round * (1.0 / FROST_TONGUE_M) + 5.0);
    float isles = valueNoise(round * (1.0 / 0.0006) + 41.0);
    float dense = max(smoothstep(0.04, 0.7, gather * (0.55 + 0.9 * broad) * mix(0.72, 1.0, came) + 0.34 * (bank - 0.5) + 0.3 * (fine - 0.5) + 0.22 * (isles - 0.5) + 0.12 * (slant - 1.0)), base * (0.5 + 0.5 * fine));
    // On an open field it lies in banks with bare skin between them, a third of the field in all.
    float banked = smoothstep(0.4, 0.66, 0.6 * valueNoise(round * (1.0 / FROST_BANK_M) + 23.0) + 0.4 * bank);
    float want = mix(1.0 - pow(1.0 - FROST_COAT_FIELD * saturate(0.7 + 0.3 * banked + 0.7 * (slant - 1.0)), slant), FROST_COAT_EDGE, dense) * (0.85 + 0.15 * smoothstep(-0.3, 0.2, F.y));
    float grown = saturate((late - 0.45 * saturate(1.0 - dense + 0.5 * (bank - 0.5))) / 0.55);
    // The skin is measured as the grown blade's: on a young one a meter of it is a fraction of a true meter. The crystals keep their true size, so they are laid on the size of cell nearest to it, and between two sizes on both.
    float lower = exp2(floor(level));
    float upper = smoothstep(0.3, 0.7, fract(level));
    // The step on the skin toward the sun, for the shadows.
    vec3 low = uSunDir - F * dot(F, uSunDir);
    float xx = dot(wx, wx);
    float xy = dot(wx, wy);
    float yy = dot(wy, wy);
    vec2 toSun = ((yy * dot(wx, low) - xy * dot(wy, low)) * ax + (xx * dot(wy, low) - xy * dot(wx, low)) * ay) / max(xx * yy - xy * xy, 1e-24);
    vec2 shade = toSun * (FROST_FORM_HIGH_M / max(abs(dot(F, uSunDir)), 0.3));
    vec4 laid = vec4(0.0);
    // On the ridge of a vein and at the very margin the rime is a chain of heaps: its width swings, it has gaps, and it breaks up where it thins.
    float heaped = smoothstep(0.38, 0.6, gather + 0.3 * (fine - 0.5) + 0.22 * (isles - 0.5) + 0.16 * (bank - 0.5)) * smoothstep(0.25, 0.5, valueNoise(round * (1.0 / 0.0021) + 61.0));
    // By the stalk the whole blade is heaped white, and that is the last of it to go.
    heaped = max(heaped, base * (0.5 + 0.5 * smoothstep(0.2, 0.6, fine)));
    if (upper < 1.0) laid += (1.0 - upper) * frostCoat(at, reach * FROST_GRAIN_M, lower, want, heaped, grown, shade, N, view);
    if (upper > 0.0) laid += upper * frostCoat(at, reach * FROST_GRAIN_M, 2.0 * lower, want, heaped, grown, shade, N, view);
    crust.x = mix(crust.x, laid.x, close);
    // A crystal stands up from the skin: where the sun only grazes the blade, the faces it turns to the sun are lit full.
    crust.y += close * (FROST_COAT_FLASH * laid.y + FROST_FACE_SUN * laid.w * smoothstep(-0.1, 0.12, dot(F, uSunDir)) * (1.0 - saturate(dot(N, uSunDir))));
    float thawing = smoothstep(0.0, 0.15, uPlantDew);
    // A face that looks down and away from the sun looks at the frozen ground: its coat is lit by that white, and reads as rime there too.
    frostSky = close * mix(FROST_SKY_UP, FROST_SKY_THAW, thawing) * (1.0 + FROST_SKY_SHADE * smoothstep(0.35, 0.75, -dot(F, uSunDir)) * (1.0 - smoothstep(-0.1, 0.4, F.y))) * laid.x * held / mix(1.0, max(uPlantFrost, FROST_WHOLE_LEAST), thawing);
    // One flash in five is a face that mirrors the sky: white to pale blue, not the sun's gold.
    frostSpark = mix(vec3(1.0), FROST_SKY_SPARK * dot(uSunColor, vec3(0.2126, 0.7152, 0.0722)) / max(uSunColor, vec3(1e-4)), saturate(close * FROST_COAT_FLASH * laid.z / max(crust.y, 1e-6)));
  }
  // The wearer weighs the crust by the frost that is left in the air. Ice the thaw's front has not reached is whole until it does.
  return vec2(saturate(crust.x), crust.y) * (held / mix(1.0, max(uPlantFrost, FROST_WHOLE_LEAST), smoothstep(0.0, 0.15, uPlantDew)));
}

vec2 frostCrust(vec2 at, float gather, vec3 N, vec3 F, vec3 view, float sheen, float rim, vec3 world) {
  return frostCrustOn(at, gather, N, F, view, sheen, rim, world, 1.0);
}
`
