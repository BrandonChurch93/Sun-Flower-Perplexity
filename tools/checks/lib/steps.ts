import sharp from 'sharp'

// A step is how far the picture moves between two frames, 0 to 255: the mean absolute difference of luminance, and the same of a copy blurred to 40 x 23.
const BLUR_W = 40
const BLUR_H = 23

export interface Small { luma: Float32Array; blur: Float32Array }

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
  return { luma, blur }
}

export function mad(a: Float32Array, b: Float32Array): number {
  let sum = 0
  for (let i = 0; i < a.length; i++) sum += Math.abs(a[i] - b[i])
  return sum / a.length
}
