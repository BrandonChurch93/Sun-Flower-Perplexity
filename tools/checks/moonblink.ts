import fs from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'
import { canvas, cropped, strip, type Placed } from '../lib/layout.ts'
import { barText, filmClock, secondsOf } from './lib/film.ts'
import { moonPlace } from './lib/moon.ts'
import { frameFile, olderFilm, runName } from './lib/play.ts'
import { OUT, type Finding } from './lib/report.ts'
import { twilights } from './lib/stride.ts'
import { nightsOf } from './nights.ts'

// The moon may not blink. In every night that ends in a sunrise, between the first and the last frame at which the moon's disc stands at half its peak,
// its level may not fall and come back by more than a set amount inside any five frames. Read from the frames that `play` drew.
// The level is the disc less the sky in a ring round it, so the dusk fading or a veil that lifts disc and sky alike is not the disc's own change.
// What goes between the lens and the disc alone, a cloud's edge, takes the disc out of the picture and counts: the ring's level beside each fail says which it was.
//   npm run checks -- nights --break moon-blink     the disc at the level of its ring for one frame at midnight of each night: must fail

// The Builder's limit, of 255, and the frames it is held inside.
export const BLINK = 12
export const INSIDE = 5
// A night whose disc never stands this far over its ring has no moon to judge: it is out of the frame or behind cloud all night.
const SEEN = 20
// At 320 wide the disc is four pixels across and is drawn within two pixels of where the camera puts the moon's centre.
const SEEK = 4
const DISC = 9
const RING_FROM = 6
const RING_TO = 10

export interface MoonFrame { frame: number; disc: number; ring: number; x: number; y: number }
export interface MoonRow { night: number; first: number; last: number; missing: number; inFrame: number; peak: number; peakAt: number; from: number; to: number; dip: number; dipAt: number; before: number; after: number; ringMoved: number; trail: MoonFrame[]; seen: boolean; ok: boolean }
export interface MoonProof { findings: Finding[]; complete: boolean; rows: MoonRow[]; pictures: { file: string; caption: string }[] }

// The disc: the mean of its nine brightest pixels within reach of the moon's place. The ring: the median of the sky round it. Null when the moon is not in the frame.
export async function moonLevel(file: string, frame: number): Promise<MoonFrame | null> {
  const { data, info } = await sharp(file).removeAlpha().raw().toBuffer({ resolveWithObject: true })
  const scale = info.width / 320
  const place = moonPlace(frame, info.width / info.height)
  const cx = Math.round(place.x * info.width - 0.5)
  const cy = Math.round(place.y * info.height - 0.5)
  const reach = Math.ceil(RING_TO * scale)
  if (!place.ahead || cx < reach || cy < reach || cx >= info.width - reach || cy >= info.height - reach) return null
  const near: number[] = []
  const round: number[] = []
  for (let y = cy - reach; y <= cy + reach; y++) {
    for (let x = cx - reach; x <= cx + reach; x++) {
      const p = 3 * (y * info.width + x)
      const l = 0.2126 * data[p] + 0.7152 * data[p + 1] + 0.0722 * data[p + 2]
      const d = Math.hypot(x - cx, y - cy) / scale
      if (d <= SEEK) near.push(l)
      else if (d >= RING_FROM && d <= RING_TO) round.push(l)
    }
  }
  near.sort((a, b) => b - a)
  round.sort((a, b) => a - b)
  const count = Math.max(1, Math.round(DISC * scale * scale))
  const disc = near.slice(0, count).reduce((a, v) => a + v, 0) / Math.min(count, near.length)
  return { frame, disc, ring: round[Math.floor(round.length / 2)], x: cx, y: cy }
}

// The largest fall and return inside `INSIDE` frames: how far the lowest frame between two others lies under the lower of the two.
export function blinkOf(levels: number[]): { dip: number; at: number; before: number; after: number } {
  let best = { dip: 0, at: -1, before: -1, after: -1 }
  for (let i = 0; i < levels.length; i++) {
    for (let k = i + 2; k < levels.length && k - i < INSIDE; k++) {
      for (let j = i + 1; j < k; j++) {
        const dip = Math.min(levels[i], levels[k]) - levels[j]
        if (dip > best.dip) best = { dip, at: j, before: i, after: k }
      }
    }
  }
  return best
}

async function sheet(run: string, r: MoonRow, file: string, caption: string, gone: number): Promise<void> {
  const size = 24
  const zoom = 6
  const w = size * zoom
  const gap = 4
  const bar = 18
  const shown = r.trail.filter((f) => Math.abs(f.frame - r.dipAt) <= 5)
  const parts: Placed[] = [{ input: strip(Math.max(shown.length, 6) * (w + gap) - gap, bar + 2, caption), left: gap, top: gap }]
  for (let i = 0; i < shown.length; i++) {
    const f = shown[i]
    const left = gap + i * (w + gap)
    const top = bar + 2 + 2 * gap
    let cut = await cropped(frameFile(run, f.frame), f.x - size / 2, f.y - size / 2, size, size)
    if (f.frame === gone) cut = await sharp(cut).composite([{ input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${SEEK + 1}" fill="rgb(${Math.round(f.ring)},${Math.round(f.ring)},${Math.round(f.ring)})"/></svg>`) }]).png().toBuffer()
    parts.push({ input: await sharp(cut).resize(w, w, { kernel: 'nearest' }).png().toBuffer(), left, top })
    parts.push({ input: strip(w, bar, `${f.frame} · ${(f.disc - f.ring).toFixed(0)}${f.frame === r.dipAt ? ' · dip' : ''}`), left, top: top + w })
    parts.push({ input: strip(w, bar, `disc ${f.disc.toFixed(0)} ring ${f.ring.toFixed(0)}`), left, top: top + w + bar })
  }
  await canvas(Math.max(shown.length, 6) * (w + gap) + gap, bar + 2 + 2 * gap + w + 2 * bar + gap, parts).jpeg({ quality: 90 }).toFile(file)
}

export async function moonProof(broken: string | null): Promise<MoonProof> {
  const run = runName(null)
  const findings: Finding[] = []
  const rows: MoonRow[] = []
  const pictures: { file: string; caption: string }[] = []
  let complete = true
  const dir = path.join(OUT, 'nights', broken ? `broken-${broken}` : 'film')
  fs.mkdirSync(dir, { recursive: true })
  const kinds = nightsOf(filmClock)
  const nights = twilights().filter((t) => !kinds[t.night - 1].closesFilm && !kinds[t.night - 1].hold)
  const gone = new Map<number, number>()
  for (const t of nights) {
    const trail: MoonFrame[] = []
    let missing = 0
    let inFrame = 0
    for (let f = t.first; f <= t.last; f++) {
      const file = frameFile(run, f)
      if (!fs.existsSync(file)) {
        missing++
        continue
      }
      const m = await moonLevel(file, f)
      if (!m) continue
      inFrame++
      trail.push(m)
    }
    if (missing > 0) {
      complete = false
      continue
    }
    const level = (m: MoonFrame): number => m.disc - m.ring
    let peakIndex = 0
    for (let i = 1; i < trail.length; i++) if (level(trail[i]) > level(trail[peakIndex])) peakIndex = i
    const peak = trail.length ? level(trail[peakIndex]) : 0
    const seen = peak >= SEEN
    if (broken === 'moon-blink' && seen) {
      trail[peakIndex] = { ...trail[peakIndex], disc: trail[peakIndex].ring }
      gone.set(t.night, trail[peakIndex].frame)
    }
    let from = -1
    let to = -1
    for (let i = 0; i < trail.length; i++) {
      if (level(trail[i]) < 0.5 * peak) continue
      if (from < 0) from = i
      to = i
    }
    const judged = seen ? trail.slice(from, to + 1) : []
    const blink = blinkOf(judged.map(level))
    const ok = blink.dip <= BLINK
    const at = blink.at >= 0 ? judged[blink.at] : null
    rows.push({
      night: t.night, first: t.first, last: t.last, missing, inFrame, peak, peakAt: trail.length ? trail[peakIndex].frame : -1,
      from: seen ? judged[0].frame : -1, to: seen ? judged[judged.length - 1].frame : -1,
      dip: blink.dip, dipAt: at ? at.frame : -1, before: at ? judged[blink.before].frame : -1, after: at ? judged[blink.after].frame : -1,
      ringMoved: at ? at.ring - 0.5 * (judged[blink.before].ring + judged[blink.after].ring) : 0, trail, seen, ok,
    })
  }
  const seenRows = rows.filter((r) => r.seen)
  if (rows.length === 0) findings.push({ ok: true, expected: true, what: 'the moon is not judged: no night has all its frames drawn yet' })
  else if (seenRows.length === 0) findings.push({ ok: true, expected: true, what: `the moon is not judged: in none of the ${rows.length} nights drawn does its disc stand ${SEEN} of 255 over the sky round it` })
  else {
    const bad = seenRows.filter((r) => !r.ok)
    const worst = seenRows.reduce((a, r) => (r.dip > a.dip ? r : a), seenRows[0])
    const said = (r: MoonRow): string => {
      const of = (frame: number): string => (r.trail.find((x) => x.frame === frame)!.disc - r.trail.find((x) => x.frame === frame)!.ring).toFixed(0)
      return `${of(r.before)} at frame ${r.before}, ${of(r.dipAt)} at ${r.dipAt}, ${of(r.after)} at ${r.after}`
    }
    findings.push({ ok: bad.length === 0, what: `the moon (${seenRows.length} of ${nights.length} nights with its disc in the frame, the disc less the sky in a ring round it): ${bad.length === 0 ? 'it blinks in none' : `it blinks in ${bad.length}`}; between the first and the last frame at half its peak its level falls and comes back inside ${INSIDE} frames by at the most ${worst.dip.toFixed(1)} of 255${worst.dipAt >= 0 ? ` (night ${worst.night}: ${said(worst)})` : ''} against a limit of ${BLINK}` })
    for (const r of bad.slice(0, 6)) findings.push({ ok: false, what: `night ${r.night} (${barText(secondsOf(r.dipAt))}): the moon's disc falls and comes back by ${r.dip.toFixed(1)} of 255 inside ${INSIDE} frames: ${said(r)}; the sky round it ${Math.abs(r.ringMoved) < 3 ? 'stays as it is' : `moves ${r.ringMoved.toFixed(1)}`} at frame ${r.dipAt}, so ${Math.abs(r.ringMoved) < 3 ? 'it is the disc alone' : 'something crosses disc and sky'}; judged from frame ${r.from} to ${r.to}, peak ${r.peak.toFixed(0)} at frame ${r.peakAt}` })
    const unseen = rows.filter((r) => !r.seen)
    if (unseen.length) findings.push({ ok: true, expected: true, what: `the moon is not judged in ${unseen.length} nights (${unseen.map((r) => `night ${r.night}: ${r.inFrame === 0 ? 'out of the frame' : `at the most ${r.peak.toFixed(0)} over its ring`}`).join('; ')})` })
    for (const r of bad.length ? bad.slice(0, 2) : worst.dipAt >= 0 ? [worst] : []) {
      const file = path.join(dir, `moon-${String(r.night).padStart(2, '0')}.jpg`)
      const caption = `The moon in night ${r.night}, frames ${Math.max(r.from, r.dipAt - 5)} to ${Math.min(r.to, r.dipAt + 5)}, six times enlarged: ${r.ok ? 'largest' : 'FAIL,'} fall and return ${r.dip.toFixed(1)} of 255 at frame ${r.dipAt} (limit ${BLINK})`
      await sheet(run, { ...r, trail: r.trail.filter((x) => x.frame >= r.from && x.frame <= r.to) }, file, caption, gone.get(r.night) ?? -1)
      pictures.push({ file: path.relative(process.cwd(), file), caption: `${caption}. Under each frame: its number and the disc less the ring, then both` })
    }
  }
  if (rows.length < nights.length) findings.push({ ok: true, expected: true, what: `the moon: ${nights.length - rows.length} of ${nights.length} nights do not have every frame drawn yet` })
  const older = olderFilm(run)
  if (older && rows.length > 0) complete = false
  return { findings, complete, rows, pictures }
}
