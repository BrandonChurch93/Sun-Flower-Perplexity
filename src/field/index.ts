import * as THREE from 'three'
import type { Assets } from '../core/assets.ts'
import type { CameraPose } from '../core/lens.ts'
import { headOpen, heightAt, rayLength, usePlant, type PlantInputs } from '../plant/growth.ts'
import { headAt } from '../plant/model.ts'
import { Plant } from '../plant/index.ts'
import { fieldUniforms } from '../plant/part.ts'
import type { Quality } from '../v2/api.ts'
import { now } from '../v2/now.ts'
import { FarField } from './far.ts'
import { type KindUniforms, fieldPlaceGlsl, fieldPlaceUniforms, kindData, kindList } from './place.ts'
import { Shaped, shapeInputs } from './turn.ts'
import { CANOPY_SIZE, PLACE, SETTLED_T, toward, earlyAt, farVariants, fieldAge, fieldPlaces, frontM, hangAt, kindTime, lagAt, lateAt, nearVariants, opensEarly, plantAhead, shareOf, sizeAt, squatAt, standOf, statureAt, stiffAt, wideAt, youngOf, type Tier } from './layout.ts'

// The kinds whose leaves fill the gaps of the first rows.
const UNDER_KINDS = [0, 3, 4, 6]
// At the low quality the simpler plants thin out with distance, to this share of them, and the leaves in the gaps stop early.
const THIN_TO: Record<Quality, number> = { film: 1, high: 1, low: 0.3 }
// The leaves in the gaps stay under the heads of the crop.
const UNDER_SIZE = 0.74
const UNDER_REACH_M: Record<Quality, number> = { film: 1000, high: 1000, low: 11 }
// How dark the rows behind the pair stand from the crane, and over which stretch of the plant's clock that comes in.
const BEHIND = { tone: 0.75, from: 53.6, full: 55.5 }

interface Group { head: { value: THREE.Vector4 }; leafHead: { value: THREE.Vector4 }; leafOwn: { value: number }; axis: { value: THREE.Vector3 }; grow: { value: number }; bare: boolean; kind: KindUniforms; shaped: Shaped; count: number; index: number; tier: Tier; plant: Plant }

// One kind of neighbor, drawn once for every place of its share. Its list is written here and never again: where each one stands in a frame is worked out as it is drawn.
function group(detail: 'near' | 'far', variant: number, places: Float32Array, index: number, bare = false): Group {
  const list = new THREE.InstancedInterleavedBuffer(kindList(places), PLACE)
  const kind: KindUniforms = { uFieldData: { value: kindData(places) }, uFieldKind: { value: new THREE.Vector4(0, 1, 0, 0) }, uFieldDraw: { value: new THREE.Vector4(1, 1, 1000, 1) }, uFieldLeaf: { value: 0 } }
  const plant = new Plant({ detail, variant, places: list, place: { glsl: fieldPlaceGlsl, uniforms: { ...fieldPlaceUniforms, ...kind } } })
  const head = { value: new THREE.Vector4(0, 0, 0, 1) }
  const grow = { value: 0 }
  const axis = { value: new THREE.Vector3(0, 0, 1) }
  for (const m of plant.meshes) Object.assign((m.material as THREE.RawShaderMaterial).uniforms, { uHeadAt: head, uHeadGrow: grow, uHeadAxis: axis })
  // The leaves carry their own numbers late in the bloom, so they read how far those have come, and the head's place, from uniforms of their own.
  const leafHead = { value: new THREE.Vector4(0, 0, 0, 0) }
  const leafOwn = { value: 0 }
  for (const part of plant.parts) if (part.name === 'leaves') for (const m of part.meshes) Object.assign((m.material as THREE.RawShaderMaterial).uniforms, { uHeadAt: leafHead, uEarly: leafOwn, uFieldLeaf: { value: 1 } })
  const count = places.length / PLACE
  plant.show(count)
  if (bare) for (const part of plant.parts) if (part.name !== 'leaves') for (const m of part.meshes) if (m.geometry instanceof THREE.InstancedBufferGeometry) m.geometry.instanceCount = 0
  return { head, leafHead, leafOwn, axis, grow, bare, plant, kind, shaped: new Shaped(), count, index, tier: detail }
}

// The neighbors: the same kind of plant at nearly the same age, in rows behind the plant. Full plants near, simpler ones behind them,
// pictures of plants behind those and one carpet to the far end. No two neighbors next to each other are the same.
export class Field {
  readonly groups: Group[]
  readonly far: FarField
  readonly meshes: THREE.Mesh[]
  // Set by the field's own stage part before the frame is drawn, from the frame's view.
  quality: Quality = 'high'
  private time = 0
  private rise = 0
  private ahead = 1
  private lag = 0
  private readonly stature = statureAt(0)
  private seconds = 0
  private wind = 0
  private leafWind = 0
  private pose: CameraPose | null = null
  private tanHalfWidth = 1
  private aspect = 1
  private filled: Quality | null = null
  shown = 0

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
    this.shown = this.groups.reduce((sum, g) => sum + g.count, 0)
    fieldUniforms.uEdge.value.set(toward.x, toward.z, frontM)
    current = this
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
    this.seconds = now.t
    this.wind = now.dials.wind
    this.leafWind = Math.max(open.wind, now.dials.wind)
    // The neighbors are swayed as they are drawn, on the film second: the swell a shape takes on the plant's clock would stand still in a hold.
    fieldUniforms.uPlantWind.value = 0
    const still = shapeInputs(open)
    const stillClose = shapeInputs(close)
    const felt = JSON.stringify([still, stillClose])
    for (const g of this.groups) {
      const clock = kindTime(timeOpen, g.index, g.tier)
      const clockClose = kindTime(timeClose, g.index, g.tier)
      if (g.shaped.again(clock, clockClose, felt)) g.plant.prepare(clock, clockClose, still, stillClose)
      usePlant(g.plant.variant, null)
      const h = headAt(clock, still)
      g.head.value.set(h.center.x, h.center.y, h.center.z, h.radius + rayLength(0, clock) + 0.03)
      g.axis.value.set(h.axis.x, h.axis.y, h.axis.z)
      const late = lateAt(timeOpen)
      g.leafHead.value.copy(g.head.value)
      if (late > 0 && g.head.value.w > 0) g.leafHead.value.w = Math.max(g.head.value.w * (1 - late), 1e-4)
      g.leafOwn.value = Math.max(earlyAt(timeOpen), late)
      // A head opens to nearly the size of the plant's own, however short its stalk.
      g.grow.value = headOpen(clock)
      usePlant(0)
    }
    this.ahead = plantAhead(timeOpen)
    const squat = squatAt(timeOpen)
    this.lag = lagAt(timeOpen)
    const tall = heightAt(fieldAge(timeOpen))
    const st = statureAt(timeOpen, this.stature)
    const full = tall * sizeAt(CANOPY_SIZE, youngOf(0.5, this.lag), this.ahead)
    const low = standOf(full / st.plantTall, 9, st.stand, st.even, st.farShort)
    const spread = full * low
    const canopy = spread * (1 - squat)
    fieldUniforms.uSquat.value = squat
    fieldUniforms.uHang.value = hangAt(timeOpen)
    fieldUniforms.uWide.value = wideAt(timeOpen)
    fieldUniforms.uLate.value = lateAt(timeOpen)
    fieldUniforms.uMoon.value = now.night * THREE.MathUtils.smoothstep(-now.sunElevationDeg, 5, 9)
    fieldUniforms.uDark.value = 0
    fieldUniforms.uEarly.value = earlyAt(timeOpen)
    fieldUniforms.uCanopy.value = canopy
    // How closed the crop is follows how far its leaves reach.
    fieldUniforms.uClosed.value = THREE.MathUtils.smoothstep(spread, 0.2, 0.85)
    // How little sky the crop keeps follows the size it will settle at, so the young crop is open to the sky however tall it stands.
    fieldUniforms.uDeep.value = THREE.MathUtils.smoothstep(tall * CANOPY_SIZE, 0.7, 1.25)
    // The leaves in the gaps come up as the crop closes over them.
    this.rise = THREE.MathUtils.smoothstep(spread, 0.15, 0.6)
    this.far.prepare(timeOpen, timeClose, still, stillClose, felt, eyeHeightM, canopy, low)
  }

  show(on: boolean): void {
    for (const g of this.groups) g.plant.visible = on
    this.far.show(on)
  }

  // Leaves out every neighbor that stands wholly to one side of the frame or behind the lens. `tanHalfWidth` is half the gate over the focal length.
  look(pose: CameraPose, tanHalfWidth: number, aspect: number, quality?: Quality): number {
    if (quality) {
      this.quality = quality
      this.far.use(quality)
    }
    this.pose = pose
    this.tanHalfWidth = tanHalfWidth
    this.aspect = aspect
    this.far.look(pose)
    return this.fill()
  }

  // The frame's quality arrives after `look`: when it differs from what was filled, the lists are filled again before anything is drawn.
  use(quality: Quality): void {
    this.quality = quality
    this.far.use(quality)
    if (this.pose && this.filled !== quality) this.fill()
  }

  // Hands every kind the frame's few numbers. Nothing is counted and no list is written: a neighbor outside the frame is left out as it is drawn.
  private fill(): number {
    const pose = this.pose as CameraPose
    const flat = Math.hypot(pose.forward.x, pose.forward.z) || 1
    const steep = Math.max(0.3, flat - (this.tanHalfWidth / this.aspect) * Math.abs(pose.forward.y))
    const s = this.stature
    const u = fieldPlaceUniforms
    u.uFieldStature.value.set(s.ahead, s.lag, s.uneven, s.behind)
    u.uFieldStand.value.set(s.stand, s.even, s.farShort, s.plantTall)
    u.uFieldPhase.value.set(lateAt(this.time), earlyAt(this.time), stiffAt(this.time), BEHIND.tone * THREE.MathUtils.smoothstep(this.time, BEHIND.from, BEHIND.full))
    u.uFieldAir.value.set(this.seconds, this.wind, this.leafWind, s.young ? 1 : 0)
    u.uFieldLens.value.set(pose.position.x, pose.position.z, pose.forward.x / flat, pose.forward.z / flat)
    u.uFieldGate.value.set(pose.right.x, pose.right.z, this.tanHalfWidth / steep, 0.9)
    this.filled = this.quality
    const full = heightAt(SETTLED_T)
    for (const g of this.groups) {
      const clock = kindTime(this.time, g.index, g.tier)
      const kindTall = heightAt(clock)
      g.kind.uFieldKind.value.set(clock, kindTall, opensEarly(g.index, g.tier) ? 1 : 0, Math.atan2(g.axis.value.x, g.axis.value.z))
      g.kind.uFieldDraw.value.set(Math.max(s.ahead, Math.min(4, full / Math.max(kindTall, 0.001))), g.bare ? this.rise * UNDER_SIZE : 1, g.bare ? UNDER_REACH_M[this.quality] : 1000, g.tier === 'far' && !g.bare ? THIN_TO[this.quality] : 1)
    }
    return this.shown
  }
}

let current: Field | null = null
// The field the film is drawing, for the field's stage part.
export const fieldNow = (): Field | null => current
