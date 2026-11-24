import * as THREE from 'three'
import { config } from '../config.ts'
import type { Assets } from '../core/assets.ts'
import type { CameraPose } from '../core/lens.ts'
import { headOpen, heightAt, rayLength, usePlant, type PlantInputs } from '../plant/growth.ts'
import { headAt } from '../plant/model.ts'
import { Plant } from '../plant/index.ts'
import { fieldUniforms, stateUniforms } from '../plant/part.ts'
import type { Quality } from '../v2/api.ts'
import { now } from '../v2/now.ts'
import { PATCHY_BY_S, patchyAt } from '../v2/wind.ts'
import { Bent } from './bent.ts'
import { FarField } from './far.ts'
import { Keyed, keyGlsl, keyUniforms, keysOn, turnOf } from './keys.ts'
import { type KindUniforms, bendKind, fieldPlaceGlsl, fieldPlaceUniforms, kindBent, kindData, kindList } from './place.ts'
import { Rime } from './rime.ts'
import { ROOM_M, bySeen, filmLens, frameOf, lensOf, needed } from './seen.ts'
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

// The frost's glints come to the neighbors over this stretch of the frost.
const RIME_FROM = 0.1
const RIME_FULL = 0.7

interface Group { head: { value: THREE.Vector4 }; leafHead: { value: THREE.Vector4 }; leafOwn: { value: number }; axis: { value: THREE.Vector3 }; grow: { value: number }; bare: boolean; rime: Rime | null; keyed: Keyed; kind: KindUniforms; own: THREE.DataTexture; shaped: Shaped; places: Float32Array; need: Uint16Array; drawn: THREE.InstancedBufferGeometry[]; count: number; index: number; tier: Tier; plant: Plant }

// One kind of neighbor, drawn once for every place of its share. Its list is written here and never again, in the order the film first sees its neighbors:
// where each one stands in a frame is worked out as it is drawn, and a frame draws only the front part of the list that it can see.
function group(detail: 'near' | 'far', variant: number, share: Float32Array, index: number, lens: Float32Array, turn: number, bare = false): Group {
  const places = bySeen(share, lens)
  const list = new THREE.InstancedInterleavedBuffer(kindList(places), PLACE)
  // What the gusts do to this kind as the script works it out, in a texture of its own.
  const own = kindBent(places.length / PLACE)
  const kind: KindUniforms = { uFieldData: { value: kindData(places) }, uFieldBent: { value: own }, uFieldBentRow: { value: 0 }, uFieldKind: { value: new THREE.Vector4(0, 1, 0, 0) }, uFieldDraw: { value: new THREE.Vector4(1, 1, 1000, 1) }, uFieldLeaf: { value: 0 } }
  const key = keyUniforms()
  const options = { detail, variant, places: list, place: { glsl: fieldPlaceGlsl + keyGlsl, uniforms: { ...fieldPlaceUniforms, ...kind, ...key } } }
  const plant = new Plant(options)
  const keyed = new Keyed(plant, index, detail, turn, key)
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
  const drawn: THREE.InstancedBufferGeometry[] = []
  for (const part of plant.parts) {
    for (const m of part.meshes) {
      if (!(m.geometry instanceof THREE.InstancedBufferGeometry) || !m.geometry.getAttribute('aPlace')) continue
      if (bare && part.name !== 'leaves') m.geometry.instanceCount = 0
      else drawn.push(m.geometry)
    }
  }
  // The full plants wear the frost's glints on their leaves.
  const blades = plant.parts.find((part) => part.name === 'leaves')?.meshes.find((m) => m.geometry.getAttribute('aLeaf'))?.geometry
  const rime = detail === 'near' && !bare && blades ? new Rime(options, blades, { uHeadAt: leafHead, uHeadGrow: grow, uHeadAxis: axis, uEarly: leafOwn, uFieldLeaf: { value: 1 } }) : null
  if (rime) drawn.push(rime.geometry)
  return { head, leafHead, leafOwn, axis, grow, bare, rime, keyed, plant, kind, own, shaped: new Shaped(), places, need: needed(places, lens), drawn, count, index, tier: detail }
}

// The neighbors: the same kind of plant at nearly the same age, in rows behind the plant. Full plants near, simpler ones behind them,
// pictures of plants behind those and one carpet to the far end. No two neighbors next to each other are the same.
export class Field {
  readonly groups: Group[]
  readonly far: FarField
  // What the gusts of the last shot do to every neighbor, from the graphics card, for a film that is played.
  private readonly bent: Bent
  // Set by a film that is played and not recorded.
  live = false
  readonly meshes: THREE.Object3D[]
  // Set by the field's own stage part before the frame is drawn, from the frame's view.
  quality: Quality = 'high'
  private time = 0
  private rimed = 0
  // How many shapes the last frame laid.
  laid = 0
  private played = false
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
  // The film's own lens at every frame, for the shape of frame the lists were last counted for.
  private lensAspect = config.formats.master.width / config.formats.master.height
  private lens = filmLens(this.lensAspect)
  private readonly mine = new Float32Array(5)
  shown = 0

  constructor() {
    const places = fieldPlaces()
    const near = new Float32Array(places.near.length + places.front.length)
    near.set(places.near)
    near.set(places.front, places.near.length)
    // Every kind that is laid in script has its own turn to be laid on: the full plants, the simpler ones, the leaves in the gaps and the plants of the pictures.
    const kinds = nearVariants.length + farVariants.length + UNDER_KINDS.length + farVariants.length
    let turn = 0
    const next = (): number => turnOf(turn++, kinds)
    this.groups = [
      ...nearVariants.map((v, i) => group('near', v, shareOf(near, i, nearVariants.length), i, this.lens, next())),
      ...farVariants.map((v, i) => group('far', v, shareOf(places.far, i, farVariants.length), i, this.lens, next())),
      ...UNDER_KINDS.map((k, i) => group('near', nearVariants[k], shareOf(places.under, i, UNDER_KINDS.length), k, this.lens, next(), true)),
    ]
    this.bent = new Bent(this.groups.map((g) => g.places))
    this.far = new FarField(places.pictures, farVariants.map(() => next()))
    this.meshes = [...this.groups.flatMap((g) => (g.rime ? [...g.plant.meshes, g.rime.points] : g.plant.meshes)), ...this.far.meshes]
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

  // A film that is played has the gusts of the last shot worked out on the graphics card: the renderer it draws with.
  card(renderer: THREE.WebGLRenderer): void {
    if (this.live) this.bent.on(renderer)
  }

  // Draws them once, so that nothing is made when they first blow.
  warm(): void {
    if (this.live) this.bent.draw(PATCHY_BY_S)
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
    // The frost shows on the neighbors as it stands on the plant, and its melt water for as long as the plant's clock stands.
    const frost = stateUniforms.uPlantFrost.value
    const melt = stateUniforms.uPlantDew.value * Math.min(1, open.held ?? 0)
    this.rimed = Math.max(THREE.MathUtils.smoothstep(frost, RIME_FROM, RIME_FULL), melt)
    // The film played as it is written is played from keys. Any other moment is laid as it comes.
    const played = keysOn && now.tau === timeOpen
    this.played = played
    this.laid = 0
    for (const g of this.groups) {
      const clock = kindTime(timeOpen, g.index, g.tier)
      if (played) {
        g.keyed.set(now.t, clock)
        g.keyed.twitch((still.lapse ?? 0) * (1 - (open.held ?? 0)), open.cold ?? 0, now.frame, now.t, heightAt(clock))
        g.shaped.forget()
        this.laid += g.keyed.laid
        g.head.value.copy(g.keyed.head)
        g.axis.value.copy(g.keyed.axis)
      } else {
        const clockClose = kindTime(timeClose, g.index, g.tier)
        if (g.shaped.again(clock, clockClose, felt)) {
          g.keyed.off()
          g.plant.prepare(clock, clockClose, still, stillClose)
        }
        usePlant(g.plant.variant, null)
        const h = headAt(clock, still)
        g.head.value.set(h.center.x, h.center.y, h.center.z, h.radius + rayLength(0, clock) + 0.03)
        g.axis.value.set(h.axis.x, h.axis.y, h.axis.z)
      }
      usePlant(g.plant.variant, null)
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
    this.far.prepare(timeOpen, timeClose, still, stillClose, felt, eyeHeightM, canopy, low, played)
    this.laid += this.far.laid
  }

  show(on: boolean): void {
    for (const g of this.groups) {
      g.plant.visible = on
      g.rime?.set(this.rimed, on)
    }
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
    u.uFieldGate.value.set(pose.right.x, pose.right.z, this.tanHalfWidth / steep, ROOM_M)
    this.filled = this.quality
    const full = heightAt(SETTLED_T)
    for (const g of this.groups) {
      const clock = kindTime(this.time, g.index, g.tier)
      const kindTall = this.played ? g.keyed.tall : heightAt(clock)
      g.kind.uFieldKind.value.set(clock, kindTall, opensEarly(g.index, g.tier) ? 1 : 0, Math.atan2(g.axis.value.x, g.axis.value.z))
      g.kind.uFieldDraw.value.set(Math.max(s.ahead, Math.min(4, full / Math.max(kindTall, 0.001))), g.bare ? this.rise * UNDER_SIZE : 1, g.bare ? UNDER_REACH_M[this.quality] : 1000, g.tier === 'far' && !g.bare ? THIN_TO[this.quality] : 1)
    }
    // A frame of the film draws the front part of each list that its lens can see. Any other lens draws them whole.
    if (Math.abs(this.aspect - this.lensAspect) > 1e-6) {
      this.lensAspect = this.aspect
      this.lens = filmLens(this.aspect)
      for (const g of this.groups) g.need = needed(g.places, this.lens)
    }
    lensOf(pose, this.tanHalfWidth, this.aspect, this.mine)
    const frame = frameOf(this.lens, this.seconds, this.mine)
    // In the last shot the gusts reach each neighbor in their own time: what they do to the ones this frame draws is worked out here.
    // A film that is played has it from the graphics card, drawn once for the frame. A recorded frame has the script's numbers, and so has a card that cannot draw them.
    const gusts = patchyAt(this.seconds) > 0 && (this.wind > 0 || this.leafWind > 0)
    const drawn = gusts && this.live && this.bent.draw(this.seconds)
    let shown = 0
    for (let i = 0; i < this.groups.length; i++) {
      const g = this.groups[i]
      const count = frame < 0 ? g.count : g.need[frame]
      for (const geometry of g.drawn) geometry.instanceCount = count
      if (gusts) {
        g.kind.uFieldBent.value = drawn ? this.bent.texture : g.own
        g.kind.uFieldBentRow.value = drawn ? this.bent.rows[i] : 0
        if (!drawn && count > 0) bendKind(g.own, g.places, count, this.seconds)
      }
      shown += count
    }
    this.shown = shown
    return shown
  }
}

let current: Field | null = null
// The field the film is drawing, for the field's stage part.
export const fieldNow = (): Field | null => current
