import { combine, hash32, streamSeed } from './random.ts'

export interface Sample {
  index: number
  pixelX: number
  pixelY: number
  shutter: number
  lensX: number
  lensY: number
  lightX: number
  lightY: number
  weight: number
}

function radicalInverse(index: number, base: number): number {
  let result = 0
  let f = 1 / base
  let i = index
  while (i > 0) {
    result += f * (i % base)
    i = Math.floor(i / base)
    f /= base
  }
  return result
}

function frac(x: number): number {
  return x - Math.floor(x)
}

export function concentricDisc(u: number, v: number): [number, number] {
  const a = 2 * u - 1
  const b = 2 * v - 1
  if (a === 0 && b === 0) return [0, 0]
  let r: number
  let phi: number
  if (Math.abs(a) > Math.abs(b)) {
    r = a
    phi = (Math.PI / 4) * (b / a)
  } else {
    r = b
    phi = Math.PI / 2 - (Math.PI / 4) * (a / b)
  }
  return [r * Math.cos(phi), r * Math.sin(phi)]
}

const SEED = streamSeed('sampler')

export const lensEdgeGain = 0.35

export function frameSamples(frame: number, count: number): Sample[] {
  if (!(count >= 1) || !Number.isInteger(count)) throw new Error(`sample count must be a whole number of at least 1, got ${count}`)
  if (count === 1) return [{ index: 0, pixelX: 0, pixelY: 0, shutter: 0.5, lensX: 0, lensY: 0, lightX: 0, lightY: 0, weight: 1 }]
  const key = combine(SEED, frame)
  const r = (n: number) => hash32(key + n) / 4294967296
  const rot = [r(1), r(2), r(3), r(4), r(5), r(6), r(7)]
  const order = Array.from({ length: count }, (_, i) => i)
  for (let i = count - 1; i > 0; i--) {
    const j = Math.floor((hash32(combine(key, 100 + i)) / 4294967296) * (i + 1))
    const t = order[i]
    order[i] = order[j]
    order[j] = t
  }
  const out: Sample[] = []
  let total = 0
  for (let i = 0; i < count; i++) {
    const px = frac(radicalInverse(i + 1, 2) + rot[0]) - 0.5
    const py = frac(radicalInverse(i + 1, 3) + rot[1]) - 0.5
    const shutter = (order[i] + frac(radicalInverse(i + 1, 5) + rot[2])) / count
    const lu = frac((i + 0.5) / count + rot[3])
    const lv = frac(radicalInverse(i + 1, 7) + rot[4])
    const [lx, ly] = concentricDisc(lu, lv)
    const radius = Math.hypot(lx, ly)
    const edge = radius <= 0.72 ? 0 : (radius - 0.72) / 0.28
    const weight = 1 + lensEdgeGain * edge * edge
    total += weight
    const [gx, gy] = concentricDisc(frac(radicalInverse(i + 1, 11) + rot[5]), frac(radicalInverse(i + 1, 13) + rot[6]))
    out.push({ index: i, pixelX: px, pixelY: py, shutter, lensX: lx, lensY: ly, lightX: gx, lightY: gy, weight })
  }
  for (const s of out) s.weight /= total
  return out
}
