import fs from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'
import type { Args } from '../lib/args.ts'
import { flag, num, str } from '../lib/args.ts'
import { at } from '../lib/paths.ts'
import { compare, rawOf, type Raw } from '../lib/pixels.ts'
import { barText, FRAMES, secondsOf } from './lib/film.ts'
import { finish, OUT, type Finding } from './lib/report.ts'
import { drawPath, searchSource } from './lib/search.ts'
import { openSession, type SessionOptions } from './lib/session.ts'

const SENTENCE = 'any frame can be drawn alone, in any order, and gives the same pixels'
const COUNT = 12

// Twelve frames spread over the film are drawn in order, then six others, then the twelve again backwards, then once more on a fresh page in a third order.
//   npm run checks -- pure                      960 x 540, one sample
//   npm run checks -- pure --tier review        with the eight samples of the export
//   npm run checks -- pure --search             the search of src/ alone, which draws nothing
//   npm run checks -- pure --break dice         a film whose camera turns by a throw of Math.random: must fail
//   npm run checks -- pure --break memory       a film whose camera turns by how many frames were drawn before: must fail
export async function run(args: Args): Promise<void> {
  const broken = typeof args.break === 'string' ? args.break : null
  if (broken && !['dice', 'memory'].includes(broken)) throw new Error('pure can break the film with --break dice or --break memory')
  const findings: Finding[] = []
  const rows: (string | number)[][] = []
  const pictures: { file: string; caption: string }[] = []

  const hits = searchSource(at('tools', 'checks', 'pure-allow.json'))
  const bad = hits.filter((h) => h.drawPath)
  findings.push({ ok: bad.length === 0, what: `the search of src/ for Math.random, Date.now, performance.now and new Date( finds ${hits.length} lines in ${new Set(hits.map((h) => h.file)).size} files; the draw can run ${drawPath().size} files, and ${bad.length} of the lines are in one of them${bad.length ? `: ${bad.map((h) => `${h.file}:${h.line}`).join(', ')}` : ''}` })
  for (const h of hits) rows.push([`${h.file}:${h.line}`, h.word, h.verdict])

  let complete = true
  if (flag(args, 'search')) complete = false
  else {
    const tier = str(args, 'tier', 'draft')
    const options: SessionOptions = { width: num(args, 'width', 960), height: num(args, 'height', 540), sky: typeof args.sky === 'string' ? args.sky : undefined }
    const frames = typeof args.frames === 'string' ? args.frames.split(',').map(Number) : Array.from({ length: COUNT }, (_, i) => Math.round(((i + 0.5) * FRAMES) / COUNT))
    const between = frames.slice(0, 6).map((f, i) => Math.round(0.5 * (f + frames[i + 1])))
    const third = frames.map((_, i) => frames[(i * 5 + 3) % frames.length])
    const dir = path.join(OUT, 'pure', broken ? `broken-${broken}` : 'film')
    fs.rmSync(dir, { recursive: true, force: true })
    fs.mkdirSync(dir, { recursive: true })
    const say = (text: string): void => {
      console.log(text)
      fs.appendFileSync(path.join(dir, 'progress.txt'), text + '\n')
    }
    const pass = async (order: number[], what: string, keep: boolean, session: Awaited<ReturnType<typeof openSession>>): Promise<Map<number, { raw: Raw; png: Buffer }>> => {
      const out = new Map<number, { raw: Raw; png: Buffer }>()
      for (const f of order) {
        const d = await session.draw(f, tier)
        if (keep) out.set(f, { raw: await rawOf(d.png as Buffer), png: d.png as Buffer })
        say(`pure · ${what} · frame ${f} · ${d.seconds.toFixed(1)} s`)
      }
      return out
    }
    let first: Map<number, { raw: Raw; png: Buffer }>
    let second: Map<number, { raw: Raw; png: Buffer }>
    let fresh: Map<number, { raw: Raw; png: Buffer }>
    const one = await openSession(options)
    try {
      if (broken) await one.fault(broken)
      first = await pass(frames, 'first, in order', true, one)
      await pass(between, 'others in between', false, one)
      second = await pass([...frames].reverse(), 'again, backwards', true, one)
    } finally {
      await one.close()
    }
    const two = await openSession(options)
    try {
      if (broken) await two.fault(broken)
      fresh = await pass(third, 'a fresh page, a third order', true, two)
    } finally {
      await two.close()
    }
    let differing = 0
    for (const f of frames) {
      const a = first.get(f) as { raw: Raw; png: Buffer }
      const tests: [string, { raw: Raw; png: Buffer }][] = [['drawn again backwards, other frames in between', second.get(f) as { raw: Raw; png: Buffer }], ['drawn on a fresh page in a third order', fresh.get(f) as { raw: Raw; png: Buffer }]]
      for (const [what, b] of tests) {
        const same = Buffer.compare(a.raw.data, b.raw.data) === 0
        const d = compare(a.raw, b.raw)
        rows.push([`frame ${f} (${secondsOf(f).toFixed(2)} s, ${barText(secondsOf(f))})`, what, same ? `identical, ${a.raw.data.length} bytes` : `DIFFERENT: ${d.differingPixels} pixels, largest step ${d.maxDifference} of 255`])
        if (!same) {
          differing++
          if (pictures.length < 4) {
            const w = a.raw.width
            const h = a.raw.height
            const diff = Buffer.alloc(w * h * 3)
            for (let i = 0; i < w * h; i++) for (let k = 0; k < 3; k++) diff[i * 3 + k] = Math.min(255, 24 * Math.abs(a.raw.data[i * 4 + k] - b.raw.data[i * 4 + k]))
            const file = path.join(dir, `differs-${f}.jpg`)
            await sharp({ create: { width: w * 3, height: h, channels: 3, background: '#000' } })
              .composite([{ input: a.png, left: 0, top: 0 }, { input: b.png, left: w, top: 0 }, { input: await sharp(diff, { raw: { width: w, height: h, channels: 3 } }).png().toBuffer(), left: 2 * w, top: 0 }])
              .jpeg({ quality: 88 })
              .toFile(file)
            pictures.push({ file, caption: `frame ${f}: the first drawing, the same frame ${what}, and their difference 24 times over. ${d.differingPixels} pixels differ` })
          }
        }
      }
    }
    findings.push({ ok: differing === 0, what: differing === 0 ? `${frames.length} frames (${frames.join(', ')}) at ${options.width} x ${options.height}, ${tier}: each gives the same bytes when drawn again backwards after ${between.length} other frames, and on a fresh page in a third order. ${2 * frames.length} comparisons, 0 differ` : `${differing} of ${2 * frames.length} comparisons differ: a frame's pixels depend on something other than the film second` })
  }
  finish({
    check: 'pure',
    sentence: SENTENCE,
    subject: broken === 'dice' ? 'a film whose camera turns by a throw of Math.random' : broken === 'memory' ? 'a film whose camera turns by how many frames were drawn before' : 'the film',
    broken,
    complete,
    findings,
    table: { head: ['what', 'test', 'result'], rows },
    pictures,
    data: { hits },
  })
}
