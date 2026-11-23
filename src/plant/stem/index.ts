import { norm } from '../norm.ts'
import * as THREE from 'three'
import type { Assets } from '../../core/assets.ts'
import { clamp, lerp, smoothstep } from '../../core/curves.ts'
import { combine, hash01, streamSeed } from '../../core/random.ts'
import { heightAt, leafAzimuth, leafCount, leafLength, paleness, seedLeafLength, stemBend, stemRadius } from '../growth.ts'
import { createHairs, type HairSet } from '../hairs/index.ts'
import { filling, makePartSurface, partGeometry, partMesh, stateUniforms, wetFelt, type PartOptions, type PlantPart } from '../part.ts'
import { beadAt, createBeads, type Bead } from '../surface/wet/index.ts'
import { NECK_FLARE, stemAt, type Pose } from '../skeleton.ts'
import { SKIN_TILE_M, ribMap, skinMap } from './maps.ts'
import { ANCHORS, Anchors, COLLAR_M, SEED_ANCHOR, STURDY, collarAt, youngGirth, TOP_M, finalRadius, fixedLabels, makeRibs, ribProfile, ribsAt, wrapAngle } from './shape.ts'
import { fragment, vertex } from './skin.ts'

const TAU = Math.PI * 2
const CELLS = 512
const NODES = leafCount + 2
const RIB_HEIGHT = 0.03
const BUMP_MAX = 0.7
const JOINT_OVERLAP_M = 0.004
// The stem wears two coats: a dense short down that adds up to the pale line on its outline, and sparse long fine hairs that stand clear of it.
const DOWN_WIDTH_M = 0.00016
const HAIR_WIDTH_M = 0.00014
const DOWN_PER_HAIR = 12
const SPROUT_WIDTH_M = 0.00005
// The dew on a stem is finer than the shared bead sizes.
const FROST_FROM_S = 30
const BLOOM_FROM_S = 40
const DEW_FINE = 0.5
const RAIN_FINE = 1.0

// `hairs` is how many stand on a square meter of grown skin.
interface Coat { set: HairSet; low: number; high: number; seg: Uint8Array; at: Float32Array; thick: Float32Array; own: Float32Array; drawn: number; sprout: boolean; down: boolean }
interface Shape { main: number; sides: number; below: number; cap: number; hairs: number; sprout: number; beads: number; full: boolean }

function shapeOf(options: PartOptions): Shape {
  if (options.detail === 'near') return { main: 11, sides: 5, below: 0, cap: 0, hairs: 0, sprout: 0, beads: 0, full: false }
  if (options.detail === 'far') return { main: 3, sides: 3, below: 0, cap: 0, hairs: 0, sprout: 0, beads: 0, full: false }
  if (options.variant !== 0) return { main: 100, sides: 24, below: 1, cap: 4, hairs: 8500, sprout: 1500, beads: 30, full: true }
  return { main: 170, sides: 40, below: 1, cap: 5, hairs: 34000, sprout: 5200, beads: 90, full: true }
}

export function create(options: PartOptions): PlantPart {
  const shape = shapeOf(options)
  const { main, sides, below, cap, full } = shape
  const rings = below + main + cap
  const row = sides + 1
  const count = rings * row
  const seed = combine(streamSeed('stem'), options.variant)
  const ribs = makeRibs(seed)
  const sunSide = hash01(seed, 60) * TAU

  const geometry = partGeometry(options)
  const slots = [new Float32Array(count * 3), new Float32Array(count * 3)]
  const normals = new Float32Array(count * 3)
  const coords = new Float32Array(count * 3)
  const skin = new Float32Array(count * 4)
  const skin2 = new Float32Array(count * 4)
  const skin3 = new Float32Array(count * 4)
  const index: number[] = []
  for (let r = 0; r < rings - 1; r++) {
    for (let s = 0; s < sides; s++) {
      const a = r * row + s
      const b = a + row
      index.push(a, a + 1, b, a + 1, b + 1, b)
    }
  }
  const dynamic = (array: Float32Array, size: number) => new THREE.BufferAttribute(array, size).setUsage(THREE.DynamicDrawUsage)
  const position = dynamic(slots[0], 3)
  const positionB = options.places ? null : dynamic(slots[1], 3)
  const sent = [dynamic(normals, 3), dynamic(coords, 3), dynamic(skin, 4), dynamic(skin2, 4), dynamic(skin3, 4)]
  geometry.setAttribute('position', position)
  if (positionB) geometry.setAttribute('positionB', positionB)
  geometry.setAttribute('normal', sent[0])
  geometry.setAttribute('aCoord', sent[1])
  geometry.setAttribute('aSkin', sent[2])
  geometry.setAttribute('aSkin2', sent[3])
  geometry.setAttribute('aSkin3', sent[4])
  geometry.setIndex(index)
  const maps = { uSkin: { value: null as THREE.Texture | null }, uRibs: { value: null as THREE.Texture | null } }
  const surface = makePartSurface(options, { name: 'stem', vertex, fragment, uniforms: options.places ? {} : maps })
  const mesh = partMesh(geometry, surface)

  // On the field tiers one ring spacing is far longer than the foot, so the foot's color would spread up the stem.
  const footShown = shape.full ? 1 : shape.main > 3 ? 0.35 : 0.1
  const hairTable = new Float64Array(CELLS + 1)
  const hairFrom = fixedLabels()[SEED_ANCHOR]
  for (let c = 0; c < CELLS; c++) {
    const label = hairFrom + ((c + 0.5) / CELLS) * (TOP_M - hairFrom)
    const x = label / TOP_M
    const patch = (TAU * finalRadius(label) * (TOP_M - hairFrom)) / CELLS
    hairTable[c + 1] = hairTable[c] + patch * (1 + 3 * smoothstep(0.45, 0.8, x) + 2 * smoothstep(0.9, 0.985, x))
  }
  const fixed = fixedLabels()
  // A hair belongs to a stretch of tissue between two anchors and keeps its share of that stretch for the whole film.
  // The hairs are kept in order from the foot up, so the ones on tissue that has not grown out yet are the last and are left undrawn.
  const coat = (perM2: number, name: string, widthM: number, salt: number, low: number, high: number): Coat | null => {
    const set = perM2 ? createHairs(options, Math.round(perM2 * hairTable[CELLS]), name, undefined, widthM) : null
    if (!set) return null
    const n = set.count
    const c: Coat = { set, low, high, seg: new Uint8Array(n), at: new Float32Array(n), thick: new Float32Array(n), own: new Float32Array(n * 6), drawn: 0, sprout: false, down: high < 0.002 }
    for (let i = 0; i < n; i++) {
      const want = ((i + hash01(seed, salt, i)) / n) * hairTable[CELLS]
      let cell = Math.min(CELLS - 1, Math.floor((i / n) * CELLS))
      while (cell > 0 && hairTable[cell] > want) cell--
      while (cell < CELLS - 1 && hairTable[cell + 1] < want) cell++
      const label = hairFrom + ((cell + (want - hairTable[cell]) / (hairTable[cell + 1] - hairTable[cell])) / CELLS) * (TOP_M - hairFrom)
      let k = SEED_ANCHOR
      while (k < ANCHORS - 2 && label >= fixed[k + 1]) k++
      c.seg[i] = k
      c.at[i] = clamp((label - fixed[k]) / (fixed[k + 1] - fixed[k]))
      c.thick[i] = finalRadius(label)
      const a = hash01(seed, salt + 2, i) * TAU
      c.own.set([hash01(seed, salt + 1, i), a, Math.cos(a), Math.sin(a), hash01(seed, salt + 3, i), 0.78 * hash01(seed, salt + 7, i)], i * 6)
    }
    return c
  }
  // The young stem below the seed leaves wears a few very fine short hairs, evenly from the foot to the joint. They are what the low sun lights on its outline, and they are shed before the stem is a stalk.
  const sproutCoat = (count: number, salt: number): Coat | null => {
    const set = count ? createHairs(options, count, 'sprout hairs', undefined, SPROUT_WIDTH_M) : null
    if (!set) return null
    const n = set.count
    const c: Coat = { set, low: 0.0001, high: 0.00028, seg: new Uint8Array(n), at: new Float32Array(n), thick: new Float32Array(n), own: new Float32Array(n * 6), drawn: 0, sprout: true, down: false }
    for (let i = 0; i < n; i++) {
      const x = (i + hash01(seed, salt, i)) / n
      c.seg[i] = x < 0.5 ? 0 : 1
      c.at[i] = x < 0.5 ? 2 * x : 2 * x - 1
      const a = hash01(seed, salt + 2, i) * TAU
      c.own.set([hash01(seed, salt + 1, i), a, Math.cos(a), Math.sin(a), hash01(seed, salt + 3, i), hash01(seed, salt + 7, i)], i * 6)
    }
    return c
  }
  const coats = [coat(shape.hairs, 'stem hairs', HAIR_WIDTH_M, 80, 0.0035, 0.005), coat(shape.hairs * DOWN_PER_HAIR, 'stem down', DOWN_WIDTH_M, 90, 0.0004, 0.0009), sproutCoat(shape.sprout, 100)].filter((c): c is Coat => c !== null)

  // Dew and rain stand on the stem in beads, each at its own height and side; in the rain they run down to the soil and soak away.
  const dew = shape.beads ? createBeads(options, shape.beads, 'stem dew') : null
  const dewOwn = new Float32Array((dew ? dew.count : 0) * 5)
  const bead: Bead = { along: 0, across: 0, radiusM: 0, hang: 0, fallM: 0 }
  let dewDrawn = 0
  if (dew) {
    const tint = dew.tint()
    for (let i = 0; i < dew.count; i++) {
      const a = hash01(seed, 211, i) * TAU
      dewOwn.set([0.85 * hash01(seed, 212, i), hash01(seed, 213, i), a, Math.cos(a), Math.sin(a)], i * 5)
      tint.set([0.34, 0.34, 0.13], i * 3)
    }
  }

  const anchors = new Anchors()
  const weight = new Float64Array(CELLS)
  const cum = new Float64Array(CELLS + 1)
  const ringS = new Float64Array(main)
  const ringM = new Float64Array(main)
  const ringR = new Float32Array(main)
  const ringAt = new Float32Array(main * 12)
  const ringNeck = new Float32Array(main)
  const grid = new Float32Array(main * row)
  const nodeS = new Float64Array(NODES)
  const nodeA = new Float64Array(NODES)
  const nodeAmp = new Float64Array(NODES)
  const nodeReach = new Float32Array(NODES)
  const nodeR = new Float64Array(NODES)
  const actA = new Float64Array(NODES)
  const actAmp = new Float64Array(NODES)

  function fill(slot: 0 | 1, pose: Pose): void {
    if (slot === 1 && !positionB) return
    const out = slots[slot]
    const first = filling.lead
    const time = pose.time
    const length = pose.length
    const grown = smoothstep(0, 0.006, heightAt(time))
    const headR = pose.head.radius
    const hasHead = smoothstep(0, 0.012, headR)
    const neckShare = stemBend(time, pose.inputs).neckShare
    const rFoot = stemRadius(time, 0) * grown
    const footLength = Math.min(0.03, 0.12 * length + 0.002)
    const pale = paleness(time)
    const tender = Math.round(64 * (1 - smoothstep(37, 44.5, time))) + Math.round(16 * (1 - smoothstep(10, 16, time)))
    const flareTo = NECK_FLARE * headR
    const grounded = 1 - smoothstep(36.5, BLOOM_FROM_S, time)

    const base = (u: number, s: number): number => {
      let r = stemRadius(time, u) * grown * (1 + 0.17 * Math.exp(-s / (0.004 + 1.2 * rFoot))) * youngGirth(time, u)
      if (!full) return r
      // The bud's own neck rings sit on the plain radius and a straight flare, so the last centimeter comes back to them.
      const near = smoothstep(length - 0.02, length - 0.007, s)
      r *= 1 + 0.16 * hasHead * smoothstep(1 - neckShare * 1.15, 0.975, u) * (1 - near)
      const x = clamp((u - 0.97) / 0.03)
      const curved = r + Math.max(0, flareTo - r) * x ** 1.6
      return lerp(curved, Math.max(r, flareTo * x), near)
    }

    anchors.set(pose)
    let nodes = 0
    if (full) {
      for (let i = 0; i < leafCount; i++) {
        const amp = smoothstep(0, 0.05, leafLength(i, time))
        if (amp < 0.004) continue
        nodeS[nodes] = anchors.s[3 + i]
        nodeA[nodes] = leafAzimuth(i, time) - Math.PI / 2
        nodeAmp[nodes] = amp
        nodeReach[nodes] = 0.5 * leafLength(i, time)
        nodeR[nodes] = Math.max(1e-5, base(length > 0 ? anchors.s[3 + i] / length : 0, anchors.s[3 + i]))
        nodes++
      }
      const seedAmp = 0.5 * smoothstep(0, 0.012, seedLeafLength(time))
      if (seedAmp > 0.004) {
        for (let side = 0; side < 2; side++) {
          nodeS[nodes] = anchors.s[SEED_ANCHOR]
          nodeA[nodes] = side === 0 ? Math.PI : 0
          nodeAmp[nodes] = seedAmp
          nodeReach[nodes] = 0
          nodeR[nodes] = Math.max(1e-5, stemRadius(time, length > 0 ? anchors.s[SEED_ANCHOR] / length : 0) * grown)
          nodes++
        }
      }
    }

    const cell = length / CELLS
    // At the close of the shutter every ring stays on the tissue it sat on at the open, so the skin does not slide while the shutter is open.
    if (!first) {
      for (let j = 0; j < main; j++) ringS[j] = clamp(anchors.sAt(ringM[j]), 0, length)
      for (let j = 1; j < main; j++) ringS[j] = Math.max(ringS[j], ringS[j - 1])
    }
    // Rings go where the shape needs them: where the stem bends, at each node, in the flare under the head and at the foot.
    if (first) {
      weight.fill(22 / CELLS)
      let px = 0
      let py = 1
      let pz = 0
      for (let c = 0; c <= CELLS; c++) {
        const n = stemAt(pose, c / CELLS)
        if (c > 0) weight[c - 1] += Math.acos(Math.min(1, px * n.tx + py * n.ty + pz * n.tz)) / 0.07
        px = n.tx
        py = n.ty
        pz = n.tz
      }
      if (full && cell > 0) {
        for (let k = 0; k < nodes; k++) {
          const sigma = Math.max(1.7 * nodeR[k], 2 * cell)
          const share = (5 * Math.min(1, 3 * nodeAmp[k]) * cell) / (sigma * Math.sqrt(Math.PI))
          const c0 = Math.max(0, Math.floor((nodeS[k] - 2.5 * sigma) / cell))
          const c1 = Math.min(CELLS - 1, Math.ceil((nodeS[k] + 2.5 * sigma) / cell))
          for (let c = c0; c <= c1; c++) {
            const d = ((c + 0.5) * cell - nodeS[k]) / sigma
            weight[c] += share * Math.exp(-d * d)
          }
        }
        const flareCells = Math.ceil(0.04 * CELLS)
        for (let c = CELLS - flareCells; c < CELLS; c++) weight[c] += (10 * hasHead) / flareCells
        const footCells = Math.max(1, Math.min(CELLS, Math.ceil((3 * rFoot + 0.004) / cell)))
        for (let c = 0; c < footCells; c++) weight[c] += 3 / footCells
      }
      cum[0] = 0
      for (let c = 0; c < CELLS; c++) cum[c + 1] = cum[c] + weight[c]
      const total = cum[CELLS]
      for (let j = 0, c = 0; j < main; j++) {
        const want = (total * j) / (main - 1)
        while (c < CELLS - 1 && cum[c + 1] < want) c++
        ringS[j] = Math.min(length, (c + (want - cum[c]) / weight[c]) * cell)
      }
      ringS[main - 1] = length
      for (let j = 0; j < main; j++) ringM[j] = anchors.labelAt(ringS[j])
    }

    const rEnd = base(1, length)
    const collar = collarAt(time)
    const seedS = anchors.s[SEED_ANCHOR]
    const slopeEnd = length > 0 ? (flareTo / (0.03 * length)) * smoothstep(1, 1.3, flareTo / Math.max(stemRadius(time, 1) * grown, 1e-6)) : 0
    for (let j = 0; j < rings; j++) {
      let s = 0
      let off = 0
      let scale = 1
      if (j < below) off = -(0.014 + 0.6 * rFoot) * grown
      else if (j < below + main) s = ringS[j - below]
      else {
        const k = j - below - main + 1
        const turn = (k / cap) * (Math.PI / 2)
        const deep = JOINT_OVERLAP_M * Math.min(1, k / (cap - 1))
        off = lerp(0.9 * rEnd * Math.sin(turn), deep, hasHead)
        scale = lerp(Math.cos(turn), k < cap ? 1 + (0.8 * slopeEnd * deep) / Math.max(rEnd, 1e-6) : 0, hasHead)
        s = length
      }
      const u = length > 0 ? s / length : 0
      const n = stemAt(pose, u)
      if (j >= below && j < below + main) ringAt.set([n.x, n.y, n.z, n.rx, n.ry, n.rz, n.bx, n.by, n.bz, n.tx, n.ty, n.tz], (j - below) * 12)
      const cx = n.x + n.tx * off
      const cy = n.y + n.ty * off
      const cz = n.z + n.tz * off
      const whole = base(u, s)
      const r0 = whole * scale
      const label = anchors.labelAt(s) + off
      const flared = hasHead * smoothstep(0.972, 0.996, u)
      const ribbed = full ? smoothstep(0.0028, 0.0085, whole) * (1 - flared) * scale : 0
      const ribHeight = RIB_HEIGHT * Math.min(whole, 0.02) * ribbed
      if (full) ribsAt(ribs, label)
      const collared = collar * smoothstep(seedS - COLLAR_M, seedS - 0.0005, s + off) ** 1.5
      // Above the seed leaves the shoot is still a thin tip: the swell ends in a shoulder under their bases.
      const tip = smoothstep(seedS - 0.0006, seedS + 0.0016, s + off)
      let swell = (collared + STURDY * collar) * (1 - tip) - collar * tip
      let active = 0
      for (let k = 0; k < nodes; k++) {
        const rn = nodeR[k]
        const d = s + off - nodeS[k]
        if (d < -18 * rn || d > 3.6 * rn) continue
        // The stalk leaves upward, so it comes out of the skin a little above its node and the cushion under it runs on down the stem.
        const e = d - 0.6 * rn
        const above = e / (1.1 * rn)
        const under = e / (1.8 * rn)
        const along = e >= 0 ? Math.exp(-above * above) : 0.7 * Math.exp(-under * under) + 0.3 * Math.exp(e / (5 * rn))
        actA[active] = nodeA[k]
        actAmp[active] = (0.6 * nodeAmp[k] * along) / BUMP_MAX
        active++
        const wide = d / (2.2 * rn)
        swell += 0.1 * nodeAmp[k] * Math.exp(-wide * wide)
      }
      if (j >= below && j < below + main) {
        ringR[j - below] = whole
        ringNeck[j - below] = hasHead * smoothstep(1 - neckShare * 1.3, 0.99, u)
      }
      const youth = clamp(1 - smoothstep(0.0022, 0.0075, whole) + 0.3 * smoothstep(0.8, 1, u) * (1 - hasHead * 0.5))
      const thin = 1 - smoothstep(0.0015, 0.0055, whole)
      const foot = footShown * Math.exp(-Math.max(0, s + off) / footLength)
      // The stem stands under its own head and leaves: each hides a share of the sky from the skin below it.
      const under = length - s - off
      const wide = 1.5 * headR
      let sky = 1 - (0.55 * hasHead * wide * wide) / (wide * wide + under * under + 1e-9)
      for (let k = 0; k < nodes; k++) {
        const d = nodeS[k] - s - off
        const reach = nodeReach[k]
        if (reach <= 0 || d < -nodeR[k]) continue
        sky *= 1 - (0.4 * smoothstep(-nodeR[k], 3 * nodeR[k], d) * reach * reach) / (reach * reach + d * d)
      }
      const open = (0.55 + 0.45 * smoothstep(0, 0.002 + 0.6 * rFoot, s + off)) * (0.3 + 0.7 * sky) * (1 - 0.8 * collared) * lerp(1, 0.3 + 0.7 * smoothstep(0, 0.004 + 1.6 * rFoot, s + off), grounded)
      const joint = hasHead * (1 - smoothstep(0, 0.014, length - s - off))
      const sprout = pale * (1 - 0.45 * smoothstep(0.3, 1, u))
      const bald = (1 - smoothstep(anchors.s[SEED_ANCHOR] - 2 * whole, anchors.s[SEED_ANCHOR], s)) * (1 - pale * smoothstep(0.3, 0.55, u)) * (1 - 0.9 * pale * (1 - smoothstep(0.001, 0.007, s + off))) * (1 - smoothstep(0.004, 0.009, rFoot))
      for (let side = 0; side <= sides; side++) {
        const a = (side / sides) * TAU
        const c = Math.cos(a)
        const e = Math.sin(a)
        const rib = full ? ribProfile(ribs, side === sides ? 0 : a) : 0
        let keep = 1
        for (let k = 0; k < active; k++) {
          const d = wrapAngle(a - actA[k]) / 0.52
          keep *= 1 - Math.min(0.96, actAmp[k] * Math.exp(-d * d))
        }
        const radius = r0 * (1 + swell + BUMP_MAX * (1 - keep)) + ribHeight * rib
        const nx = n.rx * c + n.bx * e
        const ny = n.ry * c + n.by * e
        const nz = n.rz * c + n.bz * e
        const at = j * row + side
        out[at * 3] = cx + nx * radius
        out[at * 3 + 1] = cy + ny * radius
        out[at * 3 + 2] = cz + nz * radius
        if (j >= below && j < below + main) grid[(j - below) * row + side] = radius
        if (!first) continue
        const sun = 0.5 + 0.5 * Math.cos(a - sunSide)
        coords[at * 3] = side / sides
        coords[at * 3 + 1] = label / SKIN_TILE_M
        coords[at * 3 + 2] = label / TOP_M
        skin[at * 4] = rib
        skin[at * 4 + 1] = youth + 1 + 4 * tender
        skin[at * 4 + 2] = sprout
        skin[at * 4 + 3] = foot
        skin2[at * 4] = open
        skin2[at * 4 + 1] = (1 - youth) * (0.3 + 0.7 * sun) * (0.45 + 0.55 * (1 - u))
        skin2[at * 4 + 2] = j >= below && j < below + main ? ringNeck[j - below] : hasHead
        skin2[at * 4 + 3] = thin * (1 - 1.1 * collared)
        skin3[at * 4] = joint
        skin3[at * 4 + 1] = ribbed
        skin3[at * 4 + 2] = bald * lerp(0.45 + 0.55 * sun, 0.85 + 0.15 * sun, pale)
        skin3[at * 4 + 3] = ribHeight
      }
    }

    if (first) {
      const tip = stemAt(pose, 1)
      for (let j = 0; j < rings; j++) {
        const j0 = Math.max(0, j - 1)
        const j1 = Math.min(rings - 1, j + 1)
        for (let side = 0; side <= sides; side++) {
          const left = (side === 0 ? sides - 1 : side - 1) + j * row
          const right = (side === sides ? 1 : side + 1) + j * row
          const down = j0 * row + side
          const up = j1 * row + side
          const ax = out[right * 3] - out[left * 3]
          const ay = out[right * 3 + 1] - out[left * 3 + 1]
          const az = out[right * 3 + 2] - out[left * 3 + 2]
          const sx = out[up * 3] - out[down * 3]
          const sy = out[up * 3 + 1] - out[down * 3 + 1]
          const sz = out[up * 3 + 2] - out[down * 3 + 2]
          let nx = ay * sz - az * sy
          let ny = az * sx - ax * sz
          let nz = ax * sy - ay * sx
          const l = norm(nx, ny, nz)
          if (l > 1e-14) {
            nx /= l
            ny /= l
            nz /= l
          } else {
            nx = tip.tx
            ny = tip.ty
            nz = tip.tz
          }
          const at = (j * row + side) * 3
          normals[at] = nx
          normals[at + 1] = ny
          normals[at + 2] = nz
        }
      }
    }

    const S = anchors.s
    const M = anchors.m
    const shed = 1 - smoothstep(18, FROST_FROM_S, time)
    for (const c of coats) {
      const root = c.set.root(slot)
      const lean = c.set.lean(slot)
      if (first) c.drawn = 0
      let j = 0
      for (let i = 0; i < c.set.count; i++) {
        const k = c.seg[i]
        const span = S[k + 1] - S[k]
        // Tissue that has not stretched out yet holds its hairs folded away.
        const stretched = span / (M[k + 1] - M[k])
        const o = i * 4
        lean[o] = 0
        lean[o + 1] = 1
        lean[o + 2] = 0
        const w = i * 6
        lean[o + 3] = c.own[w]
        // A hair on tissue that has not stretched out, or a sprout hair after they are shed, has no size: its place is not worked out.
        if (length <= 0 || (c.sprout ? shed <= 0 : stretched <= 0.03)) {
          root[o] = 0
          root[o + 1] = 0
          root[o + 2] = 0
          root[o + 3] = 0
          continue
        }
        const s = S[k] + c.at[i] * span
        // The hairs come in order from the foot up, so the ring under each is the last one's or one further on.
        if (s < ringS[j]) j = 0
        while (j < main - 2 && ringS[j + 1] <= s) j++
        const step = Math.max(1e-9, ringS[j + 1] - ringS[j])
        const fr = clamp((s - ringS[j]) / step)
        const col = (c.own[w + 1] / TAU) * sides
        const c0 = Math.min(sides - 1, Math.floor(col))
        const fc = col - c0
        const low = lerp(grid[j * row + c0], grid[j * row + c0 + 1], fc)
        const high = lerp(grid[(j + 1) * row + c0], grid[(j + 1) * row + c0 + 1], fc)
        const radius = lerp(low, high, fr)
        const slope = clamp((high - low) / step, -1.5, 1.5)
        const r0 = lerp(ringR[j], ringR[j + 1], fr)
        const p = j * 12
        const ca = c.own[w + 2]
        const sa = c.own[w + 3]
        const ox = lerp(ringAt[p + 3], ringAt[p + 15], fr) * ca + lerp(ringAt[p + 6], ringAt[p + 18], fr) * sa
        const oy = lerp(ringAt[p + 4], ringAt[p + 16], fr) * ca + lerp(ringAt[p + 7], ringAt[p + 19], fr) * sa
        const oz = lerp(ringAt[p + 5], ringAt[p + 17], fr) * ca + lerp(ringAt[p + 8], ringAt[p + 20], fr) * sa
        const q = c.own[w + 4]
        const mature = 0.7 + 0.3 * smoothstep(0.0018, 0.006, r0)
        // A hair stands for a patch of grown skin: young skin is a fraction of that, so only that fraction of its hairs is out.
        const patch = stretched * Math.min(1, r0 / c.thick[i])
        const own = c.own[w + 5]
        const shown = c.sprout ? shed * smoothstep(0.3 + 0.2 * own, 0.55 + 0.2 * own, time) * smoothstep(0.0005, 0.0025, S[SEED_ANCHOR] - s) : smoothstep(own, own + 0.22, patch) * smoothstep(0.03, 0.2, stretched)
        const reach = shown > 0 ? radius : 0
        root[o] = lerp(ringAt[p + 0], ringAt[p + 12], fr) + ox * reach
        root[o + 1] = lerp(ringAt[p + 1], ringAt[p + 13], fr) + oy * reach
        root[o + 2] = lerp(ringAt[p + 2], ringAt[p + 14], fr) + oz * reach
        if (shown > 0) c.drawn = Math.max(c.drawn, i + 1)
        root[o + 3] = Math.min(0.9 * r0, lerp(c.low, c.high, q)) * mature * shown * (c.down ? 1 + stateUniforms.uPlantFrost.value : 1) * (1 - stateUniforms.uPlantFrost.value * hasHead * (1 - smoothstep(0.005, 0.02, length - s)))
        lean[o] = ox - lerp(ringAt[p + 9], ringAt[p + 21], fr) * slope
        lean[o + 1] = oy - lerp(ringAt[p + 10], ringAt[p + 22], fr) * slope
        lean[o + 2] = oz - lerp(ringAt[p + 11], ringAt[p + 23], fr) * slope
      }
    }
    if (dew) {
      const seat = dew.seat(slot)
      const rest = dew.rest(slot)
      if (first) dewDrawn = 0
      const rain = smoothstep(0.3, 0.9, wetFelt())
      const tint = dew.tint()
      const sLow = 0.0015
      const sHigh = Math.max(S[SEED_ANCHOR] - 0.0012, 0.9 * ringS[main - 1])
      for (let i = 0; i < dew.count; i++) {
        const w = i * 5
        const o = i * 4
        const b = beadAt(dewOwn[w], dewOwn[w + 1], 0, time, bead)
        const s = sHigh - b.along * (sHigh - sLow)
        let j = 0
        let hi = main - 1
        while (hi - j > 1) {
          const mid = (j + hi) >> 1
          if (ringS[mid] <= s) j = mid
          else hi = mid
        }
        const fr = clamp((s - ringS[j]) / Math.max(1e-9, ringS[j + 1] - ringS[j]))
        const col = (dewOwn[w + 2] / TAU) * sides
        const c0 = Math.min(sides - 1, Math.floor(col))
        const fc = col - c0
        const radius = lerp(lerp(grid[j * row + c0], grid[j * row + c0 + 1], fc), lerp(grid[(j + 1) * row + c0], grid[(j + 1) * row + c0 + 1], fc), fr)
        const p = j * 12
        const ca = dewOwn[w + 3]
        const sa = dewOwn[w + 4]
        const ox = lerp(ringAt[p + 3], ringAt[p + 15], fr) * ca + lerp(ringAt[p + 6], ringAt[p + 18], fr) * sa
        const oy = lerp(ringAt[p + 4], ringAt[p + 16], fr) * ca + lerp(ringAt[p + 7], ringAt[p + 19], fr) * sa
        const oz = lerp(ringAt[p + 5], ringAt[p + 17], fr) * ca + lerp(ringAt[p + 8], ringAt[p + 20], fr) * sa
        // The dew gathers on the new skin bead by bead in its first seconds in the air.
        const since = 0.6 + 4.2 * dewOwn[w + 1]
        const size = length <= 0 || sHigh <= sLow || b.fallM > 0 ? 0 : b.radiusM * lerp(DEW_FINE, RAIN_FINE * (1 - b.hang), rain) * smoothstep(0.004, 0.012, sHigh - sLow) * smoothstep(since, since + 1.5, time)
        seat[o] = lerp(ringAt[p + 0], ringAt[p + 12], fr) + ox * radius
        seat[o + 1] = lerp(ringAt[p + 1], ringAt[p + 13], fr) + oy * radius
        seat[o + 2] = lerp(ringAt[p + 2], ringAt[p + 14], fr) + oz * radius
        // On the thin young stem the dew stands in fine beads, never in drops as wide as the stem.
        seat[o + 3] = Math.min(size, lerp(0.45, 0.11, (1 - rain) * (1 - smoothstep(9, 12, time))) * radius)
        tint[i * 3] = lerp(0.34, 0.04, rain)
        tint[i * 3 + 1] = lerp(0.34, 0.075, rain)
        tint[i * 3 + 2] = lerp(0.13, 0.04, rain)
        rest[o] = ox
        rest[o + 1] = oy
        rest[o + 2] = oz
        rest[o + 3] = 0
        if (size > 0) dewDrawn = i + 1
      }
    }
  }

  return {
    name: 'stem',
    meshes: [mesh, ...coats.flatMap((c) => c.set.meshes), ...(dew ? dew.meshes : [])],
    casters: [{ mesh, surface }],
    async load(assets: Assets) {
      if (options.places) return
      maps.uSkin.value = skinMap(assets)
      maps.uRibs.value = ribMap(assets, options.variant, ribs)
    },
    fill,
    finish() {
      position.needsUpdate = true
      if (positionB) positionB.needsUpdate = true
      for (const a of sent) a.needsUpdate = true
      for (const c of coats) c.set.finish(c.drawn)
      if (dew) dew.finish(dewDrawn)
    },
  }
}
