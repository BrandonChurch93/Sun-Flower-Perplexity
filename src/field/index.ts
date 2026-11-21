import * as THREE from 'three'
import type { Assets } from '../core/assets.ts'
import type { CameraPose } from '../core/lens.ts'
import { heightAt, type PlantInputs } from '../plant/growth.ts'
import { Plant } from '../plant/index.ts'
import { fieldUniforms } from '../plant/part.ts'
import { FarField } from './far.ts'
import { PLACE, farVariants, fieldPlaces, kindTime, nearVariants, shareOf } from './layout.ts'

// A neighbor stands 0.70 to 0.85 as tall as the plant: the tops of the field are at the middle of that.
const CANOPY = 0.775

interface Group { all: Float32Array; seen: THREE.InstancedInterleavedBuffer; count: number; index: number; of: number; plant: Plant }

// One kind of neighbor, drawn once for every place of its share that is in view.
function group(detail: 'near' | 'far', variant: number, places: Float32Array, index: number, of: number): Group {
  const seen = new THREE.InstancedInterleavedBuffer(new Float32Array(places), PLACE)
  seen.setUsage(THREE.DynamicDrawUsage)
  return { plant: new Plant({ detail, variant, places: seen }), all: places, seen, count: places.length / PLACE, index, of }
}

// The neighbors: the same kind of plant at nearly the same age, in rows behind the plant. Full plants near, simpler ones behind them,
// pictures of plants behind those and one carpet to the far end. No two neighbors next to each other are the same.
export class Field {
  readonly groups: Group[]
  readonly far: FarField
  readonly meshes: THREE.Mesh[]

  constructor() {
    const places = fieldPlaces()
    this.groups = [
      ...nearVariants.map((v, i) => group('near', v, shareOf(places.near, i, nearVariants.length), i, nearVariants.length)),
      ...farVariants.map((v, i) => group('far', v, shareOf(places.far, i, farVariants.length), i, farVariants.length)),
    ]
    this.far = new FarField(places.pictures)
    this.meshes = [...this.groups.flatMap((g) => g.plant.meshes), ...this.far.meshes]
  }

  get plants(): number {
    return this.groups.reduce((sum, g) => sum + g.count, this.far.count)
  }

  async load(assets: Assets): Promise<void> {
    for (const g of this.groups) await g.plant.load(assets)
    await this.far.load(assets)
  }

  prepare(timeOpen: number, timeClose: number, open: PlantInputs, close: PlantInputs, eyeHeightM: number): void {
    for (const g of this.groups) g.plant.prepare(kindTime(timeOpen, g.index, g.of), kindTime(timeClose, g.index, g.of), open, close)
    const canopy = heightAt(timeOpen) * CANOPY
    fieldUniforms.uCanopy.value = canopy
    this.far.prepare(timeOpen, timeClose, open, close, eyeHeightM, canopy)
  }

  show(on: boolean): void {
    for (const g of this.groups) g.plant.visible = on
    this.far.show(on)
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
    for (const g of this.groups) {
      const all = g.all
      const seen = g.seen.array as Float32Array
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
      g.seen.needsUpdate = true
      g.plant.show(n / PLACE)
      total += n / PLACE
    }
    this.far.look(pose)
    return total
  }
}
