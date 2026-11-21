import fs from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'
import { config } from '../src/config.ts'
import { isTier } from '../src/core/tiers.ts'
import type { TexelCheck } from '../src/director/film.ts'
import { judgedFrames, keys, segmentById } from '../src/director/timeline.ts'
import { parseArgs, str } from './lib/args.ts'
import { renderChecked } from './lib/checked.ts'
import { ensureDir, rel } from './lib/layout.ts'
import { m1Of, type M1Result } from './lib/m1.ts'
import { isMain } from './lib/main.ts'
import { at, WORK } from './lib/paths.ts'
import { writeRecord } from './lib/record.ts'
import { openSession, recordBase, type Session } from './lib/render.ts'

const master = config.formats.master
const W = master.width
const H = master.height

export interface M2Result extends TexelCheck { pass: boolean; note?: string }
export interface M3Result { pass: boolean; ratio: number; frameEnergy: number; approvedEnergy: number; sharpPixels: number; region: { left: number; top: number; width: number; height: number } | null; note?: string }
export interface MeasuredFrame { frame: number; key: string | null; why: string; m1: M1Result; m2: M2Result; m3: M3Result | null }

async function luma(input: Buffer | string): Promise<Float32Array> {
  const { data, info } = await sharp(input).removeAlpha().resize(W, H, { fit: 'fill', kernel: 'lanczos3' }).raw().toBuffer({ resolveWithObject: true })
  const out = new Float32Array(W * H)
  const c = info.channels
  for (let i = 0; i < out.length; i++) out[i] = 0.2126 * data[i * c] + 0.7152 * data[i * c + 1] + 0.0722 * data[i * c + 2]
  return out
}

function laplacian(l: Float32Array): Float32Array {
  const out = new Float32Array(W * H)
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    const i = y * W + x
    out[i] = Math.abs(4 * l[i] - l[i - 1] - l[i + 1] - l[i - W] - l[i + W])
  }
  return out
}

async function sharpZone(png: Buffer): Promise<Uint8Array> {
  const { data, info } = await sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true })
  if (info.width !== W || info.height !== H) throw new Error('the focus view is not at the master size')
  const mask = new Uint8Array(W * H)
  for (let i = 0; i < mask.length; i++) if (data[i * 3 + 1] > 200 && data[i * 3] < 140 && data[i * 3 + 2] < 140) mask[i] = 1
  return mask
}

function m3Of(frameLap: Float32Array, approvedLap: Float32Array, mask: Uint8Array): M3Result {
  let sum = 0
  let n = 0
  let x0 = W
  let x1 = -1
  let y0 = H
  let y1 = -1
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    const i = y * W + x
    if (!mask[i]) continue
    sum += frameLap[i]
    n++
    if (x < x0) x0 = x
    if (x > x1) x1 = x
    if (y < y0) y0 = y
    if (y > y1) y1 = y
  }
  if (n === 0) return { pass: false, ratio: 0, frameEnergy: 0, approvedEnergy: 0, sharpPixels: 0, region: null, note: 'the frame has no sharp zone' }
  const aspect = (x1 - x0 + 1) / (y1 - y0 + 1)
  const width = Math.min(W - 2, Math.max(8, Math.round(Math.sqrt(n * aspect))))
  const height = Math.min(H - 2, Math.max(8, Math.round(n / width)))
  const integral = new Float64Array((W + 1) * (H + 1))
  for (let y = 0; y < H; y++) {
    let row = 0
    for (let x = 0; x < W; x++) {
      row += approvedLap[y * W + x]
      integral[(y + 1) * (W + 1) + x + 1] = integral[y * (W + 1) + x + 1] + row
    }
  }
  const step = 4
  let best = -1
  let region = { left: 1, top: 1, width, height }
  for (let top = 1; top + height <= H - 1; top += step) for (let left = 1; left + width <= W - 1; left += step) {
    const s = integral[(top + height) * (W + 1) + left + width] - integral[top * (W + 1) + left + width] - integral[(top + height) * (W + 1) + left] + integral[top * (W + 1) + left]
    if (s > best) {
      best = s
      region = { left, top, width, height }
    }
  }
  const frameEnergy = sum / n
  const approvedEnergy = best / (width * height)
  const ratio = approvedEnergy > 0 ? frameEnergy / approvedEnergy : 0
  return { pass: ratio >= config.detail.minSharpnessRatio, ratio, frameEnergy, approvedEnergy, sharpPixels: n, region }
}

async function withView<T>(session: Session, view: string, work: () => Promise<T>): Promise<T> {
  await session.page.evaluate((v) => window.showcase.setDiagnostic(v), view)
  try {
    return await work()
  } finally {
    await session.page.evaluate(() => window.showcase.setDiagnostic('beauty'))
  }
}

export async function measureUnit(unit: string, tier: string): Promise<string> {
  segmentById(unit)
  const judged = judgedFrames().filter((j) => j.unit === unit)
  const file = ensureDir(path.join(WORK, 'measures', `${unit}.json`))
  const session = await openSession({ format: master.id, assets: 'full', diag: 'beauty', what: 'measure' })
  const frames: MeasuredFrame[] = []
  try {
    const stills = await renderChecked(judged.map((j) => ({ frame: j.frame, tier, format: master.id, assets: 'full' })), { session })
    for (let i = 0; i < judged.length; i++) {
      const j = judged[i]
      const m1 = m1Of(stills[i].check)
      const texels = await withView(session, 'texels', async () => {
        await session.time(j.frame, 'draft')
        return session.page.evaluate((f) => window.showcase.texels(f), j.frame)
      })
      const m2: M2Result = { ...texels, pass: texels.softShare <= config.detail.maxSoftPixelFraction }
      if (texels.textured === 0) {
        m2.pass = true
        m2.note = 'no textured surface in the sharp zone'
      }
      let m3: M3Result | null = null
      const key = keys.find((k) => k.frame === j.frame)
      if (key) {
        const focus = await withView(session, 'focus', async () => (await session.render(j.frame, 'draft')).png)
        m3 = m3Of(laplacian(await luma(stills[i].file)), laplacian(await luma(at(key.image))), await sharpZone(focus))
      }
      frames.push({ frame: j.frame, key: j.key, why: j.why, m1, m2, m3 })
      const name = `frame ${j.frame}${j.key ? ` (key ${j.key})` : ''}`
      console.log(`M1 · ${name} · ${m1.pass ? 'pass' : `fail · ${m1.reasons.join('; ')}`}`)
      console.log(`M2 · ${name} · ${m2.pass ? 'pass' : 'fail'} · ${m2.note ?? `${(m2.softShare * 100).toFixed(2)} % of ${m2.textured} textured pixels in the sharp zone are under ${config.detail.minTexelsPerPixel} texels per pixel (allowed ${(config.detail.maxSoftPixelFraction * 100).toFixed(2)} %)`}`)
      if (m3) console.log(`M3 · ${name} · ${m3.pass ? 'pass' : 'fail'} · ${m3.note ?? `sharpness ratio ${m3.ratio.toFixed(3)} against the approved image (needs ${config.detail.minSharpnessRatio}), over ${m3.sharpPixels} sharp pixels`}`)
    }
    const all = (pick: (f: MeasuredFrame) => boolean): boolean => frames.every(pick)
    const result = {
      unit,
      tier,
      format: master.id,
      assets: 'full',
      thresholds: config.detail,
      pass: { m1: all((f) => f.m1.pass), m2: all((f) => f.m2.pass), m3: all((f) => f.m3 === null || f.m3.pass) },
      frames,
    }
    fs.writeFileSync(file, JSON.stringify(result, null, 2) + '\n')
    writeRecord(file, { ...recordBase(session, await session.info(), 'measure', 'beauty'), tier, frames: judged.map((j) => j.frame), unit })
    console.log(`measure · unit ${unit} · M1 ${result.pass.m1 ? 'pass' : 'fail'} · M2 ${result.pass.m2 ? 'pass' : 'fail'} · M3 ${result.pass.m3 ? 'pass' : 'fail'} · ${rel(file)}`)
  } finally {
    await session.close()
  }
  return file
}

if (isMain(import.meta.url)) {
  const args = parseArgs()
  const tier = str(args, 'tier', 'final')
  if (!isTier(tier)) throw new Error(`unknown tier "${tier}"`)
  try {
    await measureUnit(str(args, 'unit'), tier)
  } catch (error) {
    console.log(`measure · could not finish: ${String(error)}`)
  }
  process.exit(0)
}
