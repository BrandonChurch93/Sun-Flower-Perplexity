import fs from 'node:fs'
import path from 'node:path'
import { barAt } from '../src/v2/clock.ts'
import { config } from '../src/config.ts'
import { parseArgs, str } from './lib/args.ts'
import { WORK } from './lib/paths.ts'

// Reads what the parts wrote down about each frame they drew and says where the film is dear: by stretch, the worst frames, and every frame in which the graphics card was asked to make something.
//   npm run costs
//   npm run costs -- --dir out/work/parts/preview-draft --every 96

interface Row {
  frame: number
  page: number
  cost: Record<string, number>
  writeMb: number
  made?: Record<string, number>
}

const args = parseArgs()
const dir = str(args, 'dir', path.join(WORK, 'parts', 'preview-draft'))
const every = Number(str(args, 'every', '106'))
const limits = JSON.parse(fs.readFileSync('tools/checks/limits.json', 'utf8')).script as { meanMs: number; worstMs: number }
const rows: (Row & { commit: string; first: boolean })[] = []
for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.cost.json')).sort()) {
  const part = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')) as { commit: string; rows: Row[] }
  const seen = new Set<number>()
  let last = -2
  for (const r of part.rows) {
    const first = !seen.has(r.page) || r.frame !== last + 1
    seen.add(r.page)
    last = r.frame
    rows.push({ ...r, commit: part.commit, first })
  }
}
if (!rows.length) throw new Error(`no cost records in ${dir}`)
rows.sort((a, b) => a.frame - b.frame)
const fps = config.film.fps
const bar = (f: number): string => barAt(f / fps).toFixed(2)
const counted = rows.filter((r) => !r.first)
const mean = (xs: number[]): number => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0)
const names = [...new Set(counted.flatMap((r) => Object.keys(r.cost)))].filter((k) => k !== 'script' && k !== 'wait')
console.log(`costs · ${rows.length} frames from ${rows[0].frame} to ${rows[rows.length - 1].frame} · the first frame of each run is left out · limits ${limits.meanMs} ms mean, ${limits.worstMs} ms worst`)
console.log('stretch        bars            mean   worst  over  dearest parts (mean ms)')
for (let a = rows[0].frame - (rows[0].frame % every); a <= rows[rows.length - 1].frame; a += every) {
  const here = counted.filter((r) => r.frame >= a && r.frame < a + every)
  if (!here.length) continue
  const scripts = here.map((r) => r.cost.script ?? 0)
  const parts = names.map((k) => [k, mean(here.map((r) => r.cost[k] ?? 0))] as const).filter(([, v]) => v >= 0.5).sort((x, y) => y[1] - x[1]).slice(0, 5)
  console.log(`${String(a).padStart(4)} to ${String(Math.min(a + every - 1, rows[rows.length - 1].frame)).padStart(4)}   ${bar(a).padStart(5)} to ${bar(a + every - 1).padStart(5)}  ${mean(scripts).toFixed(1).padStart(6)}  ${Math.max(...scripts).toFixed(1).padStart(6)}  ${String(scripts.filter((x) => x > limits.worstMs).length).padStart(4)}  ${parts.map(([k, v]) => `${k} ${v.toFixed(1)}`).join(', ')}`)
}
const scripts = counted.map((r) => r.cost.script ?? 0)
console.log(`whole          mean ${mean(scripts).toFixed(1)} ms · worst ${Math.max(...scripts).toFixed(1)} ms · ${scripts.filter((x) => x > limits.worstMs).length} of ${scripts.length} frames over ${limits.worstMs} ms`)
// A hitch is a frame that costs far more than the frames around it: that is what a viewer sees as a stutter, whatever the level.
const hitches = counted.map((r, i) => {
  const near = counted.slice(Math.max(0, i - 8), i + 9).map((x) => x.cost.script ?? 0).sort((x, y) => x - y)
  return { r, median: near[Math.floor(near.length / 2)] }
}).filter(({ r, median }) => (r.cost.script ?? 0) > Math.max(limits.worstMs, 3 * median))
console.log(`hitches (over ${limits.worstMs} ms and over three times the frames around): ${hitches.length}`)
for (const { r, median } of hitches.sort((x, y) => (y.r.cost.script ?? 0) - (x.r.cost.script ?? 0)).slice(0, 40)) {
  const parts = Object.entries(r.cost).filter(([k, v]) => k !== 'script' && k !== 'wait' && v >= 1).sort((x, y) => y[1] - x[1]).slice(0, 4).map(([k, v]) => `${k} ${v.toFixed(1)}`).join(', ')
  console.log(`  frame ${r.frame} · bar ${bar(r.frame)} · ${(r.cost.script ?? 0).toFixed(1)} ms against ${median.toFixed(1)} around · ${parts}`)
}
const made = rows.filter((r) => r.made && !r.first)
console.log(made.length ? `made after loading: ${made.length} frames` : 'made after loading: nothing, in any frame')
for (const r of made.slice(0, 40)) console.log(`  frame ${r.frame} · bar ${bar(r.frame)} · ${JSON.stringify(r.made)}`)
fs.writeFileSync(path.join(dir, 'costs.json'), `${JSON.stringify({ frames: rows.length, meanMs: mean(scripts), worstMs: Math.max(...scripts), hitches: hitches.map(({ r, median }) => ({ frame: r.frame, ms: r.cost.script, around: median })), made: made.map((r) => ({ frame: r.frame, made: r.made })) }, null, 2)}\n`)
