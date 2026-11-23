import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import type { Args } from '../lib/args.ts'
import { flag } from '../lib/args.ts'
import { at } from '../lib/paths.ts'
import { OUT, table, type Result } from './lib/report.ts'

// Runs every check on what there is and prints one line for each. Exits with 1 when any check fails.
//   npm run checks -- all              the clock checks, the search of src, and cuts and made on the frames drawn so far
//   npm run checks -- all --draw       also draws: the picture proof of the holds and the twelve frames of pure (a few minutes)
// The whole film is drawn by "npm run checks -- play", which runs for a long time, in the background, and carries on where it stopped.
export async function run(args: Args): Promise<void> {
  const draw = flag(args, 'draw')
  const pass = typeof args.sky === 'string' ? ['--sky', args.sky] : []
  const plan: [string, string[], string][] = [
    ['nights', [], 'nights'],
    ['holds', draw ? pass : ['--no-pictures'], draw ? 'holds' : 'holds.clock'],
    ['cues', [], 'cues'],
    ['cuts', [], 'cuts'],
    ['made', [], 'made'],
    ['pure', draw ? pass : ['--search'], draw ? 'pure' : 'pure.search'],
    ['script', draw ? [] : ['--table'], 'script'],
  ]
  const rows: (string | number)[][] = []
  let failed = 0
  for (const [name, extra, written] of plan) {
    const r = spawnSync(process.execPath, ['--import', 'tsx', at('tools', 'checks', 'run.ts'), name, ...extra], { cwd: at(), stdio: ['ignore', 'pipe', 'inherit'], encoding: 'utf8' })
    const file = path.join(OUT, `${written}.json`)
    const result = fs.existsSync(file) ? (JSON.parse(fs.readFileSync(file, 'utf8')) as Result) : null
    const bad = result?.findings.find((f) => !f.ok)
    if (r.status !== 0) failed++
    rows.push([draw || written === name ? name : `${name}, without drawing`, r.status === 0 ? (result?.complete ? 'PASS' : 'PASS SO FAR') : 'FAIL', (bad ?? result?.findings[0])?.what.slice(0, 150) ?? 'no result written'])
  }
  console.log(table(['check', 'verdict', 'what it found'], rows))
  console.log(`\nchecks · ${failed === 0 ? 'no check fails' : `${failed} of ${plan.length} checks fail`} · each check's whole output: npm run checks -- <name>`)
  process.exitCode = failed === 0 ? 0 : 1
}
