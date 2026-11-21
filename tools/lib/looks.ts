import fs from 'node:fs'
import path from 'node:path'
import { ROOT, WORK } from './paths.ts'

export interface Look { file: string; caption: string; at: string; by: string }

const DIR = path.join(WORK, 'looks')
const INDEX = path.join(DIR, 'index.jsonl')

export function addLook(file: string, caption: string, by = 'builder', copy = false): Look {
  const abs = path.resolve(file)
  if (!fs.existsSync(abs)) throw new Error(`no such picture: ${file}`)
  fs.mkdirSync(DIR, { recursive: true })
  let kept = abs
  const inside = abs.startsWith(ROOT + path.sep)
  if (copy || !inside) {
    const dir = path.join(DIR, 'files')
    fs.mkdirSync(dir, { recursive: true })
    kept = path.join(dir, `${Date.now()}-${path.basename(abs)}`)
    fs.copyFileSync(abs, kept)
  }
  const entry: Look = { file: path.relative(ROOT, kept), caption, at: new Date().toISOString(), by }
  fs.appendFileSync(INDEX, JSON.stringify(entry) + '\n')
  return entry
}

export function readLooks(): Look[] {
  if (!fs.existsSync(INDEX)) return []
  return fs
    .readFileSync(INDEX, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Look)
    .filter((look) => fs.existsSync(path.join(ROOT, look.file)))
}
