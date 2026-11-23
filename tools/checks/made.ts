import { nothingMade, type Made } from '../../src/v2/counter.ts'
import type { Args } from '../lib/args.ts'
import { num } from '../lib/args.ts'
import { barText, FRAMES, holds, secondsOf } from './lib/film.ts'
import { olderFilm, readLines, readStamp, runName } from './lib/play.ts'
import { strideFrames } from './lib/stride.ts'
import { finish, type Finding } from './lib/report.ts'

const SENTENCE = "whenever there's a scene change we have a huge frame rate drop ... we need to make sure that doesn't happen"
const NAMES: Partial<Record<keyof Made, string>> = { vertexArrays: 'vertex arrays' }
const named = (k: keyof Made, n: number): string => `${n} ${(NAMES[k] ?? k).replace(/s$/, n === 1 ? '' : 's')}`
const KINDS: (keyof Made)[] = ['programs', 'shaders', 'textures', 'buffers', 'framebuffers', 'renderbuffers', 'uploads', 'vertexArrays']

// In a hold the plant does not grow, so nothing that follows growth has to be written again. What is left is the geometry posed by the wind:
// the Builder's goal is 12 MB a frame. The check called writes says whose the bytes are.
// It is a goal and is reported, not a rule: `--hold-mb 12 --strict` makes it one.
const HOLD_MB = 12

// Reads what `play` noted on every frame it drew after loading and warming, and fails if any frame made anything, and says what each frame of a hold wrote against the goal.
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
  let bufferBytes = 0
  let textureBytes = 0
  let mostBytes = 0
  let mostAt = -1
  const guilty: number[] = []
  const byKind = new Map<keyof Made, { frames: number; count: number; first: number }>()
  let uncounted = 0
  const sessions = new Set<string>()
  for (let f = from; f <= to; f++) {
    const line = lines.get(f)
    if (!line) continue
    have++
    sessions.add(line.session)
    updates += line.made.updates
    updateBytes += line.made.updateBytes
    bufferBytes += line.made.bufferUpdateBytes ?? 0
    textureBytes += line.made.textureUpdateBytes ?? 0
    if (line.made.updateBytes > mostBytes) {
      mostBytes = line.made.updateBytes
      mostAt = f
    }
    if (line.made.vertexArrays === undefined) uncounted++
    if (!nothingMade({ ...line.made, vertexArrays: line.made.vertexArrays ?? 0 })) {
      guilty.push(f)
      const what = KINDS.filter((k) => (line.made[k] ?? 0) > 0).map((k) => named(k, line.made[k])).join(', ')
      for (const k of KINDS) if ((line.made[k] ?? 0) > 0) byKind.set(k, { frames: (byKind.get(k)?.frames ?? 0) + 1, count: (byKind.get(k)?.count ?? 0) + line.made[k], first: byKind.get(k)?.first ?? f })
      rows.push([f, secondsOf(f).toFixed(3), barText(secondsOf(f)).slice(4), what, `${(line.made.uploadBytes / 1048576).toFixed(2)} MB`, line.nth === 0 ? 'first frame drawn after warming' : `frame ${line.nth + 1} of its run`])
    }
  }
  const stride = num(args, 'stride', 0)
  const wanted = stride > 0 ? strideFrames(stride, from, to).length : to - from + 1
  const older = olderFilm(run)
  const complete = have >= wanted && !older && uncounted === 0
  if (have === 0) findings.push({ ok: false, what: `no frame of "${run}" has been drawn yet: run "npm run checks -- play" first` })
  else if (guilty.length === 0) findings.push({ ok: true, what: `${have} of ${wanted} frames drawn after loading and warming (${stamp?.width} x ${stamp?.height}, ${stamp?.tier}, sky ${stamp?.sky}, in ${sessions.size} runs): no program, shader, texture, buffer, framebuffer, renderbuffer or vertex array was created and nothing was given new storage on any of them` })
  else findings.push({ ok: false, what: `${guilty.length} of ${have} frames made something on the graphics card after loading: frames ${guilty.slice(0, 20).join(', ')}${guilty.length > 20 ? ' and more' : ''}. By kind: ${[...byKind].map(([k, v]) => `${named(k, v.count)} in ${v.frames} ${v.frames === 1 ? 'frame' : 'frames'}, first at frame ${v.first}`).join('; ')}. A vertex array made after loading means something was drawn for the first time while the film runs` })
  if (uncounted > 0) findings.push({ ok: true, expected: true, what: `${uncounted} of ${have} frames were drawn before vertex arrays were counted: draw them again` })
  if (have > 0) findings.push({ ok: true, what: `allowed, and listed for its cost: every frame writes into buffers and textures that already exist, ${(updates / have).toFixed(0)} writes and ${(updateBytes / have / 1048576).toFixed(1)} MB a frame on average, the most ${(mostBytes / 1048576).toFixed(1)} MB at frame ${mostAt}${bufferBytes + textureBytes > 0 ? ` (${(bufferBytes / have / 1048576).toFixed(1)} MB into buffers, ${(textureBytes / have / 1048576).toFixed(1)} MB into textures)` : ''}. The megabytes are the film's own count (src/v2/counter.ts), by the bytes that are sent; the check called writes says whose they are` })
  const holdMb = num(args, 'hold-mb', HOLD_MB)
  const held: { name: string; frames: number; mean: number; most: number; mostAt: number }[] = []
  for (const h of holds) {
    const inHold = [...lines.values()].filter((l) => l.frame >= Math.max(from, h.first) && l.frame <= Math.min(to, h.last))
    if (inHold.length === 0) continue
    const most = inHold.reduce((a, l) => (l.made.updateBytes > a.made.updateBytes ? l : a), inHold[0])
    const row = { name: h.name, frames: inHold.length, mean: inHold.reduce((a, l) => a + l.made.updateBytes, 0) / inHold.length / 1048576, most: most.made.updateBytes / 1048576, mostAt: most.frame }
    held.push(row)
    findings.push({ ok: row.most <= holdMb || !args.strict, expected: row.most > holdMb && !args.strict, what: `${h.name} hold (${row.frames} of its ${h.last - h.first + 1} frames drawn): each frame writes ${row.mean.toFixed(1)} MB on average into what exists, the most ${row.most.toFixed(1)} MB at frame ${row.mostAt}, against a goal of ${holdMb} MB a frame while the plant stands still${row.most > holdMb && !args.strict ? ': over the goal, reported and not a failure yet' : ''}` })
  }
  if (older) findings.push({ ok: true, expected: true, what: older })
  if (have < wanted && have > 0) findings.push({ ok: true, expected: true, what: `${wanted - have} frames of ${from} to ${to} are not drawn yet` })
  finish({
    check: 'made',
    sentence: SENTENCE,
    subject: broken === 'first-draw' ? `a film that draws a mesh for the first time at one frame, with nothing left to compile or send: only a vertex array is made (${run})` : broken ? `a film that makes a texture and a program at one frame (${run})` : 'the film',
    broken,
    complete,
    findings,
    table: rows.length ? { head: ['frame', 'second', 'bar', 'made', 'uploaded', 'where in its run'], rows: rows.slice(0, 60) } : undefined,
    data: { run, stamp, from, to, frames: have, guilty, byKind: Object.fromEntries(byKind), meanUpdateMb: have ? updateBytes / have / 1048576 : 0, holdMb, held },
  })
}
