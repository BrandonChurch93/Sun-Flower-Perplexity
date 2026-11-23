import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { config } from '../../src/config.ts'
import type { Args } from '../lib/args.ts'
import { at } from '../lib/paths.ts'
import { shutterSeconds } from '../../src/v2/now.ts'
import { barAt, barTime, clockOf, crossing, FPS, FRAME, FRAMES, hitFrame, holds, nearestBar, secondsOf, type Clock } from './lib/film.ts'
import { finish, OUT, type Finding } from './lib/report.ts'

const SENTENCE = 'time up the impactful moments of the video with the audio clip'
const SHEET = at('config', 'music', 'cues.json')
const MAP = at(config.music.map)

export interface Events {
  sunrises: number[]
  sunsets: number[]
  // The first frame of each stretch of lightning.
  strikes: number[]
  // The first and the last frame on which the plant's clock has the value it has in the middle of each hold.
  still: { id: string; first: number; last: number }[]
  rainFrom: number
  burstFrom: number
  bloomFrom: number
}

// What the film itself does, found by looking at every frame of it.
export function eventsOf(film: Clock): Events {
  const elevation = (s: number): number => film.at(s).sunElevationDeg
  const sunrises: number[] = []
  const sunsets: number[] = []
  const strikes: number[] = []
  let rainFrom = -1
  let burstFrom = -1
  let bloomFrom = -1
  let before = film.at(0)
  for (let f = 1; f < FRAMES; f++) {
    const now = film.at(secondsOf(f))
    if (before.sunElevationDeg < 0 && now.sunElevationDeg >= 0) sunrises.push(crossing(elevation, secondsOf(f - 1), secondsOf(f)))
    if (before.sunElevationDeg >= 0 && now.sunElevationDeg < 0) sunsets.push(crossing(elevation, secondsOf(f - 1), secondsOf(f)))
    if (before.flash < 0.02 && now.flash >= 0.02) strikes.push(f)
    if (rainFrom < 0 && now.rain > 0) rainFrom = f
    if (burstFrom < 0 && now.burst > 0) burstFrom = f
    if (bloomFrom < 0 && now.tau > config.growth.bud) bloomFrom = f
    before = now
  }
  const still = holds.map((h) => {
    const middle = Math.round(0.5 * (h.first + h.last))
    const tau = film.at(secondsOf(middle)).tau
    let first = middle
    let last = middle
    // A frame is still when the plant's clock reads the hold's value at the open shutter and at its close.
    const rests = (f: number): boolean => film.at(secondsOf(f)).tau === tau && film.at(secondsOf(f) + shutterSeconds).tau === tau
    while (first > 0 && rests(first - 1)) first--
    while (last < FRAMES - 1 && rests(last + 1)) last++
    return { id: h.id, first, last }
  })
  return { sunrises, sunsets, strikes, still, rainFrom, burstFrom, bloomFrom }
}

const onLine = (seconds: number, bar: number): boolean => Math.abs(seconds - barTime(bar)) <= FRAME + 1e-9
const ms = (seconds: number): string => `${(seconds * 1000).toFixed(1)} ms`
const sign = (x: number): string => (x >= 0 ? '+' : '') + x

interface Compiled { at: string; t: number; frame: number; do: string; expect: string; found: string | null; id?: string }

function lintSheet(findings: Finding[]): Compiled[] | null {
  if (!fs.existsSync(SHEET)) {
    findings.push({ ok: true, expected: true, what: `there is no config/music/cues.json yet: the film is checked against config.sections and src/v2/clock.ts alone` })
    return null
  }
  const out = path.join(OUT, 'cues.compiled.json')
  fs.mkdirSync(OUT, { recursive: true })
  let text = ''
  let ok = true
  try {
    text = execFileSync('python3', [at('tools', 'beat', 'cues.py'), SHEET, MAP, '--out', out, '--fps', String(FPS)], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
  } catch (error) {
    ok = false
    const e = error as { stdout?: string; stderr?: string }
    text = `${e.stdout ?? ''}${e.stderr ?? ''}`
  }
  findings.push({ ok, what: ok ? 'the cue sheet passes the lint of tools/beat/cues.py against the map' : `the cue sheet fails the lint of tools/beat/cues.py: ${text.trim().split('\n').slice(-6).join(' / ')}` })
  if (!fs.existsSync(out)) return null
  const compiled = JSON.parse(fs.readFileSync(out, 'utf8')) as { cues: Compiled[] }
  return compiled.cues
}

// A cue says what it is by its id, or by a word in what it does: sunrise, sunset, lightning or flash, hold in or begins, hold out or ends, rain, break, bloom.
function kindOf(c: Compiled): string | null {
  const text = `${c.id ?? ''} ${c.do}`.toLowerCase()
  if (/sunrise|first light/.test(text)) return 'sunrise'
  if (/sunset|touches the horizon/.test(text)) return 'sunset'
  if (/lightning|flash/.test(text)) return 'strike'
  if (/hold/.test(text) && /(out|end|lets go|thaw)/.test(text)) return 'hold-out'
  if (/hold/.test(text)) return 'hold-in'
  if (/break/.test(text)) return 'break'
  if (/rain/.test(text)) return 'rain'
  if (/bloom|petal/.test(text)) return 'bloom'
  return null
}

export async function run(args: Args): Promise<void> {
  const broken = typeof args.break === 'string' ? args.break : null
  const film = clockOf(broken)
  const e = eventsOf(film)
  const findings: Finding[] = []
  const rows: (string | number)[][] = []
  const note = (ok: boolean, what: string, bar: number, seconds: number, how: string): void => {
    rows.push([what, bar, barTime(bar).toFixed(3), seconds.toFixed(3), Math.floor(seconds * FPS + 1e-6), sign(Math.round((seconds - barTime(bar)) * 10000) / 10), ok ? 'on the line' : 'FAIL'])
    if (!ok) findings.push({ ok, what: `${what}: at ${seconds.toFixed(3)} s, ${ms(seconds - barTime(bar))} from bar ${bar} (${barTime(bar).toFixed(3)} s). ${how}` })
  }

  for (const s of e.sunrises) note(onLine(s, nearestBar(s)), 'sunrise', nearestBar(s), s, 'The sun must cross the horizon within one frame of a bar line')
  const offLine = e.sunrises.filter((s) => !onLine(s, nearestBar(s))).length
  findings.push({ ok: offLine === 0 && e.sunrises.length > 0, what: `${e.sunrises.length} sunrises, at bars ${e.sunrises.map(nearestBar).join(', ')}: ${offLine === 0 ? 'each crosses the horizon within one frame of its bar line' : `${offLine} of them miss their bar line by more than a frame`}, the worst by ${ms(Math.max(...e.sunrises.map((s) => Math.abs(s - barTime(nearestBar(s))))))}` })

  const last = config.sections[config.sections.length - 1]
  const finalSet = e.sunsets[e.sunsets.length - 1]
  const setOk = finalSet !== undefined && onLine(finalSet, last.fromBar)
  if (finalSet !== undefined) note(setOk, 'the last sunset', last.fromBar, finalSet, `The sun must touch the horizon on the bar line that opens "${last.name}"`)
  findings.push({ ok: setOk, what: setOk ? `the last sunset crosses the horizon ${ms(finalSet - barTime(last.fromBar))} from bar ${last.fromBar}, where "${last.name}" opens` : `the last sunset is not on bar ${last.fromBar}, where "${last.name}" opens` })

  for (const h of holds) {
    const s = e.still.find((x) => x.id === h.id) as Events['still'][number]
    // The plant stops on the frame that holds the hold's first bar line and grows again on the frame that holds its last: the last still frame is the one before that.
    const inOk = s.first === hitFrame(h.fromBar)
    const outOk = s.last === hitFrame(h.toBar) - 1
    note(inOk, `${h.name}: the plant stops`, h.fromBar, secondsOf(s.first), 'The first still frame must be the frame that holds the bar line')
    note(outOk, `${h.name}: the plant's last still frame`, h.toBar, secondsOf(s.last), 'The last still frame must be the frame before the one that holds the closing bar line: growth resumes on the cue frame')
    findings.push({ ok: inOk && outOk, what: `${h.name}: the plant stands still from frame ${s.first} to frame ${s.last}; the bar lines ${h.fromBar} and ${h.toBar} lie in frames ${hitFrame(h.fromBar)} and ${hitFrame(h.toBar)}, so it must stand still from ${hitFrame(h.fromBar)} to ${hitFrame(h.toBar) - 1}${inOk && outOk ? '' : `: the hold ${inOk ? '' : `begins ${sign(s.first - hitFrame(h.fromBar))} frames from there`}${inOk || outOk ? '' : ' and '}${outOk ? '' : `ends ${sign(s.last - (hitFrame(h.toBar) - 1))} frames from there`}`}` })
  }

  const cues = lintSheet(findings)
  if (cues) {
    const within = (frames: number[], frame: number): boolean => frames.some((f) => Math.abs(f - frame) <= 1)
    let unread = 0
    for (const c of cues) {
      const kind = kindOf(c)
      let ok = true
      if (kind === 'sunrise') ok = e.sunrises.some((s) => Math.abs(s - c.t) <= FRAME + 1e-9)
      else if (kind === 'sunset') ok = e.sunsets.some((s) => Math.abs(s - c.t) <= FRAME + 1e-9)
      else if (kind === 'strike') ok = e.strikes.includes(c.frame)
      else if (kind === 'hold-in') ok = e.still.some((s) => s.first === c.frame)
      else if (kind === 'hold-out') ok = e.still.some((s) => s.last === c.frame - 1)
      else if (kind === 'rain') ok = within([e.rainFrom], c.frame)
      else if (kind === 'break') ok = e.burstFrom === c.frame
      else if (kind === 'bloom') ok = within([e.bloomFrom], c.frame)
      else {
        unread++
      }
      rows.push([`cue ${c.at}: ${c.do.slice(0, 44)}`, barAt(c.t).toFixed(2), c.t.toFixed(3), kind ? '' : '-', c.frame, '', kind ? (ok ? 'the film does it there' : 'FAIL') : 'listed'])
      if (kind && !ok) findings.push({ ok: false, what: `cue at ${c.at} (${c.t.toFixed(3)} s, frame ${c.frame}) "${c.do}": the film has no ${kind} there` })
    }
    const read = cues.length - unread
    findings.push({ ok: true, what: `${read} of the ${cues.length} cues of the sheet are of a kind this check can find in the film (sunrise, sunset, lightning, hold in, hold out, rain, break, bloom); ${unread} are listed and not checked` })
  }

  finish({
    check: 'cues',
    sentence: SENTENCE,
    subject: film.name,
    broken,
    complete: true,
    findings,
    table: { head: ['what', 'bar', 'bar line s', 'film s', 'frame', 'off by ms', 'verdict'], rows },
    data: { events: e, sheet: fs.existsSync(SHEET) },
  })
}
