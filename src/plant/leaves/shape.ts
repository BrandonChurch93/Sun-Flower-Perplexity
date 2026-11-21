// The flat shape of a sunflower leaf: its outline, its teeth and where its veins run.
// Everything here is in the leaf's own two numbers: s along the midrib (0 at the stalk, 1 at the tip) and w across (-1 and 1 at the two edges).
import { clamp, smoothstep } from '../../core/curves.ts'
import { hash01 } from '../../core/random.ts'

export const SETS = 3
// Where the widest part of the blade is, as a share of its length.
const WIDEST = 0.3
// The length of a blade over its half width, for the map, which is drawn for one average leaf.
const ASPECT = 2.45

export interface Vein { s0: number; c: number; p: number; width: number }

// The veins of one half of a blade, from the base to the tip. None crosses another: s0 + c rises from each to the next.
export function veinsOf(seed: number, set: number, side: number): Vein[] {
  const r = (k: number) => hash01(seed, 100 + set * 2 + side, k)
  const p = 1.18 + 0.1 * r(0)
  const veins: Vein[] = [
    { s0: 0.004, c: 0.035 + 0.02 * r(1), p: p + 0.5, width: 0.7 },
    { s0: 0.008 + 0.004 * r(2), c: 0.2 + 0.05 * r(3), p: p + 0.15, width: 0.75 },
    { s0: 0.014 + 0.012 * r(4), c: 0.47 + 0.04 * r(5), p, width: 1 },
  ]
  const pairs = 5
  for (let k = 0; k < pairs; k++) {
    const at = (k + 0.5 + 0.72 * (r(10 + k) - 0.5)) / pairs
    const s0 = 0.17 + 0.71 * at
    const end = 0.585 + 0.36 * at + 0.012 * (r(20 + k) - 0.5)
    veins.push({ s0, c: end - s0, p, width: 0.78 - 0.4 * at })
  }
  return veins
}

export function veinAt(v: Vein, w: number): number {
  return v.s0 + v.c * Math.pow(w, v.p)
}

// The half width of the blade at s, as a share of its greatest half width. `cord` is how heart shaped the base is, `tip` how drawn out the tip.
export function widthAt(s: number, cord: number, tip: number): number {
  const h0 = 0.1 + 0.46 * cord
  if (s < WIDEST) return h0 + (1 - h0) * Math.pow(Math.sin((0.5 * Math.PI * s) / WIDEST), 0.75)
  const q = (s - WIDEST) / (1 - WIDEST)
  return Math.pow(Math.max(0, 1 - Math.pow(q, 1.7)), 0.9) * (1 - tip * smoothstep(0.5, 0.97, q))
}

// How far the lobes of a heart shaped base reach back past the end of the stalk, as a share of the length.
export function sweepAt(s: number, w: number, cord: number): number {
  const k = Math.max(0, 1 - s / WIDEST)
  return -0.15 * cord * k * k * Math.pow(Math.abs(w), 1.5)
}

// One tooth of the edge: it rises slowly and falls fast, so its point leans toward the tip. No two are the same size.
export function toothAt(s: number, seed: number, count: number, depth: number): number {
  const x = count * Math.pow(s, 0.85) + 3 * hash01(seed, 1) + 0.4 * Math.sin(7.3 * s + 6.28 * hash01(seed, 2))
  const id = Math.floor(x)
  const f = x - id
  const saw = f < 0.72 ? f / 0.72 : (1 - f) / 0.28
  const size = depth * (0.45 + 1.1 * hash01(seed, 3, id)) * smoothstep(0, 0.1, s) * smoothstep(1, 0.78, s)
  return size * (saw - 0.35)
}

export interface VeinField {
  // The distance to the nearest main vein, as a share of the blade's length.
  near: number
  // 1 on a main vein, falling to 0 beside it.
  main: number
  // 1 on one of the small veins that run from one side vein to the next.
  rung: number
}

const field: VeinField = { near: 1, main: 0, rung: 0 }
const MIDRIB = 0.0095
const SIDE = 0.0044

// The veins at a place on the blade.
export function veinField(veins: Vein[], w: number, s: number): VeinField {
  const a = Math.abs(w)
  const wide = Math.max(0.05, widthAt(s, 0.6, 0.3))
  const across = (a * wide) / ASPECT
  const rib = MIDRIB * (1 - 0.85 * s)
  let near = across
  let main = Math.exp(-((across / rib) ** 2))
  let below = 0
  let above = 1
  let lower = 0
  for (let k = 0; k < veins.length; k++) {
    const v = veins[k]
    const at = veinAt(v, a)
    const ds = s - at
    const slope = (v.c * v.p * Math.pow(Math.max(a, 1e-4), v.p - 1) * ASPECT) / wide
    const d = Math.abs(ds) / Math.sqrt(1 + slope * slope)
    const half = SIDE * v.width * (1 - 0.6 * a) * smoothstep(0, 0.04, a)
    if (d < near) near = d
    main = Math.max(main, Math.exp(-((d / Math.max(half, 1e-5)) ** 2)))
    if (ds >= 0 && at >= below) {
      below = at
      lower = k + 1
    }
    if (ds < 0 && at < above) above = at
  }
  const gap = Math.max(above - below, 1e-4)
  const f = (s - below) / gap
  const lines = a * 15 + 0.22 * Math.sin(f * 5 + lower * 2.1) + lower * 0.37
  const off = Math.abs(lines - Math.round(lines)) / 15 / ASPECT
  field.near = near
  field.main = clamp(main)
  field.rung = Math.exp(-((off / 0.0011) ** 2)) * smoothstep(0.02, 0.1, a) * smoothstep(0, 0.012, near)
  return field
}
