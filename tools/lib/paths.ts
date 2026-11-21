import { fileURLToPath } from 'node:url'
import path from 'node:path'

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
export const at = (...parts: string[]) => path.join(ROOT, ...parts)
export const WORK = at('out', 'work')
export const CLOCK_FILE = at('kit', 'CLOCK.json')
export const PROGRESS_FILE = at('kit', 'PROGRESS.md')
