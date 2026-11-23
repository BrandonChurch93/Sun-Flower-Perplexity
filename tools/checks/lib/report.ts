import fs from 'node:fs'
import path from 'node:path'
import { computeHashes } from '../../lib/hashes.ts'
import { WORK } from '../../lib/paths.ts'

export const OUT = path.join(WORK, 'checks')

export interface Finding { ok: boolean; what: string; expected?: boolean }
export interface Result {
  check: string
  ok: boolean
  // The sentence of Brandon's this check stands for.
  sentence: string
  // What was checked: the film, or a film broken on purpose.
  subject: string
  broken: string | null
  complete: boolean
  findings: Finding[]
  table?: { head: string[]; rows: (string | number)[][] }
  pictures?: { file: string; caption: string }[]
  engineHash: string
  at: string
  data?: unknown
}

export function table(head: string[], rows: (string | number)[][]): string {
  const cells = [head, ...rows].map((r) => r.map(String))
  const widths = head.map((_, i) => Math.max(...cells.map((r) => r[i].length)))
  return cells.map((r) => r.map((c, i) => (i === 0 ? c.padEnd(widths[i]) : c.padStart(widths[i]))).join('  ')).join('\n')
}

export function engineHash(): string {
  return computeHashes().engineHash
}

// Prints a check's result, writes it where the review page reads it, and sets the exit code. A film broken on purpose writes beside the real result, never over it.
export function finish(r: Omit<Result, 'ok' | 'engineHash' | 'at'> & { ok?: boolean }): Result {
  const ok = r.ok ?? r.findings.every((f) => f.ok)
  const result: Result = { ...r, ok, engineHash: engineHash(), at: new Date().toISOString() }
  if (result.table) console.log(table(result.table.head, result.table.rows) + '\n')
  for (const f of result.findings) console.log(`${result.check} · ${f.ok ? (f.expected ? 'expected' : 'ok') : 'FAIL'} · ${f.what}`)
  const verdict = ok ? (result.complete ? 'PASS' : 'PASS SO FAR (not every frame is in yet)') : 'FAIL'
  console.log(`${result.check} · ${verdict} · ${result.subject}`)
  fs.mkdirSync(OUT, { recursive: true })
  const file = path.join(OUT, `${result.check}${result.broken ? `.broken-${result.broken}` : ''}.json`)
  fs.writeFileSync(file, JSON.stringify(result, null, 2) + '\n')
  console.log(`${result.check} · written to ${path.relative(process.cwd(), file)}`)
  process.exitCode = ok ? 0 : 1
  return result
}
