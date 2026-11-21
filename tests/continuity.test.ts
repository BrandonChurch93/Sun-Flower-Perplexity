import { describe, expect, it } from 'vitest'
import { config, frameCount } from '../src/config.ts'
import { continuityFrom } from '../src/director/continuity.ts'
import { stateAt } from '../src/director/state.ts'
import { cuts } from '../src/director/timeline.ts'

describe('continuity across the cuts', () => {
  it('has cuts to test', () => {
    expect(cuts.length).toBeGreaterThan(0)
  })

  it('moves the camera and the plant no more across a cut than between ordinary neighbors', () => {
    for (const cut of cuts) {
      const result = continuityFrom(stateAt, cut.frame)
      expect(result.worst.ratio, `cut ${cut.index} at frame ${cut.frame}, ${result.worst.name}`).toBeLessThanOrEqual(config.continuity.maxStepRatio)
      expect(stateAt(cut.frame).world).toBe(cut.toWorld)
      expect(stateAt(cut.frame - 1).world).toBe(cut.fromWorld)
    }
  })

  it('gives finite numbers on every frame', () => {
    for (let f = 0; f < frameCount; f += 7) {
      const s = stateAt(f)
      for (const v of [...s.camera, ...s.plant]) expect(Number.isFinite(v)).toBe(true)
    }
  })

  it('gives the same numbers every time', () => {
    for (const f of [0, 239, 240, 901, frameCount - 1]) expect(stateAt(f)).toEqual(stateAt(f))
  })
})
