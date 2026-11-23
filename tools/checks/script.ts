import fs from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'
import type { Args } from '../lib/args.ts'
import { flag, num, str } from '../lib/args.ts'
import { at } from '../lib/paths.ts'
import { barText, FRAMES, secondsOf } from './lib/film.ts'
import { engineHash, finish, OUT, type Finding } from './lib/report.ts'
import { openSession, type Session } from './lib/session.ts'

const SENTENCE = "whenever there's a scene change we have a huge frame rate drop ... we need to make sure that doesn't happen"

// The page's own script time in a frame, by part, from the film's own laps (film.cost), with frames drawn in a row as the film plays them.
// The time the graphics card, or here the processor in its place, takes to draw is not in the number.
//   npm run checks -- script                      the windows of tools/checks/limits.json that are not measured yet on this film, then the table of all of them
//   npm run checks -- script --window 2070-2110   one window, or several with commas
//   npm run checks -- script --all                the whole film, in windows drawn one after the other without a jump
//   npm run checks -- script --frames 8           only the first 8 counted frames of each window: a quick look, never a whole verdict
//   npm run checks -- script --again              measures again what is already measured
//   npm run checks -- script --table              draws nothing: the table of what is measured
//   npm run checks -- script --break slow-frame   the film with the sky alone, which passes, then with 40 ms more in one frame: the check has to fail
//   npm run checks -- script --break slow-part    the same with 4 ms more in the field's turn of every frame
// A window that has been measured is kept until the film changes, so the check can be run in parts.

interface Share { name: string; parts: string[]; meanMs: number }
interface Limits { meanMs: number; worstMs: number; shares: Share[]; everyOtherPartMeanMs: number; windows: string[]; allEvery: number }
interface Row { frame: number; cost: Record<string, number> }
interface Kept { hash: string; from: number; to: number; whole: boolean; jump: boolean; width: number; height: number; tier: string; only: string; rows: Row[] }
interface Judged { from: number; to: number; frames: number; whole: boolean; mean: number; worst: number; worstAt: number; top: string; over: string[]; ok: boolean; shares: Record<string, number> }

const LIMITS = at('tools', 'checks', 'limits.json')
const NOT_PARTS = new Set(['script', 'wait'])
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
  const top = Object.entries(worstRow.cost).filter(([key]) => !NOT_PARTS.has(key)).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([key, v]) => `${key} ${v.toFixed(1)}`).join(', ')
  return { from: k.from, to: k.to, frames: rows.length, whole: k.whole, mean, worst: worstRow.cost.script, worstAt: worstRow.frame, top, over, ok: over.length === 0, shares }
}

const dirOf = (run: string): string => path.join(OUT, 'script', run)
const fileOf = (run: string, from: number, to: number): string => path.join(dirOf(run), `window-${String(from).padStart(4, '0')}-${String(to).padStart(4, '0')}.json`)

function kept(run: string, from: number, to: number): Kept | null {
  const file = fileOf(run, from, to)
  if (!fs.existsSync(file)) return null
  const k = JSON.parse(fs.readFileSync(file, 'utf8')) as Kept
  return k.hash === engineHash() ? k : null
}

// Draws one window in a row and keeps the film's laps of every frame but the first after a jump.
async function measure(session: Session, run: string, from: number, to: number, tier: string, only: string, jump: boolean, upTo: number): Promise<Kept> {
  const rows: Row[] = []
  const last = Math.min(to, from + (jump ? upTo : upTo - 1))
  const t0 = Date.now()
  for (let f = from; f <= last; f++) {
    await session.draw(f, tier, false)
    const cost = await session.cost()
    if (f > from || !jump) rows.push({ frame: f, cost })
  }
  const k: Kept = { hash: engineHash(), from, to, whole: last === to, jump, width: session.info.width, height: session.info.height, tier, only, rows }
  fs.mkdirSync(dirOf(run), { recursive: true })
  fs.writeFileSync(fileOf(run, from, to), JSON.stringify(k) + '\n')
  const j = judge(k, limitsOf())
  console.log(`script · frames ${from} to ${last} · ${rows.length} counted · mean ${j.mean.toFixed(1)} ms, worst ${j.worst.toFixed(1)} ms at frame ${j.worstAt} (${j.top}) · drawn in ${((Date.now() - t0) / 1000).toFixed(0)} s`)
  return k
}

const tableOf = (judged: Judged[]): { head: string[]; rows: (string | number)[][] } => ({
  head: ['window', 'bar', 'frames counted', 'mean ms', 'worst ms', 'worst frame', 'the three largest parts there', 'over its limit', 'verdict'],
  rows: judged.map((j) => [`${j.from}-${j.to}`, barText(secondsOf(j.from)).slice(4), `${j.frames}${j.whole ? '' : ' (not whole)'}`, j.mean.toFixed(1), j.worst.toFixed(1), j.worstAt, j.top, j.over.length ? j.over.join('; ') : 'nothing', j.ok ? 'PASS' : 'FAIL']),
})

const COLOURS = ['#3f8f4f', '#c9a227', '#3b78c2', '#8a8f98', '#b4532a']

// One bar a window: the mean script time of a frame, stacked by the groups of the limit file, with the worst frame as a tick and the two limits as lines.
async function picture(judged: Judged[], limits: Limits, file: string): Promise<void> {
  const groups = [...limits.shares.map((s) => s.name), 'every other part']
  const named = new Set(groups.slice(0, -1))
  const parts = (j: Judged): number[] => [...limits.shares.map((s) => j.shares[s.name] ?? 0), Object.entries(j.shares).filter(([k]) => !named.has(k)).reduce((a, [, v]) => a + v, 0)]
  const top = Math.max(limits.worstMs * 1.5, ...judged.map((j) => j.worst)) * 1.05
  const left = 70
  const width = 1500
  const height = 664
  const base = height - 116
  const head = 86
  const y = (ms: number): number => base - ((base - head) * ms) / top
  const slot = (width - left - 30) / judged.length
  const bar = Math.min(64, slot * 0.6)
  const text = (x: number, yy: number, t: string, size = 15, anchor = 'start', fill = '#e6e8eb'): string => `<text x="${x.toFixed(1)}" y="${yy.toFixed(1)}" font-family="DejaVu Sans, sans-serif" font-size="${size}" fill="${fill}" text-anchor="${anchor}">${t.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</text>`
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="#15171a"/>`
  svg += text(20, 30, `The page's own script time in a frame, by window of frames drawn in a row: the bar is the mean, the white tick the worst frame`, 18)
  groups.forEach((g, i) => {
    svg += `<rect x="${20 + i * 215}" y="46" width="14" height="14" fill="${COLOURS[i]}"/>` + text(40 + i * 215, 58, g, 14)
  })
  const stepMs = top > 160 ? 50 : top > 60 ? 20 : 10
  for (let ms = 0; ms <= top; ms += stepMs) svg += `<line x1="${left}" x2="${width - 30}" y1="${y(ms)}" y2="${y(ms)}" stroke="#2a2e33"/>` + text(left - 8, y(ms) + 5, `${ms}`, 13, 'end', '#9aa0a8')
  svg += text(16, head - 14, 'ms', 13, 'start', '#9aa0a8')
  for (const [ms, name] of [[limits.meanMs, `limit of the mean ${limits.meanMs} ms`], [limits.worstMs, `limit of any frame ${limits.worstMs} ms`]] as [number, string][]) svg += `<line x1="${left}" x2="${width - 30}" y1="${y(ms)}" y2="${y(ms)}" stroke="#ff6b5e" stroke-dasharray="6 4"/>` + (name ? '' : '')
  svg += `<line x1="${width - 420}" x2="${width - 380}" y1="53" y2="53" stroke="#ff6b5e" stroke-dasharray="6 4"/>` + text(width - 372, 58, `the limits: ${limits.meanMs} ms in the mean, ${limits.worstMs} ms in any frame`, 14, 'start', '#ff8d83')
  judged.forEach((j, i) => {
    const x = left + i * slot + (slot - bar) / 2
    let sum = 0
    parts(j).forEach((v, k) => {
      svg += `<rect x="${x.toFixed(1)}" y="${y(sum + v).toFixed(1)}" width="${bar.toFixed(1)}" height="${Math.max(0, y(sum) - y(sum + v)).toFixed(1)}" fill="${COLOURS[k]}"/>`
      sum += v
    })
    svg += `<line x1="${(x - 6).toFixed(1)}" x2="${(x + bar + 6).toFixed(1)}" y1="${y(j.worst).toFixed(1)}" y2="${y(j.worst).toFixed(1)}" stroke="#ffffff" stroke-width="2"/>`
    svg += text(x + bar / 2, y(j.worst) - 7, j.worst.toFixed(0), 13, 'middle')
    svg += text(x + bar / 2, base + 20, `${j.from}-${j.to}`, 13, 'middle')
    svg += text(x + bar / 2, base + 38, `bar ${barText(secondsOf(j.from)).slice(4)}`, 12, 'middle', '#9aa0a8')
    svg += text(x + bar / 2, base + 56, `mean ${j.mean.toFixed(0)}`, 13, 'middle')
    svg += text(x + bar / 2, base + 76, j.ok ? 'PASS' : 'FAIL', 13, 'middle', j.ok ? '#6fcf7f' : '#ff8d83') + (j.whole ? '' : text(x + bar / 2, base + 94, `first ${j.frames} of ${j.to - j.from}`, 12, 'middle', '#9aa0a8'))
  })
  svg += '</svg>'
  await sharp(Buffer.from(svg)).jpeg({ quality: 92 }).toFile(file)
}

async function proof(args: Args, broken: string, limits: Limits): Promise<void> {
  if (broken !== 'slow-frame' && broken !== 'slow-part') throw new Error('script can break the film with --break slow-frame or --break slow-part')
  const [from, to] = span(str(args, 'window', '1000-1012'))
  const tier = str(args, 'tier', 'draft')
  const run = `broken-${broken}`
  const session = await openSession({ only: 'sky' })
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
  const spans: [number, number][] = typeof args.window === 'string' ? args.window.split(',').map(span) : all ? Array.from({ length: Math.ceil(FRAMES / every) }, (_, i): [number, number] => [i * every, Math.min(FRAMES - 1, (i + 1) * every - 1)]) : limits.windows.map(span)
  const have = (a: number, b: number): Kept | null => {
    const k = kept(run, a, b)
    return k && !flag(args, 'again') && (k.whole || k.rows.length >= Math.min(upTo, b - a)) ? k : null
  }
  const todo = flag(args, 'table') ? [] : spans.filter(([a, b]) => !have(a, b))
  if (todo.length) {
    const session = await openSession({ only: only || undefined })
    try {
      const t0 = Date.now()
      await session.warm(tier)
      await session.cost()
      console.log(`script · ${session.info.width} x ${session.info.height} · ${tier} · ${only || 'everything'} · ${todo.length} of ${spans.length} windows to measure · loaded in ${session.startSeconds.toFixed(1)} s, warmed in ${((Date.now() - t0) / 1000).toFixed(1)} s`)
      let before = -2
      for (const [a, b] of todo) {
        await measure(session, run, a, b, tier, only, !(all && a === before + 1), upTo)
        before = upTo >= b - a ? b : -2
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
  if (missing > 0) findings.push({ ok: true, expected: true, what: `${missing} of ${spans.length} windows are not measured yet on this film` })
  if (partly > 0) findings.push({ ok: true, expected: true, what: `${partly} windows are measured only in their first frames` })
  const sheet = path.join(dirOf(run), all ? 'script-all.jpg' : 'script.jpg')
  if (judged.length) await picture(judged, limits, sheet)
  finish({
    check: 'script',
    pictures: judged.length ? [{ file: path.relative(process.cwd(), sheet), caption: `The page's own script time in a frame by window, the mean stacked by part and the worst frame, against the limits of ${limits.meanMs} and ${limits.worstMs} ms` }] : [],
    name: only ? `script.only-${only.replace(/,/g, '-')}` : all ? 'script.all' : 'script',
    sentence: SENTENCE,
    subject: only ? `the film drawn with ${only} alone` : 'the film',
    broken: null,
    complete: missing === 0 && partly === 0,
    findings,
    table: judged.length ? tableOf(judged) : undefined,
    data: { run, limits, windows: judged },
  })
}
