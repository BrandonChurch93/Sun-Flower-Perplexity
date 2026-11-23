import * as THREE from 'three'
import { config, frameCount } from '../config.ts'
import { heightAt, rayLength, usePlant, type PlantInputs } from '../plant/growth.ts'
import type { Plant } from '../plant/index.ts'
import { headAt } from '../plant/model.ts'
import { plantVertexGlsl } from '../plant/part.ts'
import { cell } from '../plant/wind.ts'
import { plantInputsOf } from '../v2/inputs.ts'
import type { Moment } from '../v2/api.ts'
import { blankMoment, momentAt } from '../v2/now.ts'
import { shapeInputs } from './turn.ts'
import { kindTime, type Tier } from './layout.ts'

// A kind's shape is laid at key frames of the film only, this many frames apart, and every frame is drawn as a mix of the two keys round it.
// Each kind has its own turn within that stretch, so that one frame lays one kind at most.
export const KEY_EVERY = 24
// The mix is made where the plant's own shader asks the field for a neighbor's shape. Where it does not ask, every frame lays every kind.
export const keysOn = plantVertexGlsl.includes('fieldShape(local)')

const FPS = config.film.fps
const LAST = frameCount - 1

// The shape of a neighbor between its two keys: the later one is the shape as laid, the earlier one is kept beside it.
// A part with no vertices of its own stands on the head, and goes where the head goes and turns as it turns.
// In a time lapse every frame catches the leaves somewhere else, as it does the plant's own: what stands off the stem is lifted or let down a little, each neighbor in its own way.
export const keyGlsl = /* glsl */ `
in vec3 aFieldNow;
in vec3 aFieldWas;
uniform float uFieldKey;
uniform float uFieldOnHead;
uniform vec4 uFieldHeadNow;
uniform vec4 uFieldHeadWas;
uniform vec3 uFieldAxisNow;
uniform vec3 uFieldAxisWas;
uniform vec4 uFieldTwitch;
vec3 fieldTwitch(vec3 local) {
  if (uFieldTwitch.x <= 0.0) return local;
  float r = length(local.xz);
  vec2 o = local.xz / max(r, 1e-4);
  float own = fract(float(gl_InstanceID) * 0.61803399);
  float ph = 0.8 * o.x - 0.6 * o.y + 2.0 * local.y / max(uFieldTwitch.w, 0.01) + 6.2832 * own;
  float twitch = uFieldTwitch.x * (0.65 * sin(3.1 * ph + 1.9 * uFieldTwitch.z) + 0.55 * sin(7.3 * ph + uFieldTwitch.y));
  local.y += r * smoothstep(0.03, 0.09, r) * twitch;
  return local;
}
vec3 fieldShape(vec3 local) {
  if (uFieldKey <= 0.0) return fieldTwitch(local);
  if (uFieldOnHead > 0.5) {
    float size = uFieldHeadNow.w > 1e-5 ? uFieldHeadWas.w / uFieldHeadNow.w : 1.0;
    vec3 q = local - uFieldHeadNow.xyz;
    vec3 k = cross(uFieldAxisNow, uFieldAxisWas);
    float sine = length(k);
    if (sine > 1e-5) {
      k /= sine;
      float turn = uFieldKey * atan(sine, dot(uFieldAxisNow, uFieldAxisWas));
      q = q * cos(turn) + cross(k, q) * sin(turn) + k * (dot(k, q) * (1.0 - cos(turn)));
    }
    return mix(uFieldHeadNow.xyz, uFieldHeadWas.xyz, uFieldKey) + q * mix(1.0, size, uFieldKey);
  }
  // A part that one of the keys does not have is drawn as the later key has it.
  vec3 moved = (aFieldWas - aFieldNow) * uFieldKey;
  return fieldTwitch(moved == moved ? local + moved : local);
}
`

// A list of places read as it stands, for a kind that needs nothing more than the mix of its keys.
export const listPlaceGlsl = /* glsl */ `
Place fieldPlace() { return Place(aPlace, aVary); }
${keyGlsl}`

export interface KeyUniforms {
  // The share of the earlier key in the frame.
  uFieldKey: { value: number }
  uFieldOnHead: { value: number }
  // The middle of the head and its radius, at the later key and at the earlier one.
  uFieldHeadNow: { value: THREE.Vector4 }
  uFieldHeadWas: { value: THREE.Vector4 }
  // Which way the head faces at each key.
  uFieldAxisNow: { value: THREE.Vector3 }
  uFieldAxisWas: { value: THREE.Vector3 }
  // How far a leaf twitches in this frame in radians, where the frame catches it, the film second, the kind's height.
  uFieldTwitch: { value: THREE.Vector4 }
}

export function keyUniforms(): KeyUniforms {
  return {
    uFieldKey: { value: 0 },
    uFieldOnHead: { value: 0 },
    uFieldHeadNow: { value: new THREE.Vector4() },
    uFieldHeadWas: { value: new THREE.Vector4() },
    uFieldAxisNow: { value: new THREE.Vector3(0, 0, 1) },
    uFieldAxisWas: { value: new THREE.Vector3(0, 0, 1) },
    uFieldTwitch: { value: new THREE.Vector4(0, 0, 0, 1) },
  }
}

// A key: the kind's clock at a frame of the film and what its shape feels there.
// `frame` is where the key stands in the film and `shape` the frame whose shape it holds: the two differ only for the first key after a hold.
// `clock` is the kind's clock of the shape and `at` its clock where the key stands.
interface Key { frame: number; shape: number; clock: number; at: number; tall: number; inputs: PlantInputs; sign: string }
// What a set of buffers holds: the key it was laid at, and where the head stood in it.
interface Held { sign: string; head: THREE.Vector4; axis: THREE.Vector3; reach: number; tall: number }

const scratch = blankMoment()
const newKey = (): Key => ({ frame: -1, shape: -1, clock: 0, at: 0, tall: 0, inputs: { leanX: 0, leanZ: 0, lift: 1, wind: 0 }, sign: '' })
const newHeld = (head: THREE.Vector4, axis: THREE.Vector3): Held => ({ sign: '', head, axis, reach: 0, tall: 0 })

// What a neighbor's shape feels at a moment, less what the shader gives it. The twitch of the running days lives on the film second.
// The gusts never move a neighbor's shape, nor does the rain while the plant's clock stands: the air of a hold is in the shader too.
function feltAt(m: Moment): PlantInputs {
  const { real: _real, stood: _stood, ...inputs } = shapeInputs(plantInputsOf(m))
  return { ...inputs, lapse: 0, gust: 0, rain: (inputs.held ?? 0) >= 1 ? 0 : inputs.rain }
}

// The first frame after each hold, and frame 0. A hold is a stretch longer than two keys in which neither the plant's clock nor what a shape feels moves.
// Nothing may be laid in one, so each kind's keys start again after it: the kind stands as it stood for its own few frames more, lays its next key and catches up.
let starts: number[] | null = null
export function keyStarts(): number[] {
  if (starts) return starts
  starts = [0]
  let first = 0
  let sign = ''
  for (let frame = 0; frame <= LAST; frame++) {
    const m = momentAt(frame / FPS, scratch)
    const here = `${m.tau} ${JSON.stringify(feltAt(m))}`
    if (here === sign) continue
    if (frame - first > 2 * KEY_EVERY) starts.push(frame)
    first = frame
    sign = here
  }
  return starts
}

// Which turn of the stretch a kind lays on: no two of `count` kinds share one while there are no more kinds than turns.
export function turnOf(i: number, count: number): number {
  return Math.floor((i * KEY_EVERY) / count) % KEY_EVERY
}

// How far a leaf twitches from frame to frame in the fastest time lapse, in radians: the plant's own measure.
const TWITCH = 0.05

// One kind played from keys. It owns the earlier key's shape, one more set of places for every part that is laid in script.
export class Keyed {
  // Where the head stands in this frame, between the keys: its middle and how far its rays reach, and its axis.
  readonly head = new THREE.Vector4(0, 0, 0, 1)
  readonly axis = new THREE.Vector3(0, 0, 1)
  // How tall the kind's shape is in this frame, as the field's own measure has it.
  tall = 0
  // How many shapes this frame laid.
  laid = 0
  private readonly pairs: { now: THREE.BufferAttribute; was: THREE.BufferAttribute }[] = []
  private readonly now: Held
  private readonly was: Held
  private readonly first = newKey()
  private readonly second = newKey()

  private readonly plant: Plant
  private readonly index: number
  private readonly tier: Tier
  private readonly turn: number
  private readonly uniforms: KeyUniforms

  constructor(plant: Plant, index: number, tier: Tier, turn: number, uniforms: KeyUniforms) {
    this.plant = plant
    this.index = index
    this.tier = tier
    this.turn = turn
    this.uniforms = uniforms
    this.now = newHeld(uniforms.uFieldHeadNow.value, uniforms.uFieldAxisNow.value)
    this.was = newHeld(uniforms.uFieldHeadWas.value, uniforms.uFieldAxisWas.value)
    for (const part of plant.parts) {
      for (const mesh of part.meshes) {
        const geometry = mesh.geometry
        const position = geometry.getAttribute('position')
        if (position instanceof THREE.BufferAttribute && position.usage === THREE.DynamicDrawUsage) {
          const was = new THREE.BufferAttribute(new Float32Array(position.array.length), 3).setUsage(THREE.DynamicDrawUsage)
          geometry.setAttribute('aFieldNow', position)
          geometry.setAttribute('aFieldWas', was)
          this.pairs.push({ now: position, was })
        } else {
          // Nothing of this part is laid in script: both keys read the same numbers, and it rides on the head.
          const any = position ?? Object.values(geometry.attributes).find((a) => a instanceof THREE.BufferAttribute)
          if (any) {
            geometry.setAttribute('aFieldNow', any)
            geometry.setAttribute('aFieldWas', any)
          }
          if (!position) Object.assign((mesh.material as THREE.RawShaderMaterial).uniforms, { uFieldOnHead: { value: 1 } })
        }
      }
    }
    const own = plant.mesh.geometry
    const position = own.getAttribute('position') as THREE.BufferAttribute
    const was = new THREE.BufferAttribute(new Float32Array(position.array.length), 3).setUsage(THREE.DynamicDrawUsage)
    own.setAttribute('aFieldNow', position)
    own.setAttribute('aFieldWas', was)
    this.pairs.push({ now: position, was })
  }

  private keyAt(frame: number, shape: number, out: Key): Key {
    if (out.frame === frame && out.shape === shape) return out
    const m = momentAt(shape / FPS, scratch)
    out.frame = frame
    out.shape = shape
    out.clock = kindTime(m.tau, this.index, this.tier)
    out.tall = heightAt(out.clock)
    out.inputs = feltAt(m)
    out.sign = `${out.clock} ${JSON.stringify(out.inputs)}`
    out.at = shape === frame ? out.clock : kindTime(momentAt(frame / FPS, scratch).tau, this.index, this.tier)
    return out
  }

  private lay(key: Key): void {
    this.plant.prepare(key.clock, key.clock, key.inputs, key.inputs)
    usePlant(this.plant.variant, null)
    const h = headAt(key.clock, key.inputs)
    this.now.head.set(h.center.x, h.center.y, h.center.z, h.radius)
    this.now.axis.set(h.axis.x, h.axis.y, h.axis.z)
    this.now.reach = h.radius + rayLength(0, key.clock) + 0.03
    usePlant(0)
    this.now.sign = key.sign
    this.now.tall = key.tall
    this.laid++
  }

  private keep(): void {
    for (const pair of this.pairs) {
      ;(pair.was.array as Float32Array).set(pair.now.array as Float32Array)
      pair.was.needsUpdate = true
    }
    this.was.head.copy(this.now.head)
    this.was.axis.copy(this.now.axis)
    this.was.reach = this.now.reach
    this.was.tall = this.now.tall
    this.was.sign = this.now.sign
  }

  // The kind is laid some other way for this frame: what the keys hold is no longer known.
  off(): void {
    this.uniforms.uFieldKey.value = 0
    this.uniforms.uFieldTwitch.value.x = 0
    this.now.sign = ''
    this.was.sign = ''
  }

  // What the running days do to the leaves in this frame.
  twitch(lapse: number, cold: number, frame: number, seconds: number, tall: number): void {
    this.uniforms.uFieldTwitch.value.set(lapse * TWITCH * (1 - 0.7 * cold), 2 * Math.PI * cell(frame, 0.61 + 0.11 * this.plant.variant), seconds, tall)
  }

  // Sets the kind for a film second: lays what its two keys lack, which in a film played forward is one shape each time a key is passed, and mixes them.
  set(seconds: number, clock: number): void {
    this.laid = 0
    const exact = Math.min(LAST, Math.max(0, seconds * FPS))
    const frame = Math.floor(exact + 1e-6)
    const after = keyStarts()
    let s = after.length - 1
    while (s > 0 && after[s] > frame) s--
    const start = after[s]
    let first: Key
    let second: Key
    if (s > 0 && frame < start + this.turn) {
      first = this.keyAt(start - 1, start - 1, this.first)
      second = this.keyAt(start + this.turn, start - 1, this.second)
    } else {
      const base = s > 0 ? start + this.turn : this.turn - KEY_EVERY
      const n = Math.floor((frame - base) / KEY_EVERY)
      const from = Math.max(0, base + n * KEY_EVERY)
      const to = Math.min(LAST, base + (n + 1) * KEY_EVERY)
      // A key that falls past the hold ahead holds the hold's shape: the kind starts again after it.
      const last = s + 1 < after.length ? after[s + 1] - 1 : LAST
      first = this.keyAt(from, s > 0 && n === 0 ? start - 1 : Math.min(from, last), this.first)
      second = this.keyAt(to, Math.min(to, last), this.second)
    }
    const same = first.sign === second.sign
    if (this.now.sign !== second.sign) {
      if (same) this.lay(second)
      else {
        if (this.now.sign !== first.sign) this.lay(first)
        this.keep()
        this.lay(second)
      }
    } else if (!same && this.was.sign !== first.sign) {
      this.lay(first)
      this.keep()
      this.lay(second)
    }
    // The mix runs on the kind's clock, so that a shape stands still from the first frame of a hold. Where the clock stands and the light still moves it, it runs on the film's frames.
    const grown = second.at - first.at
    const along = grown > 0 ? (clock - first.at) / grown : (exact - first.frame) / Math.max(second.frame - first.frame, 1)
    const share = same ? 0 : 1 - THREE.MathUtils.clamp(along, 0, 1)
    this.uniforms.uFieldKey.value = share
    this.head.set(this.now.head.x, this.now.head.y, this.now.head.z, this.now.reach)
    this.axis.copy(this.now.axis)
    this.tall = this.now.tall
    if (share > 0) {
      this.head.x += (this.was.head.x - this.now.head.x) * share
      this.head.y += (this.was.head.y - this.now.head.y) * share
      this.head.z += (this.was.head.z - this.now.head.z) * share
      this.head.w += (this.was.reach - this.now.reach) * share
      this.tall += (this.was.tall - this.now.tall) * share
      this.axis.lerp(this.was.axis, share).normalize()
    }
  }
}
