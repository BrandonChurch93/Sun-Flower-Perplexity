import { nothingMade, type Made } from '../../src/v2/counter.ts'
import type { Args } from '../lib/args.ts'
import { num } from '../lib/args.ts'
import { barText, FRAMES, secondsOf } from './lib/film.ts'
import { readLines, readStamp, runName } from './lib/play.ts'
import { finish, type Finding } from './lib/report.ts'

const SENTENCE = "whenever there's a scene change we have a huge frame rate drop ... we need to make sure that doesn't happen"
const KINDS: (keyof Made)[] = ['programs', 'shaders', 'textures', 'buffers', 'framebuffers', 'renderbuffers', 'uploads']

// Reads what `play` noted on every frame it drew after loading and warming, and fails if any frame made anything.
export async function run(args: Args): Promise<void> {
  const broken = typeof args.break === 'string' ? args.break : null
  const run = runName(broken)
  const from = Math.max(0, num(args, 'from', 0))
  const to = Math.min(FRAMES - 1, num(args, 'to', FRAMES - 1))
  const lines = readLines(run)
  const stamp = readStamp(run)
  const findings: Finding[] = []
  const rows: (string | number)[][] = []
  let have = 0
  let updates = 0
  let updateBytes = 0
  let mostBytes = 0
  let mostAt = -1
  const guilty: number[] = []
  const sessions = new Set<string>()
  for (let f = from; f <= to; f++) {
    const line = lines.get(f)
    if (!line) continue
    have++
    sessions.add(line.session)
    updates += line.made.updates
    updateBytes += line.made.updateBytes
    if (line.made.updateBytes > mostBytes) {
      mostBytes = line.made.updateBytes
      mostAt = f
    }
    if (!nothingMade(line.made)) {
      guilty.push(f)
      const what = KINDS.filter((k) => line.made[k] > 0).map((k) => `${line.made[k]} ${k}`).join(', ')
      rows.push([f, secondsOf(f).toFixed(3), barText(secondsOf(f)).slice(4), what, `${(line.made.uploadBytes / 1048576).toFixed(2)} MB`, line.nth === 0 ? 'first frame drawn after warming' : `frame ${line.nth + 1} of its run`])
    }
  }
  const wanted = to - from + 1
  const complete = have === wanted
  if (have === 0) findings.push({ ok: false, what: `no frame of "${run}" has been drawn yet: run "npm run checks -- play" first` })
  else if (guilty.length === 0) findings.push({ ok: true, what: `${have} of ${wanted} frames drawn after loading and warming (${stamp?.width} x ${stamp?.height}, ${stamp?.tier}, sky ${stamp?.sky}, in ${sessions.size} runs): no program, shader, texture, buffer, framebuffer or renderbuffer was created and nothing was given new storage on any of them` })
  else findings.push({ ok: false, what: `${guilty.length} of ${have} frames made something on the graphics card after loading: frames ${guilty.slice(0, 20).join(', ')}${guilty.length > 20 ? ' and more' : ''}` })
  if (have > 0) findings.push({ ok: true, what: `allowed, and listed for its cost: every frame writes into buffers that already exist, ${(updates / have).toFixed(0)} writes and ${(updateBytes / have / 1048576).toFixed(1)} MB a frame on average, the most ${(mostBytes / 1048576).toFixed(1)} MB at frame ${mostAt}` })
  if (!complete && have > 0) findings.push({ ok: true, expected: true, what: `${wanted - have} frames of ${from} to ${to} are not drawn yet` })
  finish({
    check: 'made',
    sentence: SENTENCE,
    subject: broken ? `a film that makes a texture and a program at one frame (${run})` : 'the film',
    broken,
    complete,
    findings,
    table: rows.length ? { head: ['frame', 'second', 'bar', 'made', 'uploaded', 'where in its run'], rows: rows.slice(0, 60) } : undefined,
    data: { run, stamp, from, to, frames: have, guilty, meanUpdateMb: have ? updateBytes / have / 1048576 : 0 },
  })
}
