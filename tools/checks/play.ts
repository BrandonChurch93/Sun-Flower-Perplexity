import fs from 'node:fs'
import path from 'node:path'
import { nothingMade } from '../../src/v2/counter.ts'
import type { Args } from '../lib/args.ts'
import { num, str } from '../lib/args.ts'
import { FRAMES } from './lib/film.ts'
import { frameFile, framesDir, playDir, readLines, readStamp, runName, type Line, type Stamp } from './lib/play.ts'
import { openSession } from './lib/session.ts'

// Draws frames of the film small, in order, after loading and warming as the film does before it plays. Keeps each picture and what each frame made.
//   npm run checks -- play                         every frame, 320 x 180, one sample, the whole scene
//   npm run checks -- play --from 0 --to 1269      a range, so that several can run side by side
//   npm run checks -- play --minutes 8             stops by itself after 8 minutes; run it again and it carries on
//   npm run checks -- play --break cut --at 1000 --from 970 --to 1030      a film whose camera jumps at frame 1000
//   npm run checks -- play --break made --at 900 --from 880 --to 920       a film that builds a texture and a program at frame 900
// A frame that is already there is not drawn again. A change of the film or of the size throws the old frames away.

export async function run(args: Args): Promise<void> {
  const broken = typeof args.break === 'string' ? args.break : null
  if (broken && !['cut', 'made'].includes(broken)) throw new Error('play can break the film with --break cut or --break made, with --at <frame>')
  const run = runName(broken)
  const from = Math.max(0, num(args, 'from', 0))
  const to = Math.min(FRAMES - 1, num(args, 'to', FRAMES - 1))
  const minutes = num(args, 'minutes', 0)
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
    const stamp: Stamp = { hash: session.hash, width, height, sky: session.info.sky, only, tier, quality }
    const old = readStamp(run)
    if (old && JSON.stringify(old) !== JSON.stringify(stamp)) {
      console.log(`play · the film or the settings changed since the frames of "${run}" were drawn: they are thrown away`)
      fs.rmSync(dir, { recursive: true, force: true })
      fs.mkdirSync(framesDir(run), { recursive: true })
    }
    fs.writeFileSync(path.join(dir, 'stamp.json'), JSON.stringify(stamp, null, 2) + '\n')
    const have = readLines(run)
    const wanted: number[] = []
    for (let f = from; f <= to; f++) if (!have.has(f)) wanted.push(f)
    console.log(`play · ${run} · sky ${session.info.sky} · ${width} x ${height} · ${tier} · ${only || 'everything'} · frames ${from} to ${to}: ${wanted.length} to draw, ${to - from + 1 - wanted.length} already there · loaded in ${session.startSeconds.toFixed(1)} s`)
    if (wanted.length === 0) return
    if (broken) await session.fault(broken, num(args, 'at'))
    const t0 = Date.now()
    await session.warm(tier)
    console.log(`play · warmed in ${((Date.now() - t0) / 1000).toFixed(1)} s`)
    const log = path.join(dir, `log-${id}.jsonl`)
    const progress = path.join(dir, `progress-${from}-${to}.txt`)
    let total = 0
    let done = 0
    for (const f of wanted) {
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
