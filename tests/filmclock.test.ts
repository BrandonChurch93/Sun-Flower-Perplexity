import { describe, expect, it } from 'vitest'
import { config, frameCount } from '../src/config.ts'
import { BAR, BAR1, END, SUN, barAt, barTime, flashAt, hitFrame, hitTime, lapseAt, rainAtBar, sunElevationOfPhase, tauAt, worldAt } from '../src/v2/clock.ts'
import { blankMoment, momentAt } from '../src/v2/now.ts'
import { heightAt } from '../src/plant/model.ts'

const fps = config.film.fps
const frames = Array.from({ length: frameCount }, (_, i) => i)
const elevation = (t: number): number => {
  const w = worldAt(t)
  return sunElevationOfPhase(w - Math.floor(w))
}

describe('the film clock', () => {
  it('stands on the music', () => {
    expect(BAR).toBeCloseTo(1.714286, 6)
    expect(barTime(1)).toBeCloseTo(BAR1, 9)
    expect(barAt(barTime(33, 3))).toBeCloseTo(33.5, 9)
    expect(hitFrame(33)).toBe(1672)
    expect(frameCount).toBe(3810)
    expect(END).toBe(127)
  })

  it('never runs the world or the plant backwards', () => {
    let w = -Infinity
    let tau = -Infinity
    for (const f of frames) {
      const t = f / fps
      expect(worldAt(t)).toBeGreaterThanOrEqual(w - 1e-9)
      expect(tauAt(t)).toBeGreaterThanOrEqual(tau - 1e-9)
      w = worldAt(t)
      tau = tauAt(t)
    }
    expect(tauAt(0)).toBe(0)
    expect(tauAt(END)).toBeCloseTo(config.growth.seconds, 6)
  })

  it('does not grow the plant in a hold', () => {
    for (const [from, to, tau] of [[17, 25, config.growth.frostHold], [33, 41, config.growth.stormHold]] as const) {
      for (let b = from; b < to; b += 0.01) expect(tauAt(barTime(b))).toBe(tau)
    }
    expect(heightAt(config.growth.frostHold)).toBeGreaterThan(0.15)
    expect(heightAt(config.growth.frostHold)).toBeLessThan(0.22)
    expect(heightAt(config.growth.stormHold)).toBeGreaterThan(0.84)
    expect(heightAt(config.growth.stormHold)).toBeLessThan(0.96)
  })

  it('brings the sun up on the bar lines', () => {
    const rises: number[] = []
    for (let f = 1; f < frameCount; f++) if (elevation((f - 1) / fps) < 0 && elevation(f / fps) >= 0) rises.push(f)
    const bars = rises.map((f) => barAt(f / fps))
    expect(bars.map((b) => Math.round(b))).toEqual([1, 5, 9, 13, 17, 27, 29, 31, 43, 45, 47, 49, 51, 53, 55])
    for (const b of bars) expect(Math.abs(b - Math.round(b)) * BAR).toBeLessThan(1.01 / fps)
  })

  it('keeps every night short', () => {
    let run = 0
    let longest = 0
    for (const f of frames) {
      if (elevation(f / fps) < -6) run++
      else run = 0
      longest = Math.max(longest, run)
    }
    expect(longest / fps).toBeLessThanOrEqual(0.8)
  })

  it('holds the sun where the film needs it', () => {
    expect(elevation(barTime(25))).toBeCloseTo(SUN.frostEnd, 3)
    expect(elevation(barTime(33))).toBeCloseTo(SUN.stormFrom, 3)
    expect(elevation(barTime(41))).toBeCloseTo(SUN.stormTo, 3)
    expect(elevation(barTime(57))).toBeCloseTo(SUN.bloom, 3)
    expect(elevation(barTime(61))).toBeCloseTo(SUN.open, 3)
    expect(elevation(barTime(65))).toBeCloseTo(SUN.crane, 3)
    expect(elevation(barTime(73))).toBeCloseTo(SUN.last, 3)
  })

  it('starts the sharp events on the frame that holds the beat', () => {
    expect(flashAt((hitFrame(33) - 1) / fps)).toBe(0)
    expect(flashAt(hitTime(33))).toBe(1)
    expect(flashAt(hitTime(37))).toBe(1)
    expect(rainAtBar(barAt((hitFrame(33) - 1) / fps))).toBe(0)
    expect(rainAtBar(barAt((hitFrame(33) + 8) / fps))).toBe(1)
  })

  it('runs in real time in the holds and fastest in the climbs', () => {
    expect(lapseAt(barTime(20))).toBeLessThan(0.05)
    expect(lapseAt(barTime(36))).toBeLessThan(0.03)
    expect(lapseAt(barTime(60))).toBeLessThan(0.03)
    expect(lapseAt(barTime(8))).toBeCloseTo(0.5, 2)
    expect(lapseAt(barTime(29.5))).toBeCloseTo(1, 2)
    expect(lapseAt(barTime(48.5))).toBeCloseTo(1, 2)
  })

  it('gives every dial a value between 0 and 1 and a light that never jumps while it is lit', () => {
    const m = blankMoment()
    let cloud = -Infinity
    for (const f of frames) {
      momentAt(f / fps, m)
      for (const [name, v] of Object.entries(m.dials)) expect(v, `${name} at frame ${f}`).toBeGreaterThanOrEqual(0)
      for (const [name, v] of Object.entries(m.dials)) expect(v, `${name} at frame ${f}`).toBeLessThanOrEqual(1)
      expect(m.sun.length()).toBeCloseTo(1, 9)
      const travel = Math.hypot(m.cloud.shiftX, m.cloud.shiftZ)
      expect(travel).toBeGreaterThanOrEqual(cloud)
      cloud = travel
    }
  })
})
