import * as THREE from 'three'
import { config, frameCount } from '../config.ts'
import { rayLength, usePlant, type PlantInputs } from '../plant/growth.ts'
import type { Plant } from '../plant/index.ts'
import { headAt } from '../plant/model.ts'
import { plantVertexGlsl } from '../plant/part.ts'
import { plantInputsOf } from '../v2/inputs.ts'
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
// A part with no vertices of its own stands on the head, and goes where the head goes.
export const keyGlsl = /* glsl */ `
in vec3 aFieldNow;
in vec3 aFieldWas;
uniform float uFieldKey;
uniform float uFieldOnHead;
uniform vec4 uFieldHeadNow;
uniform vec4 uFieldHeadWas;
vec3 fieldShape(vec3 local) {
  if (uFieldKey <= 0.0) return local;
  if (uFieldOnHead > 0.5) {
    float size = uFieldHeadNow.w > 1e-5 ? uFieldHeadWas.w / uFieldHeadNow.w : 1.0;
    return mix(uFieldHeadNow.xyz, uFieldHeadWas.xyz, uFieldKey) + (local - uFieldHeadNow.xyz) * mix(1.0, size, uFieldKey);
  }
  // A part that one of the keys does not have is drawn as the later key has it.
  vec3 moved = (aFieldWas - aFieldNow) * uFieldKey;
  return moved == moved ? local + moved : local;
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
}

export function keyUniforms(): KeyUniforms {
  return { uFieldKey: { value: 0 }, uFieldOnHead: { value: 0 }, uFieldHeadNow: { value: new THREE.Vector4() }, uFieldHeadWas: { value: new THREE.Vector4() } }
}

// A key: the kind's clock at a frame of the film and what its shape feels there.
interface Key { frame: number; clock: number; inputs: PlantInputs; sign: string }
// What a set of buffers holds: the key it was laid at, and where the head stood in it.
interface Held { sign: string; head: THREE.Vector4; axis: THREE.Vector3; reach: number }

const scratch = blankMoment()
const newKey = (): Key => ({ frame: -1, clock: 0, inputs: { leanX: 0, leanZ: 0, lift: 1, wind: 0 }, sign: '' })
const newHeld = (head: THREE.Vector4): Held => ({ sign: '', head, axis: new THREE.Vector3(0, 0, 1), reach: 0 })

// Which turn of the stretch a kind lays on: no two of `count` kinds share one while there are no more kinds than turns.
export function turnOf(i: number, count: number): number {
  return Math.floor((i * KEY_EVERY) / count) % KEY_EVERY
}

// One kind played from keys. It owns the earlier key's shape, one more set of places for every part that is laid in script.
export class Keyed {
  // Where the head stands in this frame, between the keys: its middle and how far its rays reach, and its axis.
  readonly head = new THREE.Vector4(0, 0, 0, 1)
  readonly axis = new THREE.Vector3(0, 0, 1)
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
    this.now = newHeld(uniforms.uFieldHeadNow.value)
    this.was = newHeld(uniforms.uFieldHeadWas.value)
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

  private keyAt(frame: number, out: Key): Key {
    if (out.frame === frame) return out
    const m = momentAt(frame / FPS, scratch)
    // A key is laid without the twitch of the running days: that lives on the film second and no key could hold it.
    const { real: _real, ...inputs } = shapeInputs(plantInputsOf(m))
    out.frame = frame
    out.clock = kindTime(m.tau, this.index, this.tier)
    out.inputs = { ...inputs, lapse: 0 }
    out.sign = `${out.clock} ${JSON.stringify(out.inputs)}`
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
    this.was.sign = this.now.sign
  }

  // The kind is laid some other way for this frame: what the keys hold is no longer known.
  off(): void {
    this.uniforms.uFieldKey.value = 0
    this.now.sign = ''
    this.was.sign = ''
  }

  // Sets the kind for a film second: lays what its two keys lack, which in a film played forward is one shape each time a key is passed, and mixes them.
  set(seconds: number): void {
    this.laid = 0
    const frame = Math.min(LAST, Math.max(0, seconds * FPS))
    const from = Math.max(0, this.turn + Math.floor((frame - this.turn) / KEY_EVERY) * KEY_EVERY)
    const to = Math.min(LAST, this.turn + (Math.floor((frame - this.turn) / KEY_EVERY) + 1) * KEY_EVERY)
    const first = this.keyAt(from, this.first)
    const second = this.keyAt(to, this.second)
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
    const share = same || to === from ? 0 : 1 - THREE.MathUtils.clamp((frame - from) / (to - from), 0, 1)
    this.uniforms.uFieldKey.value = share
    this.head.set(this.now.head.x, this.now.head.y, this.now.head.z, this.now.reach)
    this.axis.copy(this.now.axis)
    if (share > 0) {
      this.head.x += (this.was.head.x - this.now.head.x) * share
      this.head.y += (this.was.head.y - this.now.head.y) * share
      this.head.z += (this.was.head.z - this.now.head.z) * share
      this.head.w += (this.was.reach - this.now.reach) * share
      this.axis.lerp(this.was.axis, share).normalize()
    }
  }
}
