import * as THREE from 'three'

const geometry = new THREE.BufferGeometry()
geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3))
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)

export const fullscreenVertex = /* glsl */ `
in vec3 position;
out vec2 vUv;
void main() {
  vUv = position.xy * 0.5 + 0.5;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`

export type Uniforms = Record<string, THREE.IUniform>

export class FullscreenPass {
  readonly material: THREE.RawShaderMaterial
  private readonly mesh: THREE.Mesh

  constructor(fragment: string, uniforms: Uniforms, options: { blending?: THREE.Blending } = {}) {
    this.material = new THREE.RawShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: fullscreenVertex,
      fragmentShader: `precision highp float;\nprecision highp int;\nprecision highp sampler2D;\n${fragment}`,
      uniforms,
      depthTest: false,
      depthWrite: false,
      blending: options.blending ?? THREE.NoBlending,
    })
    this.mesh = new THREE.Mesh(geometry, this.material)
    this.mesh.frustumCulled = false
  }

  get uniforms(): Uniforms {
    return this.material.uniforms
  }

  render(renderer: THREE.WebGLRenderer, target: THREE.WebGLRenderTarget | null): void {
    renderer.setRenderTarget(target)
    renderer.render(this.mesh, camera)
  }

  dispose(): void {
    this.material.dispose()
  }
}
