import * as THREE from 'three'
import { FullscreenPass, type Uniforms } from '../../core/fullscreen.ts'
import { glslCommon, shared } from '../../core/shading.ts'
import type { WorldDef } from '../../core/world.ts'
import { windToward } from '../../plant/wind.ts'
import { fogLight } from '../../weather/fog/index.ts'

// There is no sky in the frost: this is the fog itself where nothing stands in it, slow banks high up, and the sun's disc as the fog lets it through.
const fragment = /* glsl */ `${glslCommon}
uniform mat4 uCamWorld;
uniform vec4 uProj;
uniform float uPixelAngle;
uniform float uNow;
uniform vec3 uDisc;
uniform vec2 uToward;
in vec2 vUv;
layout(location = 0) out vec4 outColor;
${fogLight}

const float DISC = 0.0165;
const float DISC_SOFT = 0.65;
const float WISPS = 0.33;
const float SHAFTS = 0.3;

void main() {
  vec2 ndc = vUv * 2.0 - 1.0;
  vec3 dv = normalize(vec3((ndc.x + uProj.z) * uProj.x, (ndc.y + uProj.w) * uProj.y, -1.0));
  vec3 d = normalize(mat3(uCamWorld) * dv);
  float coc = min(uCocScale / uFocusM, 2048.0);
  float theta = acos(clamp(dot(d, uSunDir), -1.0, 1.0));
  float el = asin(clamp(d.y, -1.0, 1.0));
  vec2 deck = d.xz / (max(d.y, 0.0) + 0.35);
  // The fog overhead is a slow deck of thicker and thinner air that drifts with the wind, the finer wisps a little faster than the broad banks.
  vec2 broad = deck - uToward * (0.02 * uNow);
  vec2 fine = deck - uToward * (0.03 * uNow);
  vec2 wisp = deck - uToward * (0.035 * uNow);
  float wide = valueNoise(broad * vec2(1.7, 1.1) + vec2(0.0, 3.0));
  float mid = valueNoise(fine * vec2(3.9, 2.3) + vec2(0.0, 11.0));
  float small = valueNoise(fine * vec2(8.3, 4.9) + vec2(5.0, 0.0));
  float banks = 0.26 * wide + 0.2 * mid + 0.2 * small + 0.19 * valueNoise(wisp * vec2(17.0, 11.0) + vec2(2.0, 7.0)) + 0.15 * valueNoise(wisp * vec2(33.0, 23.0) + vec2(9.0, 4.0));
  // The same deck shapes the sun's halo: it reaches farther and is richer where the fog is thick, and the uneven fog between the sun and the eye leaves faint shafts round it.
  vec3 off = d - uSunDir;
  vec2 round = normalize(vec2(dot(off, vec3(-uSunDir.z, 0.0, uSunDir.x)), off.y * length(uSunDir.xz)) + 1.0e-6);
  float shafts = (valueNoise(round * 2.3 + vec2(3.0, 0.01 * uNow)) - 0.5) * smoothstep(0.02, 0.08, theta) * (1.0 - smoothstep(0.15, 0.35, theta));
  vec3 color = fogLightIn(d, 2.0 * (0.2 * wide + 0.35 * mid + 0.45 * small - 0.5) + SHAFTS * shafts);
  color *= 1.0 + WISPS * (banks - 0.5) * smoothstep(0.0, 0.1, el);
  // The disc is white through the fog and has no hard edge of its own. As the fog thins round it, it stands out a little more.
  float soft = DISC * (DISC_SOFT - 0.15 * uFogThin);
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
      uToward: { value: new THREE.Vector2(windToward.x, windToward.z) },
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
