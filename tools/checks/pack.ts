import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { type Args, flag, str } from '../lib/args.ts'
import { engineHash, OUT } from './lib/report.ts'
import { pictureFile } from './review/film.ts'

// One tar of what the review page reads from the checks: each result, the runs on films broken on purpose, the other runs of the same check, and every picture they name.
// Unpacked at the root of the repo on another machine it puts them where "npm run checks -- review" looks.
// A result measured on an earlier film, or read from frames of one, is left out: it would lie about this film and could overwrite a newer result where it is unpacked.
// Runs on films broken on purpose are packed whatever they were measured on: they show that a check fails, not what the film does. The list of what went in and what stayed out goes in too.
//   npm run checks -- pack                               holds, nights, cuts, made, script, cues, pure into out/work/checks-results.tar
//   npm run checks -- pack --checks holds,cues --to file.tar
//   npm run checks -- pack --all                         the results of earlier films too
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
  const all = flag(args, 'all')
  let out = 0
  for (const f of results) {
    const file = path.join(OUT, f)
    const r = JSON.parse(fs.readFileSync(file, 'utf8')) as { pictures?: { file: string }[]; engineHash?: string; data?: { stamp?: { hash?: string } } }
    const frames = r.data?.stamp?.hash
    const of = f.includes('broken') ? 'a broken film' : r.engineHash !== now ? 'an earlier film' : frames && frames !== now ? 'frames of an earlier film' : 'this film'
    const goes = all || of === 'this film' || of === 'a broken film'
    let n = 0
    if (goes) {
      files.add(path.relative(root, file))
      for (const p of r.pictures ?? []) {
        const there = pictureFile(p.file, file, OUT)
        if (!there) {
          lost.push(`${f}: ${p.file}`)
          continue
        }
        files.add(path.relative(root, path.resolve(there)))
        n++
      }
    } else out++
    rows.push(`${f.padEnd(48)} ${String(frames ?? r.engineHash ?? 'no hash').padEnd(18)} ${of.padEnd(26)} ${goes ? `packed, ${n} pictures` : 'left out'}`)
  }
  if (files.size === 0) throw new Error(`there is no result of ${names.join(', ')} in ${path.relative(root, OUT)}`)
  const said = [`the film here is ${now}`, ...rows, ...lost.map((l) => `not found, left out: ${l}`), `${out} results left out: measured on an earlier film or read from its frames (--all packs them too)`].join('\n')
  const note = path.join(OUT, 'pack.txt')
  fs.writeFileSync(note, `${said}\n`)
  files.add(path.relative(root, note))
  const list = `${to}.list`
  fs.writeFileSync(list, `${[...files].join('\n')}\n`)
  execFileSync('tar', ['-cf', to, '-C', root, '-T', list])
  console.log(said)
  console.log(`pack · ${files.size} files, ${(fs.statSync(to).size / 1e6).toFixed(1)} MB, in ${path.relative(root, to)}. Unpack at the root of the repo: tar -xf ${path.basename(to)}`)
}
