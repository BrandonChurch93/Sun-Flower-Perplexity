import fs from 'node:fs'
import { at } from '../../lib/paths.ts'

// The hard cuts the film means, by the frame each lands on. The Builder lists them in tools/checks/limits.json under `cuts`.
// They are not read from the film, so the film cannot excuse a cut of its own: a cut one frame beside a listed one is a hard cut.
export function meantCuts(): number[] {
  const all = JSON.parse(fs.readFileSync(at('tools', 'checks', 'limits.json'), 'utf8')) as { cuts?: number[] }
  return [...(all.cuts ?? [])].sort((a, b) => a - b)
}
