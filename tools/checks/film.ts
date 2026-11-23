import { spawn, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import type { Args } from '../lib/args.ts'
import { flag, num } from '../lib/args.ts'
import { at } from '../lib/paths.ts'
import type { DuskRow } from './dusks.ts'
import { barText, FRAMES, secondsOf } from './lib/film.ts'
import { playDir, readLines, readStamp } from './lib/play.ts'
import { engineHash, finish, OUT, type Finding, type Result } from './lib/report.ts'
import { strideFrames, twilights } from './lib/stride.ts'

// The whole film in one go at 320 x 180: draws what a review round needs on several pages side by side, then runs nights, cuts and made on it and writes one table,
// a row for every night and for every day between two nights.
//   npm run checks -- film              draws what is not drawn yet (it carries on where it stopped), then judges
//   npm run checks -- film --pages 2    on two pages instead of three
//   npm run checks -- film --stride 1   every frame of the film, not every sixth outside the nights and the cues
//   npm run checks -- film --no-draw    the table of what is drawn so far
// It runs for over an hour: start it in the background and read out/work/checks/film.log.

const RUN = at('tools', 'checks', 'run.ts')
type StepRow = [number, number, number, number, number, number, number, number, number?]

function read(name: string): Result | null {
  const file = path.join(OUT, `${name}.json`)
  return fs.existsSync(file) ? (JSON.parse(fs.readFileSync(file, 'utf8')) as Result) : null
}

function drawOn(from: number, to: number, stride: number, log: string): Promise<number> {
  return new Promise((resolve) => {
    const out = fs.openSync(log, 'w')
    const child = spawn(process.execPath, ['--import', 'tsx', RUN, 'play', '--from', String(from), '--to', String(to), '--stride', String(stride)], { cwd: at(), stdio: ['ignore', out, out] })
    child.on('exit', (code) => {
      fs.closeSync(out)
      resolve(code ?? 1)
    })
  })
}

export async function run(args: Args): Promise<void> {
  const pages = Math.max(1, Math.min(4, num(args, 'pages', 3)))
  const stride = Math.max(1, num(args, 'stride', 6))
  const findings: Finding[] = []
  const wanted = strideFrames(stride)
  let drawMinutes = 0
  let drewNow = 0
  if (!flag(args, 'no-draw')) {
    const stamp = readStamp('film')
    if (stamp && stamp.hash !== engineHash()) fs.rmSync(playDir('film'), { recursive: true, force: true })
    const have = readLines('film')
    const todo = wanted.filter((f) => !have.has(f))
    drewNow = todo.length
    if (todo.length) {
      const n = Math.min(pages, todo.length)
      const starts = Array.from({ length: n }, (_, k) => todo[Math.floor((k * todo.length) / n)])
      const t0 = Date.now()
      console.log(`film · ${todo.length} of ${wanted.length} frames to draw on ${n} pages, from frames ${starts.join(', ')}`)
      const codes = await Promise.all(starts.map((from, k) => drawOn(k === 0 ? 0 : from, k === n - 1 ? FRAMES - 1 : starts[k + 1] - 1, stride, path.join(OUT, `film-page-${k + 1}.log`))))
      drawMinutes = (Date.now() - t0) / 60000
      if (codes.some((c) => c !== 0)) findings.push({ ok: false, what: `a page stopped before it had drawn its frames: see out/work/checks/film-page-*.log, and run it again to carry on` })
    }
  }
  const t1 = Date.now()
  for (const [name, extra] of [['nights', []], ['cuts', ['--stride', String(stride)]], ['made', ['--stride', String(stride)]]] as [string, string[]][]) spawnSync(process.execPath, ['--import', 'tsx', RUN, name, ...extra], { cwd: at(), stdio: 'ignore' })
  const judgeSeconds = (Date.now() - t1) / 1000
  const nights = read('nights')
  const cuts = read('cuts')
  const made = read('made')
  const lines = readLines('film')
  const dusks = ((nights?.data as { dusks?: DuskRow[] } | undefined)?.dusks ?? []) as DuskRow[]
  const steps = ((cuts?.data as { steps?: StepRow[] } | undefined)?.steps ?? []) as StepRow[]
  const guilty = new Set(((made?.data as { guilty?: number[] } | undefined)?.guilty ?? []) as number[])
  const want = new Set(wanted)
  const stretches: { first: number; last: number; night: number }[] = []
  let next = 0
  for (const t of twilights()) {
    if (t.first > next) stretches.push({ first: next, last: t.first - 1, night: 0 })
    stretches.push({ first: t.first, last: t.last, night: t.night })
    next = t.last + 1
  }
  if (next < FRAMES) stretches.push({ first: next, last: FRAMES - 1, night: 0 })
  const rows: (string | number)[][] = []
  let bad = 0
  let open = 0
  for (const s of stretches) {
    let need = 0
    let have = 0
    let makers = 0
    for (let f = s.first; f <= s.last; f++) {
      if (!want.has(f)) continue
      need++
      if (lines.has(f)) have++
      if (guilty.has(f)) makers++
    }
    const inside = steps.filter((x) => x[0] >= s.first && x[0] <= s.last)
    const calm = inside.filter((x) => !x[5] && !x[8])
    const most = calm.reduce<StepRow | null>((a, x) => (!a || Math.max(x[6], x[7]) > Math.max(a[6], a[7]) ? x : a), null)
    const hard = inside.filter((x) => x[4]).length
    const d = s.night ? dusks.find((x) => x.night === s.night) : undefined
    const whole = have === need && (!s.night || (d !== undefined && d.missing === 0))
    const fails = hard > 0 || makers > 0 || (d !== undefined && !d.ok)
    if (fails) bad++
    else if (!whole) open++
    rows.push([
      `${s.first}-${s.last}`,
      barText(secondsOf(s.first)).slice(4),
      s.night ? `night ${s.night}` : 'day',
      `${have} of ${need}`,
      d ? `${d.fall.toFixed(1)} into ${d.fallAt}` : '',
      d ? `${d.rise.toFixed(1)} into ${d.riseAt}` : '',
      d ? d.wrong.toFixed(2) : '',
      d ? `${d.part.toFixed(1)} into ${d.partAt}` : '',
      most ? `${Math.max(most[6], most[7]).toFixed(2)} into ${most[0]}` : '',
      inside.length ? hard : '',
      have ? makers : '',
      fails ? 'FAIL' : whole ? 'PASS' : have ? 'PASS SO FAR' : 'not drawn',
    ])
  }
  const said = (r: Result | null, name: string): void => {
    if (!r) {
      findings.push({ ok: false, what: `${name} wrote no result` })
      return
    }
    const fail = r.findings.filter((f) => !f.ok)
    if (fail.length) for (const f of fail.slice(0, 4)) findings.push({ ok: false, what: `${name}: ${f.what}` })
    else findings.push({ ok: true, expected: !r.complete, what: `${name}${r.complete ? '' : ', so far'}: ${r.findings[0]?.what ?? 'no finding'}` })
  }
  said(nights, 'nights')
  said(cuts, 'cuts')
  said(made, 'made')
  const stamp = readStamp('film')
  findings.push({ ok: true, expected: true, what: `${lines.size} frames of the film are drawn at ${stamp?.width} x ${stamp?.height}, ${[...want].filter((f) => lines.has(f)).length} of the ${wanted.length} a round of stride ${stride} needs${drewNow ? `; ${drewNow} of them were drawn now, in ${drawMinutes.toFixed(1)} min on ${pages} pages` : ''}; judged in ${judgeSeconds.toFixed(0)} s` })
  finish({
    check: 'film',
    sentence: 'the whole film at 320 x 180 in one go: every dusk, night and dawn by the picture, every step between frames, and what every frame made',
    subject: 'the film',
    broken: null,
    complete: bad === 0 && open === 0 && [nights, cuts, made].every((r) => r?.complete),
    findings,
    table: { head: ['frames', 'bar', 'what', 'drawn', 'mean falls most', 'mean rises most', 'mean the wrong way', 'a part the wrong way', 'edges move most', 'hard cuts', 'frames that made something', 'verdict'], rows },
    data: { stride, pages, drawMinutes, drewNow, judgeSeconds, stretches: rows },
  })
}
