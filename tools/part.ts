import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { frameCount } from '../src/config.ts'
import { formatById, isTier } from '../src/core/tiers.ts'
import { num, parseArgs, str } from './lib/args.ts'
import { machine } from './lib/browser.ts'
import { WORK } from './lib/paths.ts'
import { openSession, takeRenderSlot, type Session } from './lib/render.ts'
import { bitrateFor, encodeFrames, probe, probeLine } from './lib/video.ts'

// One part of the film: frames --from to --to, drawn by several pages at once and encoded so that parts join without a seam.
//   npm run part -- --from 0 --to 317 --sky sky-b
//   npm run part -- --from 0 --to 317 --sky sky-b --format 16x9 --tier draft --jobs 3
// A part that stops carries on where it stopped: frames already on disk from the same build are kept.

const args = parseArgs()
const from = num(args, 'from')
const to = num(args, 'to')
if (!(from >= 0 && to >= from && to < frameCount)) throw new Error(`frames ${from} to ${to} are not inside the film (0 to ${frameCount - 1})`)
const format = formatById(str(args, 'format', 'preview')).id
const tier = str(args, 'tier', 'draft')
if (!isTier(tier)) throw new Error(`unknown tier "${tier}"`)
const sky = str(args, 'sky', 'sky')
const jobs = Math.max(1, Math.round(num(args, 'jobs', Math.max(1, os.cpus().length - 1))))

const dir = path.join(WORK, 'parts', `${format}-${tier}`)
const frames = path.join(dir, 'frames')
fs.mkdirSync(frames, { recursive: true })
const name = `part-${String(from).padStart(5, '0')}-${String(to).padStart(5, '0')}`
const file = path.join(dir, `${name}.mp4`)
const fileOf = (f: number): string => path.join(frames, `${String(f).padStart(5, '0')}.png`)
const commit = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim()

const release = await takeRenderSlot('part')
const sessions: Session[] = []
try {
  const first = await openSession({ format, extra: new URLSearchParams({ sky }).toString(), what: 'part', slot: false })
  sessions.push(first)
  const info = await first.info()
  const drawn = await first.page.evaluate(() => window.showcase.sky())
  if (drawn !== sky) throw new Error(`there is no sky in src/${sky}: the page drew "${drawn}"`)
  const stamp = path.join(frames, 'build.txt')
  const built = fs.existsSync(stamp) ? fs.readFileSync(stamp, 'utf8').trim() : ''
  const now = `${info.engineHash} ${sky}`
  if (built !== now) {
    for (const f of fs.readdirSync(frames)) fs.rmSync(path.join(frames, f), { force: true })
    fs.writeFileSync(stamp, `${now}\n`)
  }
  for (let i = 1; i < jobs; i++) sessions.push(await openSession({ format, extra: new URLSearchParams({ sky }).toString(), what: 'part', slot: false }))
  console.log(`part · frames ${from} to ${to} · ${format} · ${tier} · sky ${sky} · ${jobs} pages · engine ${info.engineHash} · commit ${commit}`)

  const todo: number[] = []
  for (let f = from; f <= to; f++) if (!fs.existsSync(fileOf(f))) todo.push(f)
  const total = todo.length
  let done = 0
  let seconds = 0
  const started = Date.now()
  let told = Date.now()
  await Promise.all(sessions.map(async (session) => {
    for (;;) {
      const f = todo.shift()
      if (f === undefined) return
      const r = await session.render(f, tier)
      fs.writeFileSync(`${fileOf(f)}.tmp`, r.png)
      fs.renameSync(`${fileOf(f)}.tmp`, fileOf(f))
      done++
      seconds += r.seconds
      if (Date.now() - told > 30000) {
        told = Date.now()
        const wall = (Date.now() - started) / 1000 / done
        console.log(`part · ${done} of ${total} · ${(seconds / done).toFixed(1)} s a frame on a page · ${wall.toFixed(1)} s a frame in all · about ${Math.ceil(((total - done) * wall) / 60)} min left`)
      }
    }
  }))
  const wall = total ? (Date.now() - started) / 1000 / total : 0
  encodeFrames(path.join(frames, '%05d.png'), from, to - from + 1, file, bitrateFor(format), 1)
  const p = probe(file)
  if (p.frames !== to - from + 1) throw new Error(`${file} has ${p.frames} frames, not ${to - from + 1}`)
  fs.writeFileSync(path.join(dir, `${name}.json`), `${JSON.stringify({ kind: 'part', from, to, frames: p.frames, format, tier, sky, engineHash: info.engineHash, commit, pages: jobs, drawn: total, secondsAFrameOnAPage: total ? seconds / total : 0, secondsAFrameInAll: wall, machine: machine(), at: new Date().toISOString() }, null, 2)}\n`)
  console.log(`part · ${probeLine(file, p)}`)
} finally {
  for (const s of sessions) await s.close()
  release()
}
