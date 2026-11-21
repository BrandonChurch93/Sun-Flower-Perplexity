import sharp from 'sharp'
import { mkdirSync, writeFileSync } from 'node:fs'

const TAKE = process.argv[2] ?? 'out/work/sky-night/take-plant-out.jpg'
const LAND_FROM = Number(process.argv[3] ?? 0.655)
const W = 1408
const H = 792
const COVER = 1.3
const FULL = [2048, 1152]
const WEB = [1024, 576]
const TABLE = [96, 54]

const raw = async (img) => {
  const { data, info } = await img.removeAlpha().raw().toBuffer({ resolveWithObject: true })
  return { data, w: info.width, h: info.height }
}
const lin = (v) => (v <= 10.3 ? v / 3294.6 : ((v / 255 + 0.055) / 1.055) ** 2.4)
const srgb = (v) => Math.round(255 * Math.min(1, Math.max(0, v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055)))

const small = sharp(TAKE).resize(W, H, { kernel: 'lanczos3' })
const points = await raw(small.clone())
const calm = await raw(sharp(await small.clone().median(5).png().toBuffer()).median(5).blur(1.0))
const wide = await raw(small.clone().blur(14))

const out = Buffer.alloc(W * H * 3)
const lum = (img, x, y) => 0.3 * lin(img.data[(y * W + x) * 3]) + 0.6 * lin(img.data[(y * W + x) * 3 + 1]) + 0.1 * lin(img.data[(y * W + x) * 3 + 2])
const from = Math.round(LAND_FROM * H)
const found = new Int32Array(W)
for (let x = 0; x < W; x++) {
  let best = 0
  found[x] = from
  for (let y = from; y < Math.round(0.81 * H); y++) {
    const drop = (lum(calm, x, y + 4) - lum(calm, x, y - 4)) / (lum(calm, x, y - 4) + 1e-4)
    if (drop < best) {
      best = drop
      found[x] = y - 4
    }
  }
}
const edge = new Int32Array(W)
for (let x = 0; x < W; x++) {
  let top = H
  for (let k = -8; k <= 8; k++) top = Math.min(top, found[Math.min(W - 1, Math.max(0, x + k))])
  edge[x] = top - 7
}
const foot = new Float64Array(W * 3)
for (let x = 0; x < W; x++) {
  for (let c = 0; c < 3; c++) {
    let lo = 0
    for (let j = 0; j < 8; j++) lo += lin(calm.data[((edge[x] - 2 - j) * W + x) * 3 + c])
    foot[x * 3 + c] = lo / 8
  }
}
const run = 48
const footE = new Float64Array(W * 3)
for (let c = 0; c < 3; c++) {
  for (let x = 0; x < W; x++) {
    let s = 0
    let n = 0
    for (let k = -run; k <= run; k += 2) {
      const w = 1 - Math.abs(k) / (run + 1)
      s += w * foot[Math.min(W - 1, Math.max(0, x + k)) * 3 + c]
      n += w
    }
    footE[x * 3 + c] = s / n
  }
}
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    for (let c = 0; c < 3; c++) {
      const i = (y * W + x) * 3 + c
      const sky = Math.min(lin(calm.data[i]), lin(points.data[i]) * 1.15 + 0.002)
      const t = Math.min(1, Math.max(0, (y - (edge[x] - 10)) / 10))
      const s = t * t * (3 - 2 * t)
      out[i] = srgb(sky * (1 - s) + footE[x * 3 + c] * s)
    }
  }
}

const padX = Math.round((W * (COVER - 1)) / 2)
const padY = Math.round((H * (COVER - 1)) / 2)
const DW = W + 2 * padX
const DH = H + 2 * padY
const spread = await raw(sharp(out, { raw: { width: W, height: H, channels: 3 } }).extend({ top: padY, bottom: padY, left: padX, right: padX, extendWith: 'copy' }))
const soft = await raw(sharp(spread.data, { raw: { width: DW, height: DH, channels: 3 } }).blur(22))
const domeRaw = Buffer.alloc(DW * DH * 3)
for (let y = 0; y < DH; y++) {
  for (let x = 0; x < DW; x++) {
    const off = Math.max(padX - x, x - (padX + W - 1), padY - y, y - (padY + H - 1), 0)
    const t = Math.min(1, off / 40)
    const s = t * t * (3 - 2 * t)
    for (let c = 0; c < 3; c++) {
      const i = (y * DW + x) * 3 + c
      domeRaw[i] = Math.round(spread.data[i] * (1 - s) + soft.data[i] * s)
    }
  }
}
const dome = await sharp(domeRaw, { raw: { width: DW, height: DH, channels: 3 } }).png().toBuffer()
for (const [set, size, quality] of [['full', FULL, 93], ['web', WEB, 92]]) {
  mkdirSync(`public/assets/worlds/night/${set}`, { recursive: true })
  await sharp(dome).resize(size[0], size[1], { kernel: 'lanczos3' }).jpeg({ quality, chromaSubsampling: '4:4:4' }).toFile(`public/assets/worlds/night/${set}/glow.jpg`)
}
const table = await raw(sharp(dome).resize(TABLE[0], TABLE[1], { kernel: 'lanczos3' }))
let hex = ''
for (let i = 0; i < TABLE[0] * TABLE[1]; i++) {
  const l = 0.3 * lin(table.data[i * 3]) + 0.6 * lin(table.data[i * 3 + 1]) + 0.1 * lin(table.data[i * 3 + 2])
  hex += Math.min(255, Math.round(255 * Math.sqrt(l))).toString(16).padStart(2, '0')
}
writeFileSync('src/worlds/night/density.ts', `export const GLOW_COVER = ${COVER}\nexport const DENSITY_SIZE = [${TABLE[0]}, ${TABLE[1]}] as const\nexport const DENSITY = '${hex}'\n`)
await sharp(dome).jpeg({ quality: 90 }).toFile('out/work/sky-night/dome-look.jpg')
