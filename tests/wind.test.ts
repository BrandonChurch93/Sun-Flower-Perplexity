import { describe, expect, it } from 'vitest'
import { config, timeOf } from '../src/config.ts'
import { plantInputsAt } from '../src/director/inputs.ts'
import { cuts } from '../src/director/growthline.ts'
import { usePlant } from '../src/plant/growth.ts'
import { headAt, stemLength } from '../src/plant/model.ts'
import { STEM_LEAN, STEM_SWING, sway } from '../src/plant/wind.ts'

const still = { leanX: 0.3, leanZ: -0.2, lift: 1, wind: 0 }
const windy = { ...still, wind: 1 }

describe('the wind on the stem', () => {
  it('stays between -1 and 1', () => {
    for (let i = 0; i < 4000; i++) {
      const v = sway(i * 0.037, (i % 61) * 0.9 - 20, (i % 37) * 1.3 - 15)
      expect(Math.abs(v)).toBeLessThanOrEqual(1)
    }
  })

  it('bends the stem and never stretches it', () => {
    for (const time of [12, 27, 45, 50.5, 58.5]) expect(stemLength(time, windy)).toBe(stemLength(time, still))
  })

  it('moves the head of a grown plant by centimeters, not more', () => {
    let widest = 0
    for (let time = 44; time < 52; time += 0.05) {
      const a = headAt(time, still).center
      const ax = a.x
      const az = a.z
      const b = headAt(time, windy).center
      const moved = Math.hypot(b.x - ax, b.z - az)
      expect(moved).toBeLessThan(1.9 * 0.36 * (STEM_LEAN + STEM_SWING) + 0.02)
      widest = Math.max(widest, moved)
    }
    expect(widest).toBeGreaterThan(0.01)
  })

  it('leaves a shape that is drawn once per neighbor unbent, for the field to sway', () => {
    usePlant(5, null)
    const a = headAt(47, windy).center
    const ax = a.x
    const b = headAt(47, still).center
    usePlant(0)
    expect(ax).toBe(b.x)
  })

  it('is still on every cut', () => {
    for (const cut of cuts) expect(plantInputsAt(timeOf(cut.frame)).wind).toBe(0)
    expect(plantInputsAt(config.keys.find((k) => k.id === 'bloom-hero')!.time).wind).toBeGreaterThan(0)
  })
})
