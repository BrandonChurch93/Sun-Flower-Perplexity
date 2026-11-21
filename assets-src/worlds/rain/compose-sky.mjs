import sharp from 'sharp'
import { mkdir } from 'node:fs/promises'

const TAKE = 'out/work/rain/sky-1.png'
const CUT_BOTTOM = 24
// The take paints the cloud near black and a deep teal. Its shade is opened and drawn toward slate here, at full precision and before the picture is packed,
// to the tones the cloud has in the approved image; the bright band keeps its own.
const OPEN = 1.1
const OPEN_BELOW = 75
const GREY = 0.35

const meta = await sharp(TAKE).metadata()
const height = meta.height - CUT_BOTTOM
const { data, info } = await sharp(TAKE).removeAlpha().extract({ left: 0, top: 0, width: meta.width, height }).raw().toBuffer({ resolveWithObject: true })
const hash = (n) => {
  let h = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b)
  h ^= h >>> 13
  h = Math.imul(h, 0xc2b2ae35)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}
const graded = Buffer.alloc(data.length)
for (let p = 0; p < info.width * info.height; p++) {
  const o = p * 3
  const lum = 0.3 * data[o] + 0.6 * data[o + 1] + 0.1 * data[o + 2]
  const shade = Math.exp(-((lum / OPEN_BELOW) ** 2))
  const noise = hash(p) - 0.5
  for (let c = 0; c < 3; c++) {
    const v = data[o + c] + GREY * shade * (lum - data[o + c])
    graded[o + c] = Math.max(0, Math.min(255, Math.round(v * (1 + OPEN * shade) + noise)))
  }
}
const take = await sharp(graded, { raw: { width: info.width, height: info.height, channels: 3 } }).png().toBuffer()
const turned = await sharp(take).flop().png().toBuffer()
const both = await sharp({ create: { width: meta.width * 2, height, channels: 3, background: '#000000' } })
  .composite([{ input: take, left: 0, top: 0 }, { input: turned, left: meta.width, top: 0 }])
  .png()
  .toBuffer()
for (const [set, width, quality] of [['full', 5632, 93], ['web', 2816, 92]]) {
  await mkdir(`public/assets/worlds/rain/${set}`, { recursive: true })
  await sharp(both).resize({ width, height: Math.round((width * height) / (meta.width * 2)), fit: 'fill' }).jpeg({ quality, chromaSubsampling: '4:4:4' }).toFile(`public/assets/worlds/rain/${set}/sky.jpg`)
}
