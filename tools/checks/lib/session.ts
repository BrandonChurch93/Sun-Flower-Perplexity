import crypto from 'node:crypto'
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import type { Browser, Page } from 'playwright-core'
import { build } from 'vite'
import { launch, openPage } from '../../lib/browser.ts'
import { computeHashes } from '../../lib/hashes.ts'
import { recorder } from './recorder.ts'
import { tracer } from './tracer.ts'
import { at } from '../../lib/paths.ts'
import type { ChecksPage, Drawn, FloatDiff, Numbers, Sparks } from '../page/main.ts'
import type { Made } from '../../../src/v2/counter.ts'
import { OUT } from './report.ts'

const PAGE = at('tools', 'checks', 'page')
const DIST = path.join(OUT, 'page')
// The same page built with its names kept and a map back to the sources, for `made --trace`: a stack in it names the file that made a thing.
export const TRACED = path.join(OUT, 'page-traced')

declare global {
  interface Window { checks: ChecksPage }
}

function pageHash(): string {
  const hash = crypto.createHash('sha256')
  hash.update(computeHashes().engineHash)
  for (const name of fs.readdirSync(PAGE).sort()) hash.update(fs.readFileSync(path.join(PAGE, name)))
  return hash.digest('hex').slice(0, 16)
}

// Builds the checks' page when the film or the page has changed. Returns the hash of what was built.
export async function ensurePage(traced = false): Promise<string> {
  const hash = pageHash()
  const dist = traced ? TRACED : DIST
  const stamp = path.join(dist, 'built.txt')
  if (fs.existsSync(stamp) && fs.readFileSync(stamp, 'utf8').trim() === hash) return hash
  const lock = path.join(OUT, traced ? 'page-traced.lock' : 'page.lock')
  fs.mkdirSync(OUT, { recursive: true })
  while (fs.existsSync(lock) && Date.now() - fs.statSync(lock).mtimeMs < 120000) await new Promise((r) => setTimeout(r, 500))
  if (fs.existsSync(stamp) && fs.readFileSync(stamp, 'utf8').trim() === hash) return hash
  fs.writeFileSync(lock, String(process.pid))
  try {
    console.log('building the checks page')
    await build({ configFile: false, root: PAGE, base: './', publicDir: false, logLevel: 'error', build: { outDir: dist, emptyOutDir: true, target: 'es2022', sourcemap: traced, minify: !traced, chunkSizeWarningLimit: 4000 } })
    fs.writeFileSync(stamp, hash + '\n')
  } finally {
    fs.rmSync(lock, { force: true })
  }
  return hash
}

const TYPES: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.avif': 'image/avif', '.ktx2': 'image/ktx2', '.bin': 'application/octet-stream', '.wasm': 'application/wasm' }

// The page is served from its own build, and the film's assets from public/ where they already lie.
function serve(traced: boolean): Promise<{ url: string; close: () => Promise<void> }> {
  const roots = [traced ? TRACED : DIST, at('public')]
  const server = http.createServer((req, res) => {
    const rel = decodeURIComponent(new URL(req.url ?? '/', 'http://localhost').pathname)
    for (const root of roots) {
      const file = path.join(root, rel.endsWith('/') ? rel + 'index.html' : rel)
      if (file.startsWith(root) && fs.existsSync(file) && fs.statSync(file).isFile()) {
        res.writeHead(200, { 'Content-Type': TYPES[path.extname(file).toLowerCase()] ?? 'application/octet-stream', 'Content-Length': fs.statSync(file).size, 'Cache-Control': 'no-store' })
        fs.createReadStream(file).pipe(res)
        return
      }
    }
    res.writeHead(404).end('not found')
  })
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      const port = typeof address === 'object' && address ? address.port : 0
      resolve({ url: `http://localhost:${port}`, close: () => new Promise<void>((done) => server.close(() => done())) })
    })
  })
}

// `plain` draws a frame of one sample at one place a pixel (the film's `smooth: false`): for the checks that read script time and megabytes, which need the film's work and not its recorded edges. The checks that prove what is recorded leave it out.
export interface SessionOptions { width?: number; height?: number; sky?: string; only?: string; view?: string; quality?: string; record?: boolean; trace?: boolean; plain?: boolean }

export interface Session {
  page: Page
  hash: string
  startSeconds: number
  info: { sky: string; width: number; height: number; textureMb: number; parts: string[] }
  warm(tier: string): Promise<void>
  made(): Promise<Made>
  draw(frame: number, tier: string, png?: boolean): Promise<{ frame: number; seconds: number; made: Made; png: Buffer | null }>
  setView(name: string): Promise<void>
  still(on: boolean): Promise<void>
  keep(name: string): Promise<void>
  differ(a: string, b: string): Promise<FloatDiff>
  fault(kind: string, a?: number, b?: number): Promise<void>
  covered(): Promise<string>
  cost(): Promise<Record<string, number>>
  lens(): Promise<{ held: number; signs: { owner: string; numbers: number[] }[] }>
  numbers(limit: number): Promise<Numbers>
  watch(limit: number): Promise<void>
  plain(on: boolean): Promise<void>
  note(): Promise<void>
  sparks(times: number, reach: number): Promise<Sparks>
  only(names: string[]): Promise<void>
  close(): Promise<void>
}

export async function openSession(options: SessionOptions = {}): Promise<Session> {
  const hash = await ensurePage(options.trace === true)
  const started = Date.now()
  const served = await serve(options.trace === true)
  let browser: Browser | null = null
  try {
    browser = await launch()
    const page = await openPage(browser, 1280, 720)
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(String(e)))
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text())
    })
    if (options.record) await page.addInitScript(recorder)
    if (options.trace) await page.addInitScript(tracer)
    const query = new URLSearchParams({ w: String(options.width ?? 320), h: String(options.height ?? 180) })
    if (options.sky) query.set('sky', options.sky)
    if (options.only) query.set('only', options.only)
    if (options.view) query.set('view', options.view)
    if (options.quality) query.set('quality', options.quality)
    if (options.plain) query.set('plain', '1')
    await page.goto(`${served.url}/index.html?${query.toString()}`, { waitUntil: 'load' })
    await page.waitForFunction(() => typeof window.checks === 'object', undefined, { timeout: 60000 })
    try {
      await page.evaluate(() => window.checks.ready)
    } catch (error) {
      throw new Error(`the checks page did not become ready: ${String(error)}\n${errors.join('\n')}`)
    }
    const info = await page.evaluate(() => window.checks.info())
    if (options.sky && info.sky !== options.sky) throw new Error(`there is no sky in src/${options.sky}: the page drew "${info.sky}"`)
    const theBrowser = browser
    return {
      page,
      hash,
      startSeconds: (Date.now() - started) / 1000,
      info,
      warm: (tier) => page.evaluate((t) => window.checks.warm(t), tier),
      made: () => page.evaluate(() => window.checks.made()),
      async draw(frame, tier, png = true) {
        const d: Drawn = await page.evaluate(([f, t, p]) => window.checks.draw(f as number, t as string, p as boolean), [frame, tier, png] as const)
        if (errors.length) {
          const text = errors.splice(0).join('\n')
          if (/error|invalid|failed/i.test(text)) console.log(`page messages:\n${text}`)
        }
        return { frame: d.frame, seconds: d.seconds, made: d.made, png: d.png ? Buffer.from(d.png.slice(d.png.indexOf(',') + 1), 'base64') : null }
      },
      setView: (name) => page.evaluate((n) => window.checks.setView(n), name),
      still: (on) => page.evaluate((o) => window.checks.still(o), on),
      keep: (name) => page.evaluate((n) => window.checks.keep(n), name),
      differ: (a, b) => page.evaluate(([x, y]) => window.checks.differ(x, y), [a, b] as const),
      covered: () => page.evaluate(() => window.checks.covered()),
      cost: () => page.evaluate(() => window.checks.cost()),
      lens: () => page.evaluate(() => window.checks.lens()),
      numbers: (limit) => page.evaluate((l) => window.checks.numbers(l), limit),
      watch: (limit) => page.evaluate((l) => window.checks.watch(l), limit),
      plain: (on) => page.evaluate((o) => window.checks.plain(o), on),
      note: () => page.evaluate(() => window.checks.note()),
      sparks: (times, reach) => page.evaluate(([t, r]) => window.checks.sparks(t, r), [times, reach] as const),
      only: (names) => page.evaluate((n) => window.checks.only(n), names),
      fault: (kind, a = 0, b = 0) => page.evaluate(([k, x, y]) => window.checks.fault(k as string, x as number, y as number), [kind, a, b] as const),
      async close() {
        await theBrowser.close().catch(() => undefined)
        await served.close().catch(() => undefined)
      },
    }
  } catch (error) {
    if (browser) await browser.close().catch(() => undefined)
    await served.close().catch(() => undefined)
    throw error
  }
}
