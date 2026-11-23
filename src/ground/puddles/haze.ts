import * as THREE from 'three'

// Over soil in heavy rain the spray of every landing hangs a hand high: a low bank of fine drops that greys the foot of everything behind it.
const BANKS = 28
const HIGH_M = 0.16

export const hazeVertex = /* glsl */ `
in vec2 position;
uniform vec3 uHazeAt;
out vec2 vAt;
out float vSeed;
out vec3 vWorld;
void main() {
  float id = float(gl_InstanceID);
  vSeed = hash11(id * 3.17 + 0.4);
  vec2 cell = vec2(hash11(id * 7.31 + 1.7), hash11(id * 5.13 + 9.2)) - 0.5;
  vec3 foot = vec3(uHazeAt.x + cell.x * uHazeAt.z * 2.0, 0.0, uHazeAt.y + cell.y * uHazeAt.z * 2.0);
  vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
  float wide = 0.5 + 0.5 * vSeed;
  vec3 world = foot + right * (position.x * wide) + vec3(0.0, (position.y * 0.5 + 0.5) * ${HIGH_M.toFixed(3)} * (1.0 + vSeed), 0.0);
  vAt = position;
  vWorld = world;
  gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
}
`

export const hazeFragment = /* glsl */ `
in vec2 vAt;
in float vSeed;
in vec3 vWorld;
uniform float uHaze;
uniform vec3 uHazeFlash;
void main() {
  if (uDiag > 1) discard;
  float high = vAt.y * 0.5 + 0.5;
  float drift = uReal * (0.25 + 0.2 * vSeed);
  float puff = valueNoise(vec2(vAt.x * 3.0 + drift + vSeed * 31.0, high * 2.0 - uReal * 0.9 + vSeed * 7.0));
  float side = 1.0 - vAt.x * vAt.x;
  float body = side * side * (1.0 - high) * (1.0 - high) * smoothstep(0.0, 0.3, high);
  float near = smoothstep(0.25, 0.7, distance(uCamPos, vWorld));
  float cover = uHaze * body * (0.35 + 0.65 * puff) * near;
  if (cover < 0.003) discard;
  vec3 ray = normalize(vWorld - uCamPos);
  float toSun = saturate(dot(ray, uSunDir));
  float t4 = toSun * toSun * toSun * toSun;
  vec3 light = 0.4 * uAirHorizon + 0.25 * uAirZenith + 0.15 * uSkyHorizonSun + uAirSun * (0.006 + 0.1 * t4) + uHazeFlash;
  outColor = vec4(applyFog(light, vWorld), cover);
}
`

export function hazeGeometry(): THREE.InstancedBufferGeometry {
  const geometry = new THREE.InstancedBufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), 2))
  geometry.setIndex([0, 1, 2, 2, 1, 3])
  geometry.instanceCount = BANKS
  return geometry
}

export const HAZE_BANKS = BANKS
