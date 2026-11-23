import { describe, expect, it } from 'vitest'
import type { SkyLight } from '../v2/api.ts'
import type { RGB } from '../core/world.ts'
import { afterSunset, sunsetAmount, SunsetMeter, sunsetSkyAt } from './sunset.ts'

const rgb = (): RGB => [0, 0, 0]

describe('final sunset air', () => {
  it('leaves earlier skies alone and eases in without a step', () => {
    expect(sunsetAmount(65)).toBe(0)
    expect(sunsetAmount(65.001)).toBeLessThan(0.000001)
    expect(sunsetAmount(66)).toBe(0.5)
    expect(sunsetAmount(67)).toBe(1)
    expect(afterSunset(1.5)).toBe(0)
    expect(afterSunset(-3.4)).toBe(1)
  })

  it('has a warm horizon with a cooler cap and a thin band after sunset', () => {
    const warm = sunsetSkyAt(0.018, 1, 0, rgb())
    const sideways = sunsetSkyAt(0.018, 0, 0, rgb())
    const dome = sunsetSkyAt(0.18, 1, 0, rgb())
    const after = sunsetSkyAt(0.059, 1, 1, rgb())
    const before = sunsetSkyAt(0.059, 1, 0, rgb())
    expect(warm[0]).toBeGreaterThan(sideways[0])
    expect(sideways[0]).toBeGreaterThan(sideways[1])
    expect(dome[2]).toBeGreaterThan(dome[0])
    expect(after[0]).toBeLessThan(before[0])
  })

  it('meters the drawn clear-air model, not a separate lighting grade', () => {
    const out: SkyLight = { direct: [1, 2, 3], zenith: rgb(), horizon: rgb(), horizonSun: rgb() }
    const meter = new SunsetMeter()
    const away = Math.cos(Math.PI * 0.79)
    for (const time of [0, 0.131, 0.483, 0.911, 1]) {
      meter.blend(time, 1, out)
      const expected = [sunsetSkyAt(1, 0, time, rgb()), sunsetSkyAt(0.023, away, time, rgb()), sunsetSkyAt(0.027, 1, time, rgb())]
      for (const [i, sample] of [out.zenith, out.horizon, out.horizonSun].entries()) {
        for (let c = 0; c < 3; c++) expect(sample[c]).toBeCloseTo(expected[i][c], 5)
      }
    }
    expect(out.direct).toEqual([1, 2, 3])
  })
})
