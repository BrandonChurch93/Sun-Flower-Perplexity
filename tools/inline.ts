import { parseArgs, num, str } from './lib/args.ts'
import { writeInline } from './lib/inline.ts'

const args = parseArgs()
const pictures = process.argv
  .slice(2)
  .filter((a) => !a.startsWith('--') && a.includes('='))
  .map((a) => ({ label: a.slice(0, a.indexOf('=')), file: a.slice(a.indexOf('=') + 1) }))
const out = await writeInline(str(args, 'name', 'inline'), pictures, args.edge ? num(args, 'edge') : undefined)
console.log(out)
