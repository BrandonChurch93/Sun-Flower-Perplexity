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

function shuffled(count: number, key: number): number[] {
  const order = Array.from({ length: count }, (_, i) => i)
  for (let i = count - 1; i > 0; i--) {
    const j = Math.floor((hash32(combine(key, i)) / 4294967296) * (i + 1))
    const t = order[i]
    order[i] = order[j]
    order[j] = t
  }
  return order
}

// The pixel uses a rotated Halton set. The shutter is one sample per slot. The lens and the light each use a rotated
// Hammersley set in their own shuffled order, so even a handful of samples covers every side of the lens opening.
// The lens set is then moved so its weighted middle is the middle of the opening: a set that leans to one side shifts
// everything out of focus that way, by a different amount each frame.
export function frameSamples(frame: number, count: number): Sample[] {
  if (!(count >= 1) || !Number.isInteger(count)) throw new Error(`sample count must be a whole number of at least 1, got ${count}`)
  if (count === 1) return [{ index: 0, pixelX: 0, pixelY: 0, shutter: 0.5, lensX: 0, lensY: 0, lightX: 0, lightY: 0, weight: 1 }]
  const key = combine(SEED, frame)
  const r = (n: number) => hash32(key + n) / 4294967296
  const rot = [r(1), r(2), r(3), r(4), r(5), r(6), r(7)]
  const shutterOrder = shuffled(count, combine(key, 101))
  const lensOrder = shuffled(count, combine(key, 102))
  const lightOrder = shuffled(count, combine(key, 103))
  const out: Sample[] = []
  let total = 0
  for (let i = 0; i < count; i++) {
    const px = frac(radicalInverse(i + 1, 2) + rot[0]) - 0.5
    const py = frac(radicalInverse(i + 1, 3) + rot[1]) - 0.5
    const shutter = (shutterOrder[i] + frac(radicalInverse(i + 1, 5) + rot[2])) / count
    const l = lensOrder[i]
    const [lx, ly] = concentricDisc(frac((l + 0.5) / count + rot[3]), frac(radicalInverse(l, 2) + rot[4]))
    const radius = Math.hypot(lx, ly)
    const edge = radius <= 0.72 ? 0 : (radius - 0.72) / 0.28
    const weight = 1 + lensEdgeGain * edge * edge
    total += weight
    const g = lightOrder[i]
    const [gx, gy] = concentricDisc(frac((g + 0.5) / count + rot[5]), frac(radicalInverse(g, 2) + rot[6]))
    out.push({ index: i, pixelX: px, pixelY: py, shutter, lensX: lx, lensY: ly, lightX: gx, lightY: gy, weight })
  }
  for (const s of out) s.weight /= total
  for (let pass = 0; pass < 2; pass++) {
    let cx = 0
    let cy = 0
    for (const s of out) {
      cx += s.weight * s.lensX
      cy += s.weight * s.lensY
    }
    for (const s of out) {
      s.lensX -= cx
      s.lensY -= cy
      const r = Math.hypot(s.lensX, s.lensY)
      if (r > 1) {
        s.lensX /= r
        s.lensY /= r
      }
    }
  }
  return out
}
