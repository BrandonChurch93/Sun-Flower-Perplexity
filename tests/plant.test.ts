import { describe, expect, it } from 'vitest'
import { config, frameCount, timeOf } from '../src/config.ts'
import { plantInputsAt } from '../src/director/inputs.ts'
import { bodyRadius, headElevation, heightAt, leafBirth, leafCount, leafLength, rayCount, rayLength, rayOpen, seedLeafLength, stemBaseRadius } from '../src/plant/growth.ts'
import { buildStandIn, plantNumbers, standInVertexCount, stemLength, tipAt } from '../src/plant/standin.ts'

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

  it('stands exactly as tall as the film says, whatever shape it is in', () => {
    const pos = new Float32Array(standInVertexCount * 3)
    for (let f = 0; f < frameCount; f += 7) {
      const time = timeOf(f)
      const top = buildStandIn(time, plantInputsAt(time), pos, null)
      expect(Math.abs(top - heightAt(time))).toBeLessThan(2e-5)
    }
  })

  it('grows its stem and moves its tip without a jump', () => {
    const step = 1 / config.film.fps
    let lastLength = stemLength(0, plantInputsAt(0))
    let last = tipAt(0, plantInputsAt(0), { x: 0, y: 0, z: 0 })
    for (let f = 1; f < frameCount; f++) {
      const time = timeOf(f)
      const length = stemLength(time, plantInputsAt(time))
      const tip = tipAt(time, plantInputsAt(time), { x: 0, y: 0, z: 0 })
      expect(Math.abs(length - lastLength)).toBeLessThan(0.3 * step)
      expect(Math.hypot(tip.x - last.x, tip.y - last.y, tip.z - last.z)).toBeLessThan(0.3 * step)
      lastLength = length
      last = { ...tip }
    }
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

  it('starts the seed leaves, the bud and the rays at zero', () => {
    expect(seedLeafLength(0)).toBe(0)
    expect(bodyRadius(config.plant.stages.bud[0])).toBe(0)
    expect(bodyRadius(config.plant.stages.bud[0] - 1)).toBe(0)
    expect(bodyRadius(config.film.durationSeconds)).toBeCloseTo(config.plant.discDiameterM / 2, 9)
    for (let k = 0; k < rayCount; k++) {
      expect(rayLength(k, config.plant.stages.bloom[0] - 1)).toBe(0)
      expect(rayOpen(k, config.plant.stages.bloom[0])).toBe(0)
      expect(rayOpen(k, config.plant.stages.bloom[1])).toBe(1)
    }
    expect(headElevation(config.plant.stages.bud[0])).toBeCloseTo(Math.PI / 2, 9)
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
