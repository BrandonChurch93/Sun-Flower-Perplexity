import fs from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'
import type { Args } from '../lib/args.ts'
import { flag, num } from '../lib/args.ts'
import { canvas, scaled, strip, type Placed } from '../lib/layout.ts'
import { blankMoment, momentAt } from '../../src/v2/now.ts'
import { barText, secondsOf } from './lib/film.ts'
import { OUT, engineHash, type Finding } from './lib/report.ts'
import { openSession } from './lib/session.ts'
import { twilights } from './lib/stride.ts'

// The plant drawn alone through each night, from the frame where the sun hands the light over to the moon up to midnight, and back down to the handover of the dawn.
// With nothing else in the frame, a plant that brightens in the middle of the night shows in the number: the whole frame's mean hides it behind the sky.
//   npm run checks -- nights --plant                       draws it (7 to 9 min) and judges it; nights without --plant reads the last drawing
//   npm run checks -- nights --plant --break plant-moon    a film whose moon is 2.4 times as strong, as it was before the fault was mended: must fail
//   npm run checks -- nights --plant --break plant-wet --night 9   the moon steps up in the middle of the wet dusk of night 9: must fail the limit for a wet plant
//   --every 1 draws every frame between the handover and midnight, the default 2 every second one

// How far the plant's mean may rise between two drawn frames on the way to midnight: half a level of 255, the size of the grain and of the rounding to eight bits.
const RISE = 0.5
const MOON_FAULT = 2.4
// Rime is allowed to brighten the plant: a frame with the frost dial at this or more is left out.
// Water has a limit of its own: while the wet dial, which is how wet the plant is, is at this or more, the plant's mean may rise by at most WET_RISE of 255 from one frame to the next.
const DIAL = 0.02
const WET_RISE = 1.5
const WET_HIGH = 2
// The fault for the wet limit: the moon steps up in the middle of a wet dusk, half way from the handover to midnight, when the dusk's own light has gone, in the night named here.
const WET_FAULT_NIGHT = 9

export interface PlantFrame { frame: number; mean: number; high: number; share: number }
export interface PlantSide { night: number; side: 'dusk' | 'dawn'; handover: number; midnight: number; frames: PlantFrame[]; rise: number; riseAt: number; ok: boolean; why: string; empty: number; leftOut?: number; wet?: number; wetRise?: number; wetRiseAt?: number; wetHigh?: number; wetHighAt?: number }
export interface PlantProof { findings: Finding[]; complete: boolean; pictures: { file: string; caption: string }[]; sides: PlantSide[] }
interface Stored { engineHash: string; at: string; width: number; height: number; every: number; sides: PlantSide[]; pictures: { file: string; caption: string }[] }

const scratch = blankMoment()
const moonLit = (frame: number): boolean => momentAt(secondsOf(frame), scratch).lightKind === 'moon'

const dialsOf = (frame: number): { frosty: boolean; wet: boolean } => {
  const d = momentAt(secondsOf(frame), scratch).dials
  return { frosty: d.frost >= DIAL, wet: d.wet >= DIAL }
}
const dry = (frame: number): boolean => {
  const d = dialsOf(frame)
  return !d.frosty && !d.wet
}

// The verdict of one dusk or dawn. Dry frames: no rise toward midnight, and midnight not above the handover. Wet frames: no rise of more than WET_RISE a frame. Frames under rime: left out.
export function settle(side: PlantSide): PlantSide {
  const frames = side.frames.filter((f) => dry(f.frame))
  const seen = side.frames.filter((f) => !dialsOf(f.frame).frosty)
  const leftOut = side.frames.length - seen.length
  const wet = seen.length - frames.length
  const empty = side.frames.find((x) => x.share === 0)
  let rise = 0
  let riseAt = side.handover
  for (let i = 1; i < frames.length; i++) if (frames[i].mean - frames[i - 1].mean > rise) [rise, riseAt] = [frames[i].mean - frames[i - 1].mean, frames[i].frame]
  let wetRise = 0
  let wetRiseAt = -1
  let wetSteps = 0
  let wetHigh = 0
  let wetHighAt = -1
  for (let i = 1; i < seen.length; i++) {
    if (!dialsOf(seen[i].frame).wet && !dialsOf(seen[i - 1].frame).wet) continue
    wetSteps++
    const a = (seen[i].mean - seen[i - 1].mean) / Math.max(1, Math.abs(seen[i].frame - seen[i - 1].frame))
    if (a > wetRise) [wetRise, wetRiseAt] = [a, seen[i].frame]
    const h = (seen[i].high - seen[i - 1].high) / Math.max(1, Math.abs(seen[i].frame - seen[i - 1].frame))
    if (h > wetHigh) [wetHigh, wetHighAt] = [h, seen[i].frame]
  }
  const base = { ...side, rise, riseAt, leftOut, wet, wetRise, wetRiseAt, wetHigh, wetHighAt }
  if (empty || (frames.length < 2 && wetSteps === 0)) return { ...base, ok: true, why: '', empty: empty ? empty.frame : -1 }
  const why: string[] = []
  if (frames.length >= 2) {
    const first = frames[0]
    const last = frames[frames.length - 1]
    const where = last.frame === side.midnight ? 'at midnight' : 'at the last dry frame'
    const from = first.frame === side.handover ? "the handover's" : `the first dry frame's`
    if (rise > RISE) why.push(`the plant's mean rises ${rise.toFixed(2)} of 255 on the way to midnight, into frame ${riseAt}`)
    if (last.mean > first.mean) why.push(`the plant's mean ${where} (${last.mean.toFixed(1)}, frame ${last.frame}) is above ${from} (${first.mean.toFixed(1)}, frame ${first.frame})`)
    if (last.high > first.high) why.push(`its 90th percentile ${where} (${last.high}) is above ${from} (${first.high})`)
  }
  if (wetRise > WET_RISE) why.push(`with water on the plant its mean rises ${wetRise.toFixed(2)} of 255 a frame into frame ${wetRiseAt}, over the limit of ${WET_RISE}`)
  if (wetHigh > WET_HIGH) why.push(`with water on the plant its 90th percentile rises ${wetHigh.toFixed(1)} of 255 a frame into frame ${wetHighAt}, over the limit of ${WET_HIGH}`)
  return { ...base, ok: why.length === 0, why: why.join('; '), empty: -1 }
}

export const judgedOf = (s: PlantSide): boolean => s.empty < 0 && (s.frames.length - (s.leftOut ?? 0) - (s.wet ?? 0) >= 2 || (s.wet ?? 0) > 0)

// For each night that reaches the moon's light: the first frame the moon lights, the deepest frame, the last frame the moon lights.
export function handovers(): { night: number; dusk: number; midnight: number; dawn: number }[] {
  const out: { night: number; dusk: number; midnight: number; dawn: number }[] = []
  for (const t of twilights()) {
    let dusk = -1
    let dawn = -1
    let midnight = -1
    let deepest = Infinity
    for (let f = t.first; f <= t.last; f++) {
      if (moonLit(f)) {
        if (dusk < 0) dusk = f
        dawn = f
      }
      const e = scratch.sunElevationDeg
      if (e < deepest) [deepest, midnight] = [e, f]
    }
    if (dusk >= 0 && dusk < midnight && midnight < dawn) out.push({ night: t.night, dusk, midnight, dawn })
  }
  return out
}

// The luminance of the finished frame, after the lens and the grain, over the pixels the plant was drawn into.
async function measure(png: Buffer, cover: string): Promise<{ mean: number; high: number; share: number }> {
  const { data, info } = await sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true })
  const counts = new Uint32Array(256)
  let sum = 0
  let covered = 0
  if (cover.length !== info.width * info.height) throw new Error(`the cover has ${cover.length} pixels and the frame ${info.width * info.height}`)
  for (let p = 0; p < data.length; p += 3) {
    if (cover.charCodeAt(p / 3) !== 49) continue
    const l = 0.2126 * data[p] + 0.7152 * data[p + 1] + 0.0722 * data[p + 2]
    sum += l
    covered++
    counts[Math.min(255, Math.round(l))]++
  }
  let high = 0
  let below = 0
  for (let v = 0; v < 256; v++) {
    below += counts[v]
    if (below >= 0.9 * covered) {
      high = v
      break
    }
  }
  return { mean: covered ? sum / covered : 0, high, share: covered / (info.width * info.height) }
}

function storedFile(broken: string | null): string {
  return path.join(OUT, 'plant', broken ? `broken-${broken}` : 'film', 'plant.json')
}

function judge(given: PlantSide[], drawnNow: boolean, total: number): Finding[] {
  const every = given.map(settle)
  const sides = every.filter(judgedOf)
  const unseen = every.filter((s) => s.empty >= 0)
  const out = every.filter((s) => s.empty < 0 && (s.leftOut ?? 0) > 0)
  const outFrames = out.reduce((a, s) => a + (s.leftOut ?? 0), 0)
  const allFrames = every.reduce((a, s) => a + s.frames.length, 0)
  const none: Finding[] = out.length ? [{ ok: true, expected: true, what: `left out, not judged: ${outFrames} of ${allFrames} frames drawn, in ${out.length} dusks and dawns, stand under rime (the frost dial at ${DIAL} or more), which may brighten the plant; ${every.filter((s) => s.empty < 0 && !judgedOf(s)).length} of those dusks and dawns have nothing left to judge (${every.filter((s) => s.empty < 0 && !judgedOf(s)).slice(0, 8).map((s) => `night ${s.night} ${s.side}`).join(', ') || 'none'})` }] : []
  const wetSides = every.filter((s) => s.empty < 0 && (s.wet ?? 0) > 0)
  if (wetSides.length) {
    const w = wetSides.reduce((a, s) => ((s.wetRise ?? 0) > (a.wetRise ?? 0) ? s : a), wetSides[0])
    const h = wetSides.reduce((a, s) => ((s.wetHigh ?? 0) > (a.wetHigh ?? 0) ? s : a), wetSides[0])
    const over = wetSides.filter((s) => (s.wetRise ?? 0) > WET_RISE || (s.wetHigh ?? 0) > WET_HIGH)
    none.push({ ok: over.length === 0, what: `with water on the plant (the wet dial at ${DIAL} or more), ${wetSides.reduce((a, s) => a + (s.wet ?? 0), 0)} frames in ${wetSides.length} dusks and dawns (${wetSides.map((s) => `night ${s.night} ${s.side}`).join(', ')}), from one frame to the next the mean may rise ${WET_RISE} of 255 and the 90th percentile ${WET_HIGH}: the mean rises at the most ${(w.wetRise ?? 0).toFixed(2)}${(w.wetRise ?? 0) > 0 ? ` into frame ${w.wetRiseAt} (night ${w.night}, ${w.side})` : ''}, the 90th percentile ${(h.wetHigh ?? 0).toFixed(1)}${(h.wetHigh ?? 0) > 0 ? ` into frame ${h.wetHighAt} (night ${h.night}, ${h.side})` : ''}${over.length ? `: ${over.length} of them are over a limit` : ''}. The 90th percentile there: ${wetSides.map((s) => `night ${s.night} ${s.side} ${s.frames[0].high} at the handover, ${Math.max(...s.frames.map((f) => f.high))} at the most, ${s.frames[s.frames.length - 1].high} at midnight`).join('; ')}` })
  }
  if (unseen.length) none.push({ ok: true, expected: true, what: `not measured: the plant covers no pixel in ${unseen.length} of ${every.length} dusks and dawns drawn with the plant alone (${unseen.slice(0, 4).map((s) => `night ${s.night} ${s.side}, frame ${s.empty}`).join('; ')})` })
  if (sides.length === 0) return none
  const bad = sides.filter((s) => !s.ok)
  const worst = sides.reduce((a, s) => (s.rise > a.rise ? s : a), sides[0])
  const ends = (s: PlantSide): [PlantFrame, PlantFrame] => {
    const kept = s.frames.filter((f) => dry(f.frame))
    return [kept[0], kept[kept.length - 1]]
  }
  const fall = (s: PlantSide): number => ends(s)[0].mean - ends(s)[1].mean
  const lift = (s: PlantSide): number => ends(s)[1].high - ends(s)[0].high
  const dried = sides.filter((s) => s.frames.filter((f) => dry(f.frame)).length >= 2)
  if (dried.length === 0) return [{ ok: bad.length === 0, what: `by the plant alone: no dusk or dawn has two dry frames; ${bad.length} of ${sides.length} fail the limit for a wet plant` }, ...bad.slice(0, 6).map((s) => ({ ok: false, what: `night ${s.night}, ${s.side} (${barText(secondsOf(s.handover))}): ${s.why}` })), ...none]
  const least = dried.reduce((a, s) => (fall(s) < fall(a) ? s : a), dried[0])
  const highest = dried.reduce((a, s) => (lift(s) > lift(a) ? s : a), dried[0])
  const findings: Finding[] = [
    {
      ok: bad.length === 0,
      what: `by the plant alone (${sides.length} of ${total} dusks and dawns judged, drawn with nothing but the plant${drawnNow ? '' : ', read from the last drawing'}): ${bad.length === 0 ? 'from each handover to midnight the plant only gets darker' : `the plant gets brighter toward midnight in ${bad.length} of them`}; ${worst.rise > 0 ? `the largest rise between drawn frames is ${worst.rise.toFixed(2)} of 255 into frame ${worst.riseAt}` : 'it rises between no two drawn frames'} (limit ${RISE}); the smallest fall from handover to midnight is ${fall(least).toFixed(1)} (night ${least.night}, ${least.side}: ${ends(least)[0].mean.toFixed(1)} at frame ${ends(least)[0].frame} to ${ends(least)[1].mean.toFixed(1)} at frame ${ends(least)[1].frame}); the 90th percentile at midnight against the handover's is at the worst ${ends(highest)[1].high} against ${ends(highest)[0].high} (night ${highest.night}, ${highest.side})`,
    },
  ]
  for (const s of bad.slice(0, 6)) findings.push({ ok: false, what: `night ${s.night}, ${s.side} (${barText(secondsOf(s.handover))}): ${s.why}` })
  if (bad.length > 6) findings.push({ ok: false, what: `and ${bad.length - 6} more` })
  return [...findings, ...none]
}

async function sheet(dir: string, side: PlantSide, width: number, height: number, caption: string, second: string): Promise<string> {
  const w = 360
  const h = Math.round((w * height) / width)
  const gap = 6
  const bar = 20
  const across = side.frames.length * (w + gap) - gap
  const parts: Placed[] = [{ input: strip(across, bar + 2, caption), left: gap, top: gap }, { input: strip(across, bar + 2, second), left: gap, top: gap + bar + 2 }]
  const top = 2 * (bar + 2) + 2 * gap
  for (let i = 0; i < side.frames.length; i++) {
    const f = side.frames[i]
    const left = gap + i * (w + gap)
    parts.push({ input: await scaled(path.join(dir, `${f.frame}.png`), w, h), left, top })
    parts.push({ input: strip(w, bar, `${f.frame}${i === 0 ? ' handover' : i === side.frames.length - 1 ? ' midnight' : ''} · mean ${f.mean.toFixed(1)} · 90th ${f.high}`), left, top: top + h })
  }
  const file = path.join(dir, `night-${String(side.night).padStart(2, '0')}-${side.side}.jpg`)
  await canvas(across + 2 * gap, top + h + bar + gap, parts).jpeg({ quality: 90 }).toFile(file)
  return file
}

// One sheet for each of the first two dusks or dawns that fail, or for the one that falls the least when none does.
async function sheets(dir: string, given: PlantSide[], width: number, height: number): Promise<{ file: string; caption: string }[]> {
  const pictures: { file: string; caption: string }[] = []
  const sides = given.map(settle).filter((s) => judgedOf(s) && s.frames.every((f) => fs.existsSync(path.join(dir, `${f.frame}.png`))))
  if (sides.length === 0) return pictures
  const bad = sides.filter((s) => !s.ok)
  const fall = (s: PlantSide): number => s.frames[0].mean - s.frames[s.frames.length - 1].mean
  const shown = bad.length > 0 ? bad.slice(0, 2) : [sides.reduce((a, s) => (fall(s) < fall(a) ? s : a), sides[0])]
  for (const s of shown) {
    const caption = `The plant alone, night ${s.night}, from the handover of the ${s.side} (frame ${s.handover}) to midnight (frame ${s.midnight}): mean ${s.frames[0].mean.toFixed(1)} to ${s.frames[s.frames.length - 1].mean.toFixed(1)} of 255 over the pixels the plant covers, 90th percentile ${s.frames[0].high} to ${s.frames[s.frames.length - 1].high}`
    const second = `${s.ok ? 'It only gets darker toward midnight' : `FAIL: ${s.why}`}${s.leftOut ? `. ${s.leftOut} of the ${s.frames.length} frames stand under rime and are not judged` : ''}${s.wet ? `. ${s.wet} frames have water on the plant: largest rise a frame ${(s.wetRise ?? 0).toFixed(2)} in the mean (limit ${WET_RISE}) and ${(s.wetHigh ?? 0).toFixed(1)} in the 90th percentile (limit ${WET_HIGH})` : ''}`
    pictures.push({ file: path.relative(process.cwd(), await sheet(dir, s, width, height, caption, second)), caption: `${caption}. ${second}` })
  }
  return pictures
}

export async function plantProof(args: Args, broken: string | null): Promise<PlantProof> {
  const all = handovers()
  const total = 2 * all.length
  if (!flag(args, 'plant')) {
    const file = storedFile(broken)
    if (!fs.existsSync(file)) return { findings: [{ ok: true, expected: true, what: 'the proof by the plant alone is not run yet (npm run checks -- nights --plant draws it, 7 to 9 min)' }], complete: false, pictures: [], sides: [] }
    const stored = JSON.parse(fs.readFileSync(file, 'utf8')) as Stored
    const findings = judge(stored.sides, false, total)
    const stale = stored.engineHash !== engineHash()
    if (stale) findings.push({ ok: true, expected: true, what: 'the plant alone was drawn from an older film: draw it again with npm run checks -- nights --plant' })
    const pictures = await sheets(path.dirname(file), stored.sides, stored.width, stored.height)
    return { findings, complete: !stale && stored.sides.filter((s) => s.empty < 0).length === total, pictures: pictures.length ? pictures : stored.pictures, sides: stored.sides.map(settle) }
  }
  const width = num(args, 'width', 640)
  const height = num(args, 'height', 360)
  const every = Math.max(1, num(args, 'every', 2))
  const wanted = typeof args.night === 'string' || typeof args.night === 'number' ? String(args.night).split(',').map(Number) : null
  const dir = path.dirname(storedFile(broken))
  fs.rmSync(dir, { recursive: true, force: true })
  fs.mkdirSync(dir, { recursive: true })
  const session = await openSession({ width, height, only: 'plant' })
  const sides: PlantSide[] = []
  try {
    if (broken === 'plant-moon') await session.fault('moon', MOON_FAULT)
    if (broken === 'plant-wet') {
      const n = all.find((x) => x.night === WET_FAULT_NIGHT)
      let at = -1
      if (n) for (let f = Math.round((n.dusk + n.midnight) / 2); f < n.midnight && at < 0; f++) if (dialsOf(f).wet && dialsOf(f - 1).wet) at = f
      if (at < 0) throw new Error(`night ${WET_FAULT_NIGHT} has no wet frame after the handover of its dusk to break`)
      console.log(`nights · plant alone · the moon is ${MOON_FAULT} times as strong from frame ${at} on`)
      await session.fault('moon', MOON_FAULT, at)
    }
    for (const n of all) {
      if (wanted && !wanted.includes(n.night)) continue
      for (const side of ['dusk', 'dawn'] as const) {
        const handover = side === 'dusk' ? n.dusk : n.dawn
        const way = side === 'dusk' ? 1 : -1
        const list: number[] = []
        // A stretch with water on the plant is judged from one frame to the next, so every frame of it is drawn.
        let anyWet = false
        for (let f = handover; way * (n.midnight - f) >= 0; f += way) if (dialsOf(f).wet) anyWet = true
        for (let f = handover; way * (n.midnight - f) > 0; f += way * (anyWet ? 1 : every)) list.push(f)
        list.push(n.midnight)
        const frames: PlantFrame[] = []
        for (const f of list) {
          const d = await session.draw(f, 'draft')
          fs.writeFileSync(path.join(dir, `${f}.png`), d.png as Buffer)
          frames.push({ frame: f, ...(await measure(d.png as Buffer, await session.covered())) })
        }
        const settled = settle({ night: n.night, side, handover, midnight: n.midnight, frames, rise: 0, riseAt: handover, ok: true, why: '', empty: -1 })
        sides.push(settled)
        console.log(`nights · plant alone · night ${n.night} ${side} · frames ${list.join(' ')} · mean ${frames.map((x) => x.mean.toFixed(1)).join(' ')} · 90th ${frames.map((x) => x.high).join(' ')} · ${settled.empty >= 0 ? `not measured: the plant covers no pixel of frame ${settled.empty}` : !judgedOf(settled) ? 'left out: rime on the plant' : `${settled.ok ? 'ok' : 'FAIL'}${settled.leftOut ? `, ${settled.leftOut} frames under rime left out` : ''}${settled.wet ? `, ${settled.wet} wet frames, largest rise a frame ${(settled.wetRise ?? 0).toFixed(2)}` : ''}`}`)
      }
    }
  } finally {
    await session.close()
  }
  const pictures = await sheets(dir, sides, width, height)
  const stored: Stored = { engineHash: engineHash(), at: new Date().toISOString(), width, height, every, sides, pictures }
  fs.writeFileSync(storedFile(broken), JSON.stringify(stored, null, 1) + '\n')
  const findings = judge(sides, true, total)
  if (sides.length < total) findings.push({ ok: true, expected: true, what: `${total - sides.length} of ${total} dusks and dawns were left out with --night` })
  return { findings, complete: sides.filter((s) => s.empty < 0).length === total, pictures, sides }
}
