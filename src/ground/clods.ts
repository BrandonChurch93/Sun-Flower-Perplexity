import { hash32, streamSeed } from '../core/random.ts'

const SEED = streamSeed('ground clods')

// The clods of worked soil, as one tiling map made once at load: lumps a hand wide with smaller ones on and between them, and crumbs over all.
// Alpha is the height, red and green its slope along the map's own axes, blue how open a point lies to the sky.
export const clodTileM = 1.28
export const clodHeightM = 0.036
export const clodSlopeMost = 4
// The stem's own ground is fine crumbs: no clod stands within the first of these distances of it, and all of them from the second.
export const clodClearM = [0.045, 0.13]

interface Sizes { cells: number; share: number; stands: number; edge: number }
const SIZES: Sizes[] = [
  { cells: 13, share: 1, stands: 0.5, edge: 0.45 },
  { cells: 37, share: 0.5, stands: 0.5, edge: 0.45 },
  { cells: 113, share: 0.2, stands: 0.6, edge: 0.5 },
]

const rnd = (cell: number, cells: number, size: number, k: number): number => hash32((SEED ^ Math.imul(cell + 1, 0x9e3779b1) ^ Math.imul(cells, 0x85ebca6b) ^ Math.imul(size + 7, 0xc2b2ae35) ^ Math.imul(k + 1, 0x27d4eb2f)) >>> 0) / 4294967296

export function clodPixels(size: number): { pixels: Uint8Array; mean: number } {
  const height = new Float32Array(size * size)
  const TAU = Math.PI * 2
  SIZES.forEach((s, o) => {
    const n = s.cells
    const sx = new Float32Array(n * n)
    const sy = new Float32Array(n * n)
    const sh = new Float32Array(n * n)
    for (let c = 0; c < n * n; c++) {
      sx[c] = 0.5 + 0.8 * (rnd(c, n, o, 0) - 0.5)
      sy[c] = 0.5 + 0.8 * (rnd(c, n, o, 1) - 0.5)
      sh[c] = rnd(c, n, o, 2) < s.stands ? 0.42 + 0.58 * rnd(c, n, o, 3) : 0.1 * rnd(c, n, o, 3)
    }
    const f1 = 3 + o
    const f2 = 5 + 2 * o
    for (let y = 0; y < size; y++) {
      const v = y / size
      for (let x = 0; x < size; x++) {
        const u = x / size
        const wu = u * n + 0.22 * (Math.sin(TAU * (f1 * v + f2 * u) + 1.3 + o) + 0.6 * Math.sin(TAU * (f2 * v - f1 * 2 * u) + 4.1))
        const wv = v * n + 0.22 * (Math.sin(TAU * (f1 * u - f2 * v) + 2.9 + o) + 0.6 * Math.sin(TAU * (f2 * u + f1 * 2 * v) + 0.7))
        const cx = Math.floor(wu)
        const cy = Math.floor(wv)
        let d1 = 9
        let d2 = 9
        let own = 0
        for (let j = -1; j <= 1; j++) {
          for (let i = -1; i <= 1; i++) {
            const gx = cx + i
            const gy = cy + j
            const c = (((gy % n) + n) % n) * n + (((gx % n) + n) % n)
            const dx = gx + sx[c] - wu
            const dy = gy + sy[c] - wv
            const d = Math.sqrt(dx * dx + dy * dy)
            if (d < d1) {
              d2 = d1
              d1 = d
              own = sh[c]
            } else if (d < d2) d2 = d
          }
        }
        const t = Math.min(1, Math.max(0, (d2 - d1) / s.edge))
        const side = t * t * (3 - 2 * t)
        height[y * size + x] += s.share * own * Math.pow(side, 0.7) * (1 - 0.22 * d1 * d1)
      }
    }
  })
  let most = 0
  let sum = 0
  for (let i = 0; i < height.length; i++) most = Math.max(most, height[i])
  for (let i = 0; i < height.length; i++) {
    height[i] /= most
    sum += height[i]
  }
  const reach = Math.max(2, Math.round((0.014 / clodTileM) * size))
  const across = new Float32Array(size * size)
  const round = new Float32Array(size * size)
  const blur = (from: Float32Array, to: Float32Array, stepX: number, stepY: number): void => {
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        let total = 0
        for (let k = -reach; k <= reach; k += 2) total += from[((((y + k * stepY) % size) + size) % size) * size + ((((x + k * stepX) % size) + size) % size)]
        to[y * size + x] = total / (reach + 1)
      }
    }
  }
  blur(height, across, 1, 0)
  blur(across, round, 0, 1)
  const out = new Uint8Array(size * size * 4)
  const perTexel = (clodHeightM * size) / clodTileM / 2 / clodSlopeMost
  for (let y = 0; y < size; y++) {
    const up = ((y + 1) % size) * size
    const down = ((y - 1 + size) % size) * size
    for (let x = 0; x < size; x++) {
      const i = y * size + x
      const right = (x + 1) % size
      const left = (x - 1 + size) % size
      const gx = (height[y * size + right] - height[y * size + left]) * perTexel
      const gy = (height[up + x] - height[down + x]) * perTexel
      out[i * 4] = Math.round(255 * Math.min(1, Math.max(0, 0.5 + 0.5 * gx)))
      out[i * 4 + 1] = Math.round(255 * Math.min(1, Math.max(0, 0.5 + 0.5 * gy)))
      out[i * 4 + 2] = Math.round(255 * Math.min(1, Math.max(0, 0.5 + 2.2 * (height[i] - round[i]))))
      out[i * 4 + 3] = Math.round(255 * height[i])
    }
  }
  return { pixels: out, mean: sum / height.length }
}

// The clod map in the shaders. `clodAt` gives the map at a point, `clodRise` its height in meters over the mean ground.
export const clodGlsl = /* glsl */ `
uniform sampler2D tClods;
uniform vec4 uClods;
const mat2 TURN_L = mat2(0.9336, 0.3584, -0.3584, 0.9336);
vec2 clodUv(vec2 p) {
  return TURN_L * p * uClods.x + vec2(0.31, 0.17);
}
float clodRise(vec2 p, float lod) {
  return (textureLod(tClods, clodUv(p), lod).a - uClods.w) * uClods.y;
}
`
