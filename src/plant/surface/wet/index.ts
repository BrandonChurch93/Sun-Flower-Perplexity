import * as THREE from 'three'
import { config } from '../../../config.ts'
import { barTime, rainAtBar } from '../../../v2/clock.ts'
import { shared, type Surface } from '../../../core/shading.ts'
import { makePartSurface, partMesh, stateUniforms, type PartOptions } from '../../part.ts'
import { wetUniforms } from './film.ts'

// Beads of water on the skin: rain that sits, swells, runs to the tip and falls, and dew that stays where it formed.
export const real = true

export const BEAD_ORDER = 19

// How far the rain has thinned the beads on the side of a part turned from the light: 0 before it rains to 1 in the rain, and back after it.
const beadUniforms = { uBeadRain: { value: 0 }, ...wetUniforms }

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
${KEYED}
vec4 kForm;
vec4 kFormUp;
vec4 kMid;
vec4 kEnd;
vec4 kEndUp;
vec4 kGather;
uniform float uPlantWet;
uniform float uPlantDew;
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
  if (since >= 0.0 && uPlantWet > 0.0) {
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
    }
  }
  r *= kFormUp.w;
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
void main() {
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
    beadOnPath(uReal, seatA, restA);
    beadOnPath(uReal + ${SHUTTER_GLSL}, seatB, restB);
  }
  vec4 seat = mix(seatA, seatB, share);
  vec4 rest = mix(restA, restB, share);
  float own = hash11(float(gl_InstanceID) * 0.618 + 0.37);
  float r = seat.w * plantSize();
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
  float longM = 1.0 + (1.0 - hang) * ((0.1 + 0.5 * own) * slope * smoothstep(0.0002, 0.0012, r) + min(0.5 * run, 1.2));
  // A bead that sits is a low cap, each to its own height; one that hangs is whole and under its hold.
  float high = mix(mix(0.5, 0.85, hash11(own + 3.1)), 1.0, hang);
  vec3 middle = base + mix(up * (-0.25 * high * r) + down * (0.35 * (longM - 1.0) * r), vec3(0.0, -0.9 * r, 0.0), hang);
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
  // A bead narrower than three pixels of the finished frame is no bead to the eye: the damp sheen of the skin stands for it.
  vWide = 2.0 * r * projectionMatrix[1][1] * ${MASTER_HALF_HEIGHT_PX} / max(-view.z, 1e-4);
  gl_Position = vWide >= 3.0 ? projectionMatrix * view : vec4(2.0, 2.0, 2.0, 1.0);
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

const float BEAD_LENS = 1.5;

// The world as a bead shows it: the dome, and the bright band low over the horizon that gives a bead its window.
vec3 beadSky(vec3 d) {
  float band = exp(-(d.y - 0.12) * (d.y - 0.12) * 22.0);
  float t = d.y * 0.5 + 0.5;
  // A bead shows the sky as the sky draws itself, not the fill that lands on the leaf.
  vec3 dome = mix(uGroundBounce, mix(uAirHorizon, uAirZenith, smoothstep(0.55, 1.0, t)), smoothstep(0.15, 0.6, t));
  return dome + uAirHorizon * (1.2 * band);
}

void main() {
  vec3 ray = normalize(vWorld - uCamPos);
  vec3 up = normalize(vUp);
  vec3 down = normalize(vDown - up * dot(vDown, up));
  vec3 side = cross(up, down);
  // The bead is a ball pressed low and drawn out down the slope: the ray is met in the space where it is round.
  vec3 scale = 1.0 / vShape;
  vec3 from = uCamPos - vMiddle;
  vec3 o = vec3(dot(from, side), dot(from, up), dot(from, down)) * scale;
  vec3 d = vec3(dot(ray, side), dot(ray, up), dot(ray, down)) * scale;
  float a = dot(d, d);
  float b = dot(o, d);
  float under = b * b - a * (dot(o, o) - 1.0);
  if (under < 0.0) discard;
  float reach = (-b - sqrt(under)) / a;
  vec3 p = uCamPos + ray * reach;
  if (dot(p - vBase, up) < -2.0 * vShape.x * vHang) discard;
  vec3 q = o + d * reach;
  vec3 g = q * scale;
  vec3 n = normalize(side * g.x + up * g.y + down * g.z);
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
  // The ray is bent on its way in and again on its way out. Where it leaves the bead above the skin it shows the world behind, upside down; where it does not, the skin under the water. A drop that hangs free has no skin behind it.
  vec3 qn = normalize(q);
  vec3 dn = normalize(d);
  vec3 inside = refract(dn, qn, 0.75);
  vec3 leave = qn - 2.0 * dot(qn, inside) * inside;
  vec3 out3 = refract(inside, -leave, 1.33);
  if (dot(out3, out3) < 0.5) out3 = reflect(inside, -leave);
  vec3 beyond = normalize(side * out3.x + up * out3.y + down * out3.z);
  float clearOfSkin = smoothstep(0.0, 0.6, leave.y - mix(0.3, -2.0, vHang)) * smoothstep(-0.1, 0.25, dot(beyond, up) + vHang);
  body = mix(body, beadSky(beyond) * 0.9, mix(0.35, 0.92, vHang) * clearOfSkin);
  // A clear sun behind a bead is seen through it, bent to one small bright place on the side away from the sun.
  float lens = saturate(dot(beyond, uSunDir));
  lens *= lens;
  lens *= lens;
  lens *= lens;
  lens *= lens;
  body += uSunColor * (BEAD_LENS * clear * sun * clearOfSkin * lens * lens);

  // Under a closed sky the bead's one highlight is the sky itself over the lens: a small soft window near its top.
  float window = saturate(dot(mirror, normalize(vec3(0.0, 0.8, 0.0) - 0.6 * normalize(vec3(ray.x, 0.0, ray.z)))));
  window *= window;
  window *= window;
  window *= window;
  // Water on a hairy skin rests on air held between the hairs, and that floor is a mirror from inside: the bead is silver on the side away from the light.
  vec3 closed = (uAirHorizon + uAirZenith) * smoothstep(0.0, 0.5, uPlantWet);
  body += closed * (0.3 * farSky * (1.0 - vHang));
  vec3 color = body * (1.0 - fresnel) + sky * fresnel + uSunColor * (sun * glint * (1.0 - 0.75 * uWetMoon)) + closed * (1.2 * window);
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
uniform float uBeadRain;
uniform float uBeadKeys;
uniform float uPlantWet;
${KEYED}
out vec2 vAt;
out vec3 vWorld;
out float vAge;
out float vSeed;
void main() {
  vec4 kForm = keyed(aForm, aSeatA);
  vec4 kFormUp = keyed(aFormUp, aSeatB);
  vec4 kMid = keyed(aMid, aRestA);
  vec4 kEnd = keyed(aEnd, aRestB);
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
void main() {
  if (uDiag > 1) discard;
  float far = length(vAt);
  if (far > 1.0) discard;
  float turn = atan(vAt.y, vAt.x);
  // The crown breaks into a few jets of spray and fine drops thrown clear of them.
  float jets = smoothstep(0.45, 0.8, valueNoise(vec2(turn * 1.9 + vSeed * 31.0, vSeed * 7.0)));
  float reach = 0.45 + 0.4 * valueNoise(vec2(turn * 3.1 + vSeed * 13.0, 2.0));
  float ring = exp(-pow((far - reach) / 0.16, 2.0)) * jets;
  // Past the jets fine drops fly on, each a point.
  float fine = smoothstep(0.72, 0.86, valueNoise(vec2(turn * 5.0, far * 4.0 - 2.5 * vAge) + vSeed * 53.0)) * smoothstep(1.0, 0.8, far);
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

// Called by the rain once a frame with how hard it falls and how far the moon has taken over from the sun: the bursts on the blades follow the rain and are not drawn when none falls.
export function rainOnBeads(rain: number, moon = 0): void {
  beadUniforms.uBeadRain.value = rain
  wetUniforms.uWetMoon.value = moon
  for (const g of bursts) g.instanceCount = rain > 0 && g.userData.paths.value > 0 ? g.userData.count : 0
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
  private readonly geometry = new THREE.InstancedBufferGeometry()
  private readonly sent: THREE.InstancedBufferAttribute[]

  constructor(options: PartOptions, readonly count: number, name: string) {
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
    this.surface = makePartSurface(options, { name, vertex, fragment, side: THREE.DoubleSide, castShadow: false, uniforms: { ...beadUniforms, uBeadPaths: this.onPaths, uBeadKeys: this.keys, uBeadWetTint: this.rained } })
    const mesh = partMesh(this.geometry, this.surface)
    mesh.renderOrder = BEAD_ORDER
    const struck = new THREE.InstancedBufferGeometry()
    struck.setAttribute('aCorner', this.geometry.getAttribute('aCorner'))
    struck.setIndex(this.geometry.getIndex())
    for (const n of ['aForm', 'aFormUp', 'aMid', 'aEnd', 'aSeatA', 'aSeatB', 'aRestA', 'aRestB']) struck.setAttribute(n, this.geometry.getAttribute(n))
    struck.instanceCount = 0
    struck.userData = { paths: this.onPaths, count }
    bursts.push(struck)
    const spray = makePartSurface(options, { name: `${name} bursts`, vertex: burstVertex, fragment: burstFragment, side: THREE.DoubleSide, transparent: true, depthWrite: false, castShadow: false, uniforms: { ...beadUniforms, uBeadKeys: this.keys } })
    const burst = partMesh(struck, spray)
    burst.renderOrder = BEAD_ORDER + 0.5
    this.meshes = [mesh, burst]
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
    // Only what the part fills is sent: the paths of a set that runs by itself, the two seats of one that is placed.
    const paths = this.onPaths.value > 0
    const keys = this.keys.value > 0
    this.sent.forEach((a, i) => {
      if (i === 4 || (i < 4 ? !paths || keys : paths && (i < 12 || keys))) a.needsUpdate = true
    })
  }
}

export function createBeads(options: PartOptions, count: number, name: string): BeadSet | null {
  return options.places ? null : new BeadSet(options, count, name)
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
  out.dewKind = 0
  if (across === 0) return out
  const where = own2(own, 91.7)
  if (where < DEW_MARGIN) {
    out.dewAcross = (across < 0 ? -1 : 1) * (0.82 + 0.15 * own2(own, 17.3))
    out.dewKind = 1
  } else if (where > 1 - DEW_TIP && along > 0.45) {
    out.dewAlong = 1
    out.dewAcross = 0
    out.dewKind = 2
  }
  return out
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
