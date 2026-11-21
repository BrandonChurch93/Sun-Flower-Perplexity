import * as THREE from 'three'
import type { Assets } from '../core/assets.ts'
import { FullscreenPass } from '../core/fullscreen.ts'
import { glslCommon, shared } from '../core/shading.ts'
import type { WorldDef } from '../core/world.ts'

const fragment = /* glsl */ `${glslCommon}
uniform mat4 uCamWorld;
uniform vec4 uRay;
uniform vec3 uSkyTop;
uniform vec3 uSkyBottom;
uniform vec3 uGlow;
uniform float uGlowPower;
uniform float uDisc;
uniform sampler2D tBackdrop;
uniform float uBackdropOn;
uniform mat3 uBackBasis;
uniform vec2 uBackScale;
uniform float uBackBlur;
uniform float uBackdropGain;
uniform float uBackdropWidth;
uniform float uPixelAngle;
uniform float uStandIn;
in vec2 vUv;
layout(location = 0) out vec4 outColor;

const float PI = 3.14159265358979;
const float SUN_RADIUS = 0.00465;

void main() {
  vec2 ndc = vUv * 2.0 - 1.0;
  vec3 dv = normalize(vec3((ndc.x + uRay.z) * uRay.x, (ndc.y + uRay.w) * uRay.y, -1.0));
  vec3 d = normalize(mat3(uCamWorld) * dv);
  float coc = min(uCocScale / uFocusM, 2048.0);
  float toSun = dot(d, uSunDir);
  vec3 color = mix(uSkyBottom, uSkyTop, pow(max(d.y, 0.0), 0.5));
  color += uGlow * pow(saturate(toSun), uGlowPower);
  float inside = 0.0;
  if (uBackdropOn > 0.5) {
    vec3 k = d * uBackBasis;
    vec2 uv = vec2(0.5) + k.xy / max(k.z, 0.02) * uBackScale;
    vec2 over = max(max(-uv, uv - 1.0), vec2(0.0));
    float beyond = max(over.x, over.y) + (k.z < 0.02 ? 1.0 : 0.0);
    float lod = log2(max(1.0, coc * uBackBlur * uPixelAngle * uBackdropWidth * uBackScale.x));
    lod = max(lod, 7.5 * smoothstep(0.0, 0.25, beyond));
    inside = 1.0;
    color = textureLod(tBackdrop, clamp(uv, 0.0, 1.0), lod).rgb * uBackdropGain;
  }
  float blur = 0.5 * coc * uPixelAngle;
  float r = sqrt(SUN_RADIUS * SUN_RADIUS + blur * blur);
  float angle = acos(clamp(toSun, -1.0, 1.0));
  float disc = 1.0 - smoothstep(r * 0.9, r * 1.05 + uPixelAngle, angle);
  color += uSunColor * uDisc * disc * (SUN_RADIUS * SUN_RADIUS) / (r * r);
  float a = uFogDensity * exp(-uFogFalloff * max(uCamPos.y, 0.0));
  float depth = d.y > 1e-3 ? a / (uFogFalloff * d.y) : 1e6;
  float fog = (1.0 - exp(-depth)) * (1.0 - inside);
  color = mix(color, uFogColor + uFogSunTint * pow(saturate(toSun), 6.0), fog);
  float grey = dot(color, vec3(0.3, 0.6, 0.1));
  if (uDiag == 7) color = uStandIn > 0.5 ? vec3(1.0, 0.0, 0.6) : vec3(grey);
  if (uDiag == 4) { outColor = vec4(vec3(0.03), -1.0); return; }
  if (uDiag == 5) color = vec3(1.0e4);
  if (uDiag == 6) color = vec3(grey) * 0.5;
  outColor = vec4(color, coc);
}
`


export class Sky {
  private readonly pass: FullscreenPass
  private readonly backdrops = new Map<string, THREE.Texture>()

  constructor() {
    this.pass = new FullscreenPass(fragment, {
      ...shared,
      uCamWorld: { value: new THREE.Matrix4() },
      uRay: { value: new THREE.Vector4() },
      uSkyTop: { value: new THREE.Vector3() },
      uSkyBottom: { value: new THREE.Vector3() },
      uGlow: { value: new THREE.Vector3() },
      uGlowPower: { value: 1 },
      uDisc: { value: 0 },
      tBackdrop: { value: null },
      uBackdropOn: { value: 0 },
      uBackBasis: { value: new THREE.Matrix3() },
      uBackScale: { value: new THREE.Vector2(1, 1) },
      uBackBlur: { value: 1 },
      uBackdropGain: { value: 1 },
      uBackdropWidth: { value: 1 },
      uPixelAngle: { value: 0.001 },
      uStandIn: { value: 0 },
    })
  }

  async load(assets: Assets, def: WorldDef): Promise<void> {
    if (!def.backdrop.file) return
    this.backdrops.set(def.id, await assets.texture(`worlds/${def.id}`, def.backdrop.file))
  }

  forget(id: string): void {
    this.backdrops.delete(id)
  }

  clear(): void {
    this.backdrops.clear()
  }

  setWorld(def: WorldDef): void {
    const u = this.pass.uniforms
    u.uSkyTop.value.fromArray(def.sky.zenith)
    u.uSkyBottom.value.fromArray(def.sky.horizon)
    u.uGlow.value.fromArray(def.sky.glow)
    u.uGlowPower.value = def.sky.glowPower
    u.uDisc.value = def.sky.disc
    u.uStandIn.value = def.standIn ? 1 : 0
    const backdrop = this.backdrops.get(def.id) ?? null
    u.tBackdrop.value = backdrop
    u.uBackdropOn.value = backdrop && def.lock ? 1 : 0
    if (def.lock) {
      const { right, up, forward, scaleX, scaleY } = def.lock
      u.uBackBasis.value.set(right.x, up.x, forward.x, right.y, up.y, forward.y, right.z, up.z, forward.z)
      u.uBackScale.value.set(scaleX, scaleY)
    }
    u.uBackBlur.value = def.backdrop.blur
    u.uBackdropGain.value = def.backdrop.gain
    u.uBackdropWidth.value = backdrop ? (backdrop.userData.size as { width: number }).width : 1
  }

  render(renderer: THREE.WebGLRenderer, target: THREE.WebGLRenderTarget, camera: THREE.PerspectiveCamera, pixelX: number, pixelY: number, width: number, height: number): void {
    const u = this.pass.uniforms
    const e = camera.projectionMatrix.elements
    u.uCamWorld.value.copy(camera.matrixWorld)
    u.uRay.value.set(1 / e[0], 1 / e[5], (2 * pixelX) / width, (2 * pixelY) / height)
    u.uPixelAngle.value = 2 / (e[0] * width)
    this.pass.render(renderer, target)
  }
}
