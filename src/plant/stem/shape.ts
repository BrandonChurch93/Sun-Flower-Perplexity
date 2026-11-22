import { config, keyTime } from '../../config.ts'
import { clamp, smoothstep } from '../../core/curves.ts'
import { hash01 } from '../../core/random.ts'
import { heightAt, leafAge, leafCount, leafStemFraction, seedLeafFraction, stemRadius } from '../growth.ts'
import type { Pose } from '../skeleton.ts'

const TAU = Math.PI * 2
const END = config.growth.seconds

// The tissue of the stem is named by where it ends up, in meters from the foot at the last frame.
// Anchors: the foot, the middle of the stretch below the seed leaves, the seed-leaf joint, every leaf node, the top.
export const ANCHORS = leafCount + 4
export const SEED_ANCHOR = 2
export const TOP_M = heightAt(END)

// Under its seed leaves the young stem widens into the collar they stand on. It is there while the seedling is one, and nothing of it is left when the stem is a stalk.
export function collarAt(time: number): number {
  return 0.55 * smoothstep(2.2, 5, time) * (1 - smoothstep(8.5, 12.5, time))
}
export const COLLAR_M = 0.014
// The seedling's stem stands a little sturdier than the sprout it was and the stalk it becomes, by this share of the collar's swell.
export const STURDY = 0.33

// How thick the tissue with this label is at the end of the film.
export function finalRadius(label: number): number {
  return stemRadius(END, clamp(label / TOP_M))
}

let fixed: Float64Array | null = null

function labels(): Float64Array {
  if (fixed) return fixed
  const m = new Float64Array(ANCHORS)
  m[SEED_ANCHOR] = seedLeafFraction(END) * TOP_M
  for (let i = 0; i < leafCount; i++) m[3 + i] = Math.max(leafStemFraction(i, END) * TOP_M, m[2 + i] + 1e-4)
  m[ANCHORS - 1] = Math.max(TOP_M, m[ANCHORS - 2] + 1e-4)
  fixed = m
  return m
}

// The labels of the anchors that never change: the seed-leaf joint (no hair grows below it), the leaf nodes and the top.
export function fixedLabels(): Float64Array {
  return labels()
}

// Where a leaf node is on the stem as a share of its length. A node that has no leaf yet waits packed under the tip and slides into its place without a jump.
export function nodeShare(i: number, time: number): number {
  const age = leafAge(i, time)
  if (age > 0 && heightAt(time) > 0) return leafStemFraction(i, time)
  return 0.992 + 0.008 * ((i + 1) / (leafCount + 1)) * smoothstep(0, 2, -age)
}

export class Anchors {
  readonly s = new Float64Array(ANCHORS)
  readonly m = new Float64Array(ANCHORS)

  set(pose: Pose): void {
    const fixedM = labels()
    const length = pose.length
    const s = this.s
    const m = this.m
    m.set(fixedM)
    const seed = seedLeafFraction(pose.time) * length
    s[0] = 0
    // Below the seed leaves the lower half keeps its distance from the foot in meters and only the upper half stretches.
    s[1] = 0.5 * seed
    m[1] = 0.5 * Math.min(seed, fixedM[SEED_ANCHOR])
    s[SEED_ANCHOR] = seed
    let last = seed
    for (let i = 0; i < leafCount; i++) {
      last = Math.min(length, Math.max(last, nodeShare(i, pose.time) * length))
      s[3 + i] = last
    }
    s[ANCHORS - 1] = length
  }

  labelAt(at: number): number {
    const s = this.s
    const m = this.m
    if (at <= 0) return at
    if (at >= s[ANCHORS - 1]) return m[ANCHORS - 1]
    for (let k = 1; k < ANCHORS; k++) {
      if (at <= s[k] || k === ANCHORS - 1) {
        const span = s[k] - s[k - 1]
        return span > 1e-9 ? m[k - 1] + ((at - s[k - 1]) / span) * (m[k] - m[k - 1]) : m[k]
      }
    }
    return m[ANCHORS - 1]
  }

  sAt(label: number): number {
    const s = this.s
    const m = this.m
    if (label <= 0) return label
    for (let k = 1; k < ANCHORS; k++) {
      if (label <= m[k]) {
        const span = m[k] - m[k - 1]
        return span > 1e-12 ? s[k - 1] + ((label - m[k - 1]) / span) * (s[k] - s[k - 1]) : s[k]
      }
    }
    return s[ANCHORS - 1]
  }
}

export interface Ribs {
  count: number
  center: Float32Array
  half: Float32Array
  height: Float32Array
  slow: Float32Array
  fast: Float32Array
  mean: number
  now: Float32Array
  tall: Float32Array
}

// 9 to 14 uneven ribs round the stem. They wander a little along it, by the label of the tissue, so they never slide.
export function makeRibs(seed: number): Ribs {
  const count = 9 + Math.floor(hash01(seed, 70) * 6)
  const ribs: Ribs = { count, center: new Float32Array(count), half: new Float32Array(count), height: new Float32Array(count), slow: new Float32Array(count), fast: new Float32Array(count), mean: 0, now: new Float32Array(count), tall: new Float32Array(count) }
  let mean = 0
  for (let k = 0; k < count; k++) {
    ribs.center[k] = ((k + 0.15 + 0.7 * hash01(seed, 71, k)) / count) * TAU
    ribs.half[k] = (Math.PI / count) * (0.8 + 0.5 * hash01(seed, 72, k))
    ribs.height[k] = 0.45 + 0.55 * hash01(seed, 73, k)
    ribs.slow[k] = hash01(seed, 74, k) * TAU
    ribs.fast[k] = hash01(seed, 75, k) * TAU
    mean += (ribs.height[k] * ribs.half[k] * (16 / 15)) / TAU
  }
  ribs.mean = mean
  return ribs
}

export function ribsAt(ribs: Ribs, label: number): void {
  for (let k = 0; k < ribs.count; k++) {
    ribs.now[k] = ribs.center[k] + 0.11 * Math.sin(label * 6.3 + ribs.slow[k]) + 0.045 * Math.sin(label * 27 + ribs.fast[k])
    // A rib rises and dies away along the stem, each at its own places.
    const wave = 0.5 + 0.3 * Math.sin(label * 11 + 3 * ribs.fast[k]) + 0.2 * Math.sin(label * 29 + 5 * ribs.slow[k])
    ribs.tall[k] = ribs.height[k] * (0.15 + 0.85 * wave * wave)
  }
}

// The height of the ribs at an angle round the stem, about -0.5 in a furrow to 1 on a crest, after `ribsAt`.
export function ribProfile(ribs: Ribs, angle: number): number {
  let sum = 0
  for (let k = 0; k < ribs.count; k++) {
    let d = angle - ribs.now[k]
    d -= TAU * Math.round(d / TAU)
    const x = d / ribs.half[k]
    if (x > -1 && x < 1) {
      const q = 1 - x * x
      sum += ribs.tall[k] * q * q
    }
  }
  return sum - 0.45 * ribs.mean
}

export function wrapAngle(d: number): number {
  return d - TAU * Math.round(d / TAU)
}

// The young stem is never an even tube: it tapers from the foot to the hook, is a little stouter where the hook was, and swells and narrows slightly along its length. It has filled out evenly by 6 s.
const SEEDLING_KEY_S = keyTime('dawn-seedling')
export function youngGirth(time: number, u: number): number {
  const young = 1 - smoothstep(3, 6, time)
  const at = (u - 0.8) / 0.13
  const stout = 1 + 0.3 * (1 - smoothstep(4, SEEDLING_KEY_S, time))
  return stout * (1 + young * (0.1 - 0.2 * u + 0.12 * Math.exp(-at * at) + 0.045 * Math.sin(31 * u + 1.3) * Math.sin(11.7 * u + 0.4)))
}
