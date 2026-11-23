import fs from 'node:fs'
import path from 'node:path'
import type { Args } from '../lib/args.ts'
import { flag, num } from '../lib/args.ts'
import { canvas, scaled, strip, type Placed } from '../lib/layout.ts'
import { cutFrames } from '../../src/v2/cuts.ts'
import { barText, filmClock, holds, secondsOf } from './lib/film.ts'
import { OUT, table, type Finding } from './lib/report.ts'
import { openSession } from './lib/session.ts'

export interface PictureProof { findings: Finding[]; complete: boolean; pictures: { file: string; caption: string }[]; data: unknown }

const PARTS = 'ground,plant,companion,field'
const VIEWS = ['wide', 'low']
// How far after the hold the control frame is taken. The plant grows again there, so the picture must have changed: a proof that could not see growth would pass this too.
const CONTROL_FRAMES = 45
// A pair of frames of one shot is the same when no more than MOST_NUMBERS of its numbers differ and none by more than MOST_BY.
// Not zero, for a reason that was measured: in flat light the blend between the hold's two keys runs with the frame number. The two keys hold the same plant,
// but the second slot of a hair's direction is packed in two floats and comes back up to 1.1e-7 off the first, so the blend nudges one hair's edge by 1e-7
// and it can cross a rounding step of the rasterizer: a few pixels on that edge change, nothing grows. Growth moves tens of thousands of numbers (the controls).
const MOST_NUMBERS = 16
const MOST_BY = 0.005
// The control has to differ in over this many times as many numbers and by over this many times as much, or the proof could not tell growth from an edge that flips.
const CONTROL_TIMES = 100
// The share of its second slot every part is pinned to for the second reading of each pair: with the blend out of the way the pair has to be exact.
const PIN = 0
// At most this many pairs of a hold and camera that break the rule are drawn again one part at a time to name who carries the difference.
const NAMED_MOST = 1

interface Pair { hold: string; view: string; span: number; a: number; b: number; differing: number; values: number; largest: number; control: boolean; pinned?: { differing: number; largest: number }; parts?: { part: string; differing: number; largest: number }[] }

// A hold split where the picture cuts: [first, last] of each stretch that stands in one shot.
export function shotSpans(first: number, last: number, cuts: number[]): [number, number][] {
  const at = cuts.filter((c) => c > first && c <= last).sort((a, b) => a - b)
  const starts = [first, ...at]
  return starts.map((from, i) => [from, i + 1 < starts.length ? starts[i + 1] - 1 : last])
}

const same = (p: Pair): boolean => p.differing <= MOST_NUMBERS && p.largest <= MOST_BY
const size = (v: number): string => (v === 0 ? '0' : v.toPrecision(3))
const told = (p: Pair): string => `frame ${p.a} against ${p.b} from ${p.view} (${barText(secondsOf(p.a))} against ${barText(secondsOf(p.b))}): ${p.differing} of ${p.values} numbers differ, the largest by ${p.largest === 0 ? '0' : p.largest.toPrecision(3)}${p.parts ? `; drawn one part at a time: ${p.parts.map((q) => `${q.part} ${q.differing}${q.differing ? ` (largest ${q.largest.toPrecision(3)})` : ''}`).join(', ')}` : ''}`

// The proof by the picture. Frames of a hold are drawn in flat light: wind at rest, no weather, no sky, the sun and the camera standing still.
// What is left of the film can only change with the plant's clock, so within one shot the pictures must be the same.
// Only frames that stand in the same shot are compared: the light of a close shot (its level, key and fill, src/v2/look.ts) follows the cut even in the world at rest,
// so a frame before a cut and a frame after it are lit differently with nothing grown. Each hold is split at the film's cuts (src/v2/cuts.ts) and of every stretch the first, middle and last frame are drawn.
// They are read before the lens and the grain, in the scene's own floating point numbers.
// Each pair is read twice: as the film blends its two keys, against the rule above, and with that blend pinned, where it has to be exact.
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
  let pinnedBlends = 0
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
        // The same pairs once more with the blend between the two keys pinned: what is left of a difference then is not the blend's rounding.
        const pins = await session.pin(PIN)
        for (const f of rows.flat()) {
          await session.draw(f, 'draft', false)
          await session.keep(`pinned ${f}`)
        }
        await session.pin(null)
        for (const p of mine) {
          if (p.control) continue
          const d = await session.differ(`pinned ${p.a}`, `pinned ${p.b}`)
          p.pinned = { differing: d.differing, largest: d.largest }
        }
        pinnedBlends = pins
        for (const p of mine) {
          console.log(`holds · ${h.name} · ${view} · ${p.a} against ${p.b}${p.control ? ' (the control)' : ''}: ${p.differing} of ${p.values} numbers differ, the largest by ${size(p.largest)}${p.control ? '' : same(p) ? ' · the same by the rule' : ' · NOT the same by the rule'}`)
          if (p.pinned) console.log(`holds · ${h.name} · ${view} · ${p.a} against ${p.b}, the blend pinned: ${p.pinned.differing} of ${p.values} numbers differ, the largest by ${size(p.pinned.largest)}${p.pinned.differing === 0 ? ' · exact' : ' · NOT exact'}`)
        }
        // Who carries a difference that breaks the rule: the two frames drawn again with one part at a time.
        const named = mine.filter((p) => !p.control && !same(p)).slice(0, NAMED_MOST)
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
  const everyControl = pairs.filter((p) => p.control)
  const leastNumbers = Math.min(...everyControl.map((p) => p.differing))
  const leastBy = Math.min(...everyControl.map((p) => p.largest))
  const rule = `A pair is the same when no more than ${MOST_NUMBERS} of its numbers differ and none by more than ${MOST_BY}: a hair's edge can flip by one rounding step of the rasterizer, and ${CONTROL_FRAMES} frames of growth move ${leastNumbers} numbers or more by up to ${size(leastBy)} or more (the controls)`
  console.log(`\n${table(['hold', 'camera', 'shot', 'frames', 'numbers that differ', 'of', 'largest', 'by the rule', 'pinned: differ', 'pinned: largest'], pairs.map((p) => [p.hold, p.view, p.control ? 'control' : p.span + 1, `${p.a} against ${p.b}`, p.differing, p.values, size(p.largest), p.control ? '' : same(p) ? 'the same' : 'NOT the same', p.pinned ? p.pinned.differing : '', p.pinned ? size(p.pinned.largest) : '']))}\n`)
  console.log(`holds · the rule · ${rule}`)
  for (const h of holds) {
    const spans = spansOf.get(h.name) as [number, number][]
    const mine = pairs.filter((p) => p.hold === h.name)
    const inside = mine.filter((p) => !p.control)
    const moved = inside.filter((p) => !same(p))
    const stepped = inside.filter((p) => p.differing > 0 && same(p))
    const loose = inside.filter((p) => !p.pinned || p.pinned.differing !== 0)
    const controls = mine.filter((p) => p.control)
    const blind = controls.filter((p) => !(p.differing > CONTROL_TIMES * MOST_NUMBERS && p.largest > CONTROL_TIMES * MOST_BY))
    const tauStep = filmClock.at(secondsOf(h.last + CONTROL_FRAMES)).tau - filmClock.at(secondsOf(h.last)).tau
    const shots = `${spans.length === 1 ? 'one shot' : `${spans.length} shots, split at the cuts`}: ${spans.map(([a, b]) => `${a} to ${b}`).join(', ')}`
    const why = spans.length > 1 ? '. Frames of different shots are not compared: the light of a close shot follows the cut even in the world at rest' : ''
    findings.push({
      ok: moved.length === 0,
      what: moved.length === 0
        ? `${h.name} by the picture (${width} x ${height}, ${PARTS}, cameras ${VIEWS.join(' and ')}; ${shots}): in every shot the first, middle and last frame are the same in all ${inside.length} pairs${why}. ${rule}. ${stepped.length === 0 ? 'No number differs at all' : `What differs inside the rule: ${stepped.map(told).join('; ')}`}`
        : `${h.name} by the picture (${shots}): ${moved.length} of ${inside.length} pairs are not the same: ${moved.map(told).join('; ')}${stepped.length ? `. Inside the rule: ${stepped.map(told).join('; ')}` : ''}. ${rule}`,
    })
    const pinnedHow = `with the blend between the hold's two keys pinned (every part of the plant and its companion drawn with ${PIN} of its second slot, ${pinnedBlends} blends, set from the check's page)`
    findings.push({
      ok: loose.length === 0,
      what: loose.length === 0
        ? `${h.name}, ${pinnedHow}: all ${inside.length} pairs are exact, 0 of ${inside[0].values} numbers differ. ${moved.length ? 'That does not clear the pairs above: a pinned picture cannot see growth between two keys' : stepped.length ? 'So the numbers that differ with the blend running are the rounding of the blend and nothing else' : 'The blend running or pinned, nothing differs'}`
        : `${h.name}, ${pinnedHow}: ${loose.length} of ${inside.length} pairs are not exact: ${loose.map((p) => `frame ${p.a} against ${p.b} from ${p.view}: ${p.pinned ? `${p.pinned.differing} of ${p.values} numbers differ, the largest by ${size(p.pinned.largest)}` : 'not read'}`).join('; ')}. Something other than the rounding of the blend changes the picture inside the hold`,
    })
    findings.push({
      ok: blind.length === 0,
      what: blind.length === 0
        ? `${h.name}, the control: ${CONTROL_FRAMES} frames after the hold the plant's clock has moved ${tauStep.toFixed(3)} and ${controls.map((p) => `${p.differing} numbers differ from ${p.view}, the largest by ${size(p.largest)}`).join(', ')}: over ${CONTROL_TIMES} times as many and by over ${CONTROL_TIMES} times as much as the rule lets pass, so this proof does see growth`
        : `${h.name}, the control: ${CONTROL_FRAMES} frames after the hold the plant's clock has moved ${tauStep.toFixed(3)} and the picture has not changed in over ${CONTROL_TIMES * MOST_NUMBERS} numbers and by over ${CONTROL_TIMES * MOST_BY} from ${blind.map((p) => `${p.view} (${p.differing} numbers, the largest by ${size(p.largest)})`).join(' and ')}: this proof cannot see growth there`,
    })
  }
  return { findings, complete: true, pictures, data: { width, height, parts: PARTS, views: VIEWS, rule: { mostNumbers: MOST_NUMBERS, mostBy: MOST_BY, controlTimes: CONTROL_TIMES, pinnedTo: PIN, pinnedBlends }, spans: Object.fromEntries(spansOf), pairs } }
}
