import fs from 'node:fs'
import path from 'node:path'
import type { Args } from '../lib/args.ts'
import { flag, num } from '../lib/args.ts'
import { canvas, scaled, strip, type Placed } from '../lib/layout.ts'
import { cutFrames } from '../../src/v2/cuts.ts'
import { barText, filmClock, holds, secondsOf } from './lib/film.ts'
import { OUT, type Finding } from './lib/report.ts'
import { openSession } from './lib/session.ts'

export interface PictureProof { findings: Finding[]; complete: boolean; pictures: { file: string; caption: string }[]; data: unknown }

const PARTS = 'ground,plant,companion,field'
const VIEWS = ['wide', 'low']
// How far after the hold the control frame is taken. The plant grows again there, so the picture must have changed: a proof that could not see growth would pass this too.
const CONTROL_FRAMES = 45
// Two frames are the same when no number differs by more than this. The picture is kept in half floats, and one step of a half float between 0.5 and 1 is 0.000488:
// a number that lands on the other side of a step is not growth. The count and the largest difference are printed whatever they are.
const SAME = 0.001
// The control has to differ by far more than that, or the proof could not tell growth from a step of the number format.
const CONTROL_TIMES = 100
// At most this many pairs of a hold are drawn again one part at a time to name who carries a difference.
const NAMED_MOST = 3

interface Pair { hold: string; view: string; span: number; a: number; b: number; differing: number; values: number; largest: number; control: boolean; parts?: { part: string; differing: number; largest: number }[] }

// A hold split where the picture cuts: [first, last] of each stretch that stands in one shot.
export function shotSpans(first: number, last: number, cuts: number[]): [number, number][] {
  const at = cuts.filter((c) => c > first && c <= last).sort((a, b) => a - b)
  const starts = [first, ...at]
  return starts.map((from, i) => [from, i + 1 < starts.length ? starts[i + 1] - 1 : last])
}

const told = (p: Pair): string => `frame ${p.a} against ${p.b} from ${p.view} (${barText(secondsOf(p.a))} against ${barText(secondsOf(p.b))}): ${p.differing} of ${p.values} numbers differ, the largest by ${p.largest === 0 ? '0' : p.largest.toPrecision(3)}${p.parts ? `; drawn one part at a time: ${p.parts.map((q) => `${q.part} ${q.differing}${q.differing ? ` (largest ${q.largest.toPrecision(3)})` : ''}`).join(', ')}` : ''}`

// The proof by the picture. Frames of a hold are drawn in flat light: wind at rest, no weather, no sky, the sun and the camera standing still.
// What is left of the film can only change with the plant's clock, so within one shot the pictures must be the same.
// Only frames that stand in the same shot are compared: the light of a close shot (its level, key and fill, src/v2/look.ts) follows the cut even in the world at rest,
// so a frame before a cut and a frame after it are lit differently with nothing grown. Each hold is split at the film's cuts (src/v2/cuts.ts) and of every stretch the first, middle and last frame are drawn.
// They are read before the lens and the grain, in the scene's own floating point numbers.
//   npm run checks -- holds --no-pictures              the proof by the clock alone
//   npm run checks -- holds --break picture-grows      a film whose plant grows on through the frost hold while its clock reads still: must fail
export async function pictureProof(args: Args, broken: string | null): Promise<PictureProof> {
  if (flag(args, 'no-pictures')) return { findings: [{ ok: true, expected: true, what: 'the proof by the picture was left out with --no-pictures' }], complete: false, pictures: [], data: null }
  if (broken && broken !== 'picture-grows') return { findings: [{ ok: true, expected: true, what: 'the proof by the picture is not run on a film whose clock is broken: the clock already fails it' }], complete: true, pictures: [], data: null }
  const width = num(args, 'width', 640)
  const height = num(args, 'height', 360)
  const dir = path.join(OUT, 'holds', broken ? `broken-${broken}` : 'film')
  fs.rmSync(dir, { recursive: true, force: true })
  fs.mkdirSync(dir, { recursive: true })
  const session = await openSession({ width, height, sky: typeof args.sky === 'string' ? args.sky : undefined, only: PARTS, view: VIEWS[0] })
  const pairs: Pair[] = []
  const findings: Finding[] = []
  const pictures: { file: string; caption: string }[] = []
  const spansOf = new Map(holds.map((h) => [h.name, shotSpans(h.first, h.last, cutFrames)]))
  try {
    await session.still(true)
    if (broken === 'picture-grows') await session.fault('grow', secondsOf(holds[0].first + 2), secondsOf(holds[0].last))
    for (const h of holds) {
      const spans = spansOf.get(h.name) as [number, number][]
      const rows = spans.map(([a, b]) => [a, Math.round(0.5 * (a + b)), b])
      const control = h.last + CONTROL_FRAMES
      for (const view of VIEWS) {
        await session.setView(view)
        const fileOf = (f: number): string => path.join(dir, `${h.name.toLowerCase()}-${view}-${f}.png`)
        for (const f of [...rows.flat(), control]) {
          const d = await session.draw(f, 'draft')
          await session.keep(String(f))
          fs.writeFileSync(fileOf(f), d.png as Buffer)
          console.log(`holds · ${h.name} · ${view} · frame ${f} drawn in ${d.seconds.toFixed(1)} s`)
        }
        for (let s = 0; s < rows.length; s++) {
          const [first, mid, last] = rows[s]
          for (const [a, b] of [[first, mid], [mid, last]]) {
            const d = await session.differ(String(a), String(b))
            pairs.push({ hold: h.name, view, span: s, a, b, differing: d.differing, values: d.values, largest: d.largest, control: false })
          }
        }
        const c = await session.differ(String(h.last), String(control))
        pairs.push({ hold: h.name, view, span: rows.length - 1, a: h.last, b: control, differing: c.differing, values: c.values, largest: c.largest, control: true })
        const mine = pairs.filter((p) => p.hold === h.name && p.view === view)
        const w = 400
        const hh = Math.round((w * height) / width)
        const gap = 6
        const bar = 20
        const columns = 4
        const wide = columns * (w + gap) + gap
        const rowTall = hh + bar + gap
        const parts: Placed[] = [{ input: strip(wide - 2 * gap, bar + 2, `${h.name} hold, bars ${h.fromBar} to ${h.toBar}, flat light, ${view} camera: wind at rest, no weather, no sky. One row a shot: first, middle, last frame. Only frames of one shot are compared: a close shot's light follows the cut`), left: gap, top: gap }]
        for (let s = 0; s < rows.length; s++) {
          const top = bar + 2 + 2 * gap + s * rowTall
          const inRow = mine.filter((p) => p.span === s && !p.control)
          for (let i = 0; i < 3; i++) {
            const left = gap + i * (w + gap)
            const what = i === 0 ? 'first of the shot' : `${i === 1 ? 'middle' : 'last'} · ${inRow[i - 1].differing} differ from ${i === 1 ? 'first' : 'middle'}, most ${inRow[i - 1].largest === 0 ? '0' : inRow[i - 1].largest.toPrecision(2)}`
            parts.push({ input: await scaled(fileOf(rows[s][i]), w, hh), left, top })
            parts.push({ input: strip(w, bar, `frame ${rows[s][i]} · ${what}`), left, top: top + hh })
          }
        }
        const lastTop = bar + 2 + 2 * gap + (rows.length - 1) * rowTall
        parts.push({ input: await scaled(fileOf(control), w, hh), left: gap + 3 * (w + gap), top: lastTop })
        parts.push({ input: strip(w, bar, `frame ${control} · ${CONTROL_FRAMES} frames after the hold: growing`), left: gap + 3 * (w + gap), top: lastTop + hh })
        const sheet = path.join(dir, `${h.name.toLowerCase()}-${view}.jpg`)
        await canvas(wide, bar + 2 + 2 * gap + rows.length * rowTall, parts).jpeg({ quality: 90 }).toFile(sheet)
        pictures.push({ file: sheet, caption: `${h.name} hold from the ${view} camera in flat light: one row a shot with its first, middle and last frame, and one frame after the hold` })
        // Who carries a difference inside a shot: the two frames drawn again with one part at a time.
        const named = mine.filter((p) => !p.control && p.differing > 0).slice(0, NAMED_MOST)
        for (const p of named) {
          p.parts = []
          for (const part of PARTS.split(',')) {
            await session.only([part])
            await session.draw(p.a, 'draft', false)
            await session.keep('part a')
            await session.draw(p.b, 'draft', false)
            await session.keep('part b')
            const d = await session.differ('part a', 'part b')
            p.parts.push({ part, differing: d.differing, largest: d.largest })
            console.log(`holds · ${h.name} · ${view} · ${p.a} against ${p.b} with ${part} alone: ${d.differing} numbers differ, the largest by ${d.largest}`)
          }
        }
        if (named.length) await session.only(PARTS.split(','))
      }
    }
  } finally {
    await session.close()
  }
  for (const h of holds) {
    const spans = spansOf.get(h.name) as [number, number][]
    const mine = pairs.filter((p) => p.hold === h.name)
    const inside = mine.filter((p) => !p.control)
    const moved = inside.filter((p) => p.largest > SAME || Number.isNaN(p.largest))
    const stepped = inside.filter((p) => p.differing > 0 && !moved.includes(p))
    const controls = mine.filter((p) => p.control)
    const blind = controls.filter((p) => !(p.largest > CONTROL_TIMES * SAME))
    const tauStep = filmClock.at(secondsOf(h.last + CONTROL_FRAMES)).tau - filmClock.at(secondsOf(h.last)).tau
    const shots = `${spans.length === 1 ? 'one shot' : `${spans.length} shots, split at the cuts`}: ${spans.map(([a, b]) => `${a} to ${b}`).join(', ')}`
    const why = spans.length > 1 ? '. Frames of different shots are not compared: the light of a close shot follows the cut even in the world at rest' : ''
    findings.push({
      ok: moved.length === 0,
      what: moved.length === 0
        ? `${h.name} by the picture (${width} x ${height}, ${PARTS}, cameras ${VIEWS.join(' and ')}; ${shots}): in every shot the first, middle and last frame are the same, no number of ${inside[0].values} differs by more than ${SAME} in any of ${inside.length} pairs${why}. ${stepped.length === 0 ? 'No number differs at all' : `Under that: ${stepped.map(told).join('; ')}`}`
        : `${h.name} by the picture (${shots}; the same means no number differs by more than ${SAME}): ${moved.map(told).join('; ')}${stepped.length ? `. Under ${SAME}: ${stepped.map(told).join('; ')}` : ''}`,
    })
    findings.push({
      ok: blind.length === 0,
      what: blind.length === 0
        ? `${h.name}, the control: ${CONTROL_FRAMES} frames after the hold the plant's clock has moved ${tauStep.toFixed(3)} and ${controls.map((p) => `${p.differing} numbers differ from ${p.view}, the largest by ${p.largest.toPrecision(3)}`).join(', ')}, over ${CONTROL_TIMES} times what counts as the same, so this proof does see growth`
        : `${h.name}, the control: ${CONTROL_FRAMES} frames after the hold the plant's clock has moved ${tauStep.toFixed(3)} and the picture has not changed by more than ${CONTROL_TIMES * SAME} from ${blind.map((p) => `${p.view} (${p.differing} numbers, the largest by ${p.largest === 0 ? '0' : p.largest.toPrecision(3)})`).join(' and ')}: this proof cannot see growth there`,
    })
  }
  return { findings, complete: true, pictures, data: { width, height, parts: PARTS, views: VIEWS, same: SAME, spans: Object.fromEntries(spansOf), pairs } }
}
