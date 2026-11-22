import { config } from '../../src/config.ts'
import { cuts, judgedFrames, keys, type TimedKey } from '../../src/director/timeline.ts'

export const FILM_SHEETS = 3
export const HOOK_FILES = 9
export const KEYS_PER_FILE = 4
export const STRESS_PLACES = 3

export function hookFrames(): number[] {
  const last = Math.round(config.film.hookSeconds * config.film.fps)
  return Array.from({ length: HOOK_FILES }, (_, i) => Math.round((i * last) / (HOOK_FILES - 1)))
}

export function keysInOrder(): TimedKey[] {
  return [...keys].sort((a, b) => a.frame - b.frame)
}

export function juryFrames(): number[] {
  return judgedFrames().map((j) => j.frame)
}

export function fileCounts(): Record<string, number> {
  return {
    R5: FILM_SHEETS + Math.ceil(keys.length / KEYS_PER_FILE),
    R6: HOOK_FILES,
    R7: 2 * config.quality.stress.units.length,
    R4: cuts.length + FILM_SHEETS,
    R2: judgedFrames().length,
  }
}
