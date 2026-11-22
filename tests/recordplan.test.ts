import { describe, expect, it } from 'vitest'
import { segments } from '../src/director/timeline.ts'
import { FILM, FILM_CRITICS, recordSelection, subPacks, UNIT_CRITICS } from '../tools/lib/recordplan.ts'

const units = segments.map((s) => s.id)

describe('the packs of the record round', () => {
  it('holds every unit and the whole film, with one jury only', () => {
    const all = recordSelection()
    expect(all.map((s) => s.name)).toEqual([...units, FILM])
    expect(all).toEqual(subPacks())
    for (const sub of all.filter((s) => s.unit !== null)) {
      expect(sub.critics).toEqual(UNIT_CRITICS)
      expect(sub.critics).not.toContain('R2')
    }
    expect(all[all.length - 1]).toEqual({ name: FILM, unit: null, critics: FILM_CRITICS })
    expect(all.filter((s) => s.critics.includes('R2')).map((s) => s.name)).toEqual([FILM])
    expect(new Set(all.flatMap((s) => s.critics))).toEqual(new Set(['R1', 'R2', 'R3', 'R4', 'R5', 'R6', 'R7']))
  })

  it('selects sub packs by name, by name and critic, and by critic', () => {
    const first = units[0]
    expect(recordSelection([first])).toEqual([{ name: first, unit: first, critics: UNIT_CRITICS }])
    expect(recordSelection([FILM])).toEqual([{ name: FILM, unit: null, critics: FILM_CRITICS }])
    expect(recordSelection([`${first}:R4`, `${FILM}:R7`])).toEqual([{ name: first, unit: first, critics: ['R4'] }, { name: FILM, unit: null, critics: ['R7'] }])
    expect(recordSelection(['R4']).map((s) => s.name)).toEqual([...units, FILM])
    expect(recordSelection(['R4']).every((s) => s.critics.length === 1 && s.critics[0] === 'R4')).toBe(true)
    expect(recordSelection(['R6'])).toEqual([{ name: FILM, unit: null, critics: ['R6'] }])
  })

  it('gives the same selection in any order and any case', () => {
    const first = units[0]
    const a = recordSelection([`${FILM}:R2`, `${first}:R3`, `${first}:R1`, `${FILM}:R5`])
    const b = recordSelection([`${first.toUpperCase()}:r1`, `${FILM.toUpperCase()}:R5`, `${first}:R3`, `${FILM}:r2`, `${first}:R1`])
    expect(a).toEqual(b)
    expect(a).toEqual([{ name: first, unit: first, critics: ['R1', 'R3'] }, { name: FILM, unit: null, critics: ['R5', 'R2'] }])
  })

  it('refuses what the record round does not build', () => {
    expect(() => recordSelection([`${units[0]}:R2`])).toThrow()
    expect(() => recordSelection([`${FILM}:R1`])).toThrow()
    expect(() => recordSelection(['nowhere'])).toThrow()
    expect(() => recordSelection(['R9'])).toThrow()
    expect(() => recordSelection([`${units[0]}:R4:R1`])).toThrow()
  })
})
