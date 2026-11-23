import { describe, expect, it } from 'vitest'
import { lunarShutter, quickMoonFrames } from './moon.ts'

describe('quick-night lunar shutter', () => {
  it('selects only complete quick nights, not a film boundary or long hold', () => {
    const elevation = new Float32Array([
      -4, -4, 0, 0, -4, -5, 0, -6, -4, -8, -5, -4, 0, -4,
    ])
    expect(quickMoonFrames(elevation, 3)).toEqual([[4, 5]])
  })

  it('removes a one-frame dropout symmetrically without changing a distant level', () => {
    const input = new Float32Array(31).fill(1)
    input[15] = 0
    const output = new Float32Array(31)
    lunarShutter(input, output, 0, 30)
    expect(output[0]).toBe(1)
    expect(output[30]).toBe(1)
    expect(output[13]).toBe(output[17])
    expect((output[13] - output[15]) * 255).toBeLessThan(12)
  })
})
