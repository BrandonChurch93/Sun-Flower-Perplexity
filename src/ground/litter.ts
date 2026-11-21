import { hash32, streamSeed } from '../core/random.ts'

const SEED = streamSeed('ground litter')

// Dry leaf bits and pale stubble on clear soil: color with the cover in alpha, tiling.
export function litterPixels(size: number): Uint8Array {
  const out = new Uint8Array(size * size * 4)
  const cover = new Float32Array(size * size)
  const color = new Float32Array(size * size * 3)
  let n = 0
  const rnd = (): number => hash32(SEED + n++ * 2654435761) / 4294967296
  const put = (x: number, y: number, a: number, r: number, g: number, b: number): void => {
    const i = (((y % size) + size) % size) * size + (((x % size) + size) % size)
    if (a <= cover[i]) return
    cover[i] = a
    color[i * 3] = r
    color[i * 3 + 1] = g
    color[i * 3 + 2] = b
  }
  const unit = size / 1024
  const leaves = 520
  for (let k = 0; k < leaves; k++) {
    const cx = rnd() * size
    const cy = rnd() * size
    const long = (3 + 9 * rnd() * rnd()) * unit
    const wide = long * (0.35 + 0.4 * rnd())
    const turn = rnd() * Math.PI
    const ca = Math.cos(turn)
    const sa = Math.sin(turn)
    const dry = rnd()
    const tone = 0.55 + 0.6 * rnd()
    const r = (0.2 + 0.16 * dry) * tone
    const g = (0.15 + 0.07 * dry) * tone
    const b = (0.055 + 0.02 * dry) * tone
    const notch = rnd() * Math.PI * 2
    const reach = Math.ceil(long) + 1
    for (let y = -reach; y <= reach; y++) {
      for (let x = -reach; x <= reach; x++) {
        const u = (x * ca + y * sa) / long
        const v = (-x * sa + y * ca) / wide
        const ragged = 1 + 0.25 * Math.sin(Math.atan2(v, u) * 5 + notch)
        const q = (u * u + v * v) * ragged
        if (q > 1) continue
        const vein = 1 - 0.25 * Math.exp(-v * v * 60)
        const a = Math.min(1, (1 - q) * 4)
        put(Math.round(cx + x), Math.round(cy + y), a, r * vein, g * vein, b * vein)
      }
    }
  }
  const straws = 420
  for (let k = 0; k < straws; k++) {
    let x = rnd() * size
    let y = rnd() * size
    let turn = rnd() * Math.PI * 2
    const steps = Math.round((10 + 34 * rnd()) * unit)
    const tone = 0.6 + 0.5 * rnd()
    const thick = rnd() < 0.3 ? 2 : 1
    for (let s = 0; s < steps; s++) {
      for (let t = 0; t < thick; t++) put(Math.round(x + t * Math.sin(turn)), Math.round(y - t * Math.cos(turn)), 0.9, 0.42 * tone, 0.34 * tone, 0.17 * tone)
      x += Math.cos(turn)
      y += Math.sin(turn)
      turn += (rnd() - 0.5) * 0.12
    }
  }
  for (let i = 0; i < size * size; i++) {
    const a = cover[i]
    const fill = a > 0 ? 1 : 0
    out[i * 4] = Math.round(255 * Math.pow(fill ? color[i * 3] : 0.3, 1 / 2.2))
    out[i * 4 + 1] = Math.round(255 * Math.pow(fill ? color[i * 3 + 1] : 0.22, 1 / 2.2))
    out[i * 4 + 2] = Math.round(255 * Math.pow(fill ? color[i * 3 + 2] : 0.1, 1 / 2.2))
    out[i * 4 + 3] = Math.round(255 * a)
  }
  return out
}
