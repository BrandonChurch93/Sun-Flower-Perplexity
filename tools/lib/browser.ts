import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { chromium, type Browser } from 'playwright-core'

export const GL_FLAGS = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']

export function chromePath(): string {
  if (process.env.CHROME_PATH && fs.existsSync(process.env.CHROME_PATH)) return process.env.CHROME_PATH
  const base = path.join(os.homedir(), '.cache', 'ms-playwright')
  const dirs = fs.existsSync(base) ? fs.readdirSync(base).filter((d) => /^chromium-\d+$/.test(d)).sort() : []
  for (const d of dirs.reverse()) {
    const p = path.join(base, d, 'chrome-linux64', 'chrome')
    if (fs.existsSync(p)) return p
    const q = path.join(base, d, 'chrome-linux', 'chrome')
    if (fs.existsSync(q)) return q
  }
  throw new Error('no Chrome for Testing found under ~/.cache/ms-playwright')
}

export async function launch(extra: string[] = []): Promise<Browser> {
  return chromium.launch({
    executablePath: chromePath(),
    headless: true,
    args: [
      ...GL_FLAGS,
      '--disable-background-timer-throttling',
      '--disable-renderer-backgrounding',
      '--disable-backgrounding-occluded-windows',
      '--force-color-profile=srgb',
      '--force-device-scale-factor=1',
      '--hide-scrollbars',
      '--mute-audio',
      '--js-flags=--max-old-space-size=4096',
      ...extra,
    ],
  })
}

export function machine(): { host: string; boot: string; cores: number; ramMb: number } {
  let boot = 'unknown-boot'
  try {
    boot = fs.readFileSync('/proc/sys/kernel/random/boot_id', 'utf8').trim()
  } catch {}
  return { host: os.hostname(), boot, cores: os.cpus().length, ramMb: Math.round(os.totalmem() / 1048576) }
}

export async function openPage(browser: Browser, width = 1280, height = 720) {
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 })
  await context.addInitScript('globalThis.__name = globalThis.__name || function (f) { return f }')
  return context.newPage()
}
