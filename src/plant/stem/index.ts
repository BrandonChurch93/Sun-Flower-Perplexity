import { norm } from '../norm.ts'
import * as THREE from 'three'
import type { Assets } from '../../core/assets.ts'
import { clamp, lerp, smoothstep } from '../../core/curves.ts'
import { combine, hash01, streamSeed } from '../../core/random.ts'
import { heightAt, leafAge, leafAzimuth, leafCount, leafLength, paleness, seedLeafLength, stemBend, stemRadius } from '../growth.ts'
import { createBristles } from '../bristles/index.ts'
import { createHairFrames, createHairs, packWay, type HairFrames, type HairSet } from '../hairs/index.ts'
import { filling, makePartSurface, partGeometry, partMesh, stateUniforms, wetFelt, type PartOptions, type PlantPart } from '../part.ts'
import { beadAt, createBeads, type Bead } from '../surface/wet/index.ts'
import { NECK_FLARE, stemAt, type Pose } from '../skeleton.ts'
import { SKIN_TILE_M, ribMap, skinMap } from './maps.ts'
import { ANCHORS, Anchors, COLLAR_M, SEED_ANCHOR, STURDY, collarAt, youngGirth, TOP_M, finalRadius, fixedLabels, makeRibs, ribProfile, ribsAt, wrapAngle } from './shape.ts'
import { fragment, vertex } from './skin.ts'
import { createCrystals } from '../../weather/frost/index.ts'

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
// The hairs of the sprout come out from this second on, the last of them this much later than the first, each over a quarter of a second.
const SPROUT_FROM_S = 0.3
const SPROUT_SPREAD_S = 0.2
const SPROUT_OUT = 0.88
// The dew on a stem is finer than the shared bead sizes.
const FROST_FROM_S = 30
const BLOOM_FROM_S = 40
const DEW_FINE = 0.5
const RAIN_FINE = 1.0
// Where a bristle stands on the stem, and ice on it: this many places, evenly from the foot to the tip as it stands. Most are short, one in six is long.
const RIME_ROOTS = 3200
const BRISTLE_M = [0.0005, 0.0012]
const BRISTLE_LONG_M = [0.0014, 0.0022]
const BRISTLE_LONG_SHARE = 1 / 6
// Until it carries a head the stalk ends in a shoot that runs out to a point over this many of its own radii. The tissue packed in it wears the finest hairs of the plant, lying toward the point as on a bud.
const TIP_TALL = 2.4
const TIP_HAIRS = 384
const TIP_HAIR_M = [0.0003, 0.0008]
const TIP_WIDTH_M = 0.00003
const TIP_LEAN = 2
const TIP_BELOW = 0.6
const tipGirth = (q: number): number => (1 - q) ** 0.8 * (1 + 0.5 * q)
// A hair sits between two stations that stay on their tissue: each stretch between two anchors has this many steps, shorter toward the anchors where the leaves swell the skin. The hairs of the shoot sit on its rings and on this many stations under it.
const SUB = 13
const STATIONS = (ANCHORS - 1) * (SUB + 1)
const TIP_LOW = 4
const WIDE = 32
// How far a hair stands on a rib is kept in its seat as this share of the rib's height.
const RIB_SEAT = 0.25

// `hairs` is how many stand on a square meter of grown skin.
interface Coat { set: HairSet; frames: HairFrames; from: number; to: number; upTo: Uint32Array; drawn: number[] }
interface Shape { main: number; sides: number; below: number; cap: number; hairs: number; sprout: number; beads: number; full: boolean }

function shapeOf(options: PartOptions): Shape {
  if (options.detail === 'near') return { main: 11, sides: 5, below: 0, cap: 0, hairs: 0, sprout: 0, beads: 0, full: false }
  if (options.detail === 'far') return { main: 3, sides: 3, below: 0, cap: 0, hairs: 0, sprout: 0, beads: 0, full: false }
  if (options.variant !== 0) return { main: 100, sides: 24, below: 1, cap: 4, hairs: 8500, sprout: 1500, beads: 30, full: true }
  return { main: 170, sides: 40, below: 1, cap: 5, hairs: 34000, sprout: 5200, beads: 90, full: true }
}

const tender = (time: number): number => Math.round(64 * (1 - smoothstep(37, 44.5, time))) + Math.round(16 * (1 - smoothstep(10, 16, time)))

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
  // What a slot carries beside the shape: the normals and the skin's numbers of its own moment. The neighbors keep one.
  const carried = (options.places ? [0] : [0, 1]).map(() => ({ normals: new Float32Array(count * 3), coords: new Float32Array(count * 3), skin: new Float32Array(count * 4), skin2: new Float32Array(count * 4), skin3: new Float32Array(count * 4) }))
  // How tender the skin is in each slot, in steps: 64 for the young stem's and 16 more for the sprout's.
  const ages = [0, 0]
  const filled = [false, false]
  const led = [false, false]
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
  const sent = carried.map((c) => [dynamic(c.normals, 3), dynamic(c.coords, 3), dynamic(c.skin, 4), dynamic(c.skin2, 4), dynamic(c.skin3, 4)])
  geometry.setAttribute('position', position)
  if (positionB) geometry.setAttribute('positionB', positionB)
  const names = ['normal', 'aCoord', 'aSkin', 'aSkin2', 'aSkin3']
  sent.forEach((list, k) => list.forEach((a, n) => geometry.setAttribute(names[n] + (k === 1 ? 'B' : ''), a)))
  geometry.setIndex(index)
  const maps = { uSkin: { value: null as THREE.Texture | null }, uRibs: { value: null as THREE.Texture | null } }
  const age = { uStemAge: { value: 0 } }
  const surface = makePartSurface(options, { name: 'stem', vertex, fragment, uniforms: options.places ? age : { ...maps, ...age } })
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
  const steps = new Float64Array(SUB + 1)
  for (let i = 0; i <= SUB; i++) steps[i] = lerp(i / SUB, 0.5 - 0.5 * Math.cos((Math.PI * i) / SUB), 0.6)
  const thick = new Float32Array(STATIONS)
  for (let f = 0; f < STATIONS; f++) {
    const k = Math.floor(f / (SUB + 1))
    thick[f] = finalRadius(lerp(fixed[k], fixed[k + 1], steps[f % (SUB + 1)]))
  }
  const coatFrames = shape.hairs ? createHairFrames(STATIONS, true) : null
  const downFrames = shape.hairs ? createHairFrames(STATIONS, true) : null
  // A hair belongs to a stretch of tissue between two anchors and keeps its share of that stretch for the whole film: it is seated once, between the two stations it stands between.
  // The hairs are kept in order from the foot up, so the ones on tissue that has not grown out yet are the last and are left undrawn.
  const seated = (set: HairSet, frames: HairFrames, low: number, high: number, from: number, to: number, place: (i: number, at: { k: number; share: number }) => void, salt: number, born: (own: number) => number): Coat => {
    const seats = set.bindFrames(frames, 0.5 * (low + high))
    const upTo = new Uint32Array(STATIONS)
    const at = { k: 0, share: 0 }
    for (let i = 0; i < set.count; i++) {
      place(i, at)
      let i0 = Math.min(SUB - 1, Math.floor(at.share * SUB))
      while (i0 > 0 && steps[i0] > at.share) i0--
      while (i0 < SUB - 1 && steps[i0 + 1] <= at.share) i0++
      const f = at.k * (SUB + 1) + i0
      const a = hash01(seed, salt + 2, i) * TAU
      ribsAt(ribs, lerp(fixed[at.k], fixed[at.k + 1], at.share))
      const far = 1 + RIB_SEAT * ribProfile(ribs, a)
      seats.set([f, f + 1, clamp((at.share - steps[i0]) / (steps[i0 + 1] - steps[i0])), lerp(low, high, hash01(seed, salt + 3, i)), Math.cos(a) * far, Math.sin(a) * far, 1, hash01(seed, salt + 1, i), 0, 0, 1, born(hash01(seed, salt + 7, i))], i * 12)
      upTo[f] = i + 1
    }
    for (let f = 1; f < STATIONS; f++) upTo[f] = Math.max(upTo[f], upTo[f - 1])
    set.sealSeats()
    return { set, frames, from: from * (SUB + 1), to: to * (SUB + 1), upTo, drawn: [0, 0] }
  }
  const coat = (perM2: number, name: string, widthM: number, salt: number, low: number, high: number, frames: HairFrames | null): Coat | null => {
    const set = perM2 ? createHairs(options, Math.round(perM2 * hairTable[CELLS]), name, undefined, widthM) : null
    if (!set || !frames) return null
    const n = set.count
    return seated(set, frames, low, high, SEED_ANCHOR, ANCHORS - 1, (i, at) => {
      const want = ((i + hash01(seed, salt, i)) / n) * hairTable[CELLS]
      let cell = Math.min(CELLS - 1, Math.floor((i / n) * CELLS))
      while (cell > 0 && hairTable[cell] > want) cell--
      while (cell < CELLS - 1 && hairTable[cell + 1] < want) cell++
      const label = hairFrom + ((cell + (want - hairTable[cell]) / (hairTable[cell + 1] - hairTable[cell])) / CELLS) * (TOP_M - hairFrom)
      let k = SEED_ANCHOR
      while (k < ANCHORS - 2 && label >= fixed[k + 1]) k++
      at.k = k
      at.share = clamp((label - fixed[k]) / (fixed[k + 1] - fixed[k]))
    }, salt, (own) => Math.max(0.78 * own, 1e-4))
  }
  // The young stem below the seed leaves wears a few very fine short hairs, evenly from the foot to the joint. They are what the low sun lights on its outline, and they are shed before the stem is a stalk.
  const sproutCoat = (count: number, salt: number, frames: HairFrames | null): Coat | null => {
    const set = count ? createHairs(options, count, 'sprout hairs', undefined, SPROUT_WIDTH_M) : null
    if (!set || !frames) return null
    const n = set.count
    return seated(set, frames, 0.0001, 0.00028, 0, SEED_ANCHOR, (i, at) => {
      const x = (i + hash01(seed, salt, i)) / n
      at.k = x < 0.5 ? 0 : 1
      at.share = x < 0.5 ? 2 * x : 2 * x - 1
    }, salt, (own) => SPROUT_OUT * SPROUT_SPREAD_S * own + 1e-4)
  }
  const coats = [coat(shape.hairs, 'stem hairs', HAIR_WIDTH_M, 80, 0.0035, 0.005, coatFrames), coat(shape.hairs * DOWN_PER_HAIR, 'stem down', DOWN_WIDTH_M, 90, 0.0004, 0.0009, downFrames), sproutCoat(shape.sprout, 100, coatFrames)].filter((c): c is Coat => c !== null)

  const tipSet = cap > 0 ? createHairs(options, options.variant === 0 ? TIP_HAIRS : TIP_HAIRS / 4, 'stem tip', undefined, TIP_WIDTH_M) : null
  const tipFrames = tipSet ? createHairFrames(TIP_LOW + cap + 1, true) : null
  const tipDrawn = [0, 0]
  if (tipSet && tipFrames) {
    const seats = tipSet.bindFrames(tipFrames, 0.5 * (TIP_HAIR_M[0] + TIP_HAIR_M[1]))
    for (let i = 0; i < tipSet.count; i++) {
      const a = ((i * 0.618034 + 0.2 * hash01(seed, 111, i)) % 1) * TAU
      const up = (0.9 + TIP_BELOW) * ((i + hash01(seed, 110, i)) / tipSet.count) ** 1.2 - TIP_BELOW
      const x = up < 0 ? (up / TIP_BELOW + 1) * TIP_LOW : cap * up
      const f = Math.min((up < 0 ? TIP_LOW : cap) - 1, Math.floor(x))
      const q = hash01(seed, 112, i)
      seats.set([(up < 0 ? 0 : TIP_LOW) + f, (up < 0 ? 0 : TIP_LOW) + f + 1, x - f, lerp(TIP_HAIR_M[0], TIP_HAIR_M[1], q), Math.cos(a), Math.sin(a), 1, q, 0, TIP_LEAN * (0.6 + 0.8 * q), 1, 0], i * 12)
    }
    tipSet.sealSeats()
  }

  const crystals = createCrystals(options, shape.full && options.variant === 0 ? RIME_ROOTS : 0, 'stem crystals')
  // The bristles of the young stem and the roots of the ice on it are one list: the ice sleeves each bristle.
  const bristles = createBristles(options, crystals ? crystals.count : 0, 'stem bristles')
  const rimeOwn = new Float32Array((crystals ? crystals.count : 0) * 8)
  if (crystals) {
    crystals.place().fill(-3)
    for (let i = 0; i < crystals.count; i++) {
      const a = ((i * 0.618034 + 0.3 * hash01(seed, 302, i)) % 1) * TAU
      rimeOwn.set([(i + hash01(seed, 301, i)) / crystals.count, a, Math.cos(a), Math.sin(a), hash01(seed, 303, i), 0.15 + 0.55 * hash01(seed, 304, i), hash01(seed, 305, i) - 0.5, hash01(seed, 306, i)], i * 8)
    }
  }

  // Dew and rain stand on the stem in beads, each at its own height and side; in the rain they run down to the soil and soak away.
  const dew = shape.beads ? createBeads(options, shape.beads, 'stem dew') : null
  const dewOwn = new Float32Array((dew ? dew.count : 0) * 5)
  const bead: Bead = { along: 0, across: 0, radiusM: 0, hang: 0, fallM: 0 }
  const dewDrawn = [0, 0]
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
  const grid = new Float32Array((main + cap) * row)
  const capOff = new Float32Array(cap + 1)
  const capGirth = new Float32Array(cap + 1).fill(1)
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
    const { normals, coords, skin, skin2, skin3 } = carried[first ? slot : 0]
    filled[slot] = true
    if (first) {
      led[slot] = true
      ages[slot] = tender(pose.time)
    }
    const time = pose.time
    const length = pose.length
    const grown = smoothstep(0, 0.006, heightAt(time))
    const headR = pose.head.radius
    const hasHead = smoothstep(0, 0.012, headR)
    const neckShare = stemBend(time, pose.inputs).neckShare
    const rFoot = stemRadius(time, 0) * grown
    const footLength = Math.min(0.03, 0.12 * length + 0.002)
    const pale = paleness(time)
    const flareTo = NECK_FLARE * headR
    const grounded = 1 - smoothstep(36.5, BLOOM_FROM_S, time)
    const young = smoothstep(0, 2, leafAge(0, time))

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
    // How much the skin is swollen at a height: by the collar under the seed leaves and by the cushion under each leaf, whose places round the stem are listed as it goes.
    let active = 0
    let collared = 0
    const swellAt = (at: number): number => {
      collared = collar * smoothstep(seedS - COLLAR_M, seedS - 0.0005, at) ** 1.5
      // Above the seed leaves the shoot is still a thin tip: the swell ends in a shoulder under their bases.
      const tip = smoothstep(seedS - 0.0006, seedS + 0.0016, at)
      let swell = (collared + STURDY * collar) * (1 - tip) - collar * tip
      active = 0
      for (let k = 0; k < nodes; k++) {
        const rn = nodeR[k]
        const d = at - nodeS[k]
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
      return swell
    }
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
        off = lerp(rEnd * lerp(0.9 * Math.sin(turn), (TIP_TALL * k) / cap, young), deep, hasHead)
        scale = lerp(lerp(Math.cos(turn), tipGirth(k / cap), young), k < cap ? 1 + (0.8 * slopeEnd * deep) / Math.max(rEnd, 1e-6) : 0, hasHead)
        capOff[k] = off
        capGirth[k] = scale
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
      const swell = swellAt(s + off)
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
        if (j >= below) grid[(j - below) * row + side] = radius
        if (!first) continue
        const sun = 0.5 + 0.5 * Math.cos(a - sunSide)
        coords[at * 3] = side / sides
        coords[at * 3 + 1] = label / SKIN_TILE_M
        coords[at * 3 + 2] = label / TOP_M
        skin[at * 4] = rib
        skin[at * 4 + 1] = youth + 1
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
    const frost = stateUniforms.uPlantFrost.value
    // A station of the hairs: where the ring of skin is at a height, how long the hairs on it are, how far its skin has grown, and the swellings on it.
    const station = (data: Float32Array, o: number, n: ReturnType<typeof stemAt>, rise: number, ring: number, swell: number, long: number, grown: number, most: number, rib: number): void => {
      data[o] = n.x + n.tx * rise
      data[o + 1] = n.y + n.ty * rise
      data[o + 2] = n.z + n.tz * rise
      data[o + 3] = long
      data[o + 4] = n.rx * ring
      data[o + 5] = n.ry * ring
      data[o + 6] = n.rz * ring
      data[o + 8] = n.bx * ring
      data[o + 9] = n.by * ring
      data[o + 10] = n.bz * ring
      packWay(data, o + 7, o + 11, n.tx, n.ty, n.tz)
      data[o + 12] = grown
      data[o + 13] = most
      data[o + 14] = rib
      for (let q = 0; q < 8; q++) {
        let best = -1
        for (let b = 0; b < active; b++) if (actAmp[b] > 0 && (best < 0 || actAmp[b] > actAmp[best])) best = b
        const h = best < 0 ? 0 : (BUMP_MAX * actAmp[best]) / (1 + swell)
        data[o + 16 + q * 2] = best < 0 ? 0 : Math.cos(actA[best]) * h
        data[o + 17 + q * 2] = best < 0 ? 0 : Math.sin(actA[best]) * h
        if (best >= 0) actAmp[best] = 0
      }
    }
    if (coatFrames && downFrames) {
      const data = coatFrames.slot(slot)
      const down = downFrames.slot(slot)
      for (const c of coats) c.drawn[slot] = 0
      for (let k = 0; k < ANCHORS - 1; k++) {
        const span = S[k + 1] - S[k]
        // Tissue that has not stretched out yet holds its hairs folded away, and the hairs of the sprout are shed.
        const stretched = span / Math.max(1e-12, M[k + 1] - M[k])
        const low = k < SEED_ANCHOR
        const out = length > 0 && (low ? shed > 0 : stretched > 0.03)
        for (let i = 0; i <= SUB; i++) {
          const f = k * (SUB + 1) + i
          const o = f * WIDE
          if (!out) {
            data[o + 3] = 0
            continue
          }
          const at = S[k] + steps[i] * span
          const u = at / length
          const whole = base(u, at)
          const swell = swellAt(at)
          const ribbed = full ? smoothstep(0.0028, 0.0085, whole) * (1 - hasHead * smoothstep(0.972, 0.996, u)) : 0
          const mature = 0.7 + 0.3 * smoothstep(0.0018, 0.006, whole)
          const long = mature * (low ? shed * smoothstep(0.0005, 0.0025, S[SEED_ANCHOR] - at) : smoothstep(0.03, 0.2, stretched)) * (1 - frost * hasHead * (1 - smoothstep(0.005, 0.02, length - at)))
          // A hair stands for a patch of grown skin: young skin is a fraction of that, so only that fraction of its hairs is out.
          const patch = low ? SPROUT_OUT * (time - SPROUT_FROM_S) : stretched * Math.min(1, whole / thick[f])
          station(data, o, stemAt(pose, u), 0, whole * (1 + swell), swell, long, patch, 0.9 * whole, (RIB_HEIGHT * Math.min(whole, 0.02) * ribbed) / Math.max(1e-9, whole * (1 + swell) * RIB_SEAT))
          if (long > 0) for (const c of coats) if (c.frames === coatFrames && f >= c.from && f < c.to) c.drawn[slot] = c.upTo[f]
        }
      }
      // Under frost the down stands for the rime on it and is twice as long.
      down.set(data)
      for (const c of coats) {
        if (c.frames !== downFrames) continue
        for (let f = c.from; f < c.to; f++) {
          if (down[f * WIDE + 3] > 0) c.drawn[slot] = c.upTo[f]
          down[f * WIDE + 3] *= 1 + frost
        }
      }
    }
    if (tipSet && tipFrames) {
      const data = tipFrames.slot(slot)
      const risen = length > 0 ? (1 - hasHead) * young : 0
      tipDrawn[slot] = risen > 0 ? tipSet.count : 0
      const top = stemAt(pose, 1)
      for (let f = 0; f <= TIP_LOW + cap; f++) {
        const k = f - TIP_LOW
        const rise = k < 0 ? (k / TIP_LOW) * TIP_BELOW * capOff[cap] : capOff[k]
        const at = Math.max(0, length + rise)
        const whole = k < 0 ? base(length > 0 ? at / length : 0, at) : rEnd * capGirth[k]
        const swell = swellAt(length + rise)
        station(data, f * WIDE, top, rise, whole * (1 + swell), swell, risen, 0, 0, 0)
      }
    }
    if (crystals && stateUniforms.uPlantFrost.value > 0) {
      const root = crystals.root(slot)
      const lean = crystals.lean(slot)
      const run = (crystals as unknown as { along?: (slot: 0 | 1) => Float32Array }).along?.(slot)
      const own = bristles ? bristles.root(slot) : null
      const way = bristles ? bristles.lean(slot) : null
      const top = ringS[main - 1]
      for (let i = 0, j = 0, node = 0; i < crystals.count; i++) {
        const w = i * 8
        const o = i * 4
        const s = 0.002 + rimeOwn[w] * (top - 0.002)
        while (j < main - 2 && ringS[j + 1] <= s) j++
        const fr = clamp((s - ringS[j]) / Math.max(1e-9, ringS[j + 1] - ringS[j]))
        const col = (rimeOwn[w + 1] / TAU) * sides
        const c0 = Math.min(sides - 1, Math.floor(col))
        const fc = col - c0
        const radius = lerp(lerp(grid[j * row + c0], grid[j * row + c0 + 1], fc), lerp(grid[(j + 1) * row + c0], grid[(j + 1) * row + c0 + 1], fc), fr)
        const p = j * 12
        const ca = rimeOwn[w + 2]
        const sa = rimeOwn[w + 3]
        const ox = lerp(ringAt[p + 3], ringAt[p + 15], fr) * ca + lerp(ringAt[p + 6], ringAt[p + 18], fr) * sa
        const oy = lerp(ringAt[p + 4], ringAt[p + 16], fr) * ca + lerp(ringAt[p + 7], ringAt[p + 19], fr) * sa
        const oz = lerp(ringAt[p + 5], ringAt[p + 17], fr) * ca + lerp(ringAt[p + 8], ringAt[p + 20], fr) * sa
        const ux = lerp(ringAt[p + 9], ringAt[p + 21], fr)
        const uy = lerp(ringAt[p + 10], ringAt[p + 22], fr)
        const uz = lerp(ringAt[p + 11], ringAt[p + 23], fr)
        // A bristle stands out and up the stem, each at its own tilt and turn, and more of the long ones stand where the leaves leave the stem.
        const up = rimeOwn[w + 5]
        const round = rimeOwn[w + 6]
        let dx = ox + ux * up + (uy * oz - uz * oy) * round
        let dy = oy + uy * up + (uz * ox - ux * oz) * round
        let dz = oz + uz * up + (ux * oy - uy * ox) * round
        const dl = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1
        dx /= dl
        dy /= dl
        dz /= dl
        while (node < S.length - 1 && S[node + 1] <= s) node++
        const near = 1 - smoothstep(0.0015, 0.007, Math.min(Math.abs(s - S[node]), Math.abs(S[Math.min(S.length - 1, node + 1)] - s)))
        const above = smoothstep(S[SEED_ANCHOR] - 0.004, S[SEED_ANCHOR] + 0.002, s)
        const q = rimeOwn[w + 4]
        const tall = clamp((BRISTLE_LONG_SHARE * (1 + near) - rimeOwn[w + 7]) / 0.04)
        const long = top > 0.004 ? lerp(lerp(BRISTLE_M[0], BRISTLE_M[1], q), lerp(BRISTLE_LONG_M[0], BRISTLE_LONG_M[1], q), tall) * lerp(0.45, 1, above) : 0
        root[o] = lerp(ringAt[p + 0], ringAt[p + 12], fr) + ox * radius
        root[o + 1] = lerp(ringAt[p + 1], ringAt[p + 13], fr) + oy * radius
        root[o + 2] = lerp(ringAt[p + 2], ringAt[p + 14], fr) + oz * radius
        root[o + 3] = long
        lean[o] = dx
        lean[o + 1] = dy
        lean[o + 2] = dz
        lean[o + 3] = q
        if (own && way) {
          own[o] = root[o]
          own[o + 1] = root[o + 1]
          own[o + 2] = root[o + 2]
          own[o + 3] = long
          way[o] = dx
          way[o + 1] = dy
          way[o + 2] = dz
          way[o + 3] = q
        }
        if (run) {
          run[i * 3] = ux
          run[i * 3 + 1] = uy
          run[i * 3 + 2] = uz
        }
      }
    }
    if (dew) {
      const seat = dew.seat(slot)
      const rest = dew.rest(slot)
      dewDrawn[slot] = 0
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
        if (size > 0) dewDrawn[slot] = i + 1
      }
    }
  }

  const settle = (share: number): void => {
    age.uStemAge.value = share > 0 ? lerp(ages[0], ages[1], share) : ages[0]
  }

  return {
    name: 'stem',
    meshes: [mesh, ...coats.flatMap((c) => c.set.meshes), ...(tipSet ? tipSet.meshes : []), ...(dew ? dew.meshes : []), ...(crystals ? crystals.meshes : []), ...(bristles ? bristles.meshes : [])],
    casters: [{ mesh, surface }],
    async load(assets: Assets) {
      if (options.places) return
      maps.uSkin.value = skinMap(assets)
      maps.uRibs.value = ribMap(assets, options.variant, ribs)
    },
    fill,
    finish() {
      if (filled[0]) position.needsUpdate = true
      if (filled[1] && positionB) positionB.needsUpdate = true
      for (let k = 0; k < sent.length; k++) if (led[k]) for (const a of sent[k]) a.needsUpdate = true
      filled.fill(false)
      led.fill(false)
      coatFrames?.finish()
      downFrames?.finish()
      tipFrames?.finish()
      for (const c of coats) c.set.finish(Math.max(c.drawn[0], c.drawn[1]))
      tipSet?.finish(Math.max(tipDrawn[0], tipDrawn[1]))
      if (dew) dew.finish(Math.max(dewDrawn[0], dewDrawn[1]))
      crystals?.finish(stateUniforms.uPlantFrost.value > 0 ? crystals.count : 0)
      bristles?.finish(stateUniforms.uPlantFrost.value > 0 ? bristles.count : 0)
      settle(0)
    },
    settle,
  }
}
