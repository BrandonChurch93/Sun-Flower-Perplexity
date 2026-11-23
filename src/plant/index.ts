import * as THREE from 'three'
import { config, frameCount } from '../config.ts'
import type { Assets } from '../core/assets.ts'
import { declareStandIn } from '../core/standins.ts'
import { shared, type Surface } from '../core/shading.ts'
import type { Caster } from '../core/shadow.ts'
import { headOpen, paleness, usePlant, type Place, type PlantInputs } from './growth.ts'
import { real as hairsReal } from './hairs/index.ts'
import { create as createBud } from './head/bud/index.ts'
import { create as createDisc } from './head/disc/index.ts'
import { create as createPetals } from './head/petals/index.ts'
import { create as createLeaves } from './leaves/index.ts'
import { plantColorGlsl } from './look/body.ts'
import { filling, makePartSurface, partGeometry, partMesh, stateUniforms, wetFelt, type PartDetail, type PartMaker, type PartOptions, type PlantPart } from './part.ts'
import { create as createSeedling } from './seedling/index.ts'
import { poseAt } from './skeleton.ts'
import { HERO, PART, buildStandIn, plantNumbers, standInTopology, tipAt, vertexCountOf, type Detail } from './standin.ts'
import { create as createStem } from './stem/index.ts'
import { real as surfaceReal, tissueGlsl } from './surface/index.ts'
import { cell, restless } from './wind.ts'
import { HOLD_FRAMES, plantInputsOf } from '../v2/inputs.ts'
import { blankMoment, momentAt } from '../v2/now.ts'

const vertex = /* glsl */ `
in vec3 position;
#ifndef PLANT_FIELD
in vec3 positionB;
#endif
in vec3 normal;
in vec2 uv;
in vec3 aInfo;
out vec3 vWorld;
out vec3 vNormal;
out vec2 vUv;
out vec3 vInfo;
out float vDepth;
void main() {
#ifdef PLANT_FIELD
  vec4 world = vec4(plantWorld(position), 1.0);
  vNormal = plantDirection(normal);
#else
  vec4 world = vec4(plantWorld(mix(position, positionB, plantBlend())), 1.0);
  vNormal = normal;
#endif
  vec4 view = viewMatrix * world;
  vWorld = world.xyz;
  vUv = uv;
  vInfo = aInfo;
  vDepth = -view.z;
  gl_Position = projectionMatrix * view;
}
`

const fragment = /* glsl */ `
in vec3 vWorld;
in vec3 vNormal;
in vec2 vUv;
in vec3 vInfo;
in float vDepth;
${plantColorGlsl}
${tissueGlsl}
void main() {
  vec3 n = normalize(vNormal);
  vec3 v = normalize(uCamPos - vWorld);
#ifdef PLANT_FIELD
  bool front = true;
  if (dot(n, v) < 0.0) n = -n;
#else
  bool front = gl_FrontFacing;
  if (!front) n = -n;
#endif
  Tissue t;
  plantColor(int(vInfo.x + 0.5), vUv, vInfo.z, front, t.albedo, t.through);
  t.normal = n;
  t.face = n;
  t.rough = 0.8;
  t.wax = 0.1;
  t.sheen = 1.0;
  t.occlusion = 1.0;
  outColor = finish(shadeTissue(t, vWorld, v), vWorld, vDepth, -1.0);
}
`

// How finely the neighbors are built.
const NEAR: Detail = { stemRings: 6, stemSides: 4, seedU: 3, seedV: 2, huskRings: 0, huskSides: 0, leafStep: 2, leafU: 4, leafV: 3, bodyRings: 4, bodySides: 7, bractStep: 3, bractU: 3, bractV: 2, rayStep: 2, rayU: 3, rayV: 2 }
const FAR: Detail = { stemRings: 2, stemSides: 4, seedU: 0, seedV: 0, huskRings: 0, huskSides: 0, leafStep: 5, leafU: 3, leafV: 2, bodyRings: 3, bodySides: 6, bractStep: 0, bractU: 0, bractV: 0, rayStep: 5, rayU: 3, rayV: 2 }
const DETAIL: Record<PartDetail, Detail> = { hero: HERO, near: NEAR, far: FAR }

const bit = (part: number) => 1 << part
const ALL = bit(PART.stem) | bit(PART.leaf) | bit(PART.seedLeaf) | bit(PART.husk) | bit(PART.body) | bit(PART.bract) | bit(PART.ray)

// The real parts, in the order they are drawn, with the stand-in pieces each one draws instead of.
const SLOTS: { name: string; make: PartMaker; pieces: number; rigid?: boolean }[] = [
  { name: 'stem', make: createStem, pieces: bit(PART.stem) },
  { name: 'leaves', make: createLeaves, pieces: bit(PART.leaf) },
  { name: 'seedling', make: createSeedling, pieces: bit(PART.seedLeaf) | bit(PART.husk) },
  { name: 'bud', make: createBud, pieces: bit(PART.body) | bit(PART.bract), rigid: true },
  { name: 'disc', make: createDisc, pieces: 0, rigid: true },
  { name: 'petals', make: createPetals, pieces: bit(PART.ray), rigid: true },
]

export interface PlantOptions {
  // 0 is the plant. Any other number builds a neighbor with its own small differences.
  variant?: number
  detail?: PartDetail
  // The places of the neighbors, when one shape is drawn once per neighbor.
  places?: THREE.InstancedInterleavedBuffer | null
  // Where this plant stands, for the wind that reaches it. The plant stands at the middle.
  at?: Place
  // The field's own way to say where each neighbor stands, in place of the list: GLSL that defines Place fieldPlace(), and its uniforms.
  place?: { glsl: string; uniforms: Record<string, { value: unknown }> }
}

const FPS = config.film.fps
// How much of a frame the shutter stands open.
const SHUTTER_SHARE = config.film.shutterDegrees / 360
// The plant's shape is laid at key frames only, this many frames apart at most, and every frame is drawn as a mix of the two keys round it. A key stands on the film's first and last frame and on both ends of each hold, and a hold is one stretch.
export const KEY_EVERY = 8
// Off until every part keeps its normals and the numbers of its skin once for each key: with one set for both, the light on the plant steps at every key and the stem's skin slides between them. In the two holds the keys are one shape, and they are on.
const KEYS_WHILE_GROWING = false
// The key frames of the film, in order.
export function keyFrames(every: number): number[] {
  const keys: number[] = []
  const edges = [0, ...HOLD_FRAMES.flat(), frameCount - 1]
  for (let e = 0; e + 1 < edges.length; e++) {
    const held = HOLD_FRAMES.some(([from]) => from === edges[e])
    for (let f = edges[e]; f < edges[e + 1]; f += held ? edges[e + 1] - edges[e] : every) keys.push(f)
  }
  keys.push(frameCount - 1)
  return keys
}
const KEYS = keyFrames(KEY_EVERY)
// The key at or before each frame, by its place in KEYS.
const KEY_OF = new Int32Array(frameCount)
for (let f = 0, k = 0; f < frameCount; f++) {
  if (k + 1 < KEYS.length && KEYS[k + 1] <= f) k++
  KEY_OF[f] = k
}

// What a key is laid from: the plant's clock and what it feels on that frame, in still air, and the state of its skin there.
interface Key { frame: number; time: number; inputs: PlantInputs; real: number; wet: number; frost: number; dew: number; tip: THREE.Vector3 }
const scratch = blankMoment()
function keyAt(frame: number, out: Key): Key {
  if (out.frame === frame) return out
  const m = momentAt(frame / FPS, scratch)
  const felt = plantInputsOf(m)
  out.frame = frame
  out.time = m.tau
  out.inputs = { ...felt, wind: 0, calm: 0, gust: 0, rain: 0, lapse: 0 }
  out.real = felt.stood ?? m.t
  out.wet = m.dials.wet
  out.frost = m.dials.frost
  out.dew = m.dials.dew
  tipAt(out.time, { ...out.inputs, steady: false }, out.tip)
  return out
}
const newKey = (): Key => ({ frame: -1, time: 0, inputs: { leanX: 0, leanZ: 0, lift: 1, wind: 0 }, real: 0, wet: 0, frost: 0, dew: 0, tip: new THREE.Vector3() })
// How far a leaf twitches from frame to frame in the fastest time lapse, in radians.
const TWITCH = 0.05
const TAU = 2 * Math.PI
const NO_SCALE = new THREE.Matrix4().makeScale(0, 0, 0)

const SIGNED_EACH = 11
const SIGNED = 2 + 2 * SIGNED_EACH + 3

// The inputs the shape is filled from: the air of a plant whose clock stands is taken out of them.
function stilled(inputs: PlantInputs): PlantInputs {
  const held = inputs.held ?? 0
  if (held <= 0) return inputs
  const free = 1 - held
  const less = (v: number | undefined): number | undefined => (v === undefined ? undefined : v * free)
  return { ...inputs, wind: inputs.wind * free, calm: less(inputs.calm), gust: less(inputs.gust), rain: less(inputs.rain), lapse: less(inputs.lapse) }
}

// Every number of the inputs a shape depends on. The film second counts only while something runs on it.
function sign(inputs: PlantInputs, out: Float64Array, at: number): void {
  const held = inputs.held ?? 0
  const runs = inputs.wind > 0 || (inputs.gust ?? 0) > 0 || (inputs.lapse ?? 0) > 0 || (held < 1 && ((inputs.rain ?? 0) > 0 || (inputs.cold ?? 0) > 0))
  out[at] = inputs.leanX
  out[at + 1] = inputs.leanZ
  out[at + 2] = inputs.lift
  out[at + 3] = inputs.liftLow ?? -1
  out[at + 4] = inputs.wind
  out[at + 5] = inputs.calm ?? -1
  out[at + 6] = inputs.lapse ?? -1
  out[at + 7] = inputs.cold ?? -1
  out[at + 8] = inputs.rain ?? -1
  out[at + 9] = inputs.gust ?? -1
  out[at + 10] = runs ? (inputs.real ?? -1) : held
}

export class Plant {
  readonly variant: number
  readonly detail: PartDetail
  // The stand-in: every piece no real part has taken over yet.
  readonly surface: Surface
  readonly mesh: THREE.Mesh
  readonly parts: PlantPart[] = []
  readonly meshes: THREE.Mesh[]
  readonly casters: Caster[]
  private readonly shape: Detail
  private readonly a: THREE.BufferAttribute
  private readonly b: THREE.BufferAttribute | null
  private readonly n: THREE.BufferAttribute
  private readonly hide: number
  private on = true
  private readonly stands = { held: 0 }
  private readonly own = { uOwnAir: { value: new THREE.Vector4(0, 0, 0, 0) }, uOwnTip: { value: new THREE.Vector3(0, 1, 0) }, uOwnMix: { value: new THREE.Vector2(0, 1) }, uOwnLapse: { value: new THREE.Vector4(0, 0, 0, 0) } }
  // The key frame each slot of each part holds, and the key the part's unslotted numbers were laid from. The stand-in is listed under null.
  private readonly holds = new Map<PlantPart | null, Int32Array>()
  private readonly keys = [newKey(), newKey()]
  private readonly now = blankMoment()
  private readonly laid: PlantPart[] = []
  // The parts drawn with no size, so the graphics card has them before they exist.
  private readonly unborn = new Set<PlantPart>()
  // What the shape was last filled from: while none of it changes, the shape stands as it is with the graphics card.
  private readonly filled = new Float64Array(SIGNED).fill(NaN)
  private readonly asked = new Float64Array(SIGNED)
  private readonly live: PlantPart[] = []
  private readonly drawn = new Set<PlantPart>()
  private readonly away = new Set<PlantPart>()
  // Null when the shape is drawn once per neighbor: the field sways each of those where it stands.
  private readonly at: Place | null

  constructor(o: PlantOptions = {}) {
    this.variant = o.variant ?? 0
    this.detail = o.detail ?? 'hero'
    const places = o.places ?? null
    this.at = places ? null : (o.at ?? { x: 0, z: 0 })
    const options: PartOptions = { detail: this.detail, variant: this.variant, places, own: this.own, stands: this.stands, place: places ? o.place : undefined }
    const who = places ? 'neighbors' : 'plant'
    let hide = 0
    for (const slot of SLOTS) {
      const part = slot.make(slot.rigid ? { ...options, rigid: true } : options)
      if (part) {
        this.parts.push(part)
        hide |= slot.pieces
      } else declareStandIn(`${who} ${slot.name}`)
    }
    if (!hairsReal) declareStandIn('plant hairs')
    if (!surfaceReal) declareStandIn('plant surface')
    this.hide = hide
    this.shape = DETAIL[this.detail]
    const count = vertexCountOf(this.shape)
    const topology = standInTopology(this.shape)
    const geometry = partGeometry(options)
    const dynamic = () => new THREE.BufferAttribute(new Float32Array(count * 3), 3).setUsage(THREE.DynamicDrawUsage)
    this.a = dynamic()
    this.b = places ? null : dynamic()
    this.n = dynamic()
    geometry.setAttribute('position', this.a)
    if (this.b) geometry.setAttribute('positionB', this.b)
    geometry.setAttribute('normal', this.n)
    geometry.setAttribute('uv', new THREE.BufferAttribute(topology.uv, 2))
    geometry.setAttribute('aInfo', new THREE.BufferAttribute(topology.info, 3))
    geometry.setIndex(new THREE.BufferAttribute(topology.index, 1))
    const name = places ? 'field stand-in' : this.variant === 0 ? 'plant stand-in' : 'companion stand-in'
    this.surface = makePartSurface(options, { name, vertex, fragment, side: THREE.DoubleSide, standIn: true, uniforms: { uPale: { value: 0 }, uBloom: { value: 0 } } })
    this.mesh = partMesh(geometry, this.surface)
    this.mesh.visible = hide !== ALL
    this.meshes = [this.mesh, ...this.parts.flatMap((p) => p.meshes)]
    this.holds.set(null, new Int32Array(3).fill(-1))
    for (const part of this.parts) this.holds.set(part, new Int32Array(3).fill(-1))
    this.casters = places ? [] : [{ mesh: this.mesh, surface: this.surface }, ...this.parts.flatMap((p) => p.casters)]
  }

  async load(assets: Assets): Promise<void> {
    for (const part of this.parts) await part.load?.(assets)
  }

  // Where the whole plant stands: every mesh of it takes the same matrix.
  place(matrix: THREE.Matrix4): void {
    for (const m of this.meshes) {
      m.matrixAutoUpdate = false
      m.matrix.copy(matrix)
      m.matrixWorld.copy(matrix)
    }
  }

  // How many neighbors are drawn, when the plant is drawn once per neighbor.
  show(count: number): void {
    for (const m of this.meshes) if (m.geometry instanceof THREE.InstancedBufferGeometry && m.geometry.getAttribute('aPlace')) m.geometry.instanceCount = count
  }

  set visible(on: boolean) {
    this.on = on
    for (const m of this.meshes) m.visible = on && (m !== this.mesh || this.hide !== ALL)
    for (const part of this.away) for (const m of part.meshes) m.visible = false
  }

  // A part that does not exist at this moment is hidden, but it is drawn once first, with no size, so the graphics card has all of it from the start.
  private showPart(part: PlantPart, gone: boolean): boolean {
    const away = gone && this.drawn.has(part)
    if (away) this.away.add(part)
    else {
      this.away.delete(part)
      this.drawn.add(part)
    }
    if (gone && !away) {
      this.unborn.add(part)
      for (const m of part.meshes) m.matrixWorld.copy(NO_SCALE)
    } else if (this.unborn.delete(part)) for (const m of part.meshes) m.matrixWorld.copy(this.mesh.matrixWorld)
    for (const m of part.meshes) m.visible = this.on && !away
    return !away
  }

  // Lays one key into one slot of the parts that lack it.
  private lay(key: Key, slot: 0 | 1, hi: number): void {
    const stand = this.holds.get(null) as Int32Array
    const parts = this.laid
    parts.length = 0
    for (const part of this.live) {
      const held = this.holds.get(part) as Int32Array
      if (held[slot] !== key.frame || (key.frame === hi && held[2] !== hi)) parts.push(part)
    }
    const standIn = this.hide !== ALL && (stand[slot] !== key.frame || (key.frame === hi && stand[2] !== hi))
    if (!parts.length && !standIn) return
    const real = shared.uReal.value
    const wet = stateUniforms.uPlantWet.value
    const frost = stateUniforms.uPlantFrost.value
    const dew = stateUniforms.uPlantDew.value
    shared.uReal.value = key.real
    stateUniforms.uPlantWet.value = key.wet
    stateUniforms.uPlantFrost.value = key.frost
    stateUniforms.uPlantDew.value = key.dew
    filling.held = 1
    filling.lead = true
    if (standIn) {
      const to = slot === 0 ? this.a : (this.b as THREE.BufferAttribute)
      buildStandIn(key.time, key.inputs, to.array as Float32Array, this.n.array as Float32Array, this.shape, this.hide)
      to.needsUpdate = true
      this.n.needsUpdate = true
      stand[slot] = key.frame
      stand[2] = key.frame
    }
    if (parts.length) {
      const pose = poseAt(key.time, key.inputs)
      for (const part of parts) {
        part.fill(slot, pose)
        const held = this.holds.get(part) as Int32Array
        held[slot] = key.frame
        held[2] = key.frame
      }
      for (const part of parts) part.finish(key.time, key.inputs)
    }
    shared.uReal.value = real
    stateUniforms.uPlantWet.value = wet
    stateUniforms.uPlantFrost.value = frost
    stateUniforms.uPlantDew.value = dew
  }

  // Draws the frame as a mix of the two keys round it, when it is a frame of the film and the plant feels what the film says it feels there. The shape then depends on the frame's number and on nothing drawn before it.
  private play(timeOpen: number, felt: PlantInputs): boolean {
    const frame = shared.uFrame.value
    if (this.at === null || !this.b || !(frame >= 0 && frame < frameCount)) return false
    if (!KEYS_WHILE_GROWING && !HOLD_FRAMES.some(([from, to]) => frame >= from && frame <= to)) return false
    const m = momentAt(frame / FPS, this.now)
    if (m.tau !== timeOpen) return false
    const here = plantInputsOf(m)
    if (here.leanX !== felt.leanX || here.leanZ !== felt.leanZ || here.lift !== felt.lift || here.wind !== felt.wind || here.real !== felt.real || here.cold !== felt.cold) return false
    usePlant(this.variant, this.at)
    const i = KEY_OF[frame]
    const j = Math.min(i + 1, KEYS.length - 1)
    const first = keyAt(KEYS[i], this.keys[i & 1])
    const second = keyAt(KEYS[j], this.keys[j & 1])
    const span = Math.max(second.frame - first.frame, 1)
    let w = (frame - first.frame) / span
    let dw = SHUTTER_SHARE / span
    if (span > KEY_EVERY) {
      // The two ends of a hold are one shape and differ only in what frost, dew and water lay on it, so between them the mix follows the dial that moves most and not the time.
      const d = m.dials
      const frost = second.frost - first.frost
      const wet = second.wet - first.wet
      const dew = second.dew - first.dew
      const most = Math.max(Math.abs(frost), Math.abs(wet), Math.abs(dew))
      if (most > 1e-6) w = Math.abs(frost) === most ? (d.frost - first.frost) / frost : Math.abs(wet) === most ? (d.wet - first.wet) / wet : (d.dew - first.dew) / dew
      w = Math.min(Math.max(w, 0), 1)
      dw = 0
    }
    // Key n lies in slot n mod 2, so the second slot holds the later key of one stretch and the earlier key of the next.
    const slot = (i & 1) as 0 | 1
    this.own.uOwnMix.value.set(slot === 0 ? w : 1 - w, slot === 0 ? dw : -dw)
    this.own.uOwnAir.value.set(Math.min(felt.calm ?? felt.wind, felt.wind), felt.wind, felt.gust ?? 0, felt.rain ?? 0)
    this.own.uOwnTip.value.copy(first.tip).lerp(second.tip, w)
    const lapse = (felt.lapse ?? 0) * (1 - (felt.held ?? 0))
    const real = felt.real ?? timeOpen
    this.own.uOwnLapse.value.set(lapse, lapse > 0 ? 0.5 * restless(real, frame, 0.37 + 0.11 * this.variant) : 0, lapse * TWITCH * (1 - 0.7 * (felt.cold ?? 0)) * (1 + 2 * felt.wind), TAU * cell(frame, 0.61 + 0.11 * this.variant))
    this.stands.held = 1
    this.filled.fill(NaN)
    const live = this.live
    live.length = 0
    for (const part of this.parts) if (this.showPart(part, part.absent?.(first.time) === true && part.absent(second.time) === true)) live.push(part)
    const heldWas = filling.held
    this.lay(first, slot, second.frame)
    if (j !== i) this.lay(second, (1 - slot) as 0 | 1, second.frame)
    filling.held = heldWas
    usePlant(0)
    this.surface.main.uniforms.uPale.value = paleness(timeOpen)
    this.surface.main.uniforms.uBloom.value = headOpen(timeOpen)
    return true
  }

  prepare(timeOpen: number, timeClose: number, feltOpen: PlantInputs, feltClose: PlantInputs): void {
    if (this.play(timeOpen, feltOpen)) return
    for (const held of this.holds.values()) held.fill(-1)
    this.own.uOwnMix.value.set(0, 1)
    this.own.uOwnLapse.value.set(0, 0, 0, 0)
    usePlant(this.variant, this.at)
    // While the plant's clock stands the air moves it where it is drawn, so the shape is filled for still air and stays as it is.
    const open = stilled(feltOpen)
    const close = stilled(feltClose)
    const held = feltOpen.held ?? 0
    this.own.uOwnAir.value.set(held * Math.min(feltOpen.calm ?? feltOpen.wind, feltOpen.wind), held * feltOpen.wind, held * (feltOpen.gust ?? 0), held * (feltOpen.rain ?? 0))
    if (held > 0) tipAt(timeOpen, { ...open, steady: false }, this.own.uOwnTip.value)
    const asked = this.asked
    asked[0] = timeOpen
    asked[1] = timeClose
    sign(open, asked, 2)
    sign(close, asked, 2 + SIGNED_EACH)
    filling.held = held
    this.stands.held = Math.min(held, feltClose.held ?? 0)
    asked[SIGNED - 3] = stateUniforms.uPlantFrost.value
    asked[SIGNED - 2] = wetFelt()
    asked[SIGNED - 1] = stateUniforms.uPlantDew.value
    let same = true
    for (let i = 0; i < SIGNED; i++) if (asked[i] !== this.filled[i]) same = false
    // Only a plant whose clock stands is left as it is: any other is laid for this frame, so a frame never depends on the one drawn before it.
    if (same && this.stands.held >= 1) {
      usePlant(0)
      return
    }
    this.filled.set(asked)
    // What is laid while the clock stands is laid as of the instant it stopped and for the wet in steps, so it is the same whichever frame of the hold it is laid on.
    const realNow = shared.uReal.value
    const wetNow = stateUniforms.uPlantWet.value
    if (this.stands.held >= 1 && feltOpen.stood !== undefined) {
      shared.uReal.value = feltOpen.stood
      stateUniforms.uPlantWet.value = wetFelt()
    }
    if (this.hide !== ALL) {
      buildStandIn(timeOpen, open, this.a.array as Float32Array, this.n.array as Float32Array, this.shape, this.hide)
      if (this.b) buildStandIn(timeClose, close, this.b.array as Float32Array, null, this.shape, this.hide)
      this.a.needsUpdate = true
      if (this.b) this.b.needsUpdate = true
      this.n.needsUpdate = true
    }
    if (this.parts.length) {
      // A part that does not exist yet, or no longer, is not filled and not drawn. Each is drawn once first, so the graphics card has all of it from the start.
      const live = this.live
      live.length = 0
      for (const part of this.parts) {
        if (this.at === null) live.push(part)
        else if (this.showPart(part, part.absent?.(timeOpen) === true && part.absent(timeClose) === true)) live.push(part)
      }
      const first = poseAt(timeOpen, open)
      filling.lead = true
      for (const part of live) part.fill(0, first)
      const second = poseAt(timeClose, close)
      filling.lead = false
      for (const part of live) part.fill(1, second)
      filling.lead = true
      for (const part of live) part.finish(timeOpen, open)
    }
    shared.uReal.value = realNow
    stateUniforms.uPlantWet.value = wetNow
    usePlant(0)
    this.surface.main.uniforms.uPale.value = paleness(timeOpen)
    this.surface.main.uniforms.uBloom.value = headOpen(timeOpen)
  }

  tip(time: number, inputs: PlantInputs, out: THREE.Vector3): THREE.Vector3 {
    tipAt(time, inputs, out)
    return out
  }

  numbers(time: number, inputs: PlantInputs): number[] {
    return plantNumbers(time, inputs)
  }
}
