import fs from 'node:fs'
import path from 'node:path'
import type { Args } from '../lib/args.ts'
import { num } from '../lib/args.ts'
import { canvas, scaled, strip, type Placed } from '../lib/layout.ts'
import { barText, filmClock, FLASH_STEP, FRAMES, lightningFrames, secondsOf } from './lib/film.ts'
import { meantCuts, sameCuts } from './lib/meant.ts'
import { frameFile, olderFilm, playDir, readLines, readStamp, runName } from './lib/play.ts'
import { finish, OUT, type Finding } from './lib/report.ts'
import { mad, moved, small, type Small } from './lib/steps.ts'
import { ranker } from './lib/stride.ts'

const SENTENCE = "It goes from day to night in the sky repeatedly while it's actually growing, no more hard cuts."

// A hard cut puts other edges where the picture's edges were. Brightness alone does not say so: a sun that passes behind a leaf takes its glare off the whole frame and cuts nothing.
// So the check reads where the edges lie (lib/steps.ts), in the upper half of the frame and in the lower half apart, and how far they moved since the frame before: 0 is not at all, 1 is nothing in common.
// A step is a hard cut when the edges of either half move by more than CUT_MOVE and by more than CUT_RATIO times what they move in the steps round it.
// A half with no edges to speak of (a clear night sky) has no say. How far the brightness moves is listed beside it and judges nothing here: `nights` holds the dusks and dawns to their step.
// A cut the film means is left out by its frame alone. --meant 1000 puts another list in place of the Builder's for one run, to show that the frame beside a listed one is still a hard cut:
//   npm run checks -- cuts --break cut --meant 1000    the broken film's cut at frame 1000 is listed: left out, and said so
//   npm run checks -- cuts --break cut --meant 1001    listed one frame late: must fail
const CUT_MOVE = 0.5
const CUT_RATIO = 4
const NEAR = 6
const EDGES = 2
const QUIET = 0.02

interface Raw { full: number; blur: number; sky: number; skyStrength: number; land: number; landStrength: number }
export interface Step extends Raw { frame: number; neighbours: number; ratio: number; move: number; half: 'sky' | 'land'; round: number; times: number; lightning: boolean; meant: boolean; cut: boolean }

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
  // A cut the film means is listed by the Builder (limits.json). Exactly its frame is left out, and said so; it has no say on the steps round it either.
  const meant = new Set<number>()
  for (const f of typeof args.meant === 'string' || typeof args.meant === 'number' ? String(args.meant).split(',').map(Number) : meantCuts()) meant.add(Math.ceil(f / every) * every)
  const cache = path.join(playDir(run), 'moves.json')
  const known: Record<string, Raw> = fs.existsSync(cache) ? JSON.parse(fs.readFileSync(cache, 'utf8')) : {}
  const raw = new Map<number, Raw>()
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
    const was = before as Small
    const sky = moved(was.sky, now.sky)
    const land = moved(was.land, now.land)
    const step: Raw = { full: mad(was.luma, now.luma), blur: mad(was.blur, now.blur), sky: sky.step, skyStrength: sky.strength, land: land.step, landStrength: land.strength }
    known[key] = step
    raw.set(f, step)
    before = now
    beforeFrame = f
  }
  if (raw.size) fs.writeFileSync(cache, JSON.stringify(known))

  const steps: Step[] = []
  for (const [frame, s] of raw) {
    const near: Raw[] = []
    for (let d = -NEAR; d <= NEAR; d++) {
      const other = raw.get(frame + d * every)
      // A stroke of lightning is two jumps a few frames apart and its fall: none of them may hide a cut beside them, nor be hidden.
      if (d !== 0 && other && !flashes.has(frame + d * every) && !meant.has(frame + d * every)) near.push(other)
    }
    // A step with too few measured steps round it cannot be told from its neighbours yet: it waits for their frames.
    if (near.length < NEAR) continue
    const neighbours = median(near.map((n) => n.blur))
    const ratio = s.blur / Math.max(neighbours, 0.05)
    const lightning = flashes.has(frame)
    const halves = (['sky', 'land'] as const).map((half) => {
      const move = s[`${half}Strength`] >= EDGES ? s[half] : 0
      const round = median(near.map((n) => (n[`${half}Strength`] >= EDGES ? n[half] : 0)))
      return { half, move, round, times: move / Math.max(round, QUIET) }
    })
    const worst = halves.some((h) => h.move > CUT_MOVE && h.times > CUT_RATIO) ? halves.filter((h) => h.move > CUT_MOVE && h.times > CUT_RATIO).sort((a, b) => b.move - a.move)[0] : [...halves].sort((a, b) => b.move - a.move)[0]
    steps.push({ frame, ...s, neighbours, ratio, ...worst, lightning, meant: meant.has(frame), cut: !lightning && !meant.has(frame) && worst.move > CUT_MOVE && worst.times > CUT_RATIO })
  }
  steps.sort((a, b) => a.frame - b.frame)

  // Seen every few frames only, a fast dusk looks like a cut. Such a place is a suspect, and the frames between decide.
  const CUT = every > 1 ? 'SUSPECT' : 'HARD CUT'
  const findings: Finding[] = []
  // In a review round only the frames of the stride are drawn: the steps to judge one by one are those between two of them that follow each other.
  const stride = num(args, 'stride', 0)
  const round = stride > 0 && every === 1 ? ranker(stride) : null
  let wanted = Math.floor(to / every) - Math.ceil(Math.max(1, from) / every) + 1
  if (round) {
    wanted = 0
    for (let f = Math.max(1, from); f <= to; f++) if (round(f) < 3 && round(f - 1) < 3) wanted++
  }
  const older = olderFilm(run)
  const complete = steps.length >= wanted && !older
  const cuts = steps.filter((s) => s.cut)
  const largest = [...steps].sort((a, b) => b.move - a.move).slice(0, 10)
  const brightest = [...steps].sort((a, b) => b.blur - a.blur).slice(0, 4)
  const dir = path.join(OUT, 'cuts', every > 1 ? `${run}-every-${every}` : run)
  fs.rmSync(dir, { recursive: true, force: true })
  fs.mkdirSync(dir, { recursive: true })
  const pictures: { file: string; caption: string }[] = []
  const shown = new Set<number>()
  for (const s of [...cuts.slice(0, 12), ...steps.filter((x) => x.meant), ...largest.slice(0, 6), ...brightest]) {
    if (shown.has(s.frame)) continue
    shown.add(s.frame)
    const what = s.cut ? CUT : s.meant ? 'a cut the film means, listed and left out' : s.lightning ? 'lightning, meant' : 'no cut'
    const caption = `${what}: into frame ${s.frame} (${secondsOf(s.frame).toFixed(3)} s, ${barText(secondsOf(s.frame))}) the edges of the ${s.half} half move ${s.move.toFixed(2)} of 1, ${s.times.toFixed(1)} times the steps round it; the brightness moves ${s.blur.toFixed(1)} of 255`
    const file = path.join(dir, `step-${String(s.frame).padStart(5, '0')}.jpg`)
    await stripOf(run, s.frame, every, file, caption)
    pictures.push({ file, caption })
  }

  if (steps.length === 0) findings.push({ ok: false, what: `no two neighbouring frames of "${run}" have been drawn yet: run "npm run checks -- play" first` })
  else {
    findings.push({ ok: cuts.length === 0, what: cuts.length === 0 ? `${steps.length} of ${wanted} steps from one frame to the ${every > 1 ? `one ${every} frames on` : 'next'} measured (${stamp?.width} x ${stamp?.height}, sky ${stamp?.sky}): no hard cut. A hard cut is a step in which the edges of the upper or the lower half of the frame move more than ${CUT_MOVE} of 1 and more than ${CUT_RATIO} times the median of the ${2 * NEAR} steps round it` : `${cuts.length} ${every > 1 ? `place${cuts.length > 1 ? 's' : ''} where the picture moves far more than round it, seen every ${every}th frame. Draw the frames between and run cuts without --every to tell a fast dusk from a cut` : `hard cut${cuts.length > 1 ? 's' : ''} (a cut, or a pop of one frame that moves the edges as far)`}: ${cuts.slice(0, 12).map((s) => `into frame ${s.frame} (${secondsOf(s.frame).toFixed(3)} s, ${barText(secondsOf(s.frame))}): the edges of the ${s.half} half move ${s.move.toFixed(2)} of 1, ${s.times.toFixed(1)} times the steps round it`).join('; ')}` })
    if (args.meant === undefined && !broken && every === 1) findings.push(sameCuts())
    for (const f of [...meant].sort((a, b) => a - b)) {
      const s = steps.find((x) => x.frame === f)
      if (!s) findings.push({ ok: true, expected: true, what: `left out: frame ${f} (${barText(secondsOf(f))}) is listed as a cut the film means (tools/checks/limits.json); the step into it is not measured yet` })
      else {
        const cutsThere = s.move > CUT_MOVE && s.times > CUT_RATIO
        findings.push({ ok: cutsThere, expected: cutsThere, what: `left out: the step into frame ${f} (${barText(secondsOf(f))}) is a cut the film means (tools/checks/limits.json) and is not judged: the edges of the ${s.half} half move ${s.move.toFixed(2)} of 1, ${s.times.toFixed(1)} times the steps round it${cutsThere ? '' : '. By the rule that is no cut: the film does not cut where the list says it does'}` })
      }
    }
    const calm = steps.filter((s) => !s.lightning && !s.meant)
    const most = [...calm].sort((a, b) => b.move - a.move)[0]
    if (most) findings.push({ ok: true, what: `outside the lightning the edges move ${median(calm.map((s) => s.move)).toFixed(3)} of 1 a frame at the median and ${most.move.toFixed(2)} at the most (the ${most.half} half into frame ${most.frame}, ${most.times.toFixed(1)} times the steps round it)` })
    const bright = [...calm].sort((a, b) => b.blur - a.blur)[0]
    if (bright) findings.push({ ok: true, expected: true, what: `listed, not judged here: the brightness of the blurred picture moves ${median(steps.map((s) => s.blur)).toFixed(2)} of 255 a frame at the median and ${bright.blur.toFixed(1)} at the most outside the lightning (into frame ${bright.frame}, ${barText(secondsOf(bright.frame))}, where the edges move ${bright.move.toFixed(2)}). A light that comes or goes without moving an edge is not a cut` })
    // Lightning is meant to jump. Where the dial jumps and the picture does not, the lightning does not show.
    // Seen every few frames only, a flash can fall between two frames: whether the lightning shows is said from every frame alone.
    for (const f of every > 1 ? [] : [...flashes].sort((a, b) => a - b)) {
      const s = steps.find((x) => x.frame === f)
      if (!s) continue
      let rising = false
      for (let g = f - every + 1; g <= f; g++) if (g > 0 && filmClock.at(secondsOf(g)).flash - filmClock.at(secondsOf(g - 1)).flash > FLASH_STEP) rising = true
      if (!rising) continue
      const seen = s.blur > 1 && s.ratio > 2
      findings.push({ ok: true, expected: true, what: `lightning at frame ${f} (${barText(secondsOf(f))}), a jump that is meant: the blurred picture moves ${s.blur.toFixed(2)} of 255, ${s.ratio.toFixed(1)} times its neighbours${seen ? '' : '. That is no jump at all: the lightning does not show in the picture yet'}` })
    }
  }
  if (older) findings.push({ ok: true, expected: true, what: older })
  if (steps.length < wanted && steps.length > 0) findings.push({ ok: true, expected: true, what: `${wanted - steps.length} steps of frames ${from} to ${to} are not judged yet, because their frames or the frames round them are not drawn` })
  finish({
    check: 'cuts',
    sentence: SENTENCE,
    subject: (broken ? `a film whose camera jumps at one frame (${run})` : 'the film') + (every > 1 ? `, every ${every}th frame` : ''),
    name: every > 1 ? `cuts.every-${every}` : args.meant !== undefined ? `cuts.meant-${String(args.meant).replace(/,/g, '-')}` : undefined,
    broken,
    complete,
    findings,
    table: { head: ['into frame', 'second', 'bar', 'edges of the sky', 'edges of the land', 'round it', 'times', 'brightness of 255', 'what'], rows: largest.map((s) => [s.frame, secondsOf(s.frame).toFixed(3), barText(secondsOf(s.frame)).slice(4), s.skyStrength >= EDGES ? s.sky.toFixed(3) : 'no edges', s.landStrength >= EDGES ? s.land.toFixed(3) : 'no edges', s.round.toFixed(3), s.times.toFixed(1), s.blur.toFixed(2), s.cut ? CUT : s.meant ? 'cut, meant' : s.lightning ? 'lightning, meant' : 'no cut']) },
    pictures,
    data: { run, stamp, from, to, every, thresholds: { move: CUT_MOVE, ratio: CUT_RATIO, near: NEAR, edges: EDGES }, steps: steps.map((s) => [s.frame, Number(s.full.toFixed(4)), Number(s.blur.toFixed(4)), Number(s.ratio.toFixed(2)), s.cut ? 1 : 0, s.lightning ? 1 : 0, Number(s.sky.toFixed(4)), Number(s.land.toFixed(4)), s.meant ? 1 : 0]) },
  })
}
