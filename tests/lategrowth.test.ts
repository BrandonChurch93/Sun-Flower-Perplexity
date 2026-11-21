import { expect, test } from 'vitest'
import { config } from '../src/config.ts'
import { plantInputsAt } from '../src/director/inputs.ts'
import { leafBroadening, leafCount, leafElevation, leafLateGrowth, leafLength, usePlant } from '../src/plant/growth.ts'

const start = config.segments[config.segments.length - 1].start
const first = Math.round(start * config.film.fps)
const last = Math.round(config.film.durationSeconds * config.film.fps)
const timeOf = (f: number): number => f / config.film.fps
const plants = [0, 1, 7]

test('up to the wide shot every leaf is as long and stands as it did', () => {
  let length = 0
  let angle = 0
  for (const v of plants) {
    usePlant(v)
    for (let f = 0; f <= first; f++) {
      const t = timeOf(f)
      const inputs = plantInputsAt(t)
      for (let i = 0; i < leafCount; i++) {
        length += leafLength(i, t)
        angle += leafElevation(i, t, inputs)
        expect(leafLateGrowth(i, t)).toBe(0)
        expect(leafBroadening(i, t)).toBe(1)
      }
    }
  }
  usePlant(0)
  expect(length).toBeCloseTo(13062.712135027, 6)
  expect(angle).toBeCloseTo(64968.750039, 4)
})

test('in the wide shot no leaf shrinks, narrows or jumps', () => {
  let shrink = 0
  let narrow = 0
  let jump = 0
  let swing = 0
  for (const v of plants) {
    usePlant(v)
    for (let i = 0; i < leafCount; i++) {
      for (let f = first + 1; f <= last; f++) {
        const a = timeOf(f - 1)
        const b = timeOf(f)
        shrink = Math.max(shrink, leafLength(i, a) - leafLength(i, b))
        narrow = Math.max(narrow, leafBroadening(i, a) - leafBroadening(i, b))
        jump = Math.max(jump, leafLength(i, b) / leafLength(i, a) - 1)
        swing = Math.max(swing, Math.abs(leafElevation(i, b, plantInputsAt(b)) - leafElevation(i, a, plantInputsAt(a))))
      }
    }
  }
  usePlant(0)
  expect(shrink).toBeLessThan(1e-12)
  expect(narrow).toBeLessThan(1e-12)
  expect(jump).toBeLessThan(0.012)
  expect(swing).toBeLessThan((0.7 * Math.PI) / 180)
})

test('by the last frame every leaf has filled out', () => {
  usePlant(0)
  for (let i = 0; i < leafCount; i++) {
    const grew = leafLength(i, timeOf(last)) / leafLength(i, start)
    expect(grew).toBeGreaterThan(1.28)
    expect(grew).toBeLessThan(1.66)
    expect(leafBroadening(i, timeOf(last))).toBeCloseTo(1.22, 6)
  }
})
