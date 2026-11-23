import * as THREE from 'three'
import { config } from '../../../config.ts'
import { barTime, hitTime, rainAtBar } from '../../../v2/clock.ts'
import { shared, type Surface } from '../../../core/shading.ts'
import { makePartSurface, partMesh, stateUniforms, type PartOptions } from '../../part.ts'
import { frostFrontGlsl } from '../frost/index.ts'
import { wetUniforms } from './film.ts'

// Beads of water on the skin: rain that sits, swells, runs to the tip and falls, and dew that stays where it formed.
export const real = true

export const BEAD_ORDER = 19

// How far the rain has thinned the beads on the side of a part turned from the light: 0 before it rains to 1 in the rain, and back after it.
const beadUniforms = { uBeadRain: { value: 0 }, uBeadDrop: { value: new THREE.Vector4(0, 0, 0, 0) }, ...wetUniforms }

const G = 9.81
const SIT = 0.4
const RUN = 0.78
const HANG = 0.93
// The share of the beads that stay where they formed in the rain: small ones, far more than those large enough to run.
const STAY = 0.72
// How far a bead slides in one go, as a share of the part's length.
const REACH = 0.4
// The share of a blade's dew that gathers at its margin through a dry night, and the share that hangs from its tip.
const DEW_MARGIN = 0.4
const DEW_TIP = 0.035

// The thaw: on the one blade the film looks at closely, beads stand where ice stood. This many of a set's last beads are theirs; the first two are the tip, which carries the one drop and the drop that fell from it.
export const THAW_BEADS = 180
const THAW_EDGE = 64
const THAW_RIB = 28
const THAW_VEIN = 48
const THAW_ALONE = 3
const THAW_RUNS = 4
const THAW_TAKES = 5
const THAW_DROP = 6
const THAW_FELL = 7
// No bead of the thaw stands before the frost has come.
const THAW_FROM_S = barTime(17)
const THAW_FROM_GLSL = THAW_FROM_S.toFixed(4)
// The film second the drop at the tip lets go.
const DROP_GOES_GLSL = (hitTime(24, 3) - 1e-4).toFixed(4)
// Half the width of the drop when it hangs full, in meters.
const DROP_R_GLSL = '0.002'

function own2(own: number, k: number): number {
  const x = Math.sin(own * k + k * 0.37) * 43758.5453
  return x - Math.floor(x)
}

function ease(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

// The film second the rain starts to fall: the beads of the shower count their lives from it.
const RAIN_FROM_S = ((): number => {
  for (let b = 30; b < 60; b += 1 / 64) if (rainAtBar(b) > 0) return barTime(b)
  return Infinity
})()

// The part of a frame the shutter stands open, in seconds: a bead that runs is drawn where it is at each end of it.
const SHUTTER_GLSL = (config.film.shutterDegrees / 360 / config.film.fps).toFixed(6)
const RAIN_FROM_GLSL = Number.isFinite(RAIN_FROM_S) ? RAIN_FROM_S.toFixed(4) : '1.0e9'

// Half the master frame's height in pixels, as shader text: a bead is judged by how wide it stands in the finished frame.
const MASTER_HALF_HEIGHT_PX = (config.formats.master.height / 2).toFixed(1)

// A set laid at two key frames of the plant stands between them as the plant's own skin does.
const KEYED = /* glsl */ `
vec4 keyed(vec4 a, vec4 b) {
  return mix(a, b, uBeadKeys * plantBlend());
}
`

// The thaw as the bead and the light it throws both need it.
const THAW = /* glsl */ `
uniform float uPlantFrost;
${frostFrontGlsl}
// How far the ice at a place has gone to water, by the frost's own front: it runs from the tip (along 1) back to the stalk (along 0) as the frost goes. The grain of the coat can hold the ice until 0.26, and by the stalk that much longer.
float thawFront(float along) {
  return frostPastAlong(along) - 0.05 - 0.05 * (1.0 - smoothstep(0.1, 0.45, along));
}
// A bead of the thaw is no wider than half a millimeter while ice can still stand at its place, then swells to its own size.
float thawRadius(float full, float front) {
  float small = min(full, 0.00025);
  float t = saturate((front - 0.26) / 0.25);
  return small * pow(saturate(front / 0.2), 0.7) + (full - small) * t * t * (3.0 - 2.0 * t);
}
// Where a bead of the thaw stands and how wide, in the plant's own space. Two neighbours that grow until they touch run together: one takes the other.
vec4 thawBead(vec4 form, vec4 gather, float across) {
  float kind = floor(gather.w + 1e-3);
  float edge = step(0.95, abs(across));
  // The bank of ice at a margin outlasts the front, and the bead under it waits as long.
  float front = thawFront((fract(gather.w + 1e-3) - 1e-3) / 0.4) - FROST_EDGE_LASTS * edge;
  float rib = 1.0 - step(0.05, abs(across));
  float full = mix(mix(mix(0.00022, 0.0007, form.w * form.w * form.w), mix(0.00022, 0.0008, form.w * form.w * form.w), rib), mix(0.00022, 0.001, form.w * form.w * form.w), edge);
  if (kind < ${THAW_RUNS}.0) return vec4(form.xyz, thawRadius(full, front));
  float taker = thawRadius(full, front);
  float runner = thawRadius(full * (0.55 + 0.35 * hash11(form.w * 61.7 + 5.0)), front);
  float met = smoothstep(0.9, 1.08, (taker + runner) / max(length(form.xyz - gather.xyz), 1e-6));
  if (kind > ${THAW_RUNS}.5) return vec4(form.xyz, pow(taker * taker * taker + met * runner * runner * runner, 1.0 / 3.0));
  return vec4(mix(form.xyz, gather.xyz, met), runner * sqrt(1.0 - met));
}
`

const vertex = /* glsl */ `
in vec2 aCorner;
in vec4 aSeatA;
in vec4 aSeatB;
in vec4 aRestA;
in vec4 aRestB;
in vec4 aForm;
in vec4 aFormUp;
in vec4 aMid;
in vec4 aEnd;
in vec4 aEndUp;
in vec4 aGather;
in vec4 aLimit;
in vec4 aEndUpB;
in vec4 aGatherB;
in vec3 aTint;
uniform vec4 uBeadWetTint;
uniform float uBeadPaths;
uniform float uBeadKeys;
uniform vec4 uBeadDrop;
uniform vec4 uBeadTip;
${KEYED}
float beadThaw;
vec4 kForm;
vec4 kFormUp;
vec4 kMid;
vec4 kEnd;
vec4 kEndUp;
vec4 kGather;
uniform float uPlantWet;
uniform float uPlantDew;
${THAW}
float own2(float own, float k) {
  return hash11(own * 61.7 + k);
}
// Where a bead is on the path its part laid for it, at a film second, in closed form: the place it touches the skin with its radius, and the skin's normal there with how it hangs.
void beadOnPath(float real, out vec4 seat, out vec4 rest) {
  float own = kForm.w;
  float across = kEnd.w;
  float since = real - ${RAIN_FROM_GLSL};
  float margin = 1.0 - 0.6 * across * across;
  float fine = own2(own, 127.1);
  vec3 at = kForm.xyz;
  vec3 up = kFormUp.xyz;
  float r = 0.0;
  float hang = 0.0;
  float scale = kFormUp.w;
  if (kGather.w > 2.5) {
    // A bead of the thaw stands in the thaw only, at its true size on any blade that is open.
    beadThaw = 1.0;
    scale = min(1.0, kFormUp.w / 0.195);
    if (real > ${THAW_FROM_GLSL} && since < 0.0 && kGather.w < ${THAW_DROP}.0) {
      vec4 bead = thawBead(kForm, kGather, across);
      at = bead.xyz;
      r = bead.w;
      hang = 0.7 * step(0.95, abs(across));
    }
  } else if (since >= 0.0 && uPlantWet > 0.0) {
    float wet = sqrt(uPlantWet);
    if (own2(own, 53.3) < ${STAY}) {
      // A small bead forms and stays: most are fine, few are not.
      r = (0.0006 + 0.0034 * fine * fine) * wet * smoothstep(0.0, 1.5, since - 3.0 * own2(own, 311.7)) * margin;
    } else {
      // A large one swells where it formed, slides to the end of its path in fits and starts, hangs there and falls: once or twice in a shower.
      float period = 7.0 + 6.0 * fine;
      float t = since - 5.0 * own2(own, 311.7) + 3.0;
      float turn = t / period;
      float p = fract(turn);
      float full = (0.0022 + 0.0018 * own2(own + floor(turn) * 0.618, 74.7)) * wet * smoothstep(0.0, 1.5, since) * step(0.0, t);
      if (p < ${SIT}) {
        r = full * pow(p / ${SIT}, 1.0 / 3.0) * smoothstep(0.0, 0.06, p);
      } else if (p < ${RUN}) {
        float q = (p - ${SIT}) / (${RUN} - ${SIT});
        float e = saturate(q * q * (1.5 - 0.5 * q) + 0.02 * sin(18.8496 * q));
        // The path bends through its middle point, so the bead stays on the blade.
        vec3 bend = 2.0 * kMid.xyz - 0.5 * (kForm.xyz + kEnd.xyz);
        at = (1.0 - e) * (1.0 - e) * kForm.xyz + 2.0 * e * (1.0 - e) * bend + e * e * kEnd.xyz;
        up = mix(kFormUp.xyz, kEndUp.xyz, e);
        r = full * (1.0 + 0.3 * e);
      } else {
        float q = min(1.0, (p - ${RUN}) / (${HANG} - ${RUN}));
        at = kEnd.xyz;
        up = kEndUp.xyz;
        if (kMid.w < 0.5 || aLimit.w > 0.5) {
          // One that does not reach the tip, or has none to hang from, spreads into the film where it stops.
          r = full * 1.3 * (1.0 - q) * (1.0 - q);
        } else {
          hang = q * q * (3.0 - 2.0 * q);
          r = full * (1.3 + 0.1 * q);
          if (p >= ${HANG}) {
            float fall = (p - ${HANG}) * period;
            at.y -= 4.905 * fall * fall;
            r = full * 1.25;
          }
        }
      }
    }
  } else if (uPlantDew > 0.0) {
    // Dew stays where it formed; through a still night some of a blade's runs together at its margin and one drop hangs from a tip.
    float dry = 1.0 - min(1.0, 4.0 * uPlantWet);
    float large = max(0.0, (own - 0.85) / 0.15);
    float deep = sqrt(uPlantDew);
    r = (own > 0.85 ? 0.0005 + 0.0009 * large * large : 0.00015 + 0.0011 * fine * fine) * deep * margin * (aLimit.z > 0.0 ? aLimit.z : 1.0);
    if (kGather.w > 0.5) {
      bool tip = kGather.w > 1.5;
      at = mix(kForm.xyz, kGather.xyz, dry);
      hang = (tip ? 1.0 : 0.75) * dry;
      r = mix(r, (tip ? 0.0028 + 0.001 * fine : 0.0016 + 0.0014 * fine) * deep, dry);
      // The tip that carries the one drop of the thaw carries no other.
      if (tip && real > ${THAW_FROM_GLSL} && uBeadTip.w > 0.0 && distance(kGather.xyz, uBeadTip.xyz) < uBeadTip.w) r = 0.0;
    }
    if (real > ${THAW_FROM_GLSL}) {
      // The dew of the thaw is the water of the ice: it stands where the ice has gone, and round on the hairs as the beads beside it.
      beadThaw = 1.0;
      r = thawRadius(r, thawFront(fract(kGather.w) / 0.4) - FROST_EDGE_LASTS * max(step(0.95, abs(across)), kGather.w > 0.5 ? dry : 0.0));
    }
  }
  r *= scale;
  // A part can say how large a bead may stand on it: on a stem, never wider than a share of the stem there.
  float most = mix(aLimit.y, aLimit.x, smoothstep(0.3, 0.9, uPlantWet));
  if (aLimit.x > 0.0 && aLimit.y > 0.0) r = min(r, most);
  seat = vec4(at, r);
  rest = vec4(up, hang);
}
out vec3 vWorld;
out vec3 vMiddle;
out vec3 vBase;
out vec3 vUp;
out vec3 vDown;
out vec3 vTint;
out vec3 vShape;
out float vHang;
out float vDepth;
out float vWide;
out float vKind;
out float vSpark;

// The one drop at the tip of the thawing blade, and the one that fell from it: a ball under the tip, a pear as it fills, a neck in its last tenth, round again as it falls.
void dropVertex() {
  // The drop that fell is drawn by the sheet that carries the bursts.
  if (kGather.w > ${THAW_FELL}.0) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    return;
  }
  // The shutter never stands open across the moment the drop lets go.
  vec4 dials = uBeadDrop.z < uBeadDrop.x - 0.3 ? uBeadDrop.xyxy : uBeadDrop;
  vec2 dial = mix(dials.xy, dials.zw, uShutter);
  float after = uReal + ${SHUTTER_GLSL} * uShutter - ${DROP_GOES_GLSL};
  float full = ${DROP_R_GLSL} * plantSize() * min(1.0, kFormUp.w / 0.195) * step(${THAW_FROM_GLSL}, uReal);
  vec3 tip = plantWorld(kForm.xyz);
  float front = thawFront(1.0);
  float r;
  float neck = 0.0;
  // What the full drop is as it lets go: its neck drawn out to this many of its radius.
  const float DRAWN = 2.0;
  float want = full * pow(dial.x, 1.0 / 3.0);
  float small = min(want, 0.00025);
  // The water gathers under the tip while the last ice there goes: the drop swells with the thaw and not all at once.
  float t = saturate((front - 0.12) / 0.3);
  r = small * pow(saturate(front / 0.2), 0.7) + (want - small) * t * t * (3.0 - 2.0 * t);
  neck = after < 0.0 ? smoothstep(0.9, 1.0, dial.x) : 0.0;
  // What is left at the tip springs back and comes to rest.
  float spring = after < 0.0 ? 0.0 : 0.6 * exp(-after / 0.07) * cos(55.0 * after);
  vec3 middle = tip - vec3(0.0, r * (mix(1.0, DRAWN, neck * neck) + spring), 0.0);
  float top = r * mix(0.55, 0.42, neck);
  float waist = r * mix(0.7, 0.05, neck);
  vec3 hold = tip;
  float high = hold.y + top;
  float low = middle.y - r;
  vec3 center = vec3(middle.x, 0.5 * (high + low), middle.z);
  vec3 toEye = normalize(uCamPos - center);
  vec3 side = normalize(cross(vec3(0.0, 1.0, 0.0), toEye) + vec3(1e-6, 0.0, 0.0));
  vec3 rise = cross(toEye, side);
  vec3 world = center + side * (aCorner.x * 1.15 * r) + rise * (aCorner.y * 0.6 * (high - low)) + toEye * r;
  vec4 view = viewMatrix * vec4(world, 1.0);
  vWorld = world;
  vMiddle = middle;
  vBase = hold;
  vUp = vec3(neck, 1.0, 0.0);
  vDown = vec3(r * mix(0.5, 0.3, neck), 0.0, 0.0);
  vTint = aTint;
  vShape = vec3(r, top, waist);
  vHang = 1.0;
  vDepth = -view.z;
  vWide = 2.0 * r * projectionMatrix[1][1] * ${MASTER_HALF_HEIGHT_PX} / max(-view.z, 1e-4);
  vKind = kGather.w;
  vSpark = 1.0;
  gl_Position = r > 0.0 && low > 0.0 ? projectionMatrix * view : vec4(2.0, 2.0, 2.0, 1.0);
}

void main() {
  beadThaw = 0.0;
  kGather = vec4(0.0);
  vec4 seatA = aSeatA;
  vec4 seatB = aSeatB;
  vec4 restA = aRestA;
  vec4 restB = aRestB;
  float lee = uReal >= ${RAIN_FROM_GLSL} ? smoothstep(0.0, 0.6, uPlantWet) : 0.0;
  float share = plantBlend();
  if (uBeadPaths > 0.5) {
    // A set on paths keeps its second key where a placed set keeps its seats.
    kForm = keyed(aForm, aSeatA);
    kFormUp = keyed(aFormUp, aSeatB);
    kMid = keyed(aMid, aRestA);
    kEnd = keyed(aEnd, aRestB);
    kEndUp = keyed(aEndUp, aEndUpB);
    kGather = keyed(aGather, aGatherB);
    share = uShutter;
    if (kGather.w >= ${THAW_DROP}.0) {
      dropVertex();
      return;
    }
    beadOnPath(uReal, seatA, restA);
    beadOnPath(uReal + ${SHUTTER_GLSL}, seatB, restB);
  }
  vec4 seat = mix(seatA, seatB, share);
  vec4 rest = mix(restA, restB, share);
  float own = hash11(float(gl_InstanceID) * 0.618 + 0.37);
  float r = seat.w * plantSize();
  // The dew of a set laid by places follows the thaw as a body with no tip does.
  if (uBeadPaths < 0.5 && uReal > ${THAW_FROM_GLSL} && uReal < ${RAIN_FROM_GLSL}) r = thawRadius(r, thawFront(0.5));
  vec3 base = plantWorld(seat.xyz);
  vec3 up = plantDirection(normalize(rest.xyz + vec3(0.0, 1e-6, 0.0)));
  float hang = saturate(rest.w);
  // Rain wets the side it comes from: on the side turned from the light the beads are few and fine.
  r *= mix(1.0, 0.55 + 0.45 * smoothstep(-0.5, 0.3, dot(up, uSunDir)), lee * (1.0 - hang));
  // Water sags down the slope it sits on, a large bead more than a small one, and one that runs draws out behind.
  vec3 fall = vec3(0.0, -1.0, 0.0) + up * up.y;
  float slope = length(fall);
  vec3 down = slope > 1e-3 ? fall / slope : normalize(cross(up, vec3(1.0, 0.0, 0.0)));
  float run = length(plantWorld(seatB.xyz) - plantWorld(seatA.xyz)) / max(r, 1e-6);
  float longM = 1.0 + (1.0 - hang) * ((0.1 + 0.5 * own) * (1.0 - 0.7 * beadThaw) * slope * smoothstep(0.0002, 0.0012, r) + min(0.5 * run, 1.2));
  // A bead that sits is a low cap, each to its own height; one that hangs is whole and under its hold. On the hairs of a thawing blade it stands nearly round.
  float high = mix(mix(mix(0.5, 0.85, hash11(own + 3.1)), mix(0.8, 0.95, hash11(own + 3.1)), beadThaw), 1.0, hang);
  vec3 middle = base + mix(up * (mix(-0.25, 0.3, beadThaw) * high * r) + down * (0.35 * (longM - 1.0) * r), vec3(0.0, -0.9 * r, 0.0), hang);
  vec3 toEye = normalize(uCamPos - middle);
  vec3 side = normalize(cross(vec3(0.0, 1.0, 0.0), toEye) + vec3(1e-6, 0.0, 0.0));
  vec3 rise = cross(toEye, side);
  vec3 world = middle + (side * aCorner.x + rise * aCorner.y) * (1.05 * r * longM) + toEye * r;
  vec4 view = viewMatrix * vec4(world, 1.0);
  vWorld = world;
  vMiddle = middle;
  vBase = base;
  vUp = up;
  vDown = down;
  vTint = mix(aTint, uBeadWetTint.rgb, uBeadWetTint.w * smoothstep(0.3, 0.9, uPlantWet));
  vShape = vec3(r, high * r, longM * r);
  vHang = hang;
  vDepth = -view.z;
  vKind = max(kGather.w, ${THAW_ALONE}.0 * beadThaw);
  vSpark = hash11(own * 37.7 + 1.9);
  // A bead narrower than three pixels of the finished frame is no bead to the eye: the damp sheen of the skin stands for it.
  vWide = 2.0 * r * projectionMatrix[1][1] * ${MASTER_HALF_HEIGHT_PX} / max(-view.z, 1e-4);
  gl_Position = vWide >= 3.0 ? projectionMatrix * view : vec4(2.0, 2.0, 2.0, 1.0);
}
`

const THAW_WORLD = /* glsl */ `
// The world a bead of the thaw stands in, as its lens turns it over: the frozen field under the horizon, dark with the frost on it lit in soft discs, the mist bright over it, the sky above.
vec3 thawWorld(vec3 d, float free) {
  vec2 cellAt = vec2(atan(d.z, d.x) * 2.6, d.y * 4.0);
  vec2 cell = floor(cellAt);
  float pick = hash11(cell.x * 12.9898 + cell.y * 78.233);
  float discs = step(pick, 0.7) * (1.0 - smoothstep(0.0, 0.5, length(fract(cellAt) - 0.5 - 0.2 * vec2(pick - 0.3, hash11(pick * 91.7) - 0.5))));
  vec3 field = uAirHorizon * (mix(0.04, 0.26, smoothstep(-0.7, 0.0, d.y)) + 0.14 * discs * smoothstep(-0.9, -0.15, d.y)) * mix(1.0, 0.55, free);
  vec3 sky = mix(0.8 * uAirHorizon, 0.5 * uAirZenith, smoothstep(0.0, 0.7, d.y)) * mix(1.0, 0.5, smoothstep(0.2, 0.95, d.y));
  // A drop that hangs free gathers the whole of the bright sky into its lower half.
  sky = mix(sky, uAirHorizon * mix(1.75, 0.8, smoothstep(0.0, 0.9, d.y)), free);
  // The mist round the low sun is the brightest of it.
  float toSun = saturate(dot(d, uSunDir));
  toSun *= toSun;
  toSun *= toSun;
  float edge = mix(0.11, 0.06, free);
  return mix(field, sky, smoothstep(-0.02 - edge, edge - 0.02, d.y)) + uSunColor * ((0.25 * toSun * toSun + 0.35 * free * toSun) * smoothstep(-0.2, 0.1, d.y));
}
`

const fragment = /* glsl */ `
uniform float uWetMoon;
in vec3 vWorld;
in vec3 vMiddle;
in vec3 vBase;
in vec3 vUp;
in vec3 vDown;
in vec3 vTint;
in vec3 vShape;
in float vHang;
in float vDepth;
in float vWide;
in float vKind;
in float vSpark;

const float BEAD_LENS = 1.5;

// The world as a bead shows it: the dome, and the bright band low over the horizon that gives a bead its window.
vec3 beadSky(vec3 d) {
  float band = exp(-(d.y - 0.12) * (d.y - 0.12) * 22.0);
  float t = d.y * 0.5 + 0.5;
  // A bead shows the sky as the sky draws itself, not the fill that lands on the leaf.
  vec3 dome = mix(uGroundBounce, mix(uAirHorizon, uAirZenith, smoothstep(0.55, 1.0, t)), smoothstep(0.15, 0.6, t));
  return dome + uAirHorizon * (1.2 * band);
}

${THAW_WORLD}

// A round cone from the origin, where its radius is r1, to b, where it is r2.
float roundCone(vec3 p, vec3 b, float r1, float r2) {
  float l2 = dot(b, b);
  float rr = r1 - r2;
  float a2 = l2 - rr * rr;
  float il2 = 1.0 / l2;
  float y = dot(p, b);
  float z = y - l2;
  vec3 xv = p * l2 - b * y;
  float x2 = dot(xv, xv);
  float y2 = y * y * l2;
  float z2 = z * z * l2;
  float k = sign(rr) * rr * rr * x2;
  if (sign(z) * a2 * z2 > k) return sqrt(x2 + z2) * il2 - r2;
  if (sign(y) * a2 * y2 < k) return sqrt(x2 + y2) * il2 - r1;
  return (sqrt(x2 * a2 * il2) + y * rr) * il2 - r1;
}

// How far a place is from the skin of the one drop, in its own radius, from its middle: the ball, and the water that holds it to the tip.
float dropField(vec3 q) {
  float ball = length(q) - 1.0;
  vec3 top = (vBase - vMiddle) / vShape.x;
  // As the neck draws out the water at the tip ends in a thread over the top of the ball.
  float neck = roundCone(q - top, vec3(0.0, 0.92 * vUp.x, 0.0) - top, vShape.y / vShape.x, vShape.z / vShape.x);
  float k = vDown.x / vShape.x;
  float m = saturate(0.5 + 0.5 * (neck - ball) / k);
  return mix(neck, ball, m) - k * m * (1.0 - m);
}

void main() {
  vec3 ray = normalize(vWorld - uCamPos);
  bool thaw = vKind > 2.5;
  bool drop = vKind > ${THAW_DROP}.0 - 0.01;
  vec3 up = vec3(0.0, 1.0, 0.0);
  vec3 down = vec3(0.0, 0.0, 1.0);
  vec3 side = vec3(1.0, 0.0, 0.0);
  vec3 p;
  vec3 n;
  vec3 q;
  vec3 d;
  if (drop) {
    // The drop is no ball: the ray is walked to its skin.
    vec3 o = (uCamPos - vMiddle) / vShape.x;
    float span = length(vBase - vMiddle) / vShape.x + 2.5;
    float t = max(0.0, -dot(o, ray) - span);
    float most = t + 2.0 * span;
    bool met = false;
    for (int i = 0; i < 56; i++) {
      float gap = dropField(o + ray * t);
      if (gap < 0.002) {
        met = true;
        break;
      }
      t += gap;
      if (t > most) break;
    }
    if (!met) discard;
    vec3 at = o + ray * t;
    vec2 e = vec2(0.01, -0.01);
    n = normalize(e.xyy * dropField(at + e.xyy) + e.yyx * dropField(at + e.yyx) + e.yxy * dropField(at + e.yxy) + e.xxx * dropField(at + e.xxx));
    p = vMiddle + at * vShape.x;
    q = n;
    d = ray;
  } else {
    up = normalize(vUp);
    down = normalize(vDown - up * dot(vDown, up));
    side = cross(up, down);
    // The bead is a ball pressed low and drawn out down the slope: the ray is met in the space where it is round.
    vec3 scale = 1.0 / vShape;
    vec3 from = uCamPos - vMiddle;
    vec3 o = vec3(dot(from, side), dot(from, up), dot(from, down)) * scale;
    d = vec3(dot(ray, side), dot(ray, up), dot(ray, down)) * scale;
    float a = dot(d, d);
    float b = dot(o, d);
    float under = b * b - a * (dot(o, o) - 1.0);
    if (under < 0.0) discard;
    float reach = (-b - sqrt(under)) / a;
    p = uCamPos + ray * reach;
    if (dot(p - vBase, up) < -2.0 * vShape.x * vHang) discard;
    q = o + d * reach;
    vec3 g = q * scale;
    n = normalize(side * g.x + up * g.y + down * g.z);
  }
  vec3 view = -ray;
  float ndv = saturate(dot(n, view));
  float f = 1.0 - ndv;
  float f2 = f * f;
  float fresnel = 0.04 + 0.6 * f2 * f2 * f;
  vec3 mirror = reflect(ray, n);
  float sun = sunShadow(vMiddle + up * vShape.x, up, uShadowTexelM * 2.5);
  // One highlight: the sun itself where it is clear, a soft window where it stands in cloud.
  float clear = smoothstep(1.5, 5.0, dot(uSunColor, vec3(0.3, 0.6, 0.1)) / max(dot(skyAmbient(vec3(0.0, 1.0, 0.0)), vec3(0.3, 0.6, 0.1)), 1e-4));
  float aim = saturate(dot(mirror, uSunDir));
  float a8 = aim * aim;
  a8 *= a8;
  a8 *= a8;
  float a32 = a8 * a8;
  a32 *= a32;
  // A highlight smaller than a pixel is spread over the pixel, not left to flash.
  float glint = mix(0.6 * a32 * a8 * a8, 40.0 * min(vWide * vWide / 256.0, 1.0) * a32 * a32 * a32, clear);
  // The blade is thin and the bead stands clear of it on its hairs: in the thaw the low sun reaches it through and over the blade.
  float key = thaw ? max(sun, 0.45) : sun;
  // Seen this near the sun in a bead is the sun, dim as the mist leaves it: one hard point, the harder the larger the bead stands in the frame.
  // Far from the lens a bead of the thaw is a soft pale point. Its glint has the bead's share of the frame, and one bead in five stands so that it sparks.
  float small = 1.0 - smoothstep(8.0, 20.0, vWide);
  float sparks = mix(1.0, step(0.8, vSpark) * vWide * vWide / 400.0, small);
  if (thaw) glint = 24.0 * sparks * pow(aim, clamp(0.015 * vWide * vWide, 24.0, 400.0));
  vec3 sunAside = uSunDir - ray * dot(uSunDir, ray);
  vec3 sunward = sunAside / max(length(sunAside), 1e-4);
  vec3 sky = beadSky(mirror);

  // The light that enters a bead is gathered on its far side: bright where the ball turns away from the light, dark where it faces it.
  vec3 lightAbove = vec3(0.0, 1.0, 0.0);
  float farSun = saturate(0.5 - 0.5 * dot(n, uSunDir) / max(ndv, 0.35));
  float farSky = saturate(0.5 - 0.5 * dot(n, lightAbove) / max(ndv, 0.35));
  farSun *= farSun;
  farSky *= farSky;
  // Under a bead on a face turned from the sun the skin is lit through the blade.
  vec3 lit = uSunColor * (sun * (saturate(dot(up, uSunDir)) * (0.3 + 2.6 * farSun * farSun) + 0.3 * saturate(-dot(up, uSunDir)))) + skyAmbient(up) * (0.5 + 5.0 * farSky * farSky);
  // Clear water shows the skin under it: darkest round the foot of the bead, where the light that enters is thrown to the far side.
  vec3 body = vTint * lit * mix(0.45, 1.0, smoothstep(0.0, 0.35, ndv));
  // Seen this near the water is clear: the blade under it stands as bright as the blade beside it, lit through, and darker round the foot.
  if (thaw) body = vTint * (uSunColor * (0.6 * key) + 1.3 * skyAmbient(up)) * (0.32 + 1.1 * smoothstep(0.3, 0.9, -dot(n, sunward))) * mix(0.25, 1.0, smoothstep(0.0, 0.5, ndv));
  // The ray is bent on its way in and again on its way out. Where it leaves the bead above the skin it shows the world behind, upside down; where it does not, the skin under the water. A drop that hangs free has no skin behind it.
  vec3 qn = normalize(q);
  vec3 dn = normalize(d);
  vec3 inside = refract(dn, qn, 0.75);
  vec3 leave = qn - 2.0 * dot(qn, inside) * inside;
  vec3 out3 = refract(inside, -leave, 1.33);
  if (dot(out3, out3) < 0.5) out3 = reflect(inside, -leave);
  vec3 beyond = normalize(side * out3.x + up * out3.y + down * out3.z);
  float clearOfSkin = smoothstep(0.0, 0.6, leave.y - mix(0.3, -2.0, vHang)) * smoothstep(-0.1, 0.25, dot(beyond, up) + vHang);
  // A bead that stands round on the hairs is clear of the skin down to its foot.
  if (thaw) clearOfSkin = smoothstep(0.0, 0.3, leave.y - mix(-0.3, -2.0, vHang)) * smoothstep(-0.05, 0.15, dot(beyond, up) + vHang);
  body = mix(body, (thaw ? thawWorld(beyond, drop ? 1.0 : 0.0) : beadSky(beyond)) * 0.9, mix(thaw ? 0.22 : 0.35, 0.92, vHang) * clearOfSkin);
  // Toward its edge a free drop shows the dark round it.
  if (thaw) body *= mix(1.0, mix(0.1, 1.0, smoothstep(0.0, drop ? 0.3 : 0.55, ndv)), vHang);
  // A clear sun behind a bead is seen through it, bent to one small bright place on the side away from the sun.
  float lens = saturate(dot(beyond, uSunDir));
  lens *= lens;
  lens *= lens;
  lens *= lens;
  lens *= lens;
  body += uSunColor * ((thaw ? 0.0 : BEAD_LENS) * clear * sun * clearOfSkin * lens * lens);
  if (thaw) {
    // At this distance the bead is a lens to the eye. The sun through it is one small star, at the place a ray must enter the ball to leave it toward the sun: near the edge turned from the sun.
    float turnTo = acos(clamp(dot(ray, uSunDir), -1.0, 1.0));
    float enter = 0.5 * turnTo + 0.4;
    for (int i = 0; i < 4; i++) enter = 0.5 * turnTo + asin(sin(enter) / 1.33);
    // The star of the one drop stands clear of its outline.
    if (drop) enter = min(enter, 0.93);
    vec3 off = n + ray * cos(enter) + sunward * sin(enter);
    vec2 px = vec2(dot(off, sunward), dot(off, cross(ray, sunward))) * (0.5 * vWide);
    float core = exp(-dot(px, px) / (drop ? 4.0 : 2.2)) * (drop ? 1.0 - smoothstep(1.02, 1.1, length(p - vMiddle) / vShape.x) : 1.0);
    float rays = 0.0;
    if (drop) {
      float reach = core > 0.0 || length(p - vMiddle) < 1.05 * vShape.x ? exp(-length(px) / (0.08 * vWide)) * (1.0 - smoothstep(0.15 * vWide, 0.4 * vWide, length(px))) : 0.0;
      for (int k = 0; k < 3; k++) {
        vec2 way = vec2(cos(0.3 + 1.0472 * float(k)), sin(0.3 + 1.0472 * float(k)));
        float aside = px.x * way.y - px.y * way.x;
        rays += exp(-aside * aside / 0.5) * reach;
      }
    }
    float aimed = saturate(dot(beyond, uSunDir));
    body += uSunColor * (key * max(clearOfSkin, 0.3) * (50.0 * mix(1.0, step(0.8, fract(vSpark * 7.31)) * vWide * vWide / 400.0, small) * core + 7.0 * rays + 0.5 * (1.0 - small) * clearOfSkin * pow(aimed, 96.0)));
    float away = saturate(-dot(n, sunward));
    float rim = smoothstep(0.45, 0.85, f) * (1.0 - smoothstep(0.93, 1.0, f));
    body += (0.9 * key * uSunColor + 0.4 * uAirHorizon) * (away * away * rim * (1.0 - 0.8 * small));
  }

  // Under a closed sky the bead's one highlight is the sky itself over the lens: a small soft window near its top.
  float window = saturate(dot(mirror, normalize(vec3(0.0, 0.8, 0.0) - 0.6 * normalize(vec3(ray.x, 0.0, ray.z + 1e-6)))));
  window *= window;
  window *= window;
  window *= window;
  // Water on a hairy skin rests on air held between the hairs, and that floor is a mirror from inside: the bead is silver on the side away from the light.
  vec3 closed = (uAirHorizon + uAirZenith) * smoothstep(0.0, 0.5, uPlantWet);
  if (thaw) closed = vec3(0.0);
  body += closed * (0.3 * farSky * (1.0 - vHang));
  vec3 color = body * (1.0 - fresnel) + sky * fresnel + uSunColor * (key * glint * (1.0 - 0.75 * uWetMoon)) + closed * (1.2 * window);
  outColor = finish(color, p, vDepth, -1.0);
}
`

const PATH_NAMES = ['aForm', 'aFormUp', 'aMid', 'aEnd', 'aEndUp', 'aGather', 'aLimit']
const SECOND_NAMES = ['aEndUpB', 'aGatherB']

// A drop that hits a blade bursts: a low crown of spray that opens and is gone in a few frames. Each bead's path is struck now and then, at a new place each time.
const BURST_LIFE_S = 0.17
const burstVertex = /* glsl */ `
in vec2 aCorner;
in vec4 aForm;
in vec4 aFormUp;
in vec4 aMid;
in vec4 aEnd;
in vec4 aSeatA;
in vec4 aSeatB;
in vec4 aRestA;
in vec4 aRestB;
in vec4 aGather;
in vec4 aGatherB;
uniform float uBeadRain;
uniform float uBeadKeys;
uniform float uPlantWet;
uniform float uPlantDew;
uniform vec4 uBeadDrop;
${KEYED}
${THAW}
out vec2 vAt;
out vec3 vWorld;
out float vAge;
out float vSeed;
out vec3 vStreak;
void main() {
  vec4 kForm = keyed(aForm, aSeatA);
  vec4 kFormUp = keyed(aFormUp, aSeatB);
  vec4 kMid = keyed(aMid, aRestA);
  vec4 kEnd = keyed(aEnd, aRestB);
  vec4 kGather = keyed(aGather, aGatherB);
  vStreak = vec3(0.0);
  if (kGather.w > ${THAW_FELL}.0) {
    // The drop that fell: its path over the time the shutter stands open, drawn as one streak whatever the number of samples, so that nothing of it strobes.
    vec4 dials = uBeadDrop.z < uBeadDrop.x - 0.3 ? uBeadDrop.xyxy : uBeadDrop;
    float full = ${DROP_R_GLSL} * plantSize() * min(1.0, kFormUp.w / 0.195);
    float r = 0.93 * full;
    float from = dials.y;
    float to = dials.w;
    vec3 tip = plantWorld(kForm.xyz);
    vec3 center = tip - vec3(0.0, 2.0 * full + 0.5 * (from + to), 0.0);
    vec3 toEye = normalize(uCamPos - center);
    vec3 side = normalize(cross(vec3(0.0, 1.0, 0.0), toEye) + vec3(1e-6, 0.0, 0.0));
    vec3 rise = cross(toEye, side);
    float reach = 0.5 * (to - from) + 1.1 * r;
    vec3 world = center + side * (aCorner.x * 1.1 * r) + rise * (aCorner.y * reach) + toEye * r;
    vec4 view = viewMatrix * vec4(world, 1.0);
    vAt = vec2(aCorner.x * 1.1, (0.5 * (to - from) - aCorner.y * reach) / max(r, 1e-6));
    vWorld = world;
    vAge = (to - from) / max(r, 1e-6);
    vSeed = -2.0;
    vStreak = vec3(from / max(r, 1e-6), 2.0 * r * projectionMatrix[1][1] * ${MASTER_HALF_HEIGHT_PX} / max(-view.z, 1e-4), -view.z);
    bool on = uReal >= ${DROP_GOES_GLSL} && uReal > ${THAW_FROM_GLSL} && to > from && r > 0.0 && center.y - reach > 0.0;
    gl_Position = on ? projectionMatrix * view : vec4(2.0, 2.0, 2.0, 1.0);
    return;
  }
  if (kGather.w > 2.5) {
    // A bead of the thaw on the face of a blade gathers the low sun to a small bright patch on the skin beside it, on the side away from the sun.
    vec4 bead = thawBead(kForm, kGather, kEnd.w);
    float r = bead.w * min(1.0, kFormUp.w / 0.195) * plantSize();
    vec3 base = plantWorld(bead.xyz);
    vec3 up = plantDirection(normalize(kFormUp.xyz + vec3(0.0, 1e-6, 0.0)));
    float facing = dot(up, uSunDir);
    vec3 lying = uSunDir - up * facing;
    float low = length(lying);
    vec3 away = -lying / max(low, 1e-4);
    vec3 across = cross(up, away);
    vec3 toEye = normalize(uCamPos - base);
    vec3 world = base + (away * (1.35 + 0.45 * aCorner.x) + across * (0.95 * aCorner.y)) * r + toEye * (0.25 * r);
    float widePx = 2.0 * r * projectionMatrix[1][1] * ${MASTER_HALF_HEIGHT_PX} / max(-(viewMatrix * vec4(world, 1.0)).z, 1e-4);
    bool lit = kGather.w < ${THAW_DROP}.0 && floor(kGather.w + 1e-3) != ${THAW_RUNS}.0 && uReal > ${THAW_FROM_GLSL} && uPlantDew > 0.0 && kFormUp.w > 0.0 && abs(kEnd.w) > 0.0 && abs(kEnd.w) < 0.72 && fract(kGather.w) < 0.36;
    vAt = aCorner;
    vWorld = world;
    // Where the sun stands under the face the light comes through the thin blade, weaker.
    vAge = mix(0.8, 1.0, smoothstep(-0.35, 0.05, facing)) * smoothstep(0.00012, 0.0002, r) * smoothstep(8.0, 16.0, widePx);
    vSeed = -1.0;
    gl_Position = lit && vAge > 0.0 ? projectionMatrix * viewMatrix * vec4(world, 1.0) : vec4(2.0, 2.0, 2.0, 1.0);
    return;
  }
  float own = aForm.w;
  float every = 1.3 + 2.6 * hash11(own * 61.7 + 201.3);
  float t = (uReal + ${SHUTTER_GLSL} * uShutter - ${RAIN_FROM_GLSL}) / every + hash11(own * 61.7 + 77.1);
  float turn = floor(t);
  float age = (t - turn) * every / ${BURST_LIFE_S.toFixed(3)};
  float pick = hash11(own * 17.3 + turn * 0.618);
  // In thin rain few of the turns bring a drop.
  bool struck = t > 0.0 && age < 1.0 && kFormUp.w > 0.0 && pick < uBeadRain * sqrt(uBeadRain) && uPlantWet > 0.0;
  float e = hash11(own * 29.1 + turn * 0.381);
  vec3 bend = 2.0 * kMid.xyz - 0.5 * (kForm.xyz + kEnd.xyz);
  vec3 at = (1.0 - e) * (1.0 - e) * kForm.xyz + 2.0 * e * (1.0 - e) * bend + e * e * kEnd.xyz;
  vec3 base = plantWorld(at);
  vec3 up = plantDirection(normalize(kFormUp.xyz + vec3(0.0, 1e-6, 0.0)));
  float wide = (0.004 + 0.016 * sqrt(age)) * (0.7 + 0.6 * pick) * plantSize();
  // The spray leaves the blade along its face and lifts off it a little: it is drawn as a low dish on the skin.
  vec3 toEye = normalize(uCamPos - base);
  vec3 side = normalize(cross(up, toEye) + vec3(1e-6, 0.0, 0.0));
  vec3 lie = cross(side, up);
  vec3 world = base + (side * aCorner.x + lie * aCorner.y) * wide + up * (0.35 * wide * (0.3 + length(aCorner))) + toEye * 0.002;
  vAt = aCorner;
  vWorld = world;
  vAge = age;
  vSeed = pick + turn * 0.137;
  gl_Position = struck ? projectionMatrix * viewMatrix * vec4(world, 1.0) : vec4(2.0, 2.0, 2.0, 1.0);
}
`

const burstFragment = /* glsl */ `
in vec2 vAt;
in vec3 vWorld;
in float vAge;
in float vSeed;
in vec3 vStreak;
${THAW_WORLD}
void main() {
  if (uDiag > 1) discard;
#ifdef BLUR_CIRCLE
  if (vSeed > -1.5) discard;
#endif
  float far = length(vAt);
  if (vSeed < -1.5) {
    float x = vAt.x;
    if (abs(x) >= 1.0) discard;
    float h = sqrt(1.0 - x * x);
    float from = vStreak.x;
    float to = from + vAge;
    float y = from + vAt.y;
    // The share of the open shutter for which the ball stands over this place.
    float first = clamp(y - h, from, to);
    float last = clamp(y + h, from, to);
    float share = (last - first) / max(vAge, 1e-5);
#ifdef BLUR_CIRCLE
    if (share < 0.003) discard;
    // What stands behind shows through the streak and keeps its own blur where the streak is thin. Where it is dense it is as sharp as the path of a thing in motion is.
    float dense = cocOf(vStreak.z) + 0.2 * saturate(0.5 * vAge) * vStreak.y * uSize.y / ${(2 * Number(MASTER_HALF_HEIGHT_PX)).toFixed(1)};
    outColor = vec4(0.0, 0.0, 0.0, mix(cocOf(1e4), dense, smoothstep(0.05, 0.4, share)));
    return;
#endif
    if (share < 0.003) discard;
    // What the ball shows of the world, turned over by its lens, at each place it stands while it is over this one.
    vec3 ray = normalize(vWorld - uCamPos);
    vec3 side = normalize(cross(vec3(0.0, 1.0, 0.0), -ray) + vec3(1e-6, 0.0, 0.0));
    vec3 rise = cross(-ray, side);
    vec3 seen = vec3(0.0);
    for (int i = 0; i < 6; i++) {
      float v = mix(first, last, (float(i) + 0.5) / 6.0) - y;
      vec3 n = side * x + rise * v - ray * sqrt(max(1.0 - x * x - v * v, 0.0));
      vec3 inside = refract(ray, n, 0.75);
      vec3 leave = n - 2.0 * dot(n, inside) * inside;
      vec3 beyond = refract(inside, -leave, 1.33);
      if (dot(beyond, beyond) < 0.5) beyond = reflect(inside, -leave);
      seen += thawWorld(beyond, 1.0) * (0.9 * mix(0.1, 1.0, smoothstep(0.0, 0.3, dot(n, -ray))));
    }
    seen /= 6.0;
    // The star in it is drawn out to a line.
    vec3 sunAside = uSunDir - ray * dot(uSunDir, ray);
    vec3 sunward = sunAside / max(length(sunAside), 1e-4);
    float turnTo = acos(clamp(dot(ray, uSunDir), -1.0, 1.0));
    float enter = 0.5 * turnTo + 0.4;
    for (int i = 0; i < 4; i++) enter = 0.5 * turnTo + asin(sin(enter) / 1.33);
    enter = min(enter, 0.93);
    vec2 star = -sin(enter) * vec2(dot(sunward, side), dot(sunward, rise));
    float aside = (x - star.x) * 0.5 * vStreak.y;
    float along = y + star.y;
    float dwell = min(1.0, 3.5 / max(0.5 * vStreak.y * vAge, 1e-4)) * smoothstep(from - 0.08, from + 0.08, along) * (1.0 - smoothstep(to - 0.08, to + 0.08, along));
    float sun = max(sunShadow(vWorld, vec3(0.0, 1.0, 0.0), uShadowTexelM * 2.5), 0.45);
    vec3 line = uSunColor * (50.0 * sun * exp(-aside * aside / 4.0) * dwell);
    // So is the sun mirrored on its skin, on the side toward the sun.
    vec3 facing = normalize(uSunDir - ray + vec3(0.0, 1e-5, 0.0));
    float turned = max(dot(facing, -ray), 0.05);
    float lobe = 1.0 / sqrt(4.0 * clamp(0.015 * vStreak.y * vStreak.y, 24.0, 400.0));
    float wide = max(lobe * turned, 1.5 / max(vStreak.y, 1e-3));
    float beside = (x - dot(facing, side)) / wide;
    float under = y + dot(facing, rise);
    line += uSunColor * (24.0 * sun * (lobe * turned / wide) * exp(-0.5 * beside * beside) * min(1.0, 2.5 * lobe / max(vAge, 1e-4)) * smoothstep(from - 0.08, from + 0.08, under) * (1.0 - smoothstep(to - 0.08, to + 0.08, under)));
    outColor = vec4(applyFog(seen + line / share, vWorld), saturate(share));
    return;
  }
  if (vSeed < -0.5) {
    // The light a bead gathers lies on the skin as a crescent round its far side.
    float sun = max(sunShadow(vWorld, vec3(0.0, 1.0, 0.0), uShadowTexelM * 2.5), 0.45);
    vec2 at = vec2(1.35 + 0.45 * vAt.x, 0.95 * vAt.y);
    float out1 = length(at);
    float crescent = smoothstep(0.92, 1.06, out1) * (1.0 - smoothstep(1.1, 1.5, out1)) * (1.0 - smoothstep(0.25, 1.05, abs(atan(at.y, at.x))));
    outColor = vec4(applyFog(uSunColor * vec3(1.3, 1.05, 0.45), vWorld), saturate(0.9 * crescent * sun * vAge));
    return;
  }
  if (far > 1.0) discard;
  float turn = atan(vAt.y, vAt.x);
  // The crown breaks into a few jets of spray and fine drops thrown clear of them.
  float jets = smoothstep(0.45, 0.8, valueNoise(vec2(turn * 1.9 + vSeed * 31.0, vSeed * 7.0)));
  float reach = 0.45 + 0.4 * valueNoise(vec2(turn * 3.1 + vSeed * 13.0, 2.0));
  float ring = exp(-(far - reach) * (far - reach) / 0.0256) * jets;
  // Past the jets fine drops fly on, each a point.
  float fine = smoothstep(0.72, 0.86, valueNoise(vec2(turn * 5.0, far * 4.0 - 2.5 * vAge) + vSeed * 53.0)) * (1.0 - smoothstep(0.8, 1.0, far));
  float mist = (1.0 - far) * (1.0 - far) * (1.0 - vAge);
  float fade = (1.0 - vAge) * (1.0 - vAge);
  float cover = saturate((0.6 * ring + 0.6 * fine + 0.15 * mist) * fade * smoothstep(0.0, 0.08, vAge));
  if (cover < 0.004) discard;
  vec3 light = 0.75 * uSkyHorizonSun + 0.45 * uAirHorizon + 0.15 * uAirZenith;
  outColor = vec4(applyFog(light, vWorld), cover);
}
`

// Every set that runs by paths, for the rain to say how hard it falls.
const bursts: THREE.InstancedBufferGeometry[] = []
// The sets that carry the one drop of the thaw, for its streak as it falls.
const streaks: THREE.InstancedBufferGeometry[] = []

// Called by the rain once a frame with how hard it falls and how far the moon has taken over from the sun: the bursts on the blades follow the rain and are not drawn when none falls.
// With them, for the thaw: the film second, how much dew stands, and the one drop as the shutter opens and as it closes (how full it hangs, how far the one that let go has fallen).
export function rainOnBeads(rain: number, moon = 0, second = 0, dew = 0, drop = 0, fall = 0, dropLater = drop, fallLater = fall): void {
  beadUniforms.uBeadRain.value = rain
  beadUniforms.uBeadDrop.value.set(drop, fall, dropLater, fallLater)
  wetUniforms.uWetMoon.value = moon
  // In the thaw the same quads carry the light the beads gather, on the one set that has beads of the thaw.
  const thaw = dew > 0 && second > THAW_FROM_S && second < RAIN_FROM_S
  for (const g of bursts) g.instanceCount = (rain > 0 || (thaw && g.userData.thaw > 0)) && g.userData.paths.value > 0 ? g.userData.count : 0
  for (const g of streaks) g.instanceCount = thaw && fallLater > fall && g.userData.paths.value > 0 ? g.userData.count : 0
}

// Small clear beads. The part that wears them gives each bead its seat on the skin at both ends of the shutter, as it gives a hair its root.
export class BeadSet {
  readonly surface: Surface
  // A part that wears beads adds these to its own meshes.
  readonly meshes: THREE.Mesh[]
  private readonly seats: [Float32Array, Float32Array]
  private readonly rests: [Float32Array, Float32Array]
  private readonly tints: Float32Array
  private readonly paths: Float32Array[]
  private readonly second: Float32Array[]
  private readonly onPaths = { value: 0 }
  private readonly keys = { value: 0 }
  private readonly rained = { value: new THREE.Vector4(0, 0, 0, 0) }
  private readonly tipAt = { value: new THREE.Vector4(0, 0, 0, 0) }
  private readonly geometry = new THREE.InstancedBufferGeometry()
  private readonly sent: THREE.InstancedBufferAttribute[]

  // `thaw` is how many of the set's last beads are the beads of the thaw, laid by `thawSpot`: `THAW_BEADS` on the one blade that carries them, 0 on any other set.
  constructor(options: PartOptions, readonly count: number, name: string, private readonly thaw = 0) {
    if (options.places) throw new Error('beads are worn by the plant and the companion only')
    this.seats = [new Float32Array(count * 4), new Float32Array(count * 4)]
    this.rests = [new Float32Array(count * 4), new Float32Array(count * 4)]
    this.tints = new Float32Array(count * 3)
    this.paths = PATH_NAMES.map(() => new Float32Array(count * 4))
    this.second = SECOND_NAMES.map(() => new Float32Array(count * 4))
    const dynamic = (data: Float32Array, size: number): THREE.InstancedBufferAttribute => {
      const a = new THREE.InstancedBufferAttribute(data, size)
      a.setUsage(THREE.DynamicDrawUsage)
      return a
    }
    this.sent = [dynamic(this.seats[0], 4), dynamic(this.seats[1], 4), dynamic(this.rests[0], 4), dynamic(this.rests[1], 4), dynamic(this.tints, 3), ...this.paths.map((data) => dynamic(data, 4)), ...this.second.map((data) => dynamic(data, 4))]
    this.geometry.setAttribute('aCorner', new THREE.BufferAttribute(new Float32Array([-1, -1, 1, -1, 1, 1, -1, 1]), 2))
    this.geometry.setIndex([0, 1, 2, 0, 2, 3])
    const names = ['aSeatA', 'aSeatB', 'aRestA', 'aRestB', 'aTint', ...PATH_NAMES, ...SECOND_NAMES]
    names.forEach((n, i) => this.geometry.setAttribute(n, this.sent[i]))
    this.geometry.instanceCount = 0
    this.surface = makePartSurface(options, { name, vertex, fragment, side: THREE.DoubleSide, castShadow: false, uniforms: { ...beadUniforms, uBeadPaths: this.onPaths, uBeadKeys: this.keys, uBeadWetTint: this.rained, uBeadTip: this.tipAt } })
    const mesh = partMesh(this.geometry, this.surface)
    mesh.renderOrder = BEAD_ORDER
    const struck = new THREE.InstancedBufferGeometry()
    struck.setAttribute('aCorner', this.geometry.getAttribute('aCorner'))
    struck.setIndex(this.geometry.getIndex())
    for (const n of ['aForm', 'aFormUp', 'aMid', 'aEnd', 'aSeatA', 'aSeatB', 'aRestA', 'aRestB', 'aGather', 'aGatherB']) struck.setAttribute(n, this.geometry.getAttribute(n))
    struck.instanceCount = 0
    struck.userData = { paths: this.onPaths, count, thaw }
    bursts.push(struck)
    const spray = makePartSurface(options, { name: `${name} bursts`, vertex: burstVertex, fragment: burstFragment, side: THREE.DoubleSide, transparent: true, depthWrite: false, castShadow: false, uniforms: { ...beadUniforms, uBeadKeys: this.keys } })
    const burst = partMesh(struck, spray)
    burst.renderOrder = BEAD_ORDER + 0.5
    this.meshes = [mesh, burst]
    if (thaw > 0) {
      // The streak of the falling drop is drawn see-through and must stay as sharp as the drop.
      const fallen = new THREE.InstancedBufferGeometry()
      fallen.setIndex(struck.getIndex())
      for (const n of Object.keys(struck.attributes)) fallen.setAttribute(n, struck.getAttribute(n))
      fallen.instanceCount = 0
      fallen.userData = { paths: this.onPaths, count }
      streaks.push(fallen)
      const keep = makePartSurface(options, { name: `${name} drop streak blur circle`, vertex: burstVertex, fragment: `#define BLUR_CIRCLE 1\n${burstFragment}`, side: THREE.DoubleSide, transparent: true, depthWrite: false, cocOnly: true, castShadow: false, uniforms: { ...beadUniforms, uBeadKeys: this.keys } })
      const sharp = partMesh(fallen, keep)
      sharp.renderOrder = BEAD_ORDER + 0.6
      this.meshes.push(sharp)
    }
  }

  // Four numbers a bead: where it touches the skin (x, y, z in the plant's own space, meters) and its radius in meters. Radius 0 is no bead.
  seat(slot: 0 | 1): Float32Array {
    return this.seats[slot]
  }

  // Four numbers a bead: the skin's normal there on the side the bead sits, and how it hangs: 0 sitting on a face to 1 hanging free under a tip.
  rest(slot: 0 | 1): Float32Array {
    return this.rests[slot]
  }

  // A bead that is given its path is laid once a fill and runs by itself on the film second, so it runs on in a hold with nothing written. All six are four numbers a bead, in the plant's own space as the skin stands at the fill.
  // Slot 0 is one key frame of the plant and slot 1 the other: a set laid in both stands between them as the skin does, from the first call for slot 1 on. A set on paths keeps its second key where a placed set keeps its seats, so it is one or the other.
  // Where the bead forms, and its own number from 0 to 1. The set draws by paths from the first call on.
  form(slot: 0 | 1 = 0): Float32Array {
    this.onPaths.value = 1
    if (slot === 1) this.keys.value = 1
    return slot === 1 ? this.seats[0] : this.paths[0]
  }

  // The skin's normal where it forms on the side the bead sits, and the part's own scale of its radius: 1 as it comes.
  formUp(slot: 0 | 1 = 0): Float32Array {
    return slot === 1 ? this.seats[1] : this.paths[1]
  }

  // The skin point half way down its slide, and `reaches` of its plan.
  mid(slot: 0 | 1 = 0): Float32Array {
    return slot === 1 ? this.rests[0] : this.paths[2]
  }

  // The skin point where its slide ends, and the `across` it formed at: 0 on a stem.
  end(slot: 0 | 1 = 0): Float32Array {
    return slot === 1 ? this.rests[1] : this.paths[3]
  }

  // The skin's normal where its slide ends.
  endUp(slot: 0 | 1 = 0): Float32Array {
    return slot === 1 ? this.second[0] : this.paths[4]
  }

  // The skin point its dew gathers at through a dry night, and `dewKind` of its plan.
  gather(slot: 0 | 1 = 0): Float32Array {
    return slot === 1 ? this.second[1] : this.paths[5]
  }

  // What the part allows a bead, for a part that needs it: the largest radius in meters in the rain and as dew (both 0: no limit), the scale of its radius as dew against rain (0: as it comes), and 1 when it has no tip to hang from, so it spreads where its slide ends.
  limit(): Float32Array {
    return this.paths[6]
  }

  // Three numbers a bead: the color of the skin under it, which is seen through the water.
  // The colour the set's beads take in the rain, mixed in by the shader as the wet comes on, so a part lays its dry tint once.
  wetTint(r: number, g: number, b: number): void {
    this.rained.value.set(r, g, b, 1)
  }

  tint(): Float32Array {
    return this.tints
  }

  // How many of the beads are drawn. Called once a frame after both fills.
  finish(shown = this.count): void {
    this.geometry.instanceCount = Math.max(0, Math.min(shown, this.count))
    if (this.thaw > 0) {
      // The tip that carries the one drop: no other bead hangs within a few millimeters of it.
      const o = (this.count - this.thaw) * 4
      this.tipAt.value.set(this.paths[0][o], this.paths[0][o + 1], this.paths[0][o + 2], 0.004)
    }
    // Only what the part fills is sent: the paths of a set that runs by itself, the two seats of one that is placed.
    const paths = this.onPaths.value > 0
    const keys = this.keys.value > 0
    this.sent.forEach((a, i) => {
      if (i === 4 || (i < 4 ? !paths || keys : paths && (i < 12 || keys))) a.needsUpdate = true
    })
  }
}

export function createBeads(options: PartOptions, count: number, name: string, thaw = 0): BeadSet | null {
  return options.places ? null : new BeadSet(options, count, name, thaw)
}

export interface Bead {
  // Where the bead is now, in the part's own two coordinates: 0 at the foot to 1 at the tip, and -1 to 1 from margin to margin over the midrib.
  along: number
  across: number
  radiusM: number
  // 0 sitting on a face to 1 hanging free under the tip.
  hang: number
  // How far it has fallen from the tip, in meters.
  fallM: number
}

export interface BeadPlan {
  // Half way down its slide and at the end of it, in the part's own two coordinates.
  midAlong: number
  midAcross: number
  endAlong: number
  endAcross: number
  // 1 when the slide ends at the tip, where the bead hangs and falls; 0 when it stops short and spreads.
  reaches: number
  // Where its dew gathers through a dry night: 0 it stays where it formed, 1 at the margin, 2 hanging from the tip.
  dewAlong: number
  dewAcross: number
  dewKind: number
}

// The path a bead takes over its part, from where it forms. It holds no time and no dial: when the bead is where on it is worked out as it is drawn.
export function beadPlan(own: number, along: number, across: number, out: BeadPlan): BeadPlan {
  const reach = Math.min(1 - along, REACH)
  out.midAlong = along + 0.5 * reach
  out.midAcross = across * (1 - 0.85 * Math.SQRT1_2)
  out.endAlong = along + reach
  out.endAcross = across * 0.15
  out.reaches = 1 - along <= REACH ? 1 : 0
  out.dewAlong = along
  out.dewAcross = across
  // The kind is the whole part; the rest is how far along the part the dew stands, for the order of the thaw.
  out.dewKind = 0.4 * Math.min(1, Math.max(0, along))
  if (across === 0) return out
  const where = own2(own, 91.7)
  if (where < DEW_MARGIN) {
    out.dewAcross = (across < 0 ? -1 : 1) * (0.82 + 0.15 * own2(own, 17.3))
    out.dewKind += 1
  } else if (where > 1 - DEW_TIP && along > 0.45) {
    out.dewAlong = 1
    out.dewAcross = 0
    out.dewKind = 2.4
  }
  return out
}

export interface ThawSpot {
  own: number
  along: number
  across: number
  plan: BeadPlan
}

function thawHash(k: number, c: number): number {
  const x = Math.sin(k * 127.1 + c * 311.7 + 1.3) * 43758.5453
  return x - Math.floor(x)
}

// Where bead `k` of the thaw stands on its blade (0 to `THAW_BEADS` - 1): the tip twice, then the margin, the midrib, the side veins and the face between them, where the hairs stand.
// `veinAlong(vein, across)` is the blade's own: how far along the midrib side vein `vein` (0 to 7 from the base) runs at `across`, whose sign is the side.
// The part lays each as any other bead of the set, on blade 0, with `own`, `along`, `across` and `plan` as given here.
export function thawSpot(k: number, veinAlong: (vein: number, across: number) => number): ThawSpot {
  const plan: BeadPlan = { midAlong: 0, midAcross: 0, endAlong: 0, endAcross: 0, reaches: 0, dewAlong: 0, dewAcross: 0, dewKind: 0 }
  const spot: ThawSpot = { own: thawHash(k, 0), along: 1, across: 0, plan }
  const lay = (along: number, across: number, kind: number, toAlong = along, toAcross = across): ThawSpot => {
    spot.along = along
    spot.across = across
    plan.midAlong = plan.endAlong = along
    plan.midAcross = plan.endAcross = across
    plan.dewAlong = toAlong
    plan.dewAcross = toAcross
    // The kind, and with it how far along the blade the bead stands, for the order of the thaw.
    plan.dewKind = kind + 0.4 * Math.min(1, Math.max(0, kind === THAW_RUNS ? toAlong : along))
    return spot
  }
  if (k < 2) {
    lay(1, 0, k === 0 ? THAW_DROP : THAW_FELL)
    plan.midAlong = 0.93
    plan.reaches = 1
    return spot
  }
  let j = k - 2
  if (j < THAW_EDGE) {
    const side = j % 2 === 0 ? -1 : 1
    const row = j >> 1
    return lay(0.05 + 0.93 * (row + 0.15 + 0.7 * thawHash(k, 1)) / (THAW_EDGE / 2), side, THAW_ALONE)
  }
  j -= THAW_EDGE
  // Off the margin the beads come two by two: most pairs stand close enough to touch as they grow, and then the one runs into the other.
  const pair = j >> 1
  const second = (j & 1) === 1
  const first = k - (second ? 1 : 0)
  const close = thawHash(first, 2) < 0.65
  const h = (c: number) => thawHash(close || !second ? first : k, c)
  spot.own = thawHash(close ? first : k, 0)
  const side = h(3) < 0.5 ? -1 : 1
  let along: number
  let across: number
  let nextAlong: number
  let nextAcross: number
  if (j < THAW_RIB) {
    along = 0.06 + 0.9 * ((pair + h(4)) / (THAW_RIB / 2))
    across = side * 0.03 * h(5)
    nextAlong = along + (0.012 + 0.02 * h(6)) * (h(7) < 0.5 ? -1 : 1)
    nextAcross = across
  } else if (j < THAW_RIB + THAW_VEIN) {
    const vein = 2 + ((pair - THAW_RIB / 2) % 6)
    across = side * (0.14 + 0.7 * h(4))
    along = veinAlong(vein, across)
    nextAcross = across + side * (0.03 + 0.05 * h(6))
    nextAlong = veinAlong(vein, nextAcross)
  } else {
    along = 0.08 + 0.84 * h(4)
    across = side * (0.08 + 0.78 * h(5))
    nextAlong = along + 0.03 * (h(6) - 0.5)
    nextAcross = across + side * (0.03 + 0.04 * h(7))
  }
  along = Math.min(0.97, along)
  nextAlong = Math.min(0.97, nextAlong)
  if (!close) return lay(along, across, THAW_ALONE)
  return second ? lay(nextAlong, nextAcross, THAW_RUNS, along, across) : lay(along, across, THAW_TAKES, nextAlong, nextAcross)
}

// Rain: `since` is the time the rain has fallen.
function rainBead(own: number, along: number, across: number, since: number, wet: number, out: Bead): void {
  const kind = own2(own, 53.3)
  if (kind < STAY) {
    // A small bead forms and stays: most are fine, few are not.
    const t = since - 3 * own2(own, 311.7)
    const fine = own2(own, 127.1)
    out.radiusM = (0.0006 + 0.0034 * fine * fine) * wet * ease(0, 1.5, t) * (1 - 0.6 * across * across)
    return
  }
  // A large one swells where it formed, slides to the tip in fits and starts, hangs there and falls: once or twice in a shower.
  const period = 7 + 6 * own2(own, 127.1)
  const t = since - 5 * own2(own, 311.7) + 3
  if (t < 0) return
  const turn = t / period
  const p = turn - Math.floor(turn)
  const full = (0.0022 + 0.0018 * own2(own + Math.floor(turn) * 0.618, 74.7)) * wet * ease(0, 1.5, since)
  if (p < SIT) {
    out.radiusM = full * Math.cbrt(p / SIT) * ease(0, 0.06, p)
  } else if (p < RUN) {
    const q = (p - SIT) / (RUN - SIT)
    const e = q * q * (1.5 - 0.5 * q) + 0.02 * Math.sin(6 * Math.PI * q)
    out.along = along + Math.min(1 - along, REACH) * e
    out.across = across * (1 - 0.85 * Math.sqrt(Math.max(e, 0)))
    out.radiusM = full * (1 + 0.3 * e)
  } else {
    const q = Math.min(1, (p - RUN) / (HANG - RUN))
    out.across = across * 0.15
    if (1 - along > REACH) {
      // One that does not reach the tip spreads into the film where it stops.
      out.along = along + REACH
      out.radiusM = full * 1.3 * (1 - q) * (1 - q)
      return
    }
    out.along = 1
    out.hang = q * q * (3 - 2 * q)
    out.radiusM = full * (1.3 + 0.1 * q)
    if (p >= HANG) {
      const fall = (p - HANG) * period
      out.fallM = 0.5 * G * fall * fall
      out.radiusM = full * 1.25
    }
  }
}

// Dew stays where it formed: a few beads large enough to see as lenses, the rest a fine scatter of every size under them. `dry` is 1 on a skin that holds no rain.
function dewBead(own: number, along: number, across: number, dew: number, dry: number, out: Bead): void {
  const fine = own2(own, 127.1)
  const large = Math.max(0, (own - 0.85) / 0.15)
  out.radiusM = (own > 0.85 ? 0.0005 + 0.0009 * large * large : 0.00015 + 0.0011 * fine * fine) * Math.sqrt(dew) * (1 - 0.6 * across * across)
  if (dry <= 0 || across === 0) return
  // Through a still night the dew of a blade runs together: it stands in drops along the margin and one hangs from a tip.
  const where = own2(own, 91.7)
  if (where < DEW_MARGIN) {
    out.across = lerp(across, (across < 0 ? -1 : 1) * (0.82 + 0.15 * own2(own, 17.3)), dry)
    out.hang = 0.75 * dry
    out.radiusM = lerp(out.radiusM, (0.0016 + 0.0014 * fine) * Math.sqrt(dew), dry)
  } else if (where > 1 - DEW_TIP && along > 0.45) {
    out.along = lerp(along, 1, dry)
    out.across = across * (1 - dry)
    out.hang = dry
    out.radiusM = lerp(out.radiusM, (0.0028 + 0.001 * fine) * Math.sqrt(dew), dry)
  }
}

// Where a bead is at a film time, in closed form. `own` is the bead's own number from 0 to 1; `along` and `across` are where it forms.
export function beadAt(own: number, along: number, across: number, time: number, out: Bead): Bead {
  out.along = along
  out.across = across
  out.radiusM = 0
  out.hang = 0
  out.fallM = 0
  const wet = stateUniforms.uPlantWet.value
  const dew = stateUniforms.uPlantDew.value
  // The part hands over its own clock, which stands still in a hold: water runs on the film second.
  const real = shared.uReal.value + (time - shared.uTime.value)
  const since = real - RAIN_FROM_S
  const rained = since >= 0 && wet > 0
  // Beads run only in the rain and on what it leaves: a skin that is merely damp, as at dawn and in the thaw, keeps its dew where it formed.
  if (rained) rainBead(own, along, across, since, Math.sqrt(wet), out)
  else if (dew > 0) dewBead(own, along, across, dew, 1 - Math.min(1, 4 * wet), out)
  return out
}

// The dew alone, whatever the rain does: for a part that lays its dew once and leaves the rain to the shader.
export function dewBeadAt(own: number, along: number, across: number, _time: number, out: Bead): Bead {
  out.along = along
  out.across = across
  out.radiusM = 0
  out.hang = 0
  out.fallM = 0
  const dew = stateUniforms.uPlantDew.value
  if (dew > 0) dewBead(own, along, across, dew, 1, out)
  return out
}
