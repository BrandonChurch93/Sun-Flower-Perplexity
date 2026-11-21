import * as THREE from 'three'
import type { Assets } from '../core/assets.ts'
import type { CameraPose } from '../core/lens.ts'
import { headOpen, heightAt, rayLength, usePlant, type PlantInputs } from '../plant/growth.ts'
import { headAt } from '../plant/model.ts'
import { Plant } from '../plant/index.ts'
import { fieldUniforms } from '../plant/part.ts'
import { FarField } from './far.ts'
import { leavesApart, placeTurned } from './turn.ts'
import { PLACE, behindAt, budTurn, clearBud, clearLow, earlyAt, earlyCode, farVariants, fieldAge, fieldPlaces, frontM, gapTone, gapsAt, hangAt, kindTime, lagAt, lateAt, nearVariants, nightAt, NIGHT_LOW, opensEarly, ownCode, ownOf, plantAhead, shareOf, sizeAt, squatAt, standsClear, STIFF_LEAF, stiffAt, toward, wideAt, youngOf, type Tier } from './layout.ts'

// A neighbor stands 0.70 to 0.85 as tall as the plant: the tops of the field are at the middle of that.
const CANOPY = 0.72
// The kinds whose leaves fill the gaps of the first rows.
const UNDER_KINDS = [0, 3, 4, 6]

interface Group { head: { value: THREE.Vector4 }; axis: { value: THREE.Vector3 }; grow: { value: number }; bare: boolean; all: Float32Array; seen: THREE.InstancedInterleavedBuffer; still: THREE.InstancedInterleavedBuffer; count: number; index: number; tier: Tier; plant: Plant }

// One kind of neighbor, drawn once for every place of its share that is in view.
function group(detail: 'near' | 'far', variant: number, places: Float32Array, index: number, bare = false): Group {
  const seen = new THREE.InstancedInterleavedBuffer(new Float32Array(places), PLACE)
  seen.setUsage(THREE.DynamicDrawUsage)
  const plant = new Plant({ detail, variant, places: seen })
  const head = { value: new THREE.Vector4(0, 0, 0, 1) }
  const grow = { value: 0 }
  const axis = { value: new THREE.Vector3(0, 0, 1) }
  for (const m of plant.meshes) Object.assign((m.material as THREE.RawShaderMaterial).uniforms, { uHeadAt: head, uHeadGrow: grow, uHeadAxis: axis })
  return { head, axis, grow, bare, plant, all: places, seen, still: leavesApart(plant, places.length / PLACE), count: places.length / PLACE, index, tier: detail }
}

// The neighbors: the same kind of plant at nearly the same age, in rows behind the plant. Full plants near, simpler ones behind them,
// pictures of plants behind those and one carpet to the far end. No two neighbors next to each other are the same.
export class Field {
  readonly groups: Group[]
  readonly far: FarField
  readonly meshes: THREE.Mesh[]
  private time = 0
  private rise = 0
  private ahead = 1
  private lag = 0
  private gaps = 0

  constructor() {
    const places = fieldPlaces()
    const near = new Float32Array(places.near.length + places.front.length)
    near.set(places.near)
    near.set(places.front, places.near.length)
    this.groups = [
      ...nearVariants.map((v, i) => group('near', v, shareOf(near, i, nearVariants.length), i)),
      ...farVariants.map((v, i) => group('far', v, shareOf(places.far, i, farVariants.length), i)),
      ...UNDER_KINDS.map((k, i) => group('near', nearVariants[k], shareOf(places.under, i, UNDER_KINDS.length), k, true)),
    ]
    this.far = new FarField(places.pictures)
    this.meshes = [...this.groups.flatMap((g) => g.plant.meshes), ...this.far.meshes]
    fieldUniforms.uEdge.value.set(toward.x, toward.z, frontM)
  }

  get plants(): number {
    return this.groups.reduce((sum, g) => sum + g.count, this.far.count)
  }

  async load(assets: Assets): Promise<void> {
    for (const g of this.groups) await g.plant.load(assets)
    await this.far.load(assets)
  }

  prepare(timeOpen: number, timeClose: number, open: PlantInputs, close: PlantInputs, eyeHeightM: number): void {
    this.time = timeOpen
    for (const g of this.groups) {
      const clock = kindTime(timeOpen, g.index, g.tier)
      g.plant.prepare(clock, kindTime(timeClose, g.index, g.tier), open, close)
      usePlant(g.plant.variant, null)
      const h = headAt(clock, open)
      g.head.value.set(h.center.x, h.center.y, h.center.z, h.radius + rayLength(0, clock) + 0.03)
      g.axis.value.set(h.axis.x, h.axis.y, h.axis.z)
      // A head opens to nearly the size of the plant's own, however short its stalk.
      g.grow.value = headOpen(clock)
      usePlant(0)
    }
    this.ahead = plantAhead(timeOpen)
    const squat = squatAt(timeOpen)
    this.lag = lagAt(timeOpen)
    const tall = heightAt(fieldAge(timeOpen))
    const spread = tall * sizeAt(CANOPY, youngOf(0.5, this.lag), this.ahead)
    const night = nightAt(timeOpen)
    const canopy = spread * (1 - squat) * (1 - night * NIGHT_LOW)
    fieldUniforms.uSquat.value = squat
    fieldUniforms.uHang.value = hangAt(timeOpen)
    fieldUniforms.uWide.value = wideAt(timeOpen)
    fieldUniforms.uLate.value = lateAt(timeOpen)
    fieldUniforms.uMoon.value = night
    fieldUniforms.uEarly.value = earlyAt(timeOpen)
    fieldUniforms.uCanopy.value = canopy
    // How closed the crop is follows how far its leaves reach.
    fieldUniforms.uClosed.value = THREE.MathUtils.smoothstep(spread, 0.2, 0.85)
    // How little sky the crop keeps follows the size it will settle at, so the young crop is open to the sky however tall it stands.
    fieldUniforms.uDeep.value = THREE.MathUtils.smoothstep(tall * CANOPY, 0.7, 1.25)
    // The leaves in the gaps come up as the crop closes over them.
    this.gaps = gapsAt(timeOpen)
    this.rise = Math.max(THREE.MathUtils.smoothstep(spread, 0.15, 0.6), this.gaps)
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
    const late = lateAt(this.time)
    const night = nightAt(this.time)
    const before = earlyAt(this.time)
    const behind = behindAt(this.time)
    const stiff = stiffAt(this.time)
    let total = 0
    for (const g of this.groups) {
      const all = g.all
      const early = opensEarly(g.index, g.tier)
      const clock = kindTime(this.time, g.index, g.tier)
      const first = night > 0 && !g.bare
      const seen = g.seen.array as Float32Array
      const still = g.still.array as Float32Array
      let n = 0
      for (let i = 0; i < all.length; i += PLACE) {
        const dx = all[i] - pose.position.x
        const dz = all[i + 1] - pose.position.z
        const depth = dx * fx + dz * fz
        if (depth < -reach) continue
        const side = Math.abs(dx * pose.right.x + dz * pose.right.z)
        if (side > Math.max(depth, 0) * spread + reach * (1 + spread)) continue
        const own = ownOf(all[i + 7])
        const clear = first && standsClear(all[i + 7])
        placeTurned(all, i, seen, still, n, (early ? 0 : budTurn(clock, all[i + 7])) + late * own.turn)
        seen[n + 3] = still[n + 3] = sizeAt(all[i + 3], youngOf(all[i + 6], this.lag), this.ahead) * (g.bare ? this.rise : 1) * (1 + late * (own.tall - 1)) * (1 - night * (clear ? clearLow(all[i + 7]) : own.low)) * (1 + behind * (own.young - 1))
        if (before > 0) {
          seen[n + 4] += before * own.leanX
          seen[n + 5] += before * own.leanZ
          still[n + 4] += before * own.leanX
          still[n + 5] += before * own.leanZ
        }
        if (g.bare && this.gaps > 0) seen[n + 6] = still[n + 6] = all[i + 6] + this.gaps * (gapTone(all[i + 7]) - all[i + 6])
        seen[n + 7] = still[n + 7] = before > 0 ? earlyCode(own, clear ? own.bud + night * (clearBud(all[i + 7]) - own.bud) : own.bud, (clear ? own.leaf + night * (1.4 - own.leaf) : own.leaf) + stiff * STIFF_LEAF, own.droop - stiff * 0.67 * (own.droop + 0.15)) : ownCode(own)
        n += PLACE
      }
      g.seen.needsUpdate = true
      g.still.needsUpdate = true
      g.plant.show(n / PLACE)
      if (g.bare) for (const part of g.plant.parts) if (part.name !== 'leaves') for (const m of part.meshes) if (m.geometry instanceof THREE.InstancedBufferGeometry) m.geometry.instanceCount = 0
      total += n / PLACE
    }
    this.far.look(pose)
    return total
  }
}
