import { hash32 } from '../core/random.ts'

// Tileable cloud noise, made once on the processor at load, in the manner of Schneider 2015.
// Shape: red is Perlin-Worley, green, blue and alpha Worley at three rising frequencies. Detail: Worley at three frequencies.

const unit = (x: number): number => hash32(x) / 4294967296

function cellPoints(freq: number, seed: number): Float32Array {
  const p = new Float32Array(freq * freq * freq * 3)
  for (let i = 0; i < freq * freq * freq; i++) {
    const h = hash32(i * 3 + seed * 7919)
    p[i * 3] = unit(h)
    p[i * 3 + 1] = unit(h ^ 0x9e3779b9)
    p[i * 3 + 2] = unit(h ^ 0x85ebca6b)
  }
  return p
}

function worley(x: number, y: number, z: number, freq: number, pts: Float32Array): number {
  const fx = x * freq
  const fy = y * freq
  const fz = z * freq
  const ix = Math.floor(fx)
  const iy = Math.floor(fy)
  const iz = Math.floor(fz)
  let best = 9
  for (let dz = -1; dz <= 1; dz++) {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const cx = ix + dx
        const cy = iy + dy
        const cz = iz + dz
        const wx = ((cx % freq) + freq) % freq
        const wy = ((cy % freq) + freq) % freq
        const wz = ((cz % freq) + freq) % freq
        const k = ((wz * freq + wy) * freq + wx) * 3
        const px = cx + pts[k] - fx
        const py = cy + pts[k + 1] - fy
        const pz = cz + pts[k + 2] - fz
        const d = px * px + py * py + pz * pz
        if (d < best) best = d
      }
    }
  }
  return 1 - Math.min(1, Math.sqrt(best))
}

const fade = (t: number): number => t * t * t * (t * (t * 6 - 15) + 10)

function gradient(h: number, x: number, y: number, z: number): number {
  const g = h & 15
  const u = g < 8 ? x : y
  const v = g < 4 ? y : g === 12 || g === 14 ? x : z
  return ((g & 1) === 0 ? u : -u) + ((g & 2) === 0 ? v : -v)
}

function perlin(x: number, y: number, z: number, freq: number, seed: number): number {
  const fx = x * freq
  const fy = y * freq
  const fz = z * freq
  const ix = Math.floor(fx)
  const iy = Math.floor(fy)
  const iz = Math.floor(fz)
  const rx = fx - ix
  const ry = fy - iy
  const rz = fz - iz
  const h = (a: number, b: number, c: number): number => {
    const wa = ((a % freq) + freq) % freq
    const wb = ((b % freq) + freq) % freq
    const wc = ((c % freq) + freq) % freq
    return hash32(((wc * freq + wb) * freq + wa) * 31 + seed)
  }
  const u = fade(rx)
  const v = fade(ry)
  const w = fade(rz)
  const l = (a: number, b: number, t: number): number => a + (b - a) * t
  const x0 = l(gradient(h(ix, iy, iz), rx, ry, rz), gradient(h(ix + 1, iy, iz), rx - 1, ry, rz), u)
  const x1 = l(gradient(h(ix, iy + 1, iz), rx, ry - 1, rz), gradient(h(ix + 1, iy + 1, iz), rx - 1, ry - 1, rz), u)
  const x2 = l(gradient(h(ix, iy, iz + 1), rx, ry, rz - 1), gradient(h(ix + 1, iy, iz + 1), rx - 1, ry, rz - 1), u)
  const x3 = l(gradient(h(ix, iy + 1, iz + 1), rx, ry - 1, rz - 1), gradient(h(ix + 1, iy + 1, iz + 1), rx - 1, ry - 1, rz - 1), u)
  return l(l(x0, x1, v), l(x2, x3, v), w)
}

const remap = (v: number, a: number, b: number, c: number, d: number): number => c + ((v - a) / (b - a)) * (d - c)

export function shapeNoise(n: number): Uint8Array {
  const out = new Uint8Array(n * n * n * 4)
  const base = 4
  const w1 = cellPoints(base, 1)
  const w2 = cellPoints(base * 2, 2)
  const w3 = cellPoints(base * 4, 3)
  const w4 = cellPoints(base * 8, 4)
  for (let z = 0; z < n; z++) {
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const px = x / n
        const py = y / n
        const pz = z / n
        let p = 0
        let amp = 1
        let total = 0
        for (let o = 0; o < 4; o++) {
          p += perlin(px, py, pz, base << o, 11 + o) * amp
          total += amp
          amp *= 0.5
        }
        p = Math.min(1, Math.max(0, (p / total) * 0.9 + 0.5))
        const a = worley(px, py, pz, base, w1)
        const b = worley(px, py, pz, base * 2, w2)
        const c = worley(px, py, pz, base * 4, w3)
        const d = worley(px, py, pz, base * 8, w4)
        const wf = a * 0.625 + b * 0.25 + c * 0.125
        const pw = Math.min(1, Math.max(0, remap(p, wf - 1, 1, 0, 1)))
        const k = ((z * n + y) * n + x) * 4
        out[k] = Math.round(pw * 255)
        out[k + 1] = Math.round(b * 255)
        out[k + 2] = Math.round(c * 255)
        out[k + 3] = Math.round(d * 255)
      }
    }
  }
  return out
}

export function detailNoise(n: number): Uint8Array {
  const out = new Uint8Array(n * n * n * 4)
  const w1 = cellPoints(2, 21)
  const w2 = cellPoints(4, 22)
  const w3 = cellPoints(8, 23)
  for (let z = 0; z < n; z++) {
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const px = x / n
        const py = y / n
        const pz = z / n
        const k = ((z * n + y) * n + x) * 4
        out[k] = Math.round(worley(px, py, pz, 2, w1) * 255)
        out[k + 1] = Math.round(worley(px, py, pz, 4, w2) * 255)
        out[k + 2] = Math.round(worley(px, py, pz, 8, w3) * 255)
        out[k + 3] = 255
      }
    }
  }
  return out
}
