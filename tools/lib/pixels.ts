import sharp from 'sharp'

export interface Raw { data: Buffer; width: number; height: number; channels: number }

export async function rawOf(png: Buffer | string): Promise<Raw> {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  return { data, width: info.width, height: info.height, channels: info.channels }
}

export interface Difference { same: boolean; differingPixels: number; maxDifference: number; psnr: number }

export function compare(a: Raw, b: Raw): Difference {
  if (a.width !== b.width || a.height !== b.height || a.channels !== b.channels) return { same: false, differingPixels: a.width * a.height, maxDifference: 255, psnr: 0 }
  let differing = 0
  let max = 0
  let sum = 0
  const c = a.channels
  for (let i = 0; i < a.data.length; i += c) {
    let hit = false
    for (let k = 0; k < 3; k++) {
      const d = Math.abs(a.data[i + k] - b.data[i + k])
      if (d > 0) {
        hit = true
        if (d > max) max = d
        sum += d * d
      }
    }
    if (hit) differing++
  }
  const mse = sum / (a.width * a.height * 3)
  return { same: differing === 0, differingPixels: differing, maxDifference: max, psnr: mse === 0 ? Infinity : 10 * Math.log10((255 * 255) / mse) }
}
