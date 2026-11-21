import * as THREE from 'three'
import { config } from '../../config.ts'
import { makeSurface } from '../../core/shading.ts'
import type { RGB, WorldDef } from '../../core/world.ts'
import { windToward } from '../../plant/wind.ts'
import { ringStrip } from '../skyline.ts'

// The light the fog sends toward the eye from a direction: the shared fog's own color at eye level, paler overhead, and the sun's glow through it. The sky, the banks and the far shapes all read it, so a thing that fades into the fog fades into the sky behind it.
export const fogLight = /* glsl */ `
uniform vec3 uFogHigh;
uniform vec3 uFogGlow;
uniform float uFogThin;
const float FOG_LOW_SHARE = 0.3;
vec3 fogLight(vec3 dir) {
  float toSun = saturate(dot(dir, uSunDir));
  float theta = acos(min(toSun, 1.0));
  float up = smoothstep(0.0, 0.3, asin(clamp(dir.y, 0.0, 1.0)));
  // The fog is thickest along the ground, so the sun's light through it is weakest there: uFogSunTint is what it is at eye level, where the far things fade into it.
  float through = mix(1.0, 1.0 / FOG_LOW_SHARE, up);
  vec3 color = mix(uFogColor, uFogHigh, up) + uFogSunTint * (through * pow(toSun, 6.0));
  float near = (2.2 + 1.2 * uFogThin) * exp(-theta / (0.05 + 0.012 * uFogThin));
  return color + uFogGlow * (FOG_LOW_SHARE * through) * (mix(vec3(1.0), vec3(1.0, 0.8, 0.7), exp(-theta / 0.1)) * near + exp(-theta / 0.17));
}
`

const vertex = /* glsl */ `
in vec3 position;
in vec3 aInfo;
out vec3 vWorld;
out vec3 vInfo;
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  vInfo = aInfo;
  gl_Position = projectionMatrix * (viewMatrix * world);
}
`

// One bank: a standing sheet of the drifting field of fog at its depth. Where the field is thick the sheet hides what stands behind it, and its side toward the sun is the paler one.
const fragment = /* glsl */ `
in vec3 vWorld;
in vec3 vInfo;
uniform float uNow;
uniform float uAlpha;
uniform float uScaleM;
uniform float uSpeed;
uniform float uLayer;
uniform vec2 uToward;
${fogLight}
float bankField(vec3 p) {
  vec2 q = vec2(dot(p.xz, uToward), dot(p.xz, vec2(-uToward.y, uToward.x)));
  vec2 a = vec2(q.x + 0.31 * q.y, 2.6 * p.y + 0.53 * q.y) / uScaleM;
  vec2 b = vec2(q.x - 0.42 * q.y, 2.6 * p.y - 0.29 * q.y) * (2.3 / uScaleM);
  return 0.65 * valueNoise(a + uLayer) + 0.35 * valueNoise(b + 3.1 * uLayer);
}
void main() {
  if (uDiag > 1) discard;
  vec3 p = vWorld - vec3(uToward.x, 0.0, uToward.y) * (uSpeed * uNow);
  float here = bankField(p);
  float sunward = bankField(p + uSunDir * (0.3 * uScaleM));
  vec3 v = vWorld - uCamPos;
  float d = length(v);
  v /= d;
  float clear = uFogThin * exp(-acos(clamp(dot(v, uSunDir), -1.0, 1.0)) / 0.2);
  float thick = smoothstep(0.3, 0.72, here) * (1.0 - 0.5 * clear);
  float edge = 1.0 - smoothstep(0.55, 1.0, vInfo.y / vInfo.z);
  float alpha = uAlpha * thick * edge * smoothstep(0.4, 1.4, d);
  outColor = vec4(fogLight(v) * (1.0 + 0.5 * (here - sunward)), alpha);
}
`

interface Bank { radiusM: number; topM: number; scaleM: number; alpha: number; speed: number }

const BANKS: Bank[] = [
  { radiusM: 2.4, topM: 5, scaleM: 2.2, alpha: 0.16, speed: 0.05 },
  { radiusM: 3.6, topM: 6, scaleM: 2.8, alpha: 0.2, speed: 0.07 },
  { radiusM: 5.2, topM: 7, scaleM: 3.6, alpha: 0.24, speed: 0.06 },
  { radiusM: 7.5, topM: 9, scaleM: 5, alpha: 0.26, speed: 0.09 },
  { radiusM: 11, topM: 11, scaleM: 7, alpha: 0.28, speed: 0.08 },
  { radiusM: 16, topM: 14, scaleM: 10, alpha: 0.3, speed: 0.11 },
  { radiusM: 24, topM: 18, scaleM: 15, alpha: 0.3, speed: 0.1 },
  { radiusM: 36, topM: 24, scaleM: 22, alpha: 0.32, speed: 0.13 },
  { radiusM: 54, topM: 32, scaleM: 32, alpha: 0.32, speed: 0.12 },
]

// The banks are see-through and hide what is behind them, so they are drawn far to near and before the hairs of the plant (20).
const BANK_ORDER = 10
const THIN_OVER_S = 3.5

const smooth = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

// How far the fog has thinned round the sun, 0 to 1: it starts late in the frost and is as far as it goes on the unit's last frame.
export function fogThinAt(time: number): number {
  const unit = config.segments.find((s) => s.world === 'frost')
  return unit ? smooth(unit.end - THIN_OVER_S, unit.end, time) : 0
}

export interface Fog {
  meshes: THREE.Mesh[]
  uniforms: { uFogHigh: THREE.IUniform<THREE.Vector3>; uFogGlow: THREE.IUniform<THREE.Vector3>; uFogThin: THREE.IUniform<number> }
  // The fog at a time of the film, in seconds: where the banks have drifted to and how far it has thinned round the sun.
  at(time: number): void
}

// `high` is the color of the fog overhead; at eye level it is the world's fog color, and the sun's glow through it is the world's sky glow.
export function makeFog(def: WorldDef, high: RGB): Fog {
  const uniforms = {
    uFogHigh: { value: new THREE.Vector3().fromArray(high) },
    uFogGlow: { value: new THREE.Vector3().fromArray(def.sky.glow) },
    uFogThin: { value: 0 },
  }
  const now = { value: 0 }
  const toward = { value: new THREE.Vector2(windToward.x, windToward.z) }
  const meshes = BANKS.map((bank, i) => {
    const geometry = ringStrip(96, () => ({ radius: bank.radiusM, top: bank.topM }))
    const surface = makeSurface({
      name: `fog bank ${i}`,
      vertex,
      fragment,
      uniforms: { ...uniforms, uNow: now, uToward: toward, uAlpha: { value: bank.alpha }, uScaleM: { value: bank.scaleM }, uSpeed: { value: bank.speed }, uLayer: { value: 7.3 * i + 2.9 } },
      side: THREE.DoubleSide,
      transparent: true,
      depthWrite: false,
    })
    const mesh = new THREE.Mesh(geometry, surface.main)
    mesh.frustumCulled = false
    mesh.matrixAutoUpdate = false
    mesh.renderOrder = BANK_ORDER + (BANKS.length - 1 - i)
    return mesh
  })
  return {
    meshes,
    uniforms,
    at(time) {
      now.value = time
      uniforms.uFogThin.value = fogThinAt(time)
    },
  }
}
