import fs from 'node:fs'
import path from 'node:path'
import { at } from '../../lib/paths.ts'

const SRC = at('src')
const WORDS = /Math\.random|Date\.now|performance\.now|new Date\(/

export interface Hit { file: string; line: number; code: string; word: string; drawPath: boolean; verdict: string }

function walk(dir: string, out: string[]): void {
  for (const name of fs.readdirSync(dir).sort()) {
    const p = path.join(dir, name)
    if (fs.statSync(p).isDirectory()) walk(p, out)
    else if (/\.(ts|glsl|js)$/.test(name)) out.push(p)
  }
}

function resolve(from: string, spec: string): string | null {
  if (!spec.startsWith('.')) return null
  const base = path.resolve(path.dirname(from), spec.split('?')[0])
  for (const p of [base, `${base}.ts`, path.join(base, 'index.ts')]) if (fs.existsSync(p) && fs.statSync(p).isFile()) return p
  return null
}

function globbed(from: string, pattern: string, all: string[]): string[] {
  const absolute = path.resolve(path.dirname(from), pattern)
  const re = new RegExp('^' + absolute.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*\*\//g, '(?:.*/)?').replace(/\*/g, '[^/]*') + '$')
  return all.filter((f) => re.test(f))
}

// Every file the film's draw can run: what src/director/film.ts imports, and what those import, and the skies and parts it finds by name.
export function drawPath(): Set<string> {
  const all: string[] = []
  walk(SRC, all)
  const seen = new Set<string>()
  const queue = [path.join(SRC, 'director', 'film.ts')]
  while (queue.length) {
    const file = queue.pop() as string
    if (seen.has(file)) continue
    seen.add(file)
    const text = fs.readFileSync(file, 'utf8')
    for (const m of text.matchAll(/(?:import|export)\s+(type\s+)?[^'"`;]*?from\s+['"]([^'"]+)['"]/g)) {
      if (m[1]) continue
      const to = resolve(file, m[2])
      if (to) queue.push(to)
    }
    for (const m of text.matchAll(/import\s+['"]([^'"]+)['"]/g)) {
      const to = resolve(file, m[1])
      if (to) queue.push(to)
    }
    for (const m of text.matchAll(/import\.meta\.glob(?:<[^>]*>)?\(\s*['"]([^'"]+)['"]/g)) queue.push(...globbed(file, m[1], all))
  }
  return seen
}

interface Allowed { file: string; word: string; why: string }

// A clock or a throw of dice in a file the draw can run can change a pixel, unless a person has read it and said why it cannot.
export function searchSource(allowFile: string): Hit[] {
  const all: string[] = []
  walk(SRC, all)
  const path_ = drawPath()
  const allowed: Allowed[] = fs.existsSync(allowFile) ? (JSON.parse(fs.readFileSync(allowFile, 'utf8')) as { allowed: Allowed[] }).allowed : []
  const hits: Hit[] = []
  for (const file of all) {
    const rel = path.relative(at(), file).split(path.sep).join('/')
    const lines = fs.readFileSync(file, 'utf8').split('\n')
    for (let i = 0; i < lines.length; i++) {
      const code = lines[i].replace(/\/\/.*$/, '')
      const m = code.match(WORDS)
      if (!m) continue
      const inPath = path_.has(file)
      const pass = allowed.find((a) => a.file === rel && a.word === m[0])
      const verdict = !inPath ? 'cannot reach a pixel: no file the draw runs imports this one. It picks which frame to show or times the work' : pass ? `read by a person: ${pass.why}` : 'CAN REACH A PIXEL: the draw runs this file'
      hits.push({ file: rel, line: i + 1, code: lines[i].trim().slice(0, 110), word: m[0], drawPath: inPath && !pass, verdict })
    }
  }
  return hits
}
