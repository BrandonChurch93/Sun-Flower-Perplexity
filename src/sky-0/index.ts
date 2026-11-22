import * as THREE from 'three'
import type { Assets } from '../core/assets.ts'
import { clamp, lerp, smoothstep } from '../core/curves.ts'
import { FullscreenPass } from '../core/fullscreen.ts'
import { glslCommon, shared } from '../core/shading.ts'
import type { RGB } from '../core/world.ts'
import type { Moment, Sky, SkyLight, View } from '../v2/api.ts'

// A stand-in sky: a painted gradient with a sun, no clouds, no stars. It shows the contract every sky keeps:
// the ray of a pixel, the blur circle in alpha, the shared fog at the end, light() from numbers worked out on the processor.

const fragment = /* glsl */ `${glslCommon}
uniform mat4 uCamWorld;
uniform vec4 uRay;
uniform float uPixelAngle;
uniform vec3 uSun;
uniform vec3 uZenith;
uniform vec3 uHorizon;
uniform vec3 uHorizonSun;
uniform vec3 uDisc;
uniform vec3 uDeck;
uniform float uCover;
in vec2 vUv;
layout(location = 0) out vec4 outColor;

const float SUN_RADIUS = 0.00465;

void main() {
  vec2 ndc = vUv * 2.0 - 1.0;
  vec3 dv = normalize(vec3((ndc.x + uRay.z) * uRay.x, (ndc.y + uRay.w) * uRay.y, -1.0));
  vec3 d = normalize(mat3(uCamWorld) * dv);
  float coc = min(uCocScale / uFocusM, 2048.0);
  float up = max(d.y, 0.0);
  float toSun = dot(d, uSun);
  vec2 flatD = normalize(d.xz + vec2(1e-6));
  vec2 flatSun = normalize(uSun.xz + vec2(1e-6));
  float side = pow(saturate(dot(flatD, flatSun) * 0.5 + 0.5), 4.0);
  vec3 low = mix(uHorizon, uHorizonSun, side);
  vec3 color = mix(low, uZenith, pow(up, 0.42));
  color += uHorizonSun * 1.5 * pow(saturate(toSun), 48.0) * (1.0 - uCover);
  color = mix(color, uDeck * (0.75 + 0.5 * up), uCover);
  float blur = 0.5 * coc * uPixelAngle;
  float r = sqrt(SUN_RADIUS * SUN_RADIUS + blur * blur);
  float angle = acos(clamp(toSun, -1.0, 1.0));
  float disc = 1.0 - smoothstep(r * 0.9, r * 1.05 + uPixelAngle, angle);
  color += uDisc * disc * (SUN_RADIUS * SUN_RADIUS) / (r * r) * smoothstep(-0.004, 0.004, d.y);
  float a = uFogDensity * exp(-uFogFalloff * max(uCamPos.y, 0.0));
  float depth = d.y > 1e-3 ? a / (uFogFalloff * d.y) : 1e6;
  float fog = 1.0 - exp(-depth);
  color = mix(color, uFogColor + uFogSunTint * pow(saturate(dot(d, uSunDir)), 6.0), fog);
  float grey = dot(color, vec3(0.3, 0.6, 0.1));
  if (uDiag == 7) color = vec3(1.0, 0.0, 0.6);
  if (uDiag == 4) { outColor = vec4(vec3(0.03), -1.0); return; }
  if (uDiag == 5) color = vec3(1.0e4);
  if (uDiag == 6) color = vec3(grey) * 0.5;
  outColor = vec4(color, coc);
}
`

// The air's optical depth straight up, red, green and blue, and the air mass toward a sun at a given height.
const DEPTH: RGB = [0.11, 0.16, 0.29]
const airMass = (degrees: number): number => 1 / (Math.sin((Math.max(degrees, 0) * Math.PI) / 180) + 0.15 * Math.pow(Math.max(degrees, 0) + 3.885, -1.253))

const mix3 = (a: RGB, b: RGB, t: number, out: RGB): RGB => {
  for (let i = 0; i < 3; i++) out[i] = a[i] + (b[i] - a[i]) * t
  return out
}

const DAY_ZENITH: RGB = [0.3, 0.62, 1.45]
const DAY_HORIZON: RGB = [1.9, 2.3, 2.8]
const DUSK_ZENITH: RGB = [0.03, 0.06, 0.15]
const DUSK_HORIZON: RGB = [0.12, 0.15, 0.22]
const DUSK_HORIZON_SUN: RGB = [1.3, 0.62, 0.24]
const NIGHT_ZENITH: RGB = [0.0018, 0.0034, 0.006]
const NIGHT_HORIZON: RGB = [0.004, 0.0065, 0.011]
const MOON: RGB = [0.19, 0.2, 0.23]

class StandInSky implements Sky {
  private pass: FullscreenPass | null = null
  private readonly now: SkyLight = { direct: [0, 0, 0], zenith: [0, 0, 0], horizon: [0, 0, 0], horizonSun: [0, 0, 0] }
  private readonly a: RGB = [0, 0, 0]
  private readonly b: RGB = [0, 0, 0]

  async load(_renderer: THREE.WebGLRenderer, _assets: Assets): Promise<void> {
    this.pass = new FullscreenPass(fragment, {
      ...shared,
      uCamWorld: { value: new THREE.Matrix4() },
      uRay: { value: new THREE.Vector4() },
      uPixelAngle: { value: 0.001 },
      uSun: { value: new THREE.Vector3(0, 1, 0) },
      uZenith: { value: new THREE.Vector3() },
      uHorizon: { value: new THREE.Vector3() },
      uHorizonSun: { value: new THREE.Vector3() },
      uDisc: { value: new THREE.Vector3() },
      uDeck: { value: new THREE.Vector3() },
      uCover: { value: 0 },
    })
  }

  warm(_renderer: THREE.WebGLRenderer): void {}

  light(m: Moment, out: SkyLight): SkyLight {
    const e = m.sunElevationDeg
    const d = m.dials
    const day = smoothstep(-1, 14, e)
    const dusk = smoothstep(-13, -2, e)
    const mass = airMass(e)
    const up = smoothstep(-1.2, 0.3, e)
    if (m.lightKind === 'moon') for (let i = 0; i < 3; i++) out.direct[i] = MOON[i]
    else for (let i = 0; i < 3; i++) out.direct[i] = 10 * Math.exp(-DEPTH[i] * mass) * up
    mix3(mix3(NIGHT_ZENITH, DUSK_ZENITH, dusk, this.a), DAY_ZENITH, day, out.zenith)
    mix3(mix3(NIGHT_HORIZON, DUSK_HORIZON, dusk, this.a), DAY_HORIZON, day, out.horizon)
    mix3(mix3(NIGHT_HORIZON, DUSK_HORIZON_SUN, dusk, this.a), mix3(DUSK_HORIZON_SUN, DAY_HORIZON, smoothstep(2, 22, e), this.b), day, out.horizonSun)
    // Under cloud the whole sky takes the grey of the deck, and thick air evens it out.
    const top = 0.2126 * out.horizon[0] + 0.7152 * out.horizon[1] + 0.0722 * out.horizon[2]
    const deck = lerp(0.55, 0.16, d.overcast) * top
    const cover = clamp(d.cover * 1.15 - 0.15) * lerp(0.6, 1, d.overcast)
    const veil = clamp(d.fog)
    for (let i = 0; i < 3; i++) {
      const tint = i === 0 ? 0.9 : i === 1 ? 1 : 1.14
      out.zenith[i] = lerp(out.zenith[i], deck * tint, cover)
      out.horizon[i] = lerp(out.horizon[i], deck * tint * 1.15, cover)
      out.horizonSun[i] = lerp(out.horizonSun[i], deck * tint * 1.3, cover)
      const even = (out.zenith[i] + out.horizon[i]) * 0.5
      out.zenith[i] = lerp(out.zenith[i], even, veil)
      out.horizon[i] = lerp(out.horizon[i], even, 0.7 * veil)
    }
    return out
  }

  prepare(_renderer: THREE.WebGLRenderer, now: Moment, _later: Moment, _view: View): void {
    const u = (this.pass as FullscreenPass).uniforms
    const l = this.light(now, this.now)
    const d = now.dials
    u.uSun.value.copy(now.sun)
    u.uZenith.value.fromArray(l.zenith)
    u.uHorizon.value.fromArray(l.horizon)
    u.uHorizonSun.value.fromArray(l.horizonSun)
    const through = now.lightKind === 'sun' ? d.sunThrough * (1 - clamp(d.fog * 0.9)) : 0
    u.uDisc.value.fromArray(l.direct).multiplyScalar(90 * through)
    const top = 0.2126 * l.horizon[0] + 0.7152 * l.horizon[1] + 0.0722 * l.horizon[2]
    u.uDeck.value.set(0.9 * top, top, 1.14 * top)
    u.uCover.value = clamp(d.cover * 1.15 - 0.15) * lerp(0.6, 1, d.overcast)
  }

  render(renderer: THREE.WebGLRenderer, target: THREE.WebGLRenderTarget, camera: THREE.PerspectiveCamera, pixelX: number, pixelY: number, width: number, height: number): void {
    const pass = this.pass as FullscreenPass
    const u = pass.uniforms
    const e = camera.projectionMatrix.elements
    u.uCamWorld.value.copy(camera.matrixWorld)
    u.uRay.value.set(1 / e[0], 1 / e[5], (2 * pixelX) / width, (2 * pixelY) / height)
    u.uPixelAngle.value = 2 / (e[0] * width)
    pass.render(renderer, target)
  }

  megabytes(): number {
    return 0
  }
}

export function make(): Sky {
  return new StandInSky()
}
