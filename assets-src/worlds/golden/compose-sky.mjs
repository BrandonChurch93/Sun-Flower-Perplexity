// Lays the kept sky takes out as the dome map. Run from the repo root: node assets-src/worlds/golden/compose-sky.mjs
// u runs once round the horizon with the sun at u = 0.5 and u growing toward screen right. v = sqrt(elevation / 90 deg), so the rows crowd toward the horizon, where the film looks.
import fs from 'node:fs'
import sharp from 'sharp'

const WIDTH = 8192
const HEIGHT = 2048
const SUN = { x: 0.2862, row: 1486, elevationDeg: 2.18 }
const SPAN_DEG = 100
const BOTTOM_ROW = 1528
const AWAY_BOTTOM_ROW = 1575
const AWAY_SPAN_DEG = 134
const AWAY_FROM_DEG = 63

async function read(file, blur) {
  let img = sharp(file).removeAlpha()
  if (blur) img = img.blur(blur)
  const { data, info } = await img.raw().toBuffer({ resolveWithObject: true })
  return { data, w: info.width, h: info.height }
}

function tap(img, x, y, out) {
  const cx = Math.min(img.w - 1.001, Math.max(0, x))
  const cy = Math.min(img.h - 1.001, Math.max(0, y))
  const x0 = Math.floor(cx)
  const y0 = Math.floor(cy)
  const fx = cx - x0
  const fy = cy - y0
  const i = (y0 * img.w + x0) * 3
  const j = i + img.w * 3
  for (let c = 0; c < 3; c++) {
    const top = img.data[i + c] * (1 - fx) + img.data[i + 3 + c] * fx
    const low = img.data[j + c] * (1 - fx) + img.data[j + 3 + c] * fx
    out[c] = top * (1 - fy) + low * fy
  }
}

const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

const sunward = await read('out/work/sky/sunward-1.png')
const sunwardSoft = await read('out/work/sky/sunward-1.png', 70)
const away = await read('out/work/sky/away-1.png')
const awaySoft = await read('out/work/sky/away-1.png', 70)
const perDeg = sunward.w / SPAN_DEG
const leftDeg = -SUN.x * SPAN_DEG
const rightDeg = leftDeg + SPAN_DEG
const out = Buffer.alloc(WIDTH * HEIGHT * 3)
const MATCH_DEG = 40
const awayAt = (r) => {
  const q = r < AWAY_FROM_DEG ? r + 360 : r
  const t = (q - AWAY_FROM_DEG) / AWAY_SPAN_DEG
  return (t <= 1 ? t : 2 - t) * (away.w - 1)
}
const e = [0, 0, 0]
const f = [0, 0, 0]
const a = [0, 0, 0]
const b = [0, 0, 0]
const s = [0, 0, 0]
for (let Y = 0; Y < HEIGHT; Y++) {
  const v = 1 - (Y + 0.5) / HEIGHT
  const el = 90 * v * v
  const row = SUN.row - (el - SUN.elevationDeg) * perDeg
  const rowAway = AWAY_BOTTOM_ROW - el * perDeg
  const over = smooth(22, 32, el)
  const dim = 1 - 0.3 * smooth(30, 90, el)
  // The away take is pulled toward the tone of the sunward take where they meet, less with every degree from the seam.
  const gains = [leftDeg + 6, rightDeg - 6].map((seam) => {
    tap(sunwardSoft, (seam - leftDeg) * perDeg, Math.max(50, Math.min(row, BOTTOM_ROW - 40)), e)
    tap(awaySoft, awayAt(seam), Math.max(50, Math.min(rowAway, AWAY_BOTTOM_ROW - 40)), f)
    const each = e.map((x, c) => (x + 4) / (f[c] + 4))
    const mean = (each[0] + each[1] + each[2]) / 3
    return each.map((g) => Math.min(3.5, mean + 0.45 * (g - mean)))
  })
  for (let X = 0; X < WIDTH; X++) {
    const r = ((X + 0.5) / WIDTH) * 360 - 180
    const wa = smooth(leftDeg, leftDeg + 12, r) * (1 - smooth(rightDeg - 12, rightDeg, r))
    if (wa > 0) {
      const x = (r - leftDeg) * perDeg
      tap(sunward, x, Math.min(row, BOTTOM_ROW), a)
      if (row > BOTTOM_ROW - 30) {
        tap(sunwardSoft, x, BOTTOM_ROW - 30, s)
        const k = smooth(BOTTOM_ROW - 30, BOTTOM_ROW, row)
        for (let c = 0; c < 3; c++) a[c] += (s[c] - a[c]) * k
      }
      if (over > 0) {
        tap(sunwardSoft, x, 50, s)
        for (let c = 0; c < 3; c++) a[c] += (s[c] - a[c]) * over
      }
    }
    if (wa < 1) {
      const x = awayAt(r)
      tap(away, x, Math.min(rowAway, AWAY_BOTTOM_ROW), b)
      if (over > 0) {
        tap(awaySoft, x, 50, s)
        for (let c = 0; c < 3; c++) b[c] += (s[c] - b[c]) * over
      }
      const q = r < leftDeg + 6 ? r + 360 : r
      const kl = Math.exp(-(360 + leftDeg + 6 - q) / MATCH_DEG)
      const kr = Math.exp(-Math.max(0, q - (rightDeg - 6)) / MATCH_DEG)
      const near = r < leftDeg + 6 ? 1 : r > rightDeg - 6 ? 0 : (r - leftDeg) / SPAN_DEG < 0.5 ? 1 : 0
      for (let c = 0; c < 3; c++) {
        const g = r > leftDeg + 6 && r < rightDeg - 6 ? (near ? gains[0][c] : gains[1][c]) : 1 + (gains[0][c] - 1) * kl + (gains[1][c] - 1) * kr
        b[c] *= g
      }
    }
    const o = (Y * WIDTH + X) * 3
    for (let c = 0; c < 3; c++) out[o + c] = Math.round(Math.min(255, (a[c] * wa + b[c] * (1 - wa)) * dim))
  }
}
fs.mkdirSync('public/assets/worlds/golden/full', { recursive: true })
fs.mkdirSync('public/assets/worlds/golden/web', { recursive: true })
const full = sharp(out, { raw: { width: WIDTH, height: HEIGHT, channels: 3 } })
await full.clone().jpeg({ quality: 93, chromaSubsampling: '4:4:4' }).toFile('public/assets/worlds/golden/full/sky.jpg')
await full.clone().resize(WIDTH / 2, HEIGHT / 2, { kernel: 'lanczos3' }).jpeg({ quality: 92, chromaSubsampling: '4:4:4' }).toFile('public/assets/worlds/golden/web/sky.jpg')
