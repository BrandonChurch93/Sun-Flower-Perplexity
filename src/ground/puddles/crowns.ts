import * as THREE from 'three'
import { basin } from './basin.ts'
import { skyMirror } from './water.ts'

// A splash is over this long after its drop lands: the cup rises and falls first, its beads and grit fly on.
export const SPLASH_LIFE_S = 0.5
const AROUND = 64
const UP = [0, 0.45, 0.75, 0.92, 1]
const BEADS = 16
const GRIT = 6
// On water a column stands up from the middle after the cup has fallen, until this many cup lives after the landing.
const JET_ENDS = 2
// No splash stands within the first of these distances of the plant's foot, in meters, and a full one only beyond the second.
const PLANT_CLEAR_M = [0.02, 0.06]

export const crownVertex = /* glsl */ `
in vec3 position;
in vec3 part;
in vec4 drop;
uniform vec2 uSpan;
uniform float uStands;
out vec3 vWorld;
out float vDepth;
out vec3 vNormal;
out float vKind;
out float vTop;
out float vMud;
out float vFlute;
${basin}
const float TAU = 6.2831853;
const float G = 9.81;

// On water a crown is a ring of thin fingers of unequal height, on mud a low ring of many small teeth.
float teethOf(float seed, float onWater) {
  return onWater > 0.5 ? 6.0 + floor(5.0 * fract(seed * 3.7)) : 5.0 + floor(5.0 * seed);
}

vec3 cup(float th, float v, float x, float size, float onWater, float seed) {
  float teeth = teethOf(seed, onWater);
  float wide = (0.007 * min(1.0, size * 6.0) + 0.009 * size) * mix(0.4, 0.65, onWater);
  if (x >= 1.0) {
    float k = (x - 1.0) / ${(JET_ENDS - 1).toFixed(2)};
    float stands = sin(3.14159265 * pow(k, 0.7));
    float r = wide * (0.05 + 0.4 * pow(1.0 - v, 3.0) + 0.16 * exp(-(v - 0.86) * (v - 0.86) / 0.012) * smoothstep(0.1, 0.5, k)) * sqrt(stands);
    vec2 lean = vec2(cos(TAU * seed * 5.0), sin(TAU * seed * 5.0)) * 0.87 * wide * v * v * stands;
    return vec3(cos(th) * r + lean.x, wide * (1.5 + 1.3 * fract(seed * 17.0)) * stands * v, sin(th) * r + lean.y);
  }
  float tall = wide * mix(0.5, 1.0, onWater) * (0.75 + 0.5 * fract(seed * 13.0));
  float rise = smoothstep(0.0, mix(0.22, 0.12, onWater), x) * (1.0 - smoothstep(mix(0.5, 0.72, onWater), 1.0, x));
  float tooth = th * teeth / TAU + seed * 7.0;
  float bump = pow(0.5 - 0.5 * cos(TAU * fract(tooth)), mix(2.0, 5.0, onWater));
  float lot = hash11(mod(floor(tooth), teeth) + 17.0 * seed);
  float ragged = 0.2 + 1.3 * lot * lot;
  float lobe = max(0.12, 1.0 + mix(0.22, 0.5, onWater) * sin(th * 2.0 + seed * 40.0) + mix(0.14, 0.34, onWater) * sin(th * 3.0 + seed * 91.0));
  float lean = 1.0 + mix(0.3, 0.6, onWater) * cos(th - TAU * fract(seed * 29.0));
  float finger = bump * ragged * v * v * v;
  float y = tall * rise * mix(0.6 + 0.4 * lobe * lean, 0.3 + 0.7 * min(lobe * lean, 1.3), onWater) * (mix(0.5, 0.35, onWater) * v + mix(0.6, 1.0, onWater) * finger);
  float foot = 0.3 * onWater * pow(1.0 - v, 3.0);
  float r = wide * mix(0.35 + 0.65 * sqrt(x), 1.0 - 0.6 * exp(-7.0 * x), onWater) * (0.8 + 0.2 * lobe) * (mix(0.8, 0.6, onWater) + foot + mix(0.2, 0.5, onWater) * v + 0.4 * v * v * mix(1.0, 0.8, onWater) + mix(0.22, 0.9, onWater) * finger);
  vec2 over = vec2(cos(TAU * fract(seed * 29.0)), sin(TAU * fract(seed * 29.0))) * 0.5 * y * onWater;
  return vec3(cos(th) * r + over.x, y, sin(th) * r + over.y);
}

void main() {
  float t = mix(uSpan.x, uSpan.y, uShutter) - drop.z;
  vKind = part.x;
  vTop = part.x < 0.5 ? part.z : 1.0;
  vMud = 0.0;
  vFlute = 0.0;
  vNormal = vec3(0.0, 1.0, 0.0);
  vWorld = vec3(0.0);
  vDepth = 0.0;
  gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
  if (t <= 0.0 || t >= ${SPLASH_LIFE_S.toFixed(2)}) return;
  vec4 seenAt = projectionMatrix * viewMatrix * vec4(drop.x, 0.0, drop.y, 1.0);
  if (max(abs(seenAt.x), abs(seenAt.y)) > 1.1 * seenAt.w + 0.3) return;
  float clear = smoothstep(${PLANT_CLEAR_M[0].toFixed(3)}, ${PLANT_CLEAR_M[1].toFixed(3)}, length(drop.xy));
  if (clear <= 0.0) return;
  float size = drop.w / 0.0022 * clear;
  float seed = hash21(drop.xy * 53.3 + 0.37);
  float lasts = 0.15 + 0.09 * size;
  float x = t / lasts;
  if (part.x < 0.5 && x >= 1.0 && (size < 0.42 || x >= ${JET_ENDS.toFixed(2)})) return;
  float ground = soilHeight(drop.xy, soilLod(drop.xy));
  float depth = waterDepthOver(ground, drop.xy);
  float onWater = smoothstep(0.0, 0.006, depth);
  if (drop.w < 0.0005 && onWater < 0.6) return;
  if (part.x < 0.5 && drop.w < 0.0005 && hash11(seed * 91.7) < 0.5) return;
  vMud = 1.0 - onWater;
  if (part.x < 0.5 && x >= 1.0) vTop = 0.4 * part.z;
  float base = depth > 0.0 ? uLevel.x : ground;
  vec3 at;
  vec3 n;
  if (part.x < 0.5) {
    if (x >= 1.0 && onWater < 0.6) return;
    float th = part.y * TAU;
    vFlute = part.y * (teethOf(seed, onWater));
    at = cup(th, part.z, x, size, onWater, seed);
    vec3 round = cup(th + 0.02, part.z, x, size, onWater, seed) - at;
    vec3 up = cup(th, part.z + 0.02, x, size, onWater, seed) - at;
    n = normalize(cross(up, round) + vec3(0.0, 1e-9, 0.0));
  } else {
    bool grit = part.x > 1.5;
    float a = part.y + (grit ? 40.0 : 0.0);
    float ha = hash11(a * 7.13 + seed * 311.0);
    float hb = hash11(a * 3.71 + seed * 77.0);
    float hc = hash11(a * 5.37 + seed * 151.0);
    if (grit && (hc < onWater + 0.5 || size < 0.3)) return;
    if (!grit && hash11(a * 9.17 + seed * 201.0) < 0.5 * (1.0 - onWater)) return;
    float teeth = teethOf(seed, onWater);
    float count = grit ? ${GRIT.toFixed(1)} : ${BEADS.toFixed(1)};
    float th = TAU * (floor((part.y + ha) / count * teeth) + 0.5 - seed * 7.0) / teeth;
    float leaves = grit ? 0.08 + 0.2 * hb : 0.18 + 0.35 * hb;
    float radius = (grit ? 0.0004 + 0.0009 * hc : 0.0003 + 0.0008 * hc * hc + 0.0004 * onWater * hc) * (0.6 + 0.4 * size);
    float pitch = grit ? 0.45 + 0.5 * ha : 0.8 + 0.55 * ha;
    float speed = (grit ? 0.35 + 0.5 * hc : 0.45 + 0.75 * hb) * (0.55 + 0.45 * size);
    vec3 way = vec3(cos(th) * cos(pitch), sin(pitch), sin(th) * cos(pitch));
    float flown = max(x - leaves, 0.0) * lasts;
    vec3 going = way * speed - vec3(0.0, G * flown, 0.0);
    float xs = max(t + (dot(position, going) > 0.0 ? 0.5 : -0.5) * uStands * step(1e-6, flown), 0.0) / lasts;
    float flew = max(xs - leaves, 0.0) * lasts;
    vec3 center = cup(th, grit ? 0.3 : 1.0, min(xs, leaves), size, onWater, seed) + way * speed * flew - vec3(0.0, 0.5 * G * flew * flew, 0.0);
    vec2 over = drop.xy + center.xz;
    float under = soilHeight(over, soilLod(over));
    float floorM = max(under, uLevel.x - 1.0 + step(0.0, waterDepthOver(under, over))) - base;
    if (flown > 0.0 && center.y < floorM - radius) return;
    vec3 shape = grit ? position * (0.7 + 0.6 * vec3(ha, hb, hc)) : position;
    vTop = smoothstep(0.5, 1.4, radius * projectionMatrix[1][1] * 540.0 / max(1e-4, -(viewMatrix * vec4(drop.x, base, drop.y, 1.0)).z));
    at = center + shape * radius;
    n = normalize(position);
  }
  vec4 world = vec4(drop.x + at.x, base + at.y, drop.y + at.z, 1.0);
  vec4 view = viewMatrix * world;
  vWorld = world.xyz;
  vDepth = -view.z;
  vNormal = n;
  gl_Position = projectionMatrix * view;
}
`

export const crownFragment = /* glsl */ `
in vec3 vWorld;
in float vDepth;
in vec3 vNormal;
in float vKind;
in float vTop;
in float vMud;
in float vFlute;
${skyMirror}
vec3 seen(vec3 d) {
  return mix(uGroundBounce * 0.3, skyMirror(normalize(vec3(d.x, abs(d.y), d.z)), 0.0), smoothstep(-0.06, 0.04, d.y));
}
void main() {
  vec3 v = normalize(uCamPos - vWorld);
  vec3 n = normalize(vNormal);
  n = dot(n, v) < 0.0 ? -n : n;
  vec3 color;
  float alpha = 1.0;
  if (vKind > 1.5) {
    color = vec3(0.035, 0.03, 0.026) * skyAmbient(n) + seen(reflect(-v, n)) * 0.03;
    alpha = vTop;
  } else {
    float facing = max(dot(n, v), 0.0);
    if (vKind > 0.5) {
      float mirror = 0.03 + 0.97 * pow(1.0 - facing, 5.0);
      vec3 inside = refract(-v, n, 0.75);
      vec3 leaves = refract(inside, 2.0 * dot(n, inside) * inside - n, 1.333);
      alpha = saturate(mirror + 0.92) * vTop;
      color = mix(seen(leaves), seen(reflect(-v, n)), mirror);
    } else {
      vec3 round = cross(vec3(0.0, 1.0, 0.0), n);
      n = normalize(n + round * 0.7 * sin(6.2831853 * vFlute) + vec3(0.0, 1.0, 0.0) * (1.0 - vMud) * (0.35 * smoothstep(0.5, 1.0, vTop) + 0.5 * sin(17.0 * vTop + 2.3 * vFlute)));
      float one = mix(0.03, 0.04, vMud) + 0.93 * pow(1.0 - max(dot(n, v), 0.0), mix(5.0, 4.0, vMud));
      float mirror = 2.0 * one / (1.0 + one) * (1.0 - 0.6 * vMud);
      float lip = smoothstep(0.6, 1.0, vTop) * (1.0 - vMud);
      float silt = mix(1.0 - 0.2 * vTop, 1.0, vMud);
      vec3 through = mix(seen(refract(-v, n, 0.75)) * (0.1 + 0.15 * lip), mix(vec3(0.04, 0.034, 0.028), vec3(0.014, 0.012, 0.01), vMud) * skyAmbient(n), silt);
      alpha = mirror + (1.0 - mirror) * mix(0.75, 0.95, silt);
      color = mix(through, seen(reflect(-v, n)), mirror);
    }
  }
  outColor = vec4(finish(color, vWorld, vDepth, -1.0).rgb, alpha);
}
`

interface Solid { at: [number, number, number][]; faces: number[] }

// The corners of a small solid, each kept once, and its faces as indices into them.
function corners(geometry: THREE.BufferGeometry): Solid {
  const from = geometry.getAttribute('position')
  const at: [number, number, number][] = []
  const faces: number[] = []
  for (let i = 0; i < from.count; i++) {
    const p: [number, number, number] = [from.getX(i), from.getY(i), from.getZ(i)]
    let k = at.findIndex((q) => Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]) < 1e-6)
    if (k < 0) k = at.push(p) - 1
    faces.push(k)
  }
  geometry.dispose()
  return { at, faces }
}

// The shape every splash is drawn from: a cup as a sheet round its drop, then beads and grit as small balls.
export function crownGeometry(drops: Float32Array, floats: number): { geometry: THREE.InstancedBufferGeometry; drop: THREE.InstancedBufferAttribute } {
  const ball = corners(new THREE.IcosahedronGeometry(1, 0))
  const lump = corners(new THREE.OctahedronGeometry(1, 0))
  const cupVerts = (AROUND + 1) * UP.length
  const total = cupVerts + BEADS * ball.at.length + GRIT * lump.at.length
  const position = new Float32Array(total * 3)
  const part = new Float32Array(total * 3)
  const index: number[] = []
  let v = 0
  for (let s = 0; s <= AROUND; s++) {
    for (let k = 0; k < UP.length; k++) {
      part.set([0, s / AROUND, UP[k]], v * 3)
      if (s < AROUND && k < UP.length - 1) index.push(v, v + UP.length, v + 1, v + 1, v + UP.length, v + UP.length + 1)
      v++
    }
  }
  const balls = (kind: number, count: number, solid: Solid): void => {
    for (let b = 0; b < count; b++) {
      for (const corner of solid.faces) index.push(v + corner)
      for (const at of solid.at) {
        position.set(at, v * 3)
        part.set([kind, b, 0], v * 3)
        v++
      }
    }
  }
  balls(1, BEADS, ball)
  balls(2, GRIT, lump)
  const geometry = new THREE.InstancedBufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(position, 3))
  geometry.setAttribute('part', new THREE.BufferAttribute(part, 3))
  geometry.setIndex(index)
  const drop = new THREE.InstancedBufferAttribute(drops, floats)
  drop.setUsage(THREE.DynamicDrawUsage)
  geometry.setAttribute('drop', drop)
  geometry.instanceCount = 0
  return { geometry, drop }
}
