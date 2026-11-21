import * as THREE from 'three'
import type { Assets } from '../core/assets.ts'
import { declareStandIn } from '../core/standins.ts'
import type { CameraPose } from '../core/lens.ts'
import { makeSurface, type Surface } from '../core/shading.ts'
import { headOpen, heightAt, type PlantInputs } from '../plant/growth.ts'
import { Plant } from '../plant/index.ts'
import { fieldUniforms } from '../plant/part.ts'
import { PLACE, fieldFarM, fieldHalfWidth, fieldPlaces, right, toward } from './layout.ts'

const carpetVertex = /* glsl */ `
in vec3 position;
out vec3 vWorld;
out float vDepth;
uniform float uCanopy;
void main() {
  vec4 world = vec4(position.x, uCanopy * 0.9, position.z, 1.0);
  vec4 view = viewMatrix * world;
  vWorld = world.xyz;
  vDepth = -view.z;
  gl_Position = projectionMatrix * view;
}
`

const carpetFragment = /* glsl */ `
in vec3 vWorld;
in float vDepth;
uniform float uBloom;
void main() {
  float heads = smoothstep(0.52, 0.7, valueNoise(vWorld.xz * 2.4));
  float patchy = fbm(vWorld.xz * 0.11);
  vec3 leaves = mix(vec3(0.07, 0.15, 0.03), vec3(0.16, 0.27, 0.07), patchy);
  vec3 albedo = mix(leaves, vec3(0.85, 0.58, 0.05), heads * uBloom * 0.8);
  vec3 n = vec3(0.0, 1.0, 0.0);
  vec3 color = albedo * (uSunColor * max(uSunDir.y, 0.0) * 1.6 + skyAmbient(n) * 0.8);
  outColor = finish(color, vWorld, vDepth, -1.0);
}
`

interface Tier { plant: Plant; all: Float32Array; seen: THREE.InstancedInterleavedBuffer; count: number }

// One shape of the plant, drawn once for every neighbor that is in view.
function tier(detail: 'near' | 'far', places: Float32Array): Tier {
  const seen = new THREE.InstancedInterleavedBuffer(new Float32Array(places), PLACE)
  seen.setUsage(THREE.DynamicDrawUsage)
  return { plant: new Plant({ detail, places: seen }), all: places, seen, count: places.length / PLACE }
}

function carpetGeometry(): THREE.BufferGeometry {
  const depths = [fieldFarM - 6, 200, 1200, 6000]
  const position: number[] = []
  const index: number[] = []
  depths.forEach((d, i) => {
    const half = fieldHalfWidth(d)
    for (const side of [-1, 1]) position.push(-toward.x * d + right.x * half * side, 0, -toward.z * d + right.z * half * side)
    if (i > 0) {
      const a = (i - 1) * 2
      index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2)
    }
  })
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(position), 3))
  geometry.setIndex(index)
  return geometry
}

// The neighbors: the same kind of plant at the same age, in rows behind the plant, and one sheet of canopy past them.
export class Field {
  readonly carpetSurface: Surface
  readonly near: Tier
  readonly far: Tier
  readonly carpet: THREE.Mesh
  readonly meshes: THREE.Mesh[]

  constructor() {
    declareStandIn('field')
    this.carpetSurface = makeSurface({ name: 'far field stand-in', vertex: carpetVertex, fragment: carpetFragment, side: THREE.DoubleSide, standIn: true, castShadow: false, uniforms: { uBloom: { value: 0 }, ...fieldUniforms } })
    const places = fieldPlaces()
    this.near = tier('near', places.near)
    this.far = tier('far', places.far)
    this.carpet = new THREE.Mesh(carpetGeometry(), this.carpetSurface.main)
    this.carpet.frustumCulled = false
    this.meshes = [...this.near.plant.meshes, ...this.far.plant.meshes, this.carpet]
  }

  get plants(): number {
    return this.near.count + this.far.count
  }

  async load(assets: Assets): Promise<void> {
    await this.near.plant.load(assets)
    await this.far.plant.load(assets)
  }

  prepare(timeOpen: number, timeClose: number, open: PlantInputs, close: PlantInputs, eyeHeightM: number): void {
    this.near.plant.prepare(timeOpen, timeClose, open, close)
    this.far.plant.prepare(timeOpen, timeClose, open, close)
    const canopy = heightAt(timeOpen) * 0.95
    fieldUniforms.uCanopy.value = canopy
    this.carpetSurface.main.uniforms.uBloom.value = headOpen(timeOpen)
    this.carpet.visible = eyeHeightM > canopy * 0.9
  }

  // Shows or hides the whole field. The canopy sheet stays hidden while the camera is under it.
  show(on: boolean): void {
    this.near.plant.visible = on
    this.far.plant.visible = on
    if (!on) this.carpet.visible = false
  }

  // Leaves out every neighbor that stands wholly to one side of the frame or behind the lens. `tanHalfWidth` is half the gate over the focal length.
  look(pose: CameraPose, tanHalfWidth: number, aspect: number): number {
    const flat = Math.hypot(pose.forward.x, pose.forward.z) || 1
    const fx = pose.forward.x / flat
    const fz = pose.forward.z / flat
    const steep = Math.max(0.3, flat - (tanHalfWidth / aspect) * Math.abs(pose.forward.y))
    const spread = tanHalfWidth / steep
    const reach = 0.9
    let total = 0
    for (const t of [this.near, this.far]) {
      const all = t.all
      const seen = t.seen.array as Float32Array
      let n = 0
      for (let i = 0; i < all.length; i += PLACE) {
        const dx = all[i] - pose.position.x
        const dz = all[i + 1] - pose.position.z
        const depth = dx * fx + dz * fz
        if (depth < -reach) continue
        const side = Math.abs(dx * pose.right.x + dz * pose.right.z)
        if (side > Math.max(depth, 0) * spread + reach * (1 + spread)) continue
        for (let j = 0; j < PLACE; j++) seen[n + j] = all[i + j]
        n += PLACE
      }
      t.seen.needsUpdate = true
      t.plant.show(n / PLACE)
      total += n / PLACE
    }
    return total
  }
}
