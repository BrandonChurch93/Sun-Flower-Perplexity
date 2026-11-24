import { describe, expect, it } from 'vitest'
import { config, timeOf } from '../src/config.ts'
import { plantInputsAt } from '../src/director/inputs.ts'
import { cuts } from '../src/director/growthline.ts'
import { usePlant } from '../src/plant/growth.ts'
import { headAt, stemLength } from '../src/plant/model.ts'
import { STEM_LEAN, STEM_SWING, sway } from '../src/plant/wind.ts'
import { windOf } from '../src/field/layout.ts'
import { PATCHY_BY_S, PATCHY_FROM_S, bentBy, frontAt, gustAt, patchyAt, windWay } from '../src/v2/wind.ts'

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

// A patch of the field, fourteen rows of fourteen neighbors 0.75 m apart, followed for twelve seconds of the last shot.
// `how` gives one number for a neighbor at a second; the answer is how alike two neighbors move, in the mean, by how far apart they stand.
function alike(how: (id: number, x: number, z: number, seconds: number) => number): number[] {
  const side = 14
  const frames = 360
  const at: number[][] = []
  const runs: Float64Array[] = []
  for (let i = 0; i < side; i++) {
    for (let j = 0; j < side; j++) {
      const id = 1000 + i * side + j
      const x = -20 + i * 0.75 + 0.2 * windOf(id, 0)
      const z = 30 + j * 0.75 + 0.2 * windOf(id, 1)
      const run = new Float64Array(frames)
      let mean = 0
      for (let k = 0; k < frames; k++) mean += run[k] = how(id, x, z, PATCHY_BY_S + 4 + k / 30)
      for (let k = 0; k < frames; k++) run[k] -= mean / frames
      at.push([x, z])
      runs.push(run)
    }
  }
  const sums = [0, 0, 0, 0]
  const counts = [0, 0, 0, 0]
  for (let a = 0; a < runs.length; a++) {
    for (let b = a + 1; b < runs.length; b++) {
      const apart = Math.hypot(at[a][0] - at[b][0], at[a][1] - at[b][1])
      const bin = apart < 1 ? 0 : apart < 2 ? 1 : apart < 4 ? 2 : apart < 8 ? 3 : -1
      if (bin < 0) continue
      let ab = 0
      let aa = 0
      let bb = 0
      for (let k = 0; k < frames; k++) {
        ab += runs[a][k] * runs[b][k]
        aa += runs[a][k] * runs[a][k]
        bb += runs[b][k] * runs[b][k]
      }
      sums[bin] += ab / Math.sqrt(aa * bb)
      counts[bin]++
    }
  }
  return sums.map((sum, bin) => sum / counts[bin])
}

describe('the wind over the field in the last shot', () => {
  it('is the one front until bar 65, so nothing before that shot moves another way', () => {
    expect(patchyAt(PATCHY_FROM_S)).toBe(0)
    expect(patchyAt(PATCHY_BY_S)).toBe(1)
    for (let i = 0; i < 600; i++) {
      const seconds = (i / 600) * PATCHY_FROM_S
      const x = (i % 23) * 3.1 - 30
      const z = (i % 17) * 4.3 - 20
      expect(gustAt(x, z, seconds)).toBe(frontAt(x, z, seconds))
    }
  })

  it('carries no top farther than its reach and pushes no harder than one', () => {
    for (let i = 0; i < 6000; i++) {
      const bent = bentBy(windOf(i, 0), windOf(i, 1), windOf(i, 2), (i % 97) * 1.7 - 80, (i % 61) * 2.9 - 20, PATCHY_BY_S + (i % 113) * 0.137)
      expect(Math.hypot(bent.x, bent.z)).toBeLessThanOrEqual(1)
      expect(bent.push).toBeGreaterThanOrEqual(0)
      expect(bent.push).toBeLessThanOrEqual(1)
    }
  })

  it('gives a neighbor the same numbers whenever it is asked', () => {
    const first = { ...bentBy(0.31, 0.72, 0.18, 12.5, 40.25, 118.3) }
    bentBy(0.9, 0.1, 0.5, -30, 77, 121)
    expect({ ...bentBy(0.31, 0.72, 0.18, 12.5, 40.25, 118.3) }).toEqual(first)
  })

  it('moves no row of neighbors as one', () => {
    // Along the wind, where the old front showed: under 1 m apart, 1 to 2 m, 2 to 4 m, 4 to 8 m.
    const gusts = alike((id, x, z, seconds) => {
      const bent = bentBy(windOf(id, 0), windOf(id, 1), windOf(id, 2), x, z, seconds)
      return bent.x * windWay.x + bent.z * windWay.z
    })
    const front = alike((id, x, z, seconds) => frontAt(x, z, seconds - 0.25 * windOf(id, 0)))
    // The one front, which the field had before: neighbors a few meters apart rise and fall together.
    expect(front[1]).toBeGreaterThan(0.75)
    expect(front[2]).toBeGreaterThan(0.5)
    // The gusts: a gust still strikes the few plants it reaches together, as it does in a real crop, and past a few meters each goes its own way.
    expect(gusts[0]).toBeLessThan(0.75)
    expect(gusts[1]).toBeLessThan(0.62)
    expect(gusts[2]).toBeLessThan(0.33)
    expect(Math.abs(gusts[3])).toBeLessThan(0.15)
    for (let bin = 0; bin < 4; bin++) expect(gusts[bin]).toBeLessThan(front[bin] - 0.15)
  })
})
