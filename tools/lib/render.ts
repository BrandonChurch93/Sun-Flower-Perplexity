import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import type { Browser, Page } from 'playwright-core'
import { config } from '../../src/config.ts'
import type { ShowcaseInfo } from '../../src/capture/showcase.ts'
import { launch, machine, openPage } from './browser.ts'
import { computeHashes, type Hashes } from './hashes.ts'
import { at, ROOT, WORK } from './paths.ts'
import { serve, type Served } from './server.ts'

const LOCK = path.join(WORK, 'render.lock')

export function freeDiskGb(): number {
  const s = fs.statfsSync(ROOT)
  return (s.bavail * s.bsize) / 1073741824
}

function oldestFirst(dir: string, out: { file: string; time: number }[]): void {
  if (!fs.existsSync(dir)) return
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name)
    const stat = fs.statSync(p)
    if (stat.isDirectory()) oldestFirst(p, out)
    else out.push({ file: p, time: stat.mtimeMs })
  }
}

export function ensureDisk(): void {
  const need = config.sandbox.minFreeDiskGb
  if (freeDiskGb() >= need) return
  const files: { file: string; time: number }[] = []
  for (const dir of ['frames', 'seq', 'stills', 'sheets', 'crops', 'film', 'stress', 'packs']) oldestFirst(path.join(WORK, dir), files)
  files.sort((a, b) => a.time - b.time)
  for (const f of files) {
    if (freeDiskGb() >= need) break
    fs.rmSync(f.file, { force: true })
  }
  if (freeDiskGb() < need) throw new Error(`only ${freeDiskGb().toFixed(1)} GB of disk is free, under sandbox.minFreeDiskGb, even after old output was deleted`)
}

function lockHolder(): number | null {
  if (!fs.existsSync(LOCK)) return null
  const pid = Number(fs.readFileSync(LOCK, 'utf8').trim().split(/\s+/)[0])
  if (!pid || pid === process.pid) return null
  try {
    process.kill(pid, 0)
    return pid
  } catch {
    return null
  }
}

export async function takeRenderSlot(what: string, waitSeconds = 900): Promise<() => void> {
  fs.mkdirSync(WORK, { recursive: true })
  const until = Date.now() + waitSeconds * 1000
  let told = false
  while (lockHolder() !== null) {
    if (Date.now() > until) throw new Error(`the render slot is still held by process ${lockHolder()} after ${waitSeconds} s`)
    if (!told) console.log(`waiting for the render slot (held by process ${lockHolder()})`)
    told = true
    await new Promise((r) => setTimeout(r, 2000))
  }
  fs.writeFileSync(LOCK, `${process.pid} ${what} ${new Date().toISOString()}\n`)
  let released = false
  const release = () => {
    if (released) return
    released = true
    try {
      if (fs.existsSync(LOCK) && Number(fs.readFileSync(LOCK, 'utf8').trim().split(/\s+/)[0]) === process.pid) fs.rmSync(LOCK)
    } catch {}
  }
  process.on('exit', release)
  process.on('SIGINT', () => {
    release()
    process.exit(130)
  })
  process.on('SIGTERM', () => {
    release()
    process.exit(143)
  })
  return release
}

export function ensureBuild(force = false): Hashes {
  const hashes = computeHashes()
  const file = at('dist', 'build.json')
  let built: Hashes | null = null
  if (fs.existsSync(file) && fs.existsSync(at('dist', 'index.html'))) {
    try {
      built = JSON.parse(fs.readFileSync(file, 'utf8')) as Hashes
    } catch {}
  }
  const same = built !== null && built.engineHash === hashes.engineHash && JSON.stringify(built.unitHashes) === JSON.stringify(hashes.unitHashes)
  if (!same || force) {
    console.log('building the app')
    execSync('npm run build', { cwd: ROOT, stdio: ['ignore', 'pipe', 'inherit'] })
  }
  return hashes
}

export interface SessionOptions { format?: string; assets?: string; diag?: string; mode?: string; extra?: string; what?: string; slot?: boolean }

export interface Session {
  page: Page
  browser: Browser
  url: string
  hashes: Hashes
  browserVersion: string
  startSeconds: number
  info(): Promise<ShowcaseInfo>
  render(frame: number, tier: string): Promise<{ png: Buffer; seconds: number }>
  time(frame: number, tier: string): Promise<number>
  close(): Promise<void>
}

let forbidden = false

export function forbidRenders(): void {
  forbidden = true
}

export async function openSession(options: SessionOptions = {}): Promise<Session> {
  if (forbidden) throw new Error(`a ${options.what ?? 'render'} was asked for, and --no-render forbids making it`)
  const hashes = ensureBuild()
  ensureDisk()
  const release = options.slot === false ? () => undefined : await takeRenderSlot(options.what ?? 'render')
  const started = Date.now()
  let served: Served | null = null
  let browser: Browser | null = null
  try {
    served = await serve(at('dist'))
    browser = await launch()
    const format = options.format ?? config.formats.master.id
    const page = await openPage(browser, 1280, 720)
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(String(e)))
    page.on('console', (m) => {
      if (m.type() === 'error' || m.type() === 'warning') errors.push(m.text())
    })
    const query = new URLSearchParams({ mode: options.mode ?? 'capture', format, assets: options.assets ?? 'full', diag: options.diag ?? 'beauty' })
    const url = `${served.url}/index.html?${query.toString()}${options.extra ? `&${options.extra}` : ''}`
    await page.goto(url, { waitUntil: 'load' })
    await page.waitForFunction(() => typeof window.showcase === 'object', undefined, { timeout: 60000 })
    try {
      await page.evaluate(() => window.showcase.ready)
    } catch (error) {
      throw new Error(`the page did not become ready: ${String(error)}\n${errors.join('\n')}`)
    }
    const startSeconds = (Date.now() - started) / 1000
    const theBrowser = browser
    const theServed = served
    const session: Session = {
      page,
      browser,
      url,
      hashes,
      browserVersion: browser.version(),
      startSeconds,
      info: () => page.evaluate(() => window.showcase.info()),
      async render(frame, tier) {
        const result = await page.evaluate(
          async ([f, t]) => {
            const t0 = performance.now()
            await window.showcase.renderFrame(f as number, t as string)
            const seconds = (performance.now() - t0) / 1000
            const canvas = document.getElementById('film') as HTMLCanvasElement
            return { url: canvas.toDataURL('image/png'), seconds }
          },
          [frame, tier] as const,
        )
        if (errors.length) {
          const text = errors.splice(0).join('\n')
          if (/error|invalid|failed/i.test(text)) console.log(`page messages:\n${text}`)
        }
        return { png: Buffer.from(result.url.slice(result.url.indexOf(',') + 1), 'base64'), seconds: result.seconds }
      },
      async time(frame, tier) {
        return page.evaluate(
          async ([f, t]) => {
            const t0 = performance.now()
            await window.showcase.renderFrame(f as number, t as string)
            return (performance.now() - t0) / 1000
          },
          [frame, tier] as const,
        )
      },
      async close() {
        await theBrowser.close().catch(() => undefined)
        await theServed.close().catch(() => undefined)
        release()
      },
    }
    return session
  } catch (error) {
    if (browser) await browser.close().catch(() => undefined)
    if (served) await served.close().catch(() => undefined)
    release()
    throw error
  }
}

export function recordBase(session: Session, info: ShowcaseInfo, kind: string, diag: string) {
  return {
    kind,
    engineHash: info.engineHash,
    unitHashes: info.unitHashes,
    format: info.format,
    tier: info.tier,
    assets: info.assets,
    diag,
    browser: session.browserVersion,
    machine: machine(),
    standIns: info.standIns,
    at: new Date().toISOString(),
  }
}
