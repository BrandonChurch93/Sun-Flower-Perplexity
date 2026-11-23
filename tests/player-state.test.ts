import { describe, expect, it } from 'vitest'
import { stateText, summarize, type StateRow } from '../src/player/state.ts'

const row = (frame: number, plant: number, field: number, bytes: number): StateRow => ({
  frame,
  ms: plant + field + 1,
  bytes,
  writes: 2,
  byOwner: { plant: { ms: plant, bytes, writes: 2 }, field: { ms: field, bytes: 0, writes: 0 }, director: { ms: 1, bytes: 0, writes: 0 } },
})

describe('the script cost of a stretch with nothing drawn', () => {
  const report = summarize([row(10, 4, 2, 1000), row(11, 40, 2, 3000), row(12, 4, 8, 2000)], { from: 10, to: 12, tier: 'draft', format: '1920 x 1080', quality: 'high' })

  it('gives each owner its mean, its worst frame and its bytes', () => {
    const plant = report.owners.find((o) => o.owner === 'plant')
    expect(plant?.meanMs).toBeCloseTo(16)
    expect(plant?.worstMs).toBe(40)
    expect(plant?.worstAtFrame).toBe(11)
    expect(plant?.meanBytes).toBeCloseTo(2000)
    expect(plant?.worstBytes).toBe(3000)
    const field = report.owners.find((o) => o.owner === 'field')
    expect(field?.worstAtFrame).toBe(12)
    expect(field?.meanBytes).toBe(0)
  })

  it('lists the owners from the dearest down and counts the frames over one frame of time', () => {
    expect(report.owners.map((o) => o.owner)).toEqual(['plant', 'field', 'director'])
    expect(report.script.worstMs).toBe(43)
    expect(report.script.worstAtFrame).toBe(11)
    expect(report.overFrame).toBe(1)
    expect(report.frames).toBe(3)
  })

  it('reads as a table with one line for each owner', () => {
    const lines = stateText(report).split('\n')
    expect(lines[0]).toContain('frames 10 to 12')
    expect(lines.filter((l) => /^(script|plant|field|director) /.test(l))).toHaveLength(4)
    expect(lines[lines.length - 1]).toContain('1 of 3 frames')
  })
})
