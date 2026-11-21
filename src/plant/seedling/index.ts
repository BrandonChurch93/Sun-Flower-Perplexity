import * as THREE from 'three'
import { config } from '../../config.ts'
import { clamp, lerp, smoothstep } from '../../core/curves.ts'
import { lumpAt } from '../../ground/crumbs.ts'
import { soilHeightAt } from '../../ground/soil.ts'
import { heightAt, huskDrop, huskLengthM, huskRest, huskSize, paleness, seedLeafAngle, seedLeafFraction, seedLeafLength, stemRadius } from '../growth.ts'
import { makePartSurface, partGeometry, partMesh, type PartOptions, type PlantPart } from '../part.ts'
import { roll, seedLeafFrameAt, stemAt, type Pose } from '../skeleton.ts'
import type { Surface } from '../../core/shading.ts'
import { combine, hash01, streamSeed } from '../../core/random.ts'
import { fragment, vertex } from './shaders.ts'

const TAU = Math.PI * 2
const seed0 = config.plant.stages.seedLeaves[0]
const leaves0 = config.plant.stages.leaves[0]
const HUSK_HALF_WIDTH = 0.31
const HUSK_HALF_DEPTH = 0.25
const HUSK_WALL = 0.023
const REST_AXIS = unit(-0.42, 0.86, 0.28)
const REST_SIDE = unit(0.87, 0, 0.5)
// How far past the end of the stem the mouth of the husk sits, and how far short of its blunt end the folded tips stop.
const LEAF_TURN = -0.85
const CRUMB_MIN_M = 0.00018
const CRUMB_MAX_M = 0.00075
const HUSK_ON_SOIL_M = 0.003
const CRUMBS_SINK_S = 9
const CRUMBS_KEY_S = 1.5
const CRUMBS_IN_AIR = [0.55, 0.7, 0.82]
const CRUMBS_GONE_S = 12.5
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
  stemCrumbs: number
  huskCrumbs: number
}
// A crumb of soil that came up on the sprout: where it clings (a share of the stem's length and an angle round it, or a half of the husk and a place on it), when it lets go and where it comes to lie.
interface Crumb {
  half: number
  along: number
  around: number
  size: number
  seat: number
  from: number
  fall: number
  landX: number
  landZ: number
  axis: [number, number, number]
  angle: number
  turns: number
}
interface Crumbs {
  list: Crumb[]
  each: number
  local: Float32Array
  localNormal: Float32Array
  slots: Float32Array[]
  normals: Float32Array
  live: (THREE.BufferAttribute | null)[]
  mesh: THREE.Mesh
  surface: Surface
}

function unit(x: number, y: number, z: number): [number, number, number] {
  const l = Math.hypot(x, y, z) || 1
  return [x / l, y / l, z / l]
}

function shapeOf(options: PartOptions): Shape | null {
  if (options.detail === 'far') return null
  if (options.detail === 'near') return { leafRings: 6, leafLoop: 6, huskRings: 0, huskLoop: 0, stemCrumbs: 0, huskCrumbs: 0 }
  if (options.variant !== 0) return { leafRings: 22, leafLoop: 18, huskRings: 18, huskLoop: 20, stemCrumbs: 6, huskCrumbs: 3 }
  return { leafRings: 36, leafLoop: 30, huskRings: 30, huskLoop: 36, stemCrumbs: 15, huskCrumbs: 8 }
}

// A plump oval on a short broad foot, widest a little past the middle, with a round tip.
function leafOutline(s: number): number {
  const foot = lerp(0.34, 1, smoothstep(0, 0.36, s)) * Math.sqrt(smoothstep(0, 0.03, s))
  return Math.max(0.004, foot * Math.sin(Math.PI * s ** 0.82) ** 0.45)
}

// The shell of the seed from its blunt end, where the halves hang together, to the torn mouth the root came out of.
function huskOutline(s: number): number {
  return Math.max(0.004, Math.sin(Math.PI * (0.84 * s) ** 0.9) ** 0.75)
}

// A broken clod: a ball pushed in and out by a few seeded bumps, with flat faces where it broke, lower than it is wide.
function lump(seed: number, x: number, y: number, z: number, out: Float32Array, at: number, size: number): void {
  let r = 1
  for (let k = 0; k < 6; k++) {
    const cz = 2 * hash01(seed, 10 + k, 0) - 1
    const ca = TAU * hash01(seed, 10 + k, 1)
    const cr = Math.sqrt(Math.max(0, 1 - cz * cz))
    const d = x * cr * Math.cos(ca) + y * cz + z * cr * Math.sin(ca)
    r += lerp(-0.2, 0.3, hash01(seed, 10 + k, 2)) * smoothstep(0.1, 1, d)
  }
  for (let k = 0; k < 3; k++) {
    const cz = 2 * hash01(seed, 20 + k, 0) - 1
    const ca = TAU * hash01(seed, 20 + k, 1)
    const cr = Math.sqrt(Math.max(0, 1 - cz * cz))
    const d = x * cr * Math.cos(ca) + y * cz + z * cr * Math.sin(ca)
    if (d > 0) r = Math.min(r, lerp(0.72, 0.95, hash01(seed, 20 + k, 2)) / d)
  }
  r *= lumpAt(x, y, z, 10 * hash01(seed, 33), 0) / 0.75
  out[at] = x * r * size * lerp(0.75, 1.3, hash01(seed, 30))
  out[at + 1] = y * r * size * lerp(0.5, 0.85, hash01(seed, 31))
  out[at + 2] = z * r * size * lerp(0.75, 1.3, hash01(seed, 32))
}

function makeCrumbs(options: PartOptions, shape: Shape): Crumbs | null {
  const count = shape.stemCrumbs + shape.huskCrumbs
  if (count <= 0) return null
  const seed = combine(streamSeed('seedling crumbs'), options.variant)
  const ball = new THREE.IcosahedronGeometry(1, options.variant === 0 ? 3 : 2).getAttribute('position').array
  const each = ball.length / 3
  const local = new Float32Array(count * each * 3)
  const localNormal = new Float32Array(count * each * 3)
  const coords = new Float32Array(count * each * 4)
  const state = new Float32Array(count * each * 4)
  const list: Crumb[] = []
  const p = new Float32Array(9)
  const toHusk = Math.atan2(huskRest.z, huskRest.x)
  for (let i = 0; i < count; i++) {
    const own = combine(seed, i)
    const onHusk = i >= shape.stemCrumbs
    // Three of the husk's crumbs are in the air at the dawn's first key, one below the other.
    const staged = onHusk && i - shape.stemCrumbs < CRUMBS_IN_AIR.length ? CRUMBS_IN_AIR[i - shape.stemCrumbs] : 0
    const size = staged ? lerp(0.00038, 0.00048, hash01(own, 1)) : lerp(CRUMB_MIN_M, CRUMB_MAX_M, hash01(own, 1) ** 2.2)
    const fall = lerp(0.28, 0.45, hash01(own, 40))
    const far = lerp(0.004, 0.0095, hash01(own, 6))
    const where = onHusk ? toHusk + lerp(-0.7, 0.7, hash01(own, 7)) : TAU * hash01(own, 7)
    const az = 2 * hash01(own, 8) - 1
    const aa = TAU * hash01(own, 9)
    const ar = Math.sqrt(Math.max(0, 1 - az * az))
    list.push({
      half: onHusk ? (hash01(own, 2) < 0.5 ? -1 : 1) : 0,
      along: onHusk ? lerp(0.2, 0.9, hash01(own, 3)) : lerp(0.15, 0.85, hash01(own, 3)),
      around: onHusk ? lerp(-1.2, 1.2, hash01(own, 4)) : TAU * hash01(own, 4),
      size,
      seat: 0.4 * size,
      from: staged ? CRUMBS_KEY_S - staged * fall : onHusk ? lerp(1.25, 3.05, hash01(own, 5)) : lerp(1.2, 3.6, hash01(own, 5)),
      fall,
      landX: Math.cos(where) * far,
      landZ: Math.sin(where) * far,
      axis: [ar * Math.cos(aa), az, ar * Math.sin(aa)],
      angle: TAU * hash01(own, 41),
      turns: lerp(2, 7, hash01(own, 42)) * (hash01(own, 43) < 0.5 ? -1 : 1),
    })
    const tone = lerp(0.62, 1.12, hash01(own, 44))
    for (let v = 0; v < each; v++) {
      const x = ball[v * 3]
      const y = ball[v * 3 + 1]
      const z = ball[v * 3 + 2]
      const at = (i * each + v) * 3
      lump(own, x, y, z, local, at, size)
      // The normal from two near points of the same shape, so the faces where it broke stay flat and their edges stay soft.
      let ux = y * 0 - z * 1
      let uy = z * 0 - x * 0
      let uz = x * 1 - y * 0
      if (Math.hypot(ux, uy, uz) < 0.3) {
        ux = 0
        uy = -z
        uz = y
      }
      const ul = Math.hypot(ux, uy, uz)
      ux /= ul
      uy /= ul
      uz /= ul
      const wx = y * uz - z * uy
      const wy = z * ux - x * uz
      const wz = x * uy - y * ux
      const h = 0.09
      const n1 = Math.hypot(x + ux * h, y + uy * h, z + uz * h)
      const n2 = Math.hypot(x + wx * h, y + wy * h, z + wz * h)
      lump(own, (x + ux * h) / n1, (y + uy * h) / n1, (z + uz * h) / n1, p, 0, size)
      lump(own, (x + wx * h) / n2, (y + wy * h) / n2, (z + wz * h) / n2, p, 3, size)
      const ax = p[0] - local[at]
      const ay = p[1] - local[at + 1]
      const az2 = p[2] - local[at + 2]
      const bx = p[3] - local[at]
      const by = p[4] - local[at + 1]
      const bz = p[5] - local[at + 2]
      let nx = ay * bz - az2 * by
      let ny = az2 * bx - ax * bz
      let nz = ax * by - ay * bx
      const nl = Math.hypot(nx, ny, nz)
      if (nl < 1e-18 || nx * x + ny * y + nz * z < 0) {
        nx = -nx
        ny = -ny
        nz = -nz
      }
      const l = nl || 1
      localNormal[at] = nx / l
      localNormal[at + 1] = ny / l
      localNormal[at + 2] = nz / l
      const c = (i * each + v) * 4
      coords[c] = x * 2.5 + i * 3.7
      coords[c + 1] = y * 2.5 + z * 1.3
      coords[c + 2] = 1
      coords[c + 3] = 4
      state[c] = tone
      state[c + 1] = 0
      state[c + 2] = 1
      state[c + 3] = 0
    }
  }
  const geometry = partGeometry(options)
  const slots = [new Float32Array(count * each * 3), new Float32Array(count * each * 3)]
  const normals = new Float32Array(count * each * 3)
  const dynamic = (array: Float32Array, size: number) => new THREE.BufferAttribute(array, size).setUsage(THREE.DynamicDrawUsage)
  const position = dynamic(slots[0], 3)
  const positionB = options.places ? null : dynamic(slots[1], 3)
  const normal = dynamic(normals, 3)
  geometry.setAttribute('position', position)
  if (positionB) geometry.setAttribute('positionB', positionB)
  geometry.setAttribute('normal', normal)
  geometry.setAttribute('aCoord', new THREE.BufferAttribute(coords, 4))
  geometry.setAttribute('aState', new THREE.BufferAttribute(state, 4))
  const surface = makePartSurface(options, { name: 'seedling crumbs', vertex, fragment, side: THREE.FrontSide, castShadow: true })
  return { list, each, local, localNormal, slots, normals, live: [position, positionB, normal], mesh: partMesh(geometry, surface), surface }
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

  const crumbs = makeCrumbs(options, shape)

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
    const h1y = soilHeightAt(huskRest.x, huskRest.z, time) + HUSK_ON_SOIL_M
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
              state[at * 4 + 3] = lerp(0.55, 0.3, drop)
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

    if (!crumbs) return
    const foot = stemAt(pose, 0)
    const fx = foot.x
    const fz = foot.z
    const cg = Math.cos(gape)
    const sg = Math.sin(gape)
    const under = smoothstep(CRUMBS_SINK_S, CRUMBS_GONE_S, time)
    const out = crumbs.slots[slot]
    for (let i = 0; i < crumbs.list.length; i++) {
      const c = crumbs.list[i]
      let x: number
      let y: number
      let z: number
      if (c.half === 0) {
        const n = stemAt(pose, c.along)
        const ca2 = Math.cos(c.around)
        const sa2 = Math.sin(c.around)
        const off = stemRadius(time, c.along) * grown + c.seat
        x = n.x + (n.rx * ca2 + n.bx * sa2) * off
        y = n.y + (n.ry * ca2 + n.by * sa2) * off
        z = n.z + (n.rz * ca2 + n.bz * sa2) * off
      } else {
        const o = huskOutline(c.along)
        const hw = huskLength * HUSK_HALF_WIDTH * o
        const dp = huskLength * HUSK_HALF_DEPTH * o ** 0.9
        const reach = huskLength * c.along
        const bx = B[0] * cg + px * c.half * sg
        const by = B[1] * cg + py * c.half * sg
        const bz = B[2] * cg + pz * c.half * sg
        const ox = px * c.half * cg - B[0] * sg
        const oy = py * c.half * cg - B[1] * sg
        const oz = pz * c.half * cg - B[2] * sg
        const st = Math.sin(c.around)
        const ct = Math.cos(c.around)
        const across = hw * st
        const outward = dp * ct
        let ux = qx * st * dp + ox * ct * hw
        let uy = qy * st * dp + oy * ct * hw
        let uz = qz * st * dp + oz * ct * hw
        const ul = Math.hypot(ux, uy, uz) || 1
        ux /= ul
        uy /= ul
        uz /= ul
        x = hx + bx * reach + qx * across + ox * outward + ux * c.seat
        y = hy + by * reach + qy * across + oy * outward + uy * c.seat
        z = hz + bz * reach + qz * across + oz * outward + uz * c.seat
      }
      // It lets go, falls and lies where it lands; the rain takes it into the ground.
      const gone = clamp((time - c.from) / c.fall)
      const landY = soilHeightAt(fx + c.landX, fz + c.landZ, time) + 0.5 * c.size - under * (0.004 + 2.5 * c.size)
      x = lerp(x, fx + c.landX, gone)
      z = lerp(z, fz + c.landZ, gone)
      y = lerp(y, landY, gone * gone)
      const scale = under >= 1 ? 0 : 1
      const angle = c.angle + c.turns * gone
      const cs = Math.cos(angle)
      const sn = Math.sin(angle)
      const [kx, ky, kz] = c.axis
      const base = i * crumbs.each * 3
      for (let v = 0; v < crumbs.each; v++) {
        const at = base + v * 3
        const lx = crumbs.local[at]
        const ly = crumbs.local[at + 1]
        const lz = crumbs.local[at + 2]
        const d = (kx * lx + ky * ly + kz * lz) * (1 - cs)
        out[at] = x + scale * (lx * cs + (ky * lz - kz * ly) * sn + kx * d)
        out[at + 1] = y + scale * (ly * cs + (kz * lx - kx * lz) * sn + ky * d)
        out[at + 2] = z + scale * (lz * cs + (kx * ly - ky * lx) * sn + kz * d)
        if (!first) continue
        const mx = crumbs.localNormal[at]
        const my = crumbs.localNormal[at + 1]
        const mz = crumbs.localNormal[at + 2]
        const e = (kx * mx + ky * my + kz * mz) * (1 - cs)
        crumbs.normals[at] = mx * cs + (ky * mz - kz * my) * sn + kx * e
        crumbs.normals[at + 1] = my * cs + (kz * mx - kx * mz) * sn + ky * e
        crumbs.normals[at + 2] = mz * cs + (kx * my - ky * mx) * sn + kz * e
      }
    }
  }

  return {
    name: 'seedling',
    meshes: [...groups.map((g) => g.mesh), ...(crumbs ? [crumbs.mesh] : [])],
    casters: [...groups.filter((g) => g.casts).map((g) => ({ mesh: g.mesh, surface: g.surface })), ...(crumbs ? [{ mesh: crumbs.mesh, surface: crumbs.surface }] : [])],
    fill,
    finish() {
      for (const g of groups) for (const a of g.live) if (a) a.needsUpdate = true
      if (crumbs) for (const a of crumbs.live) if (a) a.needsUpdate = true
    },
  }
}
