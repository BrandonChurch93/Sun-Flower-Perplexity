import * as THREE from 'three'
import type { Assets } from '../../core/assets.ts'
import { FullscreenPass } from '../../core/fullscreen.ts'
import { glslCommon, shared } from '../../core/shading.ts'
import type { WorldDef } from '../../core/world.ts'

// The painted sky holds the color of a clear sunrise in 8 bit. Its range is carried here: a gain that climbs toward the sun, the haze over the horizon, the sun's aureole in the damp air and the sun itself at its true brightness, which the lens then turns into its ball and its glare.
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
  float turn = atan(uSunDir.x, uSunDir.z) - atan(d.x, d.z);
  vec2 uv = vec2(fract(0.5 + turn / (2.0 * PI) + uDrift), clamp(sqrt(max(el, 0.0) / (0.5 * PI)), 0.004, 0.996));
  // One lens sample stands for its share of the disc of confusion: the picture and the sun are drawn that wide, so the samples close into a smooth blur.
  float wide = max(1.0, 1.4 * coc / sqrt(uSamples));
  float lod = max(0.0, log2(wide * uPixelAngle / uTexelAngle));
  vec3 color = textureLod(tSky, uv, lod).rgb * uGain * (1.0 + 0.3 * exp(-theta / 0.16)) * mix(vec3(0.93, 1.28, 1.45), vec3(1.0), exp(-theta / 0.35)) * mix(vec3(1.0), vec3(1.08, 0.92, 0.74), exp(-theta / 0.2));

  float a = uFogDensity * exp(-uFogFalloff * max(uCamPos.y, 0.0));
  float depth = a / (uFogFalloff * max(d.y, 1e-4));
  color = mix(color, uFogColor + uFogSunTint * pow(saturate(toSun), 6.0), 1.0 - exp(-depth));

  color += uGlow * (1.0 * exp(-theta / 0.014) + 0.22 * exp(-theta / 0.05) + 0.11 * exp(-theta / 0.17) + 0.006 * exp(-theta / 0.6));
  float share = 0.5 * wide * uPixelAngle;
  float radius = sqrt(SUN_RADIUS * SUN_RADIUS + share * share);
  color += uDisc * (SUN_RADIUS * SUN_RADIUS / (radius * radius)) * (1.0 - smoothstep(radius - max(share, 0.75 * uPixelAngle), radius + max(share, 0.75 * uPixelAngle), theta));

  float grey = dot(color, vec3(0.3, 0.6, 0.1));
  if (uDiag == 7) color = vec3(grey);
  if (uDiag == 4) { outColor = vec4(vec3(0.03), -1.0); return; }
  if (uDiag == 5) color = vec3(1.0e4);
  if (uDiag == 6) color = vec3(grey) * 0.5;
  outColor = vec4(color, coc);
}
`

export const SKY_FILE = 'sky.jpg'
const DRIFT_TURNS_PER_SECOND = 0.00001

export class DawnSky {
  private readonly pass: FullscreenPass

  constructor(def: WorldDef, gain: number) {
    this.pass = new FullscreenPass(fragment, {
      ...shared,
      uCamWorld: { value: new THREE.Matrix4() },
      uProj: { value: new THREE.Vector4() },
      tSky: { value: null },
      uTexelAngle: { value: 0.001 },
      uPixelAngle: { value: 0.001 },
      uGlow: { value: new THREE.Vector3().fromArray(def.sky.glow) },
      uDisc: { value: new THREE.Vector3().fromArray(def.sun.color).multiplyScalar(def.sky.disc) },
      uGain: { value: gain },
      uDrift: { value: 0 },
      uSamples: { value: 1 },
    })
  }

  async load(assets: Assets): Promise<void> {
    const map = await assets.texture('worlds/dawn', SKY_FILE, { repeat: true })
    const u = this.pass.uniforms
    u.tSky.value = map
    u.uTexelAngle.value = (2 * Math.PI) / (map.userData.size as { width: number }).width
  }

  prepare(time: number, samples: number): void {
    const u = this.pass.uniforms
    u.uSamples.value = Math.max(1, samples)
    u.uDrift.value = time * DRIFT_TURNS_PER_SECOND
  }

  render(renderer: THREE.WebGLRenderer, target: THREE.WebGLRenderTarget, camera: THREE.PerspectiveCamera, width: number): void {
    const u = this.pass.uniforms
    const e = camera.projectionMatrix.elements
    u.uCamWorld.value.copy(camera.matrixWorld)
    u.uProj.value.set(1 / e[0], 1 / e[5], e[8], e[9])
    u.uPixelAngle.value = 2 / (e[0] * width)
    this.pass.render(renderer, target)
  }
}
