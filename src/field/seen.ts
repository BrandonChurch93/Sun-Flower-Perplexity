import * as THREE from 'three'
import { config, frameCount } from '../config.ts'
import type { CameraPose } from '../core/lens.ts'
import { poseOf } from '../director/pose.ts'
import { rigAtFilm } from '../v2/rig.ts'
import { PLACE } from './layout.ts'

// The room a neighbor is given at the frame's edge, in meters: its leaves and its lean reach that far from its foot.
export const ROOM_M = 0.9
// What the lists are cut by is wider than the frame by this much, so a lens a hair off the film's own path is still served.
const MORE_ROOM_M = 0.15
const MORE_GATE = 1.02
// How far from the film's own lens a lens may stand and still be served by the film's counts.
const NEAR = { meters: 0.02, turn: 0.003, gate: 0.005 }
const LENS = 5

const fps = config.film.fps

// The lens on the ground: where it stands, which way it looks, and how fast the frame widens with depth.
export function lensOf(pose: CameraPose, tanHalfWidth: number, aspect: number, out: Float32Array, at = 0): void {
  const flat = Math.hypot(pose.forward.x, pose.forward.z) || 1
  const steep = Math.max(0.3, flat - (tanHalfWidth / aspect) * Math.abs(pose.forward.y))
  out[at] = pose.position.x
  out[at + 1] = pose.position.z
  out[at + 2] = pose.forward.x / flat
  out[at + 3] = pose.forward.z / flat
  out[at + 4] = tanHalfWidth / steep
}

// The film's own lens at every frame.
export function filmLens(aspect: number): Float32Array {
  const lens = new Float32Array(frameCount * LENS)
  const origin = new THREE.Vector3()
  for (let f = 0; f < frameCount; f++) {
    const pose = poseOf(rigAtFilm(f / fps), origin)
    lensOf(pose, (0.5 * config.camera.gateWidthMm) / pose.focalMm, aspect, lens, f * LENS)
  }
  return lens
}

// Whether a lens could see a neighbor that stands at x, z: the test each neighbor is given as it is drawn, with a little more room.
function seen(lens: Float32Array, at: number, x: number, z: number): boolean {
  const ox = x - lens[at]
  const oz = z - lens[at + 1]
  const fx = lens[at + 2]
  const fz = lens[at + 3]
  const gate = lens[at + 4] * MORE_GATE
  const room = ROOM_M + MORE_ROOM_M
  const depth = ox * fx + oz * fz
  if (depth < -room) return false
  return Math.abs(oz * fx - ox * fz) <= Math.max(depth, 0) * gate + room * (1 + gate)
}

// One kind's list in the order the film first sees its neighbors: those it never sees come last. A front part of that list is then all a frame needs.
export function bySeen(places: Float32Array, lens: Float32Array): Float32Array {
  const count = places.length / PLACE
  const first = new Int32Array(count).fill(frameCount)
  for (let k = 0; k < count; k++) {
    const x = places[k * PLACE]
    const z = places[k * PLACE + 1]
    for (let f = 0; f < frameCount; f++) {
      if (!seen(lens, f * LENS, x, z)) continue
      first[k] = f
      break
    }
  }
  const order = Array.from({ length: count }, (_, k) => k).sort((a, b) => first[a] - first[b] || a - b)
  const sorted = new Float32Array(places.length)
  order.forEach((k, to) => sorted.set(places.subarray(k * PLACE, (k + 1) * PLACE), to * PLACE))
  return sorted
}

// How much of a kind's list each frame of the film needs: up to the last neighbor that frame, the one before or the one after could see.
export function needed(places: Float32Array, lens: Float32Array): Uint16Array {
  const count = places.length / PLACE
  const own = new Uint16Array(frameCount)
  for (let k = 0; k < count; k++) {
    const x = places[k * PLACE]
    const z = places[k * PLACE + 1]
    for (let f = 0; f < frameCount; f++) if (seen(lens, f * LENS, x, z)) own[f] = k + 1
  }
  const need = new Uint16Array(frameCount)
  for (let f = 0; f < frameCount; f++) need[f] = Math.max(own[Math.max(0, f - 1)], own[f], own[Math.min(frameCount - 1, f + 1)])
  return need
}

// The frame of the film whose lens this one is, or -1 when it is not the film's own: then the whole list is drawn.
export function frameOf(lens: Float32Array, seconds: number, mine: Float32Array): number {
  const f = seconds * fps
  for (const i of [Math.floor(f), Math.ceil(f)]) {
    if (i < 0 || i >= frameCount) continue
    const at = i * LENS
    if (Math.hypot(mine[0] - lens[at], mine[1] - lens[at + 1]) > NEAR.meters) continue
    if (Math.hypot(mine[2] - lens[at + 2], mine[3] - lens[at + 3]) > NEAR.turn) continue
    if (Math.abs(mine[4] / lens[at + 4] - 1) > NEAR.gate) continue
    return i
  }
  return -1
}
