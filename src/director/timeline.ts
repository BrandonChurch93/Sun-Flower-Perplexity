import { config, frameCount, frameOf, type Segment } from '../config.ts'

export interface TimedSegment extends Segment { firstFrame: number; lastFrame: number; frames: number }
export interface Cut { index: number; frame: number; time: number; fromSegment: string; toSegment: string; fromWorld: string; toWorld: string }
export interface TimedKey { id: string; unit: string; time: number; frame: number; image: string; settled: string[] }
export interface JudgedFrame { frame: number; unit: string; key: string | null; why: string }

export const segments: TimedSegment[] = config.segments.map((s) => {
  const firstFrame = frameOf(s.start)
  const lastFrame = frameOf(s.end) - 1
  return { ...s, firstFrame, lastFrame, frames: lastFrame - firstFrame + 1 }
})

export const cuts: Cut[] = []
for (let i = 1; i < segments.length; i++) {
  const a = segments[i - 1]
  const b = segments[i]
  if (a.world !== b.world) cuts.push({ index: cuts.length + 1, frame: b.firstFrame, time: b.start, fromSegment: a.id, toSegment: b.id, fromWorld: a.world, toWorld: b.world })
}

export const keys: TimedKey[] = config.keys.map((k) => ({ id: k.id, unit: k.unit, time: k.time, frame: frameOf(k.time), image: k.image, settled: k.settled ?? [] }))

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
  if (!s) throw new Error(`unknown unit "${id}"`)
  return s
}

export function worldAt(frame: number): string {
  return segmentAt(frame).world
}

export function lastCutBefore(frame: number): Cut | null {
  let found: Cut | null = null
  for (const c of cuts) if (c.frame <= frame) found = c
  return found
}

export function worldStartTime(frame: number): number {
  const cut = lastCutBefore(frame)
  return cut ? cut.time : 0
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
  for (const k of keys) add(k.frame, k.id, `the key ${k.id}`)
  return out.sort((a, b) => a.frame - b.frame)
}

export function unitsShownBy(frame: number): string[] {
  return [segmentAt(frame).id]
}
