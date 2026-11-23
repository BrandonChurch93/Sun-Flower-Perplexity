import * as THREE from 'three'

// Over soil in heavy rain the spray of every landing hangs a hand high and greys the foot of everything behind it. A lens a hand over the soil sees it only at a distance, through its depth: the banks stand in rows behind the plant, each row further off than the last, in a fan about the line from the lens to the plant, the same to its left and to its right.
const ROWS = 14
const ACROSS = 6
const BANKS = ROWS * ACROSS
const HIGH_M = 0.16
const ROW_STEP = 1.17
const FAN_RAD = 0.75
const WIDE = 0.3
// No bank stands nearer the lens than this, nor nearer than a step behind the plant: a bank over the near soil lies on it as a grey sheet, and one before the plant greys its foot.
export const HAZE_FROM_M = 1.9
export const HAZE_BEHIND_M = 0.3
// From its near edge the spray comes in over this depth, and the first row stands in the middle of it.
const COMES_IN_M = 0.2
// The rows past the first few stand behind one another in the frame, so each carries a small share: the far rows stay green through them.
const THINS_OVER_M = 0.7
const THIN = 0.08

export const hazeVertex = /* glsl */ `
in vec2 position;
uniform vec3 uHazeAt;
out vec2 vAt;
out float vSeed;
out vec3 vWorld;
void main() {
  float id = float(gl_InstanceID);
  vSeed = hash11(id * 3.17 + 0.4);
  float row = floor((id + 0.5) / ${ACROSS.toFixed(1)});
  float col = id - row * ${ACROSS.toFixed(1)};
  float off = (uHazeAt.z + ${(0.5 * COMES_IN_M).toFixed(2)}) * pow(${ROW_STEP.toFixed(2)}, row + 0.6 * (hash11(id * 7.31 + 1.7) - 0.5));
  // Every other row stands half a place aside, so no gap runs through the rows.
  float place = col + 0.25 + 0.5 * mod(row, 2.0) + 0.5 * (hash11(id * 5.13 + 9.2) - 0.5);
  float turn = (place / ${ACROSS.toFixed(1)} - 0.5) * ${(2 * FAN_RAD).toFixed(3)};
  vec2 toward = -uHazeAt.xy / max(length(uHazeAt.xy), 1e-3);
  vec2 dir = toward * cos(turn) + vec2(-toward.y, toward.x) * sin(turn);
  vec3 foot = vec3(uHazeAt.x + dir.x * off, 0.0, uHazeAt.y + dir.y * off);
  vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
  float wide = ${WIDE.toFixed(2)} * off * (0.8 + 0.4 * vSeed);
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
uniform vec3 uHazeAt;
uniform vec3 uHazeFlash;
uniform vec3 uHazeFlashAt;
uniform float uHazeStrike;
void main() {
  if (uDiag > 1) discard;
  float high = vAt.y * 0.5 + 0.5;
  float drift = uReal * (0.25 + 0.2 * vSeed);
  float puff = valueNoise(vec2(vAt.x * 3.0 + drift + vSeed * 31.0, high * 2.0 - uReal * 0.9 + vSeed * 7.0));
  float side = 1.0 - vAt.x * vAt.x;
  float body = side * side * (1.0 - high) * (1.0 - high) * smoothstep(0.0, 0.3, high);
  float off = distance(uCamPos, vWorld);
  float near = smoothstep(uHazeAt.z, uHazeAt.z + ${COMES_IN_M.toFixed(2)}, off) * mix(1.0, ${THIN.toFixed(2)}, smoothstep(uHazeAt.z + ${COMES_IN_M.toFixed(2)}, uHazeAt.z + ${(COMES_IN_M + THINS_OVER_M).toFixed(2)}, off));
  float cover = uHaze * body * (0.35 + 0.65 * puff) * near;
  if (cover < 0.003) discard;
  vec3 ray = normalize(vWorld - uCamPos);
  float toSun = saturate(dot(ray, uSunDir));
  float t4 = toSun * toSun * toSun * toSun;
  // A strike lights the spray on its own side and near at hand, and leaves the rest of it dark over the soil.
  float toStrike = max(dot(normalize(ray.xz + vec2(1e-5, 0.0)), normalize(uHazeFlashAt.xz + vec2(1e-5))), 0.0);
  float t2 = toStrike * toStrike;
  float reach = t2 * t2 * t2 * t2 * mix(1.0, 0.3, smoothstep(1.5, 6.0, distance(uCamPos, vWorld)));
  vec3 light = (0.4 * uAirHorizon + 0.25 * uAirZenith + 0.15 * uSkyHorizonSun + uAirSun * (0.006 + 0.1 * t4)) * mix(1.0, 0.06 + 0.94 * reach, uHazeStrike) + uHazeFlash * reach;
  outColor = vec4(applyFog(light, vWorld), cover);
}
`

export function hazeGeometry(): THREE.InstancedBufferGeometry {
  const geometry = new THREE.InstancedBufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), 2))
  geometry.setIndex([0, 1, 2, 2, 1, 3])
  // The renderer asks every mesh for a sphere to sort it by and cannot make one from a position of two numbers.
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1)
  geometry.instanceCount = BANKS
  return geometry
}

export const HAZE_BANKS = BANKS
