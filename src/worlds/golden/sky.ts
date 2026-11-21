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
uniform float uTexelAngle;
uniform float uPixelAngle;
uniform vec3 uGlow;
uniform vec3 uDisc;
uniform float uGain;
uniform float uDrift;
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
  float turn = atan(uSunDir.x, uSunDir.z) - atan(d.x, d.z);
  vec2 uv = vec2(fract(0.5 + turn / (2.0 * PI) + uDrift), clamp(sqrt(max(el, 0.0) / (0.5 * PI)), 0.004, 0.996));
  vec3 sky = textureLod(tSky, uv, max(0.0, log2(uPixelAngle / uTexelAngle))).rgb;
  float low = exp(-max(el, 0.0) / 0.085);
  float lift = 1.0 + low * 1.1 * exp(-theta / 0.3) + 1.8 * exp(-theta / 0.05) + 0.9 * exp(-max(el, 0.0) / 0.05);
  // Bright sky bleaches: the picture's saturated orange goes to pale gold as it climbs.
  vec3 color = sky * uGain * lift;
  float lum = dot(color, vec3(0.3, 0.6, 0.1));
  vec3 pale = mix(vec3(1.14, 1.0, 0.76), vec3(1.05, 1.0, 0.92), smoothstep(0.2, 0.9, theta));
  color = mix(color, lum * pale, 0.62 * smoothstep(0.15, 1.2, lum));
  color = mix(color, lum * vec3(0.74, 0.95, 1.32), 0.62 * smoothstep(0.03, 0.1, el) * smoothstep(0.2, 0.7, theta) * (1.0 - smoothstep(0.3, 1.2, lum)));

  vec3 side = normalize(cross(uSunDir, vec3(0.0, 1.0, 0.0)));
  vec3 over = cross(side, uSunDir);
  float fan = atan(dot(d, over), dot(d, side));
  float rays = 0.65 * valueNoise(vec2(fan * 4.3, 3.7)) + 0.35 * valueNoise(vec2(fan * 10.7, 9.1));
  rays = smoothstep(0.3, 0.8, rays);
  float reach = smoothstep(0.035, 0.14, theta) * exp(-theta / 0.24) * smoothstep(0.0, 0.07, el);
  color *= 1.0 + 0.3 * (rays - 0.4) * reach;
  color += uGlow * (0.07 * rays * reach);

  float a = uFogDensity * exp(-uFogFalloff * max(uCamPos.y, 0.0));
  float depth = a / (uFogFalloff * max(d.y, 1e-4));
  color = mix(color, uFogColor + uFogSunTint * pow(saturate(toSun), 6.0), 1.0 - exp(-depth));

  color += uGlow * (60.0 * exp(-theta / 0.009) + 1.6 * exp(-theta / 0.03) + 0.18 * exp(-theta / 0.12)) + uGlow * vec3(1.0, 0.76, 0.5) * (0.75 * exp(-theta / 0.2));
  float edge = 0.75 * uPixelAngle;
  color += uDisc * (1.0 - smoothstep(SUN_RADIUS - edge, SUN_RADIUS + edge, theta));

  float grey = dot(color, vec3(0.3, 0.6, 0.1));
  if (uDiag == 7) color = vec3(grey);
  if (uDiag == 4) { outColor = vec4(vec3(0.03), -1.0); return; }
  if (uDiag == 5) color = vec3(1.0e4);
  if (uDiag == 6) color = vec3(grey) * 0.5;
  outColor = vec4(color, coc);
}
`

export const SKY_FILE = 'sky.jpg'
const DRIFT_TURNS_PER_SECOND = 0.000012

export class GoldenSky {
  private readonly pass: FullscreenPass

  constructor(def: WorldDef) {
    this.pass = new FullscreenPass(fragment, {
      ...shared,
      uCamWorld: { value: new THREE.Matrix4() },
      uProj: { value: new THREE.Vector4() },
      tSky: { value: null },
      uTexelAngle: { value: 0.001 },
      uPixelAngle: { value: 0.001 },
      uGlow: { value: new THREE.Vector3().fromArray(def.sky.glow) },
      uDisc: { value: new THREE.Vector3().fromArray(def.sun.color).multiplyScalar(def.sky.disc) },
      uGain: { value: 1 },
      uDrift: { value: 0 },
    })
  }

  async load(assets: Assets): Promise<void> {
    const map = await assets.texture('worlds/golden', SKY_FILE, { repeat: true })
    const u = this.pass.uniforms
    u.tSky.value = map
    u.uTexelAngle.value = (2 * Math.PI) / (map.userData.size as { width: number }).width
  }

  prepare(time: number, gain: number): void {
    const u = this.pass.uniforms
    u.uDrift.value = time * DRIFT_TURNS_PER_SECOND
    u.uGain.value = gain
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
