import * as THREE from 'three'
import { FullscreenPass } from './fullscreen.ts'

const fragment = /* glsl */ `
uniform sampler2D tPrev;
uniform sampler2D tSample;
uniform float uWeight;
uniform float uFirst;
out vec4 outColor;
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  vec4 s = texelFetch(tSample, p, 0);
  vec4 prev = uFirst > 0.5 ? vec4(0.0) : texelFetch(tPrev, p, 0);
  outColor = prev + s * uWeight;
}
`

export class Accumulator {
  private targets: [THREE.WebGLRenderTarget, THREE.WebGLRenderTarget]
  private current = 0
  private empty = true
  private readonly pass: FullscreenPass

  constructor(width: number, height: number) {
    this.targets = [Accumulator.make(width, height), Accumulator.make(width, height)]
    this.pass = new FullscreenPass(fragment, { tPrev: { value: null }, tSample: { value: null }, uWeight: { value: 1 }, uFirst: { value: 1 } })
  }

  private static make(width: number, height: number): THREE.WebGLRenderTarget {
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

  setSize(width: number, height: number): void {
    for (const t of this.targets) t.setSize(width, height)
    this.empty = true
  }

  reset(): void {
    this.empty = true
  }

  add(renderer: THREE.WebGLRenderer, sample: THREE.Texture, weight: number): void {
    const next = 1 - this.current
    const u = this.pass.uniforms
    u.tPrev.value = this.targets[this.current].texture
    u.tSample.value = sample
    u.uWeight.value = weight
    u.uFirst.value = this.empty ? 1 : 0
    this.pass.render(renderer, this.targets[next])
    this.current = next
    this.empty = false
  }

  get texture(): THREE.Texture {
    return this.targets[this.current].texture
  }

  get target(): THREE.WebGLRenderTarget {
    return this.targets[this.current]
  }

  bytes(): number {
    return this.targets.reduce((sum, t) => sum + t.width * t.height * 16, 0)
  }

  dispose(): void {
    for (const t of this.targets) t.dispose()
    this.pass.dispose()
  }
}
