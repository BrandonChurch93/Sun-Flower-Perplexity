import { describe, expect, it } from 'vitest'
import { lagOf } from '../src/capture/sound.ts'

const RATE = 8000

function noise(length: number): Float32Array {
  const out = new Float32Array(length)
  let x = 12345
  for (let i = 0; i < length; i++) {
    x = (x * 1103515245 + 12345) & 0x7fffffff
    out[i] = (x / 0x7fffffff - 0.5) * (i > 3 * RATE && i < 5 * RATE ? 1 : 0.05)
  }
  return out
}

describe('where the sound of a file sits against the track', () => {
  const track = noise(8 * RATE)
  const first = RATE

  it('finds no lag when the file holds the stretch as it is', () => {
    expect(lagOf(track, track.subarray(first), first, RATE)).toMatchObject({ lag: 0 })
  })

  it('measures a sound that an encoder has delayed, and one that comes early', () => {
    const delay = Math.round(0.044 * RATE)
    const late = new Float32Array(6 * RATE)
    late.set(track.subarray(first, first + late.length - delay), delay)
    const found = lagOf(track, late, first, RATE)
    expect(found?.lag).toBe(delay)
    expect(found?.match).toBeGreaterThan(0.99)
    expect(lagOf(track, track.subarray(first + 40), first, RATE)?.lag).toBe(-40)
  })

  it('says nothing about silence', () => {
    expect(lagOf(new Float32Array(8 * RATE), new Float32Array(6 * RATE), first, RATE)).toBeNull()
  })
})
