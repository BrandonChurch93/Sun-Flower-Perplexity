import * as THREE from 'three'
import type { Assets } from '../../core/assets.ts'
import { FullscreenPass } from '../../core/fullscreen.ts'
import { glslCommon, shared } from '../../core/shading.ts'
import type { WorldDef } from '../../core/world.ts'

// The picture is 8 bit. The range of the real sky is carried here: the picture times a smooth gain that climbs toward the sun and the horizon, then the haze, the sun's aureole and its disc at true brightness.
const fragment = /* glsl */ `${glslCommon}
uniform mat4 uCamWorld;
uniform vec4 uProj;
uniform sampler2D tSky;
uniform sampler2D tLate;
uniform float uLate;
uniform float uTexelAngle;
uniform float uPixelAngle;
uniform vec3 uGlow;
uniform vec3 uDisc;
uniform float uGain;
uniform float uDrift;
uniform float uPale;
uniform float uHigh;
uniform float uSamples;
in vec2 vUv;
layout(location = 0) out vec4 outColor;

const float PI = 3.14159265358979;
const float SUN_RADIUS = 0.00465;

void main() {
  vec2 ndc = vUv * 2.0 - 1.0;
  vec3 dv = normalize(vec3((ndc.x + uProj.z) * uProj.x, (ndc.y + uProj.w) * uProj.y, -1.0));
  vec3 d = normalize(mat3(uCamWorld) * dv);
  float coc = min(uCocScale / uFocusM, 2048.0);
  float toSun = dot(d, uSunDir);
  float theta = acos(clamp(toSun, -1.0, 1.0));
  float el = asin(clamp(d.y, -1.0, 1.0));
  el += 0.012 * uHigh * smoothstep(0.0, 0.045, el);
  float turn = atan(uSunDir.x, uSunDir.z) - atan(d.x, d.z);
  vec2 uv = vec2(fract(0.5 + turn / (2.0 * PI) + uDrift), clamp(sqrt(max(el, 0.0) / (0.5 * PI)), 0.004, 0.996));
  // One lens sample stands for its share of the disc of confusion: the picture is read that wide, so the samples close into a smooth blur.
  float wide = max(1.0, 1.4 * coc / sqrt(uSamples));
  float lod = max(0.0, log2(wide * uPixelAngle / uTexelAngle));
  vec3 sky = textureLod(tSky, uv, lod).rgb;
  // The cloud's own light and dark are drawn out against its smooth mean, so its breaks and undersides survive the lens.
  float rim = 0.075 + 0.014 * smoothstep(0.62, 0.8, theta);
  float under = (1.0 - smoothstep(rim - 0.004, rim + 0.016, el)) * smoothstep(0.2, 0.5, theta);
  vec3 mean = textureLod(tSky, uv, lod + 4.5).rgb;
  sky = mix(sky, mean, 0.7 * uHigh);
  vec3 detail = sky - mean;
  detail = mix(vec3(dot(detail, vec3(0.3, 0.6, 0.1))), detail, 0.45);
  float shelf = smoothstep(rim, rim + 0.03, el) * smoothstep(0.2, 0.5, theta);
  sky = max(sky + detail * mix(-0.85 * smoothstep(0.2, 0.5, theta) * smoothstep(0.02, 0.05, el), 1.0, smoothstep(rim, rim + 0.03, el)), vec3(0.0));
  float low = exp(-max(el, 0.0) / 0.085);
  float lift = 1.0 + low * 0.3 * exp(-theta / 0.3) + 1.2 * exp(-theta / 0.05) + (0.3 + 0.7 * smoothstep(0.4, 0.75, theta)) * exp(-max(el, 0.0) / 0.05);
  // Bright sky bleaches: the picture's saturated orange goes to pale gold as it climbs.
  vec3 color = sky * uGain * lift * (1.0 + under * smoothstep(0.048, rim - 0.012, el));
  // The clear band holds its tone: only the sun and the glow close round it go to white.
  color *= mix(0.5, 1.3, smoothstep(0.1, 0.6, theta));
  color /= 1.0 + 0.45 * dot(color, vec3(0.3, 0.6, 0.1));
  float lum = dot(color, vec3(0.3, 0.6, 0.1));
  vec3 pale = mix(vec3(1.42, 0.94, 0.58), vec3(1.26, 0.98, 0.66), smoothstep(0.15, 0.8, theta));
  color = mix(color, lum * pale, 0.75 * smoothstep(0.15, 1.2, lum));
  color = mix(color, lum * vec3(0.9, 1.5, 1.62), 0.86 * max(shelf, 0.35 * smoothstep(0.03, 0.1, el) * smoothstep(0.18, 0.6, theta)) * (1.0 - smoothstep(0.35, 1.2, lum)));
  color *= mix(vec3(1.0), vec3(1.22, 0.93, 0.68), exp(-max(el, 0.0) / 0.12) * smoothstep(0.1, 0.6, lum) * (1.0 - 0.6 * smoothstep(0.35, 0.8, theta)));
  color *= 1.0 + vec3(0.12, 0.02, -0.06) * under * smoothstep(0.045, rim, el);
  float lit = dot(color, vec3(0.3, 0.6, 0.1));
  color = mix(color, lit * vec3(1.2, 0.95, 0.7), shelf * smoothstep(0.08, 0.4, lit)) / (1.0 + 5.5 * shelf * lit);
  vec2 deck = d.xz / (max(d.y, 0.0) + 0.12);
  // The deck lies in long lanes across the sun's bearing, so they run level over the horizon.
  vec2 bearing = normalize(uSunDir.xz);
  vec2 lane = vec2(dot(deck, bearing), dot(deck, vec2(-bearing.y, bearing.x)));
  float bands = smoothstep(0.28, 0.72, 0.5 * valueNoise(lane * vec2(3.6, 0.5) + 3.0) + 0.3 * valueNoise(lane * vec2(7.5, 1.1) + 7.0) + 0.2 * valueNoise(deck * 4.6 + 11.0));
  color *= 1.0 + 1.3 * (bands - 0.5) * smoothstep(0.075, 0.13, el);
  color += vec3(0.05, 0.03, 0.012) * (0.4 + 1.2 * bands) * shelf * (1.0 - smoothstep(0.11, 0.22, el));

  vec3 side = normalize(cross(uSunDir, vec3(0.0, 1.0, 0.0)));
  vec3 over = cross(side, uSunDir);
  float fan = atan(dot(d, over), dot(d, side));
  float rays = 0.65 * valueNoise(vec2(fan * 1.7, 3.7)) + 0.35 * valueNoise(vec2(fan * 4.6, 9.1));
  rays = smoothstep(0.3, 0.8, rays);
  // The cloud breaks each shaft along its length.
  rays = mix(0.45, rays, smoothstep(0.25, 0.7, 0.6 * valueNoise(vec2(fan * 2.3 + 5.0, theta * 7.0)) + 0.4 * valueNoise(deck * 2.1 + 17.0)));
  float reach = smoothstep(0.035, 0.14, theta) * exp(-theta / 0.3) * (1.0 - smoothstep(0.16, 0.34, theta)) * smoothstep(0.0, 0.07, el) * (0.55 + uPale);
  color *= 1.0 + 0.75 * (rays - 0.45) * reach;
  color += uGlow * (0.2 * (rays - 0.3) * reach);

  vec3 clear = textureLod(tLate, uv, lod).rgb;
  clear = mix(vec3(dot(clear, vec3(0.3, 0.6, 0.1))), clear, 0.55) * mix(vec3(1.16, 1.0, 0.9), vec3(1.2, 0.97, 0.8), exp(-theta / 0.4)) * uGain * (1.68 + 0.05 * exp(-theta / 0.3)) * (1.0 + vec3(0.38, 0.16, -0.04) * exp(-max(el, 0.0) / 0.05));
  clear /= 1.0 + 0.6 * dot(clear, vec3(0.3, 0.6, 0.1));
  color = mix(color, clear, uLate);

  float a = uFogDensity * exp(-uFogFalloff * max(uCamPos.y, 0.0));
  float depth = a / (uFogFalloff * max(d.y, 1e-4));
  color = mix(color, uFogColor + uFogSunTint * pow(saturate(toSun), 6.0), 1.0 - exp(-depth));

  color = mix(color, mix(vec3(0.08, 0.125, 0.14), vec3(0.42, 0.33, 0.25), exp(-theta / 0.5)), uHigh * (1.0 - 0.7 * uLate) * (0.25 + 0.6 * exp(-theta / 0.5)) * exp(-max(el, 0.0) / 0.5));
  color += uGlow * (60.0 * exp(-theta / 0.008) + 2.0 * exp(-theta / 0.028)) + uGlow * vec3(1.0, 0.8, 0.6) * ((0.5 - 0.37 * uHigh) * exp(-theta / 0.1)) + mix(uGlow * vec3(1.0, 0.66, 0.4), vec3(0.5, 0.58, 0.56), smoothstep(0.2, 0.7, theta)) * ((0.45 - 0.37 * uHigh) * exp(-theta / 0.2)) * mix(1.0, 0.66 + 0.78 * rays, smoothstep(0.035, 0.14, theta) * smoothstep(0.0, 0.07, el) * (0.55 + uPale));
  color += uGlow * vec3(1.0, 0.74, 0.56) * ((0.39 - 0.37 * uPale) * (1.0 - 0.9 * uHigh) * exp(-theta * theta / 0.115) * smoothstep(0.06, 0.13, el));
  color += vec3(0.098, 0.17, 0.2) * (1.0 - 0.7 * uLate) * exp(-theta / 0.6) * smoothstep(0.0, 0.08, el) + vec3(0.0, 0.024, 0.036) * smoothstep(0.25, 0.6, theta) * smoothstep(0.06, 0.12, el);
  color = mix(color, vec3(dot(color, vec3(0.3, 0.6, 0.1))), max(0.7 * uPale, min(0.9, exp(-theta / 0.1) + uPale + 0.4 * smoothstep(0.4, 0.75, theta)) * exp(-max(el, 0.0) / 0.07)) * (1.0 - 0.6 * uLate) * smoothstep(0.015, 0.06, theta));
  float edge = 0.75 * uPixelAngle;
  color += uDisc * (1.0 - smoothstep(SUN_RADIUS - edge, SUN_RADIUS + edge, theta));

  float grey = dot(color, vec3(0.3, 0.6, 0.1));
  if (uDiag == 7) color = vec3(grey);
  if (uDiag == 4) { outColor = vec4(vec3(0.03), -1.0); return; }
  if (uDiag == 5) color = vec3(1.0e4);
  if (uDiag == 6) color = vec3(grey) * 0.5;
  // High sky is already as smooth as one lens sample is wide, so it asks little of the fill. Low sky asks in full, since the land and the field end against it.
  outColor = vec4(color, coc * mix(0.25, 1.0, max(1.0 - smoothstep(0.06, 0.13, el), 1.0 - smoothstep(0.03, 0.12, theta))));
}
`

export const SKY_FILE = 'sky.jpg'
export const LATE_SKY_FILE = 'sky-late.jpg'
const DRIFT_TURNS_PER_SECOND = 0.000012
const HAZE_FROM_S = 44
const HAZE_TO_S = 51
const THICK_FROM_S = 51.5
const THICK_TO_S = 57.5

// From 52 s the camera climbs out of the bloom: the heavy cloud gives way to the clear evening sky and the far land comes into its own.
const LATE_FROM_S = 52
const LATE_TO_S = 54.2

export function lateEvening(time: number): number {
  const t = Math.min(1, Math.max(0, (time - LATE_FROM_S) / (LATE_TO_S - LATE_FROM_S)))
  return t * t * (3 - 2 * t)
}

export function eveningHaze(time: number): number {
  const t = Math.min(1, Math.max(0, (time - THICK_FROM_S) / (THICK_TO_S - THICK_FROM_S)))
  return t * t * (3 - 2 * t)
}

export class GoldenSky {
  private readonly pass: FullscreenPass

  constructor(def: WorldDef) {
    this.pass = new FullscreenPass(fragment, {
      ...shared,
      uCamWorld: { value: new THREE.Matrix4() },
      uProj: { value: new THREE.Vector4() },
      tSky: { value: null },
      tLate: { value: null },
      uLate: { value: 0 },
      uTexelAngle: { value: 0.001 },
      uPixelAngle: { value: 0.001 },
      uGlow: { value: new THREE.Vector3().fromArray(def.sky.glow) },
      uDisc: { value: new THREE.Vector3().fromArray(def.sun.color).multiplyScalar(def.sky.disc) },
      uGain: { value: 1 },
      uDrift: { value: 0 },
      uPale: { value: 0 },
      uHigh: { value: 0 },
      uSamples: { value: 1 },
    })
  }

  async load(assets: Assets): Promise<void> {
    const map = await assets.texture('worlds/golden', SKY_FILE, { repeat: true })
    const u = this.pass.uniforms
    u.tSky.value = map
    u.tLate.value = await assets.texture('worlds/golden', LATE_SKY_FILE, { repeat: true })
    u.uTexelAngle.value = (2 * Math.PI) / (map.userData.size as { width: number }).width
  }

  prepare(time: number, gain: number, samples: number): void {
    const u = this.pass.uniforms
    u.uSamples.value = Math.max(1, samples)
    u.uDrift.value = time * DRIFT_TURNS_PER_SECOND
    const thin = Math.min(1, Math.max(0, (time - HAZE_FROM_S) / (HAZE_TO_S - HAZE_FROM_S)))
    u.uPale.value = 0.45 * (1 - thin * thin * (3 - 2 * thin))
    u.uGain.value = gain
    u.uHigh.value = eveningHaze(time)
    u.uLate.value = lateEvening(time)
  }

  render(renderer: THREE.WebGLRenderer, target: THREE.WebGLRenderTarget, camera: THREE.PerspectiveCamera, width: number): void {
    const u = this.pass.uniforms
    const e = camera.projectionMatrix.elements
    u.uCamWorld.value.copy(camera.matrixWorld)
    // The lens offset of the sample is in the projection, so the sky is put out of focus by the same samples as everything else.
    u.uProj.value.set(1 / e[0], 1 / e[5], e[8], e[9])
    u.uPixelAngle.value = 2 / (e[0] * width)
    this.pass.render(renderer, target)
  }
}
