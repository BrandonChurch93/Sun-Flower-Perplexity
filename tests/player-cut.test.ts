import { afterEach, describe, expect, it, vi } from 'vitest'
import { config } from '../src/config.ts'
import type { Film } from '../src/director/film.ts'
import { filmPlan, play } from '../src/player/play.ts'
import type { Report, RunFacts } from '../src/player/pacing.ts'
import { cutFrames } from '../src/v2/cuts.ts'

const fps = config.film.fps
const REFRESH_MS = 1000 / 60
const AUDIO_STEP = 128 / 48000

const facts = (stepMs: number): RunFacts => ({
  kind: 'play',
  quality: 'high',
  format: 'test',
  tier: 'draft',
  track: null,
  avMs: 0,
  marks: false,
  audio: { sampleRate: 48000, baseLatencyMs: 0, outputLatencyMs: 0, stepMs },
  screen: { width: 1920, height: 1080, pixelRatio: 1, fullScreen: true, pictureWidth: 1920, pictureHeight: 1080 },
  browser: 'test',
})

// Plays frames `first` to `last` on a page whose clock is in the test's hands: a screen that refreshes 60 times a second,
// an audio clock that goes on in steps while a frame is drawn, and a film whose frames take as long as `costMs` says.
async function run(first: number, last: number, costMs: (frame: number) => number): Promise<Report> {
  let now = 1000
  const zero = now / 1000 - first / fps
  const waiting: ((stamp: number) => void)[] = []
  vi.stubGlobal('performance', { now: () => now })
  vi.stubGlobal('requestAnimationFrame', (turn: (stamp: number) => void) => waiting.push(turn))
  const film = {
    cost: {},
    clock: null,
    renderFrame(frame: number): Promise<void> {
      now += costMs(frame)
      return Promise.resolve()
    },
  } as unknown as Film
  const playing = play({ film, tier: 'draft', plan: filmPlan(first, last), facts, time: () => Math.floor((now / 1000 - zero) / AUDIO_STEP) * AUDIO_STEP })
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
  return report
}

// Every frame shown is the one the audio clock stood in when it was chosen. The report keeps the clock to a tenth of a millisecond.
function onTheClock(report: Report): void {
  for (const s of report.shown) {
    expect(s.audio * fps).toBeGreaterThanOrEqual(s.frame - 0.01)
    expect(s.audio * fps).toBeLessThan(s.frame + 1)
  }
}

afterEach(() => vi.unstubAllGlobals())

describe('the play loop at a cut', () => {
  const cut = cutFrames[0]

  it('shows every frame once and in order through all four cuts on a machine that keeps up', async () => {
    const first = cutFrames[0] - 12
    const last = cutFrames[cutFrames.length - 1] + 12
    const report = await run(first, last, () => 5)
    expect(report.shown.map((s) => s.frame)).toEqual(Array.from({ length: last - first + 1 }, (_, i) => first + i))
    onTheClock(report)
    expect(report.frames.skipped).toBe(0)
  })

  it('draws the frame the audio clock asks for after a long frame, not the next in order', async () => {
    const long = cut - 1
    const report = await run(cut - 12, cut + 12, (frame) => (frame === long ? 80 : 5))
    const frames = report.shown.map((s) => s.frame)
    const after = frames[frames.indexOf(long) + 1]
    expect(frames).toContain(long)
    expect(after).toBeGreaterThan(long + 1)
    expect(after).toBeLessThanOrEqual(long + 4)
    onTheClock(report)
    expect(report.frames.skipped).toBe(after - long - 1)
    expect(frames.slice(frames.indexOf(after))).toEqual(Array.from({ length: cut + 12 - after + 1 }, (_, i) => after + i))
  })

  it('never falls behind the audio clock when every frame is long: the lag is one frame, however many were skipped', async () => {
    const report = await run(cut - 30, cut + 60, () => 80)
    onTheClock(report)
    expect(report.pickedMs.largest).toBeLessThan(1000 / fps)
    expect(report.behindMs.largest).toBeLessThan(80 + 1000 / fps + REFRESH_MS)
    expect(report.frames.skipped).toBeGreaterThan(40)
  })
})
