import type { Args } from '../lib/args.ts'
import { shutterSeconds } from '../../src/v2/now.ts'
import { barText, clockOf, FRAMES, holds, secondsOf } from './lib/film.ts'
import { finish, type Finding } from './lib/report.ts'
import { pictureProof } from './holdpictures.ts'

const SENTENCE = 'for the rainy, frosty scenes the flower should not be growing'

export async function run(args: Args): Promise<void> {
  const broken = typeof args.break === 'string' ? args.break : null
  const film = clockOf(broken && !broken.startsWith('picture-') ? broken : null)
  const findings: Finding[] = []
  const rows: (string | number)[][] = []
  for (const h of holds) {
    const tau = film.at(secondsOf(h.first)).tau
    let lo = tau
    let hi = tau
    let moved = 0
    let firstMoved = -1
    // Every frame of the hold at the open shutter and at its close: the blur of a frame may not reach into growth either.
    for (let f = h.first; f <= h.last; f++) {
      for (const s of [secondsOf(f), secondsOf(f) + shutterSeconds]) {
        const v = film.at(s).tau
        lo = Math.min(lo, v)
        hi = Math.max(hi, v)
        if (v !== tau) {
          moved++
          if (firstMoved < 0) firstMoved = f
        }
      }
    }
    const before = film.at(secondsOf(h.first - 1)).tau
    const after = film.at(secondsOf(h.last + 2)).tau
    const ok = moved === 0
    rows.push([h.name, `${h.fromBar} to ${h.toBar}`, `${h.first} to ${h.last}`, h.last - h.first + 1, tau, (hi - lo).toExponential(2), (tau - before).toExponential(2), (after - tau).toExponential(2), ok ? 'still' : 'FAIL: grows'])
    findings.push({
      ok,
      what: ok
        ? `${h.name} (bars ${h.fromBar} to ${h.toBar}, frames ${h.first} to ${h.last}): the plant's clock is ${tau} on every one of its ${h.last - h.first + 1} frames, at the open shutter and at its close`
        : `${h.name}: the plant's clock moves by ${(hi - lo).toPrecision(3)} inside the hold, first at frame ${firstMoved} (${secondsOf(firstMoved).toFixed(3)} s, ${barText(secondsOf(firstMoved))}), on ${moved} of ${2 * (h.last - h.first + 1)} readings`,
    })
  }
  // The clock is not simply standing still everywhere: say how much of the rest of the film it moves in.
  let moving = 0
  let outside = 0
  for (let f = 1; f < FRAMES; f++) {
    if (holds.some((h) => f >= h.first && f <= h.last)) continue
    outside++
    if (film.at(secondsOf(f)).tau !== film.at(secondsOf(f - 1)).tau) moving++
  }
  findings.push({ ok: moving > 0, what: `outside the holds the plant's clock moves on ${moving} of ${outside} frames, so a clock that stood still everywhere would not pass unseen` })
  const proof = await pictureProof(args, broken)
  findings.push(...proof.findings)
  finish({
    check: 'holds',
    sentence: SENTENCE,
    subject: broken?.startsWith('picture-') ? `the film drawn with ${broken}` : film.name,
    broken,
    complete: proof.complete,
    findings,
    table: { head: ['hold', 'bars', 'frames', 'count', 'plant clock', 'spread in the hold', 'step into it', 'step out of it', 'verdict'], rows },
    pictures: proof.pictures,
    data: { holds, picture: proof.data },
  })
}
