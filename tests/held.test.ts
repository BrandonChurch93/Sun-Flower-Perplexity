import { describe, expect, it } from 'vitest'
import { cutFrames } from '../src/v2/cuts.ts'
import { heldFrames, heldLensAt } from '../src/v2/held.ts'
import { HOLD_FRAMES } from '../src/v2/inputs.ts'

describe('the held lenses', () => {
  it('give every frame of a hold one lens and no other frame any', () => {
    const [frost, storm] = HOLD_FRAMES
    for (let f = 0; f < 3810; f++) {
      const inHold = (f >= frost[0] && f <= frost[1]) || (f >= storm[0] && f <= storm[1])
      expect(heldLensAt(f) >= 0).toBe(inHold)
    }
  })
  it('change only on a cut, and the film camera has one on both sides of the close shots', () => {
    const [frost, storm] = HOLD_FRAMES
    for (let f = frost[0] + 1; f <= frost[1]; f++) expect(heldLensAt(f) !== heldLensAt(f - 1)).toBe(cutFrames.includes(f))
    for (let f = storm[0] + 1; f <= storm[1]; f++) expect(heldLensAt(f)).toBe(heldLensAt(storm[0]))
    expect(heldLensAt(frost[1])).toBe(heldLensAt(frost[0]))
    expect(heldFrames.length).toBe(5)
    expect(heldFrames.flat().length).toBe(frost[1] - frost[0] + 1 + storm[1] - storm[0] + 1)
  })
})
