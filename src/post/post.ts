import * as THREE from 'three'
import { FullscreenPass } from '../core/fullscreen.ts'
import { glslCommon, shared, type DiagName } from '../core/shading.ts'
import type { WorldDef } from '../core/world.ts'

const fillFragment = /* glsl */ `${glslCommon}
uniform sampler2D tFrame;
uniform float uRadiusScale;
uniform float uSpread;
uniform int uTaps;
uniform float uSeed;
layout(location = 0) out vec4 outColor;
const float GOLDEN = 2.39996323;
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  ivec2 top = ivec2(uSize) - 1;
  vec4 c = texelFetch(tFrame, p, 0);
  float radius = min(c.a * uRadiusScale, 96.0) * uSpread;
  if (radius < 0.6) { outColor = c; return; }
  float turn = hash31(vec3(gl_FragCoord.xy, uSeed)) * 6.2831853;
  vec4 sum = c;
  float total = 1.0;
  for (int i = 0; i < uTaps; i++) {
    float fi = float(i) + 0.5;
    float rr = sqrt(fi / float(uTaps)) * radius;
    float th = fi * GOLDEN + turn;
    ivec2 q = clamp(p + ivec2(round(vec2(cos(th), sin(th)) * rr)), ivec2(0), top);
    vec4 s = texelFetch(tFrame, q, 0);
    float reach = min(s.a * uRadiusScale, 96.0) * uSpread;
    float w = saturate(reach - rr + 1.0);
    sum += s * w;
    total += w;
  }
  outColor = sum / total;
}
`

const brightFragment = /* glsl */ `
uniform sampler2D tFrame;
uniform float uExposure;
uniform float uKnee;
in vec2 vUv;
layout(location = 0) out vec4 outColor;
vec3 bright(vec3 c) {
  c = min(max(c, 0.0) * uExposure, vec3(64.0));
  float l = max(c.r, max(c.g, c.b));
  float soft = clamp(l - uKnee * 0.5, 0.0, uKnee);
  float gain = max(l - uKnee, soft * soft / (2.0 * uKnee + 1e-4));
  return c * (gain / max(l, 1e-4));
}
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy) * 2;
  ivec2 top = textureSize(tFrame, 0) - 1;
  vec3 s = bright(texelFetch(tFrame, min(p, top), 0).rgb);
  s += bright(texelFetch(tFrame, min(p + ivec2(1, 0), top), 0).rgb);
  s += bright(texelFetch(tFrame, min(p + ivec2(0, 1), top), 0).rgb);
  s += bright(texelFetch(tFrame, min(p + ivec2(1, 1), top), 0).rgb);
  outColor = vec4(s * 0.25, 1.0);
}
`

const downFragment = /* glsl */ `
uniform sampler2D tSource;
uniform vec2 uTexel;
in vec2 vUv;
layout(location = 0) out vec4 outColor;
void main() {
  vec3 s = texture(tSource, vUv + uTexel * vec2(-1.0, -1.0)).rgb;
  s += texture(tSource, vUv + uTexel * vec2(1.0, -1.0)).rgb;
  s += texture(tSource, vUv + uTexel * vec2(-1.0, 1.0)).rgb;
  s += texture(tSource, vUv + uTexel * vec2(1.0, 1.0)).rgb;
  outColor = vec4(s * 0.25, 1.0);
}
`

const upFragment = /* glsl */ `
uniform sampler2D tSource;
uniform sampler2D tBase;
uniform vec2 uTexel;
in vec2 vUv;
layout(location = 0) out vec4 outColor;
void main() {
  vec3 s = texture(tSource, vUv).rgb * 4.0;
  s += texture(tSource, vUv + uTexel * vec2(-1.0, 0.0)).rgb * 2.0;
  s += texture(tSource, vUv + uTexel * vec2(1.0, 0.0)).rgb * 2.0;
  s += texture(tSource, vUv + uTexel * vec2(0.0, -1.0)).rgb * 2.0;
  s += texture(tSource, vUv + uTexel * vec2(0.0, 1.0)).rgb * 2.0;
  s += texture(tSource, vUv + uTexel * vec2(-1.0, -1.0)).rgb;
  s += texture(tSource, vUv + uTexel * vec2(1.0, -1.0)).rgb;
  s += texture(tSource, vUv + uTexel * vec2(-1.0, 1.0)).rgb;
  s += texture(tSource, vUv + uTexel * vec2(1.0, 1.0)).rgb;
  outColor = vec4(s / 16.0 + texture(tBase, vUv).rgb, 1.0);
}
`

const gradeFragment = /* glsl */ `${glslCommon}
uniform sampler2D tFrame;
uniform sampler2D tBloom;
uniform float uBloom;
uniform float uBloomNorm;
uniform float uExposure;
uniform vec3 uGain;
uniform vec3 uLift;
uniform float uContrast;
uniform float uToneM;
uniform float uToneNorm;
uniform float uSaturation;
uniform float uVignette;
uniform float uGrain;
uniform float uSeed;
uniform int uMode;
in vec2 vUv;
layout(location = 0) out vec4 outColor;

vec3 toSrgb(vec3 c) {
  return mix(c * 12.92, 1.055 * pow(max(c, 1e-6), vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), c));
}
vec3 tone(vec3 x) {
  vec3 t = pow(max(x, 0.0), vec3(uContrast));
  return t / (t + uToneM) * uToneNorm;
}
float tri(vec2 p, float s) {
  return hash31(vec3(p, s)) + hash31(vec3(p + 31.0, s + 0.37)) - 1.0;
}
void main() {
  vec4 f = texelFetch(tFrame, ivec2(gl_FragCoord.xy), 0);
  vec3 c = f.rgb;
  if (uMode == 2) { outColor = vec4(clamp(c, 0.0, 1.0), 1.0); return; }
  if (uMode == 3) { outColor = vec4(vec3(1.0 / (1.0 + max(c.r, 0.0))), 1.0); return; }
  if (uMode == 1) { outColor = vec4(toSrgb(clamp(c, 0.0, 1.0)), 1.0); return; }
  c = max(c, 0.0) * uExposure + texture(tBloom, vUv).rgb * (uBloom * uBloomNorm);
  c *= uGain;
  float aspect = uSize.x / uSize.y;
  vec2 q = (vUv - 0.5) * vec2(aspect, 1.0);
  float r2 = dot(q, q) / (0.25 * (aspect * aspect + 1.0));
  c *= 1.0 - uVignette * smoothstep(0.1, 1.0, r2);
  c = clamp(tone(c), 0.0, 1.0);
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = mix(vec3(l), c, uSaturation);
  c = c + uLift * (1.0 - c);
  c = toSrgb(clamp(c, 0.0, 1.0));
  float mid = 1.0 - abs(2.0 * dot(c, vec3(0.2126, 0.7152, 0.0722)) - 1.0);
  c += tri(gl_FragCoord.xy, uSeed) * uGrain * (0.4 + 0.6 * mid);
  c += tri(gl_FragCoord.xy + 113.0, uSeed + 0.71) / 255.0;
  outColor = vec4(c, 1.0);
}
`

type Mode = 0 | 1 | 2 | 3

const MODES: Record<DiagName, Mode> = { beauty: 0, ungraded: 1, plant: 1, backlight: 1, texels: 2, depth: 3, focus: 2, standins: 2 }

function halfTarget(width: number, height: number): THREE.WebGLRenderTarget {
  const t = new THREE.WebGLRenderTarget(width, height, {
    type: THREE.HalfFloatType,
    format: THREE.RGBAFormat,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    depthBuffer: false,
    stencilBuffer: false,
    generateMipmaps: false,
  })
  t.texture.colorSpace = THREE.NoColorSpace
  return t
}

function fullTarget(width: number, height: number): THREE.WebGLRenderTarget {
  const t = new THREE.WebGLRenderTarget(width, height, {
    type: THREE.FloatType,
    format: THREE.RGBAFormat,
    minFilter: THREE.NearestFilter,
    magFilter: THREE.NearestFilter,
    depthBuffer: false,
    stencilBuffer: false,
    generateMipmaps: false,
  })
  t.texture.colorSpace = THREE.NoColorSpace
  return t
}

export function toneConstants(contrast: number, white: number): { m: number; norm: number } {
  const a = Math.pow(0.18, contrast)
  const w = Math.pow(white, contrast)
  const m = (0.82 * a * w) / (0.18 * w - a)
  return { m, norm: (w + m) / w }
}

export class Post {
  private fillA: THREE.WebGLRenderTarget
  private fillB: THREE.WebGLRenderTarget
  private down: THREE.WebGLRenderTarget[] = []
  private up: THREE.WebGLRenderTarget[] = []
  private readonly fill = new FullscreenPass(fillFragment, { ...shared, tFrame: { value: null }, uRadiusScale: { value: 0.5 }, uSpread: { value: 1 }, uTaps: { value: 24 }, uSeed: { value: 0 } })
  private readonly bright = new FullscreenPass(brightFragment, { tFrame: { value: null }, uExposure: { value: 1 }, uKnee: { value: 1 } })
  private readonly downPass = new FullscreenPass(downFragment, { tSource: { value: null }, uTexel: { value: new THREE.Vector2() } })
  private readonly upPass = new FullscreenPass(upFragment, { tSource: { value: null }, tBase: { value: null }, uTexel: { value: new THREE.Vector2() } })
  private readonly grade = new FullscreenPass(gradeFragment, {
    ...shared,
    tFrame: { value: null },
    tBloom: { value: null },
    uBloom: { value: 0 },
    uBloomNorm: { value: 1 },
    uExposure: { value: 1 },
    uGain: { value: new THREE.Vector3(1, 1, 1) },
    uLift: { value: new THREE.Vector3() },
    uContrast: { value: 1 },
    uToneM: { value: 1 },
    uToneNorm: { value: 1 },
    uSaturation: { value: 1 },
    uVignette: { value: 0 },
    uGrain: { value: 0 },
    uSeed: { value: 0 },
    uMode: { value: 0 },
  })

  constructor(width: number, height: number) {
    this.fillA = fullTarget(width, height)
    this.fillB = fullTarget(width, height)
    this.buildChain(width, height)
  }

  private buildChain(width: number, height: number): void {
    for (const t of [...this.down, ...this.up]) t.dispose()
    this.down = []
    this.up = []
    const levels = Math.max(3, Math.floor(Math.log2(height / 16)))
    let w = width
    let h = height
    for (let i = 0; i < levels; i++) {
      w = Math.max(2, Math.ceil(w / 2))
      h = Math.max(2, Math.ceil(h / 2))
      this.down.push(halfTarget(w, h))
      if (i < levels - 1) this.up.push(halfTarget(w, h))
    }
  }

  setSize(width: number, height: number): void {
    this.fillA.setSize(width, height)
    this.fillB.setSize(width, height)
    this.buildChain(width, height)
  }

  bytes(): number {
    let sum = (this.fillA.width * this.fillA.height * 16) * 2
    for (const t of [...this.down, ...this.up]) sum += t.width * t.height * 8
    return sum
  }

  // The finished frame before lens and grade stays in the accumulator. This returns the texture the grade read, for the measures.
  render(renderer: THREE.WebGLRenderer, frame: THREE.Texture, def: WorldDef, frameIndex: number, samples: number, diag: DiagName): void {
    const mode = MODES[diag]
    const g = this.grade.uniforms
    g.uMode.value = mode
    g.uSeed.value = frameIndex
    let source = frame
    if (mode === 0) {
      const f = this.fill.uniforms
      f.uRadiusScale.value = 0.5 / Math.sqrt(samples)
      f.uSeed.value = frameIndex
      f.tFrame.value = frame
      f.uSpread.value = 1
      f.uTaps.value = 24
      this.fill.render(renderer, this.fillA)
      f.tFrame.value = this.fillA.texture
      f.uSpread.value = 0.24
      f.uTaps.value = 12
      this.fill.render(renderer, this.fillB)
      source = this.fillB.texture
      const b = this.bright.uniforms
      b.tFrame.value = source
      b.uExposure.value = def.grade.exposure
      b.uKnee.value = def.grade.bloomKnee
      this.bright.render(renderer, this.down[0])
      for (let i = 1; i < this.down.length; i++) {
        const d = this.downPass.uniforms
        d.tSource.value = this.down[i - 1].texture
        d.uTexel.value.set(0.5 / this.down[i].width, 0.5 / this.down[i].height)
        this.downPass.render(renderer, this.down[i])
      }
      let from = this.down[this.down.length - 1]
      for (let i = this.up.length - 1; i >= 0; i--) {
        const u = this.upPass.uniforms
        u.tSource.value = from.texture
        u.tBase.value = this.down[i].texture
        u.uTexel.value.set(1 / from.width, 1 / from.height)
        this.upPass.render(renderer, this.up[i])
        from = this.up[i]
      }
      const tone = toneConstants(def.grade.contrast, def.grade.white)
      g.tBloom.value = from.texture
      g.uBloom.value = def.grade.bloom
      g.uBloomNorm.value = 1 / this.down.length
      g.uExposure.value = def.grade.exposure
      g.uGain.value.fromArray(def.grade.gain)
      g.uLift.value.fromArray(def.grade.lift)
      g.uContrast.value = def.grade.contrast
      g.uToneM.value = tone.m
      g.uToneNorm.value = tone.norm
      g.uSaturation.value = def.grade.saturation
      g.uVignette.value = def.grade.vignette
      g.uGrain.value = def.grade.grain
    }
    g.tFrame.value = source
    this.grade.render(renderer, null)
  }
}
