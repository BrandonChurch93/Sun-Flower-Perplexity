import { describe, expect, it } from 'vitest'
import { config, frameCount } from '../src/config.ts'
import { GAP_MS, Pacing, reportText, type RunFacts } from '../src/player/pacing.ts'

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
    expect(report.frames).toEqual({ due: 300, drawn: 300, skipped: 0, late: 0 })
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
    const made = { programs: 1, shaders: 2, textures: 0, buffers: 0, framebuffers: 0, renderbuffers: 0, uploads: 0, uploadBytes: 0, updates: 0, updateBytes: 0, bufferUpdates: 0, bufferUpdateBytes: 0, textureUpdates: 0, textureUpdateBytes: 0, vertexArrays: 0 }
    const report = run(60, 4, 1000 / 60).report(facts, 60, true, made)
    expect(report.holds).toBe(false)
    expect(report.verdict).toContain('graphics card')
  })

  it('counts the frames that were due after the last one drawn as a gap', () => {
    const pacing = new Pacing()
    pacing.present(0, 0, 0, 0.004, 9, 16.7, 9000)
    const report = pacing.report(facts, 300, true, null)
    expect(report.frames).toEqual({ due: 300, drawn: 1, skipped: 299, late: 1 })
    expect(report.gaps).toEqual([{ frame: 0, film: 0, gapMs: 10000, skipped: 299, atEnd: true }])
    expect(report.gapMs.longest).toBe(10000)
    expect(report.holds).toBe(false)
  })

  it('keeps the script time of every frame apart from the wait for the picture, and counts the frames shown late', () => {
    const pacing = new Pacing()
    pacing.present(0, 0, 0, 0, 0.02, 0, 20, undefined, { plant: 6, field: 2, script: 8, wait: 12 })
    pacing.present(3, 3, 3 / fps, 3 / fps, 3 / fps + 0.09, 100, 90, undefined, { plant: 30, field: 10, script: 40, wait: 50 })
    const report = pacing.report(facts, 4, false, null)
    expect(report.shown.map((s) => [s.scriptMs, s.cardMs, s.late])).toEqual([[8, 12, false], [40, 50, true]])
    expect(report.frames).toEqual({ due: 4, drawn: 2, skipped: 2, late: 1 })
    expect(report.scriptMs).toEqual({ mean: 24, p99: 40, longest: 40, longestAtFilm: 0.1, longestAtFrame: 3 })
    expect(report.cardMs.longest).toBe(50)
    expect(report.partsMs).toEqual({ plant: 18, field: 6 })
    expect(report.partsWorst).toEqual({ plant: { ms: 30, frame: 3 }, field: { ms: 10, frame: 3 } })
    expect(report.skippedRuns).toEqual([{ from: 1, to: 2 }])
    expect(report.stretches).toHaveLength(1)
    expect(report.stretches[0]).toMatchObject({ from: 0, to: 29, due: 4, shown: 2, skipped: 2, worstScriptAtFrame: 3 })
  })

  it('names the three seconds of film that went worst, the one with the most frames skipped first', () => {
    const pacing = new Pacing()
    let at = 0
    let position = 0
    for (let frame = 0; frame < 150; frame++) {
      const skip = (frame >= 60 && frame < 89 && frame % 2 === 1) || (frame >= 120 && frame % 3 !== 0)
      if (!skip) pacing.present(frame, position, frame / fps, frame / fps, frame / fps + 0.01, at, frame >= 30 && frame < 60 ? 30 : 10, undefined, { plant: 5, script: 5, wait: 5 })
      position++
      at += 1000 / fps
    }
    const report = pacing.report(facts, 150, true, null)
    expect(report.stretches.map((w) => [w.from, w.to, w.skipped])).toEqual([[120, 149, 20], [60, 89, 14], [30, 59, 0]])
    expect(report.frames.skipped).toBe(34)
    expect(report.skippedRuns[0]).toEqual({ from: 61, to: 61 })
    const text = reportText(report)
    expect(text).toContain('30 frames a second held: NO')
    expect(text).toContain('the 3 worst seconds of film:')
    expect(text).toContain('frames 120 to 149: 10 of 30 shown, 20 skipped')
    expect(text).toContain('skipped: 34 frames in 24 runs, frames 61, 63,')
  })

  it('writes the report as text to paste: frames due, shown and late, script mean and worst, longest gap, made', () => {
    const pacing = new Pacing()
    pacing.present(0, 0, 0, 0, 0.02, 0, 20, undefined, { plant: 6, field: 2, script: 8, wait: 12 })
    pacing.present(3, 3, 3 / fps, 3 / fps, 3 / fps + 0.09, 100, 90, undefined, { plant: 30, field: 10, script: 40, wait: 50 })
    const made = { programs: 0, shaders: 0, textures: 0, buffers: 0, framebuffers: 0, renderbuffers: 0, uploads: 0, uploadBytes: 0, updates: 4, updateBytes: 64, bufferUpdates: 4, bufferUpdateBytes: 64, textureUpdates: 0, textureUpdateBytes: 0, vertexArrays: 0 }
    const text = reportText(pacing.report(facts, 4, false, made), ['graphics: test card'])
    expect(text).toContain('frames: 4 due, 2 shown, 2 skipped, 1 shown late')
    expect(text).toContain('of it script: mean 24 ms, 99th 40 ms, worst 40 ms at frame 3')
    expect(text).toContain('longest 100 ms')
    expect(text).toMatch(/plant +mean +18\.0 +worst +30\.0 at frame 3/)
    expect(text).toContain('skipped: 2 frames in 1 run, frames 1 to 2')
    expect(text).toContain('made after loading: 0')
    expect(text).toContain('graphics: test card')
    expect(text.split('\n')[0]).toMatch(/^Not smooth: 2 frames skipped, 1 shown late, longest gap 0\.10 s at /)
    expect(reportText(run(60, 4, 1000 / 60).report(facts, 60, true, null)).split('\n')[0]).toBe('Smooth: 60 of 60 frames shown, none late')
    expect(text).not.toMatch(/[\u2014!]/)
  })

  it('says where a stopped run stopped', () => {
    const report = run(90, 4, 1000 / 60).report(facts, frameCount, false, null)
    expect(report.complete).toBe(false)
    expect(report.stoppedAtFilm).toBeCloseTo(89 / fps, 3)
    expect(report.holds).toBe(false)
  })
})
