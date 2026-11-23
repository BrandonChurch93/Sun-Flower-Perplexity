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
  // How much of the air is rain: it takes the color of the rain's own veil.
  uAirRain: { value: 0 },
  // Mist that lies on the low land: per meter at the foot, and how high it stands.
  uMist: { value: 0 },
  uMistTopM: { value: 12 },
  // The share of the shared ground fog that the land away from the field takes.
  uFogShare: { value: 1 },
  uTrueSun: { value: new THREE.Vector3(0, 1, 0) },
  uLandWet: { value: 0 },
  uLandFrost: { value: 0 },
  uLandWind: { value: 0 },
  uFlashDir: { value: new THREE.Vector3(0, 1, 0) },
  uFlash: { value: new THREE.Vector3(0, 0, 0) },
}

export const airGlsl = /* glsl */ `
uniform float uAir;
uniform float uAirSun;
uniform float uAirRain;
uniform float uMist;
uniform float uMistTopM;
uniform float uFogShare;
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
  vec3 clear = mix(uSkyHorizon, uSkyHorizonSun, toSun);
  return mix(clear, uFogColor + uFogSunTint * toSun, uAirRain);
}

vec3 throughAir(vec3 color, vec3 worldPos) {
  vec3 v = worldPos - uCamPos;
  float d = length(v);
  float k = v.y / uMistTopM;
  float low = exp(-max(uCamPos.y, 0.0) / uMistTopM);
  float mist = uMist * low * d * (abs(k) > 1e-3 ? (1.0 - exp(-k)) / k : 1.0);
  float f = 1.0 - exp(-d * uAir - mist);
  return mix(color, skyBehind(v), f);
}

// The land's last step: its own air, then the shared ground fog and the blur circle. Away from the field the land takes only a share of the ground fog.
vec4 landFinish(vec3 color, vec3 worldPos, float viewDepth) {
  vec3 aired = throughAir(color, worldPos);
  vec4 done = finish(aired, worldPos, viewDepth, -1.0);
  if (uDiag == 0) done.rgb = mix(aired, done.rgb, mix(1.0, uFogShare, smoothstep(80.0, 320.0, length(worldPos.xz))));
  return done;
}

vec3 flashLight(vec3 n) {
  return uFlash * (0.4 + 0.6 * max(dot(n, uFlashDir), 0.0));
}
`
