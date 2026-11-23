import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import type { Args } from '../lib/args.ts'
import { at } from '../lib/paths.ts'
import { OUT, table, type Result } from './lib/report.ts'

// Shows that every check fails on a film that breaks its rule. The ones that need no drawing are run here.
// The ones that draw are read from their last run: the commands are in tools/checks/README.md.
// Exits with 1 when a broken film passes a check.
const QUICK: [string, string, string[]][] = [
  ['nights', 'long-night', []],
  ['holds', 'hold-grows', ['--no-pictures']],
  ['holds', 'hold-creeps', ['--no-pictures']],
  ['cues', 'late', []],
  ['cues', 'flash-late', []],
  ['cues', 'hold-short', []],
  ['cues', 'hold-early', []],
  ['cues', 'hold-late', []],
  ['nights', 'picture-quick', []],
  ['nights', 'picture-bounce', []],
  ['nights', 'picture-blink', []],
]
const DRAWN: [string, string][] = [['holds', 'picture-grows'], ['cuts', 'cut'], ['made', 'made'], ['pure', 'dice'], ['pure', 'memory'], ['nights', 'plant-moon'], ['nights', 'plant-wet'], ['script', 'slow-frame'], ['script', 'slow-part']]

export async function run(_args: Args): Promise<void> {
  const rows: (string | number)[][] = []
  let missed = 0
  let waiting = 0
  const line = (check: string, broken: string, ran: string): void => {
    const file = path.join(OUT, `${check}.broken-${broken}.json`)
    if (!fs.existsSync(file)) {
      rows.push([check, broken, 'not run yet', ran, ''])
      return
    }
    const r = JSON.parse(fs.readFileSync(file, 'utf8')) as Result
    // Where the film itself already fails a check, the broken film is caught only by a failure the film does not have.
    const own = path.join(OUT, `${check}.json`)
    const already = new Set(fs.existsSync(own) ? (JSON.parse(fs.readFileSync(own, 'utf8')) as Result).findings.filter((f) => !f.ok).map((f) => f.what) : [])
    // A proof that first has to pass on a film without the fault counts only when it did.
    const control = (r.data as { control?: { ok: boolean } } | undefined)?.control
    const fresh = control && !control.ok ? undefined : r.findings.find((f) => !f.ok && !already.has(f.what))
    // A break that reads the film's frames cannot be judged before they are drawn: it waits, it has neither passed nor been caught.
    const waits = !fresh && !r.complete && !(control && !control.ok)
    if (waits) waiting++
    else if (!fresh) missed++
    rows.push([check, broken, fresh ? 'caught' : waits ? 'waits for frames' : 'NOT CAUGHT', ran, (fresh?.what ?? [...r.findings].reverse().find((f) => f.expected)?.what ?? r.subject).slice(0, 130)])
  }
  for (const [check, broken, extra] of QUICK) {
    spawnSync(process.execPath, ['--import', 'tsx', at('tools', 'checks', 'run.ts'), check, '--break', broken, ...extra], { cwd: at(), stdio: 'ignore' })
    line(check, broken, 'now')
  }
  for (const [check, broken] of DRAWN) line(check, broken, 'read from its last run')
  console.log(table(['check', 'film broken with', 'the check', 'run', 'what it said'], rows))
  console.log(`\nproof · ${missed === 0 ? 'no broken film passes a check' : `${missed} broken films pass a check`}${waiting ? ` · ${waiting} cannot be judged until the film's frames are drawn` : ''}`)
  process.exitCode = missed === 0 ? 0 : 1
}
