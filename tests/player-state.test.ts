import { describe, expect, it } from 'vitest'
import { inOrder, longestOver, overText, stateText, summarize, type StateRow } from '../src/player/state.ts'

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
    expect(lines.filter((l) => /^(script|plant|field|director) +\d/.test(l))).toHaveLength(4)
    expect(lines.some((l) => l.includes('1 of 3 frames'))).toBe(true)
    expect(report.stretches).toHaveLength(1)
    expect(report.stretches[0]).toMatchObject({ from: 0, to: 29, frames: 3, worstAtFrame: 11 })
    expect(lines[lines.length - 1]).toContain('frames 0 to 29')
  })

  it('names the longest row of frames that each took more script than one frame of time', () => {
    expect(report.overRun).toEqual({ from: 11, to: 11, frames: 1 })
    expect(overText(report)).toBe('1 of 3 frames, the longest run of them one frame, 11')
    const rows = [5, 40, 40, 5, 40, 40, 40, 5].map((ms, i) => row(100 + i, ms, 0, 0))
    expect(longestOver(rows)).toEqual({ from: 104, to: 106, frames: 3 })
    expect(longestOver([row(1, 40, 0, 0), row(3, 40, 0, 0)])).toEqual({ from: 1, to: 1, frames: 1 })
    expect(longestOver([row(1, 2, 0, 0)])).toBeNull()
    const long = summarize(rows, { from: 100, to: 107, tier: 'draft', format: '1920 x 1080', quality: 'high' })
    expect(stateText(long)).toContain('5 of 8 frames, the longest run of them 3 in a row, frames 104 to 106')
  })

  it('keeps the owners in one order whatever they cost, so two runs lie side by side', () => {
    expect(inOrder(['director', 'rain', 'sending', 'field', 'plant', 'fog', 'renderer', 'companion'])).toEqual(['plant', 'companion', 'field', 'fog', 'rain', 'renderer', 'sending', 'director'])
    const lines = stateText(report).split('\n')
    const at = (name: string): number => lines.findIndex((l) => l.startsWith(name))
    expect(at('plant')).toBeLessThan(at('field'))
    expect(at('field')).toBeLessThan(at('director'))
  })

  it('says what the run made and keeps really drawn pictures out of the script', () => {
    expect(stateText(report)).toContain('made on the graphics card during the run: nothing')
    const drawn = summarize([{ ...row(10, 4, 2, 0), drawnMs: 6 }, { ...row(11, 4, 2, 0), drawnMs: 2 }], { from: 10, to: 11, tier: 'draft', format: '1920 x 1080', quality: 'high' }, true, 3)
    expect(drawn.drawnMs).toEqual({ mean: 4, worst: 6, worstAtFrame: 10 })
    expect(drawn.script.worstMs).toBe(7)
    expect(stateText(drawn)).toContain('made on the graphics card during the run: 3 things')
    expect(stateText(drawn)).toContain('not in the sums')
  })
})
