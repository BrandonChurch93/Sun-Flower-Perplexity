import { describe, expect, it } from 'vitest'
import { config } from '../src/config.ts'
import { frameSamples } from '../src/core/sampler.ts'

const counts = [...new Set(Object.values(config.tiers).map((t) => t.samplesPerFrame))]

describe('sampler', () => {
  it('gives the same sequence for the same frame', () => {
    for (const count of counts) expect(frameSamples(311, count)).toEqual(frameSamples(311, count))
  })

  it('gives another sequence for another frame', () => {
    const many = Math.max(...counts)
    expect(frameSamples(311, many)).not.toEqual(frameSamples(312, many))
  })

  it('has weights that add up to one', () => {
    for (const count of counts) expect(frameSamples(5, count).reduce((a, s) => a + s.weight, 0)).toBeCloseTo(1, 9)
  })

  it('keeps every sample inside the pixel, the shutter and the lens', () => {
    for (const count of counts) {
      for (const s of frameSamples(77, count)) {
        expect(Math.abs(s.pixelX)).toBeLessThanOrEqual(0.5)
        expect(Math.abs(s.pixelY)).toBeLessThanOrEqual(0.5)
        expect(s.shutter).toBeGreaterThanOrEqual(0)
        expect(s.shutter).toBeLessThanOrEqual(1)
        expect(Math.hypot(s.lensX, s.lensY)).toBeLessThanOrEqual(1 + 1e-9)
        expect(Math.hypot(s.lightX, s.lightY)).toBeLessThanOrEqual(1 + 1e-9)
      }
    }
  })

  it('covers the pixel, the shutter and the lens', () => {
    for (const count of counts.filter((c) => c >= 8)) {
      for (const frame of [0, 419, 1515]) {
        const samples = frameSamples(frame, count)
        const quarter = (x: number, y: number) => (x < 0 ? 0 : 1) + (y < 0 ? 0 : 2)
        const pixel = new Set(samples.map((s) => quarter(s.pixelX, s.pixelY)))
        const lens = new Set(samples.map((s) => quarter(s.lensX, s.lensY)))
        expect(pixel.size).toBe(4)
        expect(lens.size).toBe(4)
        const slots = new Set(samples.map((s) => Math.min(count - 1, Math.floor(s.shutter * count))))
        expect(slots.size).toBe(count)
        const mean = (pick: (s: (typeof samples)[number]) => number) => samples.reduce((a, s) => a + pick(s), 0) / count
        expect(Math.abs(mean((s) => s.pixelX))).toBeLessThan(0.12)
        expect(Math.abs(mean((s) => s.lensX))).toBeLessThan(0.25)
        expect(Math.max(...samples.map((s) => Math.hypot(s.lensX, s.lensY)))).toBeGreaterThan(0.6)
      }
    }
  })

  it('puts a single sample in the middle', () => {
    expect(frameSamples(9, 1)).toEqual([{ index: 0, pixelX: 0, pixelY: 0, shutter: 0.5, lensX: 0, lensY: 0, lightX: 0, lightY: 0, weight: 1 }])
  })
})
