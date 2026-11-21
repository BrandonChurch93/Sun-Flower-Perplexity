import * as THREE from 'three'
import { config } from '../../config.ts'
import { lerp, smoothstep } from '../../core/curves.ts'
import { heightAt, huskDrop, huskLengthM, huskRest, huskSize, paleness, seedLeafAngle, seedLeafFraction, seedLeafLength, stemRadius } from '../growth.ts'
import { makePartSurface, partGeometry, partMesh, type PartOptions, type PlantPart } from '../part.ts'
import { roll, seedLeafFrameAt, stemAt, type Pose } from '../skeleton.ts'
import type { Surface } from '../../core/shading.ts'
import { fragment, vertex } from './shaders.ts'

const TAU = Math.PI * 2
const seed0 = config.plant.stages.seedLeaves[0]
const leaves0 = config.plant.stages.leaves[0]
const HUSK_HALF_WIDTH = 0.31
const HUSK_HALF_DEPTH = 0.25
const HUSK_WALL = 0.023
const REST_AXIS = unit(-0.26, 0.96, 0.1)
const REST_SIDE = unit(0.87, 0, 0.5)
// How far past the end of the stem the mouth of the husk sits, and how far short of its blunt end the folded tips stop.
const LEAF_TURN = -0.85
const HUSK_NECK_M = -0.0006
const HUSK_TIP_M = 0.0022

interface Body {
  husk: boolean
  side: number
  base: number
  rings: number
  loop: number
}
interface Group {
  bodies: Body[]
  slots: Float32Array[]
  normals: Float32Array
  state: Float32Array
  live: (THREE.BufferAttribute | null)[]
  mesh: THREE.Mesh
  surface: Surface
  casts: boolean
}
interface Shape {
  leafRings: number
  leafLoop: number
  huskRings: number
  huskLoop: number
}

function unit(x: number, y: number, z: number): [number, number, number] {
  const l = Math.hypot(x, y, z) || 1
  return [x / l, y / l, z / l]
}

function shapeOf(options: PartOptions): Shape | null {
  if (options.detail === 'far') return null
  if (options.detail === 'near') return { leafRings: 6, leafLoop: 6, huskRings: 0, huskLoop: 0 }
  if (options.variant !== 0) return { leafRings: 22, leafLoop: 18, huskRings: 18, huskLoop: 20 }
  return { leafRings: 36, leafLoop: 30, huskRings: 30, huskLoop: 36 }
}

// A plump oval on a short broad foot, widest a little past the middle, with a round tip.
function leafOutline(s: number): number {
  const foot = lerp(0.34, 1, smoothstep(0, 0.36, s)) * Math.sqrt(smoothstep(0, 0.03, s))
  return Math.max(0.004, foot * Math.sin(Math.PI * s ** 0.82) ** 0.55)
}

// The shell of the seed from its blunt end, where the halves hang together, to the torn mouth the root came out of.
function huskOutline(s: number): number {
  return Math.max(0.004, Math.sin(Math.PI * (0.84 * s) ** 0.9) ** 0.75)
}

export function create(options: PartOptions): PlantPart | null {
  const shape = shapeOf(options)
  if (!shape)
    return {
      name: 'seedling',
      meshes: [],
      casters: [],
      fill() {},
      finish() {},
    }
  const groups: Group[] = []
  const group = (name: string, husk: boolean, rings: number, loop: number, casts: boolean) => {
    if (rings <= 0) return
    const bodies: Body[] = []
    let count = 0
    for (let i = 0; i < 2; i++) {
      bodies.push({ husk, side: i === 0 ? -1 : 1, base: count, rings, loop })
      count += rings * (loop + 1)
    }
    const geometry = partGeometry(options)
    const slots = [new Float32Array(count * 3), new Float32Array(count * 3)]
    const normals = new Float32Array(count * 3)
    const coords = new Float32Array(count * 4)
    const state = new Float32Array(count * 4)
    const index: number[] = []
    bodies.forEach((b, id) => {
      const row = b.loop + 1
      const arc = b.loop / 2
      for (let a = 0; a < b.rings; a++) {
        const s = 0.5 - 0.5 * Math.cos((Math.PI * a) / (b.rings - 1))
        for (let k = 0; k <= b.loop; k++) {
          const at = (b.base + a * row + k) * 4
          const j = k % b.loop
          coords[at] = s
          if (b.husk) {
            const outer = j < arc
            const turn = outer ? j / (arc - 1) : 1 - (j - arc) / (arc - 1)
            coords[at + 1] = turn * 2 - 1
            coords[at + 2] = outer ? 1 : -1
          } else {
            const phi = (j / b.loop) * TAU
            coords[at + 1] = Math.cos(phi)
            coords[at + 2] = Math.sin(phi)
          }
          coords[at + 3] = id + (husk ? 2 : 0)
          if (a < b.rings - 1 && k < b.loop) {
            const v = b.base + a * row + k
            index.push(v, v + 1, v + row, v + 1, v + row + 1, v + row)
          }
        }
      }
    })
    const dynamic = (array: Float32Array, size: number) => new THREE.BufferAttribute(array, size).setUsage(THREE.DynamicDrawUsage)
    const position = dynamic(slots[0], 3)
    const positionB = options.places ? null : dynamic(slots[1], 3)
    const normal = dynamic(normals, 3)
    const sent = dynamic(state, 4)
    geometry.setAttribute('position', position)
    if (positionB) geometry.setAttribute('positionB', positionB)
    geometry.setAttribute('normal', normal)
    geometry.setAttribute('aCoord', new THREE.BufferAttribute(coords, 4))
    geometry.setAttribute('aState', sent)
    geometry.setIndex(index)
    const surface = makePartSurface(options, {
      name,
      vertex,
      fragment,
      side: THREE.DoubleSide,
      castShadow: casts,
    })
    groups.push({
      bodies,
      slots,
      normals,
      state,
      live: [position, positionB, normal, sent],
      mesh: partMesh(geometry, surface),
      surface,
      casts,
    })
  }
  // A seed leaf is thick, and the light still comes through it: it throws no shadow, or its far side would stand in its own shade.
  group('seed leaves', false, shape.leafRings, shape.leafLoop, false)
  group('husk', true, shape.huskRings, shape.huskLoop, true)

  function fill(slot: 0 | 1, pose: Pose): void {
    const first = slot === 0
    const time = pose.time
    const grown = smoothstep(0, 0.006, heightAt(time))
    const length = seedLeafLength(time)
    const pale = paleness(time)
    const wither = smoothstep(leaves0 + 8, leaves0 + 19, time)
    const drop = huskDrop(time)
    const kept = huskSize(time)

    const end = stemAt(pose, 1)
    const ex = end.x
    const ey = end.y
    const ez = end.z
    const tx = end.tx
    const ty = end.ty
    const tz = end.tz
    const rx = end.rx
    const ry = end.ry
    const rz = end.rz

    const huskLength = huskLengthM * grown
    const ride = HUSK_NECK_M * grown + huskLength
    // The seed leaves lie pressed into the husk a little shorter than they are, and stretch as it lets go.
    const squeeze = lerp(Math.min(1, (ride - HUSK_TIP_M * grown) / Math.max(length, 1e-6)), 1, smoothstep(0, 0.5, drop))
    const h0x = ex + tx * ride
    const h0y = ey + ty * ride
    const h0z = ez + tz * ride
    const h1x = huskRest.x
    const h1y = huskRest.y + 0.003
    const h1z = huskRest.z
    const lift = 0.012 * grown
    const cx = h0x + tx * lift + 0.3 * (h1x - h0x)
    const cy = h0y + ty * lift
    const cz = h0z + tz * lift + 0.3 * (h1z - h0z)
    const ka = (1 - drop) * (1 - drop)
    const kb = 2 * drop * (1 - drop)
    const kc = drop * drop
    const hx = ka * h0x + kb * cx + kc * h1x
    const hy = ka * h0y + kb * cy + kc * h1y - (1 - kept) * 0.016
    const hz = ka * h0z + kb * cz + kc * h1z
    // The shell tumbles from hanging mouth down on the tips to standing mouth up in the crumbs.
    const turn = smoothstep(0.12, 0.95, drop)
    let ax = -ty * REST_AXIS[2] + tz * REST_AXIS[1]
    let ay = -tz * REST_AXIS[0] + tx * REST_AXIS[2]
    let az = -tx * REST_AXIS[1] + ty * REST_AXIS[0]
    const al = Math.hypot(ax, ay, az)
    if (al > 1e-6) {
      ax /= al
      ay /= al
      az /= al
    } else {
      ax = rx
      ay = ry
      az = rz
    }
    const angle = turn * Math.acos(Math.max(-1, Math.min(1, -(tx * REST_AXIS[0] + ty * REST_AXIS[1] + tz * REST_AXIS[2]))))
    const ca = Math.cos(angle)
    const sa = Math.sin(angle)
    const spin = (x: number, y: number, z: number): [number, number, number] => {
      const d = (ax * x + ay * y + az * z) * (1 - ca)
      return [x * ca + (ay * z - az * y) * sa + ax * d, y * ca + (az * x - ax * z) * sa + ay * d, z * ca + (ax * y - ay * x) * sa + az * d]
    }
    const B = spin(-tx, -ty, -tz)
    const side = spin(rx, ry, rz)
    let px = lerp(side[0], REST_SIDE[0], turn)
    let py = lerp(side[1], REST_SIDE[1], turn)
    let pz = lerp(side[2], REST_SIDE[2], turn)
    const pb = px * B[0] + py * B[1] + pz * B[2]
    px -= B[0] * pb
    py -= B[1] * pb
    pz -= B[2] * pb
    const pl = Math.hypot(px, py, pz) || 1
    px /= pl
    py /= pl
    pz /= pl
    const qx = B[1] * pz - B[2] * py
    const qy = B[2] * px - B[0] * pz
    const qz = B[0] * py - B[1] * px
    const loosen = smoothstep(seed0 - 1.5, seed0 + 0.2, time)
    const gape = lerp(0.06, 0.2, loosen) + 0.42 * smoothstep(0, 0.3, drop) - 0.29 * smoothstep(0.6, 1, drop) + 0.5 * (1 - kept)

    for (const g of groups) {
      const out = g.slots[slot]
      const state = g.state
      const normals = g.normals
      for (const b of g.bodies) {
        const row = b.loop + 1
        if (!b.husk) {
          const i = b.side < 0 ? 0 : 1
          const spread = smoothstep(0.07, 0.6, seedLeafAngle(i, time))
          const f = roll(seedLeafFrameAt(pose, i), (i === 0 ? -0.15 : LEAF_TURN) * spread)
          const rs = stemRadius(time, seedLeafFraction(time)) * smoothstep(0, 0.006, heightAt(time))
          const half = length * lerp(0.16, 0.31, spread) * (1 - 0.3 * wither)
          const thick = length * lerp(0.105, 0.07, spread) * (1 - 0.5 * wither)
          const sag = 0.08 * spread + 0.6 * wither
          const shut = lerp(0.35, 1, spread)
          for (let a = 0; a < b.rings; a++) {
            const s = 0.5 - 0.5 * Math.cos((Math.PI * a) / (b.rings - 1))
            const o = leafOutline(s)
            const joint = a === 0 ? 0 : 1 - smoothstep(0, 0.2, s)
            const h = Math.max(half * o, lerp(0.7, 0.95, spread) * rs * joint)
            const t = Math.max(thick * Math.min(1, 0.08 + 1.1 * Math.sqrt(o)), lerp(0.5, 1.2, spread) * rs * joint)
            const top = 0.22 * t
            const bottom = 0.78 * t
            const reach = length * s * squeeze - 0.9 * rs * (1 - s) * (1 - s)
            const down = -sag * length * s * s - 1.15 * top
            const mx = f.ox + f.mx * reach + f.nx * down
            const my = f.oy + f.my * reach + f.ny * down
            const mz = f.oz + f.mz * reach + f.nz * down
            for (let k = 0; k <= b.loop; k++) {
              const phi = ((k % b.loop) / b.loop) * TAU
              const c = Math.cos(phi)
              const e = Math.sin(phi)
              const x = h * c
              const y = (e >= 0 ? top * e ** 0.8 : -bottom * (-e) ** 0.7) + 0.3 * wither * h * c * c
              const at = b.base + a * row + k
              out[at * 3] = mx + f.wx * x + f.nx * y
              out[at * 3 + 1] = my + f.wy * x + f.ny * y
              out[at * 3 + 2] = mz + f.wz * x + f.nz * y
              if (!first) continue
              state[at * 4] = pale
              state[at * 4 + 1] = wither
              state[at * 4 + 2] = lerp(1, shut, Math.max(0, Math.min(1, 0.5 + 2 * e)))
              state[at * 4 + 3] = 0
            }
          }
        } else {
          const cg = Math.cos(gape)
          const sg = Math.sin(gape)
          const bx = B[0] * cg + px * b.side * sg
          const by = B[1] * cg + py * b.side * sg
          const bz = B[2] * cg + pz * b.side * sg
          const ox = px * b.side * cg - B[0] * sg
          const oy = py * b.side * cg - B[1] * sg
          const oz = pz * b.side * cg - B[2] * sg
          const arc = b.loop / 2
          const shown = kept > 0 ? 1 : 0
          const inside = lerp(0.3, 0.85, smoothstep(0.15, 0.5, gape))
          for (let a = 0; a < b.rings; a++) {
            const s = 0.5 - 0.5 * Math.cos((Math.PI * a) / (b.rings - 1))
            const o = huskOutline(s) * shown
            const hw = huskLength * HUSK_HALF_WIDTH * o
            const dp = huskLength * HUSK_HALF_DEPTH * o ** 0.9
            const wall = a === b.rings - 1 ? 0 : Math.min(huskLength * HUSK_WALL, 0.6 * dp)
            const reach = huskLength * s * shown
            const mx = hx + bx * reach
            const my = hy + by * reach
            const mz = hz + bz * reach
            for (let k = 0; k <= b.loop; k++) {
              const j = k % b.loop
              const outer = j < arc
              const theta = (outer ? j / (arc - 1) - 0.5 : 0.5 - (j - arc) / (arc - 1)) * Math.PI
              const thin = outer ? 0 : wall
              const x = (hw - thin) * Math.sin(theta)
              const y = (dp - thin) * Math.cos(theta)
              const at = b.base + a * row + k
              out[at * 3] = mx + qx * x + ox * y
              out[at * 3 + 1] = my + qy * x + oy * y
              out[at * 3 + 2] = mz + qz * x + oz * y
              if (!first) continue
              state[at * 4] = 0
              state[at * 4 + 1] = 0
              state[at * 4 + 2] = outer ? 1 : inside
              state[at * 4 + 3] = lerp(0.55, 0.85, drop)
            }
          }
        }
        if (!first) continue
        for (let a = 0; a < b.rings; a++) {
          const a0 = Math.max(0, a - 1)
          const a1 = Math.min(b.rings - 1, a + 1)
          for (let k = 0; k <= b.loop; k++) {
            const left = (b.base + a * row + (k === 0 ? b.loop - 1 : k - 1)) * 3
            const right = (b.base + a * row + (k === b.loop ? 1 : k + 1)) * 3
            const low = (b.base + a0 * row + k) * 3
            const high = (b.base + a1 * row + k) * 3
            const ux = out[right] - out[left]
            const uy = out[right + 1] - out[left + 1]
            const uz = out[right + 2] - out[left + 2]
            const vx = out[high] - out[low]
            const vy = out[high + 1] - out[low + 1]
            const vz = out[high + 2] - out[low + 2]
            let nx = uy * vz - uz * vy
            let ny = uz * vx - ux * vz
            let nz = ux * vy - uy * vx
            const l = Math.hypot(nx, ny, nz)
            if (l > 1e-16) {
              nx /= l
              ny /= l
              nz /= l
            } else {
              nx = 0
              ny = 1
              nz = 0
            }
            const at = (b.base + a * row + k) * 3
            normals[at] = nx
            normals[at + 1] = ny
            normals[at + 2] = nz
          }
        }
      }
    }
  }

  return {
    name: 'seedling',
    meshes: groups.map((g) => g.mesh),
    casters: groups.filter((g) => g.casts).map((g) => ({ mesh: g.mesh, surface: g.surface })),
    fill,
    finish() {
      for (const g of groups) for (const a of g.live) if (a) a.needsUpdate = true
    },
  }
}
