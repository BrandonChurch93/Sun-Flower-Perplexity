import fs from 'node:fs'
import { cutFrames } from '../../../src/v2/cuts.ts'
import { at } from '../../lib/paths.ts'
import type { Finding } from './report.ts'

// The hard cuts the film means, by the frame each lands on: the first frame of each new shot. The Builder lists them in tools/checks/limits.json under `cuts`.
// The film's own list is src/v2/cuts.ts. The checks leave out the frames of the Builder's list and hold the film's list to it,
// so neither can drift from the other and the film cannot excuse a cut of its own by adding it to its list.
export function meantCuts(): number[] {
  const all = JSON.parse(fs.readFileSync(at('tools', 'checks', 'limits.json'), 'utf8')) as { cuts?: number[] }
  return [...(all.cuts ?? [])].sort((a, b) => a - b)
}

export function sameCuts(listed: number[] = meantCuts()): Finding {
  const film = [...cutFrames].sort((a, b) => a - b)
  const ok = film.length === listed.length && film.every((f, i) => f === listed[i])
  return {
    ok,
    what: ok
      ? `the film's own list of cuts (src/v2/cuts.ts) is the list the checks leave out (tools/checks/limits.json): ${listed.length ? `frames ${listed.join(', ')}` : 'no cut at all'}`
      : `the film's own list of cuts (src/v2/cuts.ts) is ${film.length ? `frames ${film.join(', ')}` : 'empty'} and the list the checks leave out (tools/checks/limits.json) is ${listed.length ? `frames ${listed.join(', ')}` : 'empty'}: one of them has drifted`,
  }
}
