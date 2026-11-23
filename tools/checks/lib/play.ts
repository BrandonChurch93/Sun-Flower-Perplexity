import fs from 'node:fs'
import path from 'node:path'
import { engineHash } from './report.ts'
import type { Made } from '../../../src/v2/counter.ts'
import { OUT } from './report.ts'

// One drawing of the film, frame by frame, small: the pictures and what each frame made. `film` is the film as it is, `broken-<fault>` a film broken on purpose.
export interface Stamp { hash: string; width: number; height: number; sky: string; only: string; tier: string; quality: string }
// `numbers` is what the frame holds before the lens: pixels without a number, pixels over the limit, the largest number in order, and where the bad ones are (x, then y from the top). A frame drawn before `play` read it has none.
export interface Held { none: number; over: number; most: number; where: number[]; sparks?: number; ratio?: number }
export interface Line { frame: number; seconds: number; made: Made; session: string; nth: number; numbers?: Held }
// A number above this in any sample of a frame, before the lens, is counted as too bright: a sample holds nothing above 65504, and a graphics card that cannot keep a place without a number keeps it as that top. The lens spreads either into a disc.
// The page reads each sample (`watch`), since in the sum of 48 one lost place is a forty-eighth of the top, and a sample drawn at four places a pixel is read against a quarter of the limit.
export const MOST = 60000

export const playDir = (run: string): string => path.join(OUT, 'play', run)
export const framesDir = (run: string): string => path.join(playDir(run), 'frames')
export const frameFile = (run: string, frame: number): string => path.join(framesDir(run), `${String(frame).padStart(5, '0')}.png`)
export const runName = (broken: string | null): string => (broken ? `broken-${broken}` : 'film')

export function readStamp(run: string): Stamp | null {
  const file = path.join(playDir(run), 'stamp.json')
  return fs.existsSync(file) ? (JSON.parse(fs.readFileSync(file, 'utf8')) as Stamp) : null
}

// Says so when the frames were drawn from a film that is not the one in the working tree: a check that reads them has then not judged today's film.
export function olderFilm(run: string): string | null {
  const stamp = readStamp(run)
  if (!stamp || run !== 'film' || stamp.hash === engineHash()) return null
  return `the frames were drawn from another state of the film (${stamp.hash}, sky ${stamp.sky}) than the one here (${engineHash()}): draw them again with "npm run checks -- play" before trusting this`
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

// Lets another check that draws the film in a row keep its frames where `play` keeps them, so that one drawing serves both. Frames of another film or size are thrown away first, as `play` does.
export function keeper(run: string, stamp: Stamp): (frame: number, seconds: number, made: Made, png: Buffer, numbers?: Held) => void {
  const dir = playDir(run)
  const old = readStamp(run)
  if (old && JSON.stringify(old) !== JSON.stringify(stamp)) fs.rmSync(dir, { recursive: true, force: true })
  fs.mkdirSync(framesDir(run), { recursive: true })
  fs.writeFileSync(path.join(dir, 'stamp.json'), JSON.stringify(stamp, null, 2) + '\n')
  const session = `${process.pid}-${Date.now()}`
  const log = path.join(dir, `log-${session}.jsonl`)
  let nth = 0
  return (frame, seconds, made, png, numbers) => {
    fs.writeFileSync(frameFile(run, frame), png)
    const line: Line = { frame, seconds, made, session, nth: nth++, numbers }
    fs.appendFileSync(log, JSON.stringify(line) + '\n')
  }
}
