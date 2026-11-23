// The pacing meter as a tool: opens the built page, measures loading, plays stretches of the film against the clock and then draws them frame after frame.
// npx tsx src/player/meter.ts --ranges 0-300,2050-2200 --size 320x180 --burst 10 --every 30 --name mine
// Under software drawing the wait for the picture says nothing about a real machine: script time and that wait are printed apart.
import fs from 'node:fs'
import { launch, openPage } from '../../tools/lib/browser.ts'
import { at } from '../../tools/lib/paths.ts'
import { serve } from '../../tools/lib/server.ts'
import { config } from '../config.ts'
import type { Made } from '../v2/counter.ts'
import type { LoadingLog } from './loading.ts'
import type { Report } from './pacing.ts'

const arg = (name: string, fallback: string): string => {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback
}
const ranges = arg('ranges', '0-300,2050-2200').split(',').map((r) => r.split('-').map(Number) as [number, number])
const size = arg('size', '320x180')
const name = arg('name', 'mine')
// Frames in a row are drawn in runs of `burst` frames that start every `every` frames. The first frame of a run follows a jump and is counted apart.
const burst = Number(arg('burst', '10'))
const every = Number(arg('every', '0'))
const query = /^\d+x\d+$/.test(size) ? `?w=${size.split('x')[0]}&h=${size.split('x')[1]}` : `?format=${size}`
const FRAME_MS = 1000 / config.film.fps
const r1 = (v: number): number => Math.round(v * 10) / 10
const mean = (a: number[]): number => (a.length ? a.reduce((p, q) => p + q, 0) / a.length : 0)
const p99 = (a: number[]): number => (a.length ? [...a].sort((p, q) => p - q)[Math.min(a.length - 1, Math.floor(0.99 * a.length))] : 0)
const things = (m: Made): number => m.programs + m.shaders + m.textures + m.buffers + m.framebuffers + m.renderbuffers + m.uploads

const served = await serve(at('dist'))
const browser = await launch(['--autoplay-policy=no-user-gesture-required'])
const page = await openPage(browser, 1280, 720)
const errors: string[] = []
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text().slice(0, 300))
})
page.on('pageerror', (e) => errors.push(`pageerror ${e.message}`))

const started = Date.now()
await page.goto(`${served.url}/index.html${query}`, { waitUntil: 'load' })
await page.waitForFunction(() => !!window.player && window.player.activity === 'ready' && window.player.shown >= 0, null, { timeout: 900000, polling: 500 })
const loadSeconds = (Date.now() - started) / 1000
const log = (await page.evaluate(() => window.loadingLog)) as LoadingLog
const madeAtReady = await page.evaluate(() => window.showcase.made())
const freezes = log.freezes
  .map((f) => {
    const inside = log.steps.filter((s) => s.atMs >= f.fromMs && s.atMs <= f.fromMs + f.ms + 5)
    const scriptMs = inside.reduce((p, s) => p + (s.scriptMs ?? 0), 0)
    return { fromMs: f.fromMs, ms: f.ms, steps: inside.map((s) => s.what), scriptMs: inside.some((s) => s.scriptMs !== undefined) ? scriptMs : null }
  })
  .sort((a, b) => b.ms - a.ms)
const sceneEnd = log.steps.filter((s) => s.what.startsWith('part')).reduce((p, s) => Math.max(p, s.atMs), 0)
console.log(`loading · ${size} · ready after ${loadSeconds.toFixed(1)} s (the page's clock ${((log.readyMs ?? 0) / 1000).toFixed(1)} s, the scene's parts done at ${(sceneEnd / 1000).toFixed(1)} s)`)
console.log(`loading · every step, the time since the step before it:`)
log.steps.forEach((s, i) => {
  const took = s.atMs - (i > 0 ? log.steps[i - 1].atMs : 0)
  console.log(`  ${String(took).padStart(6)} ms · ${s.what}${s.scriptMs !== undefined ? ` · script ${s.scriptMs} ms, the rest is the wait for the picture` : ''}`)
})
console.log(`loading · ${freezes.length} stretches over 250 ms without a painted frame, the longest:`)
for (const f of freezes.slice(0, 8)) console.log(`  ${String(f.ms).padStart(6)} ms from ${(f.fromMs / 1000).toFixed(1).padStart(6)} s · ${f.steps.join(' + ') || 'no step ended in it'}${f.scriptMs !== null ? ` · of it script ${f.scriptMs} ms` : ''}`)

const seek = async (frame: number): Promise<void> => {
  await page.evaluate((f) => {
    const r = document.querySelector('input[type=range]') as HTMLInputElement
    r.value = String(f)
    r.dispatchEvent(new Event('input', { bubbles: true }))
  }, frame)
  await page.waitForFunction((f) => window.player!.shown === f && window.player!.activity === 'ready', frame, { timeout: 300000, polling: 100 })
}

interface Row { frame: number; scriptMs: number; cardMs: number; made: number; parts: Record<string, number>; jump: boolean }
const out: Record<string, unknown> = { size, at: new Date().toISOString(), loading: { seconds: loadSeconds, log, freezes }, madeAtReady }

for (const [first, last] of ranges) {
  await seek(first)
  const live = (await page.evaluate(async ([a, b]) => {
    await window.player!.range(a, b)
    return window.showcase.pacing()
  }, [first, last])) as Report | null
  if (!live) throw new Error(`frames ${first} to ${last} did not play`)
  const head = live.shown[0]
  const rest = live.shown.slice(1)
  console.log(`\nframes ${first} to ${last} · played against the clock (${live.tier}, ${live.format})`)
  console.log(`  due ${live.frames.due}, shown ${live.frames.drawn}, skipped ${live.frames.skipped}, shown late ${live.frames.late} · film ${live.seconds.film} s in ${live.seconds.audio} s of the clock`)
  console.log(`  script a frame: mean ${live.scriptMs.mean} ms, 99th ${live.scriptMs.p99}, longest ${live.scriptMs.longest} at ${live.scriptMs.longestAtFilm} s · wait for the picture: mean ${live.cardMs.mean} ms`)
  console.log(`  shown frame to shown frame: mean ${live.gapMs.mean} ms, longest ${live.gapMs.longest} ms · made ${live.made ? things(live.made) : 'not counted'}`)
  console.log(`  the first frame of play (${head.frame}): script ${head.scriptMs} ms, made ${head.made}; the frames after it: script mean ${r1(mean(rest.map((s) => s.scriptMs)))} ms`)

  const rows: Row[] = []
  const starts: number[] = []
  if (every > burst) for (let f = first; f <= last; f += every) starts.push(f)
  else starts.push(first)
  for (const start of starts) {
    const to = every > burst ? Math.min(last, start + burst - 1) : last
    for (let from = start; from <= to; from += 25) {
      rows.push(
        ...(await page.evaluate(async ([a, b, start]) => {
          const rows: { frame: number; scriptMs: number; cardMs: number; made: number; parts: Record<string, number>; jump: boolean }[] = []
          const sum = (m: ReturnType<typeof window.showcase.made>): number => m.programs + m.shaders + m.textures + m.buffers + m.framebuffers + m.renderbuffers + m.uploads
          const tier = window.showcase.info().tier
          for (let f = a; f <= b; f++) {
            const before = sum(window.showcase.made())
            await window.showcase.renderFrame(f, tier)
            const { script, wait, ...parts } = window.showcase.cost()
            rows.push({ frame: f, scriptMs: script ?? 0, cardMs: wait ?? 0, made: sum(window.showcase.made()) - before, parts, jump: f === start })
          }
          return rows
        }, [from, Math.min(to, from + 24), start])),
      )
    }
  }
  const body = rows.filter((r) => !r.jump)
  const jumps = rows.filter((r) => r.jump)
  const scripts = body.map((r) => r.scriptMs)
  const dearest = body.reduce((p, r) => (r.scriptMs > p.scriptMs ? r : p), body[0])
  const parts: Record<string, number> = {}
  for (const r of body) for (const [k, v] of Object.entries(r.parts)) parts[k] = (parts[k] ?? 0) + v / body.length
  const top = Object.entries(parts).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, v]) => `${k} ${r1(v)}`).join(', ')
  console.log(`frames ${first} to ${last} · drawn in a row${every > burst ? `, ${starts.length} runs of ${burst} frames, one every ${every}` : ''}: ${body.length} frames counted`)
  console.log(`  script a frame: mean ${r1(mean(scripts))} ms, 99th ${r1(p99(scripts))}, longest ${r1(dearest.scriptMs)} at frame ${dearest.frame} · over ${FRAME_MS.toFixed(1)} ms: ${scripts.filter((s) => s > FRAME_MS).length} of ${scripts.length} frames`)
  console.log(`  the first frame of each run, after a jump, not counted: script ${jumps.map((r) => `${r.frame}: ${r1(r.scriptMs)}`).join(', ')} ms`)
  console.log(`  wait for the picture: mean ${r1(mean(body.map((r) => r.cardMs)))} ms · made ${rows.reduce((p, r) => p + r.made, 0)}`)
  console.log(`  largest shares, mean ms a frame: ${top}`)
  out[`${first}-${last}`] = { live, row: { rows, scriptMs: { mean: r1(mean(scripts)), p99: r1(p99(scripts)), longest: r1(dearest.scriptMs), longestAtFrame: dearest.frame }, parts } }
}

const madeAtEnd = await page.evaluate(() => window.showcase.made())
out.madeAfterReady = things(madeAtEnd) - things(madeAtReady)
out.errors = errors
console.log(`\nmade after loading: ${things(madeAtEnd) - things(madeAtReady)} · console errors: ${errors.length}`)
for (const e of errors.slice(0, 5)) console.log(`  ${e}`)
const file = at('out', 'work', 'player', `meter-${name}.json`)
fs.mkdirSync(at('out', 'work', 'player'), { recursive: true })
fs.writeFileSync(file, JSON.stringify(out, null, 1))
console.log(`written ${file}`)
await browser.close()
await served.close()
