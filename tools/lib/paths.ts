import { fileURLToPath } from 'node:url'
import path from 'node:path'

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
export const at = (...parts: string[]) => path.join(ROOT, ...parts)
export const WORK = at('out', 'work')
// Version 2 keeps its own clock and its own memory. Version 1's stay where they were, as the record of that build.
export const CLOCK_FILE = at('kit', 'v2', 'CLOCK.json')
export const PROGRESS_FILE = at('kit', 'v2', 'PROGRESS.md')
