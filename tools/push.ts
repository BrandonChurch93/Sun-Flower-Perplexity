import { execFileSync } from 'node:child_process'
import { config } from '../src/config.ts'
import { parseArgs, str } from './lib/args.ts'
import { ROOT } from './lib/paths.ts'
import { appendToSection, readProgress, setField, writeProgress } from './lib/progress.ts'

const args = parseArgs()
const message = str(args, 'm')
const git = (...a: string[]) => execFileSync('git', a, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
const stamp = new Date().toISOString().replace('T', ' ').slice(0, 16) + ' UTC'
const branch = config.repo.branch

function sync(): void {
  git('fetch', '--quiet', 'origin', branch)
  const behind = Number(git('rev-list', '--count', `HEAD..origin/${branch}`))
  if (behind > 0) {
    git('merge', '--no-edit', `origin/${branch}`)
    console.log(`merged ${behind} commit(s) from origin/${branch}`)
  }
}

let progress = readProgress()
progress = setField(progress, 'Last push', `${stamp} · ${message}`)
progress = appendToSection(progress, 'Push log', `- ${stamp} · ${message}`)
writeProgress(progress)
git('add', '-A')
const staged = git('diff', '--cached', '--name-only')
if (staged) git('commit', '--quiet', '-m', `${message}\n\nCo-authored-by: Perplexity <noreply@perplexity.ai>`)
let ok = false
for (let attempt = 1; attempt <= 2 && !ok; attempt++) {
  try {
    sync()
    git('push', '--quiet', 'origin', `HEAD:${branch}`)
    ok = true
  } catch (error) {
    console.log(`push attempt ${attempt} failed: ${String((error as Error).message).split('\n')[0]}`)
  }
}
if (!ok) {
  writeProgress(appendToSection(readProgress(), 'Push log', `- ${stamp} · PUSH FAILED twice for "${message}". It is tried again at the next commit.`))
  console.log('push failed twice. Logged. It is tried again at the next commit.')
  process.exitCode = 2
} else console.log(`pushed ${git('rev-parse', '--short', 'HEAD')} · ${message}`)
