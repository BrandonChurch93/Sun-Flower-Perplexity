import { config, frameCount, frameOf } from '../config.ts'
import { barTime } from '../v2/clock.ts'

export interface TimedSegment { id: string; name: string; world: string; kind: string; fromBar: number; toBar: number; start: number; end: number; firstFrame: number; lastFrame: number; frames: number }
export interface Cut { index: number; frame: number; time: number; fromSegment: string; toSegment: string; fromWorld: string; toWorld: string }
export interface TimedKey { id: string; unit: string; time: number; frame: number; image: string; settled: string[] }
export interface JudgedFrame { frame: number; unit: string; key: string | null; why: string }

// The film is one place with no cut in it. Its stretches are sections of the track, and each starts on the frame that holds its bar line.
const WORLD = 'place'
const starts = config.sections.map((s, i) => (i === 0 ? 0 : Math.floor(barTime(s.fromBar) * config.film.fps + 1e-6)))

export const segments: TimedSegment[] = config.sections.map((s, i) => {
  const firstFrame = starts[i]
  const lastFrame = i + 1 < starts.length ? starts[i + 1] - 1 : frameCount - 1
  return { id: s.id, name: s.name, world: WORLD, kind: s.kind, fromBar: s.fromBar, toBar: s.toBar, start: firstFrame / config.film.fps, end: (lastFrame + 1) / config.film.fps, firstFrame, lastFrame, frames: lastFrame - firstFrame + 1 }
})

export const cuts: Cut[] = []

export const keys: TimedKey[] = config.looks.map((l) => {
  const frame = l.seconds !== undefined ? frameOf(l.seconds) : Math.floor(barTime(l.bar ?? 1, l.beat ?? 1) * config.film.fps + 1e-6)
  return { id: l.id, unit: l.section, time: frame / config.film.fps, frame, image: l.image, settled: [] }
})

export function clampFrame(frame: number): number {
  return Math.min(frameCount - 1, Math.max(0, Math.round(frame)))
}

export function segmentAt(frame: number): TimedSegment {
  const f = clampFrame(frame)
  for (const s of segments) if (f >= s.firstFrame && f <= s.lastFrame) return s
  return segments[segments.length - 1]
}

export function segmentById(id: string): TimedSegment {
  const s = segments.find((x) => x.id === id)
  if (!s) throw new Error(`unknown section "${id}"`)
  return s
}

export function worldAt(_frame: number): string {
  return WORLD
}

export function lastCutBefore(_frame: number): Cut | null {
  return null
}

export function worldStartTime(_frame: number): number {
  return 0
}

export function judgedFrames(): JudgedFrame[] {
  const out: JudgedFrame[] = []
  const add = (frame: number, key: string | null, why: string) => {
    const existing = out.find((j) => j.frame === frame)
    if (existing) {
      if (key && !existing.key) existing.key = key
      existing.why += `, ${why}`
      return
    }
    out.push({ frame, unit: segmentAt(frame).id, key, why })
  }
  add(0, null, 'the first frame')
  add(frameOf(config.film.hookSeconds), null, 'the frame at film.hookSeconds')
  for (const k of keys) add(k.frame, k.id, `the look ${k.id}`)
  add(frameCount - 1, null, 'the last frame')
  return out.sort((a, b) => a.frame - b.frame)
}

export function unitsShownBy(frame: number): string[] {
  return [segmentAt(frame).id]
}
