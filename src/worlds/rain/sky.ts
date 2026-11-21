import * as THREE from 'three'
import type { Assets } from '../../core/assets.ts'
import { FullscreenPass } from '../../core/fullscreen.ts'
import { glslCommon, shared } from '../../core/shading.ts'

// The picture holds one sixth of the horizon twice, the second time turned over, so it closes round the dome. Its lower part is the pale band under the cloud, laid steeply; the cloud above keeps its own proportions.
// No fog is laid over it: the rain between the lens and the cloud is in the paint's own grey and in the veils drawn in front.
const fragment = /* glsl */ `${glslCommon}
uniform mat4 uCamWorld;
uniform vec4 uProj;
uniform sampler2D tSky;
uniform float uTexelAngle;
uniform float uPixelAngle;
uniform float uCenter;
uniform float uGain;
uniform float uDrift;
uniform float uFlash;
uniform vec3 uFlashAt;
uniform float uSamples;
in vec2 vUv;
layout(location = 0) out vec4 outColor;

const float PI = 3.14159265358979;
const float SPAN = 2.0 * PI / 3.0;
const float BAND_ROWS = 0.235;
const float BAND_TOP = 0.08;
const float CLOUD_TALL = 0.46;

void main() {
  vec2 ndc = vUv * 2.0 - 1.0;
  vec3 dv = normalize(vec3((ndc.x + uProj.z) * uProj.x, (ndc.y + uProj.w) * uProj.y, -1.0));
  vec3 d = normalize(mat3(uCamWorld) * dv);
  float coc = min(uCocScale / uFocusM, 2048.0);
  float el = asin(clamp(d.y, -1.0, 1.0));
  float up = max(el, 0.0);
  float turn = uCenter - atan(d.x, d.z);
  float row = up < BAND_TOP ? BAND_ROWS * up / BAND_TOP : BAND_ROWS + (1.0 - BAND_ROWS) * (up - BAND_TOP) / CLOUD_TALL;
  vec2 uv = vec2(fract(0.25 + turn / SPAN + uDrift), clamp(row, 0.004, 0.996));
  float wide = max(1.0, 1.4 * coc / sqrt(uSamples));
  float lod = max(0.0, log2(wide * uPixelAngle / uTexelAngle));
  vec3 sky = textureLod(tSky, uv, lod).rgb;
  float lum = dot(sky, vec3(0.3, 0.6, 0.1));
  float cloud = 1.0 - smoothstep(0.12, 0.35, lum);
  vec3 color = sky * uGain;
  // The band is where the sun stands behind thin cloud: the paint holds it back, the film lets it burn.
  float open = (1.0 - cloud) * exp(-up / 0.07);
  color *= mix(vec3(1.0), vec3(1.45, 1.36, 1.22), open);

  // Lightning deep in the cloud: its body lights up from inside round one place, brightest where it is thin.
  float near = exp(-(1.0 - dot(d, uFlashAt)) / 0.035);
  color += uFlash * vec3(0.55, 0.68, 1.0) * (0.25 + 1.6 * near) * cloud * (0.35 + 2.2 * lum) * smoothstep(0.03, 0.09, up);

  float grey = dot(color, vec3(0.3, 0.6, 0.1));
  if (uDiag == 7) color = vec3(grey);
  if (uDiag == 4) { outColor = vec4(vec3(0.03), -1.0); return; }
  if (uDiag == 5) color = vec3(1.0e4);
  if (uDiag == 6) color = vec3(grey) * 0.5;
  outColor = vec4(color, coc * mix(0.25, 1.0, 1.0 - smoothstep(0.05, 0.12, el)));
}
`

export const SKY_FILE = 'sky.jpg'
const DRIFT_TURNS_PER_SECOND = 0.0002

export class RainSky {
  private readonly pass: FullscreenPass

  constructor(centerAzimuthDeg: number, flashAt: THREE.Vector3) {
    this.pass = new FullscreenPass(fragment, {
      ...shared,
      uCamWorld: { value: new THREE.Matrix4() },
      uProj: { value: new THREE.Vector4() },
      tSky: { value: null },
      uTexelAngle: { value: 0.001 },
      uPixelAngle: { value: 0.001 },
      uCenter: { value: (centerAzimuthDeg * Math.PI) / 180 },
      uGain: { value: 1 },
      uDrift: { value: 0 },
      uFlash: { value: 0 },
      uFlashAt: { value: flashAt },
      uSamples: { value: 1 },
    })
  }

  async load(assets: Assets): Promise<void> {
    const map = await assets.texture('worlds/rain', SKY_FILE, { repeat: true })
    const u = this.pass.uniforms
    u.tSky.value = map
    u.uTexelAngle.value = ((2 * Math.PI) / 3) / (map.userData.size as { width: number }).width
  }

  prepare(time: number, gain: number, flash: number, samples: number): void {
    const u = this.pass.uniforms
    u.uSamples.value = Math.max(1, samples)
    u.uDrift.value = time * DRIFT_TURNS_PER_SECOND
    u.uGain.value = gain
    u.uFlash.value = flash
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
