import * as THREE from 'three'
import { shared, type Surface } from './shading.ts'

export interface Caster { mesh: THREE.Mesh; surface: Surface }

const SIZE = 2048
const bias = new THREE.Matrix4().set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1)
const UP = new THREE.Vector3(0, 1, 0)
const SIDE = new THREE.Vector3(1, 0, 0)

export class ShadowMap {
  readonly target: THREE.WebGLRenderTarget
  readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 10)
  private readonly lightDir = new THREE.Vector3()
  private readonly u = new THREE.Vector3()
  private readonly v = new THREE.Vector3()

  constructor() {
    const depth = new THREE.DepthTexture(SIZE, SIZE, THREE.FloatType)
    depth.compareFunction = THREE.LessEqualCompare
    depth.minFilter = THREE.LinearFilter
    depth.magFilter = THREE.LinearFilter
    this.target = new THREE.WebGLRenderTarget(SIZE, SIZE, {
      format: THREE.RedFormat,
      type: THREE.UnsignedByteType,
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      depthBuffer: true,
      stencilBuffer: false,
      depthTexture: depth,
      generateMipmaps: false,
    })
    this.camera.matrixAutoUpdate = false
  }

  bytes(): number {
    return SIZE * SIZE * 5
  }

  off(): void {
    shared.uShadowOn.value = 0
  }

  // The light is turned inside a cone softnessDeg wide by the sample's own point, so the average of the samples is a soft shadow.
  // The map covers a square 2 x radius wide round the center, seen from the sun. reach is how far from the center, along the light, anything that throws or takes a shadow can be.
  render(renderer: THREE.WebGLRenderer, scene: THREE.Scene, casters: Caster[], sun: THREE.Vector3, softnessDeg: number, jitterX: number, jitterY: number, center: THREE.Vector3, radius: number, reach = radius): void {
    const spread = Math.tan((softnessDeg * Math.PI) / 360)
    this.u.crossVectors(Math.abs(sun.y) > 0.99 ? SIDE : UP, sun).normalize()
    this.v.crossVectors(sun, this.u).normalize()
    this.lightDir.copy(sun).addScaledVector(this.u, jitterX * spread).addScaledVector(this.v, jitterY * spread).normalize()
    this.u.crossVectors(Math.abs(this.lightDir.y) > 0.99 ? SIDE : UP, this.lightDir).normalize()
    this.v.crossVectors(this.lightDir, this.u).normalize()
    const lift = Math.max(this.lightDir.y, 0.02)
    const behind = (center.y + reach * Math.sqrt(1 - Math.min(1, this.lightDir.y * this.lightDir.y))) / lift
    const front = reach * 1.05
    const far = front + Math.max(reach, behind) + reach * 0.2
    const cam = this.camera
    cam.left = -radius
    cam.right = radius
    cam.top = radius
    cam.bottom = -radius
    cam.near = 0
    cam.far = far
    cam.updateProjectionMatrix()
    cam.position.copy(center).addScaledVector(this.lightDir, front)
    cam.matrix.makeBasis(this.u, this.v, this.lightDir).setPosition(cam.position)
    cam.matrixWorld.copy(cam.matrix)
    cam.matrixWorldInverse.copy(cam.matrixWorld).invert()
    // The casters read the size of a texel as they are drawn into the map, so it is set before the map is drawn.
    shared.uShadowTexel.value = 1 / SIZE
    shared.uShadowTexelM.value = (2 * radius) / SIZE
    shared.uShadowBias.value = ((2 * radius) / SIZE) * 0.6 / far
    const hidden: THREE.Object3D[] = []
    const mine = new Set<THREE.Object3D>(casters.map((c) => c.mesh))
    for (const child of scene.children) {
      if (child.visible && !mine.has(child)) {
        child.visible = false
        hidden.push(child)
      }
    }
    for (const c of casters) if (c.surface.depth) c.mesh.material = c.surface.depth
    renderer.setRenderTarget(this.target)
    renderer.clear(true, true, false)
    renderer.render(scene, cam)
    for (const c of casters) c.mesh.material = c.surface.main
    for (const child of hidden) child.visible = true
    shared.uShadowMatrix.value.multiplyMatrices(bias, cam.projectionMatrix).multiply(cam.matrixWorldInverse)
    shared.uShadowMap.value = this.target.depthTexture
    shared.uShadowOn.value = 1
  }
}
