import * as THREE from 'three'

// What every surface of the far land shares: its own place in the depth buffer, the air between it and the lens, and the weather on it.
export const FAR_FROM_M = 350
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
  uAirToSun: { value: 1 },
  // How much of the air is rain: it takes the color of the rain's own veil.
  uAirRain: { value: 0 },
  // Mist that lies on the low land: per meter at the foot, and how high it stands.
  uMist: { value: 0 },
  uMistTopM: { value: 12 },
  // The share of the shared ground fog that the land away from the field takes.
  uFogShare: { value: 1 },
  uFogNear: { value: 0 },
  // How much of the ground fog lies low: the share of it that the high land stands clear of.
  uFogLow: { value: 0 },
  // How much fog stands between the sun and the far land: its hills are lit by the sky alone and fade toward the sky above them.
  uVeil: { value: 0 },
  // The last light of the evening, sun at the horizon and under it: the day's haze has sunk to the low land and the high land stands dark against the sky.
  uDusk: { value: 0 },
  // How much the light shines through leaves toward the lens: all of it for the sun, little for the moon.
  uThrough: { value: 1 },
  uTrueSun: { value: new THREE.Vector3(0, 1, 0) },
  uLandWet: { value: 0 },
  uLandFrost: { value: 0 },
  uLandCrop: { value: new THREE.Vector3(0.03, 0.052, 0.018) },
  uLandWind: { value: 0 },
}

export const airGlsl = /* glsl */ `
uniform float uAir;
uniform float uAirToSun;
uniform float uAirRain;
uniform float uMist;
uniform float uMistTopM;
uniform float uFogShare;
uniform float uFogNear;
uniform float uFogLow;
uniform float uVeil;
uniform float uDusk;
uniform float uThrough;
uniform vec3 uTrueSun;
uniform float uLandWet;
uniform float uLandFrost;
uniform vec3 uLandCrop;

// The sky that lies behind the land in the direction of a point.
vec3 skyBehind(vec3 dir) {
  vec2 h = normalize(dir.xz + vec2(1e-6));
  vec2 s = normalize(uTrueSun.xz + vec2(1e-6));
  // At dusk the air before the high land lies in that land's shadow: the sky lights it from above, not the sun from behind.
  float toSun = pow(saturate(0.5 + 0.5 * dot(h, s)), 12.0) * uAirToSun * (1.0 - 0.9 * uDusk);
  float up = saturate(dir.y / (length(dir) * mix(0.07, 0.03, uVeil)));
  vec3 clear = mix(mix(uAirHorizon, uAirZenith, max(mix(0.6, 1.0, uVeil) * up, uDusk)), uSkyHorizonSun, toSun * (1.0 - 0.7 * uVeil * up));
  return mix(clear, uFogColor + uFogSunTint * toSun, uAirRain);
}

// At dusk the faces of the high land look at the dark land before them, not at the band of light on the horizon: the dome lights them from above.
vec3 landAmbient(vec3 n, vec3 worldPos) {
  return skyAmbient(normalize(mix(n, vec3(0.0, 1.0, 0.0), uDusk * smoothstep(2.0, 16.0, worldPos.y))));
}

float sunOnLand(vec3 worldPos) {
  return 1.0 - 0.85 * uVeil * smoothstep(300.0, 1400.0, length(worldPos.xz - uCamPos.xz));
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
  // The lens takes a blur circle within a third of a percent of the circle of infinity for sky and leaves it sharp: the land stays just short of that.
  vec4 done = finish(aired, worldPos, min(viewDepth, uFocusM / 0.0036), -1.0);
  if (uDiag == 0) {
    float r = length(worldPos.xz);
    // The field's far crop stands in the ground fog to its end, and the land past it takes the same.
    float near = mix(smoothstep(150.0, 290.0, r), 1.0, uFogNear);
    float high = 1.0 - exp(-max(worldPos.y, 0.0) / 30.0);
    done.rgb = mix(aired, done.rgb, near * mix(1.0, uFogShare, smoothstep(80.0, 320.0, r)) * (1.0 - max(uFogLow * high, 0.85 * uDusk * smoothstep(2.0, 16.0, worldPos.y))));
  }
  return done;
}
`
