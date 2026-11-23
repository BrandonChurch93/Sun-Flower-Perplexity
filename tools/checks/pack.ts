import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { type Args, str } from '../lib/args.ts'
import { engineHash, OUT } from './lib/report.ts'
import { pictureFile } from './review/film.ts'

// One tar of what the review page reads from the checks: each result, the runs on films broken on purpose, the other runs of the same check, and every picture they name.
// Unpacked at the root of the repo on another machine it puts them where "npm run checks -- review" looks.
//   npm run checks -- pack                               holds, nights, cuts, made, script, cues, pure into out/work/checks-results.tar
//   npm run checks -- pack --checks holds,cues --to file.tar
const CHECKS = 'holds,nights,cuts,made,script,cues,pure'

export function packed(names: string[], files: string[]): string[] {
  return files.filter((f) => f.endsWith('.json') && names.some((n) => f === `${n}.json` || f.startsWith(`${n}.`))).sort()
}

export async function run(args: Args): Promise<void> {
  const names = str(args, 'checks', CHECKS).split(',').map((x) => x.trim()).filter(Boolean)
  const to = path.resolve(str(args, 'to', path.join(OUT, '..', 'checks-results.tar')))
  const root = process.cwd()
  const results = packed(names, fs.readdirSync(OUT))
  const files = new Set<string>()
  const lost: string[] = []
  const rows: string[] = []
  const now = engineHash()
  let old = 0
  for (const f of results) {
    const file = path.join(OUT, f)
    files.add(path.relative(root, file))
    const r = JSON.parse(fs.readFileSync(file, 'utf8')) as { pictures?: { file: string }[]; engineHash?: string; commit?: string; ok?: boolean }
    let n = 0
    for (const p of r.pictures ?? []) {
      const there = pictureFile(p.file, file, OUT)
      if (!there) {
        lost.push(`${f}: ${p.file}`)
        continue
      }
      files.add(path.relative(root, path.resolve(there)))
      n++
    }
    const same = r.engineHash === now
    if (!same && !f.includes('broken')) old++
    rows.push(`${f.padEnd(48)} ${String(r.engineHash ?? 'no hash').padEnd(18)} ${(same ? 'this film' : f.includes('broken') ? 'a broken film' : 'an earlier film').padEnd(16)} ${n} pictures`)
  }
  if (files.size === 0) throw new Error(`there is no result of ${names.join(', ')} in ${path.relative(root, OUT)}`)
  const list = `${to}.list`
  fs.writeFileSync(list, `${[...files].join('\n')}\n`)
  execFileSync('tar', ['-cf', to, '-C', root, '-T', list])
  console.log(rows.join('\n'))
  console.log(`pack · the film here is ${now}: ${old} of the results that are not of a broken film were measured on an earlier one`)
  for (const l of lost) console.log(`pack · not found, left out: ${l}`)
  console.log(`pack · ${files.size} files, ${(fs.statSync(to).size / 1e6).toFixed(1)} MB, in ${path.relative(root, to)}. Unpack at the root of the repo: tar -xf ${path.basename(to)}`)
}
