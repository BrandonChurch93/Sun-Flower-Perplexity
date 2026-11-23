import { describe, expect, it } from 'vitest'
import { clipFilter, filmNote, pictureFile, rateFor } from './film.ts'

describe('the drawn film on the review page', () => {
  it('says what the file holds', () => {
    expect(filmNote({ width: 1920, height: 1080, frames: 3810, audio: 0 }, 3810, 'draft')).toBe('3,810 of 3,810 frames, drawn at 1920 x 1080, draft tier')
    expect(filmNote({ width: 1920, height: 1080, frames: 3800, audio: 0 }, 3810, 'draft')).toContain('The last 10 frames are not in the file')
  })
  it('cuts a clip by frame numbers', () => {
    expect(clipFilter(849, 1259, 30, 960)).toBe("select='between(n\\,849\\,1259)',setpts=N/(30*TB),scale='min(960,iw)':-2")
  })
  it('gives the film what the rest of the site leaves', () => {
    expect(rateFor(400 * 1048576, 150 * 1048576, 127)).toBeGreaterThan(15000)
    expect(rateFor(400 * 1048576, 150 * 1048576, 127) * 1000 * 127 / 8).toBeLessThan(250 * 1048576)
    expect(rateFor(400 * 1048576, 500 * 1048576, 127)).toBe(0)
  })
  it('finds a picture named by another machine', () => {
    const there = new Set(['/here/out/work/checks/numbers/film.7/a.png', '/here/out/work/checks/script.svg'])
    const exists = (f: string): boolean => there.has(f)
    expect(pictureFile('/far/repo/out/work/checks/numbers/film.7/a.png', '/here/out/work/checks/numbers.json', '/here/out/work/checks', exists)).toBe('/here/out/work/checks/numbers/film.7/a.png')
    expect(pictureFile('/far/elsewhere/script.svg', '/here/out/work/checks/script.json', '/here/out/work/checks', exists)).toBe('/here/out/work/checks/script.svg')
    expect(pictureFile('/far/gone.png', '/here/out/work/checks/script.json', '/here/out/work/checks', exists)).toBeNull()
  })
})
