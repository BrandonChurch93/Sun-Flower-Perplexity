import fs from 'node:fs'
import path from 'node:path'
import { keys } from '../../src/director/timeline.ts'
import { comparePair, pairIsCurrent, pairPath } from '../compare.ts'
import { WORK } from './paths.ts'

export function renderSlotBusy(): boolean {
  const lock = path.join(WORK, 'render.lock')
  if (!fs.existsSync(lock)) return false
  try {
    const pid = Number(fs.readFileSync(lock, 'utf8').trim().split(/\s+/)[0])
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

export async function keyComparisons(unit: string, options: { render: boolean }): Promise<{ file: string; caption: string }[]> {
  const out: { file: string; caption: string }[] = []
  for (const key of keys.filter((k) => k.unit === unit)) {
    let file = pairPath(key.id, 'review')
    if (!pairIsCurrent(key.id, 'review')) {
      if (!options.render) continue
      file = await comparePair(key.id, 'review')
    }
    out.push({ file, caption: `Key ${key.id}: the approved image (left) beside the film frame at ${key.time} s (right)` })
  }
  return out
}
