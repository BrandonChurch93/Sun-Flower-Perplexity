import { parseArgs, str } from './lib/args.ts'
import { addLook } from './lib/looks.ts'

const args = parseArgs()
const entry = addLook(str(args, 'add'), str(args, 'caption', ''), str(args, 'by', 'builder'))
console.log(`look added: ${entry.file} · ${entry.caption} · by ${entry.by}`)
