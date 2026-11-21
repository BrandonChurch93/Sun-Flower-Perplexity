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
const float FOG_LOW_SHARE = 0.45;
const float FOG_RING = 0.07;
const vec3 FOG_RING_TAKES = vec3(0.0, 0.05, 0.09);
vec3 fogLight(vec3 dir) {
  float toSun = saturate(dot(dir, uSunDir));
  float theta = acos(min(toSun, 1.0));
  float up = smoothstep(0.0, 0.3, asin(clamp(dir.y, 0.0, 1.0)));
  // The fog is thickest along the ground, so the sun's light through it is weakest and reddest there: uFogSunTint is what it is at eye level, where the far things fade into it.
  float through = mix(1.0, 1.0 / FOG_LOW_SHARE, up);
  vec3 color = mix(uFogColor, uFogHigh, up) + uFogSunTint * mix(vec3(1.0), vec3(1.0, 1.16, 1.35), up) * (through * pow(toSun, 6.0));
  // Close round the sun the glow is strong and less red, farther out it is the faint peach of the world's glow.
  vec3 near = vec3(4.2, 4.9, 8.9) * ((1.0 + 0.5 * uFogThin) * exp(-theta / (0.03 + 0.008 * uFogThin)));
  color += uFogGlow * (FOG_LOW_SHARE * through) * (near + exp(-theta / 0.12));
  // Between the disc and the wide glow the fog takes the blue out of the sun's light: the ring of peach round it.
  float ring = theta / FOG_RING;
  return color * (1.0 - FOG_RING_TAKES * (ring * ring * exp(2.0 - 2.0 * ring)));
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
float bankBroad(vec2 q, float y) {
  return valueNoise(vec2(q.x + 0.31 * q.y, 2.6 * y + 0.53 * q.y) / uScaleM + uLayer);
}
float bankFine(vec2 q, float y) {
  return valueNoise(vec2(q.x - 0.42 * q.y, 2.6 * y - 0.29 * q.y) * (2.3 / uScaleM) + 3.1 * uLayer);
}
vec2 alongWind(vec3 p) {
  return vec2(dot(p.xz, uToward), dot(p.xz, vec2(-uToward.y, uToward.x)));
}
void main() {
  if (uDiag > 1) discard;
  vec3 p = vWorld - vec3(uToward.x, 0.0, uToward.y) * (uSpeed * uNow);
  vec2 q = alongWind(p);
  float broad = bankBroad(q, p.y);
  float here = 0.65 * broad + 0.35 * bankFine(q, p.y);
  vec3 s = p + uSunDir * (0.3 * uScaleM);
  float lit = broad - bankBroad(alongWind(s), s.y);
  vec3 v = vWorld - uCamPos;
  float d = length(v);
  v /= d;
  float theta = acos(clamp(dot(v, uSunDir), -1.0, 1.0));
  // The sun's disc is drawn as the whole fog lets it through, so no bank covers it again. Late in the frost the banks thin round it.
  float thick = smoothstep(0.3, 0.72, here) * (1.0 - 0.5 * uFogThin * exp(-theta / 0.2)) * smoothstep(0.022, 0.06, theta);
  float edge = 1.0 - smoothstep(0.55, 1.0, vInfo.y / vInfo.z);
  float alpha = uAlpha * thick * edge * smoothstep(0.4, 1.4, d);
  outColor = vec4(fogLight(v) * (1.0 + 0.33 * lit), alpha);
}
`

interface Bank { radiusM: number; topM: number; scaleM: number; alpha: number; speed: number }

const BANKS: Bank[] = [
  { radiusM: 11, topM: 3.6, scaleM: 7, alpha: 0.16, speed: 0.08 },
  { radiusM: 16, topM: 4.6, scaleM: 10, alpha: 0.25, speed: 0.11 },
  { radiusM: 24, topM: 5.8, scaleM: 15, alpha: 0.35, speed: 0.1 },
  { radiusM: 36, topM: 7.4, scaleM: 22, alpha: 0.4, speed: 0.13 },
  { radiusM: 54, topM: 9.5, scaleM: 32, alpha: 0.45, speed: 0.12 },
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
