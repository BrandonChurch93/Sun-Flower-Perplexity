// The maps of a blade that are drawn from the same vein layout as its shape, so the relief in the surface and the veins in the light always agree.
import * as THREE from 'three'
import type { Assets } from '../../core/assets.ts'
import { hash01, streamSeed } from '../../core/random.ts'
import { SETS, veinField, veinsOf } from './shape.ts'

export const VEIN_SEED = streamSeed('leaf veins')
const PAD = 0.02

export interface LeafMaps { veins: THREE.Texture; marks: THREE.Texture; detail: THREE.Texture; detailSize: THREE.Vector2 }

// Red: main veins. Green: the height of the skin, grooves at the veins and pillows between them. Blue: the small veins between the side veins.
function veinPixels(width: number, height: number): Uint8Array {
  const out = new Uint8Array(SETS * width * height * 4)
  for (let set = 0; set < SETS; set++) {
    const sides = [veinsOf(VEIN_SEED, set, 0), veinsOf(VEIN_SEED, set, 1)]
    for (let y = 0; y < height; y++) {
      const s = (y + 0.5) / height
      for (let x = 0; x < width; x++) {
        const u = ((x + 0.5) / width - PAD) / (1 - 2 * PAD)
        const w = Math.max(-1, Math.min(1, u * 2 - 1))
        const f = veinField(sides[w < 0 ? 0 : 1], w, s)
        const pillow = Math.min(1, f.near / 0.022)
        const high = pillow * (2 - pillow) * 0.42 - 0.5 * f.main - 0.16 * f.rung
        const o = (y * SETS * width + set * width + x) * 4
        out[o] = Math.round(255 * f.main)
        out[o + 1] = Math.round(255 * Math.max(0, Math.min(1, 0.55 + high)))
        out[o + 2] = Math.round(255 * f.rung)
        out[o + 3] = 255
      }
    }
  }
  return out
}

function smoothNoise(seed: number, size: number, cells: number, x: number, y: number): number {
  const fx = (x / size) * cells
  const fy = (y / size) * cells
  const ix = Math.floor(fx)
  const iy = Math.floor(fy)
  const tx = fx - ix
  const ty = fy - iy
  const ux = tx * tx * (3 - 2 * tx)
  const uy = ty * ty * (3 - 2 * ty)
  const at = (i: number, j: number) => hash01(seed, ((i % cells) + cells) % cells, ((j % cells) + cells) % cells)
  return (at(ix, iy) * (1 - ux) + at(ix + 1, iy) * ux) * (1 - uy) + (at(ix, iy + 1) * (1 - ux) + at(ix + 1, iy + 1) * ux) * uy
}

// Three fields that repeat: blobs for holes and bites, slow patches for yellowing, specks for small brown marks.
function markPixels(size: number): Uint8Array {
  const out = new Uint8Array(size * size * 4)
  const seed = streamSeed('leaf marks')
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const blobs = 0.6 * smoothNoise(seed, size, 7, x, y) + 0.28 * smoothNoise(seed + 1, size, 16, x, y) + 0.12 * smoothNoise(seed + 2, size, 37, x, y)
      const patches = 0.65 * smoothNoise(seed + 3, size, 4, x, y) + 0.35 * smoothNoise(seed + 4, size, 11, x, y)
      const specks = 0.5 * smoothNoise(seed + 5, size, 48, x, y) + 0.5 * smoothNoise(seed + 6, size, 90, x, y)
      const o = (y * size + x) * 4
      out[o] = Math.round(255 * blobs)
      out[o + 1] = Math.round(255 * patches)
      out[o + 2] = Math.round(255 * specks)
      out[o + 3] = 255
    }
  }
  return out
}

const made = new WeakMap<Assets, Promise<LeafMaps>>()

export function leafMaps(assets: Assets): Promise<LeafMaps> {
  let job = made.get(assets)
  if (!job) {
    job = (async () => {
      const full = assets.set === 'full'
      const w = full ? 768 : 384
      const h = full ? 1024 : 512
      const veins = assets.data('plant/leaves/veins', 'plant/leaves', veinPixels(w, h), SETS * w, h, { color: false })
      const marks = assets.data('plant/leaves/marks', 'plant/leaves', markPixels(256), 256, 256, { color: false, repeat: true })
      const detail = await assets.texture('plant/leaves', 'blade-detail.jpg', { color: true, repeat: true, anisotropy: 4 })
      const size = detail.userData.size as { width: number; height: number }
      return { veins, marks, detail, detailSize: new THREE.Vector2(size.width, size.height) }
    })()
    made.set(assets, job)
  }
  return job
}

export const VEIN_PAD = PAD
