import { expect, test } from 'vitest'
import { heightAt, leafCount, leafLength, leafStemFraction } from '../src/plant/growth.ts'

const jointsAt = (frame: number): number[] => {
  const t = frame / 30
  const out: number[] = []
  for (let i = 0; i < leafCount; i++) if (leafLength(i, t) > 0) out.push(leafStemFraction(i, t) * heightAt(t))
  return out
}

test('at night the youngest leaves stand crowded under the tip', () => {
  const top = heightAt(26)
  expect(jointsAt(780).filter((y) => top - y < 0.12).length).toBeGreaterThanOrEqual(5)
})

test('no joint ever sinks', () => {
  const last: number[] = []
  let drop = 0
  for (let f = 0; f <= 1800; f++) {
    const t = f / 30
    for (let i = 0; i < leafCount; i++) {
      if (leafLength(i, t) <= 0) continue
      const y = leafStemFraction(i, t) * heightAt(t)
      if (last[i] !== undefined) drop = Math.max(drop, last[i] - y)
      last[i] = y
    }
  }
  expect(drop).toBeLessThan(1e-9)
})

test('the joints in the rain key and from 40 s on are where they were', () => {
  expect(jointsAt(420).reduce((a, b) => a + b, 0)).toBeCloseTo(1.613099288679, 9)
  let sum = 0
  for (let f = 1200; f <= 1800; f++) sum += jointsAt(f).reduce((a, b) => a + b, 0)
  expect(sum).toBeCloseTo(11229.864353815, 6)
})
