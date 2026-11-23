import sharp from 'sharp'

// A step is how far the picture moves between two frames, 0 to 255: the mean absolute difference of luminance, and the same of a copy blurred to 40 x 23.
const BLUR_W = 40
const BLUR_H = 23

// The structure of a frame is where its edges lie: the slopes of its luminance on a grid of 80 x 45, the brightest 2 percent of the picture held down first so that a sun's disc is not an edge.
// Glare, a veil or a change of exposure moves every slope by the same factor and leaves the edges where they are. A cut, a jump of the camera or a sky put in another's place moves them.
const GRID_W = 80
const GRID_H = 45
const BRIGHTEST = 0.02

export interface Band { slopes: Float32Array; strength: number }
export interface Small { luma: Float32Array; blur: Float32Array; sky: Band; land: Band }

function bandOf(grid: Float32Array, fromRow: number, toRow: number): Band {
  const slopes = new Float32Array(2 * (toRow - fromRow) * (GRID_W - 2))
  let n = 0
  let sum = 0
  for (let y = fromRow; y < toRow; y++) {
    for (let x = 1; x < GRID_W - 1; x++) {
      const across = grid[y * GRID_W + x + 1] - grid[y * GRID_W + x - 1]
      const down = grid[(y + 1) * GRID_W + x] - grid[(y - 1) * GRID_W + x]
      slopes[n++] = across
      slopes[n++] = down
      sum += across * across + down * down
    }
  }
  return { slopes, strength: Math.sqrt(sum / n) }
}

export function structure(luma: Float32Array, width: number, height: number): { sky: Band; land: Band } {
  const bins = new Uint32Array(256)
  for (let i = 0; i < luma.length; i++) bins[Math.min(255, Math.max(0, Math.round(luma[i])))]++
  let cap = 255
  for (let seen = 0; cap > 0 && seen + bins[cap] <= BRIGHTEST * luma.length; cap--) seen += bins[cap]
  const grid = new Float32Array(GRID_W * GRID_H)
  const count = new Float32Array(GRID_W * GRID_H)
  for (let y = 0; y < height; y++) {
    const gy = Math.min(GRID_H - 1, Math.floor((y * GRID_H) / height))
    for (let x = 0; x < width; x++) {
      const g = gy * GRID_W + Math.min(GRID_W - 1, Math.floor((x * GRID_W) / width))
      grid[g] += Math.min(luma[y * width + x], cap)
      count[g]++
    }
  }
  for (let i = 0; i < grid.length; i++) grid[i] /= count[i]
  const middle = Math.floor(GRID_H / 2)
  return { sky: bandOf(grid, 1, middle), land: bandOf(grid, middle, GRID_H - 1) }
}

// How far the edges of one band moved between two frames: 0 when they lie where they lay, about 1 when the two have nothing in common.
export function moved(a: Band, b: Band): { step: number; strength: number } {
  let dot = 0
  for (let i = 0; i < a.slopes.length; i++) dot += a.slopes[i] * b.slopes[i]
  const strength = Math.min(a.strength, b.strength)
  return { step: 1 - dot / a.slopes.length / (a.strength * b.strength + 1e-6), strength }
}

export async function small(file: string): Promise<Small> {
  const { data, info } = await sharp(file).removeAlpha().raw().toBuffer({ resolveWithObject: true })
  const luma = new Float32Array(info.width * info.height)
  for (let i = 0, p = 0; i < luma.length; i++, p += 3) luma[i] = 0.2126 * data[p] + 0.7152 * data[p + 1] + 0.0722 * data[p + 2]
  const blur = new Float32Array(BLUR_W * BLUR_H)
  const count = new Float32Array(BLUR_W * BLUR_H)
  for (let y = 0; y < info.height; y++) {
    const by = Math.min(BLUR_H - 1, Math.floor((y * BLUR_H) / info.height))
    for (let x = 0; x < info.width; x++) {
      const b = by * BLUR_W + Math.min(BLUR_W - 1, Math.floor((x * BLUR_W) / info.width))
      blur[b] += luma[y * info.width + x]
      count[b]++
    }
  }
  for (let i = 0; i < blur.length; i++) blur[i] /= count[i]
  return { luma, blur, ...structure(luma, info.width, info.height) }
}

export function mad(a: Float32Array, b: Float32Array): number {
  let sum = 0
  for (let i = 0; i < a.length; i++) sum += Math.abs(a[i] - b[i])
  return sum / a.length
}
