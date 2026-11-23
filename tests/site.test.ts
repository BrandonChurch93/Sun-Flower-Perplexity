import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { hasSound } from '../tools/site.ts'
import { at } from '../tools/lib/paths.ts'

const box = (handler: string) => Buffer.concat([Buffer.from([0, 0, 0, 33]), Buffer.from('hdlr', 'latin1'), Buffer.alloc(8), Buffer.from(handler, 'latin1'), Buffer.alloc(13)])

function file(parts: Buffer[]): string {
  const p = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'site-')), 'f.mp4')
  fs.writeFileSync(p, Buffer.concat(parts))
  return p
}

describe('the site', () => {
  it('finds a sound track only where there is one', () => {
    expect(hasSound(file([Buffer.alloc(100), box('vide'), Buffer.alloc(100)]))).toBe(false)
    expect(hasSound(file([Buffer.alloc(100), box('vide'), box('soun')]))).toBe(true)
    expect(hasSound(file([Buffer.alloc(0)]))).toBe(false)
  })

  it('finds a sound track that lies across two reads', () => {
    const chunk = 4 * 1024 * 1024
    for (const back of [2, 6, 10, 14, 18]) expect(hasSound(file([Buffer.alloc(chunk - back), box('soun'), Buffer.alloc(50)]))).toBe(true)
    expect(hasSound(file([Buffer.alloc(chunk - 6), box('vide'), Buffer.alloc(chunk), box('vide')]))).toBe(false)
  })

  it('has a landing page whose films, pictures and copy are in order', () => {
    const page = fs.readFileSync(at('web', 'index.html'), 'utf8')
    const named = [...page.matchAll(/["'](film\/[^"']+)["']/g)].map((m) => m[1])
    expect(named.length).toBeGreaterThan(2)
    for (const f of named) expect(fs.existsSync(at('web', f)), f).toBe(true)
    expect(page).toContain('autoplay muted playsinline')
    expect(page).toContain('href="live/index.html"')
    const copy = page.replace(/<style>[\s\S]*?<\/style>/g, '').replace(/<script>[\s\S]*?<\/script>/g, '').replace(/<[^>]+>/g, ' ')
    expect(copy).not.toMatch(/[\u2014\u2013!]/)
    const repo = JSON.parse(fs.readFileSync(at('config', 'showcase.json'), 'utf8')).repo as { maxFileMb: number }
    for (const f of fs.readdirSync(at('web', 'film'))) expect(fs.statSync(at('web', 'film', f)).size / 1048576, f).toBeLessThan(repo.maxFileMb)
  })
})
