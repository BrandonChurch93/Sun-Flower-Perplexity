import fs from 'node:fs'
import path from 'node:path'
import { nothingMade } from '../../src/v2/counter.ts'
import type { Args } from '../lib/args.ts'
import { num, str } from '../lib/args.ts'
import { segments } from '../../src/director/timeline.ts'
import { FRAMES, lightningFrames } from './lib/film.ts'
import { frameFile, framesDir, playDir, readLines, readStamp, runName, type Line, type Stamp } from './lib/play.ts'
import { engineHash } from './lib/report.ts'
import { openSession } from './lib/session.ts'
import { mad, small, type Small } from './lib/steps.ts'
import { ranker } from './lib/stride.ts'

// Draws frames of the film small, in order, after loading and warming as the film does before it plays. Keeps each picture and what each frame made.
//   npm run checks -- play                         every frame, 320 x 180, one sample, the whole scene
//   npm run checks -- play --from 0 --to 1269      a range, so that several can run side by side
//   npm run checks -- play --minutes 8             stops by itself after 8 minutes; run it again and it carries on
//   npm run checks -- play --first 4               every fourth frame first, so the whole film is seen early, then the frames round each seam, then the rest where the picture moves most
//   npm run checks -- play --stride 6              a review round: every frame of each dusk, night and dawn, then every sixth frame, then every frame within 12 of a bar line with a cue, and no more
//   npm run checks -- play --break cut --at 1000 --from 984 --to 1016      a film whose camera jumps at frame 1000
//   npm run checks -- play --break made --at 900 --from 890 --to 910       a film that builds a texture and a program at frame 900
// A frame that is already there is not drawn again. A change of the film or of the size throws the old frames away.

const SEAM = 6
const ROUND = 2

// For every stretch between two frames of the coarse pass, how far the picture moves across it or across a stretch beside it.
export async function coarseSteps(run: string, every: number, from: number, to: number): Promise<Map<number, number>> {
  const own = new Map<number, number>()
  let before: Small | null = null
  for (let f = Math.ceil(from / every) * every; f <= to; f += every) {
    const now = fs.existsSync(frameFile(run, f)) ? await small(frameFile(run, f)) : null
    if (before && now) own.set(f / every - 1, mad(before.blur, now.blur))
    before = now
  }
  const out = new Map<number, number>()
  for (const k of own.keys()) {
    let most = 0
    for (let d = -ROUND; d <= ROUND; d++) most = Math.max(most, own.get(k + d) ?? 0)
    out.set(k, most)
  }
  return out
}

export async function run(args: Args): Promise<void> {
  const broken = typeof args.break === 'string' ? args.break : null
  if (broken && !['cut', 'made'].includes(broken)) throw new Error('play can break the film with --break cut or --break made, with --at <frame>')
  const run = runName(broken)
  const from = Math.max(0, num(args, 'from', 0))
  const to = Math.min(FRAMES - 1, num(args, 'to', FRAMES - 1))
  const minutes = num(args, 'minutes', 0)
  const stride = num(args, 'stride', 0)
  const first = stride > 0 ? 1 : num(args, 'first', 1)
  const tier = str(args, 'tier', 'draft')
  const width = num(args, 'width', 320)
  const height = num(args, 'height', 180)
  const sky = str(args, 'sky', '')
  const onlyArg = str(args, 'only', 'all')
  const only = onlyArg === 'all' ? '' : onlyArg
  const quality = str(args, 'quality', '')
  const dir = playDir(run)
  fs.mkdirSync(framesDir(run), { recursive: true })
  const started = Date.now()
  const session = await openSession({ width, height, sky: sky || undefined, only: only || undefined, quality: quality || undefined })
  const id = `${process.pid}-${started}`
  try {
    const stamp: Stamp = { hash: engineHash(), width, height, sky: session.info.sky, only, tier, quality }
    const old = readStamp(run)
    if (old && JSON.stringify(old) !== JSON.stringify(stamp)) {
      console.log(`play · the film or the settings changed since the frames of "${run}" were drawn: they are thrown away`)
      fs.rmSync(dir, { recursive: true, force: true })
      fs.mkdirSync(framesDir(run), { recursive: true })
    }
    fs.writeFileSync(path.join(dir, 'stamp.json'), JSON.stringify(stamp, null, 2) + '\n')
    const have = readLines(run)
    const wanted: number[] = []
    const round = stride > 0 ? ranker(stride) : null
    let there = 0
    let skipped = 0
    for (let f = from; f <= to; f++) {
      if (round && round(f) >= 3) skipped++
      else if (have.has(f)) there++
      else wanted.push(f)
    }
    if (round) wanted.sort((a, b) => round(a) - round(b) || a - b)
    // Every `first`th frame first. Then the frames round every seam, where a hard cut or a late build is most likely: each section's first frame and each stroke of lightning.
    const seams = [...segments.map((s) => s.firstFrame), ...lightningFrames()]
    const rank = (f: number): number => (f % first === 0 ? 0 : seams.some((x) => Math.abs(f - x) <= SEAM) ? 1 : 2)
    if (first > 1) wanted.sort((a, b) => rank(a) - rank(b) || a - b)
    console.log(`play · ${run} · sky ${session.info.sky} · ${width} x ${height} · ${tier} · ${only || 'everything'} · frames ${from} to ${to}: ${wanted.length} to draw, ${there} already there${round ? `, ${skipped} not in a round of stride ${stride}` : ''} · loaded in ${session.startSeconds.toFixed(1)} s`)
    if (wanted.length === 0) return
    if (broken) await session.fault(broken, num(args, 'at'))
    const t0 = Date.now()
    await session.warm(tier)
    console.log(`play · warmed in ${((Date.now() - t0) / 1000).toFixed(1)} s`)
    const log = path.join(dir, `log-${id}.jsonl`)
    const progress = path.join(dir, `progress-${from}-${to}.txt`)
    let total = 0
    let done = 0
    let sorted = first <= 1
    for (let i = 0; i < wanted.length; i++) {
      if (!sorted && rank(wanted[i]) === 2) {
        // Then where the picture moves most between the frames drawn so far: that is where a hard cut would be.
        sorted = true
        const score = await coarseSteps(run, first, from, to)
        const rest = wanted.slice(i).sort((a, b) => (score.get(Math.floor(b / first)) ?? 0) - (score.get(Math.floor(a / first)) ?? 0) || a - b)
        wanted.splice(i, rest.length, ...rest)
        console.log(`play · every ${first}th frame and the seams are drawn: the rest goes by how far the picture moves, the largest first (frame ${wanted[i]})`)
      }
      const f = wanted[i]
      // Another run may have drawn it since this one began.
      if (fs.existsSync(frameFile(run, f))) continue
      const d = await session.draw(f, tier)
      fs.writeFileSync(frameFile(run, f), d.png as Buffer)
      const line: Line = { frame: f, seconds: d.seconds, made: d.made, session: id, nth: done }
      fs.appendFileSync(log, JSON.stringify(line) + '\n')
      total += d.seconds
      done++
      if (!nothingMade(d.made)) console.log(`play · frame ${f} made ${JSON.stringify(d.made)}`)
      if (done % 20 === 0 || done === wanted.length) {
        const text = `play · ${run} · frame ${f} · ${done} of ${wanted.length} · ${(total / done).toFixed(2)} s a frame · ${(((wanted.length - done) * total) / done / 60).toFixed(1)} min left`
        fs.writeFileSync(progress, text + '\n')
        if (done % 100 === 0 || done === wanted.length) console.log(text)
      }
      if (minutes > 0 && Date.now() - started > minutes * 60000) {
        console.log(`play · stopped after ${minutes} min at frame ${f}, ${wanted.length - done} frames left: run it again to carry on`)
        break
      }
    }
  } finally {
    await session.close()
  }
}
