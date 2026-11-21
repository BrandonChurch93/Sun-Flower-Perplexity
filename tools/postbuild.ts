import fs from 'node:fs'
import { computeHashes } from './lib/hashes.ts'
import { at } from './lib/paths.ts'

const hashes = computeHashes()

// The kept still of the bloom-hero frame, for the comparison on the Export page.
const config = JSON.parse(fs.readFileSync(at('config', 'showcase.json'), 'utf8')) as { film: { fps: number }; keys: { id: string; time: number }[] }
const hero = config.keys.find((k) => k.id === 'bloom-hero')
if (hero) {
  const name = `judged-f${String(Math.round(hero.time * config.film.fps)).padStart(4, '0')}.jpg`
  const kept = at('out', 'stills', name)
  if (fs.existsSync(kept)) {
    fs.mkdirSync(at('dist', 'kept'), { recursive: true })
    fs.copyFileSync(kept, at('dist', 'kept', 'bloom-hero.jpg'))
    if (fs.existsSync(`${kept}.json`)) fs.copyFileSync(`${kept}.json`, at('dist', 'kept', 'bloom-hero.json'))
  }
}
fs.writeFileSync(at('dist', 'build.json'), JSON.stringify({ ...hashes, builtAt: new Date().toISOString() }, null, 2) + '\n')
console.log(`built · engine ${hashes.engineHash}`)
