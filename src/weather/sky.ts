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
uniform vec4 uBackdrop;
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
    float az = atan(d.x, d.z) - uBackdrop.x;
    az -= 2.0 * PI * floor((az + PI) / (2.0 * PI));
    float el = asin(clamp(d.y, -1.0, 1.0)) - uBackdrop.y;
    vec2 uv = vec2(az / uBackdrop.z + 0.5, el / (uBackdrop.z / uBackdrop.w) + 0.5);
    vec2 edge = smoothstep(vec2(0.0), vec2(0.1), uv) * smoothstep(vec2(0.0), vec2(0.1), 1.0 - uv);
    inside = edge.x * edge.y;
    if (inside > 0.0) {
      float lod = log2(max(1.0, coc * uPixelAngle * uBackdropWidth / uBackdrop.z));
      color = mix(color, textureLod(tBackdrop, clamp(uv, 0.0, 1.0), lod).rgb * uBackdropGain, inside);
    }
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

const RAD = Math.PI / 180

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
      uBackdrop: { value: new THREE.Vector4() },
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
    u.uBackdropOn.value = backdrop ? 1 : 0
    u.uBackdrop.value.set(def.backdrop.azimuthDeg * RAD, def.backdrop.elevationDeg * RAD, def.backdrop.spanDeg * RAD, def.backdrop.aspect)
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
