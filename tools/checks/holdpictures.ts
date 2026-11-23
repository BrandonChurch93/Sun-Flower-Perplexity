import fs from 'node:fs'
import path from 'node:path'
import type { Args } from '../lib/args.ts'
import { flag, num } from '../lib/args.ts'
import { canvas, scaled, strip, type Placed } from '../lib/layout.ts'
import { barText, filmClock, holds, secondsOf } from './lib/film.ts'
import { OUT, type Finding } from './lib/report.ts'
import { openSession } from './lib/session.ts'

export interface PictureProof { findings: Finding[]; complete: boolean; pictures: { file: string; caption: string }[]; data: unknown }

const PARTS = 'ground,plant,companion,field'
const VIEWS = ['wide', 'low']
// How far after the hold the control frame is taken. The plant grows again there, so the picture must have changed: a proof that could not see growth would pass this too.
const CONTROL_FRAMES = 45

interface Pair { hold: string; view: string; a: number; b: number; differing: number; values: number; largest: number; control: boolean }

// The proof by the picture. The hold's first, second, middle and last frame are drawn in flat light: wind at rest, no weather, no sky,
// the sun and the camera standing still. What is left of the film can only change with the plant's clock, so the pictures must be the same number for number.
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
  try {
    await session.still(true)
    if (broken === 'picture-grows') await session.fault('grow', secondsOf(holds[0].first + 2), secondsOf(holds[0].last))
    for (const h of holds) {
      const frames = [h.first, h.first + 1, Math.round(0.5 * (h.first + h.last)), h.last]
      const control = h.last + CONTROL_FRAMES
      for (const view of VIEWS) {
        await session.setView(view)
        const files: string[] = []
        for (const f of [...frames, control]) {
          const d = await session.draw(f, 'draft')
          await session.keep(String(f))
          const file = path.join(dir, `${h.name.toLowerCase()}-${view}-${f}.png`)
          fs.writeFileSync(file, d.png as Buffer)
          files.push(file)
          console.log(`holds · ${h.name} · ${view} · frame ${f} drawn in ${d.seconds.toFixed(1)} s`)
        }
        const mid = frames[2]
        for (const [a, b, isControl] of [[frames[0], mid, false], [frames[1], mid, false], [mid, frames[3], false], [frames[3], control, true]] as [number, number, boolean][]) {
          const d = await session.differ(String(a), String(b))
          pairs.push({ hold: h.name, view, a, b, differing: d.differing, values: d.values, largest: d.largest, control: isControl })
        }
        const mine = pairs.filter((p) => p.hold === h.name && p.view === view)
        const w = 400
        const hh = Math.round((w * height) / width)
        const gap = 6
        const bar = 20
        const all = [...frames, control]
        const parts: Placed[] = [{ input: strip(all.length * (w + gap) - gap, bar + 2, `${h.name} hold, bars ${h.fromBar} to ${h.toBar}, in flat light from the ${view} camera: wind at rest, no weather, no sky. ${mine.filter((p) => !p.control).map((p) => `${p.a} against ${p.b}: ${p.differing} numbers differ`).join(' · ')}`), left: gap, top: gap }]
        for (let i = 0; i < all.length; i++) {
          const left = gap + i * (w + gap)
          const what = i === 0 ? 'first frame of the hold' : i === 1 ? 'second' : i === 2 ? 'middle' : i === 3 ? 'last frame of the hold' : `${CONTROL_FRAMES} frames after it: growing again`
          parts.push({ input: await scaled(files[i], w, hh), left, top: bar + 2 + 2 * gap })
          parts.push({ input: strip(w, bar, `frame ${all[i]} · ${what}`), left, top: bar + 2 + 2 * gap + hh })
        }
        const sheet = path.join(dir, `${h.name.toLowerCase()}-${view}.jpg`)
        await canvas(all.length * (w + gap) + gap, 2 * bar + 2 + hh + 3 * gap, parts).jpeg({ quality: 90 }).toFile(sheet)
        pictures.push({ file: sheet, caption: `${h.name} hold from the ${view} camera in flat light: first, second, middle and last frame, and one after the hold` })
      }
    }
  } finally {
    await session.close()
  }
  for (const h of holds) {
    const mine = pairs.filter((p) => p.hold === h.name)
    const moved = mine.filter((p) => !p.control && p.differing > 0)
    const blind = mine.filter((p) => p.control && p.differing === 0)
    const tauStep = filmClock.at(secondsOf(h.last + CONTROL_FRAMES)).tau - filmClock.at(secondsOf(h.last)).tau
    findings.push({
      ok: moved.length === 0,
      what: moved.length === 0
        ? `${h.name} by the picture (${width} x ${height}, ${PARTS}, cameras ${VIEWS.join(' and ')}): frames ${mine[0].a}, ${mine[1].a}, ${mine[1].b} and ${mine[2].b} are the same in every one of ${mine[0].values} numbers`
        : `${h.name} by the picture: ${moved.map((p) => `frame ${p.a} against ${p.b} from ${p.view} (${barText(secondsOf(p.a))} against ${barText(secondsOf(p.b))}): ${p.differing} of ${p.values} numbers differ, the largest by ${p.largest.toPrecision(3)}`).join('; ')}`,
    })
    findings.push({
      ok: blind.length === 0,
      what: blind.length === 0
        ? `${h.name}, the control: ${CONTROL_FRAMES} frames after the hold the plant's clock has moved ${tauStep.toFixed(3)} and ${mine.filter((p) => p.control).map((p) => `${p.differing} numbers differ from ${p.view}`).join(', ')}, so this proof does see growth`
        : `${h.name}, the control: ${CONTROL_FRAMES} frames after the hold the plant's clock has moved ${tauStep.toFixed(3)} and the picture has not changed from ${blind.map((p) => p.view).join(' and ')}: this proof cannot see growth there`,
    })
  }
  return { findings, complete: true, pictures, data: { width, height, parts: PARTS, views: VIEWS, pairs } }
}
