import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Film } from '../src/director/film.ts'
import { scriptBound, timedAdvice, timedText, type Report, type RunFacts, type Timed } from '../src/player/pacing.ts'
import { play, stretchPlan } from '../src/player/play.ts'

const REFRESH_MS = 1000 / 60
const JUMP_MS = 400

const facts = (): RunFacts => ({
  kind: 'timing',
  quality: 'high',
  format: 'test',
  tier: 'draft',
  track: null,
  avMs: 0,
  marks: false,
  audio: { sampleRate: 0, baseLatencyMs: 0, outputLatencyMs: 0, stepMs: 0 },
  screen: { width: 1920, height: 1080, pixelRatio: 1, fullScreen: false, pictureWidth: 1920, pictureHeight: 1080 },
  browser: 'test',
})

// Three stretches on the page's own clock. A frame that does not follow the one before it costs `JUMP_MS`, any other frame `frameMs`.
async function run(seat: boolean, frameMs: number): Promise<{ report: Report; drawn: number[] }> {
  let now = 1000
  const zero = now
  const waiting: ((stamp: number) => void)[] = []
  vi.stubGlobal('performance', { now: () => now })
  vi.stubGlobal('requestAnimationFrame', (turn: (stamp: number) => void) => waiting.push(turn))
  let last = -10
  const drawn: number[] = []
  const film = {
    cost: {},
    clock: null,
    renderFrame(frame: number): Promise<void> {
      now += frame === last || frame === last + 1 ? frameMs : JUMP_MS
      last = frame
      drawn.push(frame)
      return Promise.resolve()
    },
  } as unknown as Film
  const playing = play({ film, tier: 'draft', plan: stretchPlan([100, 1000, 2000], 60), facts, raw: true, seat, time: () => (now - zero) / 1000 })
  let report: Report | null = null
  void playing.finished.then((r) => {
    report = r
  })
  for (let turns = 0; !report && turns < 100000; turns++) {
    now = (Math.floor(now / REFRESH_MS + 1e-9) + 1) * REFRESH_MS
    for (const turn of waiting.splice(0)) turn(now)
    await new Promise((resolve) => setImmediate(resolve))
  }
  if (!report) throw new Error('the run did not end')
  return { report, drawn }
}

afterEach(() => vi.unstubAllGlobals())

describe('the timing at the end of loading', () => {
  it('does not charge a machine that keeps up for the jumps between the stretches', async () => {
    const { report, drawn } = await run(true, 5)
    expect(report.frames).toMatchObject({ due: 180, drawn: 180, skipped: 0 })
    expect(report.holds).toBe(true)
    expect(report.nearly).toBe(true)
    expect(report.slow.frames).toBe(0)
    expect(report.gapMs.longest).toBeLessThanOrEqual(50)
    expect(drawn.filter((f) => f === 100)).toHaveLength(2)
    expect(drawn.filter((f) => f === 1000)).toHaveLength(2)
    expect(drawn.filter((f) => f === 2000)).toHaveLength(2)
  })

  it('charges the jumps when nothing is seated, which is why it seats', async () => {
    const { report } = await run(false, 5)
    expect(report.frames.skipped).toBeGreaterThan(20)
    expect(report.holds).toBe(false)
    expect(report.nearly).toBe(false)
  })

  it('still fails a machine whose frames take longer than one frame of time', async () => {
    const { report } = await run(true, 70)
    expect(report.holds).toBe(false)
    expect(report.nearly).toBe(false)
    expect(report.frames.skipped).toBeGreaterThan(90)
    expect(report.slow.frames).toBe(report.frames.drawn)
  })

  it('says which quality the film plays at and why', () => {
    const held: Timed = { quality: 'high', held: true, due: 600, shown: 600, skipped: 0, longestGapMs: 34, slow: 0, script: null }
    const lost: Timed = { quality: 'high', held: false, due: 600, shown: 412, skipped: 188, longestGapMs: 140, slow: 300, script: { frames: 600, over: 2, meanMs: 9.5, worstMs: 41.2 } }
    const low: Timed = { quality: 'low', held: true, due: 600, shown: 600, skipped: 0, longestGapMs: 35, slow: 0, script: null }
    const lowLost: Timed = { ...lost, quality: 'low', skipped: 90, shown: 510 }
    expect(timedAdvice([held], 20)).toBe("Timed at loading: this machine held 30 frames a second at high quality over 20 seconds of the film's hardest parts. Record at high quality.")
    expect(timedAdvice([lost, low], 20)).toBe('Timed at loading: high quality did not hold 30 frames a second on this machine (188 of 600 frames skipped, the longest gap 140 ms) and it was the picture that was slow, low quality held. The film now plays at low quality. Record at low quality.')
    expect(timedAdvice([lost, lowLost], 20)).toContain('neither quality held 30 frames a second on this machine (high: 188 of 600 frames skipped, the longest gap 140 ms; low: 90 of 600 frames skipped, the longest gap 140 ms). The film now plays at low quality.')
    expect(timedText(lost)).toBe('high did not hold 30 frames a second (412 of 600 frames shown, longest gap 140 ms, 300 slow; the script alone, nothing drawn, took 9.5 ms a frame, 41 at worst, and longer than one frame of time on 2 of 600 frames)')
  })

  it('does not fall to low quality when the script alone is over the frame, and says that the export gives the same film', () => {
    const picture: Timed = { quality: 'high', held: false, due: 600, shown: 412, skipped: 188, longestGapMs: 140, slow: 300, script: { frames: 600, over: 2, meanMs: 9.5, worstMs: 41.2 } }
    const script: Timed = { ...picture, script: { frames: 600, over: 3, meanMs: 21, worstMs: 48 } }
    expect(scriptBound(picture)).toBe(false)
    expect(scriptBound(script)).toBe(true)
    expect(scriptBound({ ...script, held: true })).toBe(false)
    expect(scriptBound({ ...script, script: null })).toBe(false)
    const text = timedAdvice([script], 20)
    expect(text.startsWith('This machine cannot play the film live yet, and the export gives the same film with your track, every frame of it.')).toBe(true)
    expect(text).toContain("the page's own work alone, with nothing drawn, took longer than one frame of time on 3 of the same 600 frames")
    expect(text).toContain('the film stays at high quality')
    expect(timedAdvice([picture, { ...picture, quality: 'low', held: true, script: null }], 20)).toContain('it was the picture that was slow, low quality held')
  })
})
