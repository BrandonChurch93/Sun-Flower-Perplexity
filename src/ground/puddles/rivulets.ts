import * as THREE from 'three'
import { stream } from '../../core/random.ts'
import { right, toward } from '../../field/layout.ts'
import { furrow } from '../soil.ts'
import { basin } from './basin.ts'
import { skyMirror } from './water.ts'

// A rivulet is a thread of water that runs downhill from where it starts, this many steps of this length, over ground smoothed by this many levels of its maps.
const THREADS = 260
const STEPS = 30
const STEP_M = 0.004
const SMOOTH_LODS = 1.5
// Half the width of a thread, how far from the furrow's water one starts, how fast its head runs and when after the rain begins it sets off.
const HALF_M = [0.0008, 0.002]
const FROM_SHORE_M = [0.012, 0.17]
const RUNS_M_S = 0.035
const SETS_OFF_S = [8.2, 11]

export const rivuletVertex = /* glsl */ `
in vec2 strip;
in vec4 thread;
uniform vec2 uSpan;
out vec3 vWorld;
out float vDepth;
out vec3 vAcross;
out vec3 vAt;
out float vFall;
${basin}
// The ground as the threads find it: smoothed, and with the furrow cut to its full depth, so that a thread keeps its course while the furrow deepens.
float lie(vec2 p, float lod) {
  float cut = mix(uFurrowTime.z, 1.0, smoothstep(uFurrowTime.x, uFurrowTime.y, uTime));
  return soilHeight(p, lod) + furrow(p) * nearFade(p) * (1.0 / cut - 1.0);
}
void main() {
  vec2 p = thread.xy;
  vec2 dir = vec2(0.0);
  float gone = 0.0;
  float falls = 0.0;
  float lod = soilLod(p) + ${SMOOTH_LODS.toFixed(1)};
  for (int i = 0; i < ${STEPS}; i++) {
    if (float(i) >= strip.x) break;
    float h = lie(p, lod);
    if (uLevel.x - h > 0.0005) break;
    vec2 fall = vec2(lie(p + vec2(0.003, 0.0), lod) - h, lie(p + vec2(0.0, 0.003), lod) - h) / 0.003;
    float steep = length(fall);
    if (steep < 0.02) break;
    dir = normalize(mix(dir, -fall / steep, 0.6));
    falls = -dot(fall, dir);
    p += dir * ${STEP_M.toFixed(4)};
    gone += ${STEP_M.toFixed(4)};
  }
  float seed = thread.z;
  float t = mix(uSpan.x, uSpan.y, uShutter);
  float reach = (t - mix(${SETS_OFF_S[0].toFixed(1)}, ${SETS_OFF_S[1].toFixed(1)}, fract(seed * 7.3))) * ${RUNS_M_S.toFixed(3)};
  float wide = thread.w * smoothstep(0.0, 0.012, gone) * (1.0 - smoothstep(reach - 0.012, reach, gone)) * (0.7 + 0.3 * sin(gone * 190.0 + seed * 50.0));
  vec2 across = dir == vec2(0.0) ? vec2(1.0, 0.0) : vec2(-dir.y, dir.x);
  vec2 place = p + across * strip.y * max(wide, 0.0);
  vec4 world = vec4(place.x, max(soilHeight(p, soilLod(p)), soilHeight(place, soilLod(place)) - 0.0006) + 0.0004, place.y, 1.0);
  vFall = falls;
  vec4 view = viewMatrix * world;
  vWorld = world.xyz;
  vDepth = -view.z;
  vAcross = vec3(across.x, 0.0, across.y);
  vAt = vec3(gone, strip.y, seed);
  gl_Position = projectionMatrix * view;
}
`

export const rivuletFragment = /* glsl */ `
in vec3 vWorld;
in float vDepth;
in vec3 vAcross;
in vec3 vAt;
in float vFall;
uniform vec2 uSpan;
${skyMirror}
void main() {
  vec3 along = vec3(vAcross.z, 0.0, -vAcross.x);
  vec3 flat_ = normalize(vec3(0.0, 1.0, 0.0) + along * min(vFall, 0.5));
  float t = mix(uSpan.x, uSpan.y, uShutter);
  float pulse = 0.1 * sin(vAt.x * 520.0 - t * 16.0 + vAt.z * 40.0) + 0.06 * sin(vAt.x * 1130.0 - t * 27.0 + vAt.z * 91.0);
  vec3 n = normalize(flat_ + vAcross * vAt.y * abs(vAt.y) * 0.5 + along * pulse);
  vec3 v = normalize(uCamPos - vWorld);
  float mirror = 0.02 + 0.98 * pow(1.0 - max(dot(n, v), 0.0), 5.0);
  vec3 r = reflect(-v, n);
  vec3 sky = mix(uGroundBounce * 0.25, skyMirror(normalize(vec3(r.x, abs(r.y), r.z)), 0.0), smoothstep(-0.06, 0.02, r.y));
  float edge = 1.0 - smoothstep(0.75, 1.0, abs(vAt.y));
  float alpha = edge * (mirror + 0.3 * (1.0 - mirror));
  if (alpha <= 0.003) discard;
  vec3 color = sky * mirror / (mirror + 0.3 * (1.0 - mirror));
  outColor = vec4(finish(color, vWorld, vDepth, -1.0).rgb, alpha);
}
`

// Half the width of the furrow's standing water at a place along it.
function halfAt(awayM: number): number {
  const { atM, halfM } = furrow
  let half = halfM[0]
  for (let i = 0; i < atM.length - 1; i++) {
    const k = Math.min(1, Math.max(0, (awayM - atM[i]) / (atM[i + 1] - atM[i])))
    half += k * (halfM[i + 1] - halfM[i])
  }
  return half
}

// Every thread as a strip of two edges, and where each one starts: on the banks along the furrow, at a seeded place.
export function rivuletGeometry(): THREE.InstancedBufferGeometry {
  const strip = new Float32Array((STEPS + 1) * 4)
  const index: number[] = []
  for (let k = 0; k <= STEPS; k++) {
    strip.set([k, -1, k, 1], k * 4)
    if (k < STEPS) index.push(k * 2, k * 2 + 1, k * 2 + 3, k * 2, k * 2 + 3, k * 2 + 2)
  }
  const random = stream('rivulets')
  const thread = new Float32Array(THREADS * 4)
  for (let i = 0; i < THREADS; i++) {
    const away = random.range(furrow.fromM + 0.03, furrow.toM - 0.05)
    const side = random.next() < 0.5 ? -1 : 1
    const across = furrow.slope * away - furrow.leftM + side * (halfAt(away) + random.range(FROM_SHORE_M[0], FROM_SHORE_M[1]))
    thread.set([right.x * across - toward.x * away, right.z * across - toward.z * away, random.next(), random.range(HALF_M[0], HALF_M[1])], i * 4)
  }
  const geometry = new THREE.InstancedBufferGeometry()
  geometry.setAttribute('strip', new THREE.BufferAttribute(strip, 2))
  geometry.setIndex(index)
  geometry.setAttribute('thread', new THREE.InstancedBufferAttribute(thread, 4))
  geometry.instanceCount = THREADS
  return geometry
}
