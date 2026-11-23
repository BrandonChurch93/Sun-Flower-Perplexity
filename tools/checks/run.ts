import { parseArgs } from '../lib/args.ts'

// The checks of version 2. Each prints what it measured and exits with 1 when the film breaks its rule.
//   npm run checks -- nights            every night, its length and how far the plant's clock moves in it
//   npm run checks -- holds             nothing grows in the two holds: by the clock and by the picture
//   npm run checks -- cues              the sunrises, the holds and the lightning sit on their bar lines
//   npm run checks -- play              draws every frame small and notes what each frame made: cuts and made read it
//   npm run checks -- cuts              no hard cut anywhere in the film
//   npm run checks -- made              nothing is made on the graphics card after loading
//   npm run checks -- pure              any frame drawn twice gives the same pixels, and no clock or dice in src
//   npm run checks -- all               every check that does not draw, then what the drawn ones have so far
//   npm run checks -- review            builds the review page from what is in out/
// --break <name> puts a film broken on purpose in the film's place, to show that the check fails. tools/checks/README.md lists them.

const NAMES = ['nights', 'holds', 'cues', 'play', 'cuts', 'made', 'pure', 'all', 'review', 'proof'] as const
const name = process.argv[2]
if (!name || !(NAMES as readonly string[]).includes(name)) {
  console.error(`npm run checks -- <${NAMES.join(' | ')}> [options]`)
  process.exit(2)
}
const args = parseArgs(process.argv.slice(3))
const module = (await import(name === 'review' ? './review/build.ts' : `./${name}.ts`)) as { run: (a: typeof args) => Promise<void> }
await module.run(args)
