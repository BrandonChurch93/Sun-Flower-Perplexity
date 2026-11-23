import fs from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'
import type { Args } from '../lib/args.ts'
import { num } from '../lib/args.ts'
import { canvas, cropped, scaled, strip, type Placed } from '../lib/layout.ts'
import { barText, filmClock, secondsOf } from './lib/film.ts'
import { meantCuts } from './lib/meant.ts'
import { horizonPlace } from './lib/moon.ts'
import { frameFile, olderFilm, runName } from './lib/play.ts'
import { OUT, type Finding } from './lib/report.ts'
import { twilights, type Twilight } from './lib/stride.ts'

// The proof by the picture that a night does not flicker. Through each dusk the mean luminance of the frame may only fall, through each dawn only rise,
// and from one frame to the next it may not move by more than a set step. Read from the frames that `play` drew.
//   npm run checks -- nights --step 20                 another limit on the step, in 0 to 255
//   npm run checks -- nights --break picture-quick     every night three times as fast (every third of its frames): must fail on the step
//   npm run checks -- nights --break picture-bounce    two frames of a dusk the wrong way round: must fail on the direction
//   npm run checks -- nights --break picture-blink     eight parts at the foot of the frame at half their light for one frame of each night: must fail on the part, not on the whole frame

// The Builder's limit for the time lapse. Measured at 320 x 180: the steepest frame of a dusk or dawn moved the mean luminance by 10.5 to 17.7 of 255 on sky-0 and 27.6 on sky-b before the sun was slowed at the horizon.
export const DUSK_STEP = 14
// A move the wrong way smaller than this is the grain of a draft frame, whose blur comes from the lens fill and its stipple alone: measured up to 1.5 of 255 where the far background is out of focus, under 0.3 elsewhere.
// The direction is judged from the frame of the sunset to the last frame before the sunrise. The eight frames of day on either side are held to the step only: on sky-0 the frame brightens toward a sunset.
const WRONG_WAY = 2
// The frame cut into parts, to see a move the wrong way that the mean of the whole frame hides: a plant that goes dark between the sun's light and the night's while the sky round it fades as it should.
// The Builder's limit for one part: a leaf that a growing plant carries across a part moves it by growth alone, so it is wider than the limit for the whole frame.
const PART_WRONG = 8
const ACROSS = 16
const DOWN = 9
// The sky turns fast, and its bright band, dark lanes and lit clouds pass through a part in one frame: a move, not a flicker, that this rule cannot tell from one.
// So a part is judged only when it lies wholly under the horizon the film's camera sees, where the ground and the foot of the plant are. The sky is held to the whole frame's rule, and its largest part is listed.
const skyRows = (frame: number): number => Math.max(0, Math.min(DOWN, Math.ceil(horizonPlace(frame, 16 / 9) * DOWN - 1e-6)))

export interface DuskRow { night: number; first: number; last: number; midnight: number; frames: number; missing: number; day: number; dark: number; after: number; fall: number; fallAt: number; rise: number; riseAt: number; part: number; partAt: number; partColumn: number; partRow: number; partsAtOnce: number; sky: number; skyAt: number; skyColumn: number; skyRow: number; partTrail: { frame: number; l: number }[]; wrong: number; wrongAt: number; duskFrames: number; dawnFrames: number; ok: boolean }
export interface DuskProof { findings: Finding[]; complete: boolean; rows: DuskRow[]; pictures: { file: string; caption: string }[]; step: number }

// The mean luminance of the frame, then of each of its parts, row by row.
async function luminance(file: string): Promise<number[]> {
  const { data, info } = await sharp(file).removeAlpha().raw().toBuffer({ resolveWithObject: true })
  const sums = new Float64Array(1 + ACROSS * DOWN)
  const counts = new Float64Array(1 + ACROSS * DOWN)
  for (let y = 0; y < info.height; y++) {
    const row = Math.min(DOWN - 1, Math.floor((y * DOWN) / info.height))
    for (let x = 0; x < info.width; x++) {
      const p = 3 * (y * info.width + x)
      const l = 0.2126 * data[p] + 0.7152 * data[p + 1] + 0.0722 * data[p + 2]
      const part = 1 + row * ACROSS + Math.min(ACROSS - 1, Math.floor((x * ACROSS) / info.width))
      sums[0] += l
      counts[0]++
      sums[part] += l
      counts[part]++
    }
  }
  return Array.from(sums, (v, i) => v / Math.max(1, counts[i]))
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

// The frames round the largest move the wrong way in a part, cut to the parts round it and enlarged, the part itself framed.
async function partSheet(run: string, r: DuskRow, file: string, caption: string): Promise<void> {
  const first = await sharp(frameFile(run, r.partTrail[0].frame)).metadata()
  const cw = Math.floor((first.width ?? 320) / ACROSS)
  const ch = Math.floor((first.height ?? 180) / DOWN)
  const round = 5
  const left = Math.max(0, Math.min(ACROSS - round, r.partColumn - 1 - 2)) * cw
  const top = Math.max(0, Math.min(DOWN - round, r.partRow - 1 - 2)) * ch
  const scale = 3
  const w = round * cw * scale
  const h = round * ch * scale
  const gap = 4
  const bar = 20
  const parts: Placed[] = [{ input: strip(r.partTrail.length * (w + gap) - gap, bar + 2, caption), left: gap, top: gap }]
  const frame = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect x="${((r.partColumn - 1) * cw - left) * scale}" y="${((r.partRow - 1) * ch - top) * scale}" width="${cw * scale}" height="${ch * scale}" fill="none" stroke="#ffffff" stroke-width="2"/></svg>`)
  for (let i = 0; i < r.partTrail.length; i++) {
    const x = gap + i * (w + gap)
    const y = bar + 2 + 2 * gap
    parts.push({ input: await scaled(await cropped(frameFile(run, r.partTrail[i].frame), left, top, round * cw, round * ch), w, h), left: x, top: y })
    parts.push({ input: frame, left: x, top: y })
    parts.push({ input: strip(w, bar, `${r.partTrail[i].frame} · ${r.partTrail[i].l.toFixed(1)} of 255${r.partTrail[i].frame === r.partAt ? ' · lands here' : ''}`), left: x, top: y + h })
  }
  await canvas(r.partTrail.length * (w + gap) + gap, bar + 2 + 2 * gap + h + bar + gap, parts).jpeg({ quality: 88 }).toFile(file)
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
  const cacheFile = path.join(OUT, 'play', run, 'parts.json')
  const cache: Record<string, number[]> = fs.existsSync(cacheFile) ? JSON.parse(fs.readFileSync(cacheFile, 'utf8')) : {}
  const meant = new Set(meantCuts())
  const leftOut: number[] = []
  for (const t of twilights()) {
    let series: { frame: number; l: number; parts: number[] }[] = []
    let missing = 0
    for (let f = t.first; f <= t.last; f++) {
      const file = frameFile(run, f)
      if (!fs.existsSync(file)) {
        missing++
        continue
      }
      const key = `${f}:${fs.statSync(file).mtimeMs}`
      cache[key] ??= await luminance(file)
      series.push({ frame: f, l: cache[key][0], parts: cache[key].slice(1) })
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
    if (broken === 'picture-blink') {
      const at = series.find((x) => x.frame === Math.min(midnight - 1, t.sunset + 6))
      if (at) {
        const parts = at.parts.slice()
        for (const row of [DOWN - 2, DOWN - 1]) for (const column of [6, 7, 8, 9]) parts[row * ACROSS + column] *= 0.5
        at.l += (parts.reduce((a, v) => a + v, 0) - at.parts.reduce((a, v) => a + v, 0)) / parts.length
        at.parts = parts
      }
    }
    let fall = 0
    let fallAt = -1
    let rise = 0
    let riseAt = -1
    let wrong = 0
    let wrongAt = -1
    let part = 0
    let partAt = -1
    let partIn = 0
    let partsAtOnce = 0
    let sky = 0
    let skyAt = -1
    let skyIn = 0
    for (let i = 1; i < series.length; i++) {
      if (meant.has(series[i].frame)) {
        leftOut.push(series[i].frame)
        continue
      }
      const d = series[i].l - series[i - 1].l
      const dusk = series[i].frame <= midnight
      if (dusk && -d > fall) [fall, fallAt] = [-d, series[i].frame]
      if (!dusk && d > rise) [rise, riseAt] = [d, series[i].frame]
      const against = dusk ? d : -d
      const night = series[i - 1].frame >= t.sunset && series[i].frame < t.sunrise
      if (night && against > wrong) [wrong, wrongAt] = [against, series[i].frame]
      if (!night) continue
      let atOnce = 0
      const above = Math.max(skyRows(series[i - 1].frame), skyRows(series[i].frame)) * ACROSS
      for (let c = 0; c < series[i].parts.length; c++) {
        const moved = (dusk ? 1 : -1) * (series[i].parts[c] - series[i - 1].parts[c])
        if (c < above) {
          if (moved > sky) [sky, skyAt, skyIn] = [moved, series[i].frame, c]
          continue
        }
        if (moved > WRONG_WAY) atOnce++
        if (moved > part) [part, partAt, partIn] = [moved, series[i].frame, c]
      }
      partsAtOnce = Math.max(partsAtOnce, atOnce)
    }
    const day = series[0].l
    const after = series[series.length - 1].l
    const dark = series.reduce((a, s) => Math.min(a, s.l), Infinity)
    const ok = fall <= step && rise <= step && wrong <= WRONG_WAY && part <= PART_WRONG
    rows.push({ night: t.night, first: t.first, last: t.last, midnight, frames: series.length, missing, day, dark, after, fall, fallAt, rise, riseAt, part, partAt, partColumn: 1 + (partIn % ACROSS), partRow: 1 + Math.floor(partIn / ACROSS), partsAtOnce, sky, skyAt, skyColumn: 1 + (skyIn % ACROSS), skyRow: 1 + Math.floor(skyIn / ACROSS), partTrail: series.filter((x) => Math.abs(x.frame - partAt) <= 3).map((x) => ({ frame: x.frame, l: x.parts[partIn] })), wrong, wrongAt, duskFrames: crossing(series.filter((s) => s.frame <= midnight), day, dark), dawnFrames: crossing(series.filter((s) => s.frame >= midnight), dark, after), ok })
    if (!ok) {
      const why = [fall > step ? `the dusk falls ${fall.toFixed(1)} of 255 into frame ${fallAt}` : '', rise > step ? `the dawn rises ${rise.toFixed(1)} of 255 into frame ${riseAt}` : '', wrong > WRONG_WAY ? `the luminance moves ${wrong.toFixed(2)} the wrong way into frame ${wrongAt}` : '', part > PART_WRONG ? `one part of the frame (column ${1 + (partIn % ACROSS)} of ${ACROSS}, row ${1 + Math.floor(partIn / ACROSS)} of ${DOWN}) moves ${part.toFixed(1)} of 255 the wrong way into frame ${partAt}` : ''].filter(Boolean).join(', ')
      findings.push({ ok: false, what: `night ${t.night} (frames ${t.first} to ${t.last}, ${barText(secondsOf(t.sunset))} to ${barText(secondsOf(t.sunrise))}): ${why}; the limit is ${step} a frame one way and ${WRONG_WAY} the other for the whole frame, ${PART_WRONG} the other for a part` })
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
    const part = rows.reduce((x, r) => (r.part > x.part ? r : x), rows[0])
    findings.splice(1, 0, { ok: part.part <= PART_WRONG, what: `by the parts of the frame under the horizon (${ACROSS} by ${DOWN} parts, those wholly under the horizon the camera sees: the ground and the foot of the plant): the largest move the wrong way in one part is ${part.part.toFixed(1)} of 255 into frame ${part.partAt} (night ${part.night}, column ${part.partColumn} of ${ACROSS}, row ${part.partRow} of ${DOWN}) against a limit of ${PART_WRONG}; ${rows.filter((r) => r.part > PART_WRONG).length} of ${rows.length} nights are over it, and at the most ${rows.reduce((x, r) => Math.max(x, r.partsAtOnce), 0)} parts under the horizon move more than ${WRONG_WAY} the wrong way in one frame. The mean of the whole frame hides a plant or a ground that goes dark between the sun's light and the night's` })
    if (part.part > WRONG_WAY && part.partTrail.length > 1) {
      const file = path.join(dir, `part-${String(part.night).padStart(2, '0')}.jpg`)
      const caption = `Night ${part.night}: the framed part moves ${part.part.toFixed(1)} of 255 the wrong way into frame ${part.partAt}, while the whole frame moves the right way. Under each frame: its number, and the luminance of the framed part`
      await partSheet(run, part, file, caption)
      pictures.push({ file: path.relative(process.cwd(), file), caption })
    }
    const turning = rows.reduce((x, r) => (r.sky > x.sky ? r : x), rows[0])
    if (turning.sky > PART_WRONG) findings.push({ ok: true, expected: true, what: `listed, not judged: above the horizon, in the sky, one part moves ${turning.sky.toFixed(1)} of 255 the wrong way into frame ${turning.skyAt} (night ${turning.night}, column ${turning.skyColumn} of ${ACROSS}, row ${turning.skyRow} of ${DOWN}), and in ${rows.filter((r) => r.sky > PART_WRONG).length} of ${rows.length} nights a part of the sky moves more than ${PART_WRONG}. The sky turns and carries its bright band and its clouds through a part in one frame, which this rule cannot tell from a flicker, so the sky is held to the whole frame's rule` })
    if (drawn < total) findings.push({ ok: true, expected: true, what: `${total - drawn} of ${total} nights do not have every frame drawn yet` })
    for (const r of [worst, ...bad.filter((b) => b !== worst).slice(0, 2)]) {
      const t = twilights()[r.night - 1]
      const file = path.join(dir, `night-${String(r.night).padStart(2, '0')}.jpg`)
      const caption = `Night ${r.night}, every second frame from ${t.first} to ${t.last}: luminance ${r.day.toFixed(0)} to ${r.dark.toFixed(0)} to ${r.after.toFixed(0)} of 255, largest fall ${r.fall.toFixed(1)} a frame, largest rise ${r.rise.toFixed(1)}`
      await sheetOf(run, t, file, caption)
      pictures.push({ file: path.relative(process.cwd(), file), caption })
    }
  }
  if (leftOut.length) findings.push({ ok: true, expected: true, what: `left out: the ${leftOut.length === 1 ? 'step' : 'steps'} into ${leftOut.length === 1 ? 'frame' : 'frames'} ${leftOut.join(', ')}, ${leftOut.length === 1 ? 'a cut' : 'cuts'} the film means (tools/checks/limits.json), ${leftOut.length === 1 ? 'is' : 'are'} not judged by the step of the frame's mean nor by its direction` })
  const older = olderFilm(run)
  if (older && drawn > 0) {
    findings.push({ ok: true, expected: true, what: older })
    complete = false
  }
  return { findings, complete, rows, pictures, step }
}
