import { nothingMade, type Made } from '../../src/v2/counter.ts'
import type { Args } from '../lib/args.ts'
import { num } from '../lib/args.ts'
import { barText, FRAMES, holds, secondsOf } from './lib/film.ts'
import { readLines, readStamp, runName } from './lib/play.ts'
import { strideFrames } from './lib/stride.ts'
import { finish, type Finding } from './lib/report.ts'

const SENTENCE = "whenever there's a scene change we have a huge frame rate drop ... we need to make sure that doesn't happen"
const KINDS: (keyof Made)[] = ['programs', 'shaders', 'textures', 'buffers', 'framebuffers', 'renderbuffers', 'uploads']

// In a hold the plant does not grow, so nothing that follows growth has to be written again. What is left is the geometry posed by the wind:
// measured on sky-0, 6.3 MB a frame in the frost hold and 10.1 MB in the storm hold. The limit leaves room for that and none for the hair and frost textures, 19 to 25 MB a frame.
const HOLD_MB = 12

// Reads what `play` noted on every frame it drew after loading and warming, and fails if any frame made anything, or wrote more than the limit in a hold.
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
  const stride = num(args, 'stride', 0)
  const wanted = stride > 0 ? strideFrames(stride, from, to).length : to - from + 1
  const complete = have >= wanted
  if (have === 0) findings.push({ ok: false, what: `no frame of "${run}" has been drawn yet: run "npm run checks -- play" first` })
  else if (guilty.length === 0) findings.push({ ok: true, what: `${have} of ${wanted} frames drawn after loading and warming (${stamp?.width} x ${stamp?.height}, ${stamp?.tier}, sky ${stamp?.sky}, in ${sessions.size} runs): no program, shader, texture, buffer, framebuffer or renderbuffer was created and nothing was given new storage on any of them` })
  else findings.push({ ok: false, what: `${guilty.length} of ${have} frames made something on the graphics card after loading: frames ${guilty.slice(0, 20).join(', ')}${guilty.length > 20 ? ' and more' : ''}` })
  if (have > 0) findings.push({ ok: true, what: `allowed, and listed for its cost: every frame writes into buffers that already exist, ${(updates / have).toFixed(0)} writes and ${(updateBytes / have / 1048576).toFixed(1)} MB a frame on average, the most ${(mostBytes / 1048576).toFixed(1)} MB at frame ${mostAt}` })
  const holdMb = num(args, 'hold-mb', HOLD_MB)
  const held: { name: string; frames: number; mean: number; most: number; mostAt: number }[] = []
  for (const h of holds) {
    const inHold = [...lines.values()].filter((l) => l.frame >= Math.max(from, h.first) && l.frame <= Math.min(to, h.last))
    if (inHold.length === 0) continue
    const most = inHold.reduce((a, l) => (l.made.updateBytes > a.made.updateBytes ? l : a), inHold[0])
    const row = { name: h.name, frames: inHold.length, mean: inHold.reduce((a, l) => a + l.made.updateBytes, 0) / inHold.length / 1048576, most: most.made.updateBytes / 1048576, mostAt: most.frame }
    held.push(row)
    findings.push({ ok: row.most <= holdMb, what: `${h.name} hold (${row.frames} of its ${h.last - h.first + 1} frames drawn): each frame writes ${row.mean.toFixed(1)} MB on average into what exists, the most ${row.most.toFixed(1)} MB at frame ${row.mostAt}, against a limit of ${holdMb} MB a frame while the plant stands still` })
  }
  if (!complete && have > 0) findings.push({ ok: true, expected: true, what: `${wanted - have} frames of ${from} to ${to} are not drawn yet` })
  finish({
    check: 'made',
    sentence: SENTENCE,
    subject: broken ? `a film that makes a texture and a program at one frame (${run})` : 'the film',
    broken,
    complete,
    findings,
    table: rows.length ? { head: ['frame', 'second', 'bar', 'made', 'uploaded', 'where in its run'], rows: rows.slice(0, 60) } : undefined,
    data: { run, stamp, from, to, frames: have, guilty, meanUpdateMb: have ? updateBytes / have / 1048576 : 0, holdMb, held },
  })
}
