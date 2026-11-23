import * as THREE from 'three'
import { clamp } from '../core/curves.ts'
import { stream } from '../core/random.ts'

export const SHAPE_SIZE = 64
export const DETAIL_SIZE = 32
export const WEATHER_SIZE = 256
export const CIRRUS_W = 512
export const CIRRUS_H = 256

function fade(t: number): number {
  return t * t * t * (t * (t * 6 - 15) + 10)
}

class TileGrid3D {
  readonly n: number
  readonly pts: Float32Array
  readonly grads: Float32Array

  constructor(n: number, rand: () => number) {
    this.n = n
    const count = n * n * n
    this.pts = new Float32Array(count * 3)
    this.grads = new Float32Array(count * 3)
    for (let i = 0; i < count; i++) {
      this.pts[i * 3] = rand()
      this.pts[i * 3 + 1] = rand()
      this.pts[i * 3 + 2] = rand()
      const z = rand() * 2 - 1
      const a = rand() * Math.PI * 2
      const r = Math.sqrt(Math.max(0, 1 - z * z))
      this.grads[i * 3] = Math.cos(a) * r
      this.grads[i * 3 + 1] = Math.sin(a) * r
      this.grads[i * 3 + 2] = z
    }
  }

  worley(ux: number, uy: number, uz: number): number {
    const n = this.n
    const x = ux * n
    const y = uy * n
    const z = uz * n
    const ix = Math.floor(x)
    const iy = Math.floor(y)
    const iz = Math.floor(z)
    let minD2 = 10
    for (let dz = -1; dz <= 1; dz++) {
      const wz = (((iz + dz) % n) + n) % n
      for (let dy = -1; dy <= 1; dy++) {
        const wy = (((iy + dy) % n) + n) % n
        const row = (wz * n + wy) * n
        for (let dx = -1; dx <= 1; dx++) {
          const wx = (((ix + dx) % n) + n) % n
          const idx = (row + wx) * 3
          const px = ix + dx + this.pts[idx] - x
          const py = iy + dy + this.pts[idx + 1] - y
          const pz = iz + dz + this.pts[idx + 2] - z
          const d2 = px * px + py * py + pz * pz
          if (d2 < minD2) minD2 = d2
        }
      }
    }
    return 1 - Math.min(1, Math.sqrt(minD2))
  }

  perlin(ux: number, uy: number, uz: number): number {
    const n = this.n
    const x = ux * n
    const y = uy * n
    const z = uz * n
    const x0 = Math.floor(x)
    const y0 = Math.floor(y)
    const z0 = Math.floor(z)
    const fx = x - x0
    const fy = y - y0
    const fz = z - z0
    const u = fade(fx)
    const v = fade(fy)
    const w = fade(fz)

    const ix0 = ((x0 % n) + n) % n
    const iy0 = ((y0 % n) + n) % n
    const iz0 = ((z0 % n) + n) % n
    const ix1 = (ix0 + 1) % n
    const iy1 = (iy0 + 1) % n
    const iz1 = (iz0 + 1) % n

    const dotGrad = (gx: number, gy: number, gz: number, dx: number, dy: number, dz: number): number => {
      const idx = ((gz * n + gy) * n + gx) * 3
      return this.grads[idx] * dx + this.grads[idx + 1] * dy + this.grads[idx + 2] * dz
    }

    const c000 = dotGrad(ix0, iy0, iz0, fx, fy, fz)
    const c100 = dotGrad(ix1, iy0, iz0, fx - 1, fy, fz)
    const c010 = dotGrad(ix0, iy1, iz0, fx, fy - 1, fz)
    const c110 = dotGrad(ix1, iy1, iz0, fx - 1, fy - 1, fz)
    const c001 = dotGrad(ix0, iy0, iz1, fx, fy, fz - 1)
    const c101 = dotGrad(ix1, iy0, iz1, fx - 1, fy, fz - 1)
    const c011 = dotGrad(ix0, iy1, iz1, fx, fy - 1, fz - 1)
    const c111 = dotGrad(ix1, iy1, iz1, fx - 1, fy - 1, fz - 1)

    const x00 = c000 + (c100 - c000) * u
    const x10 = c010 + (c110 - c010) * u
    const x01 = c001 + (c101 - c001) * u
    const x11 = c011 + (c111 - c011) * u
    const y00 = x00 + (x10 - x00) * v
    const y01 = x01 + (x11 - x01) * v
    return y00 + (y01 - y00) * w
  }
}

class TileGrid2D {
  readonly nx: number
  readonly ny: number
  readonly pts: Float32Array
  readonly grads: Float32Array

  constructor(nx: number, ny: number, rand: () => number) {
    this.nx = nx
    this.ny = ny
    const count = nx * ny
    this.pts = new Float32Array(count * 2)
    this.grads = new Float32Array(count * 2)
    for (let i = 0; i < count; i++) {
      this.pts[i * 2] = rand()
      this.pts[i * 2 + 1] = rand()
      const a = rand() * Math.PI * 2
      this.grads[i * 2] = Math.cos(a)
      this.grads[i * 2 + 1] = Math.sin(a)
    }
  }

  worley(ux: number, uy: number): number {
    const nx = this.nx
    const ny = this.ny
    const x = ux * nx
    const y = uy * ny
    const ix = Math.floor(x)
    const iy = Math.floor(y)
    let minD2 = 10
    for (let dy = -1; dy <= 1; dy++) {
      const wy = (((iy + dy) % ny) + ny) % ny
      for (let dx = -1; dx <= 1; dx++) {
        const wx = (((ix + dx) % nx) + nx) % nx
        const idx = (wy * nx + wx) * 2
        const px = ix + dx + this.pts[idx] - x
        const py = iy + dy + this.pts[idx + 1] - y
        const d2 = px * px + py * py
        if (d2 < minD2) minD2 = d2
      }
    }
    return 1 - Math.min(1, Math.sqrt(minD2))
  }

  perlin(ux: number, uy: number): number {
    const nx = this.nx
    const ny = this.ny
    const x = ux * nx
    const y = uy * ny
    const x0 = Math.floor(x)
    const y0 = Math.floor(y)
    const fx = x - x0
    const fy = y - y0
    const u = fade(fx)
    const v = fade(fy)
    const ix0 = ((x0 % nx) + nx) % nx
    const iy0 = ((y0 % ny) + ny) % ny
    const ix1 = (ix0 + 1) % nx
    const iy1 = (iy0 + 1) % ny
    const dot2 = (gx: number, gy: number, dx: number, dy: number): number => {
      const idx = (gy * nx + gx) * 2
      return this.grads[idx] * dx + this.grads[idx + 1] * dy
    }
    const c00 = dot2(ix0, iy0, fx, fy)
    const c10 = dot2(ix1, iy0, fx - 1, fy)
    const c01 = dot2(ix0, iy1, fx, fy - 1)
    const c11 = dot2(ix1, iy1, fx - 1, fy - 1)
    const a = c00 + (c10 - c00) * u
    const b = c01 + (c11 - c01) * u
    return a + (b - a) * v
  }
}

function remap(val: number, lo: number, hi: number): number {
  return clamp((val - lo) / Math.max(1e-5, hi - lo), 0, 1)
}

export interface CloudTextures {
  shape3D: THREE.Data3DTexture
  detail3D: THREE.Data3DTexture
  weather2D: THREE.DataTexture
  cirrus2D: THREE.DataTexture
  byteCount: number
}

export function buildCloudTextures(renderer: THREE.WebGLRenderer): CloudTextures {
  const rng = stream('sky-c-clouds')
  const rand = (): number => rng.next()

  const g4 = new TileGrid3D(4, rand)
  const g8 = new TileGrid3D(8, rand)
  const g16 = new TileGrid3D(16, rand)
  const g24 = new TileGrid3D(24, rand)

  const shapeBytes = new Uint8Array(SHAPE_SIZE * SHAPE_SIZE * SHAPE_SIZE * 4)
  let ptr = 0
  for (let z = 0; z < SHAPE_SIZE; z++) {
    const uz = (z + 0.5) / SHAPE_SIZE
    for (let y = 0; y < SHAPE_SIZE; y++) {
      const uy = (y + 0.5) / SHAPE_SIZE
      for (let x = 0; x < SHAPE_SIZE; x++) {
        const ux = (x + 0.5) / SHAPE_SIZE
        const p =
          0.55 * g4.perlin(ux, uy, uz) +
          0.3 * g8.perlin(ux, uy, uz) +
          0.15 * g16.perlin(ux, uy, uz)
        const pNorm = clamp(0.5 + 0.82 * p, 0, 1)
        const w0 = g4.worley(ux, uy, uz)
        const w1 = g8.worley(ux, uy, uz)
        const w2 = g16.worley(ux, uy, uz)
        const w3 = g24.worley(ux, uy, uz)
        const wFbm0 = 0.625 * w0 + 0.25 * w1 + 0.125 * w2
        const pw = remap(pNorm, -(1 - wFbm0) * 0.85, 1.0)
        const wFbm1 = 0.625 * w1 + 0.25 * w2 + 0.125 * w3
        const wFbm2 = 0.65 * w2 + 0.35 * w3
        const billow = clamp(0.55 * pw + 0.45 * wFbm0, 0, 1)

        shapeBytes[ptr++] = Math.round(pw * 255)
        shapeBytes[ptr++] = Math.round(wFbm0 * 255)
        shapeBytes[ptr++] = Math.round(wFbm1 * 255)
        shapeBytes[ptr++] = Math.round((0.5 * billow + 0.5 * wFbm2) * 255)
      }
    }
  }

  const d4 = new TileGrid3D(4, rand)
  const d8 = new TileGrid3D(8, rand)
  const d16 = new TileGrid3D(16, rand)
  const detailBytes = new Uint8Array(DETAIL_SIZE * DETAIL_SIZE * DETAIL_SIZE * 4)
  ptr = 0
  for (let z = 0; z < DETAIL_SIZE; z++) {
    const uz = (z + 0.5) / DETAIL_SIZE
    for (let y = 0; y < DETAIL_SIZE; y++) {
      const uy = (y + 0.5) / DETAIL_SIZE
      for (let x = 0; x < DETAIL_SIZE; x++) {
        const ux = (x + 0.5) / DETAIL_SIZE
        const a = d4.worley(ux, uy, uz)
        const b = d8.worley(ux, uy, uz)
        const c = d16.worley(ux, uy, uz)
        const curl = clamp(0.5 + 0.7 * d8.perlin(ux, uy, uz), 0, 1)
        detailBytes[ptr++] = Math.round((0.625 * a + 0.25 * b + 0.125 * c) * 255)
        detailBytes[ptr++] = Math.round((0.625 * b + 0.375 * c) * 255)
        detailBytes[ptr++] = Math.round(c * 255)
        detailBytes[ptr++] = Math.round(curl * 255)
      }
    }
  }

  const w3 = new TileGrid2D(3, 3, rand)
  const w6 = new TileGrid2D(6, 6, rand)
  const w12 = new TileGrid2D(12, 12, rand)
  const w24 = new TileGrid2D(24, 24, rand)
  const weatherBytes = new Uint8Array(WEATHER_SIZE * WEATHER_SIZE * 4)
  ptr = 0
  for (let y = 0; y < WEATHER_SIZE; y++) {
    const uy = (y + 0.5) / WEATHER_SIZE
    for (let x = 0; x < WEATHER_SIZE; x++) {
      const ux = (x + 0.5) / WEATHER_SIZE
      const warpX = 0.06 * w6.perlin(ux, uy) + 0.025 * w12.perlin(ux, uy)
      const warpY = 0.06 * w6.perlin(uy + 0.37, ux + 0.71) + 0.025 * w12.perlin(uy + 0.19, ux + 0.53)
      const wx = ((ux + warpX) % 1 + 1) % 1
      const wy = ((uy + warpY) % 1 + 1) % 1

      const pMacro = 0.5 + 0.68 * (0.6 * w3.perlin(wx, wy) + 0.28 * w6.perlin(wx, wy) + 0.12 * w12.perlin(wx, wy))
      const wMacro = 0.65 * w3.worley(wx, wy) + 0.35 * w6.worley(wx, wy)
      const cov = clamp(0.58 * pMacro + 0.42 * wMacro, 0, 1)

      const heightMod = clamp(0.5 + 0.75 * (0.6 * w6.perlin(wx + 0.31, wy + 0.63) + 0.4 * w12.worley(wx, wy) - 0.18), 0.15, 1)
      const stormRidge = clamp(
        0.52 * w6.worley(wx + 0.44, wy + 0.17) +
          0.32 * w12.worley(wx, wy) +
          0.16 * w24.worley(wx, wy),
        0,
        1,
      )
      const rainBand = clamp(0.5 + 0.85 * (0.7 * w6.perlin(wx * 1.0, wy) + 0.3 * w12.perlin(wx, wy)), 0, 1)

      weatherBytes[ptr++] = Math.round(cov * 255)
      weatherBytes[ptr++] = Math.round(heightMod * 255)
      weatherBytes[ptr++] = Math.round(stormRidge * 255)
      weatherBytes[ptr++] = Math.round(rainBand * 255)
    }
  }

  const c4 = new TileGrid2D(4, 14, rand)
  const c8 = new TileGrid2D(8, 28, rand)
  const c16 = new TileGrid2D(16, 56, rand)
  const cWarp = new TileGrid2D(5, 5, rand)
  const cirrusBytes = new Uint8Array(CIRRUS_W * CIRRUS_H * 4)
  ptr = 0
  for (let y = 0; y < CIRRUS_H; y++) {
    const uy = (y + 0.5) / CIRRUS_H
    for (let x = 0; x < CIRRUS_W; x++) {
      const ux = (x + 0.5) / CIRRUS_W
      const curlX = 0.08 * cWarp.perlin(ux, uy)
      const curlY = 0.11 * cWarp.perlin(ux + 0.41, uy + 0.23)
      const sx = ((ux + curlX) % 1 + 1) % 1
      const sy = ((uy + curlY + 0.14 * Math.sin(ux * Math.PI * 2)) % 1 + 1) % 1
      const streak =
        0.5 +
        0.78 *
          (0.55 * c4.perlin(sx, sy) +
            0.3 * c8.perlin(sx, sy) +
            0.15 * c16.perlin(sx, sy))
      const patch = clamp(0.5 + 0.85 * cWarp.perlin(ux * 1.0 + 0.7, uy * 1.0 + 0.2), 0, 1)
      const wisp = clamp(remap(streak, 0.42, 0.92) * remap(patch, 0.28, 0.82), 0, 1)
      const fine = clamp(0.5 + 0.8 * c16.perlin(sx + 0.13, sy + 0.29), 0, 1)

      cirrusBytes[ptr++] = Math.round(wisp * 255)
      cirrusBytes[ptr++] = Math.round(fine * 255)
      cirrusBytes[ptr++] = Math.round(patch * 255)
      cirrusBytes[ptr++] = 255
    }
  }

  const shape3D = new THREE.Data3DTexture(shapeBytes, SHAPE_SIZE, SHAPE_SIZE, SHAPE_SIZE)
  shape3D.format = THREE.RGBAFormat
  shape3D.type = THREE.UnsignedByteType
  shape3D.minFilter = THREE.LinearFilter
  shape3D.magFilter = THREE.LinearFilter
  shape3D.wrapS = THREE.RepeatWrapping
  shape3D.wrapT = THREE.RepeatWrapping
  shape3D.wrapR = THREE.RepeatWrapping
  shape3D.generateMipmaps = false
  shape3D.colorSpace = THREE.NoColorSpace
  shape3D.needsUpdate = true
  renderer.initTexture(shape3D)

  const detail3D = new THREE.Data3DTexture(detailBytes, DETAIL_SIZE, DETAIL_SIZE, DETAIL_SIZE)
  detail3D.format = THREE.RGBAFormat
  detail3D.type = THREE.UnsignedByteType
  detail3D.minFilter = THREE.LinearFilter
  detail3D.magFilter = THREE.LinearFilter
  detail3D.wrapS = THREE.RepeatWrapping
  detail3D.wrapT = THREE.RepeatWrapping
  detail3D.wrapR = THREE.RepeatWrapping
  detail3D.generateMipmaps = false
  detail3D.colorSpace = THREE.NoColorSpace
  detail3D.needsUpdate = true
  renderer.initTexture(detail3D)

  const weather2D = new THREE.DataTexture(weatherBytes, WEATHER_SIZE, WEATHER_SIZE, THREE.RGBAFormat, THREE.UnsignedByteType)
  weather2D.minFilter = THREE.LinearFilter
  weather2D.magFilter = THREE.LinearFilter
  weather2D.wrapS = THREE.RepeatWrapping
  weather2D.wrapT = THREE.RepeatWrapping
  weather2D.generateMipmaps = false
  weather2D.colorSpace = THREE.NoColorSpace
  weather2D.needsUpdate = true
  renderer.initTexture(weather2D)

  const cirrus2D = new THREE.DataTexture(cirrusBytes, CIRRUS_W, CIRRUS_H, THREE.RGBAFormat, THREE.UnsignedByteType)
  cirrus2D.minFilter = THREE.LinearFilter
  cirrus2D.magFilter = THREE.LinearFilter
  cirrus2D.wrapS = THREE.RepeatWrapping
  cirrus2D.wrapT = THREE.RepeatWrapping
  cirrus2D.generateMipmaps = false
  cirrus2D.colorSpace = THREE.NoColorSpace
  cirrus2D.needsUpdate = true
  renderer.initTexture(cirrus2D)

  const byteCount = shapeBytes.byteLength + detailBytes.byteLength + weatherBytes.byteLength + cirrusBytes.byteLength
  return { shape3D, detail3D, weather2D, cirrus2D, byteCount }
}
