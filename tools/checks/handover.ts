import fs from 'node:fs'
import path from 'node:path'
import type { Args } from '../lib/args.ts'
import { num } from '../lib/args.ts'
import { canvas, scaled, strip, type Placed } from '../lib/layout.ts'
import { barText, FRAMES, secondsOf } from './lib/film.ts'
import { finish, OUT, type Finding } from './lib/report.ts'
import { openSession } from './lib/session.ts'
import { dialsOf, handovers, measure } from './plantalone.ts'

const SENTENCE = "It goes from day to night in the sky repeatedly while it's actually growing, no more hard cuts."

// The plant drawn alone through the frames where the sun hands the light over to the moon, and the moon back to the sun: every frame, a few before the handover and a few after.
// The whole frame hides a plant that flickers there behind a sky that fades as it should, and the plant alone from the handover on (nights --plant) starts one frame too late to see it.
//   npm run checks -- nights --handover                     every dusk and dawn, 8 frames each side of the handover
//   npm run checks -- nights --handover --night 1,2,14,15   those nights only
//   npm run checks -- nights --handover --break plant-pop   the night's key is 6 times as strong from the third frame after each handover of a dusk: must fail
// The plant's mean over the pixels it covers is held to the limits of the whole frame: a step of at most STEP of 255 a frame, and at most BACK the wrong way (brighter in a dusk, darker in a dawn).
// Frames with rime or water on the plant are listed and not judged: both may brighten it.
const STEP = 14
const BACK = 2
const POP = 6

interface Frame { frame: number; mean: number; high: number; share: number; judged: boolean }
interface Side { night: number; side: 'dusk' | 'dawn'; handover: number; frames: Frame[]; step: number; stepAt: number; back: number; backAt: number; ok: boolean }

export async function run(args: Args): Promise<void> {
  const broken = typeof args.break === 'string' ? args.break : null
  if (broken && broken !== 'plant-pop') throw new Error('nights --handover can break the film with --break plant-pop')
  const round = Math.max(2, num(args, 'round', 8))
  const width = num(args, 'width', 640)
  const height = num(args, 'height', 360)
  const wanted = typeof args.night === 'string' || typeof args.night === 'number' ? String(args.night).split(',').map(Number) : null
  const all = handovers()
  const dir = path.join(OUT, 'handover', broken ? `broken-${broken}` : 'film')
  fs.rmSync(dir, { recursive: true, force: true })
  fs.mkdirSync(dir, { recursive: true })
  const sides: Side[] = []
  const session = await openSession({ width, height, only: 'plant' })
  try {
    for (const n of all) {
      if (wanted && !wanted.includes(n.night)) continue
      for (const side of ['dusk', 'dawn'] as const) {
        // The handover of a dusk is the first frame the moon lights, that of a dawn the first frame the sun lights again.
        const handover = side === 'dusk' ? n.dusk : n.dawn + 1
        if (broken) await session.fault('moon', side === 'dusk' ? POP : 1, handover + 3)
        const frames: Frame[] = []
        for (let f = Math.max(0, handover - round); f <= Math.min(FRAMES - 1, handover + round); f++) {
          const d = await session.draw(f, 'draft')
          fs.writeFileSync(path.join(dir, `${f}.png`), d.png as Buffer)
          const dials = dialsOf(f)
          frames.push({ frame: f, ...(await measure(d.png as Buffer, await session.covered())), judged: !dials.frosty && !dials.wet })
        }
        const way = side === 'dusk' ? 1 : -1
        let step = 0
        let stepAt = handover
        let back = 0
        let backAt = handover
        for (let i = 1; i < frames.length; i++) {
          if (!frames[i].judged || !frames[i - 1].judged || frames[i].share === 0 || frames[i - 1].share === 0) continue
          const d = frames[i].mean - frames[i - 1].mean
          if (Math.abs(d) > step) [step, stepAt] = [Math.abs(d), frames[i].frame]
          if (way * d > back) [back, backAt] = [way * d, frames[i].frame]
        }
        const s: Side = { night: n.night, side, handover, frames, step, stepAt, back, backAt, ok: step <= STEP && back <= BACK }
        sides.push(s)
        console.log(`nights · handover · night ${n.night} ${side} · frames ${frames[0].frame} to ${frames[frames.length - 1].frame}, handover ${handover} · mean ${frames.map((x) => x.mean.toFixed(1)).join(' ')} · largest step ${step.toFixed(2)} into ${stepAt}, the wrong way ${back.toFixed(2)} into ${backAt} · ${s.ok ? 'ok' : 'FAIL'}`)
      }
    }
  } finally {
    await session.close()
  }
  const judged = sides.filter((s) => s.frames.filter((f) => f.judged && f.share > 0).length >= 2)
  const bad = judged.filter((s) => !s.ok)
  const findings: Finding[] = []
  if (judged.length === 0) findings.push({ ok: false, what: 'no dusk or dawn has two frames of a dry plant round its handover' })
  else {
    const worst = judged.reduce((a, s) => (s.back > a.back ? s : a), judged[0])
    const quick = judged.reduce((a, s) => (s.step > a.step ? s : a), judged[0])
    findings.push({
      ok: bad.length === 0,
      what: `by the plant alone through the handover (${judged.length} of ${2 * all.length} dusks and dawns, every frame from ${round} before the handover to ${round} after, ${width} x ${height}, the mean over the pixels the plant covers): ${bad.length === 0 ? 'the plant only gets darker through each dusk and only brighter through each dawn' : `the plant flickers in ${bad.length}`}; the largest step is ${quick.step.toFixed(2)} of 255 a frame (night ${quick.night} ${quick.side}, into frame ${quick.stepAt}) against a limit of ${STEP}, the largest move the wrong way ${worst.back.toFixed(2)} (night ${worst.night} ${worst.side}, into frame ${worst.backAt}) against ${BACK}`,
    })
    for (const s of bad.slice(0, 8)) findings.push({ ok: false, what: `night ${s.night}, ${s.side} (handover at frame ${s.handover}, ${barText(secondsOf(s.handover))}): ${s.back > BACK ? `the plant's mean moves ${s.back.toFixed(2)} of 255 the wrong way into frame ${s.backAt}` : ''}${s.back > BACK && s.step > STEP ? '; ' : ''}${s.step > STEP ? `it steps ${s.step.toFixed(2)} into frame ${s.stepAt}` : ''}. Owner: src/plant` })
    if (bad.length > 8) findings.push({ ok: false, what: `and ${bad.length - 8} more` })
  }
  const out = sides.filter((s) => !judged.includes(s) || s.frames.some((f) => !f.judged))
  if (out.length) findings.push({ ok: true, expected: true, what: `listed, not judged: frames with rime or water on the plant, in ${out.length} dusks and dawns (${out.slice(0, 6).map((s) => `night ${s.night} ${s.side}`).join(', ')}${out.length > 6 ? ', ...' : ''})` })
  if (sides.length < 2 * all.length) findings.push({ ok: true, expected: true, what: `${2 * all.length - sides.length} of ${2 * all.length} dusks and dawns were left out with --night` })
  const pictures: { file: string; caption: string }[] = []
  const shown = (bad.length ? [...bad].sort((a, b) => b.back - a.back) : [...judged].sort((a, b) => b.back - a.back)).slice(0, 3)
  for (const s of shown) {
    const at = s.back > 0 ? s.backAt : s.stepAt
    const list = s.frames.filter((f) => Math.abs(f.frame - at) <= 3)
    const w = 320
    const h = Math.round((w * height) / width)
    const gap = 6
    const bar = 20
    const across = list.length * (w + gap) - gap
    const caption = `The plant alone, night ${s.night}, ${s.side}: its mean moves ${s.back.toFixed(2)} of 255 the wrong way into frame ${s.backAt}, largest step ${s.step.toFixed(2)} into ${s.stepAt}; the handover is frame ${s.handover}`
    const parts: Placed[] = [{ input: strip(across, bar + 2, caption), left: gap, top: gap }]
    for (let i = 0; i < list.length; i++) {
      const left = gap + i * (w + gap)
      parts.push({ input: await scaled(path.join(dir, `${list[i].frame}.png`), w, h), left, top: bar + 2 + 2 * gap })
      parts.push({ input: strip(w, bar, `${list[i].frame}${list[i].frame === s.handover ? ' handover' : ''} · mean ${list[i].mean.toFixed(1)}`), left, top: bar + 2 + 2 * gap + h })
    }
    const file = path.join(dir, `night-${String(s.night).padStart(2, '0')}-${s.side}.jpg`)
    await canvas(across + 2 * gap, 2 * bar + 2 + h + 3 * gap, parts).jpeg({ quality: 90 }).toFile(file)
    pictures.push({ file: path.relative(process.cwd(), file), caption })
  }
  finish({
    check: 'nights',
    name: 'nights.handover',
    sentence: SENTENCE,
    subject: broken ? 'a film whose night light jumps up three frames after each dusk hands over' : 'the film, the plant alone through each handover',
    broken,
    complete: sides.length === 2 * all.length,
    findings,
    pictures,
    table: { head: ['night', 'side', 'handover', 'mean before', 'at', 'after', 'largest step', 'into', 'the wrong way', 'into', 'verdict'], rows: sides.map((s) => [s.night, s.side, s.handover, (s.frames.find((f) => f.frame === s.handover - 1)?.mean ?? 0).toFixed(1), (s.frames.find((f) => f.frame === s.handover)?.mean ?? 0).toFixed(1), (s.frames.find((f) => f.frame === s.handover + 1)?.mean ?? 0).toFixed(1), s.step.toFixed(2), s.stepAt, s.back.toFixed(2), s.backAt, judged.includes(s) ? (s.ok ? 'ok' : 'FAIL') : 'not judged']) },
    data: { round, width, height, limits: { step: STEP, back: BACK }, sides },
  })
}
