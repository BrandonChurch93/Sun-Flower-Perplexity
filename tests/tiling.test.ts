import { describe, expect, it } from 'vitest'
import { missingRanges, tileRanges, type Range } from '../tools/lib/tiling.ts'

describe('joining a unit from parts', () => {
  const whole: Range = [1200, 1559]

  it('accepts parts that cover the unit exactly, in any order', () => {
    const parts: Range[] = []
    for (let a = 1530; a >= 1200; a -= 30) parts.push([a, a + 29])
    const picked = tileRanges(parts, whole)
    expect(picked).not.toBeNull()
    const order = (picked as number[]).map((i) => parts[i])
    expect(order[0]).toEqual([1200, 1229])
    expect(order[order.length - 1]).toEqual([1530, 1559])
    for (let i = 1; i < order.length; i++) expect(order[i][0]).toBe(order[i - 1][1] + 1)
    expect(missingRanges(parts, whole)).toEqual([])
  })

  it('refuses a gap and names it', () => {
    const parts: Range[] = [[1200, 1229], [1260, 1559]]
    expect(tileRanges(parts, whole)).toBeNull()
    expect(missingRanges(parts, whole)).toEqual([[1230, 1259]])
  })

  it('refuses parts that only overlap their way across', () => {
    const parts: Range[] = [[1200, 1300], [1290, 1559]]
    expect(tileRanges(parts, whole)).toBeNull()
  })

  it('refuses a part that runs past the unit', () => {
    expect(tileRanges([[1200, 1600]], whole)).toBeNull()
  })

  it('takes the longer of two parts with the same start and ignores spares', () => {
    const parts: Range[] = [[1200, 1229], [1200, 1379], [1380, 1559], [1230, 1259]]
    expect(tileRanges(parts, whole)).toEqual([1, 2])
  })

  it('names what is missing at both ends', () => {
    expect(missingRanges([[1230, 1500]], whole)).toEqual([[1200, 1229], [1501, 1559]])
    expect(missingRanges([], whole)).toEqual([[1200, 1559]])
  })
})
