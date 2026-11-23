import * as THREE from 'three'
import { remember } from '../../core/programs.ts'
import { glslCommon, glslHead, shared } from '../../core/shading.ts'
import { basin } from './basin.ts'
import { LANDING_FLOATS } from './landings.ts'

// A ring fades in this many seconds, the smallest drop's and what the largest adds, and is gone after this many fades.
const RING_FADE_S = [0.12, 0.5]
const RING_FADES = 3
// The longest a ring lives from the landing of its drop: of a heavy drop, and of the fine rain.
export const RING_LIFE_S = RING_FADES * (RING_FADE_S[0] + RING_FADE_S[1])
export const FINE_RING_LIFE_S = RING_FADES * (RING_FADE_S[0] + RING_FADE_S[1] * 0.37)
// A ring's strength goes with its drop's radius to this power: a drizzle drop a tenth as wide rings about a sixth as strongly.
const RING_BY_RADIUS = 0.75
const SEGMENTS = 48
const SIZE = 2048

const vertex = /* glsl */ `${glslHead}${glslCommon}
${basin}
in vec2 ring;
in vec4 drop;
uniform vec2 uSpan;
out vec2 vOff;
flat out vec4 vWave;
flat out float vPhase;
void main() {
  float t = mix(uSpan.x, uSpan.y, uShutter) - drop.z;
  float size = pow(drop.w / 0.0022, ${RING_BY_RADIUS.toFixed(2)});
  float seed = hash21(drop.xy * 91.7);
  float fade = ${RING_FADE_S[0].toFixed(2)} + ${RING_FADE_S[1].toFixed(2)} * size;
  float life = ${RING_FADES.toFixed(1)} * fade;
  float rc = 0.002 + (0.18 + 0.1 * size + 0.03 * seed) * t;
  float amp = smoothstep(0.0, 0.015, t) * exp(-t / fade - rc / (0.03 + 0.055 * size)) * (1.0 - smoothstep(0.75 * life, life, t)) * size;
  amp *= smoothstep(0.0003, 0.003, waterDepth(drop.xy));
  if (amp < 0.01) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    return;
  }
  float w = 0.003 + 0.008 * size + (0.02 + 0.05 * size) * t;
  float a = ring.x * 6.2831853;
  vOff = vec2(cos(a), sin(a)) * mix(max(rc - 4.0 * w, 0.0), (rc + 2.2 * w) * 1.01, ring.y);
  vWave = vec4(rc, w, 2.6 * amp, 0.0065 + 0.0135 * size + (0.006 + 0.026 * size) * t + 0.004 * seed);
  vPhase = 6.2831853 * seed;
  gl_Position = vec4(boxPlace(drop.xy + vOff), 0.0, 1.0);
}
`

const fragment = /* glsl */ `${glslHead}
in vec2 vOff;
flat in vec4 vWave;
flat in float vPhase;
layout(location = 0) out vec4 outColor;
void main() {
  float r = length(vOff);
  float x = (r - vWave.x) / vWave.y;
  x *= x < 0.0 ? 0.55 : 1.0;
  float s = vWave.z * exp(-x * x) * sin(6.2831853 * (r - vWave.x) / vWave.w + vPhase) / sqrt(1.0 + r / 0.02);
  outColor = vec4(vOff / max(r, 1e-5) * s, 0.0, 1.0);
}
`

// The slope of the water under every ring that is spreading now, drawn into a map of the ground once for each position of the shutter.
export class Ripples {
  readonly target: THREE.WebGLRenderTarget
  readonly uniforms: Record<string, THREE.IUniform>
  private readonly scene = new THREE.Scene()
  private readonly camera = new THREE.Camera()
  private readonly geometry = new THREE.InstancedBufferGeometry()
  private readonly drops: THREE.InstancedBufferAttribute
  private readonly black = new THREE.Color(0, 0, 0)
  private readonly kept = new THREE.Color()

  constructor(ground: Record<string, THREE.IUniform>, level: THREE.IUniform, readonly data: Float32Array) {
    this.target = new THREE.WebGLRenderTarget(SIZE, SIZE, { type: THREE.HalfFloatType, format: THREE.RGBAFormat, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false, generateMipmaps: false })
    const ring = new Float32Array((SEGMENTS + 1) * 4)
    const index: number[] = []
    for (let s = 0; s <= SEGMENTS; s++) {
      ring.set([s / SEGMENTS, 0, s / SEGMENTS, 1], s * 4)
      if (s < SEGMENTS) index.push(s * 2, s * 2 + 1, s * 2 + 3, s * 2, s * 2 + 3, s * 2 + 2)
    }
    this.geometry.setAttribute('ring', new THREE.BufferAttribute(ring, 2))
    this.geometry.setIndex(index)
    this.drops = new THREE.InstancedBufferAttribute(data, LANDING_FLOATS)
    this.drops.setUsage(THREE.DynamicDrawUsage)
    this.geometry.setAttribute('drop', this.drops)
    this.geometry.instanceCount = 0
    this.uniforms = { ...shared, ...ground, uLevel: level, uBox: { value: new THREE.Vector3() }, uSpan: { value: new THREE.Vector2() } }
    const material = remember(new THREE.RawShaderMaterial({ name: 'puddle rings', glslVersion: THREE.GLSL3, vertexShader: vertex, fragmentShader: fragment, uniforms: this.uniforms, side: THREE.DoubleSide, depthTest: false, depthWrite: false, transparent: true, blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor, blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneFactor }))
    const mesh = new THREE.Mesh(this.geometry, material)
    mesh.frustumCulled = false
    this.scene.add(mesh)
    this.scene.matrixWorldAutoUpdate = false
  }

  set(count: number, open: number, close: number, cx: number, cz: number, half: number): void {
    this.geometry.instanceCount = count
    if (count > 0) {
      this.drops.clearUpdateRanges()
      this.drops.addUpdateRange(0, count * LANDING_FLOATS)
      this.drops.needsUpdate = true
    }
    this.uniforms.uSpan.value.set(open, close)
    this.uniforms.uBox.value.set(cx, cz, 1 / half)
  }

  render(renderer: THREE.WebGLRenderer): void {
    const target = renderer.getRenderTarget()
    const auto = renderer.autoClear
    const alpha = renderer.getClearAlpha()
    renderer.getClearColor(this.kept)
    renderer.setRenderTarget(this.target)
    renderer.setClearColor(this.black, 0)
    renderer.autoClear = true
    renderer.render(this.scene, this.camera)
    renderer.autoClear = auto
    renderer.setClearColor(this.kept, alpha)
    renderer.setRenderTarget(target)
  }
}
