import fs from 'node:fs'
import { machine } from './browser.ts'
import type { Hashes } from './hashes.ts'

export interface Record_ {
  kind: string
  engineHash: string
  unitHashes: Record<string, string>
  format: string
  tier: string
  assets: string
  diag: string
  browser: string
  machine: ReturnType<typeof machine>
  frames?: number[]
  samples?: number
  seconds?: number
  standIns?: { name: string; units: string[] }[]
  note?: string
  at: string
  [extra: string]: unknown
}

export const recordPath = (file: string): string => `${file}.json`

export function writeRecord(file: string, record: Record_): void {
  fs.writeFileSync(recordPath(file), JSON.stringify(record, null, 2) + '\n')
}

export function readRecord(file: string): Record_ | null {
  const p = recordPath(file)
  if (!fs.existsSync(p) || !fs.existsSync(file)) return null
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8')) as Record_
  } catch {
    return null
  }
}

export interface Wanted { kind: string; format: string; tier: string; assets: string; diag: string; units: string[] }

export function matches(record: Record_ | null, hashes: Hashes, wanted: Wanted): boolean {
  if (!record) return false
  if (record.kind !== wanted.kind || record.format !== wanted.format || record.tier !== wanted.tier || record.assets !== wanted.assets || record.diag !== wanted.diag) return false
  if (record.engineHash !== hashes.engineHash) return false
  for (const unit of wanted.units) if (record.unitHashes[unit] !== hashes.unitHashes[unit]) return false
  return true
}
