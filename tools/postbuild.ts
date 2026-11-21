import fs from 'node:fs'
import { computeHashes } from './lib/hashes.ts'
import { at } from './lib/paths.ts'

const hashes = computeHashes()
fs.writeFileSync(at('dist', 'build.json'), JSON.stringify({ ...hashes, builtAt: new Date().toISOString() }, null, 2) + '\n')
console.log(`built · engine ${hashes.engineHash}`)
