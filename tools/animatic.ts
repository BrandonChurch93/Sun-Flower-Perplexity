import { spawn, spawnSync } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import sharp, { type OverlayOptions } from 'sharp'
import { config, frameCount, timeOf } from '../src/config.ts'
import { rigPathAt } from '../src/director/rig.ts'
import { cuts, keys, segmentAt, segments, type TimedKey } from '../src/director/timeline.ts'
import { flag, parseArgs } from './lib/args.ts'
import { addLook } from './lib/looks.ts'
import { at, WORK } from './lib/paths.ts'

const PUSH_RANGE = 1.1
const LABEL_MARGIN = 14

const args = parseArgs()
const { width: W, height: H } = config.formats.preview
const fps = config.film.fps
const outFile = at('out', 'roughcut.mp4')
const workDir = path.join(WORK, 'roughcut')
fs.mkdirSync(workDir, { recursive: true })
fs.mkdirSync(path.dirname(outFile), { recursive: true })

const magnification = (time: number): number => {
  const rig = rigPathAt(time)
  return rig.focalMm / rig.distanceM
}

interface Layer { key: TimedKey; from: number; to: number; gamma: number; least: number; most: number; anchorX: number; pixels: Uint8Array; sw: number; sh: number }

const rawScale = (layer: Pick<Layer, 'key'>, time: number): number => magnification(time) / magnification(layer.key.time)

async function layerFor(key: TimedKey, from: number, to: number): Promise<Layer> {
  let lo = Infinity
  let hi = 0
  for (let f = Math.round(from * fps); f <= Math.round(to * fps); f++) {
    const r = rawScale({ key }, f / fps)
    lo = Math.min(lo, r)
    hi = Math.max(hi, r)
  }
  const gamma = Math.min(1, Math.log(PUSH_RANGE) / Math.max(1e-9, Math.log(hi / lo)))
  const least = Math.pow(lo, gamma)
  const most = Math.pow(hi, gamma) / least
  const sw = Math.ceil(W * most)
  const sh = Math.ceil(H * most)
  const pixels = await sharp(at(key.image)).resize(sw, sh, { fit: 'cover', kernel: 'lanczos3' }).removeAlpha().raw().toBuffer()
  return { key, from, to, gamma, least, most, anchorX: rigPathAt(key.time).frameX, pixels: new Uint8Array(pixels.buffer, pixels.byteOffset, pixels.length), sw, sh }
}

const scaleOf = (layer: Layer, time: number): number => Math.pow(rawScale(layer, time), layer.gamma) / layer.least

const colX0 = new Int32Array(W)
const colX1 = new Int32Array(W)
const colF = new Float32Array(W)

function draw(layer: Layer, time: number, weight: number, acc: Float32Array): void {
  const s = scaleOf(layer, time)
  const { sw, sh, pixels, anchorX } = layer
  for (let x = 0; x < W; x++) {
    const u = anchorX + ((x + 0.5) / W - anchorX) / s
    const xs = Math.min(sw - 1, Math.max(0, u * sw - 0.5))
    const x0 = Math.floor(xs)
    colX0[x] = x0 * 3
    colX1[x] = Math.min(sw - 1, x0 + 1) * 3
    colF[x] = xs - x0
  }
  for (let y = 0; y < H; y++) {
    const v = 0.5 + ((y + 0.5) / H - 0.5) / s
    const ys = Math.min(sh - 1, Math.max(0, v * sh - 0.5))
    const y0 = Math.floor(ys)
    const fy = ys - y0
    const r0 = y0 * sw * 3
    const r1 = Math.min(sh - 1, y0 + 1) * sw * 3
    let o = y * W * 3
    for (let x = 0; x < W; x++) {
      const a = colX0[x]
      const b = colX1[x]
      const fx = colF[x]
      for (let c = 0; c < 3; c++) {
        const top = pixels[r0 + a + c] + (pixels[r0 + b + c] - pixels[r0 + a + c]) * fx
        const bottom = pixels[r1 + a + c] + (pixels[r1 + b + c] - pixels[r1 + a + c]) * fx
        acc[o++] += (top + (bottom - top) * fy) * weight
      }
    }
  }
}

interface Label { w: number; h: number; rgba: Uint8Array }
async function labelFor(text: string): Promise<Label> {
  const size = 15
  const w = Math.round(22 + text.length * size * 0.62)
  const h = 28
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="${w}" height="${h}" rx="6" fill="#14130f" fill-opacity="0.66"/><text x="${w / 2}" y="${h / 2 + size * 0.36}" text-anchor="middle" font-family="DejaVu Sans, Liberation Sans, Arial, sans-serif" font-size="${size}" letter-spacing="0.6" fill="#ece7db">${text}</text></svg>`
  const { data, info } = await sharp(Buffer.from(svg)).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  return { w: info.width, h: info.height, rgba: new Uint8Array(data.buffer, data.byteOffset, data.length) }
}

function stamp(label: Label, frame: Uint8Array): void {
  const x0 = LABEL_MARGIN
  const y0 = H - LABEL_MARGIN - label.h
  for (let y = 0; y < label.h; y++) {
    for (let x = 0; x < label.w; x++) {
      const i = (y * label.w + x) * 4
      const a = label.rgba[i + 3] / 255
      if (a === 0) continue
      const o = ((y0 + y) * W + x0 + x) * 3
      for (let c = 0; c < 3; c++) frame[o + c] = Math.round(frame[o + c] * (1 - a) + label.rgba[i + c] * a)
    }
  }
}

const smooth = (x: number): number => {
  const t = Math.min(1, Math.max(0, x))
  return t * t * (3 - 2 * t)
}

interface Plan { id: string; label: Label; layers: Layer[] }
const plans = new Map<string, Plan>()
for (const s of segments) {
  const own = keys.filter((k) => k.unit === s.id).sort((a, b) => a.time - b.time)
  if (own.length === 0) throw new Error(`segment ${s.id} has no key, so the rough cut has no picture for it`)
  if (own.length > 2) throw new Error(`segment ${s.id} has ${own.length} keys. The rough cut handles one or two`)
  const layers = own.length === 1 ? [await layerFor(own[0], s.start, s.end)] : [await layerFor(own[0], s.start, own[1].time), await layerFor(own[1], own[0].time, s.end)]
  plans.set(s.id, { id: s.id, label: await labelFor(s.id), layers })
}

const acc = new Float32Array(W * H * 3)
function frameAt(index: number): Uint8Array {
  const time = timeOf(index)
  const plan = plans.get(segmentAt(index).id)!
  acc.fill(0)
  if (plan.layers.length === 1) draw(plan.layers[0], time, 1, acc)
  else {
    const [a, b] = plan.layers
    const mix = smooth((time - a.key.time) / (b.key.time - a.key.time))
    if (mix < 1) draw(a, time, 1 - mix, acc)
    if (mix > 0) draw(b, time, mix, acc)
  }
  const out = new Uint8Array(W * H * 3)
  for (let i = 0; i < out.length; i++) out[i] = acc[i] + 0.5
  stamp(plan.label, out)
  return out
}

const tmp = path.join(workDir, 'roughcut.tmp.mp4')
const ff = spawn(
  'ffmpeg',
  [
    '-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', `${W}x${H}`, '-framerate', String(fps), '-i', 'pipe:0',
    '-frames:v', String(frameCount), '-vf', 'scale=in_range=pc:out_range=tv:out_color_matrix=bt709,format=yuv420p',
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '17', '-maxrate', `${config.previewFilm.bitrateMbps}M`, '-bufsize', `${config.previewFilm.bitrateMbps * 2}M`,
    '-g', String(fps), '-force_key_frames', cuts.map((c) => c.time).join(','), '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv',
    '-movflags', '+faststart', '-an', tmp,
  ],
  { stdio: ['pipe', 'inherit', 'inherit'] },
)
const done = new Promise<number>((resolve) => ff.on('close', (code) => resolve(code ?? 1)))
const started = process.hrtime.bigint()
for (let f = 0; f < frameCount; f++) {
  const frame = frameAt(f)
  if (!ff.stdin.write(frame)) await new Promise<void>((resolve) => ff.stdin.once('drain', () => resolve()))
  if (f % 300 === 299) console.log(`rough cut: frame ${f + 1} of ${frameCount}`)
}
ff.stdin.end()
const code = await done
if (code !== 0) throw new Error(`ffmpeg ended with code ${code}`)
fs.renameSync(tmp, outFile)

const probe = spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-count_frames', '-show_entries', 'stream=width,height,nb_read_frames,r_frame_rate', '-of', 'json', outFile], { encoding: 'utf8' })
const stream = (JSON.parse(probe.stdout) as { streams: { width: number; height: number; nb_read_frames: string; r_frame_rate: string }[] }).streams[0]
const sha = (file: string) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')
const record = {
  kind: 'roughcut',
  at: new Date().toISOString(),
  frames: Number(stream.nb_read_frames),
  width: stream.width,
  height: stream.height,
  fps: stream.r_frame_rate,
  megabytes: Number((fs.statSync(outFile).size / 1048576).toFixed(2)),
  segments: segments.map((s) => ({ id: s.id, firstFrame: s.firstFrame, lastFrame: s.lastFrame })),
  cuts: cuts.map((c) => c.frame),
  layers: [...plans.values()].flatMap((p) => p.layers.map((l) => ({ segment: p.id, key: l.key.id, image: l.key.image, sha256: sha(at(l.key.image)), fromSeconds: l.from, toSeconds: l.to, push: Number(l.most.toFixed(4)), direction: scaleOf(l, l.to) > scaleOf(l, l.from) ? 'in' : 'out' }))),
}
fs.writeFileSync(`${outFile}.json`, JSON.stringify(record, null, 2) + '\n')
const seconds = Number(process.hrtime.bigint() - started) / 1e9
console.log(`rough cut: ${record.frames} frames at ${record.width} x ${record.height}, ${record.fps} fps, ${record.megabytes} MB, made in ${seconds.toFixed(0)} s`)

if (!flag(args, 'no-check')) {
  const picks: { frame: number; label: string }[] = []
  for (const s of segments) {
    const own = keys.filter((k) => k.unit === s.id)
    const mid = own.length === 1 ? own[0].frame : Math.round((s.firstFrame + s.lastFrame) / 2)
    picks.push({ frame: mid, label: `${s.id}, frame ${mid}` })
  }
  for (const c of cuts) {
    picks.push({ frame: c.frame - 1, label: `last frame before cut ${c.index} (${c.frame - 1})` })
    picks.push({ frame: c.frame, label: `first frame after cut ${c.index} (${c.frame})` })
  }
  picks.push({ frame: 0, label: 'frame 0' }, { frame: frameCount - 1, label: `frame ${frameCount - 1}` })
  picks.sort((a, b) => a.frame - b.frame)
  for (const name of fs.readdirSync(workDir).filter((n) => /^check-\d+\.png$/.test(n))) fs.rmSync(path.join(workDir, name))
  const select = picks.map((p) => `eq(n\\,${p.frame})`).join('+')
  const ex = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', outFile, '-vf', `select='${select}'`, '-fps_mode', 'passthrough', path.join(workDir, 'check-%02d.png')], { encoding: 'utf8' })
  if (ex.status !== 0) throw new Error(`could not read the check frames back: ${ex.stderr}`)
  const files = fs.readdirSync(workDir).filter((n) => /^check-\d+\.png$/.test(n)).sort()
  if (files.length !== picks.length) throw new Error(`asked for ${picks.length} check frames, got ${files.length}`)
  const cols = 4
  const tw = 480
  const th = Math.round((tw * H) / W)
  const pad = 8
  const cap = 22
  const rows = Math.ceil(picks.length / cols)
  const sheetW = cols * tw + (cols + 1) * pad
  const sheetH = rows * (th + cap) + (rows + 1) * pad
  const parts: OverlayOptions[] = []
  for (let i = 0; i < picks.length; i++) {
    const x = pad + (i % cols) * (tw + pad)
    const y = pad + Math.floor(i / cols) * (th + cap + pad)
    const named = path.join(workDir, `frame-${String(picks[i].frame).padStart(4, '0')}.png`)
    fs.renameSync(path.join(workDir, files[i]), named)
    parts.push({ input: await sharp(named).resize(tw, th).toBuffer(), left: x, top: y })
    const text = `<svg xmlns="http://www.w3.org/2000/svg" width="${tw}" height="${cap}"><text x="2" y="16" font-family="DejaVu Sans, Liberation Sans, Arial, sans-serif" font-size="13" fill="#d8d2c4">${picks[i].label}</text></svg>`
    parts.push({ input: Buffer.from(text), left: x, top: y + th })
  }
  const sheet = path.join(workDir, 'check-sheet.jpg')
  await sharp({ create: { width: sheetW, height: sheetH, channels: 3, background: '#191813' } }).composite(parts).jpeg({ quality: 88 }).toFile(sheet)
  addLook(sheet, 'Rough cut check: one frame from every segment and the frame each side of every cut', 'animatic')
  const two = [keys.find((k) => k.id === 'rain'), keys.find((k) => k.id === 'bloom-hero')].filter((k): k is TimedKey => !!k)
  for (const k of two) {
    const file = path.join(workDir, `show-${k.id}.png`)
    spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', outFile, '-vf', `select='eq(n\\,${k.frame})'`, '-frames:v', '1', file])
    if (fs.existsSync(file)) addLook(file, `Rough cut, frame ${k.frame} (${k.time} s, ${k.unit}). Made from the approved still`, 'animatic')
  }
  console.log(`check frames and sheet: ${path.relative(at(), workDir)}`)
}
