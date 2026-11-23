// The script cost of the film's hardest stretches as one table: opens the built page, waits until the film is ready, sets every frame of each stretch with every draw call left out, and prints one row for each owner.
// npm run build, then: npx tsx src/player/steps.ts --name today
// Saved runs side by side: npx tsx src/player/steps.ts --beside today,one-laying,keys-apart. A saved run again: --show today
// Run it alone on the machine: anything else that works at the same time shows as script time.
import { execSync } from 'node:child_process'
import fs from 'node:fs'
import { launch } from '../../tools/lib/browser.ts'
import { at } from '../../tools/lib/paths.ts'
import { serve } from '../../tools/lib/server.ts'
import { config } from '../config.ts'
import { inOrder, longestOver, overText, type OwnerCost, type StateReport } from './state.ts'

const arg = (name: string, fallback: string): string => {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback
}
const out = (...p: string[]): string => at('out', 'work', 'player', 'steps', ...p)
const FRAME_MS = 1000 / config.film.fps
const n1 = (v: number): string => v.toFixed(v >= 100 ? 0 : v >= 10 ? 1 : 2)
const mb = (bytes: number): string => (bytes / 1048576).toFixed(2)

interface Stretch { from: number; to: number; passes: StateReport[] }
interface Saved { name: string; at: string; commit: string; size: string; readySeconds: number; machine: string[]; passes: number; stretches: Stretch[] }

// The quieter of the passes stands for a stretch: a spike that does not come again is the machine's.
const quiet = (s: Stretch): StateReport => s.passes.reduce((a, b) => (b.script.meanMs < a.script.meanMs ? b : a))
const rowsOf = (r: StateReport): OwnerCost[] => {
  const by = new Map(r.owners.map((c) => [c.owner, c]))
  return [r.script, ...inOrder([...by.keys()]).map((n) => by.get(n) as OwnerCost)]
}

function table(saved: Saved): string {
  const lines = [
    `# Script alone, ${saved.name}`,
    '',
    `Commit ${saved.commit}. ${saved.size} ${saved.at}. Ready after ${saved.readySeconds.toFixed(1)} s.`,
    ...saved.machine,
    `Every frame of a stretch is set in a row with every draw call left out. The quieter of ${saved.passes} ${saved.passes === 1 ? 'pass' : 'passes'} is shown. A frame of the film is ${FRAME_MS.toFixed(1)} ms.`,
  ]
  for (const s of saved.stretches) {
    const r = quiet(s)
    lines.push('', `## Frames ${s.from} to ${s.to}`, '', '| owner | mean ms | worst ms | at frame | MB sent a frame | most MB | at frame |', '| --- | ---: | ---: | ---: | ---: | ---: | ---: |')
    for (const c of rowsOf(r)) lines.push(`| ${c.owner} | ${n1(c.meanMs)} | ${n1(c.worstMs)} | ${c.worstAtFrame} | ${mb(c.meanBytes)} | ${mb(c.worstBytes)} | ${c.worstBytesAtFrame < 0 ? '' : c.worstBytesAtFrame} |`)
    lines.push('', `Over ${FRAME_MS.toFixed(1)} ms of script: ${overText(r)}. Made on the graphics card: ${r.made === 0 ? 'nothing' : `${r.made} things`}. Not in the sums, pictures kept for later frames and really drawn: ${n1(r.drawnMs.mean)} ms a frame, the most ${n1(r.drawnMs.worst)} ms.`)
    lines.push(`Script mean of each pass: ${s.passes.map((p) => n1(p.script.meanMs)).join(', ')} ms; worst of each pass: ${s.passes.map((p) => `${n1(p.script.worstMs)} at ${p.script.worstAtFrame}`).join(', ')}.`)
  }
  return lines.join('\n')
}

function beside(names: string[]): string {
  const runs = names.map((n) => JSON.parse(fs.readFileSync(out(`${n}.json`), 'utf8')) as Saved)
  const lines = ['# Script alone, side by side', '', ...runs.map((r) => `${r.name}: commit ${r.commit}. ${r.size} ${r.at}`), '', 'Each cell: mean ms / worst ms / MB sent a frame.']
  for (const s of runs[0].stretches) {
    lines.push('', `## Frames ${s.from} to ${s.to}`, '', `| owner | ${runs.map((r) => r.name).join(' | ')} |`, `| --- | ${runs.map(() => '---:').join(' | ')} |`)
    const reports = runs.map((r) => {
      const same = r.stretches.find((x) => x.from === s.from && x.to === s.to)
      return same ? quiet(same) : null
    })
    const names = new Set<string>()
    for (const r of reports) if (r) for (const c of r.owners) names.add(c.owner)
    for (const owner of ['script', ...inOrder([...names])]) {
      const cells = reports.map((r) => {
        const c = !r ? null : owner === 'script' ? r.script : r.owners.find((x) => x.owner === owner)
        return c ? `${n1(c.meanMs)} / ${n1(c.worstMs)} / ${mb(c.meanBytes)}` : 'none'
      })
      lines.push(`| ${owner} | ${cells.join(' | ')} |`)
    }
    lines.push(`| frames over ${FRAME_MS.toFixed(1)} ms | ${reports.map((r) => (r ? `${r.overFrame} of ${r.frames}` : 'none')).join(' | ')} |`)
    lines.push(`| longest run of them | ${reports.map((r) => { const run = r ? r.overRun ?? longestOver(r.rows ?? []) : null; return run ? `${run.frames}, ${run.from} to ${run.to}` : 'none' }).join(' | ')} |`)
  }
  return lines.join('\n')
}

fs.mkdirSync(out(), { recursive: true })
const together = arg('beside', '')
if (together) {
  const text = beside(together.split(','))
  fs.writeFileSync(out(`beside-${together.split(',').join('-')}.md`), `${text}\n`)
  console.log(text)
  process.exit(0)
}

const again = arg('show', '')
if (again) {
  console.log(table(JSON.parse(fs.readFileSync(out(`${again}.json`), 'utf8')) as Saved))
  process.exit(0)
}

const name = arg('name', 'steps')
const ranges = arg('ranges', '1255-1290,2078-2110,2906-3020').split(',').map((r) => r.split('-').map(Number) as [number, number])
const passes = Math.max(1, Number(arg('times', '2')))
const size = arg('size', '')
const query = /^\d+x\d+$/.test(size) ? `?w=${size.split('x')[0]}&h=${size.split('x')[1]}` : ''
const served = await serve(arg('dist', at('dist')))
const browser = await launch()
const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 })
await context.addInitScript('globalThis.__name = globalThis.__name || function (f) { return f }')
const page = await context.newPage()
page.on('pageerror', (e) => console.error('page error', e.message))
const started = Date.now()
void page.goto(`${served.url}/index.html${query}`, { waitUntil: 'commit' })
await page.waitForFunction(() => !!window.player && window.player.activity === 'ready' && window.player.shown >= 0, null, { timeout: 3600000, polling: 1000 })
const readySeconds = (Date.now() - started) / 1000
console.error(`ready after ${readySeconds.toFixed(1)} s`)
const machine = await page.evaluate(() => {
  const canvas = document.querySelector('canvas') as HTMLCanvasElement
  const gl = canvas.getContext('webgl2')
  const info = gl?.getExtension('WEBGL_debug_renderer_info')
  return [`Picture ${canvas.width} x ${canvas.height}, ${navigator.hardwareConcurrency} processor threads.`, `Graphics: ${gl && info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : 'not named'}.`]
})
let commit = 'unknown'
try {
  commit = execSync('git rev-parse --short HEAD', { cwd: at(), encoding: 'utf8' }).trim()
} catch {}
const saved: Saved = { name, at: new Date().toISOString(), commit, size: machine[0], readySeconds, machine: machine.slice(1), passes, stretches: ranges.map(([from, to]) => ({ from, to, passes: [] })) }
for (let pass = 0; pass < passes; pass++) {
  for (const s of saved.stretches) {
    const report = await page.evaluate(([a, b]) => window.player!.script(a, b), [s.from, s.to])
    if (!report) throw new Error(`frames ${s.from} to ${s.to} gave no report: ${await page.evaluate(() => window.player!.error)}`)
    s.passes.push(report)
    fs.writeFileSync(out(`${name}.json`), JSON.stringify(saved))
    console.error(`pass ${pass + 1}, frames ${s.from} to ${s.to}: script mean ${n1(report.script.meanMs)} ms, worst ${n1(report.script.worstMs)} ms at ${report.script.worstAtFrame}, ${mb(report.script.meanBytes)} MB a frame`)
  }
}
await browser.close()
await served.close()
const text = table(saved)
fs.writeFileSync(out(`${name}.md`), `${text}\n`)
console.log(text)
