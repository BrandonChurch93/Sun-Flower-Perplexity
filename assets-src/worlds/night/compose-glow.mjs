import sharp from 'sharp'
import { mkdirSync, writeFileSync } from 'node:fs'

const TAKE = process.argv[2] ?? 'out/work/sky-night/take-plant-out.jpg'
const LAND_FROM = Number(process.argv[3] ?? 0.655)
const W = 2816
const H = 1584
const S = W / 1408
const COVER = 1.3
const FULL = [3660, 2059]
const WEB = [1830, 1030]
const TABLE = [256, 144]

const raw = async (img) => {
  const { data, info } = await img.removeAlpha().raw().toBuffer({ resolveWithObject: true })
  return { data, w: info.width, h: info.height }
}
const lin = (v) => (v <= 10.3 ? v / 3294.6 : ((v / 255 + 0.055) / 1.055) ** 2.4)
const srgb = (v) => Math.round(255 * Math.min(1, Math.max(0, v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055)))

const small = sharp(TAKE).resize(W, H, { kernel: 'lanczos3' })
const points = await raw(small.clone())
const FINE = Number(process.argv[4] ?? 7)
const WIDE = Number(process.argv[5] ?? 25)
const LEFT = Number(process.argv[6] ?? 0.6)
const take = await raw(sharp(TAKE))
const fine = (await raw(sharp(TAKE).median(FINE))).data
const coarse = (await raw(sharp(TAKE).median(WIDE))).data
const core = Buffer.alloc(take.w * take.h)
for (let i = 0; i < take.w * take.h; i++) {
  const lf = 0.3 * lin(fine[i * 3]) + 0.6 * lin(fine[i * 3 + 1]) + 0.1 * lin(fine[i * 3 + 2])
  const lc = 0.3 * lin(coarse[i * 3]) + 0.6 * lin(coarse[i * 3 + 1]) + 0.1 * lin(coarse[i * 3 + 2])
  core[i] = (lf - lc) / (lc + 0.01) > LEFT ? 255 : 0
}
const cover = await raw(sharp(core, { raw: { width: take.w, height: take.h, channels: 1 } }).blur(5).toColourspace('b-w'))
const opened = Buffer.alloc(fine.length)
for (let i = 0; i < take.w * take.h; i++) {
  const s = Math.min(1, cover.data[i * cover.data.length / (take.w * take.h)] / 40)
  for (let c = 0; c < 3; c++) opened[i * 3 + c] = Math.round(fine[i * 3 + c] * (1 - s) + coarse[i * 3 + c] * s)
}
const calm = await raw(sharp(opened, { raw: { width: take.w, height: take.h, channels: 3 } }).blur(1.0).resize(W, H, { kernel: 'lanczos3' }))

const out = Buffer.alloc(W * H * 3)
const lum = (img, x, y) => 0.3 * lin(img.data[(y * W + x) * 3]) + 0.6 * lin(img.data[(y * W + x) * 3 + 1]) + 0.1 * lin(img.data[(y * W + x) * 3 + 2])
const from = Math.round(LAND_FROM * H)
const found = new Int32Array(W)
for (let x = 0; x < W; x++) {
  let best = 0
  found[x] = from
  for (let y = from; y < Math.round(0.81 * H); y++) {
    const drop = (lum(calm, x, y + 4 * S) - lum(calm, x, y - 4 * S)) / (lum(calm, x, y - 4 * S) + 1e-4)
    if (drop < best) {
      best = drop
      found[x] = y - 4 * S
    }
  }
}
const edge = new Int32Array(W)
for (let x = 0; x < W; x++) {
  let top = H
  for (let k = -8 * S; k <= 8 * S; k++) top = Math.min(top, found[Math.min(W - 1, Math.max(0, x + k))])
  edge[x] = top - 7 * S
}
const foot = new Float64Array(W * 3)
for (let x = 0; x < W; x++) {
  for (let c = 0; c < 3; c++) {
    let lo = 0
    for (let j = 0; j < 8 * S; j++) lo += lin(calm.data[((edge[x] - 2 * S - j) * W + x) * 3 + c])
    foot[x * 3 + c] = lo / (8 * S)
  }
}
const run = 48 * S
const footE = new Float64Array(W * 3)
for (let c = 0; c < 3; c++) {
  for (let x = 0; x < W; x++) {
    let s = 0
    let n = 0
    for (let k = -run; k <= run; k += 2 * S) {
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
      const t = Math.min(1, Math.max(0, (y - (edge[x] - 10 * S)) / (10 * S)))
      const s = t * t * (3 - 2 * t)
      out[i] = srgb(sky * (1 - s) + footE[x * 3 + c] * s)
    }
  }
}

const padX = Math.round((W * (COVER - 1)) / 2)
const padY = Math.round((H * (COVER - 1)) / 2)
const DW = W + 2 * padX
const DH = H + 2 * padY
const spread = await raw(sharp(out, { raw: { width: W, height: H, channels: 3 } }).extend({ top: padY, bottom: padY, left: padX, right: padX, extendWith: 'mirror' }))
const soft = await raw(sharp(spread.data, { raw: { width: DW, height: DH, channels: 3 } }).blur(9 * S))
const domeRaw = Buffer.alloc(DW * DH * 3)
for (let y = 0; y < DH; y++) {
  for (let x = 0; x < DW; x++) {
    const off = Math.max(padX - x, x - (padX + W - 1), padY - y, y - (padY + H - 1), 0)
    const t = Math.min(1, off / (120 * S))
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
const RIDGE = 2048
const ridgeTop = new Float64Array(W)
for (let x = 0; x < W; x++) {
  const y0 = found[x] + 4 * S
  const sky = lum(calm, x, y0 - 10 * S)
  const hill = lum(calm, x, y0 + 10 * S)
  const mid = (sky + hill) / 2
  ridgeTop[x] = y0
  for (let y = y0 - 10 * S; y < y0 + 10 * S; y++) {
    const a = lum(calm, x, y)
    const b = lum(calm, x, y + 1)
    if (a >= mid && b < mid) {
      ridgeTop[x] = y + (a - mid) / Math.max(a - b, 1e-6)
      break
    }
  }
}
const ridgeRaw = Float64Array.from(ridgeTop)
for (let x = 0; x < W; x++) {
  const near = []
  for (let k = -16 * S; k <= 16 * S; k++) near.push(ridgeRaw[Math.min(W - 1, Math.max(0, x + k))])
  const usual = near.sort((p, q) => p - q)[16 * S]
  if (Math.abs(ridgeRaw[x] - usual) > 14 * S) ridgeTop[x] = usual
}
const ridgeKept = Float64Array.from(ridgeTop)
for (let x = 0; x < W; x++) {
  const near = []
  for (let k = -3 * S; k <= 3 * S; k++) near.push(ridgeKept[Math.min(W - 1, Math.max(0, x + k))])
  const usual = near.sort((p, q) => p - q)[3 * S]
  if (Math.abs(ridgeKept[x] - usual) > 2.5 * S) ridgeTop[x] = usual
}
const ridgeBody = new Float64Array(W * 3)
const ridgeFoot = new Float64Array(W * 3)
const FOG_ROWS = [Math.round(0.815 * H), Math.round(0.838 * H)]
const middle = (list, share) => list.sort((p, q) => p - q)[Math.floor(share * (list.length - 1))]
for (let x = 0; x < W; x++) {
  for (let c = 0; c < 3; c++) {
    const under = []
    for (let k = -8 * S; k <= 8 * S; k += 2) {
      const xx = Math.min(W - 1, Math.max(0, x + k))
      const t = Math.round(ridgeTop[xx])
      for (let y = t + 8 * S; y < t + 24 * S; y += 2) under.push(lin(calm.data[(Math.min(H - 1, y) * W + xx) * 3 + c]))
    }
    ridgeBody[x * 3 + c] = middle(under, 0.5)
    const fog = []
    for (let k = -30 * S; k <= 30 * S; k += 4) {
      const xx = Math.min(W - 1, Math.max(0, x + k))
      for (let y = FOG_ROWS[0]; y < FOG_ROWS[1]; y += 3) fog.push(lin(calm.data[(y * W + xx) * 3 + c]))
    }
    ridgeFoot[x * 3 + c] = middle(fog, 0.8)
  }
}
const eased = (list, reach) => {
  const out = new Float64Array(list.length)
  for (let c = 0; c < 3; c++) {
    for (let x = 0; x < W; x++) {
      let s = 0
      let n = 0
      for (let k = -reach; k <= reach; k += 2) {
        const w = 1 - Math.abs(k) / (reach + 1)
        s += w * list[Math.min(W - 1, Math.max(0, x + k)) * 3 + c]
        n += w
      }
      out[x * 3 + c] = s / n
    }
  }
  return out
}
const underE = eased(ridgeBody, 12 * S)
const fogE = eased(ridgeFoot, 48 * S)
const hex = (v, digits) => Math.min(16 ** digits - 1, Math.max(0, Math.round(v))).toString(16).padStart(digits, '0')
let topHex = ''
let bodyHex = ''
let footHex = ''
for (let i = 0; i < RIDGE; i++) {
  let x = ((i + 0.5) / RIDGE) * DW - padX - 0.5
  if (x < 0) x = -x - 1
  if (x > W - 1) x = 2 * W - 1 - x
  x = Math.min(W - 1.001, Math.max(0, x))
  const j = Math.floor(x)
  const f = x - j
  topHex += hex(65535 * (1 - (padY + ridgeTop[j] * (1 - f) + ridgeTop[j + 1] * f + 0.5) / DH), 4)
  for (let c = 0; c < 3; c++) {
    bodyHex += hex(srgb(underE[j * 3 + c]), 2)
    footHex += hex(srgb(fogE[j * 3 + c]), 2)
  }
}
writeFileSync('src/worlds/night/ridge.ts', `export const RIDGE_SIZE = ${RIDGE}\nexport const RIDGE_TOP = '${topHex}'\nexport const RIDGE_BODY = '${bodyHex}'\nexport const RIDGE_FOOT = '${footHex}'\n`)
const look = Buffer.from(points.data)
for (let x = 0; x < W; x++) {
  const y = Math.round(ridgeTop[x])
  for (let k = 0; k < 2; k++) {
    look[((y + k) * W + x) * 3] = 255
    look[((y + k) * W + x) * 3 + 1] = 0
    look[((y + k) * W + x) * 3 + 2] = 0
  }
}
await sharp(look, { raw: { width: W, height: H, channels: 3 } }).extract({ left: 0, top: Math.round(0.6 * H), width: W, height: Math.round(0.28 * H) }).jpeg({ quality: 90 }).toFile('out/work/sky-night/ridge-look.jpg')
const table = await raw(sharp(dome).resize(TABLE[0], TABLE[1], { kernel: 'lanczos3' }))
let tableHex = ''
for (let i = 0; i < TABLE[0] * TABLE[1]; i++) {
  const l = 0.3 * lin(table.data[i * 3]) + 0.6 * lin(table.data[i * 3 + 1]) + 0.1 * lin(table.data[i * 3 + 2])
  tableHex += Math.min(255, Math.round(255 * Math.sqrt(l))).toString(16).padStart(2, '0')
}
writeFileSync('src/worlds/night/density.ts', `export const GLOW_COVER = ${COVER}\nexport const DENSITY_SIZE = [${TABLE[0]}, ${TABLE[1]}] as const\nexport const DENSITY = '${tableHex}'\n`)
await sharp(dome).jpeg({ quality: 90 }).toFile('out/work/sky-night/dome-look.jpg')
