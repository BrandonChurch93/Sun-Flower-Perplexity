import type { Args } from '../lib/args.ts'
import { num } from '../lib/args.ts'
import { barText, clockOf, crossing, FRAME, FRAMES, holds, secondsOf } from './lib/film.ts'
import { duskProof } from './dusks.ts'
import { finish, table, type Finding } from './lib/report.ts'

// "we shouldn't have a super long night stage either because it looks weird that the sunflower is growing at night"
const SENTENCE = "we shouldn't have a super long night stage either because it looks weird that the sunflower is growing at night"
const DARK_DEG = -6

export interface Night { from: number; to: number; seconds: number; opensFilm: boolean; closesFilm: boolean; deepestDeg: number; darkSeconds: number; tauMoved: number; hold: string | null }

export function nightsOf(film: ReturnType<typeof clockOf>): Night[] {
  const elevation = (s: number): number => film.at(s).sunElevationDeg
  const end = secondsOf(FRAMES - 1)
  const nights: Night[] = []
  let f = 0
  while (f < FRAMES) {
    if (elevation(secondsOf(f)) >= 0) {
      f++
      continue
    }
    const first = f
    while (f < FRAMES && elevation(secondsOf(f)) < 0) f++
    const last = f - 1
    const from = first === 0 ? 0 : crossing(elevation, secondsOf(first - 1), secondsOf(first))
    const to = last === FRAMES - 1 ? end : crossing(elevation, secondsOf(last), secondsOf(last + 1))
    let deepest = 0
    let dark = 0
    const steps = Math.max(1, Math.ceil((to - from) / (FRAME / 8)))
    for (let i = 0; i <= steps; i++) {
      const e = elevation(from + ((to - from) * i) / steps)
      deepest = Math.min(deepest, e)
      if (e < DARK_DEG && i < steps) dark += (to - from) / steps
    }
    const middle = 0.5 * (from + to)
    const hold = holds.find((h) => middle >= secondsOf(h.first) && middle < secondsOf(h.last + 1))
    nights.push({ from, to, seconds: to - from, opensFilm: first === 0, closesFilm: last === FRAMES - 1, deepestDeg: deepest, darkSeconds: dark, tauMoved: film.at(to).tau - film.at(from).tau, hold: hold ? hold.name : null })
  }
  return nights
}

export async function run(args: Args): Promise<void> {
  const broken = typeof args.break === 'string' ? args.break : null
  const film = clockOf(broken && !broken.startsWith('picture-') ? broken : null)
  const limit = num(args, 'limit', 1.2)
  const nights = nightsOf(film)
  const findings: Finding[] = []
  const rows = nights.map((n, i) => {
    let verdict = 'ok'
    if (n.closesFilm) {
      // The stretch after the last sunset has no sunrise: it is the film's ending, and it may not reach real darkness.
      const ok = n.deepestDeg > DARK_DEG
      verdict = ok ? 'ending, listed' : 'FAIL: dark'
      findings.push({ ok, expected: ok, what: `the film ends ${n.seconds.toFixed(2)} s after its last sunset, the sun ${(-n.deepestDeg).toFixed(1)} degrees under at the last frame, the plant's clock moves ${n.tauMoved.toFixed(3)} in it: ${ok ? `an ending in twilight, not a night (no sunrise follows, and the sun stays above ${DARK_DEG} degrees)` : `the ending reaches real darkness (sun under ${DARK_DEG} degrees)`}` })
    } else if (n.hold) {
      verdict = 'in a hold, listed'
      findings.push({ ok: true, expected: true, what: `night ${i + 1} at ${n.from.toFixed(2)} s lies in the hold "${n.hold}" (${n.seconds.toFixed(2)} s): not judged by the limit` })
    } else if (n.seconds > limit) {
      verdict = 'FAIL: too long'
      findings.push({ ok: false, what: `night ${i + 1} from ${n.from.toFixed(2)} s (${barText(n.from)}) lasts ${n.seconds.toFixed(2)} s, over the limit of ${limit} s, and the plant's clock moves ${n.tauMoved.toFixed(3)} in it` })
    }
    return [i + 1, n.from.toFixed(3), barText(n.from).slice(4), n.to.toFixed(3), barText(n.to).slice(4), n.seconds.toFixed(3), n.deepestDeg.toFixed(1), n.darkSeconds.toFixed(3), n.tauMoved.toFixed(3), n.opensFilm ? 'lead-in' : n.closesFilm ? 'ending' : n.hold ? `hold: ${n.hold}` : 'time lapse', verdict]
  })
  const judged = nights.filter((n) => !n.closesFilm && !n.hold)
  const longest = judged.reduce((a, n) => Math.max(a, n.seconds), 0)
  const total = nights.reduce((a, n) => a + n.seconds, 0)
  const dark = nights.reduce((a, n) => a + n.darkSeconds, 0)
  const longestDark = nights.reduce((a, n) => Math.max(a, n.darkSeconds), 0)
  findings.unshift({ ok: longest <= limit && judged.length > 0, what: `${judged.length} nights between a sunset and a sunrise outside the holds, the longest ${longest.toFixed(3)} s against a limit of ${limit} s` })
  findings.push({ ok: true, what: `the sun is under the horizon for ${total.toFixed(2)} s of ${secondsOf(FRAMES).toFixed(0)} in all, and more than ${-DARK_DEG} degrees under for ${dark.toFixed(2)} s, never longer than ${longestDark.toFixed(2)} s at a time` })
  const proof = broken && !broken.startsWith('picture-') ? null : await duskProof(args, broken)
  if (proof) {
    findings.push(...proof.findings)
    if (proof.rows.length) {
      const f1 = (x: number): string => x.toFixed(1)
      console.log(table(['night', 'frames', 'midnight', 'before', 'darkest', 'after', 'largest fall', 'into', 'largest rise', 'into', 'wrong way', 'in a part', 'into', 'parts at once', 'dusk frames', 'dawn frames', 'verdict'], proof.rows.map((r) => [r.night, `${r.first} to ${r.last}`, r.midnight, f1(r.day), f1(r.dark), f1(r.after), f1(r.fall), r.fallAt, f1(r.rise), r.riseAt, r.wrong.toFixed(2), f1(r.part), r.partAt, r.partsAtOnce, r.duskFrames, r.dawnFrames, r.ok ? 'ok' : 'FAIL'])) + '\n')
    }
  }
  finish({
    check: 'nights',
    sentence: SENTENCE,
    subject: broken === 'picture-quick' ? 'a film whose nights run three times as fast' : broken === 'picture-bounce' ? 'a film with two frames of each dusk the wrong way round' : film.name,
    broken,
    complete: proof ? proof.complete : true,
    pictures: proof?.pictures,
    findings,
    table: { head: ['night', 'sunset s', 'bar', 'sunrise s', 'bar', 'length s', 'deepest deg', `under ${DARK_DEG} deg s`, 'plant clock moved', 'where', 'verdict'], rows },
    data: { limit, nights, step: proof?.step, dusks: proof?.rows },
  })
}
