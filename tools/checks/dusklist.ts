import fs from 'node:fs'
import path from 'node:path'
import type { Args } from '../lib/args.ts'
import { num } from '../lib/args.ts'
import { barText, filmClock, secondsOf } from './lib/film.ts'
import { frameFile, olderFilm, readStamp, runName } from './lib/play.ts'
import { finish, OUT, type Finding } from './lib/report.ts'
import { mad, small, type Small } from './lib/steps.ts'
import { twilights } from './lib/stride.ts'
import { DUSK_STEP } from './dusks.ts'

const SENTENCE = "It goes from day to night in the sky repeatedly while it's actually growing, no more hard cuts."

// One list for the owners of the sky: every dusk and every dawn of the film with what changes from one frame to the next, read from the frames `play` drew.
// Two measures. The step of the frame's mean luminance, which the Builder's limit of 14 of 255 holds. And the change of the picture: the mean over the frame of how far
// the blurred luminance of each place moves, which sees clouds that change their layout while the mean stays where it was. That one has no limit yet:
// a frame stands out when it changes more than STANDS_OUT times the median of its dusk or dawn and by more than STANDS_BY of 255.
//   npm run checks -- nights --list
const STANDS_OUT = 4
const STANDS_BY = 8

interface Side { night: number; side: 'dusk' | 'dawn'; from: number; to: number; frames: number; missing: number; meanStep: number; worstStep: number; worstStepAt: number; change: number; medianChange: number; worstChange: number; worstChangeAt: number; stands: number[] }

const median = (v: number[]): number => {
  if (v.length === 0) return 0
  const s = [...v].sort((a, b) => a - b)
  return s.length % 2 ? s[(s.length - 1) / 2] : 0.5 * (s[s.length / 2 - 1] + s[s.length / 2])
}

export async function run(args: Args): Promise<void> {
  const limit = num(args, 'step', DUSK_STEP)
  const run = runName(null)
  const stamp = readStamp(run)
  const sides: Side[] = []
  for (const t of twilights()) {
    let midnight = t.sunset
    let deepest = Infinity
    for (let f = t.sunset; f <= Math.min(t.last, t.sunrise); f++) {
      const e = filmClock.at(secondsOf(f)).sunElevationDeg
      if (e < deepest) {
        deepest = e
        midnight = f
      }
    }
    const closes = filmClock.at(secondsOf(t.last)).sunElevationDeg < 0
    for (const [side, from, to] of (closes ? [['dusk', t.first, t.last]] : [['dusk', t.first, midnight], ['dawn', midnight, t.last]]) as ['dusk' | 'dawn', number, number][]) {
      const steps: { frame: number; mean: number; change: number }[] = []
      let before: Small | null = null
      let missing = 0
      for (let f = from; f <= to; f++) {
        const file = frameFile(run, f)
        if (!fs.existsSync(file)) {
          missing++
          before = null
          continue
        }
        const now = await small(file)
        if (before) {
          let a = 0
          let b = 0
          for (let i = 0; i < now.luma.length; i++) {
            a += before.luma[i]
            b += now.luma[i]
          }
          steps.push({ frame: f, mean: Math.abs(b - a) / now.luma.length, change: mad(before.blur, now.blur) })
        }
        before = now
      }
      if (steps.length === 0) {
        sides.push({ night: t.night, side, from, to, frames: 0, missing, meanStep: 0, worstStep: 0, worstStepAt: -1, change: 0, medianChange: 0, worstChange: 0, worstChangeAt: -1, stands: [] })
        continue
      }
      const worstStep = steps.reduce((x, s) => (s.mean > x.mean ? s : x), steps[0])
      const worstChange = steps.reduce((x, s) => (s.change > x.change ? s : x), steps[0])
      const mid = median(steps.map((s) => s.change))
      sides.push({
        night: t.night, side, from, to, frames: steps.length + 1, missing,
        meanStep: steps.reduce((x, s) => x + s.mean, 0) / steps.length, worstStep: worstStep.mean, worstStepAt: worstStep.frame,
        change: steps.reduce((x, s) => x + s.change, 0) / steps.length, medianChange: mid, worstChange: worstChange.change, worstChangeAt: worstChange.frame,
        stands: steps.filter((s) => s.change > STANDS_OUT * mid && s.change > STANDS_BY).map((s) => s.frame),
      })
    }
  }
  const have = sides.filter((s) => s.frames > 0 && s.missing === 0)
  const findings: Finding[] = []
  const over = have.filter((s) => s.worstStep > limit)
  if (have.length === 0) findings.push({ ok: false, what: 'no dusk or dawn has all its frames drawn yet: run "npm run checks -- play" first' })
  else {
    const worst = have.reduce((x, s) => (s.worstStep > x.worstStep ? s : x), have[0])
    findings.push({ ok: over.length === 0, what: `the step of the frame's mean luminance, ${have.length} of ${sides.length} dusks and dawns with every frame drawn (${stamp?.width} x ${stamp?.height}, sky ${stamp?.sky}): the largest is ${worst.worstStep.toFixed(1)} of 255 into frame ${worst.worstStepAt} (night ${worst.night}, ${worst.side}) against a limit of ${limit}; ${over.length === 0 ? 'none is over it' : `${over.length} are over it: ${over.map((s) => `night ${s.night} ${s.side} ${s.worstStep.toFixed(1)} into frame ${s.worstStepAt}`).join('; ')}`}` })
    const out = have.filter((s) => s.stands.length > 0)
    const most = have.reduce((x, s) => (s.worstChange > x.worstChange ? s : x), have[0])
    findings.push({ ok: true, expected: true, what: `listed, no limit yet: the change of the picture from one frame to the next (the mean over the frame of how far the blurred luminance of each place moves) is at the most ${most.worstChange.toFixed(1)} of 255 into frame ${most.worstChangeAt} (night ${most.night}, ${most.side}, ${barText(secondsOf(most.worstChangeAt))}), where the median of that ${most.side} is ${most.medianChange.toFixed(1)}; in ${out.length} of ${have.length} dusks and dawns a frame stands out by more than ${STANDS_OUT} times the median and ${STANDS_BY} of 255${out.length ? `: ${out.map((s) => `night ${s.night} ${s.side} at ${s.stands.join(', ')}`).join('; ')}` : ''}` })
  }
  const waiting = sides.length - have.length
  if (waiting) findings.push({ ok: true, expected: true, what: `${waiting} of ${sides.length} dusks and dawns do not have every frame drawn yet` })
  const older = olderFilm(run)
  if (older) findings.push({ ok: true, expected: true, what: older })
  const rows = sides.map((s) => (s.frames === 0 || s.missing > 0
    ? [s.night, s.side, `${s.from} to ${s.to}`, `${s.missing} not drawn`, '', '', '', '', '', '', '']
    : [s.night, s.side, `${s.from} to ${s.to}`, s.meanStep.toFixed(2), s.worstStep.toFixed(1), s.worstStepAt, s.worstStep > limit ? 'OVER' : 'ok', s.medianChange.toFixed(2), s.change.toFixed(2), s.worstChange.toFixed(1), s.worstChangeAt, s.stands.join(' ')]))
  const head = ['night', 'side', 'frames', 'mean step of the mean', 'worst', 'into frame', `limit ${limit}`, 'picture change, median', 'mean', 'worst', 'into frame', 'frames that stand out']
  const result = finish({ check: 'nights', name: 'nights.list', sentence: SENTENCE, subject: 'every dusk and every dawn of the film, frame to frame', broken: null, complete: waiting === 0 && !older, findings, table: { head, rows }, data: { limit, sides } })
  fs.mkdirSync(path.join(OUT, 'nights'), { recursive: true })
  fs.writeFileSync(path.join(OUT, 'nights', 'dusks.tsv'), [head, ...rows].map((r) => r.join('\t')).join('\n') + '\n')
  void result
}
