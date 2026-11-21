import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import type { ExportProgress, ExportResult } from '../src/capture/export.ts'
import type { ShowcaseInfo } from '../src/capture/showcase.ts'
import { config, frameCount } from '../src/config.ts'
import { isAssetSet } from '../src/core/tiers.ts'
import { clampFrame, cuts, keys, segments } from '../src/director/timeline.ts'
import { flag, parseArgs, str } from './lib/args.ts'
import { launch, machine, openPage } from './lib/browser.ts'
import type { Hashes } from './lib/hashes.ts'
import { at, ROOT, WORK } from './lib/paths.ts'
import { compare, rawOf, type Raw } from './lib/pixels.ts'
import { writeRecord } from './lib/record.ts'
import { ensureBuild, ensureDisk, openSession, takeRenderSlot } from './lib/render.ts'
import { serve } from './lib/server.ts'

const SAME_PICTURE_DB = 30
const TILES = 8
const SAMPLE_EVERY = 10
const MOST_FRAMES_BETWEEN_SAMPLES = 30
const STALL_SECONDS = 240
const FALLBACKS = ['vp9', 'av1']
const PROBE_NAMES: Record<string, string> = { h264: 'h264', vp9: 'vp9', av1: 'av1' }

const args = parseArgs()
const memory = flag(args, 'memory')
const assets = str(args, 'assets', 'full')
if (!isAssetSet(assets)) throw new Error(`unknown asset set "${assets}"`)
const forced = typeof args.codec === 'string' ? args.codec : null
const preview = config.formats.preview
const tier = 'draft'
const fps = config.film.fps
const dir = path.join(WORK, 'export')
const rel = (file: string) => path.relative(ROOT, file).split(path.sep).join('/')

interface Sample { frame: number; heapMb: number; textureMb: number }
interface PageSample { done: number; heapMb: number | null; textureMb: number }
interface Run { result: ExportResult; saved: boolean; info: ShowcaseInfo; browser: string; samples: Sample[]; heapSource: string }

declare global {
  interface Window { exportSamples?: PageSample[] }
}

function sampler(every: number): void {
  const samples: PageSample[] = []
  let held: ExportProgress | undefined
  let last = -every
  Object.defineProperty(window, 'exportProgress', {
    configurable: true,
    get: () => held,
    set: (value: ExportProgress | undefined) => {
      held = value
      if (!value || (value.done !== value.total && value.done - last < every)) return
      last = value.done
      const heap = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory
      samples.push({ done: value.done, heapMb: heap ? heap.usedJSHeapSize / 1048576 : null, textureMb: value.textureMb })
    },
  })
  window.exportSamples = samples
}

async function runExport(first: number, last: number, target: string, family: string | null): Promise<Run> {
  const served = await serve(at('dist'))
  const browser = await launch(memory ? ['--enable-precise-memory-info'] : [])
  try {
    const page = await openPage(browser, 1280, 800)
    const messages: string[] = []
    let crashed = false
    let download: Promise<void> | null = null
    page.on('pageerror', (e) => messages.push(String(e)))
    page.on('crash', () => {
      crashed = true
    })
    page.on('download', (d) => {
      download = d.saveAs(target)
    })
    if (memory) await page.addInitScript(sampler, SAMPLE_EVERY)
    const query = new URLSearchParams({ mode: 'export', format: preview.id, tier, assets, first: String(first), last: String(last), auto: '1' })
    if (family) query.set('codec', family)
    await page.goto(`${served.url}/index.html?${query.toString()}`, { waitUntil: 'load' })
    await page.waitForFunction(() => typeof window.showcase === 'object', undefined, { timeout: 60000 })
    try {
      await page.evaluate(() => window.showcase.ready)
    } catch (error) {
      throw new Error(`the page did not become ready: ${String(error)} ${messages.join(' ')}`)
    }
    const cdp = memory ? await page.context().newCDPSession(page) : null
    if (cdp) await cdp.send('Performance.enable')
    const cdpSamples: Sample[] = []
    let seen = -1
    let sampledAt = -SAMPLE_EVERY
    let moved = Date.now()
    let result: ExportResult | null = null
    while (!result) {
      if (crashed) throw new Error('the page crashed during the export')
      const now = await page.evaluate(() => ({ result: window.exportResult ?? null, progress: window.exportProgress ?? null }))
      const done = now.progress ? now.progress.done : -1
      if (done !== seen) {
        seen = done
        moved = Date.now()
        if (now.progress && done % 30 === 0) console.log(`${done} of ${now.progress.total} frames done`)
      }
      if (cdp && now.progress && (done - sampledAt >= SAMPLE_EVERY || now.result)) {
        sampledAt = done
        const { metrics } = await cdp.send('Performance.getMetrics')
        const heap = metrics.find((m) => m.name === 'JSHeapUsedSize')
        cdpSamples.push({ frame: first + Math.max(0, done - 1), heapMb: heap ? heap.value / 1048576 : 0, textureMb: now.progress.textureMb })
      }
      result = now.result
      if (!result) {
        if ((Date.now() - moved) / 1000 > STALL_SECONDS) throw new Error(`the export made no progress for ${STALL_SECONDS} s at ${Math.max(0, seen)} frames done. ${messages.join(' ')}`)
        await page.waitForTimeout(250)
      }
    }
    if (result.ok) {
      const until = Date.now() + 30000
      while (!download && Date.now() < until) await page.waitForTimeout(100)
      if (download) await (download as Promise<void>)
    }
    const info = await page.evaluate(() => window.showcase.info())
    const inPage = memory ? await page.evaluate(() => window.exportSamples ?? []) : []
    const precise = inPage.length > 0 && inPage.every((s) => s.heapMb !== null)
    const samples = precise ? inPage.map((s) => ({ frame: first + Math.max(0, s.done - 1), heapMb: s.heapMb as number, textureMb: s.textureMb })) : cdpSamples
    return { result, saved: download !== null && fs.existsSync(target), info, browser: browser.version(), samples, heapSource: precise ? 'performance.memory' : 'Performance.getMetrics JSHeapUsedSize' }
  } finally {
    await browser.close().catch(() => undefined)
    await served.close().catch(() => undefined)
  }
}

interface Probe { codec: string; profile: string; width: number; height: number; rate: string; frames: number; pixelFormat: string; streams: number; keyGap: number; firstIsKey: boolean }

function probe(file: string): Probe {
  const run = (list: string[]) => execFileSync('ffprobe', ['-v', 'error', ...list, file], { encoding: 'utf8' })
  const j = JSON.parse(run(['-select_streams', 'v:0', '-count_frames', '-show_entries', 'stream=codec_name,profile,width,height,avg_frame_rate,nb_read_frames,pix_fmt', '-of', 'json'])) as { streams: { codec_name: string; profile?: string; width: number; height: number; avg_frame_rate: string; nb_read_frames: string; pix_fmt: string }[] }
  const s = j.streams[0]
  if (!s) throw new Error('ffprobe found no video stream in the file')
  const all = JSON.parse(run(['-show_entries', 'stream=codec_type', '-of', 'json'])) as { streams: unknown[] }
  const flags = run(['-select_streams', 'v:0', '-show_entries', 'packet=flags', '-of', 'csv=p=0']).split('\n').map((l) => l.trim()).filter((l) => l.length > 0)
  let keyGap = 0
  let since = 0
  for (const f of flags) {
    since = f.includes('K') ? 0 : since + 1
    if (since > keyGap) keyGap = since
  }
  return { codec: s.codec_name, profile: s.profile ?? '', width: s.width, height: s.height, rate: s.avg_frame_rate, frames: Number(s.nb_read_frames), pixelFormat: s.pix_fmt, streams: all.streams.length, keyGap: keyGap + 1, firstIsKey: flags.length > 0 && flags[0].includes('K') }
}

function probeLine(p: Probe): string {
  return `ffprobe: ${p.codec}${p.profile ? ` (${p.profile})` : ''}, ${p.width} x ${p.height}, ${p.rate} fps, ${p.frames} frames, ${p.pixelFormat}, ${p.streams} stream${p.streams === 1 ? '' : 's'}, a keyframe at least every ${p.keyGap} frames`
}

function probeProblems(p: Probe, family: string, total: number): string[] {
  const problems: string[] = []
  const [n, d] = p.rate.split('/').map(Number)
  if (p.codec !== (PROBE_NAMES[family] ?? family)) problems.push(`the codec is ${p.codec}, not ${family}`)
  if (p.width !== preview.width || p.height !== preview.height) problems.push(`the size is ${p.width} x ${p.height}, not ${preview.width} x ${preview.height}`)
  if (!(d > 0) || n !== fps * d) problems.push(`the frame rate is ${p.rate}, not ${fps}`)
  if (p.frames !== total) problems.push(`it holds ${p.frames} frames, not ${total}`)
  if (p.streams !== 1) problems.push(`it holds ${p.streams} streams, not one video stream`)
  if (!p.firstIsKey || p.keyGap > fps) problems.push('a second of film passes without a keyframe')
  return problems
}

function decode(file: string, index: number, out: string): void {
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', file, '-vf', `select=eq(n\\,${index})`, '-frames:v', '1', '-pix_fmt', 'rgb24', out])
}

// The frame rule decides. The worst tile is kept in the record, so a small overlay that the whole-frame number hides can still be seen.
function worstTile(a: Raw, b: Raw): number {
  let worst = Infinity
  const w = Math.ceil(a.width / TILES)
  const h = Math.ceil(a.height / TILES)
  for (let ty = 0; ty < a.height; ty += h) {
    for (let tx = 0; tx < a.width; tx += w) {
      let sum = 0
      let n = 0
      for (let y = ty; y < Math.min(a.height, ty + h); y++) {
        for (let x = tx; x < Math.min(a.width, tx + w); x++) {
          const i = (y * a.width + x) * a.channels
          for (let k = 0; k < 3; k++) {
            const d = a.data[i + k] - b.data[i + k]
            sum += d * d
            n++
          }
        }
      }
      const psnr = sum === 0 ? Infinity : 10 * Math.log10((255 * 255 * n) / sum)
      if (psnr < worst) worst = psnr
    }
  }
  return worst
}

function range(center: number, total: number): { first: number; last: number } {
  const first = Math.min(frameCount - total, Math.max(0, clampFrame(center - Math.floor(total / 2))))
  return { first, last: first + total - 1 }
}

function listed(first: number, last: number): number[] {
  return Array.from({ length: last - first + 1 }, (_, i) => first + i)
}

function unitsOf(first: number, last: number, hashes: Hashes): Record<string, string> {
  const out: Record<string, string> = {}
  for (const s of segments) if (s.firstFrame <= last && s.lastFrame >= first) out[s.id] = hashes.unitHashes[s.id]
  return out
}

async function exportWith(first: number, last: number, target: string): Promise<{ run: Run; family: string }> {
  const families = forced ? [forced] : [config.export.videoCodec, ...FALLBACKS.filter((f) => f !== config.export.videoCodec)]
  let found: { run: Run; family: string } | null = null
  for (const family of families) {
    fs.rmSync(target, { force: true })
    const run = await runExport(first, last, target, family === config.export.videoCodec ? null : family)
    found = { run, family }
    if (run.result.ok || run.result.codec !== '') break
    console.log(`this browser cannot encode ${family}: ${run.result.error ?? 'no reason given'}`)
  }
  if (!found) throw new Error('no codec was tried')
  return found
}

async function proof(hashes: Hashes): Promise<boolean> {
  const total = Math.max(1, Math.round(config.export.proofSeconds * fps))
  const hero = keys.find((k) => k.id === 'bloom-hero')
  if (!hero) throw new Error('the config has no bloom-hero key')
  const { first, last } = range(hero.frame, total)
  const file = path.join(dir, config.export.files.preview)
  const out = path.join(dir, 'proof.json')
  const base = { engineHash: hashes.engineHash, unitHashes: hashes.unitHashes, file: rel(file) }
  const write = (ok: boolean, interfaceFree: boolean | null, codec: string, frames: number, detail: string): boolean => {
    fs.writeFileSync(out, JSON.stringify({ ok, ...base, detail, interfaceFree, frames, codec, at: new Date().toISOString() }, null, 2) + '\n')
    console.log(`${ok ? 'export proof: pass' : 'export proof: FAIL'} · ${detail}`)
    return ok
  }
  fs.rmSync(out, { force: true })
  let found: { run: Run; family: string }
  try {
    found = await exportWith(first, last, file)
  } catch (error) {
    return write(false, null, '', 0, `The export proof could not run: ${error instanceof Error ? error.message : String(error)}`)
  }
  const { run, family } = found
  const unproven = family !== config.export.videoCodec
  const note = unproven ? `; export.videoCodec (${config.export.videoCodec}) is unproven here${forced ? ' because another codec was asked for' : ' because this browser cannot encode it'}, and the pipeline was proven with ${family} instead` : ''
  if (!run.result.ok || !run.saved) {
    return write(false, null, run.result.codec, run.result.frames, `Export did not produce a file for frames ${first} to ${last}: ${run.result.error ?? 'the download never arrived'}`)
  }
  if (run.info.engineHash !== hashes.engineHash) return write(false, null, run.result.codec, run.result.frames, 'The page was not built from the current source, so the proof does not count.')

  const p = probe(file)
  console.log(probeLine(p))
  const problems = probeProblems(p, family, total)
  if (run.result.fileName !== config.export.files.preview) problems.push(`the page named the file ${run.result.fileName}`)

  const session = await openSession({ format: preview.id, assets, slot: false })
  const checks: { frame: number; psnr: number; worstTilePsnr: number }[] = []
  try {
    for (const index of [0, Math.floor(total / 2), total - 1]) {
      const frame = first + index
      const decoded = path.join(dir, `proof-f${String(frame).padStart(4, '0')}-export.png`)
      const still = path.join(dir, `proof-f${String(frame).padStart(4, '0')}-capture.png`)
      decode(file, index, decoded)
      fs.writeFileSync(still, (await session.render(frame, tier)).png)
      const a = await rawOf(decoded)
      const b = await rawOf(still)
      const d = compare(a, b)
      const tile = d.psnr > 0 ? worstTile(a, b) : 0
      checks.push({ frame, psnr: d.psnr, worstTilePsnr: tile })
      console.log(`frame ${frame} · export against capture · ${d.psnr.toFixed(1)} dB · worst of ${TILES * TILES} tiles ${tile.toFixed(1)} dB`)
    }
  } finally {
    await session.close()
  }
  const interfaceFree = checks.every((c) => c.psnr >= SAME_PICTURE_DB)
  if (!interfaceFree) problems.push(`frames ${checks.filter((c) => c.psnr < SAME_PICTURE_DB).map((c) => c.frame).join(', ')} differ from their capture stills by more than ${SAME_PICTURE_DB} dB allows`)
  const ok = problems.length === 0
  writeRecord(file, {
    kind: 'export-proof',
    engineHash: run.info.engineHash,
    unitHashes: unitsOf(first, last, { engineHash: run.info.engineHash, unitHashes: run.info.unitHashes }),
    format: preview.id,
    tier,
    assets: run.info.assets,
    diag: 'beauty',
    browser: run.browser,
    machine: machine(),
    frames: listed(first, last),
    samples: config.tiers[tier].samplesPerFrame,
    seconds: run.result.seconds,
    standIns: run.info.standIns,
    note: ok ? 'export proof passed' : problems.join('; '),
    at: new Date().toISOString(),
    codec: run.result.codec,
    ffprobe: p,
    psnr: checks,
  })
  const picture = checks.map((c) => c.psnr.toFixed(1)).join(', ')
  const made = `Export made ${config.export.files.preview} for frames ${first} to ${last}: ${p.frames} frames of ${p.codec}${p.profile ? ` ${p.profile}` : ''} at ${p.width} x ${p.height} and ${fps} frames a second in ${run.result.seconds.toFixed(1)} s`
  const detail = ok
    ? `${made}, and its first, middle and last frames match capture stills at ${picture} dB, so they hold no interface element${note}.`
    : `${made}, but ${problems.join('; ')}${note}.`
  return write(ok, interfaceFree, p.codec, p.frames, detail)
}

async function memoryTest(hashes: Hashes): Promise<boolean> {
  const cut = cuts[0]
  if (!cut) throw new Error('the film has no cut')
  const side = Math.round(config.export.memoryTestSeconds * fps)
  const first = clampFrame(cut.frame - side)
  const last = clampFrame(cut.frame + side - 1)
  const total = last - first + 1
  const file = path.join(dir, 'memory-test.mp4')
  const out = path.join(dir, 'memory.json')
  fs.rmSync(out, { force: true })
  const write = (ok: boolean, limitMb: number, samples: Sample[], detail: string, run: Run | null): boolean => {
    const maxTextureMb = samples.reduce((m, s) => Math.max(m, s.textureMb), 0)
    fs.writeFileSync(out, JSON.stringify({ ok, engineHash: hashes.engineHash, unitHashes: hashes.unitHashes, limitMb, maxTextureMb, samples, detail }, null, 2) + '\n')
    if (run) {
      writeRecord(out, {
        kind: 'export-memory',
        engineHash: run.info.engineHash,
        unitHashes: unitsOf(first, last, { engineHash: run.info.engineHash, unitHashes: run.info.unitHashes }),
        format: preview.id,
        tier,
        assets: run.info.assets,
        diag: 'beauty',
        browser: run.browser,
        machine: machine(),
        frames: listed(first, last),
        samples: config.tiers[tier].samplesPerFrame,
        seconds: run.result.seconds,
        standIns: run.info.standIns,
        note: detail,
        at: new Date().toISOString(),
        heapSource: run.heapSource,
      })
    }
    console.log(`${ok ? 'export memory test: pass' : 'export memory test: FAIL'} · ${detail}`)
    return ok
  }
  let run: Run
  try {
    run = (await exportWith(first, last, file)).run
  } catch (error) {
    return write(false, config.assetSets[assets as keyof typeof config.assetSets].maxTextureMb, [], `The memory test could not run: ${error instanceof Error ? error.message : String(error)}`, null)
  }
  const set = isAssetSet(run.info.assets) ? run.info.assets : (assets as keyof typeof config.assetSets)
  const limitMb = config.assetSets[set].maxTextureMb
  const samples = run.samples
  const problems: string[] = []
  if (!run.result.ok) problems.push(`the export stopped: ${run.result.error ?? 'no reason given'}`)
  if (samples.length === 0) problems.push('no memory sample was taken')
  let gap = samples.length ? samples[0].frame - first : 0
  for (let i = 1; i < samples.length; i++) gap = Math.max(gap, samples[i].frame - samples[i - 1].frame)
  if (gap > MOST_FRAMES_BETWEEN_SAMPLES) problems.push(`${gap} frames passed between two samples`)
  const maxTextureMb = samples.reduce((m, s) => Math.max(m, s.textureMb), 0)
  const heap = samples.map((s) => s.heapMb)
  if (maxTextureMb > limitMb) problems.push(`the textures reached ${maxTextureMb.toFixed(0)} MB, over the ${limitMb} MB the ${set} set allows`)
  if (run.result.ok && run.saved) {
    const p = probe(file)
    console.log(probeLine(p))
    if (p.frames !== total) problems.push(`the file holds ${p.frames} frames, not ${total}`)
    fs.rmSync(file, { force: true })
  }
  const ok = problems.length === 0
  const seen = samples.length ? `${samples.length} samples from frame ${samples[0].frame} to ${samples[samples.length - 1].frame}, across the cut at frame ${cut.frame}` : 'no samples'
  const detail = ok
    ? `Export ran ${total} frames at ${preview.width} x ${preview.height} and the ${tier} tier with the ${set} set: ${seen}, textures at most ${maxTextureMb.toFixed(1)} MB of the ${limitMb} MB allowed, page heap between ${Math.min(...heap).toFixed(1)} and ${Math.max(...heap).toFixed(1)} MB (${run.heapSource}).`
    : `The memory test failed over ${seen}: ${problems.join('; ')}.`
  return write(ok, limitMb, samples, detail, run)
}

const hashes = ensureBuild()
ensureDisk()
fs.mkdirSync(dir, { recursive: true })
const release = await takeRenderSlot(memory ? 'export memory test' : 'export proof')
let ok = false
try {
  ok = memory ? await memoryTest(hashes) : await proof(hashes)
} finally {
  release()
}
process.exit(ok ? 0 : 1)
