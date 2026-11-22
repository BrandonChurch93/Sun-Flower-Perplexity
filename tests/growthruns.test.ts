import { describe, expect, it } from 'vitest'
import { config, frameCount } from '../src/config.ts'
import { growthRuns, peakRuns } from '../tools/lib/growthruns.ts'

const per = config.critics.contactSheetFrames

describe('the runs of fastest growth', () => {
  it('finds each rise of a series once, at the window that holds most of it', () => {
    const steps = Array.from({ length: 200 }, (_, i) => (i >= 40 && i < 46 ? 1 : i >= 150 && i < 153 ? 2 : 0))
    const runs = peakRuns(steps, per)
    expect(runs.map((r) => r.change)).toEqual([6, 6])
    expect(runs[0].first + 1).toBeLessThanOrEqual(40)
    expect(runs[0].first + per - 1).toBeGreaterThanOrEqual(45)
    expect(runs[1].first + 1).toBeLessThanOrEqual(150)
    expect(runs[1].first + per - 1).toBeGreaterThanOrEqual(152)
  })

  it('finds nothing in a plant that stands still', () => {
    expect(peakRuns(new Array(100).fill(0), per)).toEqual([])
  })

  it('gives the same runs every time, in film order, inside the film and apart', () => {
    const runs = growthRuns()
    expect(growthRuns()).toEqual(runs)
    for (let i = 0; i < runs.length; i++) {
      expect(runs[i].first).toBeGreaterThanOrEqual(0)
      expect(runs[i].first + per).toBeLessThanOrEqual(frameCount)
      expect(runs[i].change).toBeGreaterThan(0)
      if (i > 0) expect(runs[i].first).toBeGreaterThanOrEqual(runs[i - 1].first + per)
    }
  })

  it('holds the first emergence, a rise of the seedling and the release of the petals', () => {
    const runs = growthRuns()
    const height = runs.filter((r) => r.measure === 'height')
    const opening = runs.filter((r) => r.measure === 'opening')
    expect(height[0].first).toBe(0)
    expect(height.length).toBeGreaterThan(1)
    expect(height[1].first).toBeLessThan(config.segments[0].end * config.film.fps)
    expect(opening.length).toBeGreaterThan(0)
    const bloom = config.segments.find((s) => s.id === 'bloom')
    expect(bloom).toBeDefined()
    if (bloom) for (const run of opening) expect(run.first).toBeGreaterThanOrEqual(bloom.start * config.film.fps)
  })
})
