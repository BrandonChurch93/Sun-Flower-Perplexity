import { describe, expect, it } from 'vitest'
import { config } from '../src/config.ts'
import { cuts, judgedFrames, keys } from '../src/director/timeline.ts'
import { fileCounts, FILM_SHEETS, HOOK_FILES, hookFrames, juryFrames, KEYS_PER_FILE, keysInOrder } from '../tools/lib/filmplan.ts'

describe('the packs of the whole film round', () => {
  it('shows frame 0 and an even spread across the hook', () => {
    const frames = hookFrames()
    const last = config.film.hookSeconds * config.film.fps
    expect(frames).toHaveLength(HOOK_FILES)
    expect(frames[0]).toBe(0)
    expect(frames[frames.length - 1]).toBe(last)
    frames.forEach((f, i) => expect(Math.abs(f - (i * last) / (HOOK_FILES - 1))).toBeLessThanOrEqual(0.5))
    expect(frames).toEqual([0, 8, 15, 23, 30, 38, 45, 53, 60])
  })

  it('shows every judged frame to the jury once', () => {
    const frames = juryFrames()
    expect(frames).toEqual(judgedFrames().map((j) => j.frame))
    expect(new Set(frames).size).toBe(frames.length)
    expect(frames).toHaveLength(10)
    for (const key of keys) expect(frames).toContain(key.frame)
  })

  it('shows the keys in film order', () => {
    const ordered = keysInOrder()
    expect(ordered).toHaveLength(keys.length)
    expect(ordered).toHaveLength(8)
    for (let i = 1; i < ordered.length; i++) expect(ordered[i].frame).toBeGreaterThan(ordered[i - 1].frame)
    expect(ordered.map((k) => k.id).sort()).toEqual(keys.map((k) => k.id).sort())
  })

  it('keeps every folder within the file limit', () => {
    const counts = fileCounts()
    expect(counts).toEqual({ R5: FILM_SHEETS + Math.ceil(keys.length / KEYS_PER_FILE), R6: HOOK_FILES, R7: 2 * config.quality.stress.units.length, R4: cuts.length + FILM_SHEETS, R2: judgedFrames().length })
    expect(counts).toEqual({ R5: 5, R6: 9, R7: 8, R4: 7, R2: 10 })
    for (const n of Object.values(counts)) expect(n).toBeLessThanOrEqual(config.critics.maxFilesPerMessage)
  })
})
