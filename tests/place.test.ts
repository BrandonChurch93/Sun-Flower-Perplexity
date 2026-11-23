import { describe, expect, it } from 'vitest'
import { checkPlace } from '../src/place/check.ts'

describe('the place', () => {
  it('keeps its own rules', () => {
    for (const r of checkPlace()) expect(r.ok, `${r.name}: ${r.detail}`).toBe(true)
  })
})
