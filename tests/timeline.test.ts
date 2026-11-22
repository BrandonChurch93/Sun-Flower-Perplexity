import { describe, expect, it } from 'vitest'
import { config, frameCount } from '../src/config.ts'
import { cuts, judgedFrames, keys, segmentAt, segments } from '../src/director/timeline.ts'
import { barTime, hitFrame } from '../src/v2/clock.ts'

describe('the film in its sections', () => {
  it('covers every frame once and has no cut', () => {
    expect(frameCount).toBe(config.film.fps * config.film.durationSeconds)
    expect(cuts.length).toBe(0)
    expect(segments[0].firstFrame).toBe(0)
    expect(segments[segments.length - 1].lastFrame).toBe(frameCount - 1)
    let total = 0
    for (const [i, s] of segments.entries()) {
      if (i > 0) expect(s.firstFrame).toBe(segments[i - 1].lastFrame + 1)
      expect(segmentAt(s.firstFrame).id).toBe(s.id)
      expect(segmentAt(s.lastFrame).id).toBe(s.id)
      total += s.frames
    }
    expect(total).toBe(frameCount)
  })

  it('starts every section on the frame that holds its bar line', () => {
    for (const s of segments.slice(1)) {
      expect(s.firstFrame).toBe(hitFrame(s.fromBar))
      expect(barTime(s.fromBar) * config.film.fps - s.firstFrame).toBeLessThan(1)
    }
  })

  it('puts every look inside its section and judges the first and the last frame', () => {
    for (const k of keys) expect(segmentAt(k.frame).id).toBe(k.unit)
    const judged = judgedFrames().map((j) => j.frame)
    expect(judged[0]).toBe(0)
    expect(judged[judged.length - 1]).toBe(frameCount - 1)
    for (const k of keys) expect(judged).toContain(k.frame)
  })
})
