import * as THREE from 'three'

// What every surface of the far land shares: its own place in the depth buffer, the air between it and the lens, and the weather on it.
export const FAR_FROM_M = 110
export const FAR_TO_M = 6000

// Beyond FAR_FROM_M the land takes the depth range the ordinary projection leaves almost empty and spreads it evenly over the logarithm of the distance, always in front of the flat ground it lies on.
export const farDepth = /* glsl */ `
void farDepth(float d, float pull) {
  if (d > ${FAR_FROM_M.toFixed(1)}) {
    float z1 = -projectionMatrix[2][2] + projectionMatrix[3][2] / ${FAR_FROM_M.toFixed(1)};
    float z = z1 + (1.0 - z1) * (0.98 * log(d / ${FAR_FROM_M.toFixed(1)}) / ${Math.log(FAR_TO_M / FAR_FROM_M).toFixed(5)} - pull);
    gl_Position.z = max(z, z1) * gl_Position.w;
  }
}
`

export const airUniforms = {
  // Per meter: how fast the far land fades into the sky behind it.
  uAir: { value: 0.00006 },
  // The share of the sky toward the sun that the air takes on that side.
  uAirSun: { value: 1 },
  uTrueSun: { value: new THREE.Vector3(0, 1, 0) },
  uLandWet: { value: 0 },
  uLandFrost: { value: 0 },
  uFlashDir: { value: new THREE.Vector3(0, 1, 0) },
  uFlash: { value: new THREE.Vector3(0, 0, 0) },
}

export const airGlsl = /* glsl */ `
uniform float uAir;
uniform float uAirSun;
uniform vec3 uTrueSun;
uniform float uLandWet;
uniform float uLandFrost;
uniform vec3 uFlashDir;
uniform vec3 uFlash;

// The sky that lies behind the land in the direction of a point.
vec3 skyBehind(vec3 dir) {
  vec2 h = normalize(dir.xz + vec2(1e-6));
  vec2 s = normalize(uTrueSun.xz + vec2(1e-6));
  float toSun = pow(saturate(0.5 + 0.5 * dot(h, s)), 6.0) * uAirSun;
  return mix(uSkyHorizon, uSkyHorizonSun, toSun);
}

vec3 throughAir(vec3 color, vec3 worldPos) {
  vec3 v = worldPos - uCamPos;
  float d = length(v);
  float f = 1.0 - exp(-d * uAir);
  return mix(color, skyBehind(v), f);
}

vec3 flashLight(vec3 n) {
  return uFlash * (0.25 + 0.75 * max(dot(n, uFlashDir), 0.0));
}
`
