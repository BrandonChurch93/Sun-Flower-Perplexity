import * as THREE from 'three'
import { clamp, lerp } from '../core/curves.ts'
import { stream } from '../core/random.ts'

export const CLOUD_SIZE = 64
export const STAR_WIDTH = 3072
export const STAR_HEIGHT = STAR_WIDTH / 2

class Field {
  private readonly data: Float32Array
  private readonly bend: Float32Array
  constructor(private readonly n: number, name: string) {
    const random = stream(name)
    this.data = new Float32Array(n ** 3)
    this.bend = new Float32Array(n ** 3 * 3)
    for (let i = 0; i < this.data.length; i++) this.data[i] = random.next()
    for (let i = 0; i < this.bend.length; i++) this.bend[i] = random.range(0.17, 0.83)
  }

  private key(x: number, y: number, z: number): number {
    const n = this.n
    return ((z + n) % n) * n * n + ((y + n) % n) * n + (x + n) % n
  }

  at(x: number, y: number, z: number): number {
    const n = this.n
    const ix = Math.floor(x * n)
    const iy = Math.floor(y * n)
    const iz = Math.floor(z * n)
    x = x * n - ix
    y = y * n - iy
    z = z * n - iz
    x *= x * (3 - 2 * x)
    y *= y * (3 - 2 * y)
    z *= z * (3 - 2 * z)
    const a = lerp(this.data[this.key(ix, iy, iz)], this.data[this.key(ix + 1, iy, iz)], x)
    const b = lerp(this.data[this.key(ix, iy + 1, iz)], this.data[this.key(ix + 1, iy + 1, iz)], x)
    const c = lerp(this.data[this.key(ix, iy, iz + 1)], this.data[this.key(ix + 1, iy, iz + 1)], x)
    const d = lerp(this.data[this.key(ix, iy + 1, iz + 1)], this.data[this.key(ix + 1, iy + 1, iz + 1)], x)
    return lerp(lerp(a, b, y), lerp(c, d, y), z)
  }

  cells(x: number, y: number, z: number): number {
    const n = this.n
    const ix = Math.floor(x * n)
    const iy = Math.floor(y * n)
    const iz = Math.floor(z * n)
    let dist = 9
    for (let dz = -1; dz <= 1; dz++) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const i = this.key(ix + dx, iy + dy, iz + dz) * 3
      const px = x * n - (ix + dx + this.bend[i])
      const py = y * n - (iy + dy + this.bend[i + 1])
      const pz = z * n - (iz + dz + this.bend[i + 2])
      dist = Math.min(dist, px * px + py * py + pz * pz)
    }
    return Math.max(0, 1 - Math.sqrt(dist) * 0.88)
  }
}

const byte = (n: number): number => Math.round(255 * clamp(n))

export function cloudNoise(): THREE.Data3DTexture {
  const n = CLOUD_SIZE
  const f0 = new Field(5, 'sky synoptic field')
  const f1 = new Field(9, 'sky cloud field')
  const f2 = new Field(15, 'sky cloud cells')
  const f3 = new Field(25, 'sky cloud erosion')
  const f4 = new Field(39, 'sky cloud detail')
  const data = new Uint8Array(n ** 3 * 4)
  for (let z = 0; z < n; z++) for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const u = (x + 0.5) / n
    const v = (y + 0.5) / n
    const w = (z + 0.5) / n
    const i = ((z * n + y) * n + x) * 4
    const a = f0.at(u, v, w)
    const b = f1.at(u, v, w)
    const c = f2.cells(u, v, w)
    const d = f3.cells(u, v, w)
    const e = f4.at(u, v, w)
    data[i] = byte(0.61 * a + 0.28 * b + 0.11 * c)
    data[i + 1] = byte(0.51 * b + 0.35 * c + 0.14 * d)
    data[i + 2] = byte(0.58 * c + 0.30 * d + 0.12 * e)
    data[i + 3] = byte(0.57 * d + 0.43 * e)
  }
  const texture = new THREE.Data3DTexture(data, n, n, n)
  texture.format = THREE.RGBAFormat
  texture.wrapS = texture.wrapT = texture.wrapR = THREE.RepeatWrapping
  texture.magFilter = texture.minFilter = THREE.LinearFilter
  texture.needsUpdate = true
  return texture
}

export function starMap(): THREE.DataTexture {
  const w = STAR_WIDTH
  const h = STAR_HEIGHT
  const random = stream('sky northern celestial field')
  const data = new Uint8Array(w * h * 4)
  const tau = Math.PI * 2
  const n = 18700
  const gal = [-0.802, 0.197, 0.565]

  for (let i = 0; i < n * 2; i++) {
    const t = random.next() * tau
    const y = random.range(-1, 1)
    const f = Math.sqrt(1 - y * y)
    const x = f * Math.sin(t)
    const z = f * Math.cos(t)
    const milky = Math.exp(-((gal[0] * x + gal[1] * y + gal[2] * z) ** 2) * 73)
    const el = Math.asin(y)
    if (i >= n && random.next() > milky * 0.63) continue
    const u = t / tau * w
    const v = (el / Math.PI + 0.5) * h
    const s = random.next()
    const k = random.next()
    const peak = Math.min(1, 0.017 + 0.026 * (s + 0.018) ** -1.05)
    const warm = k < 0.3 ? 1 : 0.7
    const green = k < 0.3 ? 0.82 : 0.86
    const blue = k < 0.3 ? 0.62 : 1
    const spread = 0.39 + peak * 0.26
    const width = spread / Math.max(0.23, f)
    for (let dy = -2; dy <= 2; dy++) for (let dx = -4; dx <= 4; dx++) {
      const px = Math.floor(u) + dx
      const py = Math.floor(v) + dy
      if (py < 0 || py >= h) continue
      const ii = (py * w + (px + w) % w) * 4
      const l = peak * Math.exp(-0.5 * (((px + 0.5 - u) / width) ** 2 + ((py + 0.5 - v) / spread) ** 2))
      data[ii] = Math.min(255, data[ii] + byte(l * warm))
      data[ii + 1] = Math.min(255, data[ii + 1] + byte(l * green))
      data[ii + 2] = Math.min(255, data[ii + 2] + byte(l * blue))
    }
  }
  const texture = new THREE.DataTexture(data, w, h, THREE.RGBAFormat, THREE.UnsignedByteType)
  texture.wrapS = THREE.RepeatWrapping
  texture.magFilter = THREE.LinearFilter
  texture.minFilter = THREE.LinearMipmapLinearFilter
  texture.generateMipmaps = true
  texture.needsUpdate = true
  return texture
}
