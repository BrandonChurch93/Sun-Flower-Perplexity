import { afterEach, describe, expect, it, vi } from 'vitest'
import { config } from '../src/config.ts'
import { readOptions, writeOptions } from '../src/director/modes.ts'
import { MARK_HOLD_SECONDS, markSeconds } from '../src/player/clock.ts'
import { Pacing, type RunFacts } from '../src/player/pacing.ts'
import { flasher } from '../src/player/session.ts'

const fps = config.film.fps
const facts: RunFacts = {
  kind: 'play',
  quality: 'high',
  format: '1920 x 1080',
  tier: 'draft',
  track: null,
  avMs: 0,
  marks: false,
  audio: { sampleRate: 44100, baseLatencyMs: 0, outputLatencyMs: 0, stepMs: 0 },
  screen: { width: 1920, height: 1080, pixelRatio: 1, fullScreen: false, pictureWidth: 1920, pictureHeight: 1080 },
  browser: 'test',
}

function paced(frames: number, every: number): Pacing {
  const pacing = new Pacing()
  for (let f = 0; f < frames; f += every) pacing.present(f, f, f / fps, f / fps, f / fps + 0.004, (f / fps) * 1000, 4)
  return pacing
}

describe('the sentence of the report', () => {
  const rate = `${fps} frames a second`
  it('says the machine held the rate when every frame was drawn in time', () => {
    expect(paced(90, 1).report(facts, 90, true, null).verdict.startsWith(`This machine held ${rate}:`)).toBe(true)
  })
  it('says it did not when frames were skipped', () => {
    expect(paced(90, 5).report(facts, 90, true, null).verdict.startsWith(`This machine did not hold ${rate}:`)).toBe(true)
  })
  it('says so for a run that was stopped too', () => {
    expect(paced(30, 1).report(facts, 30, false, null).verdict.startsWith(`This machine held ${rate} until the run was stopped`)).toBe(true)
    expect(paced(30, 5).report(facts, 30, false, null).verdict.startsWith(`This machine did not hold ${rate} until the run was stopped`)).toBe(true)
  })
})

describe('the review page', () => {
  it('is a mode of its own that survives the address', () => {
    const o = readOptions('?mode=review&frame=900')
    expect(o.mode).toBe('review')
    expect(readOptions(writeOptions(o)).mode).toBe('review')
    expect(readOptions(writeOptions(o)).frame).toBe(900)
  })
})

describe('the flash of the sync marks', () => {
  afterEach(() => vi.unstubAllGlobals())

  // A screen that refreshes at the given moments of the clock, in seconds.
  function watch(moments: number[]): { on: number[]; shownAt: number } {
    let next: (() => void) | null = null
    vi.stubGlobal('requestAnimationFrame', (f: () => void) => {
      next = f
      return 0
    })
    let now = moments[0]
    let lit = false
    const on: number[] = []
    const flash = flasher(() => now, (state) => {
      lit = state
    })
    let shownAt = NaN
    for (const m of moments) {
      now = m
      const turn = next as (() => void) | null
      next = null
      turn?.()
      if (lit) on.push(m)
      if (Number.isNaN(shownAt) && flash.shown()) shownAt = m
    }
    flash.stop()
    return { on, shownAt }
  }

  const [head, tail] = markSeconds()

  it('is on at each mark for its length on a screen that keeps up', () => {
    const moments: number[] = []
    for (let t = head - 0.5; t < tail + 0.5; t += 1 / 60) moments.push(t)
    const { on, shownAt } = watch(moments)
    const first = on.filter((m) => m < 0)
    const second = on.filter((m) => m > 0)
    for (const [at, list] of [[head, first], [tail, second]] as const) {
      expect(list.length).toBeGreaterThanOrEqual(2)
      expect(list[0]).toBeGreaterThanOrEqual(at)
      expect(list[0]).toBeLessThan(at + 1 / 60 + 1e-9)
      expect(list[list.length - 1]).toBeLessThan(at + MARK_HOLD_SECONDS + 1 / 60)
    }
    expect(shownAt).toBeLessThan(tail + MARK_HOLD_SECONDS + 2 / 60)
  })

  it('still shows the last mark for two refreshes when the last frame took longer than the tail', () => {
    const late = tail + 7
    const { on, shownAt } = watch([head - 0.1, head, head + 1 / 60, head + 0.1, 30, late, late + 1 / 60, late + 2 / 60, late + 3 / 60])
    expect(on.filter((m) => m >= late)).toHaveLength(2)
    expect(shownAt).toBeCloseTo(late + 2 / 60, 6)
  })
})
