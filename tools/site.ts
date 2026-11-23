import fs from 'node:fs'
import path from 'node:path'
import { at } from './lib/paths.ts'

// The folder a static host serves: the landing page that plays the film, the film files, and the built app under live/.
const config = JSON.parse(fs.readFileSync(at('config', 'showcase.json'), 'utf8')) as { repo: { url: string } }
const dist = at('dist')
const web = at('web')
const out = at('site')

export function hasSound(file: string): boolean {
  const fd = fs.openSync(file, 'r')
  try {
    const size = 4 * 1024 * 1024
    const keep = 16
    const buf = Buffer.alloc(size + keep)
    let held = 0
    for (;;) {
      const got = fs.readSync(fd, buf, held, size, null)
      if (got <= 0) return false
      const end = held + got
      let i = buf.indexOf('hdlr', 0, 'latin1')
      while (i >= 0 && i + 16 <= end) {
        if (buf.toString('latin1', i + 12, i + 16) === 'soun') return true
        i = buf.indexOf('hdlr', i + 4, 'latin1')
      }
      held = Math.min(keep, end)
      buf.copy(buf, 0, end - held, end)
    }
  } finally {
    fs.closeSync(fd)
  }
}

function build(): void {
  if (!fs.existsSync(path.join(dist, 'index.html'))) throw new Error('dist/index.html does not exist. Run npm run build first')
  const source = fs.readFileSync(path.join(web, 'index.html'), 'utf8')
  const wanted = [...source.matchAll(/(?:src|href|poster)="(film\/[^"]+)"/g)].map((m) => m[1])
  for (const m of source.matchAll(/'(film\/[^']+)'/g)) wanted.push(m[1])
  const missing = [...new Set(wanted)].filter((f) => !fs.existsSync(path.join(web, f)))
  if (missing.length) throw new Error(`the landing page names files that are not in web/: ${missing.join(', ')}`)
  const films = [...new Set(wanted)].filter((f) => f.endsWith('.mp4'))
  const withSound = films.filter((f) => hasSound(path.join(web, f)))
  if (withSound.length !== 0 && withSound.length !== films.length) throw new Error(`some film files have a sound track and some do not: ${films.join(', ')}`)
  const page = source.replaceAll('__SOUND__', withSound.length ? 'yes' : 'no').replaceAll('__REPO__', config.repo.url)
  if (/__[A-Z]+__/.test(page)) throw new Error('the landing page still has a placeholder in it')
  fs.rmSync(out, { recursive: true, force: true })
  fs.mkdirSync(out, { recursive: true })
  fs.cpSync(dist, path.join(out, 'live'), { recursive: true })
  fs.cpSync(path.join(web, 'film'), path.join(out, 'film'), { recursive: true })
  fs.writeFileSync(path.join(out, 'index.html'), page)
  const mb = (f: string) => (fs.statSync(path.join(out, f)).size / 1048576).toFixed(1)
  console.log(`site · ${films.map((f) => `${f} ${mb(f)} MB`).join(' · ')} · sound ${withSound.length ? 'yes' : 'no'} · live/ from dist`)
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(at('tools', 'site.ts'))) build()
