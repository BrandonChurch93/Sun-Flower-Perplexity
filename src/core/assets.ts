import * as THREE from 'three'
import { config, type AssetSetId } from '../config.ts'

export interface TextureOptions {
  color?: boolean
  repeat?: boolean
  mipmaps?: boolean
  anisotropy?: number
}

interface Entry { texture: THREE.Texture; bytes: number; group: string; fromFile: boolean }

export class Assets {
  set: AssetSetId
  private readonly entries = new Map<string, Entry>()
  private readonly pending = new Map<string, Promise<THREE.Texture>>()
  readonly log: string[] = []

  constructor(private readonly renderer: THREE.WebGLRenderer, set: AssetSetId) {
    this.set = set
  }

  url(owner: string, file: string): string {
    return new URL(`assets/${owner}/${this.set}/${file}`, document.baseURI).href
  }

  private configure(texture: THREE.Texture, o: TextureOptions): void {
    const mip = o.mipmaps ?? true
    texture.colorSpace = o.color === false ? THREE.NoColorSpace : THREE.SRGBColorSpace
    texture.wrapS = texture.wrapT = o.repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping
    texture.generateMipmaps = mip
    texture.minFilter = mip ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter
    texture.magFilter = THREE.LinearFilter
    texture.anisotropy = Math.min(o.anisotropy ?? 1, this.renderer.capabilities.getMaxAnisotropy())
  }

  texture(owner: string, file: string, options: TextureOptions = {}): Promise<THREE.Texture> {
    const key = `${owner}/${this.set}/${file}`
    const have = this.entries.get(key)
    if (have) return Promise.resolve(have.texture)
    const waiting = this.pending.get(key)
    if (waiting) return waiting
    const job = (async () => {
      const response = await fetch(this.url(owner, file))
      if (!response.ok) throw new Error(`asset ${key} did not load (${response.status})`)
      const bitmap = await createImageBitmap(await response.blob(), { imageOrientation: 'flipY', premultiplyAlpha: 'none', colorSpaceConversion: 'none' })
      const texture = new THREE.Texture(bitmap as unknown as HTMLImageElement)
      texture.flipY = false
      this.configure(texture, options)
      texture.needsUpdate = true
      this.renderer.initTexture(texture)
      const bytes = bitmap.width * bitmap.height * 4 * ((options.mipmaps ?? true) ? 4 / 3 : 1)
      const size = { width: bitmap.width, height: bitmap.height }
      bitmap.close()
      texture.userData.size = size
      this.entries.set(key, { texture, bytes, group: owner, fromFile: true })
      this.pending.delete(key)
      return texture
    })()
    this.pending.set(key, job)
    return job
  }

  data(key: string, group: string, pixels: Uint8Array, width: number, height: number, options: TextureOptions = {}): THREE.Texture {
    const old = this.entries.get(key)
    if (old) {
      old.texture.dispose()
      this.entries.delete(key)
    }
    const texture = new THREE.DataTexture(pixels, width, height, THREE.RGBAFormat, THREE.UnsignedByteType)
    this.configure(texture, options)
    texture.needsUpdate = true
    this.renderer.initTexture(texture)
    texture.userData.size = { width, height }
    this.entries.set(key, { texture, bytes: width * height * 4 * ((options.mipmaps ?? true) ? 4 / 3 : 1), group, fromFile: false })
    return texture
  }

  free(group: string): void {
    for (const [key, entry] of this.entries) {
      if (entry.group !== group) continue
      entry.texture.dispose()
      this.entries.delete(key)
    }
    this.log.push(`freed ${group}`)
  }

  clear(): void {
    for (const entry of this.entries.values()) entry.texture.dispose()
    this.entries.clear()
  }

  bytes(): number {
    let sum = 0
    for (const entry of this.entries.values()) sum += entry.bytes
    return sum
  }

  megabytes(): number {
    return this.bytes() / 1048576
  }

  list(): { key: string; mb: number }[] {
    return Array.from(this.entries.entries()).map(([key, e]) => ({ key, mb: e.bytes / 1048576 }))
  }

  largestSide(): number {
    let side = 0
    for (const entry of this.entries.values()) {
      const size = entry.texture.userData.size as { width: number; height: number } | undefined
      if (size) side = Math.max(side, size.width, size.height)
    }
    return side
  }

  limitMb(): number {
    return config.assetSets[this.set].maxTextureMb
  }
}
