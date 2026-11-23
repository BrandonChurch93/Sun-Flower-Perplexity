import { describe, expect, it } from 'vitest'
import type { RGB } from '../core/world.ts'
import { sunsetAmount, sunsetDuskAt, SunsetMeter, sunsetSkyAt } from './sunset.ts'

const rgb = (): RGB => [0, 0, 0]

describe('final sunset air', () => {
  it('leaves earlier skies alone and eases in without a step', () => {
    expect(sunsetAmount(65)).toBe(0)
    expect(sunsetAmount(65.001)).toBeLessThan(0.000001)
    expect(sunsetAmount(66)).toBe(0.5)
    expect(sunsetAmount(67)).toBe(1)
    expect(sunsetDuskAt(2.04)).toBe(0)
    expect(sunsetDuskAt(1.1)).toBeGreaterThan(0.94)
    expect(sunsetDuskAt(0.42)).toBe(1)
  })

  it('has a warm horizon with a cooler cap and a thin band after sunset', () => {
    const warm = sunsetSkyAt(0.018, 1, 0, rgb())
    const sideways = sunsetSkyAt(0.018, Math.cos(30 * Math.PI / 180), 0, rgb())
    const dome = sunsetSkyAt(0.18, 1, 0, rgb())
    const after = sunsetSkyAt(0.059, 1, 1, rgb())
    const before = sunsetSkyAt(0.059, 1, 0, rgb())
    expect(warm[0]).toBeGreaterThan(sideways[0])
    expect(sideways[2]).toBeGreaterThan(sideways[0])
    expect(warm[0]).toBeGreaterThan(4 * sideways[0])
    expect(dome[2]).toBeGreaterThan(dome[0])
    expect(after[0]).toBeLessThan(before[0])
  })

  it('carries gold into red-orange at the sun while the distant air cools', () => {
    const at = (elevation: number, azimuth: number) =>
      sunsetSkyAt(0.025, Math.cos(azimuth * Math.PI / 180), sunsetDuskAt(elevation), rgb())
    const gold = at(2.04, 0)
    const orange = at(1.5, 0)
    const ember = at(1.1, 0)
    const nearby = at(1.1, 5)
    const beyond = at(1.1, 15)
    const away = at(1.1, 30)
    expect(gold[1] / gold[0]).toBeGreaterThan(orange[1] / orange[0])
    expect(orange[1] / orange[0]).toBeGreaterThan(ember[1] / ember[0])
    expect(nearby[0]).toBeGreaterThan(2 * nearby[2])
    expect(beyond[0]).toBeLessThan(0.3 * ember[0])
    expect(beyond[2]).toBeGreaterThan(beyond[1])
    expect(away[2]).toBeGreaterThan(away[0])
    expect(at(0.42, 0)[0]).toBeGreaterThan(3 * at(0.42, 0)[1])
  })

  it('meters the drawn clear-air model, not a separate lighting grade', () => {
    const direct: RGB = [1, 2, 3]
    const out = { direct, zenith: rgb(), horizon: rgb(), horizonSun: rgb(), band: rgb() }
    const meter = new SunsetMeter()
    const away = Math.cos(Math.PI * 0.79)
    for (const time of [0, 0.131, 0.483, 0.911, 1]) {
      meter.blend(time, 1, out, out.band)
      const mean = rgb()
      for (let a = 0; a < 256; a++) {
        const sample = sunsetSkyAt(0.10, Math.cos(a * 2 * Math.PI / 256), time, rgb())
        for (let c = 0; c < 3; c++) mean[c] += sample[c] / 256
      }
      const expected = [sunsetSkyAt(1, 0, time, rgb()), mean, sunsetSkyAt(0.027, 1, time, rgb()), sunsetSkyAt(0.023, away, time, rgb())]
      for (const [i, sample] of [out.zenith, out.horizon, out.horizonSun, out.band].entries()) {
        for (let c = 0; c < 3; c++) expect(sample[c]).toBeCloseTo(expected[i][c], 5)
      }
      expect(out.horizon[2]).toBeGreaterThan(out.horizon[0])
      expect(out.horizonSun[0] / out.horizonSun[2]).toBeGreaterThan(out.band[0] / out.band[2])
    }
    expect(out.direct).toEqual([1, 2, 3])
  })
})
