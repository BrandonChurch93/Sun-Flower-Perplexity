import { describe, expect, it } from 'vitest'
import { config, frameCount, timeOf } from '../src/config.ts'
import { plantInputsAt } from '../src/director/inputs.ts'
import { heightAt, leafBirth, leafCount, leafLength, plantNumbers, stemBaseRadius } from '../src/plant/growth.ts'
import { buildStandIn, standInVertexCount } from '../src/plant/standin.ts'

describe('the plant', () => {
  it('never loses height across the film', () => {
    let last = heightAt(0)
    for (let f = 1; f < frameCount; f++) {
      const h = heightAt(timeOf(f))
      expect(h).toBeGreaterThanOrEqual(last)
      last = h
    }
    expect(heightAt(0)).toBe(0)
    expect(heightAt(config.film.durationSeconds)).toBeCloseTo(config.plant.fullHeightM, 6)
  })

  it('passes through every height the config names', () => {
    for (const [time, height] of config.plant.heightM) expect(heightAt(time)).toBeCloseTo(height, 9)
  })

  it('starts every leaf at zero and grows it without a jump', () => {
    const step = 1 / config.film.fps
    for (let i = 0; i < leafCount; i++) {
      const birth = leafBirth(i)
      expect(leafLength(i, birth)).toBe(0)
      expect(leafLength(i, birth - 1)).toBe(0)
      let last = 0
      let largest = 0
      for (let t = birth; t <= config.film.durationSeconds; t += step) {
        const now = leafLength(i, t)
        expect(now).toBeGreaterThanOrEqual(last)
        largest = Math.max(largest, now - last)
        last = now
      }
      expect(largest).toBeLessThan(0.004)
    }
  })

  it('thickens the stem without a jump', () => {
    let last = stemBaseRadius(0)
    for (let f = 1; f < frameCount; f++) {
      const r = stemBaseRadius(timeOf(f))
      expect(r).toBeGreaterThanOrEqual(last)
      expect(r - last).toBeLessThan(0.0005)
      last = r
    }
  })

  it('is the same plant every time it is asked for the same moment', () => {
    for (const time of [0.5, 7.3, 19.99, 33.2, 47.7, 59.9]) {
      const a = new Float32Array(standInVertexCount * 3)
      const b = new Float32Array(standInVertexCount * 3)
      buildStandIn(time, plantInputsAt(time), a, null)
      buildStandIn(31.1, plantInputsAt(31.1), b, null)
      buildStandIn(time, plantInputsAt(time), b, null)
      expect(Array.from(b)).toEqual(Array.from(a))
      expect(plantNumbers(time, plantInputsAt(time))).toEqual(plantNumbers(time, plantInputsAt(time)))
      for (const v of a) expect(Number.isFinite(v)).toBe(true)
    }
  })
})
