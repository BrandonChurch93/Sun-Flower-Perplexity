import { afterEach, describe, expect, it } from 'vitest'
import { config } from '../src/config.ts'
import { leafCount, leafDroop, leafElevation, leafLength, setLeafHold, usePlant, type LeafHold, type PlantInputs } from '../src/plant/growth.ts'

const NEIGHBOR = 77
const OTHER = 41
const RAD = Math.PI / 180
const frost = config.keys.find((k) => k.id === 'frost')!.time
const bloom = config.plant.stages.bloom[0]
const last = config.plant.stages.bloom[1]
const STEP = 0.25
const airs: PlantInputs[] = [
  { leanX: 0, leanZ: 0, lift: 1, wind: 0 },
  { leanX: 0.1, leanZ: -0.05, lift: 0.3, wind: 0.6 },
]
const hold: Required<LeafHold> = { droop: 0.05, elevationDeg: 12, liftDeg: 7, lengthScale: 1.6 }

// Every number the holds can touch, for one plant from one time to another.
function numbers(variant: number, from: number, to: number): Float64Array {
  const out: number[] = []
  usePlant(variant)
  for (let time = from; time <= to; time += STEP) {
    for (let i = 0; i < leafCount; i++) {
      out.push(leafLength(i, time))
      for (const air of airs) out.push(leafElevation(i, time, air), leafDroop(i, air, time))
    }
  }
  usePlant(0)
  return Float64Array.from(out)
}

const same = (a: Float64Array, b: Float64Array): boolean => a.length === b.length && a.every((v, k) => Object.is(v, b[k]))
const holdAll = (variant: number, to: LeafHold | null): void => { for (let i = 0; i < leafCount; i++) setLeafHold(variant, i, to) }

afterEach(() => holdAll(NEIGHBOR, null))

describe('a leaf held by hand', () => {
  it('never changes the plant itself, bit for bit, at any time', () => {
    const before = numbers(0, 0, last + 10)
    holdAll(NEIGHBOR, hold)
    expect(same(numbers(0, 0, last + 10), before)).toBe(true)
    expect(() => setLeafHold(0, 3, hold)).toThrow()
  })

  it('changes nothing of the held neighbor up to the frost key', () => {
    const before = numbers(NEIGHBOR, 0, frost)
    holdAll(NEIGHBOR, hold)
    expect(same(numbers(NEIGHBOR, 0, frost), before)).toBe(true)
    expect(same(numbers(NEIGHBOR, 0, last), numbers(OTHER, 0, last))).toBe(false)
  })

  it('leaves the other leaves and the other neighbors as they were', () => {
    const before = numbers(NEIGHBOR, 0, last)
    const other = numbers(OTHER, 0, last)
    setLeafHold(NEIGHBOR, 20, hold)
    const after = numbers(NEIGHBOR, 0, last)
    const per = 1 + airs.length * 2
    let changed = 0
    for (let k = 0; k < before.length; k++) {
      const leaf = Math.floor(k / per) % leafCount
      if (leaf !== 20) expect(Object.is(after[k], before[k])).toBe(true)
      else if (!Object.is(after[k], before[k])) changed++
    }
    expect(changed).toBeGreaterThan(0)
    expect(same(numbers(OTHER, 0, last), other)).toBe(true)
  })

  it('is fully on when the bloom begins and comes on without a step', () => {
    usePlant(NEIGHBOR)
    const air = airs[0]
    const free = { length: leafLength(20, bloom), up: leafElevation(20, bloom, air) }
    setLeafHold(NEIGHBOR, 20, hold)
    expect(leafLength(20, bloom)).toBeCloseTo(free.length * hold.lengthScale, 12)
    expect(leafDroop(20, air, bloom)).toBeCloseTo(hold.droop, 12)
    expect(leafElevation(20, bloom, air)).toBeCloseTo((hold.elevationDeg + hold.liftDeg) * RAD, 12)
    setLeafHold(NEIGHBOR, 20, { liftDeg: hold.liftDeg })
    expect(leafElevation(20, bloom, air)).toBeCloseTo(free.up + hold.liftDeg * RAD, 12)
    setLeafHold(NEIGHBOR, 20, hold)
    let step = 0
    for (let time = frost; time < bloom; time += 1 / config.film.fps) {
      step = Math.max(step, Math.abs(leafElevation(20, time + 1 / config.film.fps, air) - leafElevation(20, time, air)) / RAD)
    }
    expect(step).toBeLessThan(0.2)
    usePlant(0)
  })

  it('lets go when the hold is taken away', () => {
    const before = numbers(NEIGHBOR, 0, last)
    setLeafHold(NEIGHBOR, 20, hold)
    setLeafHold(NEIGHBOR, 20, null)
    expect(same(numbers(NEIGHBOR, 0, last), before)).toBe(true)
  })
})
