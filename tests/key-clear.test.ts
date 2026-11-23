import { describe, expect, it } from 'vitest'
import type { SkyLight } from '../src/v2/api.ts'
import { smoothstep } from '../src/core/curves.ts'
import { blankLook, lookAt } from '../src/v2/look.ts'
import { blankMoment, momentAt } from '../src/v2/now.ts'

const sky: SkyLight = { direct: [2.4, 1.6, 0.9], zenith: [0.18, 0.26, 0.42], horizon: [0.5, 0.52, 0.56], horizonSun: [0.9, 0.7, 0.5] }
const seen = (c: readonly number[]) => 0.3 * c[0] + 0.6 * c[1] + 0.1 * c[2]
const FRAMES = 3810

const moment = blankMoment()
const look = blankLook()
const rows: { el: number; lapse: number; read: number; told: number }[] = []
for (let f = 0; f < FRAMES; f++) {
  momentAt(f / 30, moment)
  lookAt(moment, sky, look)
  rows.push({ el: moment.sunElevationDeg, lapse: moment.dials.lapse, read: smoothstep(1.5, 5, seen(look.sun.color) / Math.max(seen(look.sky.zenith), 1e-4)), told: look.sun.clear as number })
}

describe('how clear the key stands, as the look tells the skin', () => {
  it('is what the two lights show wherever the sun is up, the moon is up, or time runs slow', () => {
    let checked = 0
    for (const r of rows) {
      if (r.el >= 0 || r.el <= -9 || r.lapse <= 0.2) {
        expect(r.told).toBe(r.read)
        checked++
      }
    }
    expect(checked).toBeGreaterThan(3000)
  })
  it('never falls under what the two lights show', () => {
    for (const r of rows) expect(r.told).toBeGreaterThanOrEqual(r.read)
  })
  it('does not leap while the sun hands over to the moon in the fast time lapse', () => {
    let nights = 0
    let worstRead = 0
    let worstTold = 0
    for (let f = 1; f < FRAMES; f++) {
      const a = rows[f - 1]
      const b = rows[f]
      if (b.lapse < 0.45 || Math.min(a.el, b.el) > 0.5 || Math.max(a.el, b.el) < -9.5) continue
      if (a.el > -5 !== b.el > -5) nights++
      worstRead = Math.max(worstRead, Math.abs(b.read - a.read))
      worstTold = Math.max(worstTold, Math.abs(b.told - a.told))
    }
    expect(nights).toBeGreaterThanOrEqual(20)
    expect(worstRead).toBeGreaterThan(0.5)
    expect(worstTold).toBeLessThan(0.25)
  })
})
