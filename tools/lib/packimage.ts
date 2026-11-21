import sharp, { type Sharp } from 'sharp'
import { config } from '../../src/config.ts'
import { longEdge } from './layout.ts'

const PIXEL_CHUNKS = new Set(['IHDR', 'PLTE', 'tRNS', 'IDAT', 'IEND'])

export function pixelsOnly(png: Buffer): Buffer {
  const parts: Buffer[] = [png.subarray(0, 8)]
  let at = 8
  while (at + 12 <= png.length) {
    const size = png.readUInt32BE(at)
    const end = at + 12 + size
    if (PIXEL_CHUNKS.has(png.toString('latin1', at + 4, at + 8))) parts.push(png.subarray(at, end))
    at = end
  }
  return Buffer.concat(parts)
}

export async function asPng(input: Buffer | string | Sharp): Promise<Buffer> {
  const image = typeof input === 'string' || Buffer.isBuffer(input) ? sharp(input) : input
  const flat = await image.removeAlpha().png().toBuffer()
  return pixelsOnly(await sharp(flat).resize(longEdge, longEdge, { fit: 'inside', withoutEnlargement: true }).png({ compressionLevel: 9 }).toBuffer())
}

const master = config.formats.master
export const wholeSize = { width: longEdge, height: Math.round((longEdge * master.height) / master.width) }

// One way to turn any picture into a whole image of a pack: the same crop to the master format's shape, the same size, the same encoder, no metadata.
export async function wholeImage(file: string): Promise<Buffer> {
  const flat = await sharp(file).removeAlpha().toColourspace('srgb').resize(wholeSize.width, wholeSize.height, { fit: 'cover', position: 'centre', kernel: 'lanczos3' }).raw().toBuffer()
  return pixelsOnly(await sharp(flat, { raw: { width: wholeSize.width, height: wholeSize.height, channels: 3 } }).png({ compressionLevel: 9 }).toBuffer())
}

// The same picture at the master format's size, for cutting native size crops that cover the same part of the picture as a crop of a frame.
export async function atMasterSize(file: string): Promise<Buffer> {
  return sharp(file).removeAlpha().toColourspace('srgb').resize(master.width, master.height, { fit: 'cover', position: 'centre', kernel: 'lanczos3' }).png({ compressionLevel: 3 }).toBuffer()
}
