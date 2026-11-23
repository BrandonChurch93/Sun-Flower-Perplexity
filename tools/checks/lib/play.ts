import fs from 'node:fs'
import path from 'node:path'
import type { Made } from '../../../src/v2/counter.ts'
import { OUT } from './report.ts'

// One drawing of the film, frame by frame, small: the pictures and what each frame made. `film` is the film as it is, `broken-<fault>` a film broken on purpose.
export interface Stamp { hash: string; width: number; height: number; sky: string; only: string; tier: string; quality: string }
export interface Line { frame: number; seconds: number; made: Made; session: string; nth: number }

export const playDir = (run: string): string => path.join(OUT, 'play', run)
export const framesDir = (run: string): string => path.join(playDir(run), 'frames')
export const frameFile = (run: string, frame: number): string => path.join(framesDir(run), `${String(frame).padStart(5, '0')}.png`)
export const runName = (broken: string | null): string => (broken ? `broken-${broken}` : 'film')

export function readStamp(run: string): Stamp | null {
  const file = path.join(playDir(run), 'stamp.json')
  return fs.existsSync(file) ? (JSON.parse(fs.readFileSync(file, 'utf8')) as Stamp) : null
}

// Every frame drawn so far, the newest drawing of each.
export function readLines(run: string): Map<number, Line> {
  const out = new Map<number, Line>()
  const dir = playDir(run)
  if (!fs.existsSync(dir)) return out
  for (const name of fs.readdirSync(dir).filter((n) => n.startsWith('log-') && n.endsWith('.jsonl')).sort()) {
    for (const text of fs.readFileSync(path.join(dir, name), 'utf8').split('\n')) {
      if (!text.trim()) continue
      try {
        const line = JSON.parse(text) as Line
        if (fs.existsSync(frameFile(run, line.frame))) out.set(line.frame, line)
      } catch {}
    }
  }
  return out
}
