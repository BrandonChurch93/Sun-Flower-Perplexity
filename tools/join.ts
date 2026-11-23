import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { frameCount } from '../src/config.ts'
import { formatById, isTier } from '../src/core/tiers.ts'
import { flag, parseArgs, str } from './lib/args.ts'
import { WORK } from './lib/paths.ts'
import { joinChunks, probe, probeLine } from './lib/video.ts'

// Joins the parts of the film (npm run part) into one file, after checking that they cover every frame once and come from one build.
//   npm run join -- --name blockout
//   npm run join -- --name blockout --music /path/to/track.mp3   also writes a private copy with the track under out/work/private/, which is never committed and never published
//   npm run join -- --name blockout --mixed                      allows parts from different builds, and says so

interface Part { from: number; to: number; frames: number; format: string; tier: string; sky: string; engineHash: string; commit: string; file: string }

const args = parseArgs()
const format = formatById(str(args, 'format', 'preview')).id
const tier = str(args, 'tier', 'draft')
if (!isTier(tier)) throw new Error(`unknown tier "${tier}"`)
const name = str(args, 'name', 'film')
const dir = path.join(WORK, 'parts', `${format}-${tier}`)
const parts: Part[] = fs.readdirSync(dir).filter((f) => /^part-\d+-\d+\.json$/.test(f)).map((f) => ({ ...(JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')) as Part), file: path.join(dir, f.replace(/\.json$/, '.mp4')) })).sort((a, b) => a.from - b.from)
if (!parts.length) throw new Error(`no parts in ${dir}`)

const problems: string[] = []
let next = 0
for (const p of parts) {
  if (p.from !== next) problems.push(p.from > next ? `frames ${next} to ${p.from - 1} are missing` : `frames ${p.from} to ${Math.min(p.to, next - 1)} are there twice`)
  next = Math.max(next, p.to + 1)
  if (!fs.existsSync(p.file)) problems.push(`${path.basename(p.file)} is missing`)
  else if (probe(p.file).frames !== p.to - p.from + 1) problems.push(`${path.basename(p.file)} has ${probe(p.file).frames} frames, not ${p.to - p.from + 1}`)
}
if (next !== frameCount) problems.push(`frames ${next} to ${frameCount - 1} are missing`)
const builds = [...new Set(parts.map((p) => `${p.engineHash} ${p.sky}`))]
if (builds.length > 1 && !flag(args, 'mixed')) problems.push(`the parts come from ${builds.length} builds: ${builds.join(', ')}`)
if (problems.length) throw new Error(`the parts do not make one film:\n${problems.join('\n')}`)

const out = path.join(WORK, `${name}-${format}-${tier}.mp4`)
joinChunks(parts.map((p) => p.file), out)
const p = probe(out)
if (p.frames !== frameCount) throw new Error(`${out} has ${p.frames} frames, not ${frameCount}`)
fs.writeFileSync(out.replace(/\.mp4$/, '.json'), `${JSON.stringify({ kind: 'film', format, tier, frames: p.frames, builds, commits: [...new Set(parts.map((x) => x.commit))], parts: parts.map((x) => [x.from, x.to]), at: new Date().toISOString() }, null, 2)}\n`)
console.log(`join · ${parts.length} parts · ${builds.length === 1 ? `one build (${builds[0]})` : `${builds.length} builds, mixed`} · ${probeLine(out, p)}`)

if (typeof args.music === 'string') {
  const priv = path.join(WORK, 'private')
  fs.mkdirSync(priv, { recursive: true })
  const withMusic = path.join(priv, `${name}-${format}-${tier}-with-music.mp4`)
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', out, '-i', args.music, '-map', '0:v:0', '-map', '1:a:0', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart', withMusic])
  console.log(`join · private copy with the track (not committed, not published): ${path.relative(process.cwd(), withMusic)}`)
}
