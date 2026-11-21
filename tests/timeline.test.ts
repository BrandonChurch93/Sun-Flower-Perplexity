import { describe, expect, it } from 'vitest'
import { config, frameCount } from '../src/config.ts'
import { cuts, judgedFrames, keys, segmentAt, segments, worldAt } from '../src/director/timeline.ts'

const fps = config.film.fps

describe('timeline', () => {
  it('has the frame count of the film', () => {
    expect(frameCount).toBe(fps * config.film.durationSeconds)
  })

  it('maps every segment boundary to the right frame', () => {
    expect(segments.length).toBe(config.segments.length)
    let total = 0
    for (const [i, s] of segments.entries()) {
      const source = config.segments[i]
      expect(s.firstFrame).toBe(source.start * fps)
      expect(s.lastFrame).toBe(source.end * fps - 1)
      expect(segmentAt(s.firstFrame).id).toBe(source.id)
      expect(segmentAt(s.lastFrame).id).toBe(source.id)
      if (i > 0) expect(segmentAt(s.firstFrame - 1).id).toBe(config.segments[i - 1].id)
      total += s.frames
    }
    expect(total).toBe(frameCount)
    expect(segments[0].firstFrame).toBe(0)
    expect(segments[segments.length - 1].lastFrame).toBe(frameCount - 1)
  })

  it('maps every key to the right frame inside its unit', () => {
    expect(keys.length).toBe(config.keys.length)
    for (const [i, k] of keys.entries()) {
      expect(k.frame).toBe(config.keys[i].time * fps)
      expect(segmentAt(k.frame).id).toBe(config.keys[i].unit)
    }
  })

  it('computes a cut at every boundary where the world changes, and nowhere else', () => {
    const expected: number[] = []
    for (let i = 1; i < config.segments.length; i++) if (config.segments[i].world !== config.segments[i - 1].world) expected.push(config.segments[i].start * fps)
    expect(cuts.map((c) => c.frame)).toEqual(expected)
    expect(cuts.map((c) => c.index)).toEqual(expected.map((_, i) => i + 1))
    for (const c of cuts) {
      expect(worldAt(c.frame)).toBe(c.toWorld)
      expect(worldAt(c.frame - 1)).toBe(c.fromWorld)
      expect(c.fromWorld).not.toBe(c.toWorld)
    }
    for (let f = 1; f < frameCount; f++) if (worldAt(f) !== worldAt(f - 1)) expect(expected).toContain(f)
  })

  it('builds the judged list by the rule: frame 0, the hook frame and every key', () => {
    const wanted = new Set<number>([0, config.film.hookSeconds * fps, ...config.keys.map((k) => k.time * fps)])
    const list = judgedFrames()
    expect(list.map((j) => j.frame)).toEqual([...wanted].sort((a, b) => a - b))
    for (const j of list) expect(j.unit).toBe(segmentAt(j.frame).id)
    for (const k of config.keys) expect(list.find((j) => j.frame === k.time * fps)?.key).toBe(k.id)
  })
})
