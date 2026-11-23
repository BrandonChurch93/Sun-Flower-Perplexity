import { describe, expect, it } from 'vitest'
import { config, frameCount } from '../src/config.ts'
import { Steady } from '../src/player/clock.ts'
import { filmPlan, stretchPlan } from '../src/player/play.ts'
import { checkStarts, pictureSize } from '../src/player/session.ts'
import { pack, unpack, type StoredChunk } from '../src/capture/store.ts'

const fps = config.film.fps
const master = config.formats.master

describe('the film plan', () => {
  it('draws the frame the clock is in, and nothing before or after the film', () => {
    const plan = filmPlan()
    expect(plan.cue(0)?.frame).toBe(0)
    expect(plan.cue(1 / fps - 1e-6)?.frame).toBe(0)
    expect(plan.cue(62.5)?.frame).toBe(Math.floor(62.5 * fps))
    expect(plan.cue(-0.01)).toBeNull()
    expect(plan.cue(frameCount / fps)).toBeNull()
    expect(plan.due).toBe(frameCount)
  })

  it('never goes back when the clock goes on', () => {
    const plan = filmPlan()
    let before = -1
    for (let t = 0; t < frameCount / fps; t += 0.0071) {
      const frame = plan.cue(t)?.frame ?? before
      expect(frame).toBeGreaterThanOrEqual(before)
      before = frame
    }
    expect(before).toBe(frameCount - 1)
  })

  it('plays the stretches of the check one after the other', () => {
    const each = Math.round((10 * fps) / 3)
    const starts = checkStarts(each)
    expect(starts).toHaveLength(3)
    const plan = stretchPlan(starts, each)
    expect(plan.cue(0)?.frame).toBe(starts[0])
    expect(plan.cue(each / fps)?.frame).toBe(starts[1])
    expect(plan.cue((2 * each) / fps)?.frame).toBe(starts[2])
    for (const start of starts) {
      expect(start).toBeGreaterThanOrEqual(0)
      expect(start + each).toBeLessThanOrEqual(frameCount)
    }
  })
})

describe('the picture on the screen', () => {
  it('is the film size exactly when the screen allows', () => {
    expect(pictureSize(master, 1920, 1080, 1, false)).toEqual({ width: master.width, height: master.height, exact: true })
    expect(pictureSize(master, 2560, 1440, 1, false)).toEqual({ width: master.width, height: master.height, exact: true })
    expect(pictureSize(master, 1920, 1080, 2, false)).toEqual({ width: master.width / 2, height: master.height / 2, exact: true })
  })

  it('is fitted without stretching when the screen is smaller', () => {
    const size = pictureSize(master, 1280, 800, 1, false)
    expect(size.exact).toBe(false)
    expect(size.width).toBeCloseTo(1280, 6)
    expect(size.width / size.height).toBeCloseTo(master.width / master.height, 6)
    expect(size.height).toBeLessThanOrEqual(800)
  })
})

describe('the steadied audio clock', () => {
  it('goes on between the steps of the audio clock and never runs ahead of it', () => {
    const steady = new Steady()
    const step = 1024 / 44100
    let before = -Infinity
    for (let ms = 0; ms < 4000; ms += 1000 / 60) {
      const truth = ms / 1000
      const raw = Math.floor(truth / step) * step
      const read = steady.read(raw, ms + 5000)
      expect(read).toBeGreaterThanOrEqual(before)
      expect(read).toBeLessThanOrEqual(truth + 1e-9)
      if (ms > 500) expect(truth - read).toBeLessThan(0.004)
      before = read
    }
  })

  it('stands still when the audio clock stands still', () => {
    const steady = new Steady()
    for (let ms = 0; ms < 500; ms += 10) steady.read(ms / 1000, ms)
    const stopped = steady.read(0.5, 500)
    expect(steady.read(0.5, 4000)).toBeLessThanOrEqual(0.5 + steady.step + 1e-9)
    expect(stopped).toBeCloseTo(0.5, 2)
  })
})

describe('what a stopped export keeps', () => {
  it('reads back what it wrote', () => {
    const chunks: StoredChunk[] = [
      { key: true, timestamp: 0, duration: 33333, data: new Uint8Array([1, 2, 3, 4, 5]) },
      { key: false, timestamp: 33333, duration: 33334, data: new Uint8Array([9]) },
    ]
    expect(unpack(pack(chunks))).toEqual(chunks)
  })

  it('refuses a file that was cut short', () => {
    const bytes = pack([{ key: true, timestamp: 0, duration: 33333, data: new Uint8Array(64) }])
    expect(unpack(bytes.subarray(0, bytes.length - 3))).toBeNull()
  })
})
