import fs from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'
import type { Args } from '../lib/args.ts'
import { num } from '../lib/args.ts'
import { canvas, scaled, strip, type Placed } from '../lib/layout.ts'
import { barText, filmClock, FLASH_STEP, FRAMES, lightningFrames, secondsOf } from './lib/film.ts'
import { frameFile, playDir, readLines, readStamp, runName } from './lib/play.ts'
import { finish, OUT, type Finding } from './lib/report.ts'

const SENTENCE = "It goes from day to night in the sky repeatedly while it's actually growing, no more hard cuts."

// A step is how far the picture moves from one frame to the next, 0 to 255: the mean absolute difference of luminance, and the same of a copy blurred to 40 x 23.
// A hard cut changes the whole picture at once, so it shows in the blurred copy, and it stands alone: the steps on either side of it are small.
const BLUR_W = 40
const BLUR_H = 23
// A step is a hard cut when the blurred picture moves by more than CUT_STEP and by more than CUT_RATIO times what its neighbours move.
const CUT_STEP = 2.5
const CUT_RATIO = 4
const NEAR = 6

interface Small { luma: Float32Array; blur: Float32Array }
export interface Step { frame: number; full: number; blur: number; neighbours: number; ratio: number; lightning: boolean; cut: boolean }

async function small(file: string): Promise<Small> {
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

function mad(a: Float32Array, b: Float32Array): number {
  let sum = 0
  for (let i = 0; i < a.length; i++) sum += Math.abs(a[i] - b[i])
  return sum / a.length
}

function median(values: number[]): number {
  if (values.length === 0) return 0
  const v = [...values].sort((x, y) => x - y)
  return v.length % 2 ? v[(v.length - 1) / 2] : 0.5 * (v[v.length / 2 - 1] + v[v.length / 2])
}

async function stripOf(run: string, frame: number, every: number, file: string, label: string): Promise<void> {
  const w = 320
  const h = 180
  const gap = 6
  const bar = 20
  const frames = [-3, -2, -1, 0, 1, 2].map((d) => frame + d * every).filter((f) => f >= 0 && f < FRAMES && fs.existsSync(frameFile(run, f)))
  const parts: Placed[] = [{ input: strip(frames.length * (w + gap) - gap, bar + 2, label), left: gap, top: gap }]
  for (let i = 0; i < frames.length; i++) {
    const left = gap + i * (w + gap)
    parts.push({ input: await scaled(frameFile(run, frames[i]), w, h), left, top: bar + 2 + 2 * gap })
    parts.push({ input: strip(w, bar, `frame ${frames[i]} · ${secondsOf(frames[i]).toFixed(3)} s${frames[i] === frame ? ' · the step lands here' : ''}`), left, top: bar + 2 + 2 * gap + h })
  }
  await canvas(frames.length * (w + gap) + gap, 2 * bar + 2 + h + 3 * gap, parts).jpeg({ quality: 90 }).toFile(file)
}

export async function run(args: Args): Promise<void> {
  const broken = typeof args.break === 'string' ? args.break : null
  const run = runName(broken)
  const from = Math.max(0, num(args, 'from', 0))
  const to = Math.min(FRAMES - 1, num(args, 'to', FRAMES - 1))
  const every = Math.max(1, num(args, 'every', 1))
  const have = readLines(run)
  const stamp = readStamp(run)
  const flashes = new Set<number>()
  for (const f of lightningFrames()) flashes.add(Math.ceil(f / every) * every)
  const cache = path.join(playDir(run), 'steps.json')
  const known: Record<string, { full: number; blur: number }> = fs.existsSync(cache) ? JSON.parse(fs.readFileSync(cache, 'utf8')) : {}
  const raw = new Map<number, { full: number; blur: number }>()
  let before: Small | null = null
  let beforeFrame = -2
  for (let f = Math.max(every, from + ((every - (from % every)) % every)); f <= to; f += every) {
    if (!have.has(f) || !have.has(f - every)) continue
    const key = `${f}:${have.get(f)?.session}:${have.get(f - every)?.session}:${every}`
    if (known[key]) {
      raw.set(f, known[key])
      continue
    }
    if (beforeFrame !== f - every) before = await small(frameFile(run, f - every))
    const now = await small(frameFile(run, f))
    const step = { full: mad((before as Small).luma, now.luma), blur: mad((before as Small).blur, now.blur) }
    known[key] = step
    raw.set(f, step)
    before = now
    beforeFrame = f
  }
  if (raw.size) fs.writeFileSync(cache, JSON.stringify(known))

  const steps: Step[] = []
  for (const [frame, s] of raw) {
    const near: number[] = []
    for (let d = -NEAR; d <= NEAR; d++) {
      const other = raw.get(frame + d * every)
      // A stroke of lightning is two jumps a few frames apart and its fall: none of them may hide a cut beside them, nor be hidden.
      if (d !== 0 && other && !flashes.has(frame + d * every)) near.push(other.blur)
    }
    const neighbours = median(near)
    const ratio = s.blur / Math.max(neighbours, 0.05)
    const lightning = flashes.has(frame)
    steps.push({ frame, full: s.full, blur: s.blur, neighbours, ratio, lightning, cut: !lightning && s.blur > CUT_STEP && ratio > CUT_RATIO })
  }
  steps.sort((a, b) => a.frame - b.frame)

  const findings: Finding[] = []
  const wanted = Math.floor(to / every) - Math.ceil(Math.max(1, from) / every) + 1
  const complete = steps.length === wanted
  const cuts = steps.filter((s) => s.cut)
  const largest = [...steps].sort((a, b) => b.blur - a.blur).slice(0, 10)
  const dir = path.join(OUT, 'cuts', every > 1 ? `${run}-every-${every}` : run)
  fs.rmSync(dir, { recursive: true, force: true })
  fs.mkdirSync(dir, { recursive: true })
  const pictures: { file: string; caption: string }[] = []
  const shown = new Set<number>()
  for (const s of [...cuts.slice(0, 12), ...largest]) {
    if (shown.has(s.frame)) continue
    shown.add(s.frame)
    const what = s.cut ? 'HARD CUT' : s.lightning ? 'lightning, meant' : 'no cut'
    const caption = `${what}: into frame ${s.frame} (${secondsOf(s.frame).toFixed(3)} s, ${barText(secondsOf(s.frame))}) the blurred picture moves ${s.blur.toFixed(2)} of 255, ${s.ratio.toFixed(1)} times its neighbours`
    const file = path.join(dir, `step-${String(s.frame).padStart(5, '0')}.jpg`)
    await stripOf(run, s.frame, every, file, caption)
    pictures.push({ file, caption })
  }

  if (steps.length === 0) findings.push({ ok: false, what: `no two neighbouring frames of "${run}" have been drawn yet: run "npm run checks -- play" first` })
  else {
    findings.push({ ok: cuts.length === 0, what: cuts.length === 0 ? `${steps.length} of ${wanted} steps from one frame to the ${every > 1 ? `one ${every} frames on` : 'next'} measured (${stamp?.width} x ${stamp?.height}, sky ${stamp?.sky}): no hard cut. A hard cut is a step of the blurred picture over ${CUT_STEP} of 255 that is over ${CUT_RATIO} times the median of the ${2 * NEAR} steps round it` : `${cuts.length} hard cut${cuts.length > 1 ? 's' : ''}: ${cuts.slice(0, 12).map((s) => `into frame ${s.frame} (${secondsOf(s.frame).toFixed(3)} s, ${barText(secondsOf(s.frame))}): ${s.blur.toFixed(2)} of 255, ${s.ratio.toFixed(1)} times its neighbours`).join('; ')}` })
    const all = steps.map((s) => s.blur)
    findings.push({ ok: true, what: `the blurred picture moves ${median(all).toFixed(3)} of 255 a frame at the median and ${Math.max(...all).toFixed(2)} at the most; the largest ratio to its neighbours outside the lightning is ${Math.max(...steps.filter((s) => !s.lightning).map((s) => s.ratio)).toFixed(1)}` })
    // Lightning is meant to jump. Where the dial jumps and the picture does not, the lightning does not show.
    for (const f of [...flashes].sort((a, b) => a - b)) {
      const s = steps.find((x) => x.frame === f)
      if (!s) continue
      let rising = false
      for (let g = f - every + 1; g <= f; g++) if (g > 0 && filmClock.at(secondsOf(g)).flash - filmClock.at(secondsOf(g - 1)).flash > FLASH_STEP) rising = true
      if (!rising) continue
      const seen = s.blur > 1 && s.ratio > 2
      findings.push({ ok: true, expected: true, what: `lightning at frame ${f} (${barText(secondsOf(f))}), a jump that is meant: the blurred picture moves ${s.blur.toFixed(2)} of 255, ${s.ratio.toFixed(1)} times its neighbours${seen ? '' : '. That is no jump at all: the lightning does not show in the picture yet'}` })
    }
  }
  if (!complete && steps.length > 0) findings.push({ ok: true, expected: true, what: `${wanted - steps.length} steps of frames ${from} to ${to} are not measured yet, because their frames are not drawn` })
  finish({
    check: 'cuts',
    sentence: SENTENCE,
    subject: (broken ? `a film whose camera jumps at one frame (${run})` : 'the film') + (every > 1 ? `, every ${every}th frame` : ''),
    name: every > 1 ? `cuts.every-${every}` : undefined,
    broken,
    complete,
    findings,
    table: { head: ['into frame', 'second', 'bar', 'luminance step', 'blurred step', 'neighbours', 'ratio', 'what'], rows: largest.map((s) => [s.frame, secondsOf(s.frame).toFixed(3), barText(secondsOf(s.frame)).slice(4), s.full.toFixed(3), s.blur.toFixed(3), s.neighbours.toFixed(3), s.ratio.toFixed(1), s.cut ? 'HARD CUT' : s.lightning ? 'lightning, meant' : 'no cut']) },
    pictures,
    data: { run, stamp, from, to, every, thresholds: { step: CUT_STEP, ratio: CUT_RATIO, near: NEAR }, steps: steps.map((s) => [s.frame, Number(s.full.toFixed(4)), Number(s.blur.toFixed(4)), Number(s.ratio.toFixed(2)), s.cut ? 1 : 0, s.lightning ? 1 : 0]) },
  })
}
