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
//   --every 1 draws every frame between the handover and midnight, the default 2 every second one

// How far the plant's mean may rise between two drawn frames on the way to midnight: half a level of 255, the size of the grain and of the rounding to eight bits.
const RISE = 0.5
const MOON_FAULT = 2.4

export interface PlantFrame { frame: number; mean: number; high: number; share: number }
export interface PlantSide { night: number; side: 'dusk' | 'dawn'; handover: number; midnight: number; frames: PlantFrame[]; rise: number; riseAt: number; ok: boolean; why: string }
export interface PlantProof { findings: Finding[]; complete: boolean; pictures: { file: string; caption: string }[]; sides: PlantSide[] }
interface Stored { engineHash: string; at: string; width: number; height: number; every: number; sides: PlantSide[]; pictures: { file: string; caption: string }[] }

const scratch = blankMoment()
const moonLit = (frame: number): boolean => momentAt(secondsOf(frame), scratch).lightKind === 'moon'

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

function judge(sides: PlantSide[], drawnNow: boolean, total: number): Finding[] {
  if (sides.length === 0) return []
  const bad = sides.filter((s) => !s.ok)
  const worst = sides.reduce((a, s) => (s.rise > a.rise ? s : a), sides[0])
  const fall = (s: PlantSide): number => s.frames[0].mean - s.frames[s.frames.length - 1].mean
  const least = sides.reduce((a, s) => (fall(s) < fall(a) ? s : a), sides[0])
  const highest = sides.reduce((a, s) => (s.frames[s.frames.length - 1].high - s.frames[0].high > a.frames[a.frames.length - 1].high - a.frames[0].high ? s : a), sides[0])
  const findings: Finding[] = [
    {
      ok: bad.length === 0,
      what: `by the plant alone (${sides.length} of ${total} dusks and dawns drawn with nothing but the plant${drawnNow ? '' : ', read from the last drawing'}): ${bad.length === 0 ? 'from each handover to midnight the plant only gets darker' : `the plant gets brighter toward midnight in ${bad.length} of them`}; ${worst.rise > 0 ? `the largest rise between drawn frames is ${worst.rise.toFixed(2)} of 255 into frame ${worst.riseAt}` : 'it rises between no two drawn frames'} (limit ${RISE}); the smallest fall from handover to midnight is ${fall(least).toFixed(1)} (night ${least.night}, ${least.side}: ${least.frames[0].mean.toFixed(1)} at frame ${least.handover} to ${least.frames[least.frames.length - 1].mean.toFixed(1)} at frame ${least.midnight}); the 90th percentile at midnight against the handover's is at the worst ${highest.frames[highest.frames.length - 1].high} against ${highest.frames[0].high} (night ${highest.night}, ${highest.side})`,
    },
  ]
  for (const s of bad.slice(0, 6)) findings.push({ ok: false, what: `night ${s.night}, ${s.side} (${barText(secondsOf(s.handover))}): ${s.why}` })
  if (bad.length > 6) findings.push({ ok: false, what: `and ${bad.length - 6} more` })
  return findings
}

async function sheet(dir: string, side: PlantSide, width: number, height: number, caption: string): Promise<string> {
  const w = 300
  const h = Math.round((w * height) / width)
  const gap = 6
  const bar = 20
  const parts: Placed[] = [{ input: strip(side.frames.length * (w + gap) - gap, bar + 2, caption), left: gap, top: gap }]
  for (let i = 0; i < side.frames.length; i++) {
    const f = side.frames[i]
    const left = gap + i * (w + gap)
    parts.push({ input: await scaled(path.join(dir, `${f.frame}.png`), w, h), left, top: bar + 2 + 2 * gap })
    parts.push({ input: strip(w, bar, `${f.frame}${i === 0 ? ' handover' : i === side.frames.length - 1 ? ' midnight' : ''} · mean ${f.mean.toFixed(1)} · 90th ${f.high}`), left, top: bar + 2 + 2 * gap + h })
  }
  const file = path.join(dir, `night-${String(side.night).padStart(2, '0')}-${side.side}.jpg`)
  await canvas(side.frames.length * (w + gap) + gap, 2 * bar + 2 + h + 3 * gap, parts).jpeg({ quality: 90 }).toFile(file)
  return file
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
    return { findings, complete: !stale && stored.sides.length === total, pictures: stored.pictures, sides: stored.sides }
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
    for (const n of all) {
      if (wanted && !wanted.includes(n.night)) continue
      for (const side of ['dusk', 'dawn'] as const) {
        const handover = side === 'dusk' ? n.dusk : n.dawn
        const way = side === 'dusk' ? 1 : -1
        const list: number[] = []
        for (let f = handover; way * (n.midnight - f) > 0; f += way * every) list.push(f)
        list.push(n.midnight)
        const frames: PlantFrame[] = []
        for (const f of list) {
          const d = await session.draw(f, 'draft')
          fs.writeFileSync(path.join(dir, `${f}.png`), d.png as Buffer)
          frames.push({ frame: f, ...(await measure(d.png as Buffer, await session.covered())) })
        }
        let rise = 0
        let riseAt = handover
        for (let i = 1; i < frames.length; i++) if (frames[i].mean - frames[i - 1].mean > rise) [rise, riseAt] = [frames[i].mean - frames[i - 1].mean, frames[i].frame]
        const first = frames[0]
        const last = frames[frames.length - 1]
        const why = [
          rise > RISE ? `the plant's mean rises ${rise.toFixed(2)} of 255 on the way to midnight, into frame ${riseAt}` : '',
          last.mean > first.mean ? `the plant's mean at midnight (${last.mean.toFixed(1)}, frame ${last.frame}) is above the handover's (${first.mean.toFixed(1)}, frame ${first.frame})` : '',
          last.high > first.high ? `its 90th percentile at midnight (${last.high}) is above the handover's (${first.high})` : '',
        ].filter(Boolean).join('; ')
        sides.push({ night: n.night, side, handover, midnight: n.midnight, frames, rise, riseAt, ok: why === '', why })
        console.log(`nights · plant alone · night ${n.night} ${side} · frames ${list.join(' ')} · mean ${frames.map((x) => x.mean.toFixed(1)).join(' ')} · 90th ${frames.map((x) => x.high).join(' ')} · ${why === '' ? 'ok' : 'FAIL'}`)
      }
    }
  } finally {
    await session.close()
  }
  const pictures: { file: string; caption: string }[] = []
  if (sides.length > 0) {
    const bad = sides.filter((s) => !s.ok)
    const fall = (s: PlantSide): number => s.frames[0].mean - s.frames[s.frames.length - 1].mean
    const shown = bad.length > 0 ? bad.slice(0, 2) : [sides.reduce((a, s) => (fall(s) < fall(a) ? s : a), sides[0])]
    for (const s of shown) {
      const caption = `The plant alone, night ${s.night}, from the handover of the ${s.side} (frame ${s.handover}) to midnight (frame ${s.midnight}): mean ${s.frames[0].mean.toFixed(1)} to ${s.frames[s.frames.length - 1].mean.toFixed(1)} of 255 over the pixels the plant covers, 90th percentile ${s.frames[0].high} to ${s.frames[s.frames.length - 1].high}${s.ok ? '' : `. ${s.why}`}`
      pictures.push({ file: path.relative(process.cwd(), await sheet(dir, s, width, height, caption)), caption })
    }
  }
  const stored: Stored = { engineHash: engineHash(), at: new Date().toISOString(), width, height, every, sides, pictures }
  fs.writeFileSync(storedFile(broken), JSON.stringify(stored, null, 1) + '\n')
  const findings = judge(sides, true, total)
  if (sides.length < total) findings.push({ ok: true, expected: true, what: `${total - sides.length} of ${total} dusks and dawns were left out with --night` })
  return { findings, complete: sides.length === total, pictures, sides }
}
