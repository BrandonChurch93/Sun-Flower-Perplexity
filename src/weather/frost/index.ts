import * as THREE from 'three'
import { fieldUniforms, makePartSurface, partMesh, stateUniforms, type PartOptions } from '../../plant/part.ts'
import { shared, type Surface } from '../../core/shading.ts'
import { windToward } from '../../plant/wind.ts'
import { ball } from '../../plant/hairs/index.ts'

// Crystals are see-through at their edges and are drawn after the bodies they grow on and before the hairs (20).
export const CRYSTAL_ORDER = 18

const ROW = 512
// A crystal is drawn as this many strips: five needles, eight side blades that only a close lens sees, and three points of light.
const STRIPS = 16
const FAR_STRIPS = 5
// The size of a millimeter on a film frame of 1080 lines from which the close form is drawn.
const CLOSE_FROM_PX = 6
const TEXELS = 6
const scratch = new Float32Array(TEXELS * 4)
// In the thaw the last of a set that melts is gone at this much frost: from there it is neither drawn nor sent, though its wearer moves again.
const GONE_AT = 0.15
// In the freeze no crystal has started under this much frost: until then a set is neither drawn nor sent, so a wearer that still moves sends nothing.
const FIRST_AT = 0.008
// Under this much frost in the freeze the largest crystal of a set that melts is a thousandth of its length and changes no pixel. Until then the set is not drawn, and it is sent a share a frame: the frame a wearer lays a new shape on does not carry the whole of it.
const SHOWN_AT = 0.015
const SHARES = 2
// In the thaw a set that melts is put away once what is left of its beads is under a hundredth of their size.
const GONE_UNDER = 0.009

// A crystal of hoarfrost is a few flat needles of ice. Each needle is one facet: matt white from most sides, a hard flash from the one side where it mirrors the sun.
const crystal = /* glsl */ `
uniform sampler2D uCrystals;
uniform float uPlantFrost;
uniform float uPlantDew;
uniform float uPlantHeight;
uniform float uMelts;
uniform float uDewToo;
out vec3 vWorld;
out vec3 vLitAt;
out float vDepth;
out vec4 vLight;
out vec4 vMore;
out vec2 vAt;
out vec3 vSky;
out float vAcross;
out float vHalf;
out float vFade;
out vec3 vBall;
out vec3 vRight;
out vec3 vUp;

const vec3 ICE = vec3(0.93, 0.96, 1.0);
const vec3 ICE_SHADE = vec3(0.86, 0.93, 1.06);
const float MATT = 0.15;
const float THROUGH = 1.8;
// The light through the needles is the low sun's in the mist: it does not grow as the sun comes through.
const float THROUGH_HELD = 1.2;
// The thaw takes the needles a stretch of an edge at a time.
const float THAW_PATCH_M = 0.022;
const float GLINT = 22.0;
const float GLINT_SHARP = 700.0;
// Seen close, a crystal carries points that throw the sun at the lens. Each answers the angle between the lens, its own face and the sun, and nothing else: a turn of the lens by a degree lights some and puts others out.
const float POINT = 18.0;
const float POINT_TURNS = 45.0;
const float POINT_SHARP = 16.0;
const float POINT_PX = 7.0;
// Of the points a crystal could carry, the share it does.
const float POINT_SHARE = 0.1;
const float POINT_OPEN = 0.002;
// Out of focus the discs of neighbors lie over one another and close into a band, so fewer of the points are kept the wider the circle.
const float POINT_FEWER = 0.15;
const float POINT_CIRCLE_MOST = 80.0;
// What stands where the wearer left a slot of its edge bare: a small crystal that only a close lens sees.
const float FILL_M = 0.0011;
// The frost at which the growth that only a close lens sees begins.
const float LATE_FROM = 0.7;
// A bristle's sleeve of rime, in meters across on a bristle a millimeter and a half long: no more than twice the bristle, so it stays a needle. The spurs that stand out of it, in meters long.
const float SLEEVE_M = 0.00012;
const float SPUR_M = 0.00028;
const float SKY = 1.6;
// How far outside the picture a root may stand and its crystal still reach into it, with the blur of the lens.
const float OUTSIDE_M = 0.012;
// Seen close most of the fringe is grey ice against the bright air: the share of the sky's light a blade gives back there, and the few crystals in which the low sun stands.
const float SKY_CLOSE = 1.1;
// A rimed bristle in shade is a mid grey blue: it is thin, and the stalk behind it shows through.
const float SLEEVE_SKY = 0.65;
const float LIT_SHARE = 0.28;
const float LIT_LEAST = 0.12;
// Along an edge the ice stands in tufts with gaps between them: this many radians of them from the stalk to the tip.
const float TUFTS = 56.0;
// No crystal is longer than this, seen close.
const float CLOSE_MOST_M = 0.0026;
// The blades of a cluster on a margin, seen close: the shortest and the longest in meters, and the sun through those on the sun's side of the blade against the sky's light on the rest.
const float FAN_LEAST_M = 0.001;
const float FAN_MOST_M = 0.0025;
const float FAN_THROUGH = 0.5;
// On a face and on the ridge of a vein the crystals are short: no longer than this, seen close.
const float FACE_MOST_M = 0.0009;
// Of the crystals, the share that carry side blades.
const float FEATHER_SHARE = 0.22;
const vec3 AIR_FROM = vec3(${(-windToward.x).toFixed(4)}, 0.0, ${(-windToward.z).toFixed(4)});
// Of the crystals that melt, the share whose water is seen as a small bead, and of those the share that stay where they formed, as the fine dew of the morning.
const float BEAD_SHARE = 0.34;
const float STAY_SHARE = 0.45;
const float GONE_AT = ${GONE_AT.toFixed(2)};
const float FIRST_AT = ${FIRST_AT.toFixed(3)};
const float NEEDLE_PX = 0.7;
const float NEEDLE_LEAST = 0.2;
const float TUFT_MOST_M = 0.0034;
const float SPIKE_MOST_M = 0.0022;
const float SPIKE_LEAST = 0.3;
const float SPIKE_MOST = 0.8;
const float PATCH_M = 0.035;
const float PATCH_LEAST = 0.4;
const float PATCH_MOST = 1.0;

float hash(float own, float n) {
  return fract(sin(own * 917.13 + n * 37.71 + 0.31) * 4375.85);
}

void main() {
  int k = gl_InstanceID;
  int j = gl_VertexID;
  int strip = j >> 2;
  int needle = min(strip, 4);
  float side = float(j & 1) * 2.0 - 1.0;
  float end = float((j >> 1) & 1);
  ivec2 at = ivec2((k & 511) * 6, k >> 9);
  vec4 a = texelFetch(uCrystals, at, 0);
  vec4 b = texelFetch(uCrystals, at + ivec2(1, 0), 0);
  vec4 c = texelFetch(uCrystals, at + ivec2(2, 0), 0);
  vec4 d = texelFetch(uCrystals, at + ivec2(3, 0), 0);
  vec3 edge = mix(texelFetch(uCrystals, at + ivec2(4, 0), 0).xyz, texelFetch(uCrystals, at + ivec2(5, 0), 0).xyz, plantBlend());
  vec3 root = plantWorld(mix(a.xyz, b.xyz, plantBlend()));
  // A crystal that stands well outside the picture is not worked out.
  vec4 rootAt = projectionMatrix * viewMatrix * vec4(root, 1.0);
  if (any(greaterThan(abs(rootAt.xy), vec2(rootAt.w) + OUTSIDE_M * vec2(projectionMatrix[0][0], projectionMatrix[1][1])))) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    return;
  }
  // The wearer's number says what the crystal is: 0 to 1 the set chooses, 1 to 2 a low tuft, 2 to 3 a spike.
  float chosen = floor(b.w);
  float own = b.w - chosen;
  float n = float(needle);
  vec3 grow = plantDirection(normalize(mix(c.xyz, d.xyz, plantBlend())));
  // Where the wearer says it stands: over 0 on an edge, that far along it; -1 to -2 on a face, that far along the blade; -3 on a bristle of a stalk or the stem; -4 to -5 on the ridge of a vein, that far along the blade.
  bool bristle = c.w < -2.5 && c.w > -3.5;
  bool ridge = c.w < -3.5;
  float along = c.w > 0.0 ? c.w : ridge ? saturate(-4.0 - c.w) : c.w < -0.5 && !bristle ? saturate(-1.0 - c.w) : 0.5;
  bool fill = a.w < 0.0;
  bool spike = !fill && !bristle && (chosen > 1.5 || (chosen < 0.5 && hash(own, 4.0) > 0.74));
  float rootPx = -(viewMatrix * vec4(root, 1.0)).z * 2.0 / (projectionMatrix[1][1] * uSize.y);
  float close = smoothstep(8.0, 16.0, 0.001 / rootPx * (1080.0 / uSize.y));
  float h5 = hash(own, 5.0);
  float sunward = 0.5 + 0.5 * dot(grow, uSunDir);
  grow = normalize(grow + (AIR_FROM * 0.3 + (vec3(hash(own, 1.0), hash(own, 2.0), hash(own, 3.0)) - 0.5) * (spike ? 1.8 : 2.2)) * (bristle ? 0.15 : 1.0 - 0.55 * close));
  // Frost does not lie evenly: it stands thick on one stretch of an edge and thin on the next, most of it short and a little of it long.
  vec3 where = a.xyz * (6.2832 / PATCH_M);
  float lush = saturate(0.5 + 0.9 * sin(where.x + 1.7 * sin(where.z * 0.61 + 0.4)) * sin(where.y * 0.83 + 1.3 * sin(where.x * 0.47 + 2.1)));
  float size = bristle ? a.w * plantSize() : fill ? FILL_M * (0.5 + hash(own, 23.0)) * plantSize() : min(a.w * (spike ? 0.7 + 1.4 * h5 * h5 : 0.3 + 0.8 * h5 * h5 * (0.5 + lush)), (spike ? SPIKE_MOST_M * (0.3 + hash(own, 23.0) * hash(own, 23.0)) : TUFT_MOST_M * (0.4 + 1.2 * hash(own, 23.0) * hash(own, 23.0)))) * plantSize();
  // The dew comes up with the thaw and never with the freeze, so it tells the two apart. Freezing, each crystal starts at its own moment and grows. Thawing, each gives way at its own moment.
  float thawing = uMelts * smoothstep(0.0, 0.15, uPlantDew);
  float thaw = thawing * (1.0 - uPlantFrost);
  float born = FIRST_AT + 0.44 * hash(own, 24.0);
  float timed = mix(uMelts > 0.5 ? smoothstep(born, born + 0.55, uPlantFrost) : saturate((uPlantFrost - FIRST_AT) / (1.0 - FIRST_AT)), 1.0, thawing);
  // What only a close lens sees comes last: over the last third of the freeze a crystal lengthens by half, its side blades come out and small crystals rise between the large.
  float late = mix(saturate((uPlantFrost - LATE_FROM) / (1.0 - LATE_FROM)), 1.0, max(thawing, 1.0 - uMelts));
  timed *= mix(1.0, 0.667 + 0.333 * late, close);
  if (fill) timed *= smoothstep(0.0, 0.3, 1.4 * late - hash(own, 26.0));
  size *= timed;
  // The wearer's roots move with the air, so the tufts are told by how far along the edge a crystal stands, which does not.
  float tuft = c.w == 0.0 || bristle ? hash(own, 33.0) : 0.5 + 0.5 * sin(along * TUFTS + 1.7 * sin(along * 0.3 * TUFTS + 0.9)) * sin(along * 0.55 * TUFTS + 1.1 * sin(along * 0.2 * TUFTS + 2.3));
  if (!bristle) {
    size *= mix(1.0, (0.6 + 1.0 * tuft * tuft) * (0.55 + 0.9 * hash(own, 28.0)), close);
    float most = CLOSE_MOST_M * plantSize();
    size = mix(size, most * (1.0 - exp(-size / most)), close);
    if (c.w < -0.5) size = mix(size, min(size, FACE_MOST_M * plantSize() * (0.3 + 0.7 * hash(own, 34.0))), close);
  }
  bool lies = c.w < -0.5 && !bristle;
  // Seen close the fringe of a margin is closed and crunchy: at every root a cluster of short thick blades, fanned from one foot. The long spikes stay as they are.
  float cluster = c.w > 0.0 && !spike ? close : 0.0;
  float h28 = hash(own, 28.0);
  // Where the close lens first sees them they stand at half their length already, every one of them, and lengthen from there.
  float risen = mix(uMelts > 0.5 ? smoothstep(FIRST_AT, 0.6, uPlantFrost) : saturate((uPlantFrost - FIRST_AT) / (1.0 - FIRST_AT)), 1.0, thawing) * (0.7 + 0.3 * late) * (fill ? 0.6 + 0.4 * smoothstep(0.0, 0.3, 1.4 * late - hash(own, 26.0)) : 1.0);
  size = mix(size, (FAN_LEAST_M + (FAN_MOST_M - FAN_LEAST_M) * h28 * h28) * (0.65 + 0.5 * tuft) * plantSize() * risen, cluster);
  vec3 stretch6 = a.xyz * (6.2832 / THAW_PATCH_M);
  float patch6 = smoothstep(0.2, 0.8, 0.5 + 0.25 * (sin(stretch6.x + 1.9 * sin(stretch6.z * 0.57 + 1.1)) + sin(stretch6.y * 0.79 + 1.4 * sin(stretch6.x * 0.43 + 0.7))));
  // The water's owner and the ice agree on one front that runs down a blade from its tip: ahead of it ice only, behind it the ice is a bead that gives way to the water. Each crystal is that bead by the time the front reaches it, the sun's side and the thin patches soonest.
  float front = 0.05 + 0.75 * (1.0 - along);
  float turn6 = front - 0.02 - 0.06 * saturate(0.5 * (1.0 - patch6) + 0.3 * sunward + 0.2 * hash(own, 6.0));
  float melt = smoothstep(max(turn6 - 0.07, 0.0), max(turn6, 0.04), thaw);
  // It does not fade: it slumps and draws down into its bead.
  grow = normalize(grow - vec3(0.0, 0.4 * melt * melt, 0.0));
  size *= 1.0 - 0.87 * melt;

  vec3 ref = abs(grow.y) < 0.9 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);
  vec3 e1 = normalize(cross(grow, ref));
  vec3 e2 = cross(grow, e1);
  float turn = 6.2832 * hash(own, 7.0 + n);
  vec3 aside = e1 * cos(turn) + e2 * sin(turn);
  bool feather = spike && hash(own, 8.0) < 0.5;
  float sided = step(hash(own, 29.0), FEATHER_SHARE);
  // The blades of a feather lie in one plane, and on an edge that plane holds the way the edge runs.
  vec3 plane = dot(edge, edge) > 0.0 ? plantDirection(normalize(edge)) : e1 * cos(6.2832 * hash(own, 10.0)) + e2 * sin(6.2832 * hash(own, 10.0));
  plane = normalize(plane - grow * dot(plane, grow));
  float kind = 0.0;
  float many = 2.0 + floor(3.99 * hash(own, 9.0));
  vec3 foot = root;
  vec3 axis = grow;
  float reach = size;
  float wide = 0.09 * size;
  if (feather) {
    if (needle > 0) {
      float along = 0.18 + 0.17 * n + 0.08 * hash(own, 11.0 + n);
      foot = root + grow * (size * along);
      axis = normalize(grow * (0.5 + 0.5 * hash(own, 12.0 + n)) + plane * (mod(n, 2.0) * 2.0 - 1.0));
      reach = size * (0.5 - 0.4 * along) * (0.7 + 0.6 * hash(own, 13.0 + n));
      wide = 0.06 * size;
    }
  } else {
    axis = normalize(grow + aside * (needle == 0 ? 0.0 : spike ? 0.35 + 0.5 * hash(own, 14.0 + n) : 0.3 + 0.6 * hash(own, 14.0 + n)));
    reach = n < many ? size * (needle == 0 ? 1.0 : spike ? 0.25 + 0.35 * hash(own, 15.0 + n) : 0.6 + 0.4 * hash(own, 15.0 + n)) : 0.0;
    wide = (spike ? 0.075 : 0.09) * size;
  }
  // The blades of a cluster lie in one plane, each cluster's turned its own way about the way it grows.
  float blades = 3.0 + floor(3.99 * hash(own, 36.0));
  float tilt = 1.8 * (hash(own, 37.0) - 0.5);
  vec3 fanned = plane * cos(tilt) + cross(grow, plane) * sin(tilt);
  float spread = 0.9 + 0.9 * hash(own, 38.0);
  if (cluster > 0.0 && !feather) {
    float open = (n / (blades - 1.0) - 0.5) * spread + 0.3 * (hash(own, 14.0 + n) - 0.5);
    axis = normalize(mix(axis, grow * cos(open) + fanned * sin(open) + cross(grow, fanned) * (0.3 * (hash(own, 12.0 + n) - 0.5)), cluster));
    reach = mix(reach, n < blades ? size * (0.5 + 0.5 * hash(own, 15.0 + n)) * (1.0 - 0.3 * abs(open)) : 0.0, cluster);
  }
  // A melting blade keeps its water: as it shortens it thickens into a stub.
  wide = max(wide, (needle == 0 ? 0.0002 : 0.00015) * plantSize()) * (1.0 - 0.35 * close) * (1.0 + 2.5 * melt * close) * (lies ? 1.0 - 0.55 * close : 1.0);
  if (cluster > 0.0) wide = mix(wide, clamp(0.17 * reach, 0.00015 * plantSize(), 0.0004 * plantSize()) * (1.0 + 1.5 * melt), cluster);
  if (cluster > 0.0 && !feather) kind = 4.0 * step(0.5, cluster);
  if (strip > 4 && strip < 13) {
    // Side blades leave the spine at 60 degrees, a pair at a time from the root to the tip, each pair shorter than the last.
    int blade = strip - 5;
    float pair = float(blade >> 1);
    float hb = hash(own, 40.0 + float(blade));
    foot = root + grow * (size * (0.2 + 0.19 * pair + 0.07 * hb));
    axis = normalize(grow * 0.5 + plane * (0.866 * (float(blade & 1) * 2.0 - 1.0)) + aside * 0.2);
    reach = size * sided * (0.34 - 0.06 * pair) * (0.55 + 0.6 * hash(own, 50.0 + float(blade))) * close * smoothstep(0.08 + 0.2 * pair, 0.33 + 0.2 * pair, late) * (1.0 - smoothstep(0.0, 0.5, melt));
    wide = 0.075 * size;
    kind = 1.0;
    if (cluster > 0.0 && !feather) {
      // The sixth blade of a cluster.
      float open = 0.5 * spread + 0.3 * (hb - 0.5);
      foot = root;
      axis = normalize(grow * cos(open) + fanned * sin(open) + cross(grow, fanned) * (0.3 * (hb - 0.5)));
      reach = blade == 0 && blades > 5.5 ? size * (0.5 + 0.5 * hb) * (1.0 - 0.3 * abs(open)) * cluster : 0.0;
      wide = clamp(0.17 * reach, 0.00015 * plantSize(), 0.0004 * plantSize()) * (1.0 + 1.5 * melt);
      kind = 4.0;
    }
    if (bristle) {
      // Rime on a bristle is rough: short spurs stand out of the sleeve all round it.
      float round = 6.2832 * hb;
      foot = root + grow * (size * fract(hb * 7.31 + 0.11 * float(blade)));
      axis = normalize(grow * (1.6 * hash(own, 52.0 + float(blade)) - 0.8) + e1 * cos(round) + e2 * sin(round));
      reach = hb < 0.5 ? 0.0 : SPUR_M * plantSize() * (0.3 + 0.8 * hash(own, 50.0 + float(blade)) * hash(own, 51.0 + float(blade))) * close * smoothstep(0.0, 0.6, late) * (1.0 - smoothstep(0.0, 0.5, melt));
      wide = 0.15 * SPUR_M * plantSize();
    }
  }
  if (bristle) {
    if (strip == 0) wide = SLEEVE_M * plantSize() * (0.7 + 0.6 * hash(own, 27.0)) * clamp(size / (0.0015 * plantSize()), 0.5, 1.3) * (0.6 + 0.4 * late);
    else if (strip < 5) reach = 0.0;
    if (strip == 0) kind = 3.0;
  }
  // A needle thinner than a pixel cannot be seen as a needle, and a row of them is a white band. There one crystal in a few is drawn, as wide as those it stands for together.
  float thin = clamp(max((spike && !feather ? 0.075 : 0.09) * size, 0.0002 * plantSize()) / (NEEDLE_PX * rootPx), NEEDLE_LEAST, 1.0);
  float kept = fill || bristle ? 1.0 : thin * mix(spike ? SPIKE_LEAST : PATCH_LEAST, spike ? SPIKE_MOST : PATCH_MOST, lush);
  float stays = saturate((kept - hash(own, 22.0)) / (0.2 * kept)) * (fill || bristle || ridge ? close : 1.0);
  // Between two tufts the edge is all but bare.
  if (!bristle) stays *= mix(1.0, smoothstep(-0.08, 0.1, tuft + 0.3 * (hash(own, 32.0) - 0.5)) * (lies ? 0.55 : 1.0), close);
  // No stretch of a margin is bare of clusters.
  stays = mix(stays, 1.0, cluster);
  wide /= thin;

  vec3 here = foot + axis * (reach * end);
  vec3 toEye = normalize(uCamPos - here);
  vec4 view = viewMatrix * vec4(here, 1.0);
  float depth = -view.z;
  float pixel = depth * 2.0 / (projectionMatrix[1][1] * uSize.y);
  vec3 across = normalize(cross(axis, toEye));
  // A needle shorter than a pixel and a half is drawn that long and that much fainter, so it does not blink.
  float longPx = reach * length(cross(axis, toEye)) / pixel;
  float stretch = max(1.0, 1.5 / max(longPx, 1e-3));
  here = foot + axis * (reach * (0.5 + (end - 0.5) * stretch));
  float halfPx = 0.5 * wide * (1.0 - 0.92 * end * (1.0 - close)) / pixel;
  vAcross = side * (halfPx + 0.75);
  vHalf = halfPx;
  vFade = (reach > 0.0 ? stays : 0.0) / stretch * (1.0 - smoothstep(0.7, 1.0, melt));
  vec3 world = here + across * (vAcross * pixel);

  float face = 6.2832 * hash(own, 16.0 + n);
  vec3 f1 = normalize(cross(axis, abs(axis.y) < 0.9 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0)));
  vec3 facet = f1 * cos(face) + cross(axis, f1) * sin(face);
  vec3 mirror = normalize(toEye + uSunDir);
  float glint = pow(abs(dot(facet, mirror)), GLINT_SHARP);
  float behind = pow(saturate(-dot(toEye, uSunDir)), 3.0);
  float clear = 1.0 - 0.7 * melt;
  float held = min(1.0, THROUGH_HELD / max(dot(uSunColor, vec3(0.2126, 0.7152, 0.0722)), 1e-4));
  // Seen close a blade has a ridge down its middle and a face to either side of it, and each face meets the sun at its own angle.
  vec3 turned = cross(axis, facet) * (0.7 * close);
  vLight = vec4(0.1 + 0.9 * abs(dot(normalize(facet + turned), uSunDir)), 0.1 + 0.9 * abs(dot(normalize(facet - turned), uSunDir)), max(THROUGH * behind * held * mix(1.0, bristle ? 1.0 : mix(LIT_LEAST, 1.0, smoothstep(1.0 - LIT_SHARE - 0.12, 1.0 - LIT_SHARE + 0.12, hash(own, 31.0))) * (0.35 + 0.65 * hash(own, 30.0 + float(strip))), close), FAN_THROUGH * held * cluster * smoothstep(0.35, 0.7, sunward) * (0.6 + 0.4 * hash(own, 30.0 + float(strip)))), GLINT * glint);
  vMore = vec4(kind, close, fract(own * 13.7 + 0.37 * float(strip)), clear);
  vAt = vec2(end, melt);
  vSky = ICE * ICE_SHADE * (mix(SKY, SKY_CLOSE * (bristle ? SLEEVE_SKY : 1.0), close) * clear * (0.75 + 0.5 * hash(own, 17.0 + n)));
  vWorld = world;
  vLitAt = root + grow * (0.004 * plantSize());
  vDepth = depth;
  if (strip > 12) {
    float g = float(strip - 13);
    vec3 center = root + grow * (size * (0.15 + 0.85 * hash(own, 60.0 + g)));
    toEye = normalize(uCamPos - center);
    depth = -(viewMatrix * vec4(center, 1.0)).z;
    pixel = depth * 2.0 / (projectionMatrix[1][1] * uSize.y);
    vec3 own3 = normalize(vec3(hash(own, 63.0 + g), hash(own, 66.0 + g), hash(own, 69.0 + g)) - 0.5);
    float lit = pow(0.5 + 0.5 * cos(POINT_TURNS * dot(own3, normalize(toEye + uSunDir)) + 6.2832 * hash(own, 72.0 + g)), POINT_SHARP);
    // Out of focus the lens spreads a point over its blur circle: the point is as much brighter as that circle is larger, so the disc it opens into can be seen.
    float circle = min(cocOf(depth), POINT_CIRCLE_MOST);
    float share = POINT_SHARE * (ridge ? 0.04 : c.w < -0.5 ? 0.15 : 1.0) / (1.0 + POINT_FEWER * circle);
    float mass = hash(own, 81.0 + g);
    float amount = POINT * (0.06 + 2.6 * mass * mass * mass) * (1.0 + POINT_OPEN * circle * circle) * lit * close * stays * (1.0 - melt) * (0.06 + 0.94 * behind) * saturate((share - hash(own, 78.0 + g)) / (0.3 * share));
    vec3 right = normalize(cross(vec3(0.0, 1.0, 0.0), toEye));
    vec3 up = cross(toEye, right);
    float spin = 1.5708 * hash(own, 75.0 + g);
    vec2 corner = vec2(side, end * 2.0 - 1.0) * POINT_PX;
    vAt = vec2(corner.x * cos(spin) - corner.y * sin(spin), corner.x * sin(spin) + corner.y * cos(spin));
    world = center + (right * corner.x + up * corner.y) * (amount > 0.02 ? pixel : 0.0);
    vLight = vec4(0.0, 0.0, 0.0, amount);
    vMore.x = 2.0;
    vMore.w = c.w < -0.5 ? 0.0 : 1.0;
    vAcross = 0.0;
    vHalf = 0.0;
    vFade = 1.0;
    vWorld = center;
    vLitAt = center;
    vDepth = depth;
  }
  vBall = vec3(0.0);
  vRight = vec3(0.0);
  vUp = vec3(0.0);
  // The water of a melted crystal draws back into a small bead where the crystal stood. Behind the front the water is its owner's: there this bead gives way, but for the few that stay as the fine dew of the morning.
  float pick = hash(own, 19.0) / BEAD_SHARE;
  if (strip == 4 && melt > 0.0 && pick < 1.0 && a.w > 0.0 && !bristle) {
    bool stays = pick > 1.0 - STAY_SHARE * smoothstep(0.25, 0.6, tuft);
    float h21 = hash(own, 21.0);
    float thawed = saturate((thaw - front) / 0.2);
    float radius = stays ? 0.00007 + 0.00022 * h21 * h21 : (0.00014 + 0.00011 * h21) * (1.0 - thawed);
    // A wearer that goes on wearing its set in the dew keeps the beads that stay. One that puts the set away with the frost loses them as the frost goes.
    radius *= plantSize() * melt * (uDewToo > 0.5 ? 1.0 : smoothstep(GONE_AT, GONE_AT + 0.15, uPlantFrost)) * (stays ? mix(smoothstep(0.0, 0.15, uPlantFrost), smoothstep(0.0, 0.5, uPlantDew), uDewToo) : smoothstep(0.0, 0.15, uPlantFrost));
    vec3 center = root - vec3(0.0, 0.7 * radius, 0.0);
    if (center.y < 0.0) radius = 0.0;
    toEye = normalize(uCamPos - center);
    depth = -(viewMatrix * vec4(center, 1.0)).z;
    pixel = depth * 2.0 / (projectionMatrix[1][1] * uSize.y);
    vRight = normalize(cross(vec3(0.0, 1.0, 0.0), toEye));
    vUp = cross(toEye, vRight);
    float rPx = radius / pixel;
    float reachPx = max(rPx, 0.5) + 0.75;
    vAcross = side * reachPx;
    vBall = vec3((end * 2.0 - 1.0) * reachPx, rPx, 1.0);
    vHalf = 0.0;
    vFade = 1.0;
    world = center + (vRight * vAcross + vUp * vBall.x) * (radius > 0.0 ? pixel : 0.0);
    vWorld = center;
    vLitAt = center;
    vDepth = depth;
    vMore.x = 0.0;
    vAt.y = 0.0;
  }
  gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
}
`

const fragment = /* glsl */ `
in vec3 vWorld;
in vec3 vLitAt;
in float vDepth;
in vec4 vLight;
in vec4 vMore;
in vec2 vAt;
in vec3 vSky;
in float vAcross;
in float vHalf;
in float vFade;
in vec3 vBall;
in vec3 vRight;
in vec3 vUp;
${ball}
const vec3 ICE = vec3(0.93, 0.96, 1.0);
const float MATT = 0.15;
// A point of light is added to what stands behind it: it is written this many times too bright at this share of cover.
const float POINT_COVER = 0.02;
const float POINT_PX = 7.0;
void main() {
  float close = vMore.y;
  float x = abs(vAcross);
  float u = vAt.x;
  // Seen close a needle is a blade: slim at the root, widest a quarter of the way up and drawn to a point.
  float form = (vMore.x > 0.5 ? smoothstep(0.0, 0.25, u) : 0.4 + 0.6 * smoothstep(0.0, 0.25, u)) * pow(max(1.0 - u, 0.0), 0.65) * 1.3;
  // Its edge is not straight: it grew in steps, and each step left a barb.
  float melt = vMore.x > 1.5 && vMore.x < 2.5 ? 0.0 : vAt.y;
  float barb = fract(u * (5.0 + 6.0 * vMore.z) + vMore.z);
  form *= mix(0.5 + 0.5 * (1.0 - barb) * (1.0 - barb) + 0.5 * step(0.8, u), 1.0, melt);
  // A bristle's sleeve is as thick at its tip as at its root, and knobbed all the way.
  if (vMore.x > 2.5 && vMore.x < 3.5) form = (0.55 + 0.45 * (1.0 - barb)) * smoothstep(1.0, 0.93, u) * (0.75 + 0.5 * fract(sin(floor(u * 23.0) + vMore.z * 71.0) * 437.5));
  // A blade of a cluster is widest at its foot and drawn to a point.
  bool fan = vMore.x > 3.5;
  if (fan) form = (0.3 + 0.7 * pow(max(1.0 - u, 0.0), 0.8)) * smoothstep(1.0, 0.9, u) * (0.82 + 0.18 * (1.0 - barb));
  // Thawing it rounds off: the point goes first and the end is a drop.
  form = mix(form, 1.1 * sqrt(max(1.0 - u * u, 0.0)), smoothstep(0.0, 0.6, melt));
  float hw = vHalf * mix(1.0, min(form, 1.0), close);
  float cover = saturate(max(0.0, min(hw, x + 0.5) - max(-hw, x - 0.5)) * vFade);
  float r = max(vBall.y, 0.5);
  if (vBall.z > 0.5) cover = saturate(r - length(vec2(vAcross, vBall.x)) + 0.5) * (vBall.y * vBall.y / (r * r));
  float star = 0.0;
  if (vMore.x > 1.5 && vMore.x < 2.5) {
    star = exp(-dot(vAt, vAt) / 0.8) + 0.3 * (exp(-1.4 * abs(vAt.x) - vAt.y * vAt.y / 16.0) + exp(-1.4 * abs(vAt.y) - vAt.x * vAt.x / 16.0));
    // It fades to nothing inside its card, however bright it is.
    float inside = 1.0 - smoothstep(0.4, 1.0, length(vAt) / POINT_PX);
    star *= inside * inside;
    cover = saturate(star) * saturate(vLight.w / 8.0);
  }
#ifdef BLUR_CIRCLE
  if (cover < 0.004) discard;
  outColor = vec4(0.0, 0.0, 0.0, cover > 0.2 ? cocOf(vDepth) : 4096.0);
#else
  float sun = plantSun(vLitAt, uSunDir);
  if (vMore.x > 1.5 && vMore.x < 2.5) {
    if (star * vLight.w < 1e-4) discard;
    // The sun in a face of clear ice is white to pale gold.
    vec3 gold = mix(vec3(dot(uSunColor, vec3(0.2126, 0.7152, 0.0722))), uSunColor, mix(0.06, 0.25 + 0.5 * vMore.z, vMore.w));
    outColor = vec4(finish(gold * (sun * vLight.w * star / POINT_COVER), vWorld, vDepth, -1.0).rgb, POINT_COVER);
    return;
  }
  if (cover < 0.004) discard;
  // Ice is clear where it is thick and white where it is thin and broken: the root of a blade lets the leaf through, its edges take the light.
  float rim = smoothstep(0.4, 1.0, x / max(hw, 0.5));
  float face = saturate(vAcross + 0.5);
  float rib = fract(sin((floor(u * (3.0 + 5.0 * vMore.z)) + 1.0) * (vMore.z * 91.7 + 13.1)) * 4375.85);
  float gain = mix(1.0, 0.45 + 1.1 * rib, close);
  cover *= mix(1.0, fan ? 0.75 + 0.25 * rim : (0.3 + 0.7 * rim) * (0.3 + 0.7 * smoothstep(0.03, 0.3, u)), close * (1.0 - vBall.z));
  // And it goes glassy from the tip down: clear ice with a bright edge, no longer white.
  float glassy = (1.0 - vBall.z) * smoothstep(1.0 - 1.5 * melt, 1.3 - 1.5 * melt, u);
  cover *= 1.0 - 0.75 * glassy * (1.0 - rim);
  vec3 ice = uSunColor * (sun * (ICE * (MATT * mix(vLight.x, vLight.y, face) * gain + vLight.z * mix(1.0, 0.55 + 1.1 * rim, close)) * vMore.w + vLight.w)) + vSky * (mix(1.0, (mix(0.45, 1.15, face) + 0.5 * smoothstep(0.35, 0.0, x / max(vHalf, 0.5)) * rib) * (0.7 + 0.6 * rib), close) * skyAmbient(vec3(0.0, 0.6, 0.0)) * plantSky(vWorld));
  vec3 color = vBall.z > 0.5 ? ballLight(vec2(vAcross, vBall.x) / r, vRight, vUp, vWorld, sun, 0.0, r) : ice;
  outColor = vec4(finish(color, vWorld, vDepth, -1.0).rgb, cover);
#endif
}
`

// Hoarfrost crystals. The part that wears them gives each crystal its root, the direction it stands in and its size at both ends of the shutter, as it does for its hairs. They exist only in a frosted world.
export class CrystalSet {
  readonly surface: Surface
  // A part that wears crystals adds both to its own meshes: one draws them, the other keeps them as sharp as they are.
  readonly meshes: THREE.Mesh[]
  private readonly roots: [Float32Array, Float32Array]
  private readonly leans: [Float32Array, Float32Array]
  private readonly places: Float32Array
  private readonly edges: [Float32Array, Float32Array]
  private readonly geometry = new THREE.InstancedBufferGeometry()
  private readonly data: Float32Array
  private readonly texture: THREE.DataTexture
  // For each row of the texture, the first crystal that changed and one past the last.
  private readonly dirty: Uint16Array
  private sent = false
  private shown: number
  private stale = true
  private kept = 0
  // How many of the crystals shown the texture holds as their wearer last laid them.
  private sentTo = 0

  constructor(options: PartOptions, readonly count: number, name: string, private readonly melts = true, private readonly dewToo = false) {
    if (options.places) throw new Error('crystals are worn by the plant, the companion and the ground only')
    this.shown = count
    this.roots = [new Float32Array(count * 4), new Float32Array(count * 4)]
    this.leans = [new Float32Array(count * 4), new Float32Array(count * 4)]
    this.places = new Float32Array(count)
    this.edges = [new Float32Array(count * 3), new Float32Array(count * 3)]
    const rows = Math.max(1, Math.ceil(count / ROW))
    this.data = new Float32Array(ROW * TEXELS * rows * 4)
    this.dirty = new Uint16Array(rows * 2)
    this.texture = new THREE.DataTexture(this.data, ROW * TEXELS, rows, THREE.RGBAFormat, THREE.FloatType)
    this.texture.colorSpace = THREE.NoColorSpace
    this.texture.minFilter = THREE.NearestFilter
    this.texture.magFilter = THREE.NearestFilter
    this.texture.generateMipmaps = false
    this.texture.needsUpdate = true
    const index = new Uint16Array(STRIPS * 6)
    for (let k = 0; k < STRIPS; k++) {
      const v = k * 4
      index.set([v, v + 1, v + 2, v + 1, v + 3, v + 2], k * 6)
    }
    this.geometry.setIndex(new THREE.BufferAttribute(index, 1))
    this.geometry.instanceCount = 0
    const uniforms = { uCrystals: { value: this.texture }, uPlantHeight: fieldUniforms.uPlantHeight, uMelts: { value: melts ? 1 : 0 }, uDewToo: { value: dewToo ? 1 : 0 } }
    this.surface = makePartSurface(options, { name, vertex: crystal, fragment, side: THREE.DoubleSide, transparent: true, castShadow: false, uniforms })
    const sharp = makePartSurface(options, { name: `${name} blur circle`, vertex: crystal, fragment: `#define BLUR_CIRCLE 1\n${fragment}`, side: THREE.DoubleSide, transparent: true, cocOnly: true, castShadow: false, uniforms })
    const drawn = partMesh(this.geometry, this.surface)
    const kept = partMesh(this.geometry, sharp)
    drawn.renderOrder = CRYSTAL_ORDER
    kept.renderOrder = CRYSTAL_ORDER + 1
    drawn.onBeforeRender = (_renderer, _scene, camera) => this.choose(camera)
    this.meshes = [drawn, kept]
  }

  // Each crystal keeps its own place in the texture whatever the lens sees, so a plant that stands still sends nothing: what is already on the graphics card is not sent again.
  private gather(upTo: number): void {
    const [ra, rb] = this.roots
    const [la, lb] = this.leans
    const out = this.data
    const dirty = this.dirty
    const places = this.places
    const [ea, eb] = this.edges
    let rows = 0
    for (let i = this.sentTo; i < upTo; i++) {
      const o = i * 4
      const q = i * TEXELS * 4
      const e = i * 3
      const length = ra[o + 3]
      // A slot of an edge that its wearer left bare still has its place: a small crystal stands there, and its length says so by being less than nothing.
      if (length > 0 || places[i] > 0) {
        const la2 = Math.hypot(la[o], la[o + 1], la[o + 2]) || 1
        const lb2 = Math.hypot(lb[o], lb[o + 1], lb[o + 2]) || 1
        scratch[0] = ra[o]
        scratch[1] = ra[o + 1]
        scratch[2] = ra[o + 2]
        scratch[3] = length > 0 ? length : -1
        scratch[4] = rb[o]
        scratch[5] = rb[o + 1]
        scratch[6] = rb[o + 2]
        scratch[7] = la[o + 3]
        scratch[8] = la[o] / la2
        scratch[9] = la[o + 1] / la2
        scratch[10] = la[o + 2] / la2
        scratch[11] = places[i]
        scratch[12] = lb[o] / lb2
        scratch[13] = lb[o + 1] / lb2
        scratch[14] = lb[o + 2] / lb2
        scratch[16] = ea[e]
        scratch[17] = ea[e + 1]
        scratch[18] = ea[e + 2]
        scratch[20] = eb[e]
        scratch[21] = eb[e + 1]
        scratch[22] = eb[e + 2]
      } else scratch.fill(0)
      let changed = false
      for (let c = 0; c < TEXELS * 4; c++) {
        if (out[q + c] !== scratch[c]) {
          out[q + c] = scratch[c]
          changed = true
        }
      }
      if (changed) {
        const row = (i >> 9) * 2
        const col = i & 511
        if (dirty[row + 1] === 0) {
          dirty[row] = col
          rows++
        }
        dirty[row + 1] = col + 1
      }
    }
    if (rows > 0) {
      // Only the crystals that moved are sent, a stretch to a row: a leaf that turns in the hold costs its own crystals and no more.
      const all = dirty.length / 2
      if (this.sent && rows * 2 < all) {
        if (this.texture.updateRanges.length > all) this.texture.clearUpdateRanges()
        else for (let r = 0; r < all; r++) if (dirty[r * 2 + 1] > 0) this.texture.addUpdateRange((r * ROW + dirty[r * 2]) * TEXELS * 4, (dirty[r * 2 + 1] - dirty[r * 2]) * TEXELS * 4)
      } else this.texture.clearUpdateRanges()
      dirty.fill(0)
      this.sent = true
      this.texture.needsUpdate = true
    }
    this.sentTo = upTo
    if (upTo < this.shown) return
    this.kept = this.shown
    this.stale = false
  }

  private choose(camera: THREE.Camera): void {
    const worn = stateUniforms.uPlantFrost.value > 0 || (this.dewToo && stateUniforms.uPlantDew.value > 0)
    const gone = this.melts && !this.dewToo && stateUniforms.uPlantDew.value >= 0.15 && stateUniforms.uPlantFrost.value <= GONE_AT + GONE_UNDER
    const early = stateUniforms.uPlantDew.value <= 0 && stateUniforms.uPlantFrost.value < FIRST_AT
    if (!worn || gone || early || shared.uDiag.value >= 4) {
      this.geometry.instanceCount = 0
      return
    }
    if (this.melts && stateUniforms.uPlantDew.value <= 0 && stateUniforms.uPlantFrost.value < SHOWN_AT) {
      if (this.stale) this.gather(Math.min(this.shown, this.sentTo + Math.ceil(this.shown / SHARES)))
      this.geometry.instanceCount = 0
      return
    }
    if (this.stale) this.gather(this.shown)
    // The strips that only a close lens sees are not drawn for a far one. The nearest a crystal can be is the lens's distance to the wearer's foot less the wearer's height.
    const foot = this.meshes[0].matrixWorld.elements
    const e = camera.matrixWorld.elements
    const reach = Math.max(0.02, Math.hypot(e[12] - foot[12], e[13] - foot[13], e[14] - foot[14]) - fieldUniforms.uPlantHeight.value)
    const millimeterPx = (camera.projectionMatrix.elements[5] * 540) / (reach * 1000)
    this.geometry.setDrawRange(0, (millimeterPx > CLOSE_FROM_PX ? STRIPS : FAR_STRIPS) * 6)
    this.geometry.instanceCount = this.kept
  }

  // How many crystals are drawn, as last gathered.
  get inView(): number {
    return this.kept
  }

  // Four numbers a crystal: where it is rooted (x, y, z in the wearer's own space, meters) and how long it is (meters, 0 for none).
  root(slot: 0 | 1): Float32Array {
    return this.roots[slot]
  }

  // Four numbers a crystal: the direction it stands in, and a number from 0 to 1 that is its own.
  lean(slot: 0 | 1): Float32Array {
    return this.leans[slot]
  }

  // Three numbers a crystal: the way the edge it stands on runs, in the wearer's own space. All zero where it stands on no edge or the wearer does not say.
  along(slot: 0 | 1): Float32Array {
    return this.edges[slot]
  }

  // One number a crystal that never changes: where it stands. Over 0, on an edge, that far along it from the base to 1 at the tip. From -1 to -2, on a face, that far along the blade (-1 at the base, -2 at the tip). -3, on a bristle of a stalk or the stem, and from -4 to -5, on the ridge of a vein, that far along the blade: both are drawn for a close lens only. 0 says it is not known.
  place(): Float32Array {
    return this.places
  }

  // How many of the crystals are drawn. Call once a frame after both slots are filled.
  finish(shown = this.count): void {
    this.shown = Math.max(0, Math.min(shown, this.count))
    this.stale = true
    this.sentTo = 0
  }
}

// A wearer whose crystals outlast the frost (the bud, the ground) passes melts as false. One that fills its set whenever there is frost or dew, and not in frost alone, passes dewToo as true and keeps the beads of the thaw as its dew.
export function createCrystals(options: PartOptions, count: number, name: string, melts = true, dewToo = false): CrystalSet | null {
  return options.places || count <= 0 ? null : new CrystalSet(options, count, name, melts, dewToo)
}
