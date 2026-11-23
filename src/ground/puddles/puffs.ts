import * as THREE from 'three'
import { basin } from './basin.ts'

// A drop that lands breaks part of itself into drops too fine to be seen one by one. For a few frames they stand over the place as a pale puff: at a film's shutter that is what a landing on dark soil shows of itself.
export const PUFF_LIFE_S = 0.22
const PLANT_CLEAR_M = [0.02, 0.06]
const LENS_CLEAR_M = [0.3, 0.6]

export const puffVertex = /* glsl */ `
in vec2 position;
in vec4 drop;
uniform vec2 uSpan;
out vec2 vAt;
out float vSeed;
out float vShow;
out float vOpen;
out vec3 vWorld;
${basin}
void main() {
  float t = mix(uSpan.x, uSpan.y, uShutter) - drop.z;
  gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
  vAt = position;
  vSeed = hash21(drop.xy * 31.7 + 0.19);
  vShow = 0.0;
  vOpen = 0.0;
  vWorld = vec3(0.0);
  float lasts = ${PUFF_LIFE_S.toFixed(2)} * (0.6 + 0.4 * vSeed);
  if (t <= 0.0 || t >= lasts || drop.w < 0.0005) return;
  float size = min(drop.w / 0.0022, 1.5);
  float ground = soilHeight(drop.xy, soilLod(drop.xy));
  float depth = waterDepthOver(ground, drop.xy);
  float base = depth > 0.0 ? uLevel.x : ground;
  float x = t / lasts;
  // It opens fast and then hangs.
  float wide = 0.024 * (0.45 + 0.55 * size) * (0.75 + 0.5 * fract(vSeed * 7.3));
  vOpen = 0.2 + 0.8 * sqrt(x);
  vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
  vec3 world = vec3(drop.x, base, drop.y) + right * (position.x * wide) + vec3(0.0, (position.y * 0.5 + 0.5) * wide, 0.0);
  float clear = smoothstep(${PLANT_CLEAR_M[0].toFixed(3)}, ${PLANT_CLEAR_M[1].toFixed(3)}, length(drop.xy)) * smoothstep(${LENS_CLEAR_M[0].toFixed(2)}, ${LENS_CLEAR_M[1].toFixed(2)}, distance(uCamPos, world));
  // On water the crown is the splash and the puff only the fine spray over it.
  vShow = clear * smoothstep(0.0, 0.08, x) * pow(1.0 - x, 1.5) * mix(1.0, 0.45, smoothstep(0.0, 0.006, depth)) * (0.4 + 0.6 * min(size, 1.0));
  vWorld = world;
  gl_Position = vShow > 0.0 ? projectionMatrix * viewMatrix * vec4(world, 1.0) : vec4(2.0, 2.0, 2.0, 1.0);
}
`

// How much of what stands behind a puff at its thickest it hides.
const COVER = 1.7

export const puffFragment = /* glsl */ `
in vec2 vAt;
in float vSeed;
in float vShow;
in float vOpen;
in vec3 vWorld;
uniform vec3 uHazeFlash;
uniform vec3 uHazeFlashAt;
uniform float uHazeStrike;
uniform vec3 uPuffLight;
void main() {
  if (uDiag > 1) discard;
  vec2 from = vec2(vAt.x, vAt.y * 0.5 + 0.5);
  float far = length(from);
  // What flies from a landing is drawn out by the shutter into a few short strokes that fan up and out from it, each of its own length, over a little mist at the foot.
  float turn = atan(from.x, from.y + 1e-4);
  float s = turn * 2.3 + vSeed * 17.0;
  float one = floor(s);
  float off = fract(s) - 0.5;
  float span = hash11(one * 7.7 + vSeed * 131.0);
  float lot = hash11(one * 3.3 + vSeed * 71.0);
  float runs = (0.35 + 0.65 * span) * vOpen;
  float tail = runs * (0.3 + 0.4 * lot);
  float stroke = exp(-off * off / 0.05) * smoothstep(tail - 0.1, tail, far) * (1.0 - smoothstep(runs - 0.12, runs, far)) * step(0.3, lot) * (1.0 - smoothstep(1.0, 1.35, abs(turn)));
  float mist = 0.3 * (1.0 - smoothstep(0.0, 0.2 + 0.4 * saturate(vOpen), length(vec2(from.x, from.y * 1.7))));
  float grain = valueNoise(vAt * 2.6 + vSeed * 57.0);
  float cover = min(0.85, ${COVER.toFixed(2)} * vShow * (stroke + mist * (0.5 + 0.5 * grain)));
  if (cover < 0.004) discard;
  vec3 ray = normalize(vWorld - uCamPos);
  float toSun = saturate(dot(ray, uSunDir));
  float t4 = toSun * toSun * toSun * toSun;
  float toStrike = max(dot(normalize(ray.xz + vec2(1e-5, 0.0)), normalize(uHazeFlashAt.xz + vec2(1e-5))), 0.0);
  float t2 = toStrike * toStrike;
  float reach = t2 * t2 * t2 * t2 * mix(1.0, 0.3, smoothstep(1.5, 6.0, distance(uCamPos, vWorld)));
  // Fine drops throw on the light that comes from behind them: over the soil the puff is the pale of the sky's foot.
  vec3 light = (0.9 * uPuffLight + 0.3 * uAirZenith + uAirSun * (0.01 + 0.5 * t4)) * mix(1.0, 0.06 + 0.94 * reach, uHazeStrike) + uHazeFlash * reach;
  outColor = vec4(applyFog(light, vWorld), cover);
}
`

// One sheet for every landing, turned to the lens. It reads the landings the crowns are drawn from.
export function puffGeometry(drop: THREE.InstancedBufferAttribute): THREE.InstancedBufferGeometry {
  const geometry = new THREE.InstancedBufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), 2))
  geometry.setIndex([0, 1, 2, 2, 1, 3])
  // The renderer asks every mesh for a sphere to sort it by and cannot make one from a position of two numbers.
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1)
  geometry.setAttribute('drop', drop)
  geometry.instanceCount = 0
  return geometry
}
