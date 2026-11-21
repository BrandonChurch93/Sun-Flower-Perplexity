import fs from 'node:fs'
import path from 'node:path'
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

export async function keyComparisons(_unit: string, _options: { render: boolean }): Promise<{ file: string; caption: string }[]> {
  return []
}
