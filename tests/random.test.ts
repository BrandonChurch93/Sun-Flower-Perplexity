import { describe, expect, it } from 'vitest'
import { Random, hash01, stream, streamSeed } from '../src/core/random.ts'

const take = (r: Random, n: number) => Array.from({ length: n }, () => r.next())

describe('seeded random', () => {
  it('gives the same values for the same seed and stream', () => {
    expect(take(stream('leaves'), 64)).toEqual(take(stream('leaves'), 64))
    expect(take(new Random(7), 64)).toEqual(take(new Random(7), 64))
  })

  it('gives different values for another stream or another seed', () => {
    expect(take(stream('leaves'), 8)).not.toEqual(take(stream('rain'), 8))
    expect(take(stream('leaves', 1), 8)).not.toEqual(take(stream('leaves', 2), 8))
    expect(streamSeed('leaves')).not.toBe(streamSeed('rain'))
  })

  it('stays inside zero to one and covers it', () => {
    const values = take(stream('cover'), 4000)
    expect(Math.min(...values)).toBeGreaterThanOrEqual(0)
    expect(Math.max(...values)).toBeLessThan(1)
    const bins = new Array(10).fill(0)
    for (const v of values) bins[Math.floor(v * 10)]++
    for (const b of bins) expect(b).toBeGreaterThan(300)
  })

  it('hashes without state', () => {
    expect(hash01(5, 3, 2)).toBe(hash01(5, 3, 2))
    expect(hash01(5, 3, 2)).not.toBe(hash01(5, 3, 3))
  })
})
