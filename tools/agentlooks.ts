import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import sharp from 'sharp'
import { parseArgs, str } from './lib/args.ts'
import { ROOT } from './lib/paths.ts'

// An agent's newest pictures, pushed to a branch of their own that is only ever fetched and never merged.
//   npm run looks -- --agent sky-a "the first sunrise, 1920 wide=out/work/bench/sky-a/02-first-light-16x9-review.png" "clip, bars 43 to 49=out/work/bench/sky-a/clip-wide-73-85.mp4"
// Pictures become JPEG at most 1600 px wide. A clip is kept as it is, so keep it under 8 MB. At most 12 files, and each push replaces the last set.

const args = parseArgs()
const agent = str(args, 'agent')
const note = str(args, 'note', '')
const branch = `agent/${agent}-looks`
const git = (...a: string[]) => execFileSync('git', a, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
const items = process.argv
  .slice(2)
  .filter((a) => !a.startsWith('--') && a.includes('='))
  .map((a) => ({ caption: a.slice(0, a.lastIndexOf('=')), file: path.resolve(a.slice(a.lastIndexOf('=') + 1)) }))
if (items.length === 0 || items.length > 12) throw new Error('give 1 to 12 pictures as "caption=file"')

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'looks-'))
const entries: string[] = []
const lines: string[] = []
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48)
for (let i = 0; i < items.length; i++) {
  const { caption, file } = items[i]
  if (!fs.existsSync(file)) throw new Error(`no such file: ${file}`)
  const clip = /\.(mp4|webm)$/.test(file)
  const name = `${String(i + 1).padStart(2, '0')}-${slug(caption)}${clip ? path.extname(file) : '.jpg'}`
  const out = path.join(tmp, name)
  if (clip) {
    if (fs.statSync(file).size > 8 * 1048576) throw new Error(`${file} is over 8 MB`)
    fs.copyFileSync(file, out)
  } else {
    await sharp(file).rotate().resize({ width: 1600, withoutEnlargement: true }).flatten({ background: '#101010' }).jpeg({ quality: 88, mozjpeg: true }).toFile(out)
  }
  const blob = git('hash-object', '-w', out)
  entries.push(`100644 blob ${blob}\t${name}`)
  lines.push(`- \`${name}\`: ${caption}`)
}
const stamp = new Date().toISOString().replace('T', ' ').slice(0, 16) + ' UTC'
const head = git('rev-parse', '--short', 'HEAD')
const notes = path.join(tmp, 'NOTES.md')
fs.writeFileSync(notes, [`# Looks of ${agent}`, '', `${stamp}, at commit ${head} of agent/${agent}.`, '', ...(note ? [note, ''] : []), ...lines, ''].join('\n'))
entries.push(`100644 blob ${git('hash-object', '-w', notes)}\tNOTES.md`)
const inner = execFileSync('git', ['mktree'], { cwd: ROOT, input: entries.join('\n') + '\n', encoding: 'utf8' }).trim()
const tree = execFileSync('git', ['mktree'], { cwd: ROOT, input: `040000 tree ${inner}\tlooks\n`, encoding: 'utf8' }).trim()
let parent: string[] = []
try {
  git('fetch', '--quiet', '--depth', '1', 'origin', branch)
  parent = ['-p', git('rev-parse', 'FETCH_HEAD')]
} catch {}
const commit = execFileSync('git', ['commit-tree', tree, ...parent, '-m', `Looks of ${agent}, ${stamp}\n\nCo-authored-by: Perplexity <noreply@perplexity.ai>`], { cwd: ROOT, encoding: 'utf8' }).trim()
git('push', '--quiet', 'origin', `${commit}:refs/heads/${branch}`)
fs.rmSync(tmp, { recursive: true, force: true })
console.log(`looks · ${items.length} file(s) pushed to ${branch} at ${commit.slice(0, 7)}`)
