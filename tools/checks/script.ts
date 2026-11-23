import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'
import { nothingMade, type Made } from '../../src/v2/counter.ts'
import type { Args } from '../lib/args.ts'
import { flag, num, str } from '../lib/args.ts'
import { at } from '../lib/paths.ts'
import { barText, FRAMES, secondsOf } from './lib/film.ts'
import { meantCuts } from './lib/meant.ts'
import { keeper } from './lib/play.ts'
import { engineHash, finish, OUT, table, type Finding } from './lib/report.ts'
import { openSession, type Session } from './lib/session.ts'

const SENTENCE = "whenever there's a scene change we have a huge frame rate drop ... we need to make sure that doesn't happen"

// The page's own script time in a frame, by part, from the film's own laps (film.cost), with frames drawn in a row as the film plays them.
// The time the graphics card, or here the processor in its place, takes to draw is not in the number.
//   npm run checks -- script                      the windows of tools/checks/limits.json that are not measured yet on this film, then the table of all of them
//   npm run checks -- script --window 2070-2110   one window, or several with commas
//   npm run checks -- script --window 1250-1290,3000-3010 --just   those windows alone, without the windows every run measures first
//   npm run checks -- script --all                the whole film, in windows drawn one after the other without a jump
//   npm run checks -- script --frames 8           only the first 8 counted frames of each window: a quick look, never a whole verdict
//   npm run checks -- script --again              measures again what is already measured
//   npm run checks -- script --table              draws nothing: the table of what is measured
//   npm run checks -- script --break slow-frame   the film with the sky alone, which passes, then with 40 ms more in one frame: the check has to fail
//   npm run checks -- script --break slow-part    the same with 4 ms more in the field's turn of every frame
// A window that has been measured is kept until the film changes, so the check can be run in parts.

interface Share { name: string; parts: string[]; meanMs: number }
interface Limits { meanMs: number; worstMs: number; cutOverMs: number; shares: Share[]; everyOtherPartMeanMs: number; first: string[]; windows: string[]; allEvery: number }
interface Row { frame: number; cost: Record<string, number>; made?: string; first?: Record<string, number>; firstLap?: string }
interface Kept { hash: string; from: number; to: number; whole: boolean; jump: boolean; width: number; height: number; tier: string; only: string; busy: number; rows: Row[] }
interface Hitch { frame: number; ms: number; around: number; parts: string }
interface Behind { frame: number; firstMs: number; lap: string; againMs: number }
interface Judged { behind: Behind[]; hitches: Hitch[]; from: number; to: number; frames: number; whole: boolean; busy: number; mean: number; draw: number | null; drawScene: number; drawShadow: number; worstDraw: number | null; worst: number; worstAt: number; top: string; over: string[]; ok: boolean; shares: Record<string, number> }

const LIMITS = at('tools', 'checks', 'limits.json')
// The time inside renderer.render is measured by the checks' page across the film's laps, beside them: it is no part of its own.
const NOT_PARTS = new Set(['script', 'wait', 'draw', 'drawScene', 'drawShadow'])
const SLOW_FRAME_MS = 40
const SLOW_PART_MS = 4

export function limitsOf(file = LIMITS): Limits {
  return (JSON.parse(fs.readFileSync(file, 'utf8')) as { script: Limits }).script
}

const span = (text: string): [number, number] => {
  const [a, b] = text.split('-').map(Number)
  if (!Number.isInteger(a) || !Number.isInteger(b) || b <= a) throw new Error(`a window is written first-last, as in 2070-2110: "${text}"`)
  return [a, Math.min(b, FRAMES - 1)]
}

// A hitch is a frame that costs far more than the frames around it, which a viewer sees as a stutter whatever the level:
// over the limit of any frame and over three times the median of the frames around it, eight before and eight after. The rule is the one of tools/costs.ts.
const AROUND = 8
const TIMES = 3
const CUT_ROOM = 10
export function hitchesOf(rows: Row[], limits: Limits): Hitch[] {
  return rows.flatMap((r, i) => {
    const near = rows.slice(Math.max(0, i - AROUND), i + AROUND + 1).map((x) => x.cost.script).sort((x, y) => x - y)
    const around = near[Math.floor(near.length / 2)]
    if (r.cost.script <= Math.max(limits.worstMs, TIMES * around)) return []
    const parts = Object.entries(r.cost).filter(([key, v]) => !NOT_PARTS.has(key) && v >= 1).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([key, v]) => `${key} ${v.toFixed(1)}`).join(', ')
    const inside = r.cost.draw === undefined ? '' : `; ${r.cost.draw.toFixed(1)} ms of the frame inside renderer.render`
    return [{ frame: r.frame, ms: r.cost.script, around, parts: (r.made ? `${parts}; made in it: ${r.made}` : parts) + inside }]
  })
}

export function judge(k: Kept, limits: Limits): Judged {
  const rows = k.rows
  const n = Math.max(1, rows.length)
  const mean = rows.reduce((a, r) => a + r.cost.script, 0) / n
  const worstRow = rows.reduce((a, r) => (r.cost.script > a.cost.script ? r : a), rows[0])
  const names = [...new Set(rows.flatMap((r) => Object.keys(r.cost)))].filter((x) => !NOT_PARTS.has(x))
  const meanOf = (parts: string[]): number => rows.reduce((a, r) => a + parts.reduce((b, p) => b + (r.cost[p] ?? 0), 0), 0) / n
  const over: string[] = []
  const shares: Record<string, number> = {}
  if (mean > limits.meanMs) over.push(`mean ${mean.toFixed(1)} over ${limits.meanMs}`)
  if (worstRow.cost.script > limits.worstMs) over.push(`worst ${worstRow.cost.script.toFixed(1)} over ${limits.worstMs}`)
  const named = new Set(limits.shares.flatMap((s) => s.parts))
  for (const s of limits.shares) {
    shares[s.name] = meanOf(s.parts)
    if (shares[s.name] > s.meanMs) over.push(`${s.name} ${shares[s.name].toFixed(1)} over ${s.meanMs}`)
  }
  for (const p of names.filter((x) => !named.has(x))) {
    shares[p] = meanOf([p])
    if (shares[p] > limits.everyOtherPartMeanMs) over.push(`${p} ${shares[p].toFixed(1)} over ${limits.everyOtherPartMeanMs}`)
  }
  const timed = rows.length > 0 && rows.every((r) => r.cost.draw !== undefined)
  const top = Object.entries(worstRow.cost).filter(([key]) => !NOT_PARTS.has(key)).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([key, v]) => `${key} ${v.toFixed(1)}`).join(', ')
  return { behind: rows.filter((r) => r.first).map((r) => ({ frame: r.frame, firstMs: (r.first as Record<string, number>).script, lap: r.firstLap ?? '', againMs: r.cost.script })), hitches: hitchesOf(rows, limits), from: k.from, to: k.to, frames: rows.length, whole: k.whole, busy: k.busy ?? 0, mean, draw: timed ? meanOf(['draw']) : null, drawScene: meanOf(['drawScene']), drawShadow: meanOf(['drawShadow']), worstDraw: timed ? worstRow.cost.draw : null, worst: worstRow.cost.script, worstAt: worstRow.frame, top, over, ok: over.length === 0, shares }
}

const dirOf = (run: string): string => path.join(OUT, 'script', run)
const fileOf = (run: string, from: number, to: number): string => path.join(dirOf(run), `window-${String(from).padStart(4, '0')}-${String(to).padStart(4, '0')}.json`)

function kept(run: string, from: number, to: number): Kept | null {
  const file = fileOf(run, from, to)
  if (!fs.existsSync(file)) return null
  const k = JSON.parse(fs.readFileSync(file, 'utf8')) as Kept
  return k.hash === engineHash() ? k : null
}

// The numbers are wall time, so the check has to run alone. How many browsers are already drawing on this machine: each of them makes every number larger.
function othersDrawing(): number {
  const r = spawnSync('pgrep', ['-c', '-f', 'type=gpu-process'], { encoding: 'utf8' })
  return Number(r.stdout.trim()) || 0
}
const ALONE = 'this check has to run alone: its numbers are wall time, and another page drawing or a build beside it makes them larger'

// Draws one window in a row and keeps the film's laps of every frame but the first after a jump.
// A frame far over its neighbours in which nothing was made may be the machine and not the film: the film waits for the drawing at the end of every frame,
// but the browser shows the canvas after it, and when the graphics process is still at that, the first call of the next frame that needs room waits, in whichever lap issues it.
// Such a frame is drawn once more after a pause, in a row with the two frames before it. Slow again, it is the film's and stays. Else the second number counts and the first is kept beside it.
const BEHIND_TIMES = 2
const FILM_TIMES = 1.5
const AGAIN_MOST = 12
const PAUSE_MS = 1500
const largest = (cost: Record<string, number>): string => Object.entries(cost).filter(([key]) => !NOT_PARTS.has(key)).sort((a, b) => b[1] - a[1]).slice(0, 1).map(([key, v]) => `${key} ${v.toFixed(1)}`)[0] ?? ''
const madeText = (m: Made): string => (nothingMade(m) ? '' : (Object.entries(m) as [string, number][]).filter(([key, v]) => v > 0 && !/pdate|Bytes/.test(key)).map(([key, v]) => `${v} ${key}`).join(', '))

async function measure(session: Session, run: string, from: number, to: number, tier: string, only: string, jump: boolean, upTo: number, busy = 0, keep: ReturnType<typeof keeper> | null = null): Promise<Kept> {
  const rows: Row[] = []
  const last = Math.min(to, from + (jump ? upTo : upTo - 1))
  const t0 = Date.now()
  for (let f = from; f <= last; f++) {
    const d = await session.draw(f, tier, keep !== null)
    const cost = await session.cost()
    const made = madeText(d.made)
    // A frame after a jump is not the film played in a row: it is measured by no check and not kept.
    if (keep && d.png && (f > from || !jump)) keep(f, d.seconds, d.made, d.png)
    if (f > from || !jump) rows.push(made ? { frame: f, cost, made } : { frame: f, cost })
  }
  const limits = limitsOf()
  const suspects = rows.filter((r, i) => {
    const near = rows.slice(Math.max(0, i - AROUND), i + AROUND + 1).map((x) => x.cost.script).sort((x, y) => x - y)
    return !r.made && r.cost.script > Math.max(limits.worstMs, BEHIND_TIMES * near[Math.floor(near.length / 2)])
  })
  for (const r of suspects.slice(0, AGAIN_MOST)) {
    const i = rows.indexOf(r)
    const near = rows.slice(Math.max(0, i - AROUND), i + AROUND + 1).map((x) => x.cost.script).sort((x, y) => x - y)
    const around = near[Math.floor(near.length / 2)]
    for (let f = Math.max(0, r.frame - 2); f < r.frame; f++) await session.draw(f, tier, false)
    await new Promise((done) => setTimeout(done, PAUSE_MS))
    await session.draw(r.frame, tier, false)
    const second = await session.cost()
    const slowAgain = second.script > Math.max(limits.worstMs, FILM_TIMES * around)
    console.log(`script · frame ${r.frame} cost ${r.cost.script.toFixed(1)} ms against ${around.toFixed(1)} around it with nothing made (${largest(r.cost)}); drawn again after a pause: ${second.script.toFixed(1)} ms${slowAgain ? ', slow again: it is the film' : ': the machine was behind the first time'}`)
    if (slowAgain) continue
    r.first = r.cost
    r.firstLap = largest(r.cost)
    r.cost = second
  }
  if (suspects.length) for (let f = Math.max(0, last - 1); f <= last; f++) await session.draw(f, tier, false)
  const k: Kept = { hash: engineHash(), from, to, whole: last === to, jump, width: session.info.width, height: session.info.height, tier, only, busy, rows }
  fs.mkdirSync(dirOf(run), { recursive: true })
  fs.writeFileSync(fileOf(run, from, to), JSON.stringify(k) + '\n')
  const j = judge(k, limitsOf())
  console.log(`script · frames ${from} to ${last} · ${rows.length} counted${busy ? ` beside ${busy} other pages drawing` : ''} · mean ${j.mean.toFixed(1)} ms, worst ${j.worst.toFixed(1)} ms at frame ${j.worstAt} (${j.top}) · drawn in ${((Date.now() - t0) / 1000).toFixed(0)} s`)
  return k
}

const tableOf = (judged: Judged[]): { head: string[]; rows: (string | number)[][] } => ({
  head: ['window', 'bar', 'frames counted', 'mean ms', 'draw', 'of it scene, shadow map', 'without draw', 'worst ms', 'draw there', 'worst frame', 'the three largest parts there', 'over its limit', 'verdict'],
  rows: judged.map((j) => [`${j.from}-${j.to}`, barText(secondsOf(j.from)).slice(4), `${j.frames}${j.whole ? '' : ' (not whole)'}`, j.mean.toFixed(1), j.draw === null ? 'not timed' : j.draw.toFixed(1), j.draw === null ? '' : `${j.drawScene.toFixed(1)}, ${j.drawShadow.toFixed(1)}`, j.draw === null ? '' : (j.mean - j.draw).toFixed(1), j.worst.toFixed(1), j.worstDraw === null ? '' : j.worstDraw.toFixed(1), j.worstAt, j.top, j.over.length ? j.over.join('; ') : 'nothing', `${j.ok ? 'PASS' : 'FAIL'}${j.busy ? ', not alone' : ''}`]),
})

const COLOURS = ['#3f8f4f', '#c9a227', '#3b78c2', '#8a8f98', '#b4532a', '#7a5fb0', '#4aa3a3']

// One bar a window: the mean script time of a frame, stacked by the groups of the limit file, with the worst frame as a tick and the two limits as lines.
async function picture(judged: Judged[], limits: Limits, file: string): Promise<void> {
  const groups = [...limits.shares.map((s) => s.name), 'every other part']
  const named = new Set(groups.slice(0, -1))
  const parts = (j: Judged): number[] => [...limits.shares.map((s) => j.shares[s.name] ?? 0), Object.entries(j.shares).filter(([k]) => !named.has(k)).reduce((a, [, v]) => a + v, 0)]
  // One frame far above the rest would flatten every bar: the axis ends a little above the largest mean and the median worst frame, and a worst frame above it is drawn at the top edge with an arrow and its number.
  const worsts = judged.map((j) => j.worst).sort((a, b) => a - b)
  const top = Math.max(limits.worstMs * 1.5, 1.6 * Math.max(...judged.map((j) => j.mean)), 1.25 * worsts[Math.floor(worsts.length / 2)]) * 1.05
  const left = 70
  const width = 1500
  const height = 664
  const base = height - 116
  const head = 112
  const y = (ms: number): number => base - ((base - head) * ms) / top
  const slot = (width - left - 30) / judged.length
  const bar = Math.min(64, slot * 0.6)
  const text = (x: number, yy: number, t: string, size = 15, anchor = 'start', fill = '#e6e8eb'): string => `<text x="${x.toFixed(1)}" y="${yy.toFixed(1)}" font-family="DejaVu Sans, sans-serif" font-size="${size}" fill="${fill}" text-anchor="${anchor}">${t.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</text>`
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="#15171a"/>`
  svg += text(20, 30, `The page's own script time in a frame, by window of frames drawn in a row: the bar is the mean, the white tick the worst frame`, 18)
  groups.forEach((g, i) => {
    svg += `<rect x="${20 + i * 205}" y="46" width="14" height="14" fill="${COLOURS[i % COLOURS.length]}"/>` + text(40 + i * 205, 58, g, 14)
  })
  const stepMs = [5, 10, 20, 50, 100, 200, 500, 1000].find((x) => top / x <= 12) ?? 2000
  for (let ms = 0; ms <= top; ms += stepMs) svg += `<line x1="${left}" x2="${width - 30}" y1="${y(ms)}" y2="${y(ms)}" stroke="#2a2e33"/>` + text(left - 8, y(ms) + 5, `${ms}`, 13, 'end', '#9aa0a8')
  svg += text(16, head - 14, 'ms', 13, 'start', '#9aa0a8')
  for (const [ms, name] of [[limits.meanMs, `limit of the mean ${limits.meanMs} ms`], [limits.worstMs, `limit of any frame ${limits.worstMs} ms`]] as [number, string][]) svg += `<line x1="${left}" x2="${width - 30}" y1="${y(ms)}" y2="${y(ms)}" stroke="#ff6b5e" stroke-dasharray="6 4"/>` + (name ? '' : '')
  svg += `<line x1="20" x2="60" y1="77" y2="77" stroke="#ff6b5e" stroke-dasharray="6 4"/>` + text(68, 82, `the limits: ${limits.meanMs} ms in the mean, ${limits.worstMs} ms in any frame`, 14, 'start', '#ff8d83')
  judged.forEach((j, i) => {
    const x = left + i * slot + (slot - bar) / 2
    let sum = 0
    parts(j).forEach((v, k) => {
      svg += `<rect x="${x.toFixed(1)}" y="${y(sum + v).toFixed(1)}" width="${bar.toFixed(1)}" height="${Math.max(0, y(sum) - y(sum + v)).toFixed(1)}" fill="${COLOURS[k % COLOURS.length]}"/>`
      sum += v
    })
    if (j.worst <= top) {
      svg += `<line x1="${(x - 6).toFixed(1)}" x2="${(x + bar + 6).toFixed(1)}" y1="${y(j.worst).toFixed(1)}" y2="${y(j.worst).toFixed(1)}" stroke="#ffffff" stroke-width="2"/>`
      svg += text(x + bar / 2, y(j.worst) - 7, j.worst.toFixed(0), 13, 'middle')
    } else {
      const mid = x + bar / 2
      svg += `<path d="M ${(mid - 7).toFixed(1)} ${(head + 10).toFixed(1)} L ${mid.toFixed(1)} ${head.toFixed(1)} L ${(mid + 7).toFixed(1)} ${(head + 10).toFixed(1)} Z" fill="#ffb347"/>`
      svg += text(mid, head - 8, `${j.worst.toFixed(0)}, above the axis`, 13, 'middle', '#ffb347')
    }
    svg += text(x + bar / 2, base + 20, `${j.from}-${j.to}`, 13, 'middle')
    svg += text(x + bar / 2, base + 38, `bar ${barText(secondsOf(j.from)).slice(4)}`, 12, 'middle', '#9aa0a8')
    svg += text(x + bar / 2, base + 56, `mean ${j.mean.toFixed(0)}`, 13, 'middle')
    svg += text(x + bar / 2, base + 76, j.ok ? 'PASS' : 'FAIL', 13, 'middle', j.ok ? '#6fcf7f' : '#ff8d83') + (j.whole ? '' : text(x + bar / 2, base + 94, `first ${j.frames} of ${j.to - j.from}`, 12, 'middle', '#9aa0a8')) + (j.hitches.length ? text(x + bar / 2, base + 110, `${j.hitches.length} ${j.hitches.length === 1 ? 'hitch' : 'hitches'}: ${j.hitches.slice(0, 2).map((h) => h.frame).join(', ')}${j.hitches.length > 2 ? '...' : ''}`, 12, 'middle', '#ffb347') : '')
  })
  svg += '</svg>'
  await sharp(Buffer.from(svg)).jpeg({ quality: 92 }).toFile(file)
}

async function proof(args: Args, broken: string, limits: Limits): Promise<void> {
  if (broken !== 'slow-frame' && broken !== 'slow-part') throw new Error('script can break the film with --break slow-frame or --break slow-part')
  const [from, to] = span(str(args, 'window', '1000-1012'))
  const tier = str(args, 'tier', 'draft')
  const run = `broken-${broken}`
  const session = await openSession({ only: 'sky', plain: true })
  const findings: Finding[] = []
  try {
    await session.warm(tier)
    await session.cost()
    const control = judge(await measure(session, `${run}-control`, from, to, tier, 'sky', true, to - from), limits)
    const slowAt = from + Math.floor((to - from) / 2)
    if (broken === 'slow-frame') await session.fault('slow', SLOW_FRAME_MS, slowAt)
    else await session.fault('slow', SLOW_PART_MS, -1)
    const faulty = judge(await measure(session, run, from, to, tier, 'sky', true, to - from), limits)
    findings.push({ ok: true, expected: true, what: `before the fault, the film drawn with its sky alone, frames ${from + 1} to ${to}: mean ${control.mean.toFixed(1)} ms, worst ${control.worst.toFixed(1)} ms${control.ok ? ', inside every limit: the check can pass' : `: ${control.over.join('; ')}, so this proof shows nothing`}` })
    const what = broken === 'slow-frame' ? `${SLOW_FRAME_MS} ms more in the field's turn of frame ${slowAt}` : `${SLOW_PART_MS} ms more in the field's turn of every frame`
    findings.push({ ok: faulty.ok, what: faulty.ok ? `with ${what} the window still passes: mean ${faulty.mean.toFixed(1)} ms, worst ${faulty.worst.toFixed(1)} ms` : `with ${what}: ${faulty.over.join('; ')} (worst frame ${faulty.worstAt}: ${faulty.top})` })
    if (broken === 'slow-frame') {
      const hit = faulty.hitches.find((h) => h.frame === slowAt)
      findings.push(hit ? { ok: false, what: `named as a hitch: frame ${hit.frame}, ${hit.ms.toFixed(1)} ms against ${hit.around.toFixed(1)} around it (${hit.parts})` } : { ok: true, expected: true, what: `frame ${slowAt} is NOT named as a hitch` })
      if (control.hitches.length) findings.push({ ok: true, expected: true, what: `before the fault the window already has ${control.hitches.length} hitches, so the hitch above shows less` })
    }
    finish({
      check: 'script',
      sentence: SENTENCE,
      subject: broken === 'slow-frame' ? 'a film in which one frame takes 40 ms longer to prepare' : 'a film whose field takes 4 ms longer in every frame',
      broken,
      complete: true,
      findings,
      table: tableOf([control, faulty]),
      data: { control, faulty, limits },
    })
  } finally {
    await session.close()
  }
}

export async function run(args: Args): Promise<void> {
  const limits = limitsOf(typeof args.limits === 'string' ? args.limits : LIMITS)
  const broken = typeof args.break === 'string' ? args.break : null
  if (broken) return proof(args, broken, limits)
  const all = flag(args, 'all')
  const tier = str(args, 'tier', 'draft')
  const only = str(args, 'only', '')
  const run = only ? `only-${only.replace(/,/g, '-')}` : 'film'
  const upTo = num(args, 'frames', FRAMES)
  const every = Math.max(8, limits.allEvery)
  // The windows where a hold starts or ends come first in every run and are always measured whole.
  const first = limits.first.map(span)
  // A cut the film means must cost nothing: a window round each is measured whole in every run too, unless one of the windows above already holds it with room on both sides.
  const cutFrames = meantCuts()
  for (const c of cutFrames) if (!first.some(([a, b]) => a + AROUND <= c && c + AROUND <= b)) first.push([Math.max(0, c - CUT_ROOM), Math.min(FRAMES - 1, c + CUT_ROOM)])
  // --just measures the windows named and nothing else: a quick answer on a film that changes every few minutes.
  if (flag(args, 'just')) first.length = 0
  const isFirst = ([a, b]: [number, number]): boolean => first.some(([x, y]) => x === a && y === b)
  const rest: [number, number][] = typeof args.window === 'string' ? args.window.split(',').map(span) : all ? Array.from({ length: Math.ceil(FRAMES / every) }, (_, i): [number, number] => [i * every, Math.min(FRAMES - 1, (i + 1) * every - 1)]).filter(([x, y]) => y >= num(args, 'from', 0) && x <= num(args, 'to', FRAMES - 1)) : limits.windows.map(span)
  const spans: [number, number][] = [...first, ...rest.filter((w) => !isFirst(w))]
  const have = (w: [number, number]): Kept | null => {
    const k = kept(run, w[0], w[1])
    return k && !flag(args, 'again') && (k.whole || (!isFirst(w) && k.rows.length >= Math.min(upTo, w[1] - w[0]))) ? k : null
  }
  const todo = flag(args, 'table') ? [] : spans.filter((w) => !have(w))
  console.log(`script · ${ALONE}`)
  if (todo.length) {
    const busy = othersDrawing()
    if (busy) console.log(`script · NOT ALONE: ${busy} other pages are drawing on this machine now. What is measured in this run is marked "not alone" and is too large`)
    const session = await openSession({ only: only || undefined, plain: true })
    try {
      const t0 = Date.now()
      await session.warm(tier)
      await session.cost()
      // --keep: each frame's picture and what it made go where `play` keeps them, so the one drawing in a row also serves nights, cuts and made.
      const keep = flag(args, 'keep') && run === 'film' ? keeper('film', { hash: engineHash(), width: session.info.width, height: session.info.height, sky: session.info.sky, only, tier, quality: '' }) : null
      console.log(`script · ${session.info.width} x ${session.info.height} · ${tier} · ${only || 'everything'} · ${todo.length} of ${spans.length} windows to measure · loaded in ${session.startSeconds.toFixed(1)} s, warmed in ${((Date.now() - t0) / 1000).toFixed(1)} s`)
      let before = -2
      for (const w of todo) {
        const [a, b] = w
        const frames = isFirst(w) ? FRAMES : upTo
        await measure(session, run, a, b, tier, only, !(all && !isFirst(w) && a === before + 1), frames, busy, keep)
        before = frames >= b - a && !isFirst(w) ? b : -2
      }
    } finally {
      await session.close()
    }
  }
  const judged = spans.map(([a, b]) => kept(run, a, b)).filter((k): k is Kept => k !== null).map((k) => judge(k, limits))
  const failing = judged.filter((j) => !j.ok)
  const missing = spans.length - judged.length
  const partly = judged.filter((j) => !j.whole).length
  const findings: Finding[] = []
  if (judged.length === 0) findings.push({ ok: false, what: 'no window is measured on this film yet' })
  else {
    const frames = judged.reduce((a, j) => a + j.frames, 0)
    const mean = judged.reduce((a, j) => a + j.mean * j.frames, 0) / frames
    const worst = judged.reduce((a, j) => (j.worst > a.worst ? j : a), judged[0])
    const sizes = [...new Set(spans.map(([a, b]) => kept(run, a, b)).filter((k): k is Kept => k !== null).map((k) => `${k.width} x ${k.height}, ${k.tier}`))].join(' and ')
    findings.push({ ok: failing.length === 0, what: `${failing.length} of ${judged.length} windows are over a limit (${frames} frames drawn in a row at ${sizes}; limits from tools/checks/limits.json: ${limits.meanMs} ms in the mean of a window, ${limits.worstMs} ms in any frame, ${limits.shares.map((s) => `${s.name} ${s.meanMs}`).join(', ')}, every other part ${limits.everyOtherPartMeanMs}): the page's own script time is ${mean.toFixed(1)} ms a frame over all of them, the worst frame ${worst.worst.toFixed(1)} ms at frame ${worst.worstAt} (${worst.top})` })
    for (const j of failing.slice(0, 40)) findings.push({ ok: false, what: `frames ${j.from} to ${j.to} (${barText(secondsOf(j.from))}): ${j.over.join('; ')}` })
  }
  // A frame that two windows hold is one hitch: the dearer measurement of it is the one listed.
  const hitches = judged.flatMap((j) => j.hitches).sort((a, b) => b.ms - a.ms).filter((h, i, all) => all.findIndex((x) => x.frame === h.frame) === i)
  if (judged.length) {
    findings.push({ ok: hitches.length === 0, what: hitches.length === 0 ? `no hitch: no frame is over ${limits.worstMs} ms and over ${TIMES} times the median of the ${2 * AROUND} frames around it` : `${hitches.length} ${hitches.length === 1 ? 'hitch' : 'hitches'}, frames over ${limits.worstMs} ms and over ${TIMES} times the median of the ${2 * AROUND} frames around them: ${hitches.slice(0, 12).map((h) => `${h.frame} (${h.ms.toFixed(0)} ms against ${h.around.toFixed(0)}: ${h.parts})`).join('; ')}${hitches.length > 12 ? ` and ${hitches.length - 12} more` : ''}` })
    if (hitches.length) console.log(`script · every hitch, the dearest first\n${table(['frame', 'bar', 'ms', 'median around', 'times', 'its parts over 1 ms'], hitches.map((h) => [h.frame, barText(secondsOf(h.frame)).slice(4), h.ms.toFixed(1), h.around.toFixed(1), (h.ms / Math.max(0.1, h.around)).toFixed(1), h.parts]))}\n`)
  }
  for (const c of cutFrames) {
    const w = first.find(([a, b]) => a + AROUND <= c && c + AROUND <= b)
    const k = w ? kept(run, w[0], w[1]) : null
    const i = k ? k.rows.findIndex((r) => r.frame === c) : -1
    if (!k || i < 0) {
      findings.push({ ok: true, expected: true, what: `the cut into frame ${c} (${barText(secondsOf(c))}) is not measured yet on this film` })
      continue
    }
    const near = k.rows.slice(Math.max(0, i - AROUND), i + AROUND + 1).filter((r) => r.frame !== c).map((r) => r.cost.script).sort((x, y) => x - y)
    const around = near[Math.floor(near.length / 2)]
    const r = k.rows[i]
    const long = r.cost.script > limits.worstMs || r.cost.script > around + limits.cutOverMs
    findings.push({ ok: !long && !r.made, what: `a cut must cost nothing: the cut into frame ${c} (${barText(secondsOf(c))}) costs ${r.cost.script.toFixed(1)} ms against ${around.toFixed(1)} around it${long ? `, over the ${limits.worstMs} ms of any frame or over the frames around by more than ${limits.cutOverMs} ms (${largest(r.cost)})` : ''}, and ${r.made ? `makes ${r.made}` : 'makes nothing'}` })
  }
  const behind = judged.flatMap((j) => j.behind)
  if (behind.length) {
    findings.push({ ok: true, expected: true, what: `the machine was behind in ${behind.length} ${behind.length === 1 ? 'frame' : 'frames'}: over ${BEHIND_TIMES} times the frames around with nothing made, and under ${FILM_TIMES} times them when drawn again after a pause, so the first number is the machine's and the second is judged: ${behind.map((b) => `${b.frame} (${b.firstMs.toFixed(0)} ms the first time, in ${b.lap}; ${b.againMs.toFixed(1)} ms again)`).join('; ')}` })
    console.log(`script · the machine was behind: not counted as hitches\n${table(['frame', 'bar', 'ms the first time', 'the lap it landed in', 'ms drawn again after a pause'], behind.map((b) => [b.frame, barText(secondsOf(b.frame)).slice(4), b.firstMs.toFixed(1), b.lap, b.againMs.toFixed(1)]))}\n`)
  }
  if (missing > 0) findings.push({ ok: true, expected: true, what: `${missing} of ${spans.length} windows are not measured yet on this film` })
  if (partly > 0) findings.push({ ok: true, expected: true, what: `${partly} windows are measured only in their first frames` })
  const notAlone = judged.filter((j) => j.busy).length
  if (notAlone > 0) findings.push({ ok: true, expected: true, what: `${notAlone} windows were measured while other pages were drawing on the machine: their numbers are too large. ${ALONE}. Measure them again with --again` })
  else if (judged.length) findings.push({ ok: true, what: `measured alone: no other page was drawing when a run began. ${ALONE}` })
  const sheet = path.join(dirOf(run), all ? 'script-all.jpg' : 'script.jpg')
  if (judged.length) await picture(judged, limits, sheet)
  finish({
    check: 'script',
    pictures: judged.length ? [{ file: path.relative(process.cwd(), sheet), caption: `The page's own script time in a frame by window, the mean stacked by part and the worst frame, against the limits of ${limits.meanMs} and ${limits.worstMs} ms` }] : [],
    name: only ? `script.only-${only.replace(/,/g, '-')}` : all ? 'script.all' : 'script',
    sentence: SENTENCE,
    subject: only ? `the film drawn with ${only} alone` : 'the film',
    broken: null,
    complete: missing === 0 && partly === 0 && notAlone === 0,
    findings,
    table: judged.length ? tableOf(judged) : undefined,
    data: { run, limits, windows: judged, hitches, behind },
  })
}
