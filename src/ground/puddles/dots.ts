import * as THREE from 'three'
import { basin } from './basin.ts'

// How long the mark of a drop shows on dry soil before the soil has drunk it.
export const DOT_LIFE_S = 5

// The first drops on dry soil: each leaves a dark spot a few times its own width, ragged at the rim, that the soil drinks.
export const dotVertex = /* glsl */ `
in vec2 position;
in vec4 drop;
uniform vec2 uSpan;
uniform float uDry;
out vec2 vAt;
out float vSeed;
out float vShow;
out vec3 vWorld;
out float vDepth;
${basin}
void main() {
  float t = mix(uSpan.x, uSpan.y, uShutter) - drop.z;
  gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
  vAt = position;
  vSeed = hash21(drop.xy * 17.7 + 0.71);
  vShow = 0.0;
  vWorld = vec3(0.0);
  vDepth = 0.0;
  if (t <= 0.0 || t >= ${DOT_LIFE_S.toFixed(1)} || uDry <= 0.0) return;
  float ground = soilHeight(drop.xy, soilLod(drop.xy));
  if (waterDepthOver(ground, drop.xy) > 0.0) return;
  float wide = drop.w * (3.0 + 2.5 * vSeed) * (1.0 + 0.35 * smoothstep(0.0, 1.5, t));
  vec2 at = drop.xy + position * wide;
  vec4 world = vec4(at.x, soilHeight(at, soilLod(at)) + 0.0006, at.y, 1.0);
  vec4 view = viewMatrix * world;
  vShow = uDry * smoothstep(0.0, 0.02, t) * (1.0 - smoothstep(0.35 * ${DOT_LIFE_S.toFixed(1)}, ${DOT_LIFE_S.toFixed(1)}, t));
  vWorld = world.xyz;
  vDepth = -view.z;
  gl_Position = projectionMatrix * view;
}
`

export const dotFragment = /* glsl */ `
in vec2 vAt;
in float vSeed;
in float vShow;
in vec3 vWorld;
in float vDepth;
void main() {
  float a = atan(vAt.y, vAt.x + 1e-6);
  float rim = 0.78 + 0.14 * sin(a * 5.0 + vSeed * 40.0) + 0.08 * sin(a * 11.0 + vSeed * 91.0);
  float r = length(vAt);
  float spot = 1.0 - smoothstep(rim - 0.22, rim, r);
  if (spot * vShow < 0.01) discard;
  // Wet soil is the same soil with less light coming back from it, and a little of the sky on its face.
  vec3 color = vec3(0.012, 0.0095, 0.0075) * skyAmbient(vec3(0.0, 1.0, 0.0)) + uSkyHorizon * 0.004;
  outColor = vec4(finish(color, vWorld, vDepth, -1.0).rgb, 0.6 * spot * vShow);
}
`

export function dotGeometry(drops: Float32Array, floats: number): { geometry: THREE.InstancedBufferGeometry; drop: THREE.InstancedBufferAttribute } {
  const geometry = new THREE.InstancedBufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), 2))
  geometry.setIndex([0, 2, 1, 1, 2, 3])
  // The renderer asks every mesh for a sphere to sort it by and cannot make one from a position of two numbers.
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1)
  const drop = new THREE.InstancedBufferAttribute(drops, floats)
  drop.setUsage(THREE.DynamicDrawUsage)
  geometry.setAttribute('drop', drop)
  geometry.instanceCount = 0
  return { geometry, drop }
}
