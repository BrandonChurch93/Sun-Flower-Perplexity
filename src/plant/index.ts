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
import pace from './pace.json'
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
// `turn` is the frame of each stretch of keys on which the part is laid: the head is one thing and is laid together.
const SLOTS: { name: string; make: PartMaker; pieces: number; turn: number; rigid?: boolean }[] = [
  { name: 'stem', make: createStem, pieces: bit(PART.stem), turn: 0 },
  { name: 'leaves', make: createLeaves, pieces: bit(PART.leaf), turn: 2 },
  { name: 'seedling', make: createSeedling, pieces: bit(PART.seedLeaf) | bit(PART.husk), turn: 6 },
  { name: 'bud', make: createBud, pieces: bit(PART.body) | bit(PART.bract), turn: 4, rigid: true },
  { name: 'disc', make: createDisc, pieces: 0, turn: 4, rigid: true },
  { name: 'petals', make: createPetals, pieces: bit(PART.ray), turn: 4, rigid: true },
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
// The parts drawn from keys while the plant grows, each on its own switch. A part that is off has a key on every frame, so it is true to each frame and still moves in the same air as the parts that are on. With none on, a growing plant is laid whole for every frame. In the two holds the keys are one shape, and they are always on.
export const keyed: Record<string, boolean> = { stem: false, leaves: false, seedling: false, bud: false, disc: false, petals: false }
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
// What the plant feels at every frame of the film, in still air: its clock, its lean both ways, the lift of its upper and of its lower leaves, and the cold in it.
const FELT = 6
let feltAll: Float64Array | null = null
function feltAt(): Float64Array {
  if (feltAll) return feltAll
  const all = new Float64Array(frameCount * FELT)
  const m = blankMoment()
  for (let f = 0; f < frameCount; f++) {
    const felt = plantInputsOf(momentAt(f / FPS, m))
    const at = f * FELT
    all[at] = m.tau
    all[at + 1] = felt.leanX
    all[at + 2] = felt.leanZ
    all[at + 3] = felt.lift
    all[at + 4] = felt.liftLow ?? felt.lift
    all[at + 5] = felt.cold ?? 0
  }
  feltAll = all
  return all
}
type Pace = { turn: number[]; speed: number[]; lean: number[]; lift: number[]; low: number[]; cold: number[] }
const PACES = pace.kinds as Record<string, Pace>
// How far a mix of two keys may stand off the true shape: 1.5 mm, or 0.15 percent of the plant's height where that is more.
const STRAY_MM = 1.5
const STRAY_OF_HEIGHT = 0.0015
// The most a part's mix of two keys strays from its true shape between them, in millimeters, by what the part is known to do: how sharply its shape turns with the clock there, and how far it moves with each thing the plant feels, times how far that thing leaves the straight line between the keys.
function strays(kind: Pace, atA: number, ofA: number, atB: number, ofB: number): number {
  const felt = feltAt()
  const a = ofA * FELT
  const b = ofB * FELT
  const off = [0, 0, 0, 0, 0, 0]
  for (let f = atA + 1; f < atB; f++) {
    const w = (f - atA) / (atB - atA)
    for (let c = 0; c < FELT; c++) off[c] = Math.max(off[c], Math.abs(felt[f * FELT + c] - (felt[a + c] + (felt[b + c] - felt[a + c]) * w)))
  }
  const from = Math.min(felt[a], felt[b])
  const to = Math.max(felt[a], felt[b])
  const last = kind.turn.length - 1
  let turn = 0
  let speed = 0
  let lean = 0
  let lift = 0
  let low = 0
  let cold = 0
  for (let bin = Math.min(last, Math.floor(from / pace.step)); bin <= Math.min(last, Math.floor(to / pace.step)); bin++) {
    turn = Math.max(turn, kind.turn[bin])
    speed = Math.max(speed, kind.speed[bin])
    lean = Math.max(lean, kind.lean[bin])
    lift = Math.max(lift, kind.lift[bin])
    low = Math.max(low, kind.low[bin])
    cold = Math.max(cold, kind.cold[bin])
  }
  const span = to - from
  return (turn * span * span) / 8 + speed * off[0] + lean * (off[1] + off[2]) + lift * off[3] + low * off[4] + cold * off[5]
}
function strayLimit(frame: number): number {
  const tall = pace.tall[Math.min(pace.tall.length - 1, Math.floor(feltAt()[frame * FELT] / pace.step))]
  return Math.max(STRAY_MM, STRAY_OF_HEIGHT * 1000 * tall)
}

// The keys of one part of the film. Every part has its own turn among the frames of each stretch of KEY_EVERY and its keys fall on that turn, so two parts are seldom laid on the same frame. The key that falls last before a hold or first after it is laid as the hold's own end: the clock has all but stopped there, the hold then has one key at each end, and nothing is laid inside it. Where a part's shape would stray from the truth between two keys, a key more is set halfway, and again, down to every frame: a part that moves fast for a moment is laid often for that moment only.
interface Turn { at: Int32Array; of: Int32Array; held: Uint8Array; index: Int32Array }
const turns = new Map<string, Turn>()
function turnOf(turn: number, name: string | null, every = KEY_EVERY): Turn {
  const phase = turn % every
  const known = turns.get(`${name} ${phase} ${every}`)
  if (known) return known
  const last = frameCount - 1
  const at = [0]
  const of = [0]
  const up = (v: number) => ((v % every) + every) % every
  for (let f = 1; f < last; f++) {
    if (f % every !== phase) continue
    let from = f
    for (const [start, end] of HOLD_FRAMES) {
      const before = start - up(start - phase)
      const after = end + up(phase - end)
      if (f === before) from = start
      else if (f === after) from = end
      else if (f > before && f < after) from = -1
    }
    if (from < 0) continue
    at.push(f)
    of.push(from)
  }
  at.push(last)
  of.push(last)
  const inHold = (k: number) => HOLD_FRAMES.some(([start, end]) => of[k] === start && of[k + 1] === end)
  const kind = name === null ? undefined : PACES[name]
  if (kind) {
    for (let k = 0; k + 1 < at.length; ) {
      if (at[k + 1] - at[k] < 2 || inHold(k) || strays(kind, at[k], of[k], at[k + 1], of[k + 1]) <= strayLimit(of[k])) {
        k++
        continue
      }
      const half = at[k] + ((at[k + 1] - at[k]) >> 1)
      at.splice(k + 1, 0, half)
      of.splice(k + 1, 0, half)
    }
  }
  const held = new Uint8Array(at.length)
  for (let k = 0; k + 1 < at.length; k++) if (inHold(k)) held[k] = 1
  // The key at or before each frame. The last key ends the last stretch, so a slot is never left with what an earlier frame laid.
  const index = new Int32Array(frameCount)
  for (let f = 0, k = 0; f < frameCount; f++) {
    while (k + 2 < at.length && at[k + 1] <= f) k++
    index[f] = k
  }
  const made = { at: Int32Array.from(at), of: Int32Array.from(of), held, index }
  turns.set(`${name} ${phase} ${every}`, made)
  return made
}

// What a slot is laid from: the plant's clock and what it feels there, in still air, and the state of its skin. `serial` names the laying: a part holds a slot's key when it holds its serial.
interface Key { serial: number; time: number; inputs: PlantInputs; real: number; wet: number; frost: number; dew: number; tip: THREE.Vector3; sign: Float64Array }
// The state of the skin a key is laid in.
export interface KeySkin { real: number; wet: number; frost: number; dew: number }
const KEY_SIGNED = 12
const newKey = (): Key => ({ serial: -1, time: 0, inputs: { leanX: 0, leanZ: 0, lift: 1, wind: 0, calm: 0, gust: 0, rain: 0, lapse: 0 }, real: 0, wet: 0, frost: 0, dew: 0, tip: new THREE.Vector3(), sign: new Float64Array(KEY_SIGNED).fill(NaN) })
// A key frame of the film: the plant's clock there, what the plant feels there and the state of its skin.
interface FilmKey extends KeySkin { frame: number; time: number; inputs: PlantInputs }
const scratch = blankMoment()
function keyAt(frame: number, out: FilmKey): FilmKey {
  if (out.frame === frame) return out
  const m = momentAt(frame / FPS, scratch)
  const felt = plantInputsOf(m)
  out.frame = frame
  out.time = m.tau
  // A key is laid in still air: the air moves the plant where it is drawn.
  out.inputs = { leanX: felt.leanX, leanZ: felt.leanZ, lift: felt.lift, liftLow: felt.liftLow, cold: felt.cold, real: felt.real, held: felt.held, stood: felt.stood, steady: felt.steady, wind: 0, calm: 0, gust: 0, rain: 0, lapse: 0 }
  out.real = felt.stood ?? m.t
  out.wet = m.dials.wet
  out.frost = m.dials.frost
  out.dew = m.dials.dew
  return out
}
const newFilmKey = (): FilmKey => ({ frame: -1, time: 0, inputs: { leanX: 0, leanZ: 0, lift: 1, wind: 0 }, real: 0, wet: 0, frost: 0, dew: 0 })
// What a part plays the film from: its turn, the two keys round the frame, and its own mix of its two slots.
// `next` is the key after those two and `ahead` how much of it lies in the part's spare shape: the key it is, 0 for none, and the share of it laid.
interface Play { turn: Turn; film: [FilmKey, FilmKey]; mix: THREE.Vector2; next: FilmKey; ahead: { of: number; done: number }; spread: boolean }
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
  private readonly own = { uOwnAir: { value: new THREE.Vector4(0, 0, 0, 0) }, uOwnTip: { value: new THREE.Vector3(0, 1, 0) }, uOwnMix: { value: new THREE.Vector2(0, 1) }, uOwnKeys: { value: 0 }, uOwnLapse: { value: new THREE.Vector4(0, 0, 0, 0) } }
  // The key frame each slot of each part holds, and the key the part's unslotted numbers were laid from. The stand-in is listed under null.
  private readonly holds = new Map<PlantPart | null, Int32Array>()
  private readonly keys = [newKey(), newKey()]
  // How each part plays the film. The stand-in is listed under null, and its keys are the ones the stem's end is taken from.
  private readonly plays = new Map<PlantPart | null, Play>()
  private readonly tips = [new THREE.Vector3(), new THREE.Vector3()]
  private readonly tipOf = [-1, -1]
  private serial = 0
  private readonly growsByKeys = Object.values(keyed).some((on) => on)
  private readonly signing = new Float64Array(KEY_SIGNED)
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
    const turned = this.variant === 0 ? 0 : 1
    this.plays.set(null, { turn: turnOf(turned, null), film: [newFilmKey(), newFilmKey()], mix: this.own.uOwnMix.value, next: newFilmKey(), ahead: { of: 0, done: 0 }, spread: false })
    for (const slot of SLOTS) {
      // Each part mixes its two slots by its own share, since each is laid on its own turn.
      const mix = new THREE.Vector2(0, 1)
      const part = slot.make({ ...options, own: { ...this.own, uOwnMix: { value: mix } }, rigid: slot.rigid, ahead: keyed[slot.name] })
      if (part) {
        this.parts.push(part)
        this.plays.set(part, { turn: keyed[slot.name] ? turnOf((slot.turn + turned) % KEY_EVERY, slot.name) : turnOf(0, null, 1), film: [newFilmKey(), newFilmKey()], mix, next: newFilmKey(), ahead: { of: 0, done: 0 }, spread: keyed[slot.name] && part.spare === true })
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

  // Lays a slot's key into the parts that lack it. What a part keeps once and not for each slot is taken from the slot named `later`, so that slot is laid last.
  private lay(slot: 0 | 1, later: 0 | 1): void {
    const key = this.keys[slot]
    const stand = this.holds.get(null) as Int32Array
    const parts = this.laid
    parts.length = 0
    for (const part of this.live) {
      const held = this.holds.get(part) as Int32Array
      if (held[slot] !== key.serial || (slot === later && held[2] !== key.serial)) parts.push(part)
    }
    const standIn = this.hide !== ALL && (stand[slot] !== key.serial || (slot === later && stand[2] !== key.serial))
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
      stand[slot] = key.serial
      stand[2] = key.serial
    }
    if (parts.length) {
      const pose = poseAt(key.time, key.inputs)
      for (const part of parts) {
        part.fill(slot, pose)
        const held = this.holds.get(part) as Int32Array
        held[slot] = key.serial
        held[2] = key.serial
      }
      for (const part of parts) part.finish(key.time, key.inputs)
    }
    shared.uReal.value = real
    stateUniforms.uPlantWet.value = wet
    stateUniforms.uPlantFrost.value = frost
    stateUniforms.uPlantDew.value = dew
  }

  // The low layer of the keys. Names what one slot of the shape holds: the plant at one moment of its clock, in still air, with the skin in one state. Asked again with the same numbers it does nothing, so a caller may ask on every frame. The shape is laid by the next blend.
  key(slot: 0 | 1, time: number, inputs: PlantInputs, skin?: KeySkin): void {
    const key = this.keys[slot]
    const held = inputs.held ?? 0
    const cold = inputs.cold ?? 0
    const real = skin ? skin.real : (inputs.stood ?? shared.uReal.value)
    const wet = skin ? skin.wet : stateUniforms.uPlantWet.value
    const frost = skin ? skin.frost : stateUniforms.uPlantFrost.value
    const dew = skin ? skin.dew : stateUniforms.uPlantDew.value
    const s = this.signing
    s[0] = time
    s[1] = inputs.leanX
    s[2] = inputs.leanZ
    s[3] = inputs.lift
    s[4] = inputs.liftLow ?? -1
    s[5] = cold
    s[6] = held
    // The film second moves the shape of a plant in still air only while frost works on a plant whose clock runs.
    s[7] = held < 1 && cold > 0 ? (inputs.real ?? -1) : -1
    s[8] = real
    s[9] = wet
    s[10] = frost
    s[11] = dew
    let same = true
    for (let i = 0; i < KEY_SIGNED; i++) if (s[i] !== key.sign[i]) same = false
    if (same) return
    key.sign.set(s)
    key.serial = ++this.serial
    key.time = time
    const to = key.inputs
    to.leanX = inputs.leanX
    to.leanZ = inputs.leanZ
    to.lift = inputs.lift
    to.liftLow = inputs.liftLow
    to.cold = inputs.cold
    to.real = inputs.real
    to.held = inputs.held
    to.stood = inputs.stood
    to.steady = inputs.steady
    key.real = real
    key.wet = wet
    key.frost = frost
    key.dew = dew
    usePlant(this.variant, this.at)
    to.steady = false
    tipAt(time, to, key.tip)
    to.steady = inputs.steady
    usePlant(0)
  }

  // Draws the plant as a mix of its two slots: `share` of the second one when the shutter opens and `shutter` more when it closes, moved by the air of `felt` at the plant's clock `time`. A slot a part lacks is laid here, and what a part keeps once comes from the slot named `later`.
  blend(share: number, shutter: number, felt: PlantInputs, time: number, later: 0 | 1 = 1): void {
    const [first, second] = this.keys
    const frame = shared.uFrame.value
    usePlant(this.variant, this.at)
    for (const play of this.plays.values()) play.mix.set(share, shutter)
    this.own.uOwnKeys.value = 1
    this.own.uOwnAir.value.set(Math.min(felt.calm ?? felt.wind, felt.wind), felt.wind, felt.gust ?? 0, felt.rain ?? 0)
    this.own.uOwnTip.value.copy(first.tip).lerp(second.tip, share)
    const lapse = (felt.lapse ?? 0) * (1 - (felt.held ?? 0))
    const real = felt.real ?? time
    this.own.uOwnLapse.value.set(lapse, lapse > 0 ? 0.5 * restless(real, frame, 0.37 + 0.11 * this.variant) : 0, lapse * TWITCH * (1 - 0.7 * (felt.cold ?? 0)) * (1 + 2 * felt.wind), TAU * cell(frame, 0.61 + 0.11 * this.variant))
    this.stands.held = 1
    this.filled.fill(NaN)
    const live = this.live
    live.length = 0
    for (const part of this.parts) {
      if (this.at === null) live.push(part)
      else if (this.showPart(part, part.absent?.(first.time) === true && part.absent(second.time) === true)) live.push(part)
    }
    const heldWas = filling.held
    this.lay((1 - later) as 0 | 1, later)
    this.lay(later, later)
    filling.held = heldWas
    // What a part keeps once and not for each vertex stands between its two keys where the shape does.
    for (const part of live) part.settle?.(share)
    usePlant(0)
    this.surface.main.uniforms.uPale.value = paleness(time)
    this.surface.main.uniforms.uBloom.value = headOpen(time)
  }

  // What a shape is laid under: the film second, the state of the skin and the standing clock of its own key, in place of the frame's. `leave` puts the frame's back.
  private readonly frameOwn = { real: 0, wet: 0, frost: 0, dew: 0, held: 0 }
  private enter(key: FilmKey): void {
    const own = this.frameOwn
    own.real = shared.uReal.value
    own.wet = stateUniforms.uPlantWet.value
    own.frost = stateUniforms.uPlantFrost.value
    own.dew = stateUniforms.uPlantDew.value
    own.held = filling.held
    shared.uReal.value = key.real
    stateUniforms.uPlantWet.value = key.wet
    stateUniforms.uPlantFrost.value = key.frost
    stateUniforms.uPlantDew.value = key.dew
    filling.held = 1
    filling.lead = true
  }
  private leave(): void {
    const own = this.frameOwn
    shared.uReal.value = own.real
    stateUniforms.uPlantWet.value = own.wet
    stateUniforms.uPlantFrost.value = own.frost
    stateUniforms.uPlantDew.value = own.dew
    filling.held = own.held
  }

  // Lays one slot of one part, or of the stand-in when the part is null, as the plant is at `key`, and notes under `id` what the slot now holds. A part whose spare shape holds that key, whole or in part, lays the rest of it there and takes it.
  private layOne(part: PlantPart | null, slot: 0 | 1, key: FilmKey, id: number): void {
    this.enter(key)
    if (part === null) {
      const to = slot === 0 ? this.a : (this.b as THREE.BufferAttribute)
      buildStandIn(key.time, key.inputs, to.array as Float32Array, this.n.array as Float32Array, this.shape, this.hide)
      to.needsUpdate = true
      this.n.needsUpdate = true
    } else {
      const play = this.plays.get(part) as Play
      if (play.ahead.of === id && part.ahead && part.take) {
        if (play.ahead.done < 1) part.ahead(poseAt(key.time, key.inputs), play.ahead.done, 1)
        part.take(slot)
        play.ahead.of = 0
      } else part.fill(slot, poseAt(key.time, key.inputs))
      part.finish(key.time, key.inputs)
    }
    const held = this.holds.get(part) as Int32Array
    held[slot] = id
    held[2] = id
    this.leave()
  }

  // Lays this frame's share of the key after the two round the frame into the part's spare shape, over the last frames before it is needed, so no frame lays a whole key.
  private layAhead(part: PlantPart, play: Play, k: number, frame: number): void {
    const t = play.turn
    if (!play.spread || !part.ahead || k + 2 >= t.at.length) return
    const due = t.at[k + 1]
    const over = Math.min(due - t.at[k], KEY_EVERY)
    if (frame < due - over) return
    const key = keyAt(t.of[k + 2], play.next)
    if (part.absent?.(key.time) === true) return
    const id = -2 - key.frame
    if (play.ahead.of !== id) {
      play.ahead.of = id
      play.ahead.done = 0
    }
    const upTo = Math.min(1, (frame - (due - over) + 1) / over)
    if (play.ahead.done >= upTo) return
    this.enter(key)
    part.ahead(poseAt(key.time, key.inputs), play.ahead.done, upTo)
    this.leave()
    play.ahead.done = upTo
  }

  // Sets one part's mix for a frame of the film from the two keys of its own turn round the frame, and lays the key it lacks. Gives the share of the part's second slot.
  private turnTo(part: PlantPart | null, frame: number, dials: { frost: number; wet: number; dew: number }): number {
    const play = this.plays.get(part) as Play
    const t = play.turn
    const k = t.index[frame]
    // Key n lies in slot n mod 2, so the second slot holds the later key of one stretch and the earlier key of the next.
    const slot = (k & 1) as 0 | 1
    const other = (1 - slot) as 0 | 1
    const first = keyAt(t.of[k], play.film[slot])
    const second = keyAt(t.of[k + 1], play.film[other])
    let w = 0
    let dw = 0
    if (t.held[k]) {
      // The two ends of a hold are one shape and differ only in what frost, dew and water lay on it, so between them the mix follows the dial that moves most and not the time.
      const frost = second.frost - first.frost
      const wet = second.wet - first.wet
      const dew = second.dew - first.dew
      const most = Math.max(Math.abs(frost), Math.abs(wet), Math.abs(dew))
      if (frame > second.frame) w = 1
      else if (frame > first.frame) {
        w = (frame - first.frame) / (second.frame - first.frame)
        if (most > 1e-6) w = Math.abs(frost) === most ? (dials.frost - first.frost) / frost : Math.abs(wet) === most ? (dials.wet - first.wet) / wet : (dials.dew - first.dew) / dew
        w = Math.min(Math.max(w, 0), 1)
      }
    } else {
      const span = t.at[k + 1] - t.at[k]
      w = (frame - t.at[k]) / span
      dw = SHUTTER_SHARE / span
    }
    const share = slot === 0 ? w : 1 - w
    play.mix.set(share, slot === 0 ? dw : -dw)
    if (part === null) {
      for (const [at, key] of [[slot, first], [other, second]] as const) {
        if (this.tipOf[at] === key.frame) continue
        tipAt(key.time, { ...key.inputs, steady: false }, this.tips[at])
        this.tipOf[at] = key.frame
      }
      this.own.uOwnTip.value.copy(this.tips[0]).lerp(this.tips[1], share)
      if (this.hide === ALL) return share
    } else if (!this.showPart(part, part.absent?.(first.time) === true && part.absent(second.time) === true)) {
      this.layAhead(part, play, k, frame)
      return share
    }
    const held = this.holds.get(part) as Int32Array
    // A film key is named by its frame, below the names the low layer gives.
    const a = -2 - first.frame
    const b = -2 - second.frame
    if (held[slot] !== a) this.layOne(part, slot, first, a)
    // What a part keeps once and not for each slot comes from the later key, so that one is laid last.
    if (held[other] !== b || held[2] !== b) this.layOne(part, other, second, b)
    if (part) this.layAhead(part, play, k, frame)
    part?.settle?.(share)
    return share
  }

  // The film's own schedule of keys: every part is drawn as a mix of the two keys of its own turn round the frame, when it is a frame of the film and the plant feels what the film says it feels there. The shape then depends on the frame's number and on nothing drawn before it.
  private play(timeOpen: number, felt: PlantInputs): boolean {
    const frame = shared.uFrame.value
    if (this.at === null || !this.b || !(frame >= 0 && frame < frameCount)) return false
    if (!this.growsByKeys && !HOLD_FRAMES.some(([from, to]) => frame >= from && frame <= to)) return false
    const m = momentAt(frame / FPS, this.now)
    if (m.tau !== timeOpen) return false
    const here = plantInputsOf(m)
    if (here.leanX !== felt.leanX || here.leanZ !== felt.leanZ || here.lift !== felt.lift || here.wind !== felt.wind || here.real !== felt.real || here.cold !== felt.cold) return false
    usePlant(this.variant, this.at)
    this.own.uOwnKeys.value = 1
    this.own.uOwnAir.value.set(Math.min(felt.calm ?? felt.wind, felt.wind), felt.wind, felt.gust ?? 0, felt.rain ?? 0)
    const lapse = (felt.lapse ?? 0) * (1 - (felt.held ?? 0))
    const real = felt.real ?? timeOpen
    this.own.uOwnLapse.value.set(lapse, lapse > 0 ? 0.5 * restless(real, frame, 0.37 + 0.11 * this.variant) : 0, lapse * TWITCH * (1 - 0.7 * (felt.cold ?? 0)) * (1 + 2 * felt.wind), TAU * cell(frame, 0.61 + 0.11 * this.variant))
    this.stands.held = 1
    this.filled.fill(NaN)
    this.turnTo(null, frame, m.dials)
    for (const part of this.parts) this.turnTo(part, frame, m.dials)
    usePlant(0)
    this.surface.main.uniforms.uPale.value = paleness(timeOpen)
    this.surface.main.uniforms.uBloom.value = headOpen(timeOpen)
    return true
  }

  prepare(timeOpen: number, timeClose: number, feltOpen: PlantInputs, feltClose: PlantInputs): void {
    if (this.play(timeOpen, feltOpen)) return
    for (const held of this.holds.values()) held.fill(-1)
    for (const play of this.plays.values()) play.mix.set(0, 1)
    this.own.uOwnKeys.value = 0
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
    // Only the plant and the companion carry drops: a neighbor's shape does not know the wet.
    asked[SIGNED - 2] = this.at === null ? 0 : wetFelt()
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
