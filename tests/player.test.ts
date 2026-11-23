import { describe, expect, it } from 'vitest'
import { config, frameCount } from '../src/config.ts'
import { GAP_MS, Pacing, type RunFacts } from '../src/player/pacing.ts'

const fps = config.film.fps
const facts: RunFacts = {
  kind: 'recording',
  quality: 'high',
  format: '1920 x 1080',
  tier: 'draft',
  track: null,
  avMs: 0,
  marks: false,
  audio: { sampleRate: 44100, baseLatencyMs: 0, outputLatencyMs: 0, stepMs: 0 },
  screen: { width: 1920, height: 1080, pixelRatio: 1, fullScreen: true, pictureWidth: 1920, pictureHeight: 1080 },
  browser: 'test',
}

// A machine that takes `drawMs` for a frame, looked at every `refreshMs`, following a clock that never waits for it.
function run(frames: number, drawMs: number, refreshMs: number): Pacing {
  const pacing = new Pacing()
  let now = 0
  let onScreen = -1
  while (now / 1000 < frames / fps) {
    const frame = Math.floor((now / 1000) * fps + 1e-9)
    if (frame !== onScreen) {
      const stamp = now
      now += drawMs
      pacing.present(frame, frame, frame / fps, stamp / 1000, now / 1000, stamp, drawMs)
      onScreen = frame
    }
    now = (Math.floor(now / refreshMs + 1e-9) + 1) * refreshMs
  }
  return pacing
}

describe('the pacing report', () => {
  it('calls a run clean when every frame is drawn in step', () => {
    const report = run(300, 4, 1000 / 60).report(facts, 300, true, null)
    expect(report.frames).toEqual({ due: 300, drawn: 300, skipped: 0 })
    expect(report.gaps).toEqual([])
    expect(report.holds).toBe(true)
    expect(report.gapMs.longest).toBeLessThan(GAP_MS)
    expect(report.behindMs.largest).toBeLessThan(1000 / fps)
    expect(report.shown).toHaveLength(300)
  })

  it('skips frames and loses no time on a machine that is late', () => {
    const report = run(300, 90, 1000 / 60).report(facts, 300, true, null)
    expect(report.holds).toBe(false)
    expect(report.frames.drawn).toBeLessThan(120)
    expect(report.frames.skipped).toBe(300 - report.frames.drawn)
    expect(report.gaps.length).toBeGreaterThan(0)
    expect(report.gaps.every((g) => g.gapMs > GAP_MS && g.skipped > 0)).toBe(true)
    const last = report.shown[report.shown.length - 1]
    expect(last.film).toBeGreaterThan(300 / fps - 0.2)
    expect(Math.abs(report.seconds.film - report.seconds.audio)).toBeLessThan(1 / fps)
    expect(report.behindMs.largest).toBeLessThan(90 + 1000 / fps)
    expect(report.verdict).toContain('did not hold')
  })

  it('does not call a run clean when the graphics card was asked to make something', () => {
    const made = { programs: 1, shaders: 2, textures: 0, buffers: 0, framebuffers: 0, renderbuffers: 0, uploads: 0, uploadBytes: 0, updates: 0, updateBytes: 0 }
    const report = run(60, 4, 1000 / 60).report(facts, 60, true, made)
    expect(report.holds).toBe(false)
    expect(report.verdict).toContain('graphics card')
  })

  it('counts the frames that were due after the last one drawn as a gap', () => {
    const pacing = new Pacing()
    pacing.present(0, 0, 0, 0.004, 9, 16.7, 9000)
    const report = pacing.report(facts, 300, true, null)
    expect(report.frames).toEqual({ due: 300, drawn: 1, skipped: 299 })
    expect(report.gaps).toEqual([{ frame: 0, film: 0, gapMs: 10000, skipped: 299, atEnd: true }])
    expect(report.gapMs.longest).toBe(10000)
    expect(report.holds).toBe(false)
  })

  it('says where a stopped run stopped', () => {
    const report = run(90, 4, 1000 / 60).report(facts, frameCount, false, null)
    expect(report.complete).toBe(false)
    expect(report.stoppedAtFilm).toBeCloseTo(89 / fps, 3)
    expect(report.holds).toBe(false)
  })
})
