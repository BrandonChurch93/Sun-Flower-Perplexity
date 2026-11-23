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
import { leanBy, leavesApart, placeTurned, turnBy } from './turn.ts'
import { PLACE, behindAt, blownOf, earlyAt, earlyCode, faceAt, faceToward, farVariants, fieldAge, fieldPlaces, frontM, kindTime, lagAt, lateAt, lateLean, lateLeafCode, leafShort, leafSpin, nearVariants, opensEarly, ownCode, ownOf, plantAhead, settled, shareOf, shortWay, sizeAt, squatAt, hangAt, STIFF_LEAF, stiffAt, toward, wideAt, youngOf, type Own, type Tier } from './layout.ts'

// A neighbor stands 0.70 to 0.85 as tall as the plant: the tops of the field are at the middle of that.
const CANOPY = 0.72
// The kinds whose leaves fill the gaps of the first rows.
const UNDER_KINDS = [0, 3, 4, 6]
// How far out the simpler plants are drawn at each quality. Past it the leaf layers and the carpet stand for them.
const FAR_REACH_M: Record<Quality, number> = { film: 1000, high: 1000, low: 27 }
const UNDER_REACH_M: Record<Quality, number> = { film: 1000, high: 1000, low: 11 }

interface Group { head: { value: THREE.Vector4 }; leafHead: { value: THREE.Vector4 }; leafOwn: { value: number }; axis: { value: THREE.Vector3 }; grow: { value: number }; bare: boolean; all: Float32Array; own: Own[]; face: Float32Array; spin: Float32Array; seen: THREE.InstancedInterleavedBuffer; still: THREE.InstancedInterleavedBuffer; count: number; index: number; tier: Tier; plant: Plant }

// One kind of neighbor, drawn once for every place of its share that is in view.
function group(detail: 'near' | 'far', variant: number, places: Float32Array, index: number, bare = false): Group {
  const seen = new THREE.InstancedInterleavedBuffer(new Float32Array(places), PLACE)
  seen.setUsage(THREE.DynamicDrawUsage)
  const plant = new Plant({ detail, variant, places: seen })
  const head = { value: new THREE.Vector4(0, 0, 0, 1) }
  const grow = { value: 0 }
  const axis = { value: new THREE.Vector3(0, 0, 1) }
  for (const m of plant.meshes) Object.assign((m.material as THREE.RawShaderMaterial).uniforms, { uHeadAt: head, uHeadGrow: grow, uHeadAxis: axis })
  // The leaves carry their own numbers late in the bloom, so they read how far those have come, and the head's place, from uniforms of their own.
  const leafHead = { value: new THREE.Vector4(0, 0, 0, 0) }
  const leafOwn = { value: 0 }
  for (const part of plant.parts) if (part.name === 'leaves') for (const m of part.meshes) Object.assign((m.material as THREE.RawShaderMaterial).uniforms, { uHeadAt: leafHead, uEarly: leafOwn })
  const count = places.length / PLACE
  const own: Own[] = []
  const face = new Float32Array(count)
  const spin = new Float32Array(count)
  for (let i = 0; i < count; i++) {
    const id = places[i * PLACE + 7]
    own.push(ownOf(id))
    face[i] = faceToward(id)
    spin[i] = leafSpin(id)
  }
  return { head, leafHead, leafOwn, axis, grow, bare, plant, all: places, own, face, spin, seen, still: leavesApart(plant, count), count, index, tier: detail }
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
    // The neighbors are swayed here, one by one, on the film second: the swell a shape takes on the plant's clock would stand still in a hold.
    fieldUniforms.uPlantWind.value = 0
    const still = { ...open, wind: 0, calm: 0 }
    const stillClose = { ...close, wind: 0, calm: 0 }
    for (const g of this.groups) {
      const clock = kindTime(timeOpen, g.index, g.tier)
      g.plant.prepare(clock, kindTime(timeClose, g.index, g.tier), still, stillClose)
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
    const spread = tall * sizeAt(CANOPY, youngOf(0.5, this.lag), this.ahead)
    const canopy = spread * (1 - squat)
    fieldUniforms.uSquat.value = squat
    fieldUniforms.uHang.value = hangAt(timeOpen)
    fieldUniforms.uWide.value = wideAt(timeOpen)
    fieldUniforms.uLate.value = lateAt(timeOpen)
    fieldUniforms.uMoon.value = now.lightKind === 'sun' ? 0 : now.night
    fieldUniforms.uDark.value = 0
    fieldUniforms.uEarly.value = earlyAt(timeOpen)
    fieldUniforms.uCanopy.value = canopy
    // How closed the crop is follows how far its leaves reach.
    fieldUniforms.uClosed.value = THREE.MathUtils.smoothstep(spread, 0.2, 0.85)
    // How little sky the crop keeps follows the size it will settle at, so the young crop is open to the sky however tall it stands.
    fieldUniforms.uDeep.value = THREE.MathUtils.smoothstep(tall * CANOPY, 0.7, 1.25)
    // The leaves in the gaps come up as the crop closes over them.
    this.rise = THREE.MathUtils.smoothstep(spread, 0.15, 0.6)
    this.far.prepare(timeOpen, timeClose, still, stillClose, eyeHeightM, canopy)
  }

  show(on: boolean): void {
    for (const g of this.groups) g.plant.visible = on
    this.far.show(on)
  }

  // Leaves out every neighbor that stands wholly to one side of the frame or behind the lens. `tanHalfWidth` is half the gate over the focal length.
  look(pose: CameraPose, tanHalfWidth: number, aspect: number): number {
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

  private fill(): number {
    const pose = this.pose as CameraPose
    const flat = Math.hypot(pose.forward.x, pose.forward.z) || 1
    const fx = pose.forward.x / flat
    const fz = pose.forward.z / flat
    const steep = Math.max(0.3, flat - (this.tanHalfWidth / this.aspect) * Math.abs(pose.forward.y))
    const spread = this.tanHalfWidth / steep
    const reach = 0.9
    const late = lateAt(this.time)
    const before = earlyAt(this.time)
    const behind = behindAt(this.time)
    // From knee height on no two neighbors stand as tall: the spread of their heights comes in as they grow.
    const uneven = Math.max(late, THREE.MathUtils.smoothstep(this.time, 14, 30))
    const stiff = stiffAt(this.time)
    const windy = this.wind > 0 || this.leafWind > 0
    this.filled = this.quality
    let total = 0
    for (const g of this.groups) {
      const all = g.all
      const clock = kindTime(this.time, g.index, g.tier)
      const early = opensEarly(g.index, g.tier)
      const local = Math.atan2(g.axis.value.x, g.axis.value.z)
      const most = g.bare ? UNDER_REACH_M[this.quality] : g.tier === 'far' ? FAR_REACH_M[this.quality] : 1000
      const seen = g.seen.array as Float32Array
      const still = g.still.array as Float32Array
      let n = 0
      for (let i = 0, k = 0; i < all.length; i += PLACE, k++) {
        const dx = all[i] - pose.position.x
        const dz = all[i + 1] - pose.position.z
        const depth = dx * fx + dz * fz
        if (depth < -reach) continue
        const side = Math.abs(dx * pose.right.x + dz * pose.right.z)
        if (side > Math.max(depth, 0) * spread + reach * (1 + spread)) continue
        if (most < 1000 && Math.hypot(dx, dz) > most) continue
        const id = all[i + 7]
        const own = g.own[k]
        const face = late > 0 ? faceAt(id, Math.hypot(all[i], all[i + 1])) : 0
        const round = early ? 1 : settled(clock, id)
        placeTurned(all, i, seen, still, n, round > 0 ? round * shortWay(g.face[k] - local - all[i + 2]) : 0)
        seen[n + 3] = still[n + 3] = sizeAt(all[i + 3], youngOf(all[i + 6], this.lag), this.ahead) * (g.bare ? this.rise : 1) * (1 + uneven * (own.tall - 1)) * (1 + behind * (own.young - 1))
        if (before > 0) {
          seen[n + 4] += before * own.leanX
          seen[n + 5] += before * own.leanZ
          still[n + 4] += before * own.leanX
          still[n + 5] += before * own.leanZ
        }
        const blown = windy ? blownOf(id, all[i], all[i + 1], this.seconds, this.wind, this.leafWind) : null
        seen[n + 7] = before > 0 ? earlyCode(own, own.bud, own.leaf + stiff * STIFF_LEAF, own.droop - stiff * 0.67 * (own.droop + 0.15)) : ownCode(own, blown ? blown.nod : 0, face)
        still[n + 7] = late > 0 ? lateLeafCode(id) : seen[n + 7]
        const off = late > 0 ? lateLean(id) : null
        const mx = (blown ? blown.x : 0) + (off ? late * off.x : 0)
        const mz = (blown ? blown.z : 0) + (off ? late * off.z : 0)
        if (blown) turnBy(seen, n, blown.head)
        turnBy(still, n, g.spin[k] + (blown ? blown.leaves : 0))
        if (mx !== 0 || mz !== 0) {
          leanBy(seen, n, mx, mz)
          leanBy(still, n, mx, mz)
        }
        if (late > 0 && !g.bare) still[n + 3] *= 1 - late * leafShort(id)
        n += PLACE
      }
      g.seen.needsUpdate = true
      g.still.needsUpdate = true
      g.plant.show(n / PLACE)
      if (g.bare) for (const part of g.plant.parts) if (part.name !== 'leaves') for (const m of part.meshes) if (m.geometry instanceof THREE.InstancedBufferGeometry) m.geometry.instanceCount = 0
      total += n / PLACE
    }
    this.shown = total
    return total
  }
}

let current: Field | null = null
// The field the film is drawing, for the field's stage part.
export const fieldNow = (): Field | null => current
