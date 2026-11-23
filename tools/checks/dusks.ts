import fs from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'
import type { Args } from '../lib/args.ts'
import { num } from '../lib/args.ts'
import { canvas, scaled, strip, type Placed } from '../lib/layout.ts'
import { barText, filmClock, secondsOf } from './lib/film.ts'
import { frameFile, olderFilm, runName } from './lib/play.ts'
import { OUT, type Finding } from './lib/report.ts'
import { twilights, type Twilight } from './lib/stride.ts'

// The proof by the picture that a night does not flicker. Through each dusk the mean luminance of the frame may only fall, through each dawn only rise,
// and from one frame to the next it may not move by more than a set step. Read from the frames that `play` drew.
//   npm run checks -- nights --step 20                 another limit on the step, in 0 to 255
//   npm run checks -- nights --break picture-quick     every night three times as fast (every third of its frames): must fail on the step
//   npm run checks -- nights --break picture-bounce    two frames of a dusk the wrong way round: must fail on the direction

// The Builder's limit for the time lapse. Measured at 320 x 180: the steepest frame of a dusk or dawn moved the mean luminance by 10.5 to 17.7 of 255 on sky-0 and 27.6 on sky-b before the sun was slowed at the horizon.
export const DUSK_STEP = 14
// A move the wrong way smaller than this is the grain of a draft frame, whose blur comes from the lens fill and its stipple alone: measured up to 1.5 of 255 where the far background is out of focus, under 0.3 elsewhere.
// The direction is judged from the frame of the sunset to the last frame before the sunrise. The eight frames of day on either side are held to the step only: on sky-0 the frame brightens toward a sunset.
const WRONG_WAY = 2

export interface DuskRow { night: number; first: number; last: number; midnight: number; frames: number; missing: number; day: number; dark: number; after: number; fall: number; fallAt: number; rise: number; riseAt: number; wrong: number; wrongAt: number; duskFrames: number; dawnFrames: number; ok: boolean }
export interface DuskProof { findings: Finding[]; complete: boolean; rows: DuskRow[]; pictures: { file: string; caption: string }[]; step: number }

async function luminance(file: string): Promise<number> {
  const { data } = await sharp(file).removeAlpha().raw().toBuffer({ resolveWithObject: true })
  let sum = 0
  for (let p = 0; p < data.length; p += 3) sum += 0.2126 * data[p] + 0.7152 * data[p + 1] + 0.0722 * data[p + 2]
  return sum / (data.length / 3)
}

function midnightOf(t: Twilight): number {
  let best = t.sunset
  let deepest = Infinity
  for (let f = Math.max(t.first, t.sunset - 1); f <= Math.min(t.last, t.sunrise); f++) {
    const e = filmClock.at(secondsOf(f)).sunElevationDeg
    if (e < deepest) {
      deepest = e
      best = f
    }
  }
  return best
}

// How many frames the luminance takes to cross from a tenth to nine tenths of the way between two levels.
function crossing(series: { frame: number; l: number }[], from: number, to: number): number {
  const lo = from + 0.1 * (to - from)
  const hi = from + 0.9 * (to - from)
  const between = (l: number): boolean => (to > from ? l > lo && l < hi : l < lo && l > hi)
  return series.filter((s) => between(s.l)).length
}

async function sheetOf(run: string, t: Twilight, file: string, caption: string): Promise<void> {
  const w = 160
  const h = 90
  const gap = 4
  const bar = 18
  const cols = 12
  const frames: number[] = []
  for (let f = t.first; f <= t.last; f += 2) if (fs.existsSync(frameFile(run, f))) frames.push(f)
  const rows = Math.ceil(frames.length / cols)
  const parts: Placed[] = [{ input: strip(cols * (w + gap) - gap, bar + 2, caption), left: gap, top: gap }]
  for (let i = 0; i < frames.length; i++) {
    const left = gap + (i % cols) * (w + gap)
    const top = bar + 2 + 2 * gap + Math.floor(i / cols) * (h + bar + gap)
    parts.push({ input: await scaled(frameFile(run, frames[i]), w, h), left, top })
    parts.push({ input: strip(w, bar, `${frames[i]}${frames[i] === t.sunset || frames[i] === t.sunset + 1 ? ' sunset' : frames[i] === t.sunrise || frames[i] === t.sunrise + 1 ? ' sunrise' : ''}`), left, top: top + h })
  }
  await canvas(cols * (w + gap) + gap, bar + 2 + 2 * gap + rows * (h + bar + gap), parts).jpeg({ quality: 88 }).toFile(file)
}

export async function duskProof(args: Args, broken: string | null): Promise<DuskProof> {
  const step = num(args, 'step', DUSK_STEP)
  const run = runName(null)
  const findings: Finding[] = []
  const rows: DuskRow[] = []
  const pictures: { file: string; caption: string }[] = []
  let complete = true
  let drawn = 0
  const dir = path.join(OUT, 'nights', broken ? `broken-${broken}` : 'film')
  fs.rmSync(dir, { recursive: true, force: true })
  fs.mkdirSync(dir, { recursive: true })
  const cacheFile = path.join(OUT, 'play', run, 'luminance.json')
  const cache: Record<string, number> = fs.existsSync(cacheFile) ? JSON.parse(fs.readFileSync(cacheFile, 'utf8')) : {}
  for (const t of twilights()) {
    let series: { frame: number; l: number }[] = []
    let missing = 0
    for (let f = t.first; f <= t.last; f++) {
      const file = frameFile(run, f)
      if (!fs.existsSync(file)) {
        missing++
        continue
      }
      const key = `${f}:${fs.statSync(file).mtimeMs}`
      cache[key] ??= await luminance(file)
      series.push({ frame: f, l: cache[key] })
    }
    if (missing > 0 || series.length < 3) {
      complete = false
      continue
    }
    drawn++
    const midnight = midnightOf(t)
    if (broken === 'picture-quick') series = series.filter((s) => (s.frame - midnight) % 3 === 0)
    if (broken === 'picture-bounce') {
      const dusk = series.filter((s) => s.frame <= midnight)
      let at = 1
      for (let i = 1; i < dusk.length; i++) if (dusk[i - 1].l - dusk[i].l > dusk[at - 1].l - dusk[at].l) at = i
      if (dusk.length > 1) [series[at - 1].l, series[at].l] = [series[at].l, series[at - 1].l]
    }
    let fall = 0
    let fallAt = -1
    let rise = 0
    let riseAt = -1
    let wrong = 0
    let wrongAt = -1
    for (let i = 1; i < series.length; i++) {
      const d = series[i].l - series[i - 1].l
      const dusk = series[i].frame <= midnight
      if (dusk && -d > fall) [fall, fallAt] = [-d, series[i].frame]
      if (!dusk && d > rise) [rise, riseAt] = [d, series[i].frame]
      const against = dusk ? d : -d
      const night = series[i - 1].frame >= t.sunset && series[i].frame < t.sunrise
      if (night && against > wrong) [wrong, wrongAt] = [against, series[i].frame]
    }
    const day = series[0].l
    const after = series[series.length - 1].l
    const dark = series.reduce((a, s) => Math.min(a, s.l), Infinity)
    const ok = fall <= step && rise <= step && wrong <= WRONG_WAY
    rows.push({ night: t.night, first: t.first, last: t.last, midnight, frames: series.length, missing, day, dark, after, fall, fallAt, rise, riseAt, wrong, wrongAt, duskFrames: crossing(series.filter((s) => s.frame <= midnight), day, dark), dawnFrames: crossing(series.filter((s) => s.frame >= midnight), dark, after), ok })
    if (!ok) {
      const why = [fall > step ? `the dusk falls ${fall.toFixed(1)} of 255 into frame ${fallAt}` : '', rise > step ? `the dawn rises ${rise.toFixed(1)} of 255 into frame ${riseAt}` : '', wrong > WRONG_WAY ? `the luminance moves ${wrong.toFixed(2)} the wrong way into frame ${wrongAt}` : ''].filter(Boolean).join(', ')
      findings.push({ ok: false, what: `night ${t.night} (frames ${t.first} to ${t.last}, ${barText(secondsOf(t.sunset))} to ${barText(secondsOf(t.sunrise))}): ${why}; the limit is ${step} a frame one way and ${WRONG_WAY} the other` })
    }
  }
  fs.mkdirSync(path.dirname(cacheFile), { recursive: true })
  fs.writeFileSync(cacheFile, JSON.stringify(cache) + '\n')
  const total = twilights().length
  if (drawn === 0) findings.push({ ok: true, expected: true, what: 'the proof by the picture is not run: no dusk or dawn has all its frames drawn yet (npm run checks -- play --stride 6 draws them first)' })
  else {
    const worst = rows.reduce((a, r) => (Math.max(r.fall, r.rise) > Math.max(a.fall, a.rise) ? r : a), rows[0])
    const bad = rows.filter((r) => !r.ok)
    findings.unshift({ ok: bad.length === 0, what: `by the picture (${drawn} of ${total} nights with every frame drawn, 320 x 180): ${bad.length === 0 ? 'through every dusk the luminance of the frame only falls and through every dawn it only rises' : `${bad.length} nights flicker`}; the largest step is ${Math.max(worst.fall, worst.rise).toFixed(1)} of 255 a frame in night ${worst.night} against a limit of ${step}, the largest move the wrong way ${rows.reduce((a, r) => Math.max(a, r.wrong), 0).toFixed(2)} against ${WRONG_WAY}` })
    if (drawn < total) findings.push({ ok: true, expected: true, what: `${total - drawn} of ${total} nights do not have every frame drawn yet` })
    for (const r of [worst, ...bad.filter((b) => b !== worst).slice(0, 2)]) {
      const t = twilights()[r.night - 1]
      const file = path.join(dir, `night-${String(r.night).padStart(2, '0')}.jpg`)
      const caption = `Night ${r.night}, every second frame from ${t.first} to ${t.last}: luminance ${r.day.toFixed(0)} to ${r.dark.toFixed(0)} to ${r.after.toFixed(0)} of 255, largest fall ${r.fall.toFixed(1)} a frame, largest rise ${r.rise.toFixed(1)}`
      await sheetOf(run, t, file, caption)
      pictures.push({ file: path.relative(process.cwd(), file), caption })
    }
  }
  const older = olderFilm(run)
  if (older && drawn > 0) {
    findings.push({ ok: true, expected: true, what: older })
    complete = false
  }
  return { findings, complete, rows, pictures, step }
}
