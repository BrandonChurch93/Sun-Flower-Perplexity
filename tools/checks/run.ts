import { parseArgs } from '../lib/args.ts'

// The checks of version 2. Each prints what it measured and exits with 1 when the film breaks its rule.
//   npm run checks -- nights            every night, its length and how far the plant's clock moves in it
//   npm run checks -- holds             nothing grows in the two holds: by the clock and by the picture
//   npm run checks -- cues              the sunrises, the holds and the lightning sit on their bar lines
//   npm run checks -- play              draws every frame small and notes what each frame made: cuts and made read it
//   npm run checks -- cuts              no hard cut anywhere in the film
//   npm run checks -- made              nothing is made on the graphics card after loading
//   npm run checks -- pure              any frame drawn twice gives the same pixels, and no clock or dice in src
//   npm run checks -- script            the page's own script time in a frame, by part, against tools/checks/limits.json
//   npm run checks -- writes            what one frame writes into buffers and textures that exist, and whose they are
//   npm run checks -- film              the whole film small in one go: draws it on three pages, then nights, cuts and made in one table
//   npm run checks -- all               every check that does not draw, then what the drawn ones have so far
//   npm run checks -- proof             every check run on a film broken on purpose: each has to fail
//   npm run checks -- review            builds the review page from what is in out/
// --break <name> puts a film broken on purpose in the film's place, to show that the check fails. tools/checks/README.md lists them.

const NAMES = ['nights', 'holds', 'cues', 'play', 'cuts', 'made', 'pure', 'script', 'writes', 'film', 'all', 'proof', 'review'] as const

// What each check needs and what it costs, measured on four cores without a graphics card, four pages drawing at once.
const HELP: [string, string, string, string][] = [
  ['nights', 'no night longer than 1.2 s, by the clock; no step or flicker through a dusk or dawn, by the picture', 'nothing; the picture part reads the frames of play', '3 s'],
  ['nights --plant', 'the plant alone does not get brighter from the handover to the moon toward midnight', 'draws about 140 frames itself at 640 x 360 with the plant alone', '7 to 9 min'],
  ['holds', 'nothing grows in the two holds, by the clock and by the picture', 'draws 20 frames itself at 640 x 360 (--no-pictures: none)', '3 s by the clock, 4 to 6 min with the pictures'],
  ['cues', 'sunrises, holds and lightning sit on the bar lines of config/music/cues.json', 'nothing', '3 s'],
  ['play', 'draws the film small and notes what each frame made', 'a browser; --sky, --from, --to, --stride 6', '25 to 30 min a page for a third of a round of stride 6; 3 pages side by side'],
  ['cuts', 'no hard cut: the edges of the picture stay where they are from frame to frame', 'the frames of play', '10 to 40 s'],
  ['made', 'nothing is made on the graphics card after loading', 'the notes of play', '2 s'],
  ['pure', 'a frame drawn again, in another order, on a fresh page, gives the same bytes', 'draws 12 frames three times on two pages at 960 x 540 (--frames a,b,c)', '10 to 12 min'],
  ['script', 'the page keeps the frame rate: its own script time in a frame, by part, inside tools/checks/limits.json', 'draws 13 windows of 20 to 40 frames in a row itself (--window a-b, --frames 8, --all, --table)', 'about 30 min, 17 min with --frames 20; run it alone'],
  ['writes', 'what one frame writes into what exists, by owner', 'draws 8 frames itself', '6 min'],
  ['film', 'the whole film in one go: nights by the picture, cuts and made in one table, a row a night and a row a day', 'draws about 1,430 frames at 320 x 180 on 3 pages (--pages, --stride 1 for every frame, --no-draw)', '80 to 100 min'],
  ['all', 'every check that does not draw, then what the drawn ones have so far', 'nothing', '1 min'],
  ['proof', 'every check on a film broken on purpose: each has to fail', 'nothing for the clock breaks; reads the last run of the drawn ones', '30 s'],
  ['review', 'builds the review page from what is in out/', 'what the checks wrote; --shot takes pictures of the page', '10 s, 40 s with --shot'],
]

const name = process.argv[2]
if (!name || name === 'help' || name === '--help' || name === '-h' || !(NAMES as readonly string[]).includes(name)) {
  const known = !name || name === 'help' || name === '--help' || name === '-h'
  if (!known) console.error(`there is no check "${name}"`)
  console.log(`npm run checks -- <${NAMES.join(' | ')}> [options]\n`)
  const wide = [0, 1, 2].map((i) => Math.max(...HELP.map((h) => h[i].length)))
  console.log(`${'check'.padEnd(wide[0])}  ${'what it shows'.padEnd(wide[1])}  ${'what it needs'.padEnd(wide[2])}  how long`)
  for (const h of HELP) console.log(`${h[0].padEnd(wide[0])}  ${h[1].padEnd(wide[1])}  ${h[2].padEnd(wide[2])}  ${h[3]}`)
  console.log('\nSet PLAYWRIGHT_HOST_PLATFORM_OVERRIDE=ubuntu24.04-x64 for the ones that draw. The order for a film that changed: cues, nights, holds; play --stride 6 on three ranges; then cuts --stride 6, made --stride 6, nights again; proof; review.')
  console.log('--break <name> puts a film broken on purpose in the place of the film. tools/checks/README.md lists every option and every break.')
  process.exit(known ? 0 : 2)
}
const args = parseArgs(process.argv.slice(3))
const module = (await import(name === 'review' ? './review/build.ts' : `./${name}.ts`)) as { run: (a: typeof args) => Promise<void> }
await module.run(args)
