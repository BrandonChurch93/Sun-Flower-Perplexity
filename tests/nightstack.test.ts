import { expect, test } from 'vitest'
import { config } from '../src/config.ts'
import { heightAt, leafAge, leafCount, leafStemFraction, usePlant } from '../src/plant/growth.ts'

const fps = config.film.fps
const bloom = Math.round(config.segments.find((s) => s.id === 'bloom')!.start * fps)
const last = Math.round(config.growth.seconds * fps)
const night = config.keys.find((key) => key.id === 'night')!.time
const plants = [0, 1, 7]
const jointAt = (i: number, t: number): number => leafStemFraction(i, t) * heightAt(t)

test('in the night the leaves stand in a close stack under the bud', () => {
  usePlant(0)
  const top = heightAt(night)
  const joints: number[] = []
  for (let i = 0; i < leafCount; i++) if (leafAge(i, night) > 0 && jointAt(i, night) > top - 0.36) joints.push(jointAt(i, night))
  expect(joints.length).toBeGreaterThanOrEqual(9)
  for (let k = 1; k < joints.length; k++) expect(joints[k] - joints[k - 1]).toBeLessThan(0.085)
})

test('from the night to the frost the youngest leaves stand crowded under the bud', () => {
  usePlant(0)
  const frost = config.keys.find((key) => key.id === 'frost')!.time
  const near = (t: number, reach: number): number => {
    let count = 0
    for (let i = 0; i < leafCount; i++) if (leafAge(i, t) > 0 && jointAt(i, t) > heightAt(t) - reach) count++
    return count
  }
  expect(near(night, 0.08)).toBeGreaterThanOrEqual(5)
  expect(near(frost, 0.075)).toBeGreaterThanOrEqual(4)
  for (let f = Math.round(20 * fps); f <= Math.round(frost * fps); f++) for (let i = 1; i < leafCount; i++) if (leafAge(i, f / fps) > 0) expect(jointAt(i, f / fps)).toBeGreaterThanOrEqual(jointAt(i - 1, f / fps) - 1e-9)
})

test('no joint ever sinks on the stem', () => {
  for (const v of plants) {
    usePlant(v)
    for (let i = 0; i < leafCount; i++) {
      let before = 0
      for (let f = 0; f <= last; f++) {
        const t = f / fps
        if (leafAge(i, t) <= 0) continue
        const y = jointAt(i, t)
        expect(y).toBeGreaterThanOrEqual(before - 1e-9)
        before = y
      }
    }
  }
  usePlant(0)
})

test('from the bloom on every joint stands where it stood', () => {
  let sum = 0
  for (const v of plants) {
    usePlant(v)
    for (let f = bloom; f <= last; f += 15) for (let i = 0; i < leafCount; i++) sum += leafStemFraction(i, f / fps)
  }
  usePlant(0)
  expect(sum).toBeCloseTo(1285.290266978, 6)
})
