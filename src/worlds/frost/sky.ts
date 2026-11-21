import * as THREE from 'three'
import { FullscreenPass, type Uniforms } from '../../core/fullscreen.ts'
import { glslCommon, shared } from '../../core/shading.ts'
import type { WorldDef } from '../../core/world.ts'
import { fogLight } from '../../weather/fog/index.ts'

// There is no sky in the frost: this is the fog itself where nothing stands in it, slow banks high up, and the sun's disc as the fog lets it through.
const fragment = /* glsl */ `${glslCommon}
uniform mat4 uCamWorld;
uniform vec4 uProj;
uniform float uPixelAngle;
uniform float uNow;
uniform vec3 uDisc;
in vec2 vUv;
layout(location = 0) out vec4 outColor;
${fogLight}

const float DISC = 0.018;

void main() {
  vec2 ndc = vUv * 2.0 - 1.0;
  vec3 dv = normalize(vec3((ndc.x + uProj.z) * uProj.x, (ndc.y + uProj.w) * uProj.y, -1.0));
  vec3 d = normalize(mat3(uCamWorld) * dv);
  float coc = min(uCocScale / uFocusM, 2048.0);
  float theta = acos(clamp(dot(d, uSunDir), -1.0, 1.0));
  float el = asin(clamp(d.y, -1.0, 1.0));
  vec3 color = fogLight(d);
  vec2 deck = d.xz / (max(d.y, 0.0) + 0.35);
  float banks = 0.6 * valueNoise(deck * vec2(1.7, 1.1) + vec2(0.011 * uNow, 3.0)) + 0.4 * valueNoise(deck * vec2(3.9, 2.3) + vec2(-0.017 * uNow, 11.0));
  color *= 1.0 + 0.07 * (banks - 0.5) * smoothstep(0.02, 0.2, el);
  // The disc is white through the fog and has no hard edge of its own. As the fog thins round it, it stands out a little more.
  float soft = DISC * (0.45 - 0.15 * uFogThin);
  color = mix(color, uDisc * (1.0 + 0.3 * uFogThin), 1.0 - smoothstep(DISC - soft, DISC + soft, theta));
  float grey = dot(color, vec3(0.3, 0.6, 0.1));
  if (uDiag == 7) color = vec3(grey);
  if (uDiag == 4) { outColor = vec4(vec3(0.03), -1.0); return; }
  if (uDiag == 5) color = vec3(1.0e4);
  if (uDiag == 6) color = vec3(grey) * 0.5;
  outColor = vec4(color, coc * mix(0.25, 1.0, max(1.0 - smoothstep(0.06, 0.13, el), 1.0 - smoothstep(0.03, 0.12, theta))));
}
`

export class FrostSky {
  private readonly pass: FullscreenPass

  constructor(def: WorldDef, fog: Uniforms) {
    this.pass = new FullscreenPass(fragment, {
      ...shared,
      ...fog,
      uCamWorld: { value: new THREE.Matrix4() },
      uProj: { value: new THREE.Vector4() },
      uPixelAngle: { value: 0.001 },
      uNow: { value: 0 },
      uDisc: { value: new THREE.Vector3().setScalar(def.sky.disc) },
    })
  }

  at(time: number): void {
    this.pass.uniforms.uNow.value = time
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
