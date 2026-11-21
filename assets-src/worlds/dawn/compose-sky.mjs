// Lays the kept sky take out as the dome map. Run from the repo root: node assets-src/worlds/dawn/compose-sky.mjs
// u runs once round the horizon with the sun at u = 0.5 and u growing toward screen right. v = sqrt(elevation / 90 deg), so the rows crowd toward the horizon, where the film looks.
import fs from 'node:fs'
import sharp from 'sharp'

const WIDTH = 4096
const HEIGHT = 1024
const TAKE = 'out/work/dawnsky/sunward-1.png'
const SUN_X = 0.6335
const SPAN_DEG = 60
// The film sees the lowest eight degrees of this sky through a long lens: the take's whole height is laid over RISE_DEG.
const RISE_DEG = 7.5
const BOTTOM_ROW = 1540
const TOP_ROW = 40
const SEAM_DEG = 8
// Round the rest of the horizon the sky is the take's own left third, away from the glow, laid back and forth.
const REST_SHARE = 0.3

async function read(blur) {
  let img = sharp(TAKE).removeAlpha()
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

const take = await read(0)
const soft = await read(40)
const perDeg = take.w / SPAN_DEG
const rowsPerDeg = (BOTTOM_ROW - TOP_ROW) / RISE_DEG
const leftDeg = -SUN_X * SPAN_DEG
const rightDeg = leftDeg + SPAN_DEG
const out = Buffer.alloc(WIDTH * HEIGHT * 3)
const a = [0, 0, 0]
const b = [0, 0, 0]
const s = [0, 0, 0]
const restWidth = REST_SHARE * take.w
for (let Y = 0; Y < HEIGHT; Y++) {
  const v = 1 - (Y + 0.5) / HEIGHT
  const el = 90 * v * v
  const row = Math.max(TOP_ROW, BOTTOM_ROW - el * rowsPerDeg)
  const over = smooth(RISE_DEG - 2, RISE_DEG, el)
  const dim = 1 - 0.35 * smooth(RISE_DEG, 90, el)
  for (let X = 0; X < WIDTH; X++) {
    const r = ((X + 0.5) / WIDTH) * 360 - 180
    const wa = smooth(leftDeg, leftDeg + SEAM_DEG, r) * (1 - smooth(rightDeg - SEAM_DEG, rightDeg, r))
    if (wa > 0) {
      tap(take, (r - leftDeg) * perDeg, row, a)
      if (over > 0) {
        tap(soft, (r - leftDeg) * perDeg, TOP_ROW, s)
        for (let c = 0; c < 3; c++) a[c] += (s[c] - a[c]) * over
      }
    }
    if (wa < 1) {
      const q = (((r - leftDeg) * perDeg) % (2 * restWidth) + 2 * restWidth) % (2 * restWidth)
      tap(soft, q <= restWidth ? q : 2 * restWidth - q, row, b)
    }
    const o = (Y * WIDTH + X) * 3
    for (let c = 0; c < 3; c++) out[o + c] = Math.round(Math.min(255, (a[c] * wa + b[c] * (1 - wa)) * dim))
  }
}
fs.mkdirSync('public/assets/worlds/dawn/full', { recursive: true })
fs.mkdirSync('public/assets/worlds/dawn/web', { recursive: true })
const full = sharp(out, { raw: { width: WIDTH, height: HEIGHT, channels: 3 } })
await full.clone().jpeg({ quality: 93, chromaSubsampling: '4:4:4' }).toFile('public/assets/worlds/dawn/full/sky.jpg')
await full.clone().resize(WIDTH / 2, HEIGHT / 2, { kernel: 'lanczos3' }).jpeg({ quality: 92, chromaSubsampling: '4:4:4' }).toFile('public/assets/worlds/dawn/web/sky.jpg')
