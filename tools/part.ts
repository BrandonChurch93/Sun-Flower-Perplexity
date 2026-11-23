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
//   npm run part -- --from 0 --to 317 --size 640x360        a smaller picture for a first watch of the motion
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

const size = typeof args.size === 'string' ? args.size : ''
const sized = /^(\d+)x(\d+)$/.exec(size)
if (size && !sized) throw new Error(`--size wants a width and a height, as in 640x360, not "${size}"`)
const extra = new URLSearchParams(sized ? { sky, w: sized[1], h: sized[2] } : { sky }).toString()
const dir = path.join(WORK, 'parts', `${sized ? size : format}-${tier}`)
const frames = path.join(dir, 'frames')
fs.mkdirSync(frames, { recursive: true })
const name = `part-${String(from).padStart(5, '0')}-${String(to).padStart(5, '0')}`
const file = path.join(dir, `${name}.mp4`)
const fileOf = (f: number): string => path.join(frames, `${String(f).padStart(5, '0')}.png`)
const commit = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim()

interface Row {
  frame: number
  page: number
  cost: Record<string, number>
  writeMb: number
  made?: Record<string, number>
}
const MADE = ['programs', 'shaders', 'textures', 'buffers', 'framebuffers', 'renderbuffers', 'uploads', 'vertexArrays'] as const

const release = await takeRenderSlot('part')
const sessions: Session[] = []
try {
  const first = await openSession({ format, extra, what: 'part', slot: false })
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
  for (let i = 1; i < jobs; i++) sessions.push(await openSession({ format, extra, what: 'part', slot: false }))
  console.log(`part · frames ${from} to ${to} · ${sized ? size : format} · ${tier} · sky ${sky} · ${jobs} pages · engine ${info.engineHash} · commit ${commit}`)

  const todo: number[] = []
  for (let f = from; f <= to; f++) if (!fs.existsSync(fileOf(f))) todo.push(f)
  const total = todo.length
  let done = 0
  let seconds = 0
  const started = Date.now()
  let told = Date.now()
  // What each frame cost the page's own thread, by part, and what the graphics card was asked to make in it. With one page the frames arrive in film order, as they do when the film plays.
  const costFile = path.join(dir, `${name}.cost.json`)
  const kept: Row[] = built === now && fs.existsSync(costFile) ? (JSON.parse(fs.readFileSync(costFile, 'utf8')).rows as Row[]).filter((r) => !todo.includes(r.frame)) : []
  const rows: Row[] = []
  await Promise.all(sessions.map(async (session, page) => {
    await session.page.evaluate(() => window.showcase.cost())
    let had = await session.page.evaluate(() => window.showcase.made())
    for (;;) {
      const f = todo.shift()
      if (f === undefined) return
      const r = await session.render(f, tier)
      const [cost, made] = await session.page.evaluate(() => [window.showcase.cost(), window.showcase.made()] as const)
      const row: Row = { frame: f, page, cost: Object.fromEntries(Object.entries(cost).map(([k, v]) => [k, Math.round(v * 100) / 100])), writeMb: Math.round(((made.updateBytes - had.updateBytes) / 1048576) * 100) / 100 }
      const fresh = Object.fromEntries(MADE.map((k) => [k, made[k] - had[k]]).filter(([, v]) => v !== 0))
      if (Object.keys(fresh).length) row.made = fresh
      had = made
      rows.push(row)
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
  fs.writeFileSync(costFile, `${JSON.stringify({ kind: 'cost', from, to, format, tier, engineHash: info.engineHash, commit, pages: jobs, machine: machine(), rows: [...kept, ...rows].sort((a, b) => a.frame - b.frame) })}\n`)
  console.log(`part · ${probeLine(file, p)}`)
} finally {
  for (const s of sessions) await s.close()
  release()
}
