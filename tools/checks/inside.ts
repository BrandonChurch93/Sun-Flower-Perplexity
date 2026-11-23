import { spawnSync } from 'node:child_process'
import type { Args } from '../lib/args.ts'
import { num, str } from '../lib/args.ts'
import { FRAMES } from './lib/film.ts'
import { finish, type Finding } from './lib/report.ts'
import { openSession } from './lib/session.ts'

// Does script inside the draw run slower than the same script outside it on this machine?
//   npm run checks -- worked --inside --at 1000,3320
// A fixed piece of script (numbers worked out, gathered and sorted, as a coat's choosing does) is timed outside any frame, straight after a frame and after a pause,
// and then inside a draw call of the film's own frame: the first, a quarter in, half, three quarters, the last. The frame is drawn again each time, so the card gets the same orders.
// On a machine that draws on the processor the card's threads work on the cores the page runs on. The ratio is this machine's: it says how much of `scene` in script, owners and worked is the card's and not the film's.
const PLACES: [string, number][] = [['the first draw call', 0], ['a quarter in', 0.25], ['half in', 0.5], ['three quarters in', 0.75], ['the last draw call', 1]]
const median = (v: number[]): number => [...v].sort((a, b) => a - b)[Math.floor(v.length / 2)]

export async function run(args: Args): Promise<void> {
  const at = str(args, 'at', '1000,3320').split(',').filter(Boolean).map(Number).filter((f) => Number.isInteger(f) && f >= 3 && f < FRAMES - 1)
  const tier = str(args, 'tier', 'draft')
  const work = num(args, 'work', 40000)
  const reps = num(args, 'reps', 7)
  const busy = Number(spawnSync('pgrep', ['-c', '-f', 'type=gpu-process'], { encoding: 'utf8' }).stdout.trim()) || 0
  const findings: Finding[] = []
  const rows: (string | number)[][] = []
  const data: { frame: number; calls: number; place: string; ms: number[] }[] = []
  const session = await openSession({ plain: true })
  try {
    await session.warm(tier)
    for (let i = 0; i < 20; i++) await session.loop(work)
    for (const f of at) {
      for (let g = f - 2; g <= f; g++) await session.draw(g, tier, false)
      await session.loopAt(work, 0)
      await session.draw(f, tier, false)
      const calls = (await session.loopRead()).calls
      const after: number[] = []
      const rested: number[] = []
      const inside = PLACES.map(() => [] as number[])
      const frame: number[] = []
      for (let r = 0; r < reps; r++) {
        for (let p = 0; p < PLACES.length; p++) {
          await session.loopAt(work, Math.max(1, Math.round(PLACES[p][1] * calls)))
          await session.draw(f, tier, false)
          const read = await session.loopRead()
          if (read.ms < 0) throw new Error(`frame ${f}: the loop did not run at ${PLACES[p][0]} (${read.calls} draw calls against ${calls})`)
          inside[p].push(read.ms)
          frame.push((await session.cost()).script - read.ms)
        }
        await session.loopAt(work, 0)
        await session.draw(f, tier, false)
        after.push(await session.loop(work))
        await new Promise((done) => setTimeout(done, 400))
        rested.push(await session.loop(work))
      }
      const base = median(rested)
      const line = (place: string, ms: number[]): void => {
        rows.push([f, calls, place, median(ms).toFixed(2), Math.min(...ms).toFixed(2), Math.max(...ms).toFixed(2), (median(ms) / base).toFixed(2)])
        data.push({ frame: f, calls, place, ms })
      }
      line('outside, after a pause', rested)
      line('outside, straight after the frame', after)
      PLACES.forEach(([place], p) => line(`inside the draw, ${place}`, inside[p]))
      const worst = Math.max(...inside.map(median))
      findings.push({ ok: true, expected: true, what: `frame ${f} (${calls} draw calls, the frame drawn again costs ${median(frame).toFixed(1)} ms of script without the loop): the same script takes ${base.toFixed(2)} ms outside the draw and ${Math.min(...inside.map(median)).toFixed(2)} to ${worst.toFixed(2)} ms inside it, ${(worst / base).toFixed(2)} times at most` })
    }
  } finally {
    await session.close()
  }
  if (busy) findings.push({ ok: true, expected: true, what: `measured beside ${busy} other pages drawing: the milliseconds are too large` })
  finish({
    check: 'worked',
    name: `inside.${at.join('.')}`,
    sentence: 'does script inside the draw run slower than the same script outside it on this machine',
    subject: 'this machine',
    broken: null,
    complete: true,
    findings,
    table: { head: ['frame', 'draw calls', 'where the loop ran', 'median ms', 'least', 'most', 'times the outside'], rows },
    data: { tier, busy, work, reps, places: data },
  })
}
