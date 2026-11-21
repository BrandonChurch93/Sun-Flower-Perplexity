// The leaves: 24 blades on their stalks, each with its own outline, veins, curl and marks, grown by the timing in growth.ts.
import * as THREE from 'three'
import type { Assets } from '../../core/assets.ts'
import { config } from '../../config.ts'
import { clamp, lerp, smoothstep } from '../../core/curves.ts'
import { combine, hash01, streamSeed } from '../../core/random.ts'
import { bodyHalfDepth, bodyRadius, bractLength, heightAt, leafAge, leafCount, leafDroop, leafElevation, leafFold, leafFoldScale, leafLength, leafRoll, leafSeed, leafStemFraction, plantVariant, stemRadius, usePlant } from '../growth.ts'
import { createHairs, type HairSet } from '../hairs/index.ts'
import { makePartSurface, partGeometry, partMesh, stateUniforms, type PartDetail, type PartOptions, type PlantPart } from '../part.ts'
import { leafFrameAt, type Pose } from '../skeleton.ts'
import { beadAt, createBeads, type Bead, type BeadSet } from '../surface/wet/index.ts'
import { createCrystals } from '../../weather/frost/index.ts'
import { fallDir, landingsNear, rainStrength, type Drop } from '../../weather/rain/drops.ts'
import { flutter, gust } from '../wind.ts'
import { VEIN_PAD, VEIN_SEED, leafMaps } from './maps.ts'
import { LEAVES, bladeDepth, bladeFragment, bladeVertex, stalkFragment, stalkVertex } from './shaders.ts'
import { SETS, sweepAt, toothAt, veinField, veinsOf, widthAt, type Vein } from './shape.ts'

// The stalk is the first third of a leaf's whole reach: it rises from the stem and arches over, and the blade hangs from its end.
const REACH = 1.25
const STALK = 0.36
const PATH = 48
// The blades of the main plant turn their faces to the open side of the row, where the lens stands in the bloom.
const OPEN_SIDE = 0.35
const FACING = 1.2
const HEM_DROP = 0.0022
const HEM_IN = 0.004
const TROUGH = 0.0045

const HERO_COLS = [-1, -0.86, -0.68, -0.46, -0.24, -0.06, 0, 0.06, 0.24, 0.46, 0.68, 0.86, 1]
const FIELD_COLS = [-1, 0, 1]
const NEAR_ROWS = [-1, 0, 0.16, 0.38, 0.6, 0.82, 1]
const FAR_ROWS = [-1, 0.3, 1]

const SHAPE: Record<PartDetail, { step: number; rows: number; wide: number; hairs: number }> = {
  hero: { step: 1, rows: 128, wide: 1, hairs: 54000 },
  near: { step: 1, rows: NEAR_ROWS.length, wide: 1, hairs: 0 },
  far: { step: 3, rows: FAR_ROWS.length, wide: 1.7, hairs: 0 },
}

const RINGS_STALK = 21
const RINGS_RIB = 16
const RINGS = RINGS_STALK + RINGS_RIB
const SIDES = 10
const RIB_END = 0.9

interface Leaf {
  i: number
  base: number
  tube: number
  nu: number
  nv: number
  hem: boolean
  // Each row: its share of the whole reach, and its place on the blade.
  sig: Float32Array
  // Each vertex, flat, in lengths of the blade: across, along its row's direction, and up.
  px: Float32Array
  py: Float32Array
  pz: Float32Array
  pc: Float32Array
  qx: Float32Array
  qy: Float32Array
  qz: Float32Array
  seed: number
  mirror: number
  set: number
  twist: number
  kink: number
  tipCurl: number
  reach: number
  stalk: number
  rise: number
  bow: number
  crease: number
  yellows: number
}

interface Hair { leaf: number; kind: number; a: number; b: number; r1: number; r2: number; r3: number; r4: number }

const frame = { ox: 0, oy: 0, oz: 0, mx: 1, my: 0, mz: 0, wx: 0, wy: 0, wz: 1, nx: 0, ny: 1, nz: 0 }
const pathX = new Float64Array(PATH + 1)
const pathZ = new Float64Array(PATH + 1)
const pathA = new Float64Array(PATH + 1)
const at = { x: 0, z: 0, a: 0 }

const ramp = (d: number): number => 0.5 * (d + Math.sqrt(d * d + 0.00015))

function sample(share: number): void {
  const f = clamp(share) * PATH
  const k = Math.min(PATH - 1, Math.floor(f))
  const t = f - k
  at.x = pathX[k] + (pathX[k + 1] - pathX[k]) * t
  at.z = pathZ[k] + (pathZ[k + 1] - pathZ[k]) * t
  at.a = pathA[k] + (pathA[k + 1] - pathA[k]) * t
}

export function create(options: PartOptions): PlantPart {
  const shape = SHAPE[options.detail]
  const hero = options.detail === 'hero'
  const seed = combine(streamSeed('leaves'), options.variant)
  const cols = hero ? HERO_COLS : FIELD_COLS
  const nv = cols.length + (hero ? 2 : 0)
  const veinSets: Vein[][][] = []
  for (let set = 0; set < SETS; set++) veinSets.push([veinsOf(VEIN_SEED, set, 0), veinsOf(VEIN_SEED, set, 1)])

  const before = plantVariant()
  usePlant(options.variant)
  const fullLength: number[] = []
  const shares: number[] = []
  for (let i = 0; i < leafCount; i++) {
    fullLength.push(leafLength(i, 1e4))
    shares.push(0.36 + 0.1 * leafSeed(i, 1))
  }
  usePlant(before)

  const dryLeaf = 5 + Math.floor(hash01(seed, 900) * 6)
  const tornLeaf = 12 + Math.floor(hash01(seed, 901) * 7)
  // The leaf the bloom frames see right of the stem, just under the head, has a dry tip that curls under.
  const witheredLeaf = 21

  const leaves: Leaf[] = []
  let vertices = 0
  let tubes = 0
  const uvList: number[] = []
  const leafList: number[] = []
  const markList: number[] = []
  const planeList: number[] = []
  const index: number[] = []

  // The companion keeps the narrower folded blades: its leaf at the sun was placed with them and must not cover the sun.
  const main = options.variant === 0
  for (let i = 0; i < leafCount; i += shape.step) {
    const r = (k: number) => hash01(seed, i, k)
    const rank = i / (leafCount - 1)
    const upper = smoothstep(0.62, 1, rank)
    const full = fullLength[i]
    // The neighbor's upper leaves are the largest leaves in the frame.
    const rowsHero = !main && i >= 14 ? shape.rows : Math.round(clamp(40 + 88 * ((full - 0.1) / 0.15), 40, shape.rows) * (main ? 1 : 0.6))
    const rows = hero ? rowsHero : options.detail === 'near' ? NEAR_ROWS : FAR_ROWS
    const nu = typeof rows === 'number' ? rows : rows.length
    const share = shares[i] * lerp(1, main ? 0.96 : 0.86, upper) * shape.wide
    const cord = lerp(0.95, 0.4, upper) * (0.65 + 0.35 * r(1))
    const tip = 0.22 + 0.25 * r(2)
    const lean = (r(3) - 0.5) * 0.26
    const teeth = 15 + 8 * r(4)
    const depth = 0.055 + 0.05 * r(5)
    const waveAmp = 0.026 + 0.03 * r(6)
    const waveRate = 3.5 + 4 * r(7)
    const withered = i === witheredLeaf
    // The leaf that hangs right under the head is a small one on an arched stalk.
    const tuck = main ? Math.exp(-(((rank - 0.913) / 0.03) ** 2)) : 0
    const blade = lerp(1, main ? 0.9 : 0.76, upper) * (1 - 0.42 * tuck)
    const roll = withered ? (main ? 0.55 : 0.42) : (main ? 0.08 : 0.02) + 0.12 * r(8) + (r(9) > 0.7 ? 0.14 : 0)
    const lump = 0.011 + 0.017 * r(30)
    const folds = main ? 2.2 : 1
    const deep = main ? 1 : 0.6
    // A grown blade is creased along a few lines, mostly where a side vein runs, and each crease turns a facet of it out of the light.
    const creases: number[] = []
    if (hero) {
      for (let side = 0; side < 2; side++) {
        for (let k = 0; k < 2; k++) {
          const c = 44 + side * 12 + k * 5
          creases.push(side, 0.12 + 0.3 * k + 0.25 * r(c), 0.2 + 0.6 * r(c + 1), 0.1 + 0.16 * r(c + 2), (r(c + 3) < 0.5 ? -1 : 1) * (0.35 + 0.4 * r(c + 4)) * deep)
        }
      }
    }
    const pleat = hero ? [0.3 + 0.3 * r(68), (r(69) < 0.6 ? -1 : 1) * (0.6 + 0.7 * r(70)) * deep, 0.3 + 0.3 * r(71), (r(72) < 0.6 ? -1 : 1) * (0.6 + 0.7 * r(73)) * deep] : null
    const set = Math.min(SETS - 1, Math.floor(r(10) * SETS))
    const mirror = r(11) < 0.5 ? -1 : 1
    // A hole or a scar the size of a hand in the lens reads as an error, so the neighbor's upper blades are whole.
    const whole = !main && i >= 14
    const dry = !whole && (i === dryLeaf || (withered && !main))
    const torn = !whole && i === tornLeaf
    const old = 1 - rank
    const kind = r(12)
    const holes = !whole && kind < 0.1 + 0.14 * old
    const bitten = !whole && !holes && kind < 0.3 + 0.2 * old
    const threshold = holes ? 0.73 + 0.05 * r(13) : bitten ? 0.87 : 2
    const bias = holes ? 0.06 : bitten ? 0.17 + 0.07 * r(14) : 0
    const leaf: Leaf = {
      i,
      base: vertices,
      tube: tubes,
      nu,
      nv,
      hem: hero,
      sig: new Float32Array(nu),
      px: new Float32Array(nu * nv),
      py: new Float32Array(nu * nv),
      pz: new Float32Array(nu * nv),
      pc: new Float32Array(nu * nv),
      qx: new Float32Array(nu * nv),
      qy: new Float32Array(nu * nv),
      qz: new Float32Array(nu * nv),
      seed: r(15),
      mirror,
      set,
      twist: (r(16) - 0.5) * 0.7 + (r(17) > 0.82 ? (r(18) - 0.5) * 1.4 : 0),
      kink: withered ? (main ? 1.25 : 1.5) : 0.08 + 0.45 * r(19) + 0.5 * tuck,
      tipCurl: withered ? 1.5 : dry ? 1.1 : main ? 0.45 + 0.7 * r(20) : hero ? 0.35 + 0.6 * r(20) : 0.15 + 0.5 * r(20) * r(20),
      reach: STALK + (1 - STALK) * blade,
      stalk: STALK / (STALK + (1 - STALK) * blade),
      rise: withered && main ? 1.15 : lerp(0.95, main ? 0.85 : 0.6, upper) * (0.8 + 0.4 * r(35)),
      bow: (r(74) < 0.5 ? -1 : 1) * (0.12 + 0.2 * r(75)),
      crease: withered ? (main ? 0.3 : 1.15) : main ? 0.2 + 0.4 * r(36) : 0.12 + 0.5 * r(36),
      yellows: (i < 7 ? 0.35 + 0.65 * r(21) : 0.25 * r(21)) * (0.4 + 0.6 * old),
    }
    for (let a = 0; a < nu; a++) {
      const s = typeof rows === 'number' ? a / (nu - 1) : Math.max(0, rows[a])
      const onStalk = typeof rows !== 'number' && rows[a] < 0
      leaf.sig[a] = onStalk ? -1 : s
      for (let b = 0; b < nv; b++) {
        const hem = hero && (b === 0 || b === nv - 1)
        const w = cols[hero ? clamp(b - 1, 0, cols.length - 1) : b]
        const aw = Math.abs(w)
        const side = w < 0 ? 0 : 1
        const veins = veinSets[set][mirror > 0 ? side : 1 - side]
        const v = a * nv + b
        let x = 0
        let y = 0
        // Each place on the blade is laid out twice: as the smooth narrow oval of a leaf just open, then as the creased heart it grows into.
        for (let ripe = 0; ripe < 2; ripe++) {
          const cordNow = cord * (ripe ? 1 : 0.5)
          const wide = widthAt(s, cordNow, ripe ? tip : Math.min(0.62, tip + 0.2)) * share * (ripe ? 1 : 0.98)
          const rolled = roll * (ripe ? 1 : 0.3) * (0.55 + 0.9 * r(28 + side)) * Math.min(1, wide * 4)
          // A tooth on a rolled edge runs down the slope, so it reaches less far out.
          const steep = Math.hypot(1, (3 * rolled) / Math.max(wide, 0.05))
          const tooth = hero ? (toothAt(s, combine(seed, i * 2 + side), teeth, depth * (ripe ? 1 : 0.7)) * smoothstep(0.6, 1, aw)) / steep : 0
          const wobble = 1 + 0.035 * Math.sin(9 * s + 6.28 * r(22 + side)) * aw
          x = w * wide * (1 + (side ? lean : -lean)) * (1 + tooth) * wobble
          y = sweepAt(s, w, cordNow) * (1 + 0.3 * (r(24 + side) - 0.5))
          const across = Math.abs(x)
          // The bends are laid over the leaf as it really lies, so a tooth carries on the surface it grows from.
          const ae = aw * (1 + tooth) * wobble
          const pillow = hero ? Math.min(1, veinField(veins, w, s).near / 0.028) : 1
          let z = (ripe ? 0.019 : 0.011) * pillow * (2 - pillow) * smoothstep(0, 0.08, aw) * Math.min(1, wide * 6)
          z -= TROUGH * (1 - 0.7 * s) * Math.exp(-((across / 0.016) ** 2))
          z += waveAmp * (ripe ? 1 : 0.35) * Math.pow(ae, 2.5) * (Math.sin(6.2832 * (waveRate * s + r(26 + side))) * (0.55 + 0.45 * Math.sin(6.2832 * (0.37 * waveRate * s + r(39 + side)))) + 0.5 * Math.sin(6.2832 * (1.83 * waveRate * s + r(41 + side)))) * smoothstep(0, 0.12, s) * Math.min(1, wide * 5)
          z -= rolled * ae * ae * ae
          z += lump * (ripe ? 1 : 0.15) * (folds * Math.sin(6.2832 * (1.7 * s + r(31))) * Math.sin(2.6 * w + 6.2832 * r(32)) + 0.4 * Math.sin(6.2832 * (4.1 * s + r(33))) * Math.sin(5.3 * w + 6.2832 * r(34)) + 0.32 * Math.sin(6.2832 * (7.3 * s + r(37))) * Math.sin(9.1 * w + 6.2832 * r(38))) * smoothstep(0.05, 0.45, aw) * Math.min(1, wide * 5)
          z -= 0.03 * Math.pow(ae, 2) * Math.pow(Math.max(0, 1 - s / 0.3), 2) * cordNow
          let bent = 0
          if (ripe) {
            const flat = smoothstep(0.03, 0.2, aw) * Math.min(1, wide * 5)
            for (let c = 0; c < creases.length; c += 5) {
              if (creases[c] !== side) continue
              const d = s - creases[c + 1] - creases[c + 2] * ae * wide
              bent += creases[c + 4] * (ramp(d) - ramp(d - creases[c + 3])) * flat
            }
            if (pleat) bent += pleat[side * 2 + 1] * wide * ramp(ae - pleat[side * 2]) * smoothstep(0.05, 0.3, s)
          }
          if (onStalk) {
            x = w * 0.012
            y = 0
            z = 0
          }
          if (hem) {
            x -= Math.sign(w) * Math.min(HEM_IN, across * 0.5)
            z -= HEM_DROP * Math.min(1, wide * 12)
          }
          if (ripe) {
            leaf.px[v] = x
            leaf.py[v] = y
            leaf.pz[v] = z
            leaf.pc[v] = onStalk ? 0 : bent
          } else {
            leaf.qx[v] = x
            leaf.qy[v] = y
            leaf.qz[v] = z
          }
        }
        uvList.push(w, s)
        leafList.push(i, set, leaf.seed, mirror)
        markList.push(threshold, bias, withered && dry ? 1.14 : dry ? 1 : torn ? 2 : 0, 0.3 + 0.7 * old)
        planeList.push(x * full, (s + y) * full)
      }
    }
    for (let a = 0; a < nu - 1; a++) {
      for (let b = 0; b < nv - 1; b++) {
        const v = vertices + a * nv + b
        index.push(v, v + nv, v + 1, v + nv, v + nv + 1, v + 1)
      }
    }
    vertices += nu * nv
    tubes += RINGS * (SIDES + 1)
    leaves.push(leaf)
  }

  const dynamic = (array: Float32Array, size: number) => new THREE.BufferAttribute(array, size).setUsage(THREE.DynamicDrawUsage)
  const geometry = partGeometry(options)
  const slots = [new Float32Array(vertices * 3), new Float32Array(vertices * 3)]
  const normals = new Float32Array(vertices * 3)
  const position = dynamic(slots[0], 3)
  const positionB = options.places ? null : dynamic(slots[1], 3)
  const normal = dynamic(normals, 3)
  geometry.setAttribute('position', position)
  if (positionB) geometry.setAttribute('positionB', positionB)
  geometry.setAttribute('normal', normal)
  geometry.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uvList), 2))
  geometry.setAttribute('aLeaf', new THREE.BufferAttribute(new Float32Array(leafList), 4))
  if (!options.places) {
    geometry.setAttribute('aMark', new THREE.BufferAttribute(new Float32Array(markList), 4))
    geometry.setAttribute('aPlane', new THREE.BufferAttribute(new Float32Array(planeList), 2))
  }
  geometry.setIndex(index)
  const state = new Float32Array(LEAVES * 4)
  const ripeness = new Float32Array(LEAVES)
  const uniforms = {
    uLeafState: { value: state },
    uLeafRipe: { value: ripeness },
    uVeins: { value: null as THREE.Texture | null },
    uDetail: { value: null as THREE.Texture | null },
    uMarks: { value: null as THREE.Texture | null },
    uDetailSize: { value: new THREE.Vector2(1, 1) },
    uVeinPad: { value: VEIN_PAD },
    // The neighbor's blades stand between the lens and the sun, where the approved frames keep them a deep green.
    uGlow: { value: options.variant === 0 ? 1 : 0.1 },
    uWarm: { value: options.variant === 0 ? 0 : 0.7 },
  }
  const surface = makePartSurface(options, { name: 'leaves', vertex: bladeVertex, fragment: bladeFragment, side: THREE.DoubleSide, uniforms, depthFragment: options.places ? undefined : bladeDepth })
  const mesh = partMesh(geometry, surface)

  const tubeSlots = hero ? [new Float32Array(tubes * 3), new Float32Array(tubes * 3)] : null
  const tubeNormals = hero ? new Float32Array(tubes * 3) : null
  const tubeUv = hero ? new Float32Array(tubes * 2) : null
  let tubeMesh: THREE.Mesh | null = null
  let tubeSurface: ReturnType<typeof makePartSurface> | null = null
  let tubeAttributes: THREE.BufferAttribute[] = []
  if (tubeSlots && tubeNormals && tubeUv) {
    const g = new THREE.BufferGeometry()
    const tubeIndex: number[] = []
    for (const leaf of leaves) {
      for (let ring = 0; ring < RINGS - 1; ring++) {
        for (let j = 0; j < SIDES; j++) {
          const v = leaf.tube + ring * (SIDES + 1) + j
          tubeIndex.push(v, v + SIDES + 1, v + 1, v + 1, v + SIDES + 1, v + SIDES + 2)
        }
      }
    }
    tubeAttributes = [dynamic(tubeSlots[0], 3), dynamic(tubeSlots[1], 3), dynamic(tubeNormals, 3), dynamic(tubeUv, 2)]
    g.setAttribute('position', tubeAttributes[0])
    g.setAttribute('positionB', tubeAttributes[1])
    g.setAttribute('normal', tubeAttributes[2])
    g.setAttribute('uv', tubeAttributes[3])
    g.setIndex(tubeIndex)
    tubeSurface = makePartSurface(options, { name: 'leaf stalks', vertex: stalkVertex, fragment: stalkFragment })
    tubeMesh = partMesh(g, tubeSurface)
  }

  const hairCount = options.variant === 0 ? shape.hairs : Math.round(shape.hairs / 4)
  const hairs: HairSet | null = hero ? createHairs(options, hairCount, 'leaf hairs', undefined, 0.00003) : null
  const plan: Hair[] = []
  // One crystal of hoarfrost for each hair of the margin and of the upper face.
  const crystals = hero ? createCrystals(options, hairCount, 'leaf crystals') : null
  // The hairs lie in the order of the leaves and each leaf has its share by its area, so the hairs of the leaves not yet born are simply not drawn.
  const hairsUpTo: number[] = []
  let hairsShown = 0
  if (hairs) {
    const area = (leaf: Leaf) => fullLength[leaf.i] * fullLength[leaf.i] * shares[leaf.i]
    let sum = 0
    for (const leaf of leaves) sum += area(leaf)
    let leafAt = 0
    let reached = area(leaves[0])
    for (let h = 0; h < hairs.count; h++) {
      while (leafAt < leaves.length - 1 && (h / hairs.count) * sum > reached) {
        hairsUpTo[leafAt] = h
        reached += area(leaves[++leafAt])
      }
      const leaf = leaves[leafAt]
      const r = (k: number) => hash01(seed, 5000 + h, k)
      const pick = r(0)
      const hair: Hair = { leaf: leafAt, kind: 0, a: 0, b: 0, r1: r(1), r2: r(2), r3: r(3), r4: r(4) }
      if (pick < 0.38) {
        hair.kind = 0
        hair.a = Math.pow(r(5), 0.9) * (leaf.nu - 1.001)
        hair.b = r(6) < 0.5 ? 1 : leaf.nv - 2
      } else if (pick < 0.6) {
        // Hairs of the face: half of them crowd the midrib, where the skin is coarsest.
        hair.kind = 1
        hair.a = Math.pow(r(5), 0.9) * (leaf.nu - 1.001)
        const mid = (leaf.nv - 1) / 2
        hair.b = r(7) < 0.5 ? mid + (r(6) - 0.5) * 1.2 : 1 + r(6) * (leaf.nv - 3.001)
      } else {
        hair.kind = 2
        hair.a = 1 + Math.pow(r(5), 1.2) * (RINGS_STALK + 2)
        hair.b = r(6) * SIDES * 0.9999
      }
      plan.push(hair)
    }
    for (let k = leafAt; k < leaves.length; k++) hairsUpTo[k] = hairs.count
  }

  const beads: BeadSet | null = hero ? createBeads(options, options.variant === 0 ? 280 : 90, 'leaf beads') : null
  const beadPlan: { leaf: number; own: number; along: number; across: number }[] = []
  const bead: Bead = { along: 0, across: 0, radiusM: 0, hang: 0, fallM: 0 }
  if (beads) {
    const tint = beads.tint()
    for (let k = 0; k < beads.count; k++) {
      const r = (c: number) => hash01(seed, 9000 + k, c)
      // Water gathers along the pressed midrib and in the troughs between the side veins; the first leaves carry most of it in the rain.
      const side = r(3) < 0.5 ? -1 : 1
      const across = r(4) < 0.4 ? side * 0.1 * r(5) : side * (0.12 + 0.76 * r(5))
      beadPlan.push({ leaf: Math.floor(Math.pow(r(0), 1.6) * leaves.length), own: r(1), along: 0.1 + 0.84 * r(2), across })
      tint.set([0.05, 0.1, 0.026], k * 3)
    }
  }

  const fillBeads = (slot: 0 | 1, pose: Pose): void => {
    if (!beads) return
    const seat = beads.seat(slot)
    const rest = beads.rest(slot)
    const out = slots[slot]
    for (let k = 0; k < beads.count; k++) {
      const spot = beadPlan[k]
      const leaf = leaves[spot.leaf]
      const o = k * 4
      seat[o + 3] = 0
      const size = leafLength(leaf.i, pose.time)
      // A blade still folded holds no water on its face.
      if (size <= 0 || leafFold(leaf.i, pose.time) > 0.25) continue
      beadAt(spot.own, spot.along, spot.across, pose.time, bead)
      if (bead.radiusM <= 0) continue
      const b0 = leaf.hem ? 1 : 0
      const b1 = leaf.hem ? leaf.nv - 2 : leaf.nv - 1
      const fa = clamp(bead.along, 0, 1) * (leaf.nu - 1.001)
      const fb = b0 + (0.5 + 0.5 * clamp(bead.across, -1, 1)) * (b1 - b0 - 0.001)
      const a = Math.floor(fa)
      const b = Math.floor(fb)
      const ta = fa - a
      const tb = fb - b
      const v00 = (leaf.base + a * leaf.nv + b) * 3
      const v10 = v00 + leaf.nv * 3
      for (let c = 0; c < 3; c++) {
        const low = out[v00 + c] + (out[v00 + 3 + c] - out[v00 + c]) * tb
        const high = out[v10 + c] + (out[v10 + 3 + c] - out[v10 + c]) * tb
        seat[o + c] = low + (high - low) * ta
      }
      const up = normals[v00 + 1] < 0 ? -1 : 1
      rest[o] = normals[v00] * up
      rest[o + 1] = normals[v00 + 1] * up
      rest[o + 2] = normals[v00 + 2] * up
      rest[o + 3] = bead.hang
      seat[o + 1] -= bead.fallM
      seat[o + 3] = seat[o + 1] > 0 ? bead.radiusM * 0.65 * clamp(size / 0.07, 0.3, 1) : 0
    }
  }

  const hits: Drop[] = []
  // Each plant stands in its own patch of the rain.
  const rainX = 1.7 * options.variant
  const rainZ = 2.3 * options.variant

  // How far a blade is knocked down by the drops that landed on it, in radians: each one dips it and it springs back.
  const dipAt = (time: number, x: number, y: number, z: number, reach: number): number => {
    let since = time
    for (const s of config.segments) if (s.start <= time) since = time - s.start
    const run = Math.max(0, y) / fallDir[1]
    hits.length = 0
    landingsNear(x + rainX - fallDir[0] * run, z + rainZ - fallDir[2] * run, reach, time - 0.9, time + 0.6, hits)
    let dip = 0
    for (const drop of hits) {
      const ago = time - (drop.time + run / drop.speed)
      // What reacts to the weather reacts after the cut.
      if (ago <= 0 || ago > 0.9 || ago > since) continue
      dip += 0.2 * Math.pow(drop.radius / 0.0022, 1.5) * Math.exp(-ago / 0.16) * Math.sin(26 * ago)
    }
    return dip
  }

  const fillLeaf = (leaf: Leaf, slot: 0 | 1, pose: Pose): void => {
    const i = leaf.i
    const time = pose.time
    const wind = pose.inputs.wind
    const size = leafLength(i, time)
    const f = leafFrameAt(pose, i)
    frame.ox = f.ox; frame.oy = f.oy; frame.oz = f.oz
    frame.mx = f.mx; frame.my = f.my; frame.mz = f.mz
    frame.wx = f.wx; frame.wy = f.wy; frame.wz = f.wz
    frame.nx = f.nx; frame.ny = f.ny; frame.nz = f.nz
    const out = slots[slot]
    const total = size * REACH * leaf.reach
    const stalk = leaf.stalk
    const blade = total * (1 - stalk)
    const age = Math.max(0, leafAge(i, time))
    // Before the bloom a young leaf is held up and out: its stalk stands and its blade does not yet hang.
    const early = 1 - smoothstep(33, 40, time)
    const droop = leafDroop(i, pose.inputs, time) * lerp(1, 0.7 + 0.3 * smoothstep(3, 14, age), early)
    // A leaf born under the bud grows out past it, never up through it.
    let ceiling = 1.6
    const guard = 1 - smoothstep(37, 40, time)
    const bud = bodyRadius(time)
    if (guard > 0 && bud > 0) {
      const u = leafStemFraction(i, time)
      const up = (1 - u) * heightAt(time) + bodyHalfDepth(time)
      const off = stemRadius(time, u)
      const steep = leafElevation(i, time, pose.inputs)
      const reach = smoothstep(0.5, 1, total / Math.max(up - bud, 1e-4))
      const clear = Math.asin(Math.min(1, (bud + 0.7 * bractLength(2, time) + 0.004) / Math.hypot(up, off))) - Math.atan2(off, up)
      ceiling = lerp(1.6, 1.5708 - clear, guard * reach)
      const lower = Math.max(0, steep - ceiling)
      if (lower > 0) {
        const c = Math.cos(lower)
        const k = Math.sin(lower)
        const mx = frame.mx * c - frame.nx * k
        const my = frame.my * c - frame.ny * k
        const mz = frame.mz * c - frame.nz * k
        frame.nx = frame.nx * c + frame.mx * k
        frame.ny = frame.ny * c + frame.my * k
        frame.nz = frame.nz * c + frame.mz * k
        frame.mx = mx; frame.my = my; frame.mz = mz
      }
    }
    const fold = leafFold(i, time)
    const grown = smoothstep(2, 12, age)
    // A young blade is smooth: the creases set in as it ages.
    const creased = smoothstep(3, 16, age)
    const set = lerp(grown, smoothstep(0.5, 4, age), early)
    // A blade opens as a smooth narrow oval and widens into a toothed heart. From the bloom on every blade is grown.
    const ripe = Math.max(smoothstep(5, 12, age), smoothstep(33, 40, time))
    // A blade that points away shows its underside instead, so it turns the other way.
    const toward = clamp(1 + 2 * (frame.mx * Math.sin(OPEN_SIDE) + frame.mz * Math.cos(OPEN_SIDE)), -1, 1)
    // The hanging leaf under the head keeps its edge to the lens.
    const facing = main ? (i === witheredLeaf ? 1.25 * grown : -FACING * set * toward * (frame.wx * Math.sin(OPEN_SIDE) + frame.wz * Math.cos(OPEN_SIDE))) : 0
    const held = main ? 0 : leafRoll(i, time)
    // The stalk stands up from the stem at about 45 degrees and arches over before the blade begins.
    const rise = set * clamp(Math.min(leaf.rise, ceiling) - Math.asin(clamp(frame.my, -1, 1)), 0, 1.1)
    const raining = hero && size > 0.02 && stateUniforms.uPlantWet.value > 0
    const mid = 0.62 * total
    const dip = raining ? dipAt(time, frame.ox + frame.mx * mid, frame.oy + frame.my * mid, frame.oz + frame.mz * mid, 0.3 * blade) : 0
    // Under the heaviest bursts every leaf is pressed down a little.
    const press = raining ? 0.07 * smoothstep(0.82, 1, rainStrength(time - 0.12)) * smoothstep(0, 1.5, time - config.segments.reduce((start, s) => (s.start <= time ? s.start : start), 0)) : 0
    const rock = wind * (0.04 * gust(time, frame.ox, frame.oz) + 0.025 * flutter(time, leaf.seed))
    const trail = wind * 0.08 * flutter(time - 0.18, leaf.seed * 0.73 + 0.11)
    const sway = wind * 0.075 * flutter(time - 0.07, leaf.seed * 0.41 + 0.37)

    const lay = (hang: number): number => {
      let x = 0
      let z = 0
      let low = 0
      for (let k = 0; k <= PATH; k++) {
        const share = k / PATH
        const bladeShare = Math.max(0, (share - stalk) / (1 - stalk))
        const tipward = smoothstep(0.68, 1, share)
        const a = rise * (1 - smoothstep(0.2 * stalk, 1.15 * stalk, share)) + leaf.bow * Math.sin(6.2832 * Math.min(1, share / stalk)) + Math.atan(-2 * droop * (total > 0 ? x / total : 0)) - hang * grown * (leaf.kink * smoothstep(stalk * 0.8, stalk + 0.14, share) + leaf.tipCurl * tipward * tipward) + rock + trail * bladeShare * bladeShare - (raining ? press * smoothstep(0, stalk, share) + dip * smoothstep(0.3 * stalk, stalk + 0.3, share) : 0)
        pathX[k] = x
        pathZ[k] = z
        pathA[k] = a
        low = Math.min(low, frame.my * x + frame.ny * z)
        x += (Math.cos(a) * total) / PATH
        z += (Math.sin(a) * total) / PATH
      }
      return low
    }
    // A low leaf hangs only as far as the ground lets it, and lifts off it if it must.
    const room = frame.oy - 0.012 - 0.16 * size
    const most = -lay(1)
    if (most > room) {
      const least = -lay(0)
      lay(clamp((room - least) / Math.max(most - least, 1e-6), -2, 1))
    }

    const crease = main ? fold + leaf.crease * grown * (1 - 0.6 * early) : (fold + leaf.crease * grown) * leafFoldScale(i, time)
    const cf = Math.cos(crease)
    const sf = Math.sin(crease)
    const { nu, nv } = leaf
    for (let a = 0; a < nu; a++) {
      const s = Math.max(0, leaf.sig[a])
      const share = leaf.sig[a] < 0 ? 0 : stalk + (1 - stalk) * s
      sample(share)
      const ca = Math.cos(at.a)
      const sa = Math.sin(at.a)
      const free = leaf.twist * s * grown + facing * smoothstep(0, 0.3, s) + sway * (0.3 + 0.7 * s)
      const turn = held === 0 ? free : free + held
      const ct = Math.cos(turn)
      const st = Math.sin(turn)
      const cx = frame.ox + frame.mx * at.x + frame.nx * at.z
      const cy = frame.oy + frame.my * at.x + frame.ny * at.z
      const cz = frame.oz + frame.mz * at.x + frame.nz * at.z
      const tx = frame.mx * ca + frame.nx * sa
      const ty = frame.my * ca + frame.ny * sa
      const tz = frame.mz * ca + frame.nz * sa
      const ux = frame.nx * ca - frame.mx * sa
      const uy = frame.ny * ca - frame.my * sa
      const uz = frame.nz * ca - frame.mz * sa
      const wx = frame.wx * ct + ux * st
      const wy = frame.wy * ct + uy * st
      const wz = frame.wz * ct + uz * st
      const nx = ux * ct - frame.wx * st
      const ny = uy * ct - frame.wy * st
      const nz = uz * ct - frame.wz * st
      for (let b = 0; b < nv; b++) {
        const v = a * nv + b
        const px = ripe >= 1 ? leaf.px[v] : leaf.qx[v] + (leaf.px[v] - leaf.qx[v]) * ripe
        const pz = ripe >= 1 ? leaf.pz[v] : leaf.qz[v] + (leaf.pz[v] - leaf.qz[v]) * ripe
        const across = px * cf * blade
        const up = (Math.abs(px) * sf + pz + leaf.pc[v] * creased) * blade
        const along = (ripe >= 1 ? leaf.py[v] : leaf.qy[v] + (leaf.py[v] - leaf.qy[v]) * ripe) * blade
        const o = (leaf.base + v) * 3
        out[o] = cx + tx * along + wx * across + nx * up
        out[o + 1] = cy + ty * along + wy * across + ny * up
        out[o + 2] = cz + tz * along + wz * across + nz * up
      }
    }

    if (slot === 0) {
      bladeNormals(out, normals, leaf)
      state[i * 4] = size
      state[i * 4 + 1] = leaf.yellows * smoothstep(20, 44, age)
      state[i * 4 + 2] = smoothstep(0.35, 1.3, fold)
      state[i * 4 + 3] = smoothstep(5, 24, age)
      ripeness[i] = ripe
    }

    if (!tubeSlots || !tubeNormals || !tubeUv) return
    const tube = tubeSlots[slot]
    const stem = stemRadius(time, leafStemFraction(i, time))
    // On the young plant a stalk is nearly as stout as the stem it leaves.
    const thick = Math.min((0.5 + 0.16 * early) * stem, 0.036 * size * REACH)
    for (let ring = 0; ring < RINGS; ring++) {
      const onBlade = ring >= RINGS_STALK
      const k = onBlade ? 0 : ring / (RINGS_STALK - 1)
      const s = onBlade ? (RIB_END * (ring - RINGS_STALK + 1)) / RINGS_RIB : 0
      const share = onBlade ? stalk + (1 - stalk) * s : stalk * k
      sample(share)
      const ca = Math.cos(at.a)
      const sa = Math.sin(at.a)
      const free = leaf.twist * s * grown + facing * smoothstep(0, 0.3, s) + sway * (0.3 + 0.7 * s)
      const turn = held === 0 ? free : free + held
      const ct = Math.cos(turn)
      const st = Math.sin(turn)
      const tx = frame.mx * ca + frame.nx * sa
      const ty = frame.my * ca + frame.ny * sa
      const tz = frame.mz * ca + frame.nz * sa
      const ux = frame.nx * ca - frame.mx * sa
      const uy = frame.ny * ca - frame.my * sa
      const uz = frame.nz * ca - frame.mz * sa
      const wx = frame.wx * ct + ux * st
      const wy = frame.wy * ct + uy * st
      const wz = frame.wz * ct + uz * st
      const nx = ux * ct - frame.wx * st
      const ny = uy * ct - frame.wy * st
      const nz = uz * ct - frame.wz * st
      const clasp = Math.max(0.58 * stem - thick, 0.3 * thick) * clamp(size / 0.06) * Math.exp(-(share * total) / Math.max(0.9 * stem, 1e-5))
      const radius = onBlade ? thick * 0.58 * Math.pow(Math.max(0, 1 - s / (RIB_END + 0.02)), 0.75) : thick * (1 - (0.5 - 0.2 * early) * k) + clasp
      const under = onBlade ? smoothstep(0, 0.06, s) : 0
      const drop = under * (TROUGH * (1 - 0.7 * s) * blade + 0.55 * radius)
      // The first ring sits on the stem's axis, so the wide foot of the stalk comes out through the skin and no open end shows.
      const back = ring === 0 ? Math.min((0.7 * stem) / Math.max(0.4, Math.hypot(tx, tz)), 0.5 * stalk * total) : 0
      const cx = frame.ox + frame.mx * at.x + frame.nx * at.z - tx * back - nx * drop
      const cy = frame.oy + frame.my * at.x + frame.ny * at.z - ty * back - ny * drop
      const cz = frame.oz + frame.mz * at.x + frame.nz * at.z - tz * back - nz * drop
      for (let j = 0; j <= SIDES; j++) {
        const theta = (j / SIDES) * Math.PI * 2
        const c = Math.cos(theta)
        const e = Math.sin(theta)
        const top = e > 0 ? lerp(0.85 * e - 0.32 * e * e * e * e, 0.2 * e, under) : e
        const o = (leaf.tube + ring * (SIDES + 1) + j) * 3
        tube[o] = cx + (wx * c + nx * top) * radius
        tube[o + 1] = cy + (wy * c + ny * top) * radius
        tube[o + 2] = cz + (wz * c + nz * top) * radius
        if (slot === 0) {
          const lift = e > 0 ? 0.6 * e : e
          const l = Math.hypot(c, lift) || 1
          tubeNormals[o] = (wx * c + nx * lift) / l
          tubeNormals[o + 1] = (wy * c + ny * lift) / l
          tubeNormals[o + 2] = (wz * c + nz * lift) / l
          const t = (leaf.tube + ring * (SIDES + 1) + j) * 2
          tubeUv[t] = j / SIDES
          // Below zero on the midrib under the blade, which carries less down than the stalk.
          tubeUv[t + 1] = onBlade ? -share * total : share * total
        }
      }
    }
  }

  const fillHairs = (slot: 0 | 1, pose: Pose): void => {
    if (!hairs || !tubeSlots) return
    const root = hairs.root(slot)
    const lean = hairs.lean(slot)
    const out = slots[slot]
    const tube = tubeSlots[slot]
    let born = 0
    while (born < leaves.length && leafLength(leaves[born].i, pose.time) > 0) born++
    const count = born > 0 ? hairsUpTo[born - 1] : 0
    if (slot === 0) hairsShown = count
    const frosted = stateUniforms.uPlantFrost.value > 0
    for (let h = 0; h < count; h++) {
      const hair = plan[h]
      const leaf = leaves[hair.leaf]
      const size = leafLength(leaf.i, pose.time)
      const scale = size <= 0 ? 0 : clamp(size / 0.07, 0.12, 1)
      const o = h * 4
      let px = 0, py = 0, pz = 0, dx = 0, dy = 1, dz = 0, long = 0
      let ox = 0, oy = 0, oz = 0, ux = 0, uy = 1, uz = 0
      if (hair.kind === 2) {
        const ring = Math.min(RINGS - 2, Math.floor(hair.a))
        const t = hair.a - ring
        const side = Math.floor(hair.b)
        const round = hair.b - side
        const v0 = (leaf.tube + ring * (SIDES + 1) + side) * 3
        const v1 = v0 + (SIDES + 1) * 3
        const far = (leaf.tube + ring * (SIDES + 1) + ((side + SIDES / 2) % SIDES)) * 3
        const at = (v: number, c: number) => tube[v + c] + (tube[v + 3 + c] - tube[v + c]) * round
        px = at(v0, 0) + (at(v1, 0) - at(v0, 0)) * t
        py = at(v0, 1) + (at(v1, 1) - at(v0, 1)) * t
        pz = at(v0, 2) + (at(v1, 2) - at(v0, 2)) * t
        dx = at(v0, 0) - at(far, 0)
        dy = at(v0, 1) - at(far, 1)
        dz = at(v0, 2) - at(far, 2)
        const l = Math.hypot(dx, dy, dz) || 1
        const tl = Math.hypot(tube[v1] - tube[v0], tube[v1 + 1] - tube[v0 + 1], tube[v1 + 2] - tube[v0 + 2]) || 1
        const along = (hair.r2 - 0.3) * 1.3
        dx = dx / l + ((tube[v1] - tube[v0]) / tl) * along
        dy = dy / l + ((tube[v1 + 1] - tube[v0 + 1]) / tl) * along
        dz = dz / l + ((tube[v1 + 2] - tube[v0 + 2]) / tl) * along
        long = (0.002 + 0.002 * hair.r1) * scale
      } else {
        const a = Math.floor(hair.a)
        const t = hair.a - a
        const b = Math.floor(hair.b)
        const tb = hair.b - b
        const v00 = (leaf.base + a * leaf.nv + b) * 3
        const v10 = v00 + leaf.nv * 3
        const more = tb > 0 ? 3 : 0
        for (let c = 0; c < 3; c++) {
          const low = out[v00 + c] + (out[v00 + more + c] - out[v00 + c]) * tb
          const high = out[v10 + c] + (out[v10 + more + c] - out[v10 + c]) * tb
          const p = low + (high - low) * t
          if (c === 0) px = p
          else if (c === 1) py = p
          else pz = p
        }
        const nx = normals[v00]
        const ny = normals[v00 + 1]
        const nz = normals[v00 + 2]
        if (hair.kind === 1) {
          const side = hair.r2 < 0.5 ? -1 : 1
          const lx = out[v10] - out[v00]
          const ly = out[v10 + 1] - out[v00 + 1]
          const lz = out[v10 + 2] - out[v00 + 2]
          const ll = Math.hypot(lx, ly, lz) || 1
          const ahead = 1.4 * (hair.r3 - 0.3)
          dx = nx * side + (lx / ll) * ahead
          dy = ny * side + (ly / ll) * ahead
          dz = nz * side + (lz / ll) * ahead
          ux = nx; uy = ny; uz = nz
          long = (0.0005 + 0.0011 * hair.r1) * scale
        } else {
          const inner = v00 + (b === 1 ? 3 : -3)
          let ex = out[v00] - out[inner]
          let ey = out[v00 + 1] - out[inner + 1]
          let ez = out[v00 + 2] - out[inner + 2]
          const el = Math.hypot(ex, ey, ez) || 1
          ex /= el; ey /= el; ez /= el
          let fx = out[v10] - out[v00]
          let fy = out[v10 + 1] - out[v00 + 1]
          let fz = out[v10 + 2] - out[v00 + 2]
          const fl = Math.hypot(fx, fy, fz) || 1
          fx /= fl; fy /= fl; fz /= fl
          const tilt = (hair.r2 - 0.5) * 1.5
          const ahead = -0.3 + 1.3 * hair.r3
          dx = ex + nx * tilt + fx * ahead
          dy = ey + ny * tilt + fy * ahead
          dz = ez + nz * tilt + fz * ahead
          ox = ex; oy = ey; oz = ez; ux = nx; uy = ny; uz = nz
          long = (0.0006 + 0.0028 * hair.r1 * hair.r1) * scale
        }
      }
      root[o] = px
      root[o + 1] = py
      root[o + 2] = pz
      root[o + 3] = long
      lean[o] = dx
      lean[o + 1] = dy
      lean[o + 2] = dz
      lean[o + 3] = hair.r4
      if (crystals && frosted) {
        const cr = crystals.root(slot)
        const cl = crystals.lean(slot)
        if (hair.kind === 0) {
          // Nearly half stand a little inside the margin on either face, so the fringe has the leaf behind it and reads against the fog.
          const inside = hair.r2 < 0.45 ? hair.r3 * 0.0016 * scale : 0
          const stand = inside > 0 ? (hair.r1 < 0.5 ? 1 : -1) : 0
          cr[o] = px - ox * inside
          cr[o + 1] = py - oy * inside
          cr[o + 2] = pz - oz * inside
          cr[o + 3] = (0.0015 + 0.0015 * hair.r1) * scale * (inside > 0 ? 0.6 : 1)
          cl[o] = dx + ux * stand
          cl[o + 1] = dy + uy * stand
          cl[o + 2] = dz + uz * stand
        } else {
          // Grains on the upper face, and none on the stalk.
          const up = uy < 0 ? -1 : 1
          cr[o] = px
          cr[o + 1] = py
          cr[o + 2] = pz
          cr[o + 3] = hair.kind === 1 && hair.r4 < 0.6 ? (0.0006 + 0.0008 * hair.r1) * scale : 0
          cl[o] = ux * up
          cl[o + 1] = uy * up
          cl[o + 2] = uz * up
        }
        cl[o + 3] = hair.r3
      }
    }
  }

  const meshes = [mesh]
  const casters = [{ mesh, surface }]
  if (tubeMesh && tubeSurface) {
    meshes.push(tubeMesh)
    casters.push({ mesh: tubeMesh, surface: tubeSurface })
  }
  if (hairs) meshes.push(...hairs.meshes)
  if (beads) meshes.push(...beads.meshes)
  if (crystals) meshes.push(...crystals.meshes)

  return {
    name: 'leaves',
    meshes,
    casters,
    async load(assets: Assets) {
      if (options.places) return
      const maps = await leafMaps(assets)
      uniforms.uVeins.value = maps.veins
      uniforms.uDetail.value = maps.detail
      uniforms.uMarks.value = maps.marks
      uniforms.uDetailSize.value.copy(maps.detailSize)
    },
    fill(slot, pose) {
      if (slot === 1 && !positionB) return
      // Before the bloom the approved blades stay a deep green against the light.
      if (slot === 0) uniforms.uGlow.value = (options.variant === 0 ? 1 : 0.1) * lerp(0.35, 1, smoothstep(36, 40, pose.time))
      for (const leaf of leaves) fillLeaf(leaf, slot, pose)
      fillHairs(slot, pose)
      fillBeads(slot, pose)
    },
    finish() {
      position.needsUpdate = true
      if (positionB) positionB.needsUpdate = true
      normal.needsUpdate = true
      for (const a of tubeAttributes) a.needsUpdate = true
      hairs?.finish(hairsShown)
      beads?.finish()
      crystals?.finish(stateUniforms.uPlantFrost.value > 0 ? hairsShown : 0)
    },
  }
}

// The normals of a blade from its own grid. The hem takes the normal of the edge it hangs from, turned outward.
function bladeNormals(pos: Float32Array, nor: Float32Array, leaf: Leaf): void {
  const { nu, nv, base } = leaf
  const b0 = leaf.hem ? 1 : 0
  const b1 = leaf.hem ? nv - 2 : nv - 1
  for (let a = 0; a < nu; a++) {
    const aLow = Math.max(0, a - 1)
    const aHigh = Math.min(nu - 1, a + 1)
    for (let b = b0; b <= b1; b++) {
      const bLow = Math.max(b0, b - 1)
      const bHigh = Math.min(b1, b + 1)
      const pa0 = (base + aLow * nv + b) * 3
      const pa1 = (base + aHigh * nv + b) * 3
      const pb0 = (base + a * nv + bLow) * 3
      const pb1 = (base + a * nv + bHigh) * 3
      const ux = pos[pa1] - pos[pa0]
      const uy = pos[pa1 + 1] - pos[pa0 + 1]
      const uz = pos[pa1 + 2] - pos[pa0 + 2]
      const vx = pos[pb1] - pos[pb0]
      const vy = pos[pb1 + 1] - pos[pb0 + 1]
      const vz = pos[pb1 + 2] - pos[pb0 + 2]
      let x = uy * vz - uz * vy
      let y = uz * vx - ux * vz
      let z = ux * vy - uy * vx
      const l = Math.hypot(x, y, z)
      if (l > 1e-16) {
        x /= l
        y /= l
        z /= l
      } else {
        x = 0
        y = 1
        z = 0
      }
      const v = (base + a * nv + b) * 3
      nor[v] = x
      nor[v + 1] = y
      nor[v + 2] = z
    }
    if (!leaf.hem) continue
    for (const [hem, edge, inner] of [[0, 1, 2], [nv - 1, nv - 2, nv - 3]]) {
      const h = (base + a * nv + hem) * 3
      const e = (base + a * nv + edge) * 3
      const n = (base + a * nv + inner) * 3
      let ox = pos[e] - pos[n]
      let oy = pos[e + 1] - pos[n + 1]
      let oz = pos[e + 2] - pos[n + 2]
      const ol = Math.hypot(ox, oy, oz) || 1
      ox /= ol
      oy /= ol
      oz /= ol
      let x = nor[e] * 0.3 + ox
      let y = nor[e + 1] * 0.3 + oy
      let z = nor[e + 2] * 0.3 + oz
      const l = Math.hypot(x, y, z) || 1
      x /= l
      y /= l
      z /= l
      nor[h] = x
      nor[h + 1] = y
      nor[h + 2] = z
    }
  }
}
