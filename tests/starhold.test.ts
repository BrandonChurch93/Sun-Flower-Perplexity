import { expect, test } from 'vitest'
import { STAR_HOLD, starHoldAt } from '../src/sky/night/index.ts'

test('the starlight is whole until the dusk has gone and gives the rise back below it', () => {
  expect(starHoldAt(0)).toBe(1)
  expect(starHoldAt(STAR_HOLD.from)).toBe(1)
  expect(starHoldAt(STAR_HOLD.to)).toBeCloseTo(1 / (1 + STAR_HOLD.rise), 12)
  expect(starHoldAt(-40)).toBeCloseTo(1 / (1 + STAR_HOLD.rise), 12)
})

test('the starlight never rises as the sun sinks and never steps', () => {
  let before = starHoldAt(-10)
  for (let el = -10; el >= -15; el -= 0.01) {
    const hold = starHoldAt(el)
    expect(hold).toBeLessThanOrEqual(before + 1e-12)
    expect(before - hold).toBeLessThan(0.004)
    before = hold
  }
})
