import { describe, expect, it } from 'vitest'
import raw from '../config/showcase.json'
import { ConfigError, validateConfig, type Config } from '../src/config.ts'

const copy = (): Config => JSON.parse(JSON.stringify(raw)) as Config
const broken = (change: (c: Config) => void, options = {}) => () => {
  const c = copy()
  change(c)
  validateConfig(c, options)
}

describe('config validation', () => {
  it('accepts the config as committed', () => {
    expect(() => validateConfig(copy(), { imageExists: () => true })).not.toThrow()
  })

  it('fails when a top level key is missing', () => {
    expect(broken((c) => delete (c as Partial<Config>).seed)).toThrow(ConfigError)
    expect(broken((c) => delete (c as Partial<Config>).segments)).toThrow(/"segments" is missing/)
  })

  it('fails when a nested key is missing', () => {
    expect(broken((c) => delete (c.film as Partial<Config['film']>).fps)).toThrow(/film\.fps/)
    expect(broken((c) => delete (c.budget as Partial<Config['budget']>).runHours)).toThrow(/budget\.runHours/)
    expect(broken((c) => delete (c.tiers as Partial<Config['tiers']>).final)).toThrow(/tiers\.final/)
  })

  it('fails when the segments do not start at 0', () => {
    expect(broken((c) => (c.segments[0].start = 1))).toThrow(/do not start at 0/)
  })

  it('fails on a gap between segments', () => {
    expect(broken((c) => (c.segments[1].start += 1))).toThrow(/gap/)
  })

  it('fails on an overlap between segments', () => {
    expect(broken((c) => (c.segments[1].start -= 1))).toThrow(/overlaps/)
  })

  it('fails when a segment boundary is not on a whole frame', () => {
    expect(
      broken((c) => {
        const shift = 0.4 / c.film.fps
        c.segments[0].end += shift
        c.segments[1].start += shift
      }),
    ).toThrow(/not on a whole frame/)
  })

  it('fails when a key time is not on a whole frame', () => {
    expect(broken((c) => (c.keys[0].time += 0.4 / c.film.fps))).toThrow(/key "[^"]+" is not on a whole frame/)
  })

  it('fails when the last segment does not end at the film length', () => {
    expect(broken((c) => (c.segments[c.segments.length - 1].end -= 1))).toThrow(/does not end at growth\.seconds/)
    expect(broken((c) => (c.growth.seconds += 1))).toThrow(/does not end at growth\.seconds/)
  })

  it('fails when a key lies outside the segment of its unit', () => {
    expect(
      broken((c) => {
        const seg = c.segments.find((s) => s.id === c.keys[0].unit)
        c.keys[0].time = (seg as Config['segments'][number]).end
      }),
    ).toThrow(/outside the segment/)
  })

  it('fails when the phase boxes do not add up to the run hours', () => {
    expect(broken((c) => (c.budget.runHours += 1))).toThrow(/does not add up/)
    expect(broken((c) => (c.budget.phaseHours['0'] += 0.5))).toThrow(/does not add up/)
  })

  it('fails when an approved image is missing', () => {
    const missing = copy().keys[2].image
    expect(broken(() => undefined, { imageExists: (p: string) => p !== missing })).toThrow(/approved image/)
  })

  it('treats "settled" as optional and checks its shape', () => {
    expect(broken((c) => c.keys.forEach((k) => delete k.settled))).not.toThrow()
    expect(broken((c) => ((c.keys[0] as unknown as { settled: unknown }).settled = 'one line'))).toThrow(/settled/)
  })

  it('fails when a segment names a world that does not exist', () => {
    expect(broken((c) => (c.segments[0].world = 'nowhere'))).toThrow(/unknown world/)
  })

  it('fails when the plant would shrink', () => {
    expect(broken((c) => (c.plant.heightM[3][1] = 0))).toThrow(/never fall/)
  })
})
