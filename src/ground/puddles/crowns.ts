import * as THREE from 'three'
import { basin } from './basin.ts'
import { skyMirror } from './water.ts'

// A splash is over this long after its drop lands: the cup rises and falls first, its beads and grit fly on.
export const SPLASH_LIFE_S = 0.5
const AROUND = 112
const UP = [0, 0.4, 0.7, 0.88, 0.96, 1]
const BEADS = 10
const GRIT = 6
// On water a column stands up from the middle after the cup has fallen, until this many cup lives after the landing.
const JET_ENDS = 2.7

export const crownVertex = /* glsl */ `
in vec3 position;
in vec3 part;
in vec4 drop;
uniform vec2 uSpan;
out vec3 vWorld;
out float vDepth;
out vec3 vNormal;
out float vKind;
out float vTop;
out float vMud;
${basin}
const float TAU = 6.2831853;
const float G = 9.81;

vec3 cup(float th, float v, float x, float size, float onWater, float seed) {
  float teeth = 8.0 + floor(7.0 * seed);
  float wide = 0.005 + 0.011 * size;
  if (x >= 1.0) {
    float k = (x - 1.0) / ${(JET_ENDS - 1).toFixed(2)};
    float stands = sin(3.14159265 * pow(k, 0.7));
    float r = wide * (0.3 * (1.0 - 0.8 * v) + 0.13 * exp(-(v - 0.86) * (v - 0.86) / 0.012) * smoothstep(0.1, 0.5, k)) * smoothstep(0.0, 0.12, k) * (1.0 - smoothstep(0.85, 1.0, k) * 0.5);
    vec2 lean = vec2(cos(TAU * seed * 5.0), sin(TAU * seed * 5.0)) * 0.25 * wide * v * stands;
    return vec3(cos(th) * r + lean.x, wide * (1.3 + 0.9 * fract(seed * 17.0)) * stands * v, sin(th) * r + lean.y);
  }
  float tall = wide * mix(0.95, 0.6, onWater) * (0.75 + 0.5 * fract(seed * 13.0));
  float rise = smoothstep(0.0, 0.22, x) * (1.0 - smoothstep(0.5, 1.0, x));
  float tooth = th * teeth / TAU + seed * 7.0;
  float bump = pow(0.5 - 0.5 * cos(TAU * fract(tooth)), 3.0);
  float ragged = 0.4 + 1.1 * hash11(mod(floor(tooth), teeth) + 17.0 * seed);
  float lobe = 1.0 + 0.22 * sin(th * 2.0 + seed * 40.0) + 0.14 * sin(th * 3.0 + seed * 91.0);
  float lean = 1.0 + 0.3 * cos(th - TAU * fract(seed * 29.0));
  float finger = bump * ragged * v * v * v * v;
  float y = tall * rise * (0.6 + 0.4 * lobe * lean) * (v + 0.55 * finger);
  float r = wide * (0.35 + 0.65 * sqrt(x)) * (0.8 + 0.2 * lobe) * (0.7 + 0.3 * v + 0.4 * v * v * mix(1.0, 0.55, onWater) + 0.22 * finger);
  return vec3(cos(th) * r, y, sin(th) * r);
}

void main() {
  float t = mix(uSpan.x, uSpan.y, uShutter) - drop.z;
  vKind = part.x;
  vTop = part.x < 0.5 ? part.z : 1.0;
  vMud = 0.0;
  vNormal = vec3(0.0, 1.0, 0.0);
  vWorld = vec3(0.0);
  vDepth = 0.0;
  gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
  if (t <= 0.0 || t >= ${SPLASH_LIFE_S.toFixed(2)}) return;
  float size = drop.w / 0.0022;
  float seed = hash21(drop.xy * 53.3 + 0.37);
  float depth = waterDepth(drop.xy);
  float onWater = smoothstep(0.0, 0.006, depth);
  vMud = 1.0 - onWater;
  float base = depth > 0.0 ? uLevel.x : soilHeight(drop.xy, soilLod(drop.xy));
  float lasts = 0.085 + 0.06 * size;
  float x = t / lasts;
  vec3 at;
  vec3 n;
  if (part.x < 0.5) {
    if (x >= 1.0 && (onWater < 0.6 || size < 0.42 || x >= ${JET_ENDS.toFixed(2)})) return;
    float th = part.y * TAU;
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
    if (grit && (hc < onWater + 0.15 || size < 0.3)) return;
    float teeth = 8.0 + floor(7.0 * seed);
    float count = grit ? ${GRIT.toFixed(1)} : ${BEADS.toFixed(1)};
    float th = TAU * (floor((part.y + ha) / count * teeth) + 0.5 - seed * 7.0) / teeth;
    float leaves = grit ? 0.08 + 0.2 * hb : 0.18 + 0.35 * hb;
    float radius = (grit ? 0.0004 + 0.0009 * hc : 0.0003 + 0.0008 * hc * hc) * (0.6 + 0.4 * size);
    vec3 from = cup(th, grit ? 0.3 : 1.0, min(x, leaves), size, onWater, seed);
    float flown = max(x - leaves, 0.0) * lasts;
    float pitch = grit ? 0.45 + 0.5 * ha : 0.8 + 0.55 * ha;
    float speed = (grit ? 0.35 + 0.5 * hc : 0.45 + 0.75 * hb) * (0.55 + 0.45 * size);
    vec3 way = vec3(cos(th) * cos(pitch), sin(pitch), sin(th) * cos(pitch));
    vec3 center = from + way * speed * flown - vec3(0.0, 0.5 * G * flown * flown, 0.0);
    vec2 over = drop.xy + center.xz;
    float floorM = max(soilHeight(over, soilLod(over)), uLevel.x - 1.0 + step(0.0, waterDepth(over))) - base;
    if (flown > 0.0 && center.y < floorM - radius) return;
    vec3 shape = grit ? position * (0.7 + 0.6 * vec3(ha, hb, hc)) : position;
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
${skyMirror}
vec3 seen(vec3 d) {
  return mix(uGroundBounce * 0.3, skyMirror(normalize(vec3(d.x, abs(d.y), d.z)), 0.0), smoothstep(-0.08, 0.03, d.y));
}
void main() {
  vec3 v = normalize(uCamPos - vWorld);
  vec3 n = normalize(vNormal);
  n = dot(n, v) < 0.0 ? -n : n;
  vec3 color;
  float alpha = 1.0;
  if (vKind > 1.5) {
    color = vec3(0.035, 0.03, 0.026) * skyAmbient(n) + seen(reflect(-v, n)) * 0.03;
  } else {
    float facing = max(dot(n, v), 0.0);
    if (vKind > 0.5) {
      float mirror = 0.03 + 0.97 * pow(1.0 - facing, 5.0);
      float lens = 0.6 * smoothstep(0.3, 0.9, facing);
      alpha = saturate(mirror + lens + 0.06);
      color = (seen(reflect(-v, n)) * mirror + seen(refract(-v, n, 0.75)) * lens) / alpha;
    } else {
      float mirror = 0.04 + 0.96 * pow(1.0 - facing, 4.0);
      vec3 through = mix(seen(refract(-v, n, 0.75)), vec3(0.007, 0.006, 0.005) * skyAmbient(n), vMud);
      alpha = mirror + (1.0 - mirror) * mix(0.6, 0.95, max(smoothstep(0.88, 1.0, vTop) * (1.0 - vMud), vMud * (1.0 - 0.7 * vTop)));
      color = mix(through, seen(reflect(-v, n)), mirror);
    }
  }
  outColor = vec4(finish(color, vWorld, vDepth, -1.0).rgb, alpha);
}
`

// The shape every splash is drawn from: a cup as a sheet round its drop, then beads and grit as small balls.
export function crownGeometry(drops: Float32Array, floats: number): { geometry: THREE.InstancedBufferGeometry; drop: THREE.InstancedBufferAttribute } {
  const ball = new THREE.IcosahedronGeometry(1, 0)
  const ballAt = ball.getAttribute('position')
  const lump = new THREE.OctahedronGeometry(1, 0)
  const lumpAt = lump.getAttribute('position')
  const cupVerts = (AROUND + 1) * UP.length
  const total = cupVerts + BEADS * ballAt.count + GRIT * lumpAt.count
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
  const balls = (kind: number, count: number, at: THREE.BufferAttribute | THREE.InterleavedBufferAttribute): void => {
    for (let b = 0; b < count; b++) {
      for (let i = 0; i < at.count; i++) {
        position.set([at.getX(i), at.getY(i), at.getZ(i)], v * 3)
        part.set([kind, b, 0], v * 3)
        if (i % 3 === 0) index.push(v, v + 1, v + 2)
        v++
      }
    }
  }
  balls(1, BEADS, ballAt)
  balls(2, GRIT, lumpAt)
  const geometry = new THREE.InstancedBufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(position, 3))
  geometry.setAttribute('part', new THREE.BufferAttribute(part, 3))
  geometry.setIndex(index)
  const drop = new THREE.InstancedBufferAttribute(drops, floats)
  drop.setUsage(THREE.DynamicDrawUsage)
  geometry.setAttribute('drop', drop)
  geometry.instanceCount = 0
  ball.dispose()
  lump.dispose()
  return { geometry, drop }
}
