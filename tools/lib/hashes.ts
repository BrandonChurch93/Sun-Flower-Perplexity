import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')

function walk(dir: string, out: string[]): void {
  if (!fs.existsSync(dir)) return
  const stat = fs.statSync(dir)
  if (stat.isFile()) {
    out.push(dir)
    return
  }
  for (const name of fs.readdirSync(dir).sort()) {
    if (name === '.DS_Store') continue
    walk(path.join(dir, name), out)
  }
}

function digest(files: string[]): string {
  const hash = crypto.createHash('sha256')
  for (const file of files.sort()) {
    hash.update(path.relative(ROOT, file).split(path.sep).join('/'))
    hash.update('\0')
    hash.update(fs.readFileSync(file))
    hash.update('\0')
  }
  return hash.digest('hex').slice(0, 16)
}

export interface Hashes { engineHash: string; unitHashes: Record<string, string> }

export function computeHashes(): Hashes {
  const config = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'showcase.json'), 'utf8')) as { segments: { id: string; world: string }[] }
  const engine: string[] = []
  walk(path.join(ROOT, 'src'), engine)
  const kept = engine.filter((f) => {
    const rel = path.relative(path.join(ROOT, 'src'), f).split(path.sep)
    return rel[0] !== 'worlds' && rel[0] !== 'units'
  })
  for (const part of ['plant', 'ground', 'third-party']) walk(path.join(ROOT, 'public', 'assets', part), kept)
  walk(path.join(ROOT, 'config', 'showcase.json'), kept)
  walk(path.join(ROOT, 'config', 'webgl-caps.json'), kept)
  walk(path.join(ROOT, 'package-lock.json'), kept)
  walk(path.join(ROOT, 'index.html'), kept)
  const unitHashes: Record<string, string> = {}
  for (const s of config.segments) {
    const files: string[] = []
    walk(path.join(ROOT, 'src', 'units', s.id), files)
    walk(path.join(ROOT, 'src', 'worlds', s.world), files)
    walk(path.join(ROOT, 'public', 'assets', 'worlds', s.world), files)
    unitHashes[s.id] = digest(files)
  }
  return { engineHash: digest(kept), unitHashes }
}

export function approvedFiles(): string[] {
  const dir = path.join(ROOT, 'references', 'approved')
  if (!fs.existsSync(dir)) return []
  return fs.readdirSync(dir).filter((n) => /\.(png|jpg|jpeg|webp)$/i.test(n)).map((n) => `references/approved/${n}`)
}

export function versions(): Record<string, string> {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')) as { version: string; dependencies: Record<string, string> }
  return { app: pkg.version, gsap: pkg.dependencies.gsap, muxer: pkg.dependencies['mp4-muxer'] }
}
