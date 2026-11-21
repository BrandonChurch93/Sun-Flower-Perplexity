import * as THREE from 'three'
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { config } from '../config.ts'
import { stream } from '../core/random.ts'
import { cropLight } from './light.ts'
import { groundStates, soilHeight } from './soil.ts'

// Loose soil on the near ground: crumbs a few millimeters across, a share of them stones, and clods up to a few centimeters.
// `beside` is the share of a scatter laid in a band across the way to the camera at the plant's own distance, where the dawn lens is sharp.
export interface Scatter { count: number; detail: number; minM: number; maxM: number; skew: number; innerM: number; outerM: number; spread: number; stones: number; sink: number; beside?: number }
export const crumbScatter: Scatter = { count: 5000, detail: 1, minM: 0.001, maxM: 0.0045, skew: 2.2, innerM: 0.008, outerM: 0.9, spread: 1.7, stones: 0.03, sink: 0.38 }
export const clodScatter: Scatter = { count: 220, detail: 3, minM: 0.005, maxM: 0.016, skew: 1.8, innerM: 0.03, outerM: 0.9, spread: 1.3, stones: 0.04, sink: 0.3 }
export const lumpScatter: Scatter = { count: 80, detail: 5, minM: 0.004, maxM: 0.015, skew: 1.5, innerM: 0.016, outerM: 0.14, spread: 1.9, stones: 0, sink: 0.42, beside: 0.45 }

// The way to the camera of the dawn shots, which stays low over the soil: nothing in it stands taller than a crumb.
const LANE = (config.camera.keys[0].azimuthDeg * Math.PI) / 180
export const laneDir = { x: Math.sin(LANE), z: Math.cos(LANE) }
const LANE_CRUMB_M = 0.0022

export function lane(x: number, z: number, padM = 0): number {
  const along = x * laneDir.x + z * laneDir.z
  const across = Math.max(0, Math.abs(x * laneDir.z - z * laneDir.x) - padM)
  const step = (a: number, b: number, v: number): number => Math.min(1, Math.max(0, (v - a) / (b - a)))
  return (1 - step(0.012 + 0.1 * along, 0.03 + 0.22 * along, across)) * step(0, 0.03, along)
}

export function scatter(name: string, s: Scatter): THREE.InstancedMesh {
  const ball = new THREE.IcosahedronGeometry(1, s.detail)
  ball.deleteAttribute('normal')
  ball.deleteAttribute('uv')
  const geometry = mergeVertices(ball, 1e-4)
  const random = stream(name)
  const mesh = new THREE.InstancedMesh(geometry, undefined, s.count)
  const seed = new Float32Array(s.count * 4)
  const matrix = new THREE.Matrix4()
  const turn = new THREE.Quaternion()
  const axis = new THREE.Vector3()
  const size = new THREE.Vector3()
  const at = new THREE.Vector3()
  for (let i = 0; i < s.count; i++) {
    let r = s.innerM + (s.outerM - s.innerM) * Math.pow(random.next(), s.spread)
    let a = random.next() * Math.PI * 2
    if (s.beside !== undefined && random.next() < s.beside) {
      const across = (random.next() < 0.5 ? -1 : 1) * (0.012 + 0.09 * Math.pow(random.next(), 1.3))
      const along = -0.004 + 0.03 * (random.next() - 0.5)
      const x = along * laneDir.x + across * laneDir.z
      const z = along * laneDir.z - across * laneDir.x
      r = Math.hypot(x, z)
      a = Math.atan2(z, x)
    }
    const open = 1 - lane(Math.cos(a) * r, Math.sin(a) * r, 0.8 * s.maxM)
    const radius = Math.min(s.minM + (s.maxM - s.minM) * Math.pow(random.next(), s.skew), LANE_CRUMB_M + (s.maxM - LANE_CRUMB_M) * open)
    axis.set(random.next() - 0.5, random.next() - 0.5, random.next() - 0.5).normalize()
    turn.setFromAxisAngle(axis, random.next() * Math.PI * 2)
    size.set(radius * (0.7 + 0.7 * random.next()), radius * (0.45 + 0.4 * random.next()), radius * (0.7 + 0.7 * random.next()))
    at.set(Math.cos(a) * r, radius * (0.55 - s.sink), Math.sin(a) * r)
    matrix.compose(at, turn, size)
    mesh.setMatrixAt(i, matrix)
    seed[i * 4] = random.next() * 97
    seed[i * 4 + 1] = random.next()
    seed[i * 4 + 2] = random.next() < s.stones ? 1 : 0
    seed[i * 4 + 3] = radius
  }
  geometry.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seed, 4))
  mesh.boundingSphere = new THREE.Sphere(new THREE.Vector3(), s.outerM + 0.1)
  return mesh
}

export const crumbVertex = /* glsl */ `
in vec3 position;
in mat4 instanceMatrix;
in vec4 aSeed;
out vec3 vWorld;
out float vDepth;
out vec3 vBall;
out vec3 vNormal;
out vec4 vSeed;
${soilHeight}
float grain3(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  vec2 e = vec2(0.0, 1.0);
  return mix(
    mix(mix(hash31(i), hash31(i + e.yxx), f.x), mix(hash31(i + e.xyx), hash31(i + e.yyx), f.x), f.y),
    mix(mix(hash31(i + e.xxy), hash31(i + e.yxy), f.x), mix(hash31(i + e.xyy), hash31(i + e.yyy), f.x), f.y), f.z);
}
float lumpAt(vec3 d) {
  vec3 q = d * 2.3 + aSeed.x;
  float knob = 0.5 + 0.2 * sin(q.x + 1.7 * sin(q.z)) + 0.17 * sin(q.y * 1.3 + 1.9 * sin(q.x)) + 0.13 * sin(q.z * 1.9 + q.y);
  float rough = 0.4 * grain3(d * 2.9 + aSeed.x) + 0.34 * (1.0 - abs(2.0 * grain3(d * 5.3 + aSeed.x * 1.7) - 1.0)) + 0.2 * grain3(d * 14.0 + aSeed.x * 2.3) + 0.13 * grain3(d * 31.0 + aSeed.x * 3.1);
  return 0.5 + mix(0.5, 0.14, aSeed.z) * knob + mix(0.55, 0.06, aSeed.z) * (rough - 0.5);
}
void main() {
  mat4 place = modelMatrix * instanceMatrix;
  vec2 c = place[3].xz;
  float seen = aSeed.w * projectionMatrix[1][1] * uSize.y / max((projectionMatrix * viewMatrix * place[3]).w, 1e-4);
  float keep = smoothstep(0.35, 0.8, seen) * nearFade(c * 1.04);
  vSeed = aSeed;
  if (keep <= 0.0) {
    vWorld = place[3].xyz;
    vDepth = 1.0;
    vBall = vec3(0.0, 1.0, 0.0);
    vNormal = vBall;
    gl_Position = vec4(0.0, 0.0, 2.0, 1.0);
    return;
  }
  float lump = lumpAt(position);
  vec3 t1 = normalize(cross(position, vec3(0.31, 0.83, 0.46)));
  vec3 t2 = cross(position, t1);
  vec3 d1 = normalize(position + t1 * 0.07);
  vec3 d2 = normalize(position + t2 * 0.07);
  vec3 smoothN = normalize(cross(d1 * lumpAt(d1) - position * lump, d2 * lumpAt(d2) - position * lump));
  float r = length(c);
  vec2 out2 = c / max(r, 1e-4);
  float start = 0.2 + 1.5 * hash11(aSeed.x);
  float go = smoothstep(start, start + 0.9, uTime) * (1.0 - smoothstep(uEmerge.z * 0.7, uEmerge.z * 1.7, r));
  float angle = go * (1.0 + 2.6 * hash11(aSeed.x + 5.0));
  vec3 axis = vec3(out2.y, 0.0, -out2.x);
  vec3 rel = mat3(place) * (position * lump * keep);
  vec3 ball = mat3(place) * position;
  mat3 m = mat3(place);
  vec3 normal = m * (smoothN / vec3(dot(m[0], m[0]), dot(m[1], m[1]), dot(m[2], m[2])));
  rel = rel * cos(angle) + cross(axis, rel) * sin(angle) + axis * dot(axis, rel) * (1.0 - cos(angle));
  ball = ball * cos(angle) + cross(axis, ball) * sin(angle) + axis * dot(axis, ball) * (1.0 - cos(angle));
  normal = normal * cos(angle) + cross(axis, normal) * sin(angle) + axis * dot(axis, normal) * (1.0 - cos(angle));
  c += out2 * go * (0.003 + 0.007 * hash11(aSeed.x + 9.0));
  vec4 world = vec4(c.x + rel.x, place[3].y + soilHeight(c, soilLod(c)) + rel.y, c.y + rel.z, 1.0);
  vec4 view = viewMatrix * world;
  vWorld = world.xyz;
  vDepth = -view.z;
  vBall = normalize(ball);
  vNormal = normalize(normal);
  gl_Position = projectionMatrix * view;
}
`

export const crumbFragment = /* glsl */ `
in vec3 vWorld;
in float vDepth;
in vec3 vBall;
in vec3 vNormal;
in vec4 vSeed;
uniform sampler2D tColor;
uniform sampler2D tData;
uniform vec2 uColorSize;
uniform vec3 uTiles;
uniform vec2 uScales;
uniform float uWet;
uniform float uFrost;
uniform float uDew;
uniform vec2 uToward;
${groundStates}
${cropLight}
const mat2 TURN_K = mat2(0.616, 0.788, -0.788, 0.616);
void main() {
  vec3 v = normalize(uCamPos - vWorld);
  vec3 face = normalize(cross(dFdx(vWorld), dFdy(vWorld)));
  face *= sign(dot(face, v) + 1e-6);
  vec3 side = abs(face);
  vec2 lay = side.y > 0.62 ? vWorld.xz : (side.x > side.z ? vWorld.zy : vWorld.xy);
  vec2 uv = TURN_K * lay * (uTiles.x * uScales.x) + vec2(vSeed.x * 0.37, vSeed.x * 0.61);
  vec4 cD = texture(tColor, uv);
  vec4 dD = texture(tData, uv);
  vec4 grit = texture(tData, TURN_K * uv * 3.3 + vec2(0.17, 0.59));
  vec2 g = dD.rg * 2.0 - 1.0 + (grit.rg * 2.0 - 1.0) * TURN_K * 0.9;
  vec3 n = normalize(mix(face, normalize(vNormal), 0.85) + vec3(g.x, 0.0, g.y) * mix(1.1, 0.25, vSeed.z));
  vec3 albedo = cD.rgb * mix(0.62, 1.12, vSeed.y);
  float luma = dot(albedo, vec3(0.3, 0.6, 0.1));
  albedo = mix(albedo, (0.25 + 1.5 * luma) * mix(vec3(0.24, 0.22, 0.19), vec3(0.36, 0.29, 0.22), vSeed.y), vSeed.z);
  float damp = saturate(uWet + 0.6 * uDew) * mix(1.0, 0.6, vSeed.z);
  albedo = dampened(albedo, damp);
  albedo = mix(albedo, vec3(0.75, 0.8, 0.85), uFrost * smoothstep(0.1, 0.7, n.y) * smoothstep(0.35, 0.7, dD.a));

  vec2 p = vWorld.xz;
  float lit = sunShadow(vWorld, n, uShadowTexelM * 1.5) * cropLight(p, -dot(p, uToward));
  float open = (0.25 + 0.75 * saturate(0.5 + 0.5 * vBall.y)) * (0.15 + 1.15 * smoothstep(0.25, 0.8, dD.a)) * (0.45 + grit.a);
  vec3 color = albedo * (uSunColor * max(dot(n, uSunDir), 0.0) * lit + groundAmbient(n) * open * proud(vWorld.y));
  vec3 hv = normalize(v + uSunDir);
  float gloss = mix(sheen(uWet, uDew), 0.25 + 0.75 * damp, vSeed.z) * (1.3 - dD.b);
  color += uSunColor * pow(max(dot(n, hv), 0.0), mix(24.0, 160.0, uWet)) * gloss * glare(v, hv) * lit * selfShade() * mix(0.3, 1.0, uWet);
  color += groundAmbient(reflect(-v, n)) * selfShade() * (0.03 + pow(1.0 - max(dot(n, v), 0.0), 5.0)) * gloss * mix(0.35, 0.1, uWet) * open;
  color += uSunColor * sparkle(vWorld, v, normalize(mix(n, vNormal, 0.5))) * lit * gloss * 26.0;
  vec3 cell = vWorld * 650.0;
  float bead = step(0.9, hash31(floor(cell))) * smoothstep(0.34, 0.22, length(fract(cell) - 0.5)) * uDew * smoothstep(-0.1, 0.5, n.y) * (1.0 - smoothstep(0.25, 0.9, length(fwidth(cell))));
  color = mix(color, color * 0.6, bead) + bead * smoothstep(0.2, 0.05, length(fract(cell) - 0.5 + uSunDir * 0.12)) * (uSunColor * 2.0 * mix(0.2, 1.0, lit) + skyAmbient(vec3(0.0, 1.0, 0.0)) * 0.5);
  outColor = finish(color, vWorld, vDepth, texelDensity(uv, uColorSize));
}
`
