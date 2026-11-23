import * as THREE from 'three'
import { makePartSurface, partMesh, stateUniforms, type PartOptions } from '../part.ts'
import { blurPx } from '../../core/lens.ts'
import { shared, type Surface } from '../../core/shading.ts'
import { norm } from '../norm.ts'
import { held } from '../../v2/held.ts'

// `real` turns true once this folder holds the plant's hairs at their real quality.
export const real = true

// See-through things are drawn in the order of these numbers: the hairs of the plant after the far things of a world (under 20) and before its air (40 and over).
export const HAIR_ORDER = 20

// A hair wider than this many pixels is drawn as a ribbon turned to the camera. Thinner, it is a one pixel line that carries its true share of light.
const RIBBON_FROM_PX = 0.45
const ROW = 512
// A hair whose blur circle is wider than this many pixels shares its place: fewer are drawn and each stands for several.
const THIN_FROM_PX = 10
const THIN_LEAST = 0.12
const THIN_EASE = 0.15
// While the plant's clock stands its hairs are chosen for a view in steps: the lens this far along a scale of doublings and this many degrees round the plant. So what is chosen depends on the frame alone and is sent again only when a step is crossed; frost, dew and rain send nothing.
const STEPS_PER_DOUBLING = 8
const STEP_DEG = 4
// In the wide shot a hair thinner than this many pixels is one of many in a pixel: that share of them is laid and stands for the rest.
const FAR_FROM_PX = 1 / 3
// Hairs hide one another: where they would cover more than this share of a pixel, only that many of them show.
const CROWD_COVER = 0.35
// How closely a hair stands among others is kept with it on a scale of doublings, this many steps to one, so the dimming follows the frost where the hair is drawn and nothing is gathered again for it.
const CROWD_STEPS = 32
// A hair far thinner than a pixel cannot be told from its neighbors, and a coat of them is a haze. Where hairs are thinner than this on the screen, one strand of this width stands for those around it, with their light.
const STRAND_PX = 0.06
const STRAND_FROM_PX = 2
const WIDE_FROM_S = 52
const WIDE_FULL_S = 53.5
const WIDE_STRAND_PX = 0.15
const WIDE_GAIN = 2
const WIDE_LONG_PX = 3
const CROWD_CELL_PX = 8
// How thick the rime on a hair is, in meters, whatever the hair.
const RIME_M = 0.00008
const MOST_PICKS = 24000
const EXTRA_FROM_M = 0.002
const EXTRA_SHARE = 0.4
// Dew beads sit on one hair in six of those long enough to hold one.
const DEW_FROM_M = 0.00015
const DEW_SHARE = 0.05
// A damp hair is drawn at least this wide and this long on the screen, and that much fainter: the same light, spread, so it is a soft stroke and never a row of single lit pixels.
const SOFT_HALF_PX = 0.75
const SOFT_LONG_PX = 3
// A dry hair too thin for a ribbon is a soft stroke this wide, with the light of its true width: a faint whole line, never a row of lit dots.
const FINE_HALF_PX = 0.6
// Wet hairs gather into tufts: this many rows of them from the first hair of a coat to its last, and they lean this hard toward their tuft.
const TUFT_BANDS = 350
const TUFT_LEAN = 1.1
// A soft stroke loses none of its light to the pixel grid as a line does. This holds the rim at the light it had as lines.
const SOFT_LIGHT = 0.85
// A held lens whose frame is narrower than this at its focus, and which looks down by more than this share of its way, looks onto the upper face of a leaf from close by: there the frost's grains stand for the rime on the hairs of that face.
const CLOSE_FRAME_M = 0.2
const LOOKS_DOWN = 0.3
// A wet hair long enough may carry a drop: six in a hundred do.
const DROP_FROM_M = 0.0005
const DROP_SHARE = 0.06
// A set of hairs whose usual hair is shorter than the first of these on the screen, in pixels, is not drawn at all. From there to the second its hairs come in by their width, so nothing appears at once.
const CUT_FROM_PX = 0.6
const CUT_FULL_PX = 1.2
// Hairs that sit on frames: this many frames in a row of the texture, and a hair that is born comes out over this much of what its frame has grown.
const FRAME_ROW = 128
const BORN_EASE = 0.22
// A swelling on a ring of a wide frame stands out within about this angle of where it points, in radians.
const SWELL_WIDE = 0.52

// A hair is a clear fiber. Sunlight goes through it and leaves in a cone about the fiber, strongest straight on (the lobe called TT), with a weak mirror of the sun on its near side (R) and next to nothing scattered evenly.
const strand = /* glsl */ `
uniform sampler2D uHairs;
uniform float uPlantWet;
uniform float uPlantFrost;
uniform float uPlantDew;
out vec3 vWorld;
out vec3 vLitAt;
out float vDepth;
out vec3 vSun;
out vec3 vSky;
out float vSkyY;
uniform vec3 uHairColor;
uniform float uHairWidth;

// How bright a hair is at its brightest, seen straight against the sun, in white cards that face the sun. Set by eye against the approved bloom pictures, for a hair in focus: more than this and a fringe burns into a wire.
const float SUN_THROUGH = 1.8;
// A lit hair is paler than the sun, for it also sends on the sky round the sun. Only with the sun right behind it does it take a color deeper than the sun's.
const float SUN_PALE = 0.2;
// What comes through a hair is warm white going to pink, as the approved pictures have it, where the low sun alone would make it yellow.
const vec3 THROUGH_TINT = vec3(1.0, 0.8, 0.72);
const float SUN_DEEPEN = 0.6;
// A hair that stands toward the eye with the sun behind it is on the dark face of its body.
const float FACE_SHADE = 1.2;
const float SHADE_OUT_M = 0.005;
const float TT_SPREAD = 0.7;
const float TT_TURN = 2.0;
const float R_SPREAD = 0.16;
const float EVEN = 0.035;
const float SKY_BACK = 0.12;
const float SKY_THROUGH = 0.5;
const float STRAND_GAIN = SUN_THROUGH * 2.5066 * TT_SPREAD / 0.714;
const vec3 RIME = vec3(0.92, 0.96, 1.0);
const float RIME_SUN = 0.3;
const float RIME_SKY = 1.5;
// Rime on a hair that stands toward the eye is seen end on, against the body: a point, not a needle.
const float RIME_FACE = 0.0;
const float RIME_VELVET = 0.28;
// A needle on the outline is seen from its shaded side, against the bright air.
const float RIME_SHADE = 0.85;
const float RIME_M = ${RIME_M.toFixed(6)};
const float DEW_M = 0.00004;
const float DEW_OF_HAIR = 0.3;
const float DEW_FACE = 0.0;
const float SOFT_HALF_PX = ${SOFT_HALF_PX.toFixed(2)};
const float SOFT_LONG_PX = ${SOFT_LONG_PX.toFixed(1)};
const float FINE_HALF_PX = ${FINE_HALF_PX.toFixed(2)};
const float TUFT_BANDS = ${(TUFT_BANDS * 2 * Math.PI).toFixed(2)};
const float TUFT_LEAN = ${TUFT_LEAN.toFixed(2)};
const float CROWD_COVER = ${CROWD_COVER.toFixed(2)};
const float CROWD_STEPS = ${CROWD_STEPS.toFixed(1)};
const float WIDE_FROM_S = ${WIDE_FROM_S.toFixed(2)};
const float WIDE_FULL_S = ${WIDE_FULL_S.toFixed(2)};
const float WET_BACK = 0.3;
const float WET_THROUGH = 6.0;
const float DEW_GLOW = 0.2;
const float DEW_GLOW_SIDE = 0.6;
const float DEW_SHARE = ${DEW_SHARE.toFixed(2)};

struct Strand {
  vec3 world;
  vec3 along;
  vec3 toEye;
  float depth;
  float width;
  float pixel;
  float share;
};

uniform sampler2D uHairFramesA;
uniform sampler2D uHairFramesB;
uniform mat4 uHairPoseA;
uniform mat4 uHairPoseB;
// x is 1 when the hairs sit on frames, y how many texels a frame is, z how many hairs there are, w is 1 where the frost's grains stand for the rime of the hairs on a face.
uniform vec4 uHairSeats;
// How much of its width a hair of this set has: 0 where its usual hair is too short on the screen to see.
uniform float uHairCut;

bool hairGone;
float hairLaid;
vec4 hairRoot;
vec3 hairDir;
vec3 hairStand;
vec4 hairFoot;
vec4 hairTip;
float hairLong;
vec3 hairBend;
float hairOwn;
float hairShare;
float hairWide;
float hairRime;
float hairBead;
float hairSlim;
float hairCoat;

float tuftField(vec2 q) {
  return sin(q.x + 1.3 * sin(2.0 * q.y)) * sin(5.0 * q.y + 0.8 * sin(0.37 * q.x));
}

vec3 hairPoint(float t) {
  return hairRoot.xyz + (hairDir * t + hairBend * (t * t)) * hairRoot.w;
}

// A direction kept in two numbers.
vec3 hairWay(vec2 e) {
  vec3 v = vec3(e, 1.0 - abs(e.x) - abs(e.y));
  float t = max(-v.z, 0.0);
  v.xy += vec2(v.x >= 0.0 ? -t : t, v.y >= 0.0 ? -t : t);
  return normalize(v);
}

vec3 hairUnit(vec3 v) {
  float l = length(v);
  return l > 1e-12 ? v / l : vec3(0.0, 1.0, 0.0);
}

// How far a swelling lifts the skin at a place on its ring.
float hairSwell(vec2 rim, vec2 at) {
  float h = length(at);
  return h > 1e-9 ? h * exp(-2.0 * (1.0 - dot(rim, at) / h) / ${(SWELL_WIDE * SWELL_WIDE).toFixed(4)}) : 0.0;
}

float hairRise(sampler2D frames, ivec2 f, vec2 rim) {
  float rise = 0.0;
  for (int k = 4; k < 8; k++) {
    vec4 at = texelFetch(frames, f + ivec2(k, 0), 0);
    rise += hairSwell(rim, at.xy) + hairSwell(rim, at.zw);
  }
  return rise;
}

// Where a hair sits in one slot: its root, the way it grows, the way its skin faces, its length, how many hairs stand on a square meter there and how wide the body is.
struct Seat {
  vec3 root;
  vec3 way;
  vec3 skin;
  float reach;
  float dense;
  float girth;
};

// A frame is a place on the body: a middle and two arms. A hair on a ring stands rim the middle, c1 along the first arm and c2 along the second. A hair on a ribbon stands on one of the two halves the arms span.
Seat hairSeat(sampler2D frames, mat4 pose, vec4 s0, vec4 s1, vec4 s2) {
  int n = int(uHairSeats.y + 0.5);
  int i0 = int(s0.x + 0.5);
  int i1 = int(s0.y + 0.5);
  if (n == 1) {
    // A sheet: a point a texel. The hair stands in the cell between its two points and the next of each, as far across as c1 says, and the cell's own edges say which way is along and which way the skin faces.
    vec4 p00 = texelFetch(frames, ivec2(i0 & ${FRAME_ROW - 1}, i0 / ${FRAME_ROW}), 0);
    vec4 p01 = texelFetch(frames, ivec2((i0 + 1) & ${FRAME_ROW - 1}, (i0 + 1) / ${FRAME_ROW}), 0);
    vec4 p10 = texelFetch(frames, ivec2(i1 & ${FRAME_ROW - 1}, i1 / ${FRAME_ROW}), 0);
    vec4 p11 = texelFetch(frames, ivec2((i1 + 1) & ${FRAME_ROW - 1}, (i1 + 1) / ${FRAME_ROW}), 0);
    vec4 low = mix(p00, p01, s1.x);
    vec4 high = mix(p10, p11, s1.x);
    vec3 run = high.xyz - low.xyz;
    vec3 span = mix(p01.xyz - p00.xyz, p11.xyz - p10.xyz, s0.z);
    vec3 on = hairUnit(run);
    vec3 face = hairUnit(cross(on, span));
    mat3 turned = mat3(pose);
    Seat sheet;
    sheet.root = (pose * vec4(mix(low.xyz, high.xyz, s0.z), 1.0)).xyz;
    sheet.way = hairUnit(turned * (hairUnit(span) * s2.x + on * s2.y + face * s2.z));
    sheet.skin = hairUnit(turned * face);
    sheet.reach = s0.w * mix(low.w, high.w, s0.z);
    sheet.girth = length(span);
    float area = length(cross(run, span));
    sheet.dense = area > 1e-12 ? float(int(s1.z + 0.5) >> 2) / area : 0.0;
    return sheet;
  }
  ivec2 f0 = ivec2((i0 & ${FRAME_ROW - 1}) * n, i0 / ${FRAME_ROW});
  ivec2 f1 = ivec2((i1 & ${FRAME_ROW - 1}) * n, i1 / ${FRAME_ROW});
  vec4 o0 = texelFetch(frames, f0, 0);
  vec4 a0 = texelFetch(frames, f0 + ivec2(1, 0), 0);
  vec4 b0 = texelFetch(frames, f0 + ivec2(2, 0), 0);
  vec4 o1 = texelFetch(frames, f1, 0);
  vec4 a1 = texelFetch(frames, f1 + ivec2(1, 0), 0);
  vec4 b1 = texelFetch(frames, f1 + ivec2(2, 0), 0);
  vec4 o = mix(o0, o1, s0.z);
  vec4 a = mix(a0, a1, s0.z);
  vec4 b = mix(b0, b1, s0.z);
  vec3 along = hairUnit(mix(hairWay(vec2(a0.w, b0.w)), hairWay(vec2(a1.w, b1.w)), s0.z));
  int flags = int(s1.z + 0.5);
  bool ring = (flags & 1) == 1;
  vec3 off = s1.x * a.xyz + s1.y * b.xyz;
  float reach = s0.w * o.w;
  float share = 1.0;
  float slope = 0.0;
  if (n > 3) {
    // A wide frame also says how far its skin has grown, how long a hair on it may be at most, how high its ribs stand and where up to eight swellings stand on its ring.
    vec4 g0 = texelFetch(frames, f0 + ivec2(3, 0), 0);
    vec4 g1 = texelFetch(frames, f1 + ivec2(3, 0), 0);
    vec4 g = mix(g0, g1, s0.z);
    float far = length(s1.xy);
    vec2 rim = s1.xy / max(far, 1e-9);
    float rise0 = 1.0 + g0.z * (far - 1.0) + hairRise(frames, f0, rim);
    float rise1 = 1.0 + g1.z * (far - 1.0) + hairRise(frames, f1, rim);
    vec3 off0 = (rim.x * a0.xyz + rim.y * b0.xyz) * rise0;
    vec3 off1 = (rim.x * a1.xyz + rim.y * b1.xyz) * rise1;
    off = mix(off0, off1, s0.z);
    // The skin of a ring that widens or narrows along the body does not face straight out.
    slope = clamp((length(off1) - length(off0)) / max(length(o1.xyz - o0.xyz), 1e-9), -1.5, 1.5);
    if (g.y > 0.0) reach = min(s0.w, g.y) * o.w;
    if (s2.w > 0.0) {
      reach *= smoothstep(s2.w, s2.w + ${BORN_EASE.toFixed(2)}, g.x);
      share = saturate(g.x);
    }
  }
  vec3 across;
  vec3 skin;
  vec3 lift;
  if (ring) {
    lift = hairUnit(off) - along * slope;
    skin = hairUnit(lift);
    across = hairUnit(cross(along, skin));
  } else if (s1.x >= s1.y) {
    across = hairUnit(a.xyz);
    skin = hairUnit(cross(along, a.xyz));
    lift = skin;
  } else {
    across = -hairUnit(b.xyz);
    skin = hairUnit(cross(b.xyz, along));
    lift = skin;
  }
  mat3 turn = mat3(pose);
  Seat s;
  s.root = (pose * vec4(o.xyz + off, 1.0)).xyz;
  s.way = hairUnit(turn * (across * s2.x + along * s2.y + lift * s2.z));
  s.skin = hairUnit(turn * skin);
  s.reach = reach;
  float la = length(a.xyz);
  float lb = length(b.xyz);
  s.girth = ring ? 0.5 * (la + lb) : la + lb;
  float area = length(o1.xyz - o0.xyz) * (ring ? 6.2832 * s.girth : s.girth);
  s.dense = area > 1e-12 ? share * float(flags >> 2) / area : 0.0;
  return s;
}

// A hair that sits on frames: three texels that never change say where on its part it sits, and the frames the part lays for each slot say where that is now. What the script used to work out for every hair on every frame is worked out here: which hairs stand for the coat far from focus and in the wide shot, and how they dim where they crowd.
void seatHair(int k, out vec4 a, out vec4 b, out vec4 c, out vec3 wayB, out float reachB, out float place, out float crowd) {
  ivec2 at = ivec2((k & 511) * 3, k >> 9);
  vec4 s0 = texelFetch(uHairs, at, 0);
  vec4 s1 = texelFetch(uHairs, at + ivec2(1, 0), 0);
  vec4 s2 = texelFetch(uHairs, at + ivec2(2, 0), 0);
  Seat sa = hairSeat(uHairFramesA, uHairPoseA, s0, s1, s2);
  Seat sb = hairSeat(uHairFramesB, uHairPoseB, s0, s1, s2);
  float own = s1.w;
  bool keyed = uOwnKeys > 0.5;
  bool here = sa.reach > 0.0;
  bool second = sb.reach > 0.0;
  float full = keyed ? max(sa.reach, sb.reach) : sa.reach;
  vec3 ra = here ? sa.root : sb.root;
  vec3 skin = here ? sa.skin : sb.skin;
  float size = plantSize();
  vec3 world = (modelMatrix * vec4(ra, 1.0)).xyz;
  float w = -(viewMatrix * vec4(world, 1.0)).z;
  place = min(float(k) / uHairSeats.z, 0.9999);
  crowd = 1.0;
  a = vec4(ra, 0.0);
  b = vec4(ra, own);
  c = vec4(0.0, 1.0, 0.0, 0.0);
  wayB = c.xyz;
  reachB = 0.0;
  if (!(full > 0.0) || w < full * size) {
    hairGone = true;
    return;
  }
  float scale = size * projectionMatrix[1][1] * uSize.y * 0.5 / w;
  float wide = smoothstep(WIDE_FROM_S, WIDE_FULL_S, uTime);
  float thick = (1.0 + RIME_M / max(uHairWidth, 1e-7) * uPlantFrost) * (1.0 + 2.0 * uPlantWet);
  float coc = cocOf(w);
  // A hair too short on the screen to show as a strand stands for itself, so a part with short hairs loses none of their light.
  float close = saturate((full * scale - ${STRAND_FROM_PX.toFixed(1)}) / ${STRAND_FROM_PX.toFixed(1)});
  float brief = close + (1.0 - close) * wide;
  float widthPx = uHairWidth * thick * scale;
  float fine = min(1.0, widthPx / mix(${STRAND_PX.toFixed(3)}, ${WIDE_STRAND_PX.toFixed(3)}, wide));
  // In the wide shot none is left out for being fine: every hair is a faint soft stroke and the coat sums to an even line that holds still.
  float thin = fine + (1.0 - fine) * wide * min(1.0, widthPx / ${FAR_FROM_PX.toFixed(5)});
  float part = (1.0 - brief * (1.0 - thin)) * (coc > ${THIN_FROM_PX.toFixed(1)} ? max(${THIN_FROM_PX.toFixed(1)} / coc, ${THIN_LEAST.toFixed(3)}) : 1.0);
  float share = 1.0;
  if (part < 1.0) {
    float keep = part * ${(1 + THIN_EASE).toFixed(3)};
    float s = min(1.0, (keep - fract(own * 151.37 + 0.11)) / (${THIN_EASE.toFixed(3)} * keep));
    if (s <= 0.0) {
      hairGone = true;
      return;
    }
    float whole = keep * ${(1 - THIN_EASE).toFixed(3)};
    share = s / (keep <= 1.0 ? keep * ${(1 - 0.5 * THIN_EASE).toFixed(4)} : whole + 0.5 * (1.0 - whole) * (1.0 + (keep - 1.0) / (${THIN_EASE.toFixed(3)} * keep)));
  }
  // A hair there is drawn long enough to stand off the outline, with the light of its true length and a little more.
  float least = wide * ${WIDE_LONG_PX.toFixed(1)} * (0.6 + 0.8 * fract(own * 59.31 + 0.19)) / scale;
  float stands = max(full, least);
  share *= (full / stands) * (1.0 + ${(WIDE_GAIN - 1).toFixed(2)} * wide * (1.0 - fine));
  // Hairs hide one another. How many of this coat lie over a pixel here follows from how close they stand on the skin, how large the skin is on the screen and how far it is turned from the eye; a ring is seen through twice, and nothing on the screen is finer than the cell the cover is counted in.
  int flags = int(s1.z + 0.5);
  float dense = here ? sa.dense : sb.dense;
  float girthPx = max((here ? sa.girth : sb.girth) * scale, 1e-3);
  float facing = abs(dot(plantDirection(skin), normalize(uCamPos - world)));
  float cell = ${CROWD_CELL_PX.toFixed(1)};
  float lies = (flags & 1) == 1 ? 2.0 / max(facing, max(cell / (3.1416 * girthPx), min(0.64, 2.0 / sqrt(girthPx)))) : 1.0 / max(facing, cell / girthPx);
  float cover = dense / (scale * scale) * lies * share * uHairWidth * scale * min(full * scale, cell);
  if (cover > CROWD_COVER) crowd = min(cover / CROWD_COVER, 250.0);
  a.w = keyed ? (here ? max(sa.reach, least) : 0.0) : stands;
  if (second) b.xyz = sb.root;
  c = vec4(here ? sa.way : sb.way, (flags & 2) == 2 && uHairSeats.w > 0.5 ? -share : share);
  wayB = second ? sb.way : c.xyz;
  reachB = keyed ? (second ? max(sb.reach, least) : 0.0) : stands;
}

// Four texels a hair: its root and length in the first slot, its root in the second and its own number, its direction and how many hairs it stands for (below nothing for a hair that shows no rime of its own), its direction in the second slot in two numbers with its length there and its place among the hairs.
void readHair(int k) {
  vec4 a;
  vec4 b;
  vec4 c;
  vec3 wayB;
  float reachB;
  float place;
  float crowd;
  hairGone = false;
  if (uHairSeats.x > 0.5) {
    seatHair(k, a, b, c, wayB, reachB, place, crowd);
  } else {
    ivec2 at = ivec2((k & 511) * 4, k >> 9);
    a = texelFetch(uHairs, at, 0);
    b = texelFetch(uHairs, at + ivec2(1, 0), 0);
    c = texelFetch(uHairs, at + ivec2(2, 0), 0);
    vec4 d = texelFetch(uHairs, at + ivec2(3, 0), 0);
    wayB = hairWay(d.xy);
    reachB = d.z;
    place = fract(d.w);
    crowd = exp2(floor(d.w) / CROWD_STEPS);
  }
  hairLaid = max(a.w, reachB);
  float laid = mix(a.w, reachB, plantLead());
  hairRoot = vec4(mix(a.xyz, b.xyz, plantBlend()), laid);
  hairDir = normalize(mix(c.xyz, wayB, plantBlend()));
  hairStand = hairDir;
  hairOwn = b.w;
  // A share kept below nothing marks a hair whose rime the frost's grains stand for: it shows no needle of its own.
  hairShare = c.w < 0.0 && uPlantFrost > 0.5 ? 0.0 : abs(c.w);
  // Where hairs crowd all of them dim alike instead of burning. Rime is matt and does not burn: a crust of it may stand as close as it grows.
  crowd /= 1.0 + 15.0 * uPlantFrost;
  if (crowd > 1.0) {
    float some = saturate((1.0 - crowd * fract(b.w * 97.13 + 0.37)) / 0.3);
    hairShare *= mix(some, 0.85 / crowd, smoothstep(WIDE_FROM_S, WIDE_FULL_S, uTime));
  }
  float h1 = fract(hairOwn * 13.37 + 0.21);
  float h2 = fract(hairOwn * 47.13 + 0.67);
  float h4 = fract(hairOwn * 233.31 + 0.09);
  float h5 = fract(hairOwn * 71.93 + 0.5);
  float h6 = fract(hairOwn * 317.77 + 0.21);
  float h7 = fract(hairOwn * 173.19 + 0.83);
  vec3 ref = abs(hairDir.y) < 0.9 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);
  vec3 e1 = normalize(cross(hairDir, ref));
  vec3 e2 = cross(hairDir, e1);
  float turn = h1 * 6.2832;
  vec3 aside = e1 * cos(turn) + e2 * sin(turn);
  // No two hairs stand alike: each leans its own way off the line it was given, has its own length and its own slight curve. A long hair wanders and curves more than short down, which stands straight.
  float reach = smoothstep(0.001, 0.005, hairRoot.w);
  hairDir = normalize(hairDir + aside * ((0.35 + 0.95 * reach) * sqrt(h7)) + vec3(0.0, 0.2 * h6, 0.0));
  hairBend = (e1 * cos(turn + 2.1) + e2 * sin(turn + 2.1)) * ((0.08 + 0.3 * h2 * h2) * (0.4 + 1.2 * reach)) + vec3(0.0, -0.05, 0.0);
  hairWide = 1.0;
  hairRime = 0.0;
  // Most hairs are short and a few are long, and they do not stand evenly: there are stretches with few, and those few are short. Down is even.
  float coat = smoothstep(0.0008, 0.002, hairRoot.w);
  hairCoat = coat;
  vec3 q = hairRoot.xyz * 260.0;
  float stand = 0.5 + 0.25 * (sin(q.x + 2.3 * q.y + 1.7 * sin(1.3 * q.z)) + sin(3.1 * q.y - 1.7 * q.z + 1.3 * sin(2.1 * q.x)));
  float few = mix(1.0, smoothstep(0.15, 0.6, stand), coat);
  hairRoot.w *= mix(0.5 + h6, 0.35 + 1.75 * h6 * h6, coat) * (0.35 + 0.65 * few);
  hairShare *= 0.3 + 0.7 * few;
  // A drop is the size a hair can hold, whatever the strand stands for, and down holds none.
  float one = min(uHairWidth, 0.00006) * smoothstep(0.001, 0.002, hairRoot.w);
  // A strand given a width past an eighth of its length stands for the down round it. It is drawn that slim and carries the rest as light, so close up it is still a hair and not a grain.
  hairSlim = min(1.0, hairRoot.w / (8.0 * uHairWidth * (0.5 + fract(hairOwn * 91.71 + 0.43))));
  hairBead = 0.0;
  // Rime grows on every hair as a white needle of its own: down gains a little length, a long hair is iced over part of its length, most of them a short part, and no two needles point alike.
  if (uPlantFrost > 0.0) {
    hairRoot.w *= mix(1.0, mix(1.3 + 0.4 * h2, 0.35 + 0.95 * h2 * h2, coat), uPlantFrost);
    float skew = 6.2832 * fract(hairOwn * 173.31 + 0.21);
    hairDir = normalize(hairDir + (e1 * cos(skew) + e2 * sin(skew)) * (uPlantFrost * (0.1 + 0.3 * sqrt(fract(hairOwn * 61.17 + 0.83)))));
    // The ice on a hair is never wider than a fourteenth of the hair is long.
    hairRime = uPlantFrost * min(RIME_M * (0.6 + 0.8 * h4), hairRoot.w / 14.0) / uHairWidth * hairSlim;
    // Ice grows straight.
    hairBend *= 1.0 - 0.75 * uPlantFrost;
    // Rime grows on a hair, not on the felt a strand of down stands for.
    hairShare *= mix(1.0, hairSlim, uPlantFrost);
  }
  // Dew and rain weigh each hair differently, so damp hairs do not stand in an even row: some are pulled short and a few stay long, each leans its own way and some bend over.
  float damp = max(uPlantDew, uPlantWet);
  if (damp > 0.0) {
    float d1 = fract(hairOwn * 197.41 + 0.37);
    float d2 = fract(hairOwn * 271.93 + 0.11);
    float d3 = fract(hairOwn * 331.71 + 0.59);
    // Down under dew or rain shows at its full length, each strand outlined by the water on it; dry, only its felted foot does.
    float downy = smoothstep(0.0003, 0.0004, laid) * (1.0 - coat) * step(0.0001, uHairWidth);
    float longer = mix(1.0, 1.4 + 2.4 * d1, downy * damp);
    hairRoot.w *= mix(1.0, mix(0.5 + 0.9 * d1 * d1, 0.3 + 0.6 * d1 * d1, coat), (1.0 - downy) * damp) * longer;
    hairDir = normalize(hairDir + (e1 * cos(6.2832 * d2) + e2 * sin(6.2832 * d2)) * (0.7 * damp * d3));
    hairBend *= 1.0 + 3.0 * damp * d3 * d3;
  }
  // These hairs are stiff and rain does not lay them flat. A wet one hangs a little, one in three carries a film of water that thickens its foot, and a few carry a drop.
  if (uPlantWet > 0.0) {
    float point = step(h4, 0.34);
    hairWide *= 1.0 + 0.6 * uPlantWet * point;
    hairDir = normalize(hairDir + (aside * 0.15 + vec3(0.0, -0.25, 0.0)) * uPlantWet);
    hairBead = one * 3.0 * uPlantWet * step(h5, 0.06);
    // Rain gathers wet hairs into tufts. The tufts belong to the tissue: a hair knows its place by its number in the coat, which runs from the foot up, and by the way it points round the stem. It leans toward the nearest tuft so neighbors meet in a point; a tuft is long, and between tufts the hairs are short and some are beaten flat and do not show.
    float rain = smoothstep(0.3, 0.9, uPlantWet);
    vec2 tq = vec2(place * TUFT_BANDS, atan(hairStand.z, hairStand.x));
    float t0 = tuftField(tq);
    float rise = (tuftField(tq + vec2(0.2, 0.0)) - t0) * 5.0;
    float round = (tuftField(tq + vec2(0.0, 0.04)) - t0) * 5.0;
    vec3 upward = vec3(0.0, 1.0, 0.0) - hairStand * hairStand.y;
    vec3 across = cross(hairStand, vec3(0.0, 1.0, 0.0));
    hairDir = normalize(hairDir + (upward * rise + across * round) * (TUFT_LEAN * rain));
    hairRoot.w *= mix(1.0, 0.45 + 1.4 * smoothstep(-0.5, 0.7, t0), rain);
    hairShare *= mix(1.0, 0.2 + 0.8 * smoothstep(-0.75, -0.15, t0), rain);
  }
  mat4 toClip = projectionMatrix * viewMatrix;
  hairFoot = toClip * vec4(plantWorld(hairPoint(0.0)), 1.0);
  hairTip = toClip * vec4(plantWorld(hairPoint(1.0)), 1.0);
  vec2 run = (hairTip.xy / max(hairTip.w, 1e-5) - hairFoot.xy / max(hairFoot.w, 1e-5)) * 0.5 * uSize;
  hairLong = max(abs(run.x), abs(run.y));
  // A strand stands for its neighbors only where it shows as a strand. Seen end on it is a point, and a point that carries the light of ten is a speck.
  hairShare = min(hairShare, 1.0 + (hairShare - 1.0) * smoothstep(1.5, 4.0, hairLong));
}


float lobe(float s, float spread) {
  return exp(-0.5 * s * s / (spread * spread)) / (2.5066 * spread);
}

vec3 scatter(vec3 along, vec3 toEye, vec3 toSun) {
  float sinI = dot(toSun, along);
  float sinO = dot(toEye, along);
  float cosI = sqrt(max(1.0 - sinI * sinI, 0.0));
  float cosO = sqrt(max(1.0 - sinO * sinO, 0.0));
  float round = clamp(dot(toSun - sinI * along, toEye - sinO * along) / max(cosI * cosO, 1e-4), -1.0, 1.0);
  // Seen or lit end on, a fiber has no round: the turn about it is taken as the mean of all turns, so a hair that points at the lens does not flash.
  round = mix(-0.57, round, smoothstep(0.05, 0.4, min(cosI, cosO)));
  float between = 0.5 * (1.0 + cosI * cosO + sinI * sinO);
  float glance = sqrt(saturate(0.5 + 0.5 * dot(toSun, toEye)));
  float mirror = 0.04 + 0.96 * pow(1.0 - glance, 5.0);
  float through = lobe(sinI + sinO, TT_SPREAD) * 0.714 * exp(-TT_TURN * (1.0 + round)) * (1.0 - mirror) * (1.0 - mirror);
  float back = lobe(sinI + sinO, R_SPREAD) * 0.25 * sqrt(saturate(0.5 + 0.5 * round)) * mirror;
  vec3 clear = vec3((through + back) * cosI / max(between, 0.2)) + uHairColor * (EVEN * cosI);
  // Rime is matt: it sends the sun on evenly, a little more against the light, where the ice lets it through.
  if (uPlantFrost > 0.0) clear = mix(clear, RIME * (RIME_SUN * cosI * (0.7 - 0.3 * round) / STRAND_GAIN), uPlantFrost);
  return clear;
}

Strand strandAt(float t) {
  float h1 = fract(hairOwn * 13.37 + 0.21);
  float h3 = fract(hairOwn * 91.71 + 0.43);
  Strand s;
  s.world = plantWorld(hairPoint(t));
  s.along = plantDirection(normalize(hairDir + hairBend * (2.0 * t)));
  s.toEye = normalize(uCamPos - s.world);
  vec4 view = viewMatrix * vec4(s.world, 1.0);
  s.depth = -view.z;
  s.pixel = s.depth * 2.0 / (projectionMatrix[1][1] * uSize.y);
  // Rime gathers toward the tip of a hair, where the air passes: the foot stays a fine line and the ice is widest three quarters of the way out.
  float club = smoothstep(0.1, 0.75, t) * (1.0 - 0.7 * smoothstep(0.75, 1.0, t));
  s.width = uHairCut * uHairWidth * plantSize() * (0.5 + h3) * hairSlim * (hairWide * mix(1.0, mix(0.6, 0.2 - 0.08 * uPlantFrost, hairSlim), pow(t, 1.3 + h1)) + hairRime * club);
  s.share = hairShare / hairSlim;
  float reach = length(s.world - uCamPos);
  float fog = exp(-uFogDensity * exp(-uFogFalloff * max(uCamPos.y, 0.0)) * reach) * (1.0 - 0.5 * uPlantWet);
  vWorld = s.world;
  // The shadow map cannot tell a hair from the body it grows on, a millimeter away, and would darken the foot of every hair on an outline. It is asked farther out, where it can tell what else is in the way; the body's own shade is the term below.
#ifdef SOFT
  float litOut = mix(SHADE_OUT_M, min(SHADE_OUT_M, 2.0 * hairRoot.w), (SOFT_HALF_PX - uHairLeast) / (SOFT_HALF_PX - FINE_HALF_PX));
#else
  float litOut = SHADE_OUT_M;
#endif
  vLitAt = s.world + plantDirection(hairStand) * (litOut * plantSize());
  vDepth = s.depth;
  // A hair grows out of a body. One that points away from the sun stands in that body's shade, closer than the shadow map can tell, and one that points away from the eye is behind it.
  vec3 out3 = plantDirection(hairStand);
  // How far round the dark side a hair still reaches the sun goes with its length: down is in the body's shade sooner than a long hair, and on the face toward the eye it is dark right up to the outline.
  float clear = min(0.95, sqrt(hairRoot.w * plantSize() / 0.0015));
  float shade = smoothstep(-clear, -0.63 * clear, dot(out3, uSunDir) - FACE_SHADE * (0.9 / (clear * clear)) * max(dot(out3, s.toEye), 0.0));
  float behind = smoothstep(-0.85, -0.6, dot(out3, s.toEye));
  float against = smoothstep(0.93, 0.995, -dot(s.toEye, uSunDir));
  vec3 lit = uSunColor * pow(uSunColor / max(uSunColor.r, max(uSunColor.g, uSunColor.b)), vec3(mix(-SUN_PALE, SUN_DEEPEN, against) * (1.0 - uPlantFrost)));
  // Rime is not clear: it hides what is behind it, so it fades by how much of it shows and the air between is laid over it in the fragment.
  float veil = mix(fog * behind, 1.0, uPlantFrost);
  vSun = lit * mix(THROUGH_TINT, vec3(1.0), uPlantFrost) * scatter(s.along, s.toEye, uSunDir) * (STRAND_GAIN * shade * veil);
  // Dew on a hair is a row of beads too small to see, and they send the light every way, not only on past the hair. Straight against the sun the light that goes on past is nearly all there is.
  vSun += lit * THROUGH_TINT * (mix(DEW_GLOW_SIDE, DEW_GLOW, against) * uPlantDew * (1.0 - uPlantWet) * shade * veil);
  // Sky light comes through a fiber as sunlight does, from behind it, where the body it grows on is not in the way. The little it sends back is all a hair on the near face has. Rime takes the sky from all round, as a white card does.
  float open = 1.0 - smoothstep(-0.1, mix(0.6, 0.25, uPlantFrost), dot(out3, s.toEye));
  // A wet hair is a thread of water: it throws the bright low sky behind it on to the lens, far more than a dry hair does.
  vec3 fiber = mix(uHairColor * (SKY_BACK + SKY_THROUGH * open), vec3(WET_BACK + WET_THROUGH * open), uPlantWet);
  vSky = mix(fiber, RIME * (RIME_SKY * mix(1.0, RIME_SHADE, open)), uPlantFrost) * veil;
  // Of the needles on a face turned to the eye few show, each whole: seen end on a needle is a point, and a coat of points is a haze.
  float shows = smoothstep(0.0, 0.08, mix(RIME_FACE, 1.0, open) * behind - 0.92 * fract(hairOwn * 139.71 + 0.57));
  // Rimed down is a velvet: every strand of it shows, faintly, and more where the eye looks along the skin.
  s.share *= mix(1.0, mix(mix(RIME_VELVET, 1.0, open) * behind, shows, hairCoat), uPlantFrost);
  vSkyY = mix(mix(normalize(vec3(0.0, 0.5, 0.0) - s.toEye * open + s.toEye * (1.0 - open)).y, 0.2, uPlantWet), mix(0.25, -0.3, open), uPlantFrost);
  return s;
}
`

const lineVertex = /* glsl */ `
out float vCover;
${strand}
void main() {
  readHair(gl_VertexID / 3);
  if (hairGone) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    return;
  }
  int j = gl_VertexID % 3;
  Strand s = strandAt(0.5 * float(j));
  vec4 here = projectionMatrix * viewMatrix * vec4(s.world, 1.0);
  vec4 foot = hairFoot;
  vec4 tip = hairTip;
  vec2 a = foot.xy / max(foot.w, 1e-5);
  vec2 b = tip.xy / max(tip.w, 1e-5);
  vec2 run = (b - a) * 0.5 * uSize;
  float major = max(abs(run.x), abs(run.y));
  // A hair shorter than two pixels would light one whole pixel in some samples and none in others. It is drawn two pixels long and that much fainter, level in depth, so it does not sparkle. Shorter than a pixel it has no direction to show and is laid across its own, which on an outline is along it: down adds up to a line there, not to a row of beads.
  float stretch = max(1.0, min(2.0 / sqrt(hairSlim), 4.0) / max(major, 1e-3));
  float across = 1.5708 * (1.0 - smoothstep(0.75, 1.5, major));
  mat2 lay = mat2(cos(across), sin(across), -sin(across), cos(across));
  vec2 mid = 0.5 * (a + b);
  vec2 at = mid + lay * ((here.xy / max(here.w, 1e-5) - mid) * uSize) * stretch / uSize;
  vec2 laid = lay * run * stretch;
  float level = 0.5 * (foot.z / max(foot.w, 1e-5) + tip.z / max(tip.w, 1e-5));
  vCover = s.width / s.pixel * s.share * length(run) / max(max(abs(laid.x), abs(laid.y)), 1e-3);
  gl_Position = stretch > 1.0 ? vec4(at * here.w, level * here.w, here.w) : here;
}
`

const ribbonVertex = /* glsl */ `
out float vAcross;
out float vHalf;
out float vShare;
#ifdef SOFT
uniform float uHairLeast;
#endif
${strand}
void main() {
  readHair(gl_VertexID / 10);
  if (hairGone) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    return;
  }
  int j = gl_VertexID % 10;
  Strand s = strandAt(0.25 * float(j >> 1));
  vec3 side = normalize(cross(s.along, s.toEye));
  float halfPx = 0.5 * s.width / s.pixel;
  float share = s.share;
  vec3 at = s.world;
#ifdef SOFT
  bool spread = true;
  float least = uHairLeast;
#else
  bool spread = max(uPlantDew, uPlantWet) > 0.0;
  float least = SOFT_HALF_PX;
#endif
  if (spread) {
    float soft = max(halfPx, least);
    float stretch = clamp(SOFT_LONG_PX / max(hairLong, 1e-3), 1.0, 6.0);
    share *= halfPx / (soft * stretch);
    halfPx = soft;
    at += (plantWorld(hairPoint(1.0)) - plantWorld(hairPoint(0.0))) * ((0.25 * float(j >> 1) - 0.5) * (stretch - 1.0));
  }
  vAcross = (float(j & 1) * 2.0 - 1.0) * (halfPx + 0.75);
  vHalf = halfPx;
  vShare = share;
  vec3 world = at + side * (vAcross * s.pixel);
  gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
}
`

// A bead or a drop is a ball of clear water or ice: it mirrors the sun as a point, and what is seen through it is the world behind it turned over. A frozen one is clouded and shows mostly its own white.
export const ball = /* glsl */ `
const float BALL_GLINT = 30.0;
const float BALL_SHARP = 400.0;
const float BALL_SUN = 40.0;
const float BALL_WATER_SUN = 0.25;
const float BALL_WATER = 0.1;
const vec3 BALL_ICE = vec3(0.9, 0.95, 1.0);
vec3 ballLight(vec2 d, vec3 right, vec3 up, vec3 world, float sun, float frozen, float px) {
  float off = min(length(d), 0.999);
  vec3 toEye = normalize(uCamPos - world);
  vec3 out2 = (right * d.x + up * d.y) / max(length(d), 1e-3);
  vec3 n = out2 * off + toEye * sqrt(1.0 - off * off);
  float turn = 2.0 * (asin(off) - asin(off / 1.33));
  vec3 through = -toEye * cos(turn) - out2 * sin(turn);
  float edge = 0.02 + 0.98 * pow(1.0 - saturate(dot(n, toEye)), 5.0);
  float sky = plantSky(world);
  vec3 lens = skyAmbient(through) * sky + uSunColor * (BALL_SUN * mix(BALL_WATER_SUN, 1.0, frozen) * sun * pow(saturate(dot(through, uSunDir)), 60.0));
  vec3 mirror = skyAmbient(reflect(-toEye, n)) * sky;
  vec3 matt = BALL_ICE * skyAmbient(n) * sky;
  // Clear water mirrors little of the sun: its sparkle is the sun seen through it. A highlight smaller than a pixel is spread over the pixel.
  float fine = mix(clamp(px * px * 0.0625, 0.01, 1.0), 1.0, frozen);
  return mix(mix(lens, matt, 0.85 * frozen), mirror, edge) + uSunColor * (BALL_GLINT * mix(BALL_WATER, 1.0, frozen) * fine * sun * pow(saturate(dot(n, normalize(toEye + uSunDir))), BALL_SHARP * fine));
}
`

// What rime, dew and rain add to a hair. Rime: two side barbs of ice and two frozen beads, one near the tip and a smaller one below it. Dew: a bead at the tip. Rain: a drop below it.
const extraVertex = /* glsl */ `
uniform sampler2D uPicks;
uniform int uPickFrom;
out vec2 vAt;
out vec3 vShape;
out vec3 vRight;
out vec3 vUp;
${strand}
void main() {
  int p = gl_VertexID / 16 + uPickFrom;
  int j = gl_VertexID % 16;
  int piece = j >> 2;
  float sx = float(j & 1) * 2.0 - 1.0;
  float end = float((j >> 1) & 1);
  readHair(int(texelFetch(uPicks, ivec2(p & 2047, p >> 11), 0).r + 0.5));
  // The lists of hairs that sit on frames are made once, of every hair that can ever carry ice or water: one that is not long enough yet carries none.
  if (hairGone || (uHairSeats.x > 0.5 && hairLaid * plantSize() < (uPlantFrost > 0.5 ? ${EXTRA_FROM_M.toFixed(5)} : ${DEW_FROM_M.toFixed(5)}))) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    return;
  }
  float n = float(piece);
  float hA = fract(hairOwn * (419.3 + 61.7 * n) + 0.13 * n);
  float hB = fract(hairOwn * (523.9 + 37.1 * n) + 0.41);
  if (piece < 2) {
    Strand s = strandAt(0.25 + 0.3 * n + 0.2 * hA);
    vec3 ref = abs(s.along.y) < 0.9 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);
    vec3 e1 = normalize(cross(s.along, ref));
    vec3 aside = e1 * cos(6.2832 * hB) + cross(s.along, e1) * sin(6.2832 * hB);
    vec3 axis = normalize(s.along * 0.7 + aside);
    float reach = hairRoot.w * plantSize() * (0.12 + 0.2 * hB);
    float longPx = reach * length(cross(axis, s.toEye)) / s.pixel;
    float stretch = max(1.0, 1.5 / max(longPx, 1e-3));
    vec3 here = s.world + axis * (reach * (0.5 + (end - 0.5) * stretch));
    float halfPx = 0.35 * s.width * (1.0 - 0.9 * end) / s.pixel;
    vAt = vec2(sx * (halfPx + 0.75), 0.0);
    vShape = vec3(0.0, halfPx, s.share / stretch);
    vRight = vec3(0.0);
    vUp = vec3(0.0);
    gl_Position = uPlantFrost > 0.5 ? projectionMatrix * viewMatrix * vec4(here + normalize(cross(axis, s.toEye)) * (vAt.x * s.pixel), 1.0) : vec4(2.0, 2.0, 2.0, 1.0);
  } else {
    float tip = piece == 2 ? 1.0 : 0.0;
    Strand s = strandAt(mix(0.35 + 0.3 * hA, 0.75 + 0.15 * hA, tip));
    // One long hair in ten holds a bead near its tip, and one in twenty a smaller one below it.
    float radius = 0.00006 * (1.2 + 1.8 * hB) * mix(0.6, 1.0, tip) * plantSize() * (hA < mix(0.1, 0.2, tip) ? 1.0 : 0.0);
    float shows = 1.0;
    // Dew: each hair that was picked holds one bead at its tip, no larger than the hair can carry. On a face turned to the eye a clear bead shows the skin behind it and little else.
    if (uPlantFrost < 0.5) {
      s = strandAt(mix(0.6, 0.8, tip) + 0.15 * hA);
      float dew = fract(hairOwn * 211.31 + 0.77) <= DEW_SHARE ? sqrt(uPlantDew * (1.0 - uPlantWet)) : 0.0;
      // The drop a wet hair carries hangs below the bead of dew, if it has both.
      radius = mix(hairBead, min(DEW_M * (0.6 + 1.4 * hB), DEW_OF_HAIR * hairRoot.w) * dew, tip) * plantSize();
      shows = mix(DEW_FACE, 1.0, 1.0 - smoothstep(0.0, 0.6, dot(plantDirection(hairStand), s.toEye)));
    }
    float rPx = radius / s.pixel;
    float sy = end * 2.0 - 1.0;
    vRight = normalize(cross(vec3(0.0, 1.0, 0.0), s.toEye));
    vUp = cross(s.toEye, vRight);
    float reachPx = max(rPx, 0.5) + 0.75;
    vAt = vec2(sx, sy) * reachPx;
    vShape = vec3(1.0, rPx, min(1.0, s.share) * shows);
    gl_Position = projectionMatrix * viewMatrix * vec4(s.world + (vRight * vAt.x + vUp * vAt.y) * (radius > 0.0 ? s.pixel : 0.0), 1.0);
  }
}
`

// Far from the lens a clear hair and a rimed one are drawn in two forms, so that coat thins to nothing as the frost dial passes its middle and comes back in the other form. Barbs and beads of ice grow from the middle of the dial to its top and melt the same way, and the dew comes below it.
const turn = /* glsl */ `
float rimeTurn() {
  return smoothstep(0.0, 0.1, abs(uPlantFrost - 0.5));
}
float iceTurn() {
  return uPlantFrost > 0.5 ? smoothstep(0.5, 1.0, uPlantFrost) : smoothstep(0.5, 0.4, uPlantFrost);
}
`

const extraFragment = /* glsl */ `
in vec3 vWorld;
in vec3 vLitAt;
in float vDepth;
in vec3 vSun;
in vec3 vSky;
in float vSkyY;
in vec2 vAt;
in vec3 vShape;
in vec3 vRight;
in vec3 vUp;
${ball}
${turn}
void main() {
  float cover;
  vec3 color;
  float sun = plantSun(vLitAt, uSunDir);
  float turn = iceTurn();
  if (vShape.x < 0.5) {
    float x = abs(vAt.x);
    cover = saturate(max(0.0, min(vShape.y, x + 0.5) - max(-vShape.y, x - 0.5)) * max(vShape.z, 0.0)) * turn;
    color = max(vSun, 0.0) * sun + max(vSky, 0.0) * skyAmbient(vec3(0.0, vSkyY, 0.0)) * plantSky(vWorld);
  } else {
    float r = max(vShape.y, 0.5);
    cover = saturate(r - length(vAt) + 0.5) * (vShape.y * vShape.y / (r * r)) * max(vShape.z, 0.0) * turn;
    color = ballLight(vAt / r, vRight, vUp, vWorld, sun, uPlantFrost, vShape.y);
  }
#ifdef BLUR_CIRCLE
  outColor = vec4(0.0, 0.0, 0.0, cover > 0.2 ? cocOf(vDepth) : 4096.0);
#else
  if (cover < 0.004) discard;
  outColor = vec4(finish(color, vWorld, vDepth, -1.0).rgb, cover);
#endif
}
`

const fragment = /* glsl */ `
in vec3 vWorld;
in vec3 vLitAt;
in float vDepth;
in vec3 vSun;
in vec3 vSky;
in float vSkyY;
#ifdef RIBBON
in float vAcross;
in float vHalf;
in float vShare;
#else
in float vCover;
#endif
#ifdef FADE
uniform float uHairFade;
#endif
${turn}
void main() {
#ifdef RIBBON
  float x = abs(vAcross);
  float cover = max(0.0, min(vHalf, x + 0.5) - max(-vHalf, x - 0.5)) * max(vShare, 0.0);
#else
  float cover = max(vCover, 0.0);
#endif
#ifdef FADE
  cover *= uHairFade * rimeTurn();
#endif
  float sun = plantSun(vLitAt, uSunDir);
  vec3 light = max(vSun, 0.0) * sun + max(vSky, 0.0) * skyAmbient(vec3(0.0, vSkyY, 0.0)) * plantSky(vWorld);
  vec3 color = light * cover;
  // With frost on it a hair is part clear and part rime: its light is added by the clear share and what is behind is covered by the rimed share, so the coat follows the dial.
  if (uPlantFrost > 0.0) {
#ifdef BLUR_CIRCLE
    float seen = dot(color, vec3(0.3, 0.6, 0.1)) * (1.0 - uPlantFrost) / 0.002 + cover * uPlantFrost / 0.2;
    outColor = vec4(0.0, 0.0, 0.0, seen > 1.0 ? cocOf(vDepth) : 4096.0);
#else
    float solid = saturate(cover);
    outColor = vec4(mix(color, finish(light, vWorld, vDepth, -1.0).rgb * solid, uPlantFrost), uPlantFrost * solid);
#endif
    return;
  }
  // Light is added to what is behind, as a clear fiber does. The blur circle is the smaller of the hair's own and the one behind it, and only where the hair shows, so the lens does not smear a sharp bright hair into a soft background.
  float shows = dot(color, vec3(0.3, 0.6, 0.1));
  outColor = vec4(color, shows > 0.002 ? cocOf(vDepth) : 4096.0);
}
`

// Fine hairs. Far from the lens each is a line a pixel wide that adds its true share of light; close to it each is a thin ribbon turned to the camera. The part that wears them gives each hair its root and its direction at both ends of the shutter.
const KEYS = 6
const SIGNS = 16

// What was gathered for one view: the hairs that stand for the coat and the hairs that carry ice or water, in textures of their own.
interface Gathered {
  texture: THREE.DataTexture
  pickTexture: THREE.DataTexture
  // How many hairs of the list wear rime, and how many carry a drop only, a drop and dew, and dew only.
  picked: Int32Array
  kept: number
  nearest: number
  longest: number
  sign: Float64Array
}

function hairTexture(data: Float32Array, width: number, format: THREE.PixelFormat): THREE.DataTexture {
  const texture = new THREE.DataTexture(data, width, data.length / (width * (format === THREE.RedFormat ? 1 : 4)), format, THREE.FloatType)
  texture.colorSpace = THREE.NoColorSpace
  texture.minFilter = THREE.NearestFilter
  texture.magFilter = THREE.NearestFilter
  texture.generateMipmaps = false
  texture.needsUpdate = true
  return texture
}

// A length on a scale of doublings, at its nearest step.
function stepped(v: number): number {
  return v > 0 ? 2 ** (Math.round(Math.log2(v) * STEPS_PER_DOUBLING) / STEPS_PER_DOUBLING) : 0
}

// A direction in the two numbers a frame keeps it in: the first is written at `at`, the second at `at2`.
export function packWay(out: Float32Array, at: number, at2: number, x: number, y: number, z: number): void {
  const l = Math.abs(x) + Math.abs(y) + Math.abs(z) || 1
  const ex = x / l
  const ey = y / l
  out[at] = z < 0 ? (1 - Math.abs(ey)) * (ex >= 0 ? 1 : -1) : ex
  out[at2] = z < 0 ? (1 - Math.abs(ex)) * (ey >= 0 ? 1 : -1) : ey
}

// The frames a part lays for the hairs that sit on it: places on its body, for each of the two slots. Every set of hairs on the part reads the same frames.
export interface HairFrames {
  readonly count: number
  // The frames of a slot, to be written: 12 numbers a frame (its middle and how long the hairs on it are, as a share of their full length; its first arm and the first number of its way along the body; its second arm and the second), or 32 for a wide one (then how far its skin has grown, the most a hair on it may be long or 0 for any, how high its ribs stand as a share of its radius, one spare, and eight swellings on its ring, each the way it points in the ring's own two arms times how far it stands out as a share of the radius; on a wide ring how far the two numbers of a hair's seat are from 1 is how high the hair stands on a rib, and its skin leans as the ring widens or narrows along the body). A sheet has 4 numbers a point: where it is, and how long the hairs round it are; a hair between point f0, the next after it, point f1 and the next after that stands as far from f0 to f1 as its share says and as far toward the next as c1 says. Asking marks the slot as laid, from frame `from` up to `to` when they are given: only those are sent.
  slot(slot: 0 | 1, from?: number, to?: number): Float32Array
  // How the part stands in the plant in a slot. Left alone, as it lies.
  pose(slot: 0 | 1, matrix: THREE.Matrix4): void
  // Sends the slots that were laid since the last time, and no other.
  finish(): void
}

class Frames implements HairFrames {
  readonly texels: number
  readonly stride: number
  readonly textures: [THREE.DataTexture, THREE.DataTexture]
  readonly poses: [THREE.Matrix4, THREE.Matrix4] = [new THREE.Matrix4(), new THREE.Matrix4()]
  // The longest any hair is drawn, as a share of its full length.
  reach = 0
  private readonly views: [Float32Array, Float32Array]
  private readonly from = [Infinity, Infinity]
  private readonly to = [0, 0]
  private readonly whole = [true, true]
  private readonly most = [0, 0]
  private readonly turned = new THREE.Matrix4()
  private readonly key = new Float64Array(9).fill(NaN)
  private laid = 0
  private nearest = Infinity

  constructor(readonly count: number, kind: boolean | 'sheet') {
    this.texels = kind === 'sheet' ? 1 : kind ? 8 : 3
    this.stride = this.texels * 4
    const rows = Math.max(1, Math.ceil(count / FRAME_ROW))
    const make = (): THREE.DataTexture => hairTexture(new Float32Array(rows * FRAME_ROW * this.stride), FRAME_ROW * this.texels, THREE.RGBAFormat)
    this.textures = [make(), make()]
    this.views = [0, 1].map((k) => (this.textures[k].image.data as Float32Array).subarray(0, count * this.stride)) as [Float32Array, Float32Array]
    for (let k = 0; k < 2; k++) this.textures[k].onUpdate = () => void (this.whole[k] = false)
  }

  slot(slot: 0 | 1, from = 0, to = this.count): Float32Array {
    if (from < this.from[slot]) this.from[slot] = Math.max(0, from)
    if (to > this.to[slot]) this.to[slot] = Math.min(this.count, to)
    return this.views[slot]
  }

  pose(slot: 0 | 1, matrix: THREE.Matrix4): void {
    this.poses[slot].copy(matrix)
    this.laid++
  }

  finish(): void {
    for (let k = 0; k < 2; k++) {
      const from = this.from[k]
      const to = this.to[k]
      if (!(from < to)) continue
      this.from[k] = Infinity
      this.to[k] = 0
      const texture = this.textures[k]
      const first = Math.floor(from / FRAME_ROW)
      const last = Math.floor((to - 1) / FRAME_ROW)
      // Only the rows that were laid are sent, once the whole has been: the whole waits until something draws it, and ranges that pile up meanwhile give way to it.
      if (this.whole[k] || (from === 0 && to === this.count) || texture.updateRanges.length > 2 * Math.ceil(this.count / FRAME_ROW)) {
        texture.clearUpdateRanges()
        this.whole[k] = true
      } else for (let r = first; r <= last; r++) texture.addUpdateRange(Math.max(from, r * FRAME_ROW) * this.stride, (Math.min(to, (r + 1) * FRAME_ROW) - Math.max(from, r * FRAME_ROW)) * this.stride)
      texture.needsUpdate = true
      const data = this.views[k]
      let most = 0
      for (let f = 0; f < this.count; f++) if (data[f * this.stride + 3] > most) most = data[f * this.stride + 3]
      this.most[k] = most
      this.laid++
    }
    this.reach = Math.max(this.most[0], this.most[1])
  }

  // How far the nearest frame that bears hairs is from the lens, along its axis. Worked out again only when the frames or the view have changed.
  near(camera: THREE.Camera, object: THREE.Object3D): number {
    const v = camera.matrixWorldInverse.elements
    const m = object.matrixWorld.elements
    const key = this.key
    if (key[0] === this.laid && key[1] === v[2] && key[2] === v[6] && key[3] === v[10] && key[4] === v[14] && key[5] === m[12] && key[6] === m[13] && key[7] === m[14] && key[8] === m[0]) return this.nearest
    key[0] = this.laid
    key[1] = v[2]
    key[2] = v[6]
    key[3] = v[10]
    key[4] = v[14]
    key[5] = m[12]
    key[6] = m[13]
    key[7] = m[14]
    key[8] = m[0]
    let nearest = Infinity
    const step = Math.max(1, Math.floor(this.count / 1024))
    for (let k = 0; k < 2; k++) {
      const e = this.turned.multiplyMatrices(camera.matrixWorldInverse, object.matrixWorld).multiply(this.poses[k]).elements
      const data = this.views[k]
      for (let f = 0; f < this.count; f += step) {
        const o = f * this.stride
        if (!(data[o + 3] > 0)) continue
        const w = -(e[2] * data[o] + e[6] * data[o + 1] + e[10] * data[o + 2] + e[14])
        if (w < nearest) nearest = w
      }
    }
    this.nearest = Math.max(nearest, 1e-4)
    return this.nearest
  }
}

export function createHairFrames(count: number, kind: boolean | 'sheet' = false): HairFrames {
  return new Frames(count, kind)
}

let blank: THREE.DataTexture | null = null

export class HairSet {
  readonly surface: Surface
  // The two forms of the hairs. One of them is drawn in any sample. A part that wears hairs adds all of them to its own meshes.
  readonly meshes: THREE.Mesh[]
  private roots: [Float32Array, Float32Array]
  private leans: [Float32Array, Float32Array]
  private readonly lines = new THREE.BufferGeometry()
  private readonly ribbons = new THREE.BufferGeometry()
  private readonly linesSharp = new THREE.BufferGeometry()
  private readonly ribbonsSharp = new THREE.BufferGeometry()
  private readonly ribbonsSoft = new THREE.BufferGeometry()
  private readonly lineFade = { value: 1 }
  private readonly softFade = { value: SOFT_LIGHT }
  private readonly softLeast = { value: FINE_HALF_PX }
  private readonly extras = new THREE.BufferGeometry()
  private readonly picks: Float32Array
  private readonly pickFrom = { value: 0 }
  private data: Float32Array
  private main: Gathered
  // While the plant's clock stands each shot has one lens, and what was gathered for it is kept: a cut only changes which textures are read.
  private readonly lenses: (Gathered | null)[] = []
  private now: Gathered
  private readonly hairsAt: { value: THREE.DataTexture }
  private readonly picksAt: { value: THREE.DataTexture }
  private readonly sign = new Float64Array(SIGNS)
  private laid = 0
  private signed = -1
  private shape = 0
  private shown: number
  private stale = true
  private sent = false
  private mainKept = 0
  private readonly key = new Float64Array(KEYS)
  private readonly keyWas = new Float64Array(KEYS).fill(NaN)
  private readonly stands: { held: number }
  private readonly keyed: { value: number }
  private readonly rows: number
  private readonly views = new Map<number, Float32Array>()
  private readonly eye = new THREE.Vector3()
  private readonly clip = new THREE.Matrix4()
  private at: Float32Array
  private crowd = new Float32Array(0)
  private faces: Uint8Array | null = null
  // The hairs of a set that sits on frames: where each sits, written once.
  private frames: Frames | null = null
  private seats: Float32Array | null = null
  private fixed: Gathered | null = null
  private typical = 0
  private fullest = 0
  private pickedFor = -1
  private faced = false
  private readonly framesA: { value: THREE.DataTexture }
  private readonly framesB: { value: THREE.DataTexture }
  private readonly poseA = { value: new THREE.Matrix4() }
  private readonly poseB = { value: new THREE.Matrix4() }
  private readonly seatsAt = { value: new THREE.Vector4(0, 3, 1, 0) }
  private readonly cut = { value: 1 }

  constructor(options: PartOptions, readonly count: number, name: string, color: [number, number, number] = [0.9, 0.95, 0.8], private readonly widthM = 0.00004) {
    if (options.places) throw new Error('hairs are worn by the plant and the companion only')
    this.shown = count
    this.stands = options.stands ?? { held: 0 }
    this.keyed = (options.own?.uOwnKeys as { value: number } | undefined) ?? { value: 0 }
    this.roots = [new Float32Array(count * 4), new Float32Array(count * 4)]
    this.leans = [new Float32Array(count * 4), new Float32Array(count * 4)]
    this.at = new Float32Array(count * 2)
    const rows = Math.max(1, Math.ceil(count / ROW))
    this.data = new Float32Array(ROW * 4 * rows * 4)
    const texture = hairTexture(this.data, ROW * 4, THREE.RGBAFormat)
    texture.onUpdate = () => {
      this.sent = true
    }
    this.hairsAt = { value: texture }
    this.rows = rows
    // The vertices carry nothing: a vertex knows its hair and its place on it from its number.
    const lineIndex = new Uint32Array(count * 6)
    const ribbonIndex = new Uint32Array(count * 36)
    for (let k = 0; k < count; k++) {
      const v = k * 3
      lineIndex.set([v, v + 2], k * 2)
      lineIndex.set([v, v + 1, v + 1, v + 2], count * 2 + k * 4)
      const w = k * 10
      const band = (a: number, b: number) => [w + a * 2, w + a * 2 + 1, w + b * 2, w + a * 2 + 1, w + b * 2 + 1, w + b * 2]
      ribbonIndex.set([...band(0, 2), ...band(2, 4)], k * 12)
      ribbonIndex.set([...band(0, 1), ...band(1, 2), ...band(2, 3), ...band(3, 4)], count * 12 + k * 24)
    }
    this.lines.setIndex(new THREE.BufferAttribute(lineIndex, 1))
    this.ribbons.setIndex(new THREE.BufferAttribute(ribbonIndex, 1))
    blank ??= hairTexture(new Float32Array(4), 1, THREE.RGBAFormat)
    this.framesA = { value: blank }
    this.framesB = { value: blank }
    const own = { uHairColor: { value: new THREE.Vector3(...color) }, uHairWidth: { value: widthM }, uHairs: this.hairsAt, uHairFramesA: this.framesA, uHairFramesB: this.framesB, uHairPoseA: this.poseA, uHairPoseB: this.poseB, uHairSeats: this.seatsAt, uHairCut: this.cut }
    const make = (label: string, vertex: string, define: string, sharp = false, fade?: { value: number }, soft = ''): Surface =>
      makePartSurface(options, { name: label, vertex: `${soft}${vertex}`, fragment: `${define}${fragment}`, side: THREE.DoubleSide, transparent: true, additive: !sharp, cocOnly: sharp, castShadow: false, uniforms: fade ? { ...own, uHairFade: fade, uHairLeast: this.softLeast } : own })
    this.surface = make(name, lineVertex, '#define FADE 1\n', false, this.lineFade)
    const close = make(`${name} close`, ribbonVertex, '#define RIBBON 1\n')
    const line = (geometry: THREE.BufferGeometry, surface: Surface): THREE.Mesh => {
      const mesh = new THREE.LineSegments(geometry, surface.main)
      mesh.frustumCulled = false
      mesh.matrixAutoUpdate = false
      return mesh as unknown as THREE.Mesh
    }
    const far = line(this.lines, this.surface)
    const near = partMesh(this.ribbons, close)
    // Rime hides what is behind it, and a thing drawn that way does not keep its own blur circle: a second pass keeps it.
    this.linesSharp.setIndex(this.lines.getIndex())
    this.ribbonsSharp.setIndex(this.ribbons.getIndex())
    const farSharp = line(this.linesSharp, make(`${name} blur circle`, lineVertex, '#define BLUR_CIRCLE 1\n', true))
    const nearSharp = partMesh(this.ribbonsSharp, make(`${name} close blur circle`, ribbonVertex, '#define RIBBON 1\n#define BLUR_CIRCLE 1\n', true))
    far.renderOrder = HAIR_ORDER
    near.renderOrder = HAIR_ORDER + 1
    farSharp.renderOrder = HAIR_ORDER + 2
    nearSharp.renderOrder = HAIR_ORDER + 2
    // In the wide shot a hair under a pixel wide is a soft stroke a pixel and a half wide with the same light, so it holds still as the camera moves.
    this.ribbonsSoft.setIndex(this.ribbons.getIndex())
    const soft = partMesh(this.ribbonsSoft, make(`${name} far soft`, ribbonVertex, '#define RIBBON 1\n#define FADE 1\n', false, this.softFade, '#define SOFT 1\n'))
    soft.renderOrder = HAIR_ORDER
    soft.onBeforeRender = (_renderer, _scene, camera) => this.choose(camera, soft, false, true)
    far.onBeforeRender = (_renderer, _scene, camera) => this.choose(camera, far, false)
    near.onBeforeRender = (_renderer, _scene, camera) => this.choose(camera, near, true)
    const most = Math.min(count, MOST_PICKS)
    this.picks = new Float32Array(2048 * Math.max(1, Math.ceil((2 * most) / 2048)))
    this.picksAt = { value: hairTexture(this.picks, 2048, THREE.RedFormat) }
    this.main = { texture, pickTexture: this.picksAt.value, picked: new Int32Array(4), kept: 0, nearest: 1, longest: 0, sign: new Float64Array(SIGNS).fill(NaN) }
    this.now = this.main
    const extraIndex = new Uint32Array(most * 24)
    for (let k = 0; k < most * 4; k++) {
      const v = k * 4
      extraIndex.set([v, v + 1, v + 2, v + 1, v + 3, v + 2], k * 6)
    }
    this.extras.setIndex(new THREE.BufferAttribute(extraIndex, 1))
    const extraUniforms = { ...own, uPicks: this.picksAt, uPickFrom: this.pickFrom }
    const extra = (label: string, define: string, sharp: boolean): THREE.Mesh =>
      partMesh(this.extras, makePartSurface(options, { name: label, vertex: extraVertex, fragment: `${define}${extraFragment}`, side: THREE.DoubleSide, transparent: true, cocOnly: sharp, castShadow: false, uniforms: extraUniforms }))
    const barbs = extra(`${name} barbs and beads`, '', false)
    const barbsSharp = extra(`${name} barbs and beads blur circle`, '#define BLUR_CIRCLE 1\n', true)
    barbs.renderOrder = HAIR_ORDER + 3
    barbsSharp.renderOrder = HAIR_ORDER + 4
    this.meshes = [far, near, farSharp, nearSharp, barbs, barbsSharp, soft]
  }

  // A hair outside the picture is left out, and of the hairs far out of focus a share is left out and the rest stand for them. While the plant's clock stands the view is the stepped one, in which nothing is outside the picture.
  private gather(camera: THREE.Camera, object: THREE.Object3D, view: 0 | 1 | 2): void {
    const stepped = view > 0
    const lens = view === 2
    const e = this.clip.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse).multiply(object.matrixWorld).elements
    const m = object.matrixWorld.elements
    const size = norm(m[0], m[1], m[2])
    const [ra, rb] = this.roots
    const [la, lb] = this.leans
    const out = this.data
    const key = this.key
    const cocScale = lens ? held.cocScale : stepped ? key[5] : shared.uCocScale.value
    const focus = lens ? held.focusM : stepped ? key[4] : shared.uFocusM.value
    const focusNear = lens ? held.focusNearM : stepped ? key[4] : shared.uFocusNear.value
    const height = shared.uSize.value.y
    const width = shared.uSize.value.x
    const cols = (stepped ? 2 : 1) * (Math.ceil(width / CROWD_CELL_PX) + 1)
    const rows = (stepped ? 2 : 1) * (Math.ceil(height / CROWD_CELL_PX) + 1)
    const most = 4 * (Math.ceil(width / CROWD_CELL_PX) + 1) * (Math.ceil(height / CROWD_CELL_PX) + 1)
    if (this.crowd.length !== most) this.crowd = new Float32Array(most)
    const crowd = this.crowd
    crowd.fill(0)
    const at = this.at
    const perM = lens ? held.perTan : stepped ? key[3] : (camera.projectionMatrix.elements[5] * height) / 2
    // For the stepped view hairs are left out as if each were as thick as rime or rain ever makes it, so the same hairs stand for the coat whatever the frost and the rain do meanwhile.
    const thick = stepped ? Math.max(1 + RIME_M / this.widthM, 3) : (1 + (RIME_M / this.widthM) * stateUniforms.uPlantFrost.value) * (1 + 2 * stateUniforms.uPlantWet.value)
    // The stepped view looks from the stepped place of the lens toward the foot of the plant, which stands low in it. A held lens looks where the shot looks.
    const ex = lens ? held.eye.x : key[0]
    const ey = lens ? held.eye.y : key[1]
    const ez = lens ? held.eye.z : key[2]
    let fx = lens ? held.forward.x : m[12] - ex
    let fy = lens ? held.forward.y : m[13] - ey
    let fz = lens ? held.forward.z : m[14] - ez
    const fl = norm(fx, fy, fz) || 1
    fx /= fl
    fy /= fl
    fz /= fl
    const sl = Math.hypot(fx, fz)
    const sx = sl > 1e-6 ? -fz / sl : 1
    const sz = sl > 1e-6 ? fx / sl : 0
    const low = lens ? 0.5 : 0.3
    const ux = -sz * fy
    const uy = sz * fx - sx * fz
    const uz = sx * fy
    const perCell = perM / CROWD_CELL_PX
    // In the wide shot a hair is a fraction of a pixel wide. There each is drawn long enough to stand off the outline, and where they crowd all of them dim alike instead of some going out.
    const ease = Math.min(1, Math.max(0, (shared.uTime.value - WIDE_FROM_S) / (WIDE_FULL_S - WIDE_FROM_S)))
    const wide = ease * ease * (3 - 2 * ease)
    let n = 0
    let nearest = Infinity
    let longest = 0
    // When both slots are keys a hair is as long as the mix of them says, and it is kept when it has a length in either.
    const keyed = this.keyed.value > 0
    const faces = lens && (held.focusM * width) / held.perTan < CLOSE_FRAME_M && fy < -LOOKS_DOWN ? this.faces : null
    for (let i = 0; i < this.shown; i++) {
      const o = i * 4
      const here = ra[o + 3] > 0
      const there = keyed ? rb[o + 3] > 0 : here
      const length = keyed ? Math.max(ra[o + 3], rb[o + 3]) : ra[o + 3]
      if (!(length > 0)) continue
      // A hair that has no size in one slot has no place there either: it stays where the other has it.
      const from = here ? ra : rb
      const x = from[o]
      const y = from[o + 1]
      const z = from[o + 2]
      const long = length * size
      let w: number
      let px: number
      let py: number
      if (stepped) {
        const rx = m[0] * x + m[4] * y + m[8] * z + m[12] - ex
        const ry = m[1] * x + m[5] * y + m[9] * z + m[13] - ey
        const rz = m[2] * x + m[6] * y + m[10] * z + m[14] - ez
        w = norm(rx, ry, rz)
        if (w < long) continue
        const deep = Math.max(rx * fx + ry * fy + rz * fz, 0.2 * w)
        px = Math.min(cols - 1.001, Math.max(0, 0.5 * cols + ((rx * sx + rz * sz) / deep) * perCell))
        py = Math.min(rows - 1.001, Math.max(0, low * rows + ((rx * ux + ry * uy + rz * uz) / deep) * perCell))
      } else {
        w = e[3] * x + e[7] * y + e[11] * z + e[15]
        if (w < long) continue
        const cx = e[0] * x + e[4] * y + e[8] * z + e[12]
        const cy = e[1] * x + e[5] * y + e[9] * z + e[13]
        const reach = w * (1.04 + (2 * blurPx(cocScale, focus, focusNear, w)) / height) + long * 4
        if (Math.abs(cx) > reach || Math.abs(cy) > reach) continue
        px = Math.min(cols - 1.001, Math.max(0, ((cx / w) * 0.5 + 0.5) * (width / CROWD_CELL_PX)))
        py = Math.min(rows - 1.001, Math.max(0, ((cy / w) * 0.5 + 0.5) * (height / CROWD_CELL_PX)))
      }
      const coc = blurPx(cocScale, focus, focusNear, w)
      const own = la[o + 3]
      let share = 1
      const scale = (size * perM) / w
      // A hair too short on the screen to show as a strand stands for itself, so a part with short hairs loses none of their light.
      const near = Math.min(1, Math.max(0, (length * scale - STRAND_FROM_PX) / STRAND_FROM_PX))
      const brief = near + (1 - near) * wide
      const fine = Math.min(1, (this.widthM * thick * scale) / (STRAND_PX + (WIDE_STRAND_PX - STRAND_PX) * wide))
      // In the wide shot none is left out for being fine: every hair is a faint soft stroke and the coat sums to an even line that holds still.
      const thin = fine + (1 - fine) * wide * Math.min(1, (this.widthM * thick * scale) / FAR_FROM_PX)
      const part = (1 - brief * (1 - thin)) * (coc > THIN_FROM_PX ? Math.max(THIN_FROM_PX / coc, THIN_LEAST) : 1)
      if (part < 1) {
        const keep = part * (1 + THIN_EASE)
        const h = (own * 151.37 + 0.11) % 1
        const s = Math.min(1, (keep - h) / (THIN_EASE * keep))
        if (s <= 0) continue
        const whole = keep * (1 - THIN_EASE)
        share = s / (keep <= 1 ? keep * (1 - 0.5 * THIN_EASE) : whole + 0.5 * (1 - whole) * (1 + (keep - 1) / (THIN_EASE * keep)))
      }
      // A hair there is drawn long enough to stand off the outline, with the light of its true length and a little more.
      const least = (wide * WIDE_LONG_PX * (0.6 + 0.8 * ((own * 59.31 + 0.19) % 1))) / scale
      const stands = Math.max(length, least)
      share *= (length / stands) * (1 + (WIDE_GAIN - 1) * wide * (1 - fine))
      const wa = here ? la : lb
      const wb = !keyed || there ? lb : la
      const la2 = norm(wa[o], wa[o + 1], wa[o + 2]) || 1
      const lb2 = Math.abs(wb[o]) + Math.abs(wb[o + 1]) + Math.abs(wb[o + 2]) || 1
      const bx = wb[o] / lb2
      const by = wb[o + 1] / lb2
      const fold = wb[o + 2] < 0
      const q = n * 16
      at[n * 2] = px
      at[n * 2 + 1] = py
      crowd[Math.round(py) * cols + Math.round(px)] += (share * this.widthM * scale * Math.min(length * scale, CROWD_CELL_PX)) / (CROWD_CELL_PX * CROWD_CELL_PX)
      out[q] = x
      out[q + 1] = y
      out[q + 2] = z
      out[q + 3] = keyed ? (here ? Math.max(ra[o + 3], least) : 0) : stands
      const second = rb[o + 3] > 0
      out[q + 4] = second ? rb[o] : x
      out[q + 5] = second ? rb[o + 1] : y
      out[q + 6] = second ? rb[o + 2] : z
      out[q + 7] = own
      out[q + 8] = wa[o] / la2
      out[q + 9] = wa[o + 1] / la2
      out[q + 10] = wa[o + 2] / la2
      out[q + 11] = faces !== null && faces[i] === 1 ? -share : share
      out[q + 12] = fold ? (1 - Math.abs(by)) * (bx >= 0 ? 1 : -1) : bx
      out[q + 13] = fold ? (1 - Math.abs(bx)) * (by >= 0 ? 1 : -1) : by
      out[q + 14] = keyed ? (second ? Math.max(rb[o + 3], least) : 0) : stands
      out[q + 15] = Math.min(i / this.count, 0.9999)
      n++
      if (w < nearest) nearest = w
      if (long > longest) longest = long
    }
    for (let k = 0; k < n; k++) {
      const px = at[k * 2]
      const py = at[k * 2 + 1]
      const cx = Math.floor(px)
      const cy = Math.floor(py)
      const gx = px - cx
      const gy = py - cy
      const c = cy * cols + cx
      const cover = (crowd[c] * (1 - gx) + crowd[c + 1] * gx) * (1 - gy) + (crowd[c + cols] * (1 - gx) + crowd[c + cols + 1] * gx) * gy
      if (cover > CROWD_COVER) out[k * 16 + 15] += Math.min(255, Math.round(CROWD_STEPS * Math.log2(cover / CROWD_COVER)))
    }
    // Rime grows barbs and beads on the long hairs that show, dew sets a bead on some and rain hangs a drop on a few. Both lists are kept, the rimed first and then the damp in three runs (a drop only, a drop and dew, dew only), and the state of the plant chooses which run is drawn.
    const room = this.extras.getIndex()!.count / 24
    const picks = this.picks
    const to = lens ? this.lensSet(n) : this.main
    const picked = to.picked.fill(0)
    const worn = stepped || stateUniforms.uPlantFrost.value > 0.5 || stateUniforms.uPlantWet.value > 0 || stateUniforms.uPlantDew.value > 0
    for (let pass = 0; worn && pass < 2; pass++) {
      let rime = 0
      let damp = 0
      let drops = picked[0]
      let both = drops + picked[1]
      let dews = both + picked[2]
      for (let k = 0; k < n; k++) {
        const q = k * 16
        const long = Math.max(out[q + 3], out[q + 14]) * size
        const turn = (out[q + 7] * 211.31 + 0.77) % 1
        if (long >= EXTRA_FROM_M && turn <= EXTRA_SHARE && rime < room) {
          if (pass) picks[rime] = k
          rime++
        }
        const drop = long >= DROP_FROM_M && (out[q + 7] * 71.93 + 0.5) % 1 < DROP_SHARE
        const dew = long >= DEW_FROM_M && turn <= DEW_SHARE
        if ((!drop && !dew) || damp >= room) continue
        damp++
        if (!pass) picked[drop ? (dew ? 2 : 1) : 3]++
        else if (!dew) picks[drops++] = k
        else if (drop) picks[both++] = k
        else picks[dews++] = k
      }
      picked[0] = rime
    }
    to.kept = n
    to.nearest = nearest
    to.longest = longest
    if (lens) {
      const hairs = to.texture.image.data as Float32Array
      hairs.set(out.subarray(0, Math.min(hairs.length, Math.max(1, n) * 16)))
      to.texture.needsUpdate = true
      const list = to.pickTexture.image.data as Float32Array
      list.set(picks.subarray(0, Math.min(list.length, picked[0] + picked[1] + picked[2] + picked[3])))
      to.pickTexture.needsUpdate = true
      return
    }
    if (worn) to.pickTexture.needsUpdate = true
    // Only the rows that hold hairs are sent, and nothing when there were none before and are none now.
    if (n > 0 || this.sent === false || this.mainKept > 0) {
      const rows = this.sent ? Math.max(1, Math.ceil(n / ROW)) : this.rows
      let view = this.views.get(rows)
      if (!view) {
        view = rows === this.rows ? this.data : this.data.subarray(0, rows * ROW * 16)
        this.views.set(rows, view)
      }
      const image = to.texture.image as { data: Float32Array; height: number }
      image.data = view
      image.height = rows
      to.texture.needsUpdate = true
    }
    this.mainKept = n
    this.stale = false
  }

  // The textures a held lens keeps. They are as large as its hairs need, and made again only when a later gathering needs more.
  private lensSet(hairs: number): Gathered {
    const rows = Math.max(1, Math.ceil(hairs / ROW))
    const picks = 2048 * Math.max(1, Math.ceil(Math.min(2 * (this.extras.getIndex()!.count / 24), 2 * hairs) / 2048))
    let set = this.lenses[held.lens] ?? null
    if (set && ((set.texture.image.data as Float32Array).length < rows * ROW * 16 || (set.pickTexture.image.data as Float32Array).length < picks)) {
      set.texture.dispose()
      set.pickTexture.dispose()
      set = null
    }
    set ??= { texture: hairTexture(new Float32Array(rows * ROW * 16), ROW * 4, THREE.RGBAFormat), pickTexture: hairTexture(new Float32Array(picks), 2048, THREE.RedFormat), picked: new Int32Array(4), kept: 0, nearest: 1, longest: 0, sign: new Float64Array(SIGNS).fill(NaN) }
    this.lenses[held.lens] = set
    return set
  }

  // How long the usual hair of the set is on the screen, in pixels, and with it how much of their width its hairs have. Of a set that is not on frames a few hairs are asked.
  private size(camera: THREE.Camera, object: THREE.Object3D): number {
    const m = object.matrixWorld.elements
    const size = norm(m[0], m[1], m[2])
    const perM = (camera.projectionMatrix.elements[5] * shared.uSize.value.y) / 2
    let usual = 0
    let nearest = Infinity
    if (this.frames) {
      usual = this.typical * this.frames.reach
      nearest = this.frames.near(camera, object)
    } else {
      const e = this.clip.multiplyMatrices(camera.matrixWorldInverse, object.matrixWorld).elements
      const [ra, rb] = this.roots
      const step = Math.max(1, Math.floor(this.shown / 64))
      let some = 0
      for (let i = 0; i < this.shown; i += step) {
        const o = i * 4
        const from = ra[o + 3] > 0 ? ra : rb
        if (!(from[o + 3] > 0)) continue
        usual += from[o + 3]
        some++
        const w = -(e[2] * from[o] + e[6] * from[o + 1] + e[10] * from[o + 2] + e[14])
        if (w < nearest) nearest = w
      }
      if (some) usual /= some
      // None of the few that were asked is out: the set is gathered as ever, and that says what shows.
      else {
        this.cut.value = 1
        return 1
      }
    }
    const px = nearest < Infinity ? (usual * size * perM) / Math.max(nearest, 1e-4) : 0
    const t = Math.min(1, Math.max(0, (px - CUT_FROM_PX) / (CUT_FULL_PX - CUT_FROM_PX)))
    this.cut.value = t * t * (3 - 2 * t)
    return this.cut.value
  }

  // The hairs of a set on frames that can carry ice or water, listed once: the rimed first and then the damp in three runs, as a gathering lists them.
  private list(size: number): void {
    const fixed = this.fixed as Gathered
    const seats = this.seats as Float32Array
    const room = this.extras.getIndex()!.count / 24
    const picks = this.picks
    const picked = fixed.picked.fill(0)
    for (let pass = 0; pass < 2; pass++) {
      let rime = 0
      let damp = 0
      let drops = picked[0]
      let both = drops + picked[1]
      let dews = both + picked[2]
      for (let k = 0; k < this.count; k++) {
        const long = seats[k * 12 + 3] * size
        const own = seats[k * 12 + 7]
        const turn = (own * 211.31 + 0.77) % 1
        if (long >= EXTRA_FROM_M && turn <= EXTRA_SHARE && rime < room) {
          if (pass) picks[rime] = k
          rime++
        }
        const drop = long >= DROP_FROM_M && (own * 71.93 + 0.5) % 1 < DROP_SHARE
        const dew = long >= DEW_FROM_M && turn <= DEW_SHARE
        if ((!drop && !dew) || damp >= room) continue
        damp++
        if (!pass) picked[drop ? (dew ? 2 : 1) : 3]++
        else if (!dew) picks[drops++] = k
        else if (drop) picks[both++] = k
        else picks[dews++] = k
      }
      picked[0] = rime
    }
    fixed.pickTexture.needsUpdate = true
    this.pickedFor = size
  }

  private choose(camera: THREE.Camera, object: THREE.Object3D, ribbon: boolean, soft = false): void {
    const shows = this.size(camera, object) > 0
    if (this.frames && this.fixed) {
      const fixed = this.fixed
      const m = object.matrixWorld.elements
      const size = norm(m[0], m[1], m[2])
      if (this.pickedFor !== size) this.list(size)
      fixed.nearest = this.frames.near(camera, object)
      fixed.kept = shows && fixed.nearest < Infinity && this.frames.reach > 0 ? this.shown : 0
      fixed.longest = this.fullest * this.frames.reach * size
      this.seatsAt.value.w = this.faced && this.stands.held >= 1 && held.lens >= 0 && (held.focusM * shared.uSize.value.x) / held.perTan < CLOSE_FRAME_M && held.forward.y < -LOOKS_DOWN ? 1 : 0
      this.now = fixed
      this.draw(camera, object, ribbon, soft, true)
      return
    }
    if (!shows) {
      // Nothing is gathered for a set that is not drawn. What it needs is gathered when it shows again.
      this.extras.setDrawRange(0, 0)
      if (soft) this.ribbonsSoft.setDrawRange(0, 0)
      else {
        ;(ribbon ? this.ribbons : this.lines).setDrawRange(0, 0)
        ;(ribbon ? this.ribbonsSharp : this.linesSharp).setDrawRange(0, 0)
      }
      return
    }
    // A plant that is laid again on every frame has its hairs gathered for that frame's lens. One whose clock stands in a hold of the film keeps what was gathered for the lens of the shot, and reads nothing of the camera. One that stands otherwise keeps what was gathered for the stepped view until a step is crossed.
    if (this.stands.held >= 1 && held.lens >= 0) {
      if (this.signed !== this.laid) {
        this.signed = this.laid
        this.shape = this.shapeSum(object)
      }
      const sign = this.sign
      sign[0] = held.eye.x
      sign[1] = held.eye.y
      sign[2] = held.eye.z
      sign[3] = held.forward.x
      sign[4] = held.forward.y
      sign[5] = held.forward.z
      sign[6] = held.perTan
      sign[7] = held.focusM
      sign[8] = held.cocScale
      sign[9] = shared.uSize.value.x
      sign[10] = shared.uSize.value.y
      sign[11] = this.shown
      sign[12] = this.keyed.value
      sign[13] = this.shape
      sign[14] = held.focusNearM
      let set = this.lenses[held.lens] ?? null
      let same = set !== null
      for (let k = 0; set && k < SIGNS; k++) if (sign[k] !== set.sign[k]) same = false
      if (!same) {
        this.gather(camera, object, 2)
        set = this.lenses[held.lens] as Gathered
        set.sign.set(sign)
      }
      this.now = set as Gathered
    } else if (this.stands.held >= 1) {
      const key = this.key
      const m = object.matrixWorld.elements
      const eye = this.eye.setFromMatrixPosition(camera.matrixWorld)
      const dx = eye.x - m[12]
      const dy = eye.y - m[13]
      const dz = eye.z - m[14]
      const far = Math.max(norm(dx, dy, dz), 1e-4)
      const step = (STEP_DEG * Math.PI) / 180
      const round = Math.round(Math.atan2(dx, dz) / step) * step
      const high = Math.round(Math.asin(dy / far) / step) * step
      const reach = stepped(far)
      key[0] = m[12] + reach * Math.cos(high) * Math.sin(round)
      key[1] = m[13] + reach * Math.sin(high)
      key[2] = m[14] + reach * Math.cos(high) * Math.cos(round)
      key[3] = stepped((camera.projectionMatrix.elements[5] * shared.uSize.value.y) / 2)
      key[4] = stepped(shared.uFocusM.value)
      key[5] = stepped(shared.uCocScale.value)
      let other = this.stale
      for (let k = 0; k < KEYS; k++) if (key[k] !== this.keyWas[k]) other = true
      if (other) {
        this.keyWas.set(key)
        this.gather(camera, object, 1)
      }
      this.now = this.main
    } else {
      if (this.stale) {
        this.keyWas.fill(NaN)
        this.gather(camera, object, 0)
      }
      this.now = this.main
    }
    this.draw(camera, object, ribbon, soft, false)
  }

  // Which form of the hairs is drawn, and how many of them.
  private draw(camera: THREE.Camera, object: THREE.Object3D, ribbon: boolean, soft: boolean, seated: boolean): void {
    const now = this.now
    this.hairsAt.value = now.texture
    this.picksAt.value = now.pickTexture
    // A pixel at the nearest hair, in meters.
    const pixel = now.nearest / (!seated && this.stands.held >= 1 && held.lens >= 0 ? held.perTan : (camera.projectionMatrix.elements[5] * shared.uSize.value.y) / 2)
    const ease = Math.min(1, Math.max(0, (shared.uTime.value - WIDE_FROM_S) / (WIDE_FULL_S - WIDE_FROM_S)))
    const wide = ease * ease * (3 - 2 * ease)
    this.lineFade.value = 1 - wide
    this.softLeast.value = FINE_HALF_PX + (SOFT_HALF_PX - FINE_HALF_PX) * wide
    const geometry = ribbon ? this.ribbons : this.lines
    const sharp = ribbon ? this.ribbonsSharp : this.linesSharp
    // A clear hair adds its light to what is behind it. With frost on it, it covers its rimed share of it.
    const rimed = stateUniforms.uPlantFrost.value > 0.5
    const rained = !rimed && stateUniforms.uPlantWet.value > 0
    const dewy = !rimed && stateUniforms.uPlantDew.value * (1 - stateUniforms.uPlantWet.value) > 0
    const picked = now.picked
    this.pickFrom.value = rimed ? 0 : picked[0] + (rained ? 0 : picked[1])
    this.extras.setDrawRange(0, shared.uDiag.value >= 4 || now.kept === 0 ? 0 : 24 * (rimed ? picked[0] : (rained ? picked[1] : 0) + (rained || dewy ? picked[2] : 0) + (dewy ? picked[3] : 0)))
    const iced = stateUniforms.uPlantFrost.value > 0
    const material = (object as THREE.Mesh).material as THREE.Material
    material.blendSrc = THREE.OneFactor
    material.blendDst = iced ? THREE.OneMinusSrcAlphaFactor : THREE.OneFactor
    material.blendEquationAlpha = iced ? THREE.AddEquation : THREE.MinEquation
    material.blendSrcAlpha = iced ? THREE.ZeroFactor : THREE.OneFactor
    if (soft) {
      const far = this.softRange(pixel, object)
      this.ribbonsSoft.setDrawRange(far.start, far.count)
      return
    }
    const m = object.matrixWorld.elements
    const size = norm(m[0], m[1], m[2])
    const thick = (1 + (RIME_M / this.widthM) * stateUniforms.uPlantFrost.value) * (1 + 2 * stateUniforms.uPlantWet.value)
    // Down that is wider than it is long on the screen stays a line: a ribbon has nothing to show of it.
    const damp = stateUniforms.uPlantDew.value > 0 || stateUniforms.uPlantWet.value > 0
    const close = damp || (Math.min(this.widthM * size, now.longest / 5) * thick * 1.5) / pixel > RIBBON_FROM_PX
    if (now.kept === 0 || close !== ribbon || shared.uDiag.value >= 4 || (!ribbon && !rimed)) {
      geometry.setDrawRange(0, 0)
      sharp.setDrawRange(0, 0)
      return
    }
    const lengthPx = now.longest / pixel
    if (ribbon) {
      if (lengthPx < 12) geometry.setDrawRange(0, now.kept * 12)
      else geometry.setDrawRange(this.count * 12, now.kept * 24)
    } else if (lengthPx < 5) geometry.setDrawRange(0, now.kept * 2)
    else geometry.setDrawRange(this.count * 2, now.kept * 4)
    sharp.setDrawRange(geometry.drawRange.start, iced ? geometry.drawRange.count : 0)
  }

  private softRange(pixel: number, object: THREE.Object3D): { start: number; count: number } {
    const now = this.now
    const m = object.matrixWorld.elements
    const size = norm(m[0], m[1], m[2])
    const thick = (1 + (RIME_M / this.widthM) * stateUniforms.uPlantFrost.value) * (1 + 2 * stateUniforms.uPlantWet.value)
    const damp = stateUniforms.uPlantDew.value > 0 || stateUniforms.uPlantWet.value > 0
    const close = damp || (Math.min(this.widthM * size, now.longest / 5) * thick * 1.5) / pixel > RIBBON_FROM_PX
    if (now.kept === 0 || close || shared.uDiag.value >= 4 || stateUniforms.uPlantFrost.value > 0.5) return { start: 0, count: 0 }
    return now.longest / pixel < 12 ? { start: 0, count: now.kept * 12 } : { start: this.count * 12, count: now.kept * 24 }
  }

  // A number that changes when the laid hairs do: of some of them, where they stand and how long they are, in both slots, and where the plant stands.
  private shapeSum(object: THREE.Object3D): number {
    const m = object.matrixWorld.elements
    const [ra, rb] = this.roots
    let sum = m[0] + 3 * m[12] + 5 * m[13] + 7 * m[14]
    const step = Math.max(1, Math.floor(this.shown / 64))
    for (let i = 0; i < this.shown; i += step) {
      const o = i * 4
      sum += ra[o] + 2 * ra[o + 1] + 3 * ra[o + 2] + 5 * ra[o + 3] + 7 * rb[o] + 11 * rb[o + 1] + 13 * rb[o + 2] + 17 * rb[o + 3]
    }
    return sum
  }

  // A wearer names, once at load, a hair that stands on a face of its body and not on an edge.
  onFace(i: number): void {
    this.faces ??= new Uint8Array(this.count)
    this.faces[i] = 1
  }

  // Four numbers a hair: where it is rooted (x, y, z in the plant's own space, meters) and how long it is.
  root(slot: 0 | 1): Float32Array {
    return this.roots[slot]
  }

  // Four numbers a hair: the direction it grows in, and a number from 0 to 1 that is its own.
  lean(slot: 0 | 1): Float32Array {
    return this.leans[slot]
  }

  // Seats the hairs of this set on the frames of its part, for good. What is given back takes 12 numbers a hair, written once: the two frames it sits between, how far from the first to the second, and its full length in meters; c1, c2, a number that is 1 for a ring and 0 for a ribbon with 2 more for a hair on a face, and its own number from 0 to 1; how far it leans across, along and out; and, on a wide frame, how far the skin must have grown for it to be out, or 0. `typicalLengthM` is how long its usual hair is.
  bindFrames(frames: HairFrames, typicalLengthM: number): Float32Array {
    this.frames = frames as Frames
    this.typical = typicalLengthM
    this.seats = new Float32Array(this.count * 12)
    return this.seats
  }

  // Takes the seats as written. From here on the script touches no hair of this set.
  sealSeats(): void {
    const frames = this.frames
    const seats = this.seats
    if (!frames || !seats) throw new Error('hairs are sealed after they are bound to frames')
    const rows = Math.max(1, Math.ceil(this.count / ROW))
    const data = new Float32Array(rows * ROW * 12)
    data.set(seats)
    // How many hairs sit on each frame goes with a hair, above its two flags: the shader works out from it how the coat crowds.
    const sitting = new Uint32Array(frames.count)
    for (let i = 0; i < this.count; i++) sitting[Math.min(frames.count - 1, Math.max(0, Math.round(seats[i * 12])))]++
    let fullest = 0
    for (let i = 0; i < this.count; i++) {
      const o = i * 12
      data[o + 6] = (Math.round(seats[o + 6]) & 3) + 4 * Math.min(sitting[Math.min(frames.count - 1, Math.max(0, Math.round(seats[o])))], 1 << 20)
      if (seats[o + 3] > fullest) fullest = seats[o + 3]
      if (Math.round(seats[o + 6]) & 2) this.faced = true
    }
    this.fullest = fullest
    const texture = hairTexture(data, ROW * 3, THREE.RGBAFormat)
    this.fixed = { texture, pickTexture: this.picksAt.value, picked: new Int32Array(4), kept: 0, nearest: Infinity, longest: 0, sign: new Float64Array(SIGNS).fill(NaN) }
    this.hairsAt.value = texture
    this.framesA.value = frames.textures[0]
    this.framesB.value = frames.textures[1]
    this.poseA.value = frames.poses[0]
    this.poseB.value = frames.poses[1]
    this.seatsAt.value.set(1, frames.texels, this.count, 0)
    this.now = this.fixed
    // What a gathering works on is let go.
    const none = new Float32Array(0)
    this.roots = [none, none]
    this.leans = [none, none]
    this.at = none
    this.data = none
    this.main = this.fixed
  }

  // How many of the hairs are drawn. They are packed for the shader when the first sample of the frame is drawn, once the camera is known.
  finish(shown = this.count): void {
    this.shown = Math.max(0, Math.min(shown, this.count))
    this.stale = true
    this.laid++
  }
}

export function createHairs(options: PartOptions, count: number, name: string, color?: [number, number, number], widthM?: number): HairSet | null {
  return options.places ? null : new HairSet(options, count, name, color, widthM)
}
