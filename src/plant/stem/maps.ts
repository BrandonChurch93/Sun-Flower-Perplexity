import type * as THREE from 'three'
import type { Assets } from '../../core/assets.ts'
import { combine, hash01, streamSeed } from '../../core/random.ts'
import { TOP_M, ribProfile, ribsAt, type Ribs } from './shape.ts'

export const SKIN_W = 512
export const SKIN_H = 2048
// One turn of the stem across the map, and this many meters of tissue along it.
export const SKIN_TILE_M = 0.08
export const RIB_W = 256
export const RIB_H = 512

// Value noise that repeats after `px` cells across and `py` cells along, added into `out`.
function addNoise(out: Float32Array, w: number, h: number, px: number, py: number, gain: number, seed: number): void {
  const lattice = new Float32Array(px * py)
  for (let i = 0; i < lattice.length; i++) lattice[i] = hash01(seed, i)
  const fx = new Float32Array(w)
  const x0 = new Int32Array(w)
  const x1 = new Int32Array(w)
  for (let x = 0; x < w; x++) {
    const f = (x / w) * px
    const i = Math.floor(f)
    const k = f - i
    fx[x] = k * k * (3 - 2 * k)
    x0[x] = i % px
    x1[x] = (i + 1) % px
  }
  for (let y = 0; y < h; y++) {
    const f = (y / h) * py
    const j = Math.floor(f)
    const k = f - j
    const ky = k * k * (3 - 2 * k)
    const r0 = (j % py) * px
    const r1 = ((j + 1) % py) * px
    const row = y * w
    for (let x = 0; x < w; x++) {
      const a = lattice[r0 + x0[x]] + (lattice[r0 + x1[x]] - lattice[r0 + x0[x]]) * fx[x]
      const b = lattice[r1 + x0[x]] + (lattice[r1 + x1[x]] - lattice[r1 + x0[x]]) * fx[x]
      out[row + x] += gain * (a + (b - a) * ky)
    }
  }
}

function stretch(field: Float32Array): void {
  let lo = Infinity
  let hi = -Infinity
  for (let i = 0; i < field.length; i++) {
    if (field[i] < lo) lo = field[i]
    if (field[i] > hi) hi = field[i]
  }
  const k = 1 / Math.max(hi - lo, 1e-9)
  for (let i = 0; i < field.length; i++) field[i] = (field[i] - lo) * k
}

// The skin of the stem, built once: fine relief (r), lengthwise tone (g), flecks and short streaks (b), blotches and the pale feet of hairs (a).
// It carries no light and no color of its own: the shader gives each channel its meaning.
function skinPixels(): Uint8Array {
  const w = SKIN_W
  const h = SKIN_H
  const n = w * h
  const seed = streamSeed('stem skin')
  const relief = new Float32Array(n)
  addNoise(relief, w, h, 128, 20, 0.5, combine(seed, 1))
  addNoise(relief, w, h, 256, 48, 0.3, combine(seed, 2))
  addNoise(relief, w, h, 48, 10, 0.4, combine(seed, 3))
  const tone = new Float32Array(n)
  addNoise(tone, w, h, 14, 5, 0.42, combine(seed, 4))
  addNoise(tone, w, h, 40, 9, 0.3, combine(seed, 5))
  addNoise(tone, w, h, 112, 22, 0.18, combine(seed, 6))
  addNoise(tone, w, h, 256, 96, 0.1, combine(seed, 7))
  const fleck = new Float32Array(n)
  addNoise(fleck, w, h, 56, 44, 0.75, combine(seed, 8))
  addNoise(fleck, w, h, 128, 96, 0.25, combine(seed, 9))
  const streak = new Float32Array(n)
  addNoise(streak, w, h, 96, 9, 0.8, combine(seed, 10))
  addNoise(streak, w, h, 200, 30, 0.2, combine(seed, 11))
  const blotch = new Float32Array(n)
  addNoise(blotch, w, h, 24, 14, 0.6, combine(seed, 12))
  addNoise(blotch, w, h, 72, 40, 0.4, combine(seed, 13))
  stretch(relief)
  stretch(tone)
  stretch(fleck)
  stretch(streak)
  stretch(blotch)
  const dots = new Float32Array(n)
  const spots = 2600
  for (let d = 0; d < spots; d++) {
    const cx = hash01(seed, 20, d) * w
    const cy = hash01(seed, 21, d) * h
    const rx = 1.6 + 2.2 * hash01(seed, 22, d)
    const ry = rx * 3.2
    const top = 0.5 + 0.5 * hash01(seed, 23, d)
    for (let y = Math.floor(cy - ry); y <= cy + ry; y++) {
      for (let x = Math.floor(cx - rx); x <= cx + rx; x++) {
        const q = 1 - ((x - cx) / rx) ** 2 - ((y - cy) / ry) ** 2
        if (q <= 0) continue
        const at = ((y + h) % h) * w + ((x + w) % w)
        dots[at] = Math.max(dots[at], top * q)
      }
    }
  }
  const out = new Uint8Array(n * 4)
  for (let i = 0; i < n; i++) {
    out[i * 4] = Math.round(255 * Math.min(1, 0.72 * relief[i] + 0.28 * dots[i] + 0.1))
    out[i * 4 + 1] = Math.round(255 * tone[i])
    out[i * 4 + 2] = Math.round(255 * Math.max(fleck[i], 0.97 * streak[i]))
    out[i * 4 + 3] = Math.round(255 * Math.max(0.8 * blotch[i], dots[i]))
  }
  return out
}

// The ribs of one plant laid flat: round the stem across, from the foot to the top along.
function ribPixels(ribs: Ribs): Uint8Array {
  const out = new Uint8Array(RIB_W * RIB_H * 4)
  for (let y = 0; y < RIB_H; y++) {
    ribsAt(ribs, ((y + 0.5) / RIB_H) * TOP_M)
    for (let x = 0; x < RIB_W; x++) {
      const v = ribProfile(ribs, ((x + 0.5) / RIB_W) * Math.PI * 2)
      const at = (y * RIB_W + x) * 4
      out[at] = Math.round(255 * Math.min(1, Math.max(0, 0.34 + 0.6 * v)))
      out[at + 3] = 255
    }
  }
  return out
}

const skins = new WeakMap<Assets, THREE.Texture>()
const ribMaps = new WeakMap<Assets, Map<number, THREE.Texture>>()
const GROUP = 'plant/stem'
const SKIN_KEY = 'plant/stem/skin'

// A map made here is kept for as long as the asset set that holds it.
const held = (assets: Assets, key: string): boolean => assets.list().some((e) => e.key === key)

export function skinMap(assets: Assets): THREE.Texture {
  let map = skins.get(assets)
  if (!map || !held(assets, SKIN_KEY)) {
    map = assets.data(SKIN_KEY, GROUP, skinPixels(), SKIN_W, SKIN_H, { color: false, repeat: true, anisotropy: 4 })
    skins.set(assets, map)
  }
  return map
}

export function ribMap(assets: Assets, variant: number, ribs: Ribs): THREE.Texture {
  let all = ribMaps.get(assets)
  if (!all) {
    all = new Map()
    ribMaps.set(assets, all)
  }
  const key = `plant/stem/ribs-${variant}`
  let map = all.get(variant)
  if (!map || !held(assets, key)) {
    map = assets.data(key, GROUP, ribPixels(ribs), RIB_W, RIB_H, { color: false, repeat: true })
    all.set(variant, map)
  }
  return map
}
