import fs from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'
import type { Args } from '../lib/args.ts'
import { num, str } from '../lib/args.ts'
import { barText, FRAMES, secondsOf } from './lib/film.ts'
import { frameFile, MOST, olderFilm, readLines, type Held } from './lib/play.ts'
import { finish, OUT, type Finding } from './lib/report.ts'
import { openSession } from './lib/session.ts'

// Every pixel of a frame holds a number before the lens, and none over MOST (tools/checks/lib/play.ts). A pixel without one, or one that bright, is spread by the lens into a bright disc: a fault no other check sees, since the frame still draws, makes nothing and cuts nowhere.
//   npm run checks -- numbers                              reads what `play` noted for every frame it drew
//   npm run checks -- numbers --frames 1452,1479           draws those frames itself, without warming
//   npm run checks -- numbers --from 1440 --to 1490 --every 3 --width 960 --height 540 --tier review
//   npm run checks -- numbers --frames 1452 --break number   the key light has no number in that frame: must fail
//   npm run checks -- numbers --frames 1452 --break bright   the key light ten million times as strong in that frame: must fail
// A frame it draws itself and finds bad is drawn again with each part of the scene alone, to name the parts that give such pixels by themselves (--no-who leaves that out).
// The picture of each bad frame, the bad pixels in magenta, is kept in out/work/checks/numbers/.

const SHOWN = 12
const WHO = 3
// A frame of one sample is drawn at four places a pixel. Where a blade edge crosses a pixel its look is worked out beside the blade, with numbers no blade has, and can come out as a spark: a large number that is still a number.
// So each such frame is drawn a second time at one place a pixel, and a pixel of the first that holds more than TIMES what anything within REACH pixels holds in the second, and more than TIMES the second's mean, is a spark.
const TIMES = 4
const REACH = 4
const FOLDER: Record<string, string> = { plant: 'src/plant', companion: 'src/plant', field: 'src/field (its plants take their look from src/plant/surface)', ground: 'src/ground', sky: 'the sky in use' }

// A part drawn alone is named only where it gives a bad pixel within two pixels of one the whole frame has: alone, a part stands against an empty frame and has edges the film never shows.
const close = (a: number[], b: number[]): boolean => {
  for (let i = 0; i < a.length; i += 2) for (let k = 0; k < b.length; k += 2) if (Math.abs(a[i] - b[k]) <= 2 && Math.abs(a[i + 1] - b[k + 1]) <= 2) return true
  return false
}
const wrong = (h: Held): number => h.none + h.over + (h.sparks ?? 0)
const place = (h: Held): string => (h.at ? ` at column ${h.at[0]}, row ${h.at[1]} from the top` : '')
const said = (h: Held, most: number): string => `${h.none} pixels without a number, ${h.over} over ${most}${h.sparks === undefined ? '' : `, ${h.sparks} sparks (the most a pixel holds of what is near it, ${(h.ratio ?? 0).toFixed(1)} times${h.spark ? `: ${h.spark.value.toPrecision(3)} at column ${h.spark.at[0]}, row ${h.spark.at[1]} against ${h.spark.near.toPrecision(3)} near it and a mean of ${h.spark.mean.toPrecision(3)}` : ''})`}`

interface Row { frame: number; held: Held; alone: string[] | null; picture: string | null }

const box = (where: number[]): string => {
  let x0 = Infinity
  let x1 = -Infinity
  let y0 = Infinity
  let y1 = -Infinity
  for (let i = 0; i < where.length; i += 2) {
    x0 = Math.min(x0, where[i])
    x1 = Math.max(x1, where[i])
    y0 = Math.min(y0, where[i + 1])
    y1 = Math.max(y1, where[i + 1])
  }
  return where.length ? `columns ${x0} to ${x1}, rows ${y0} to ${y1} from the top` : ''
}

async function mark(png: Buffer, where: number[], file: string): Promise<void> {
  const { data, info } = await sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true })
  for (let i = 0; i < where.length; i += 2) {
    const p = 3 * (where[i + 1] * info.width + where[i])
    data[p] = 255
    data[p + 1] = 0
    data[p + 2] = 255
  }
  fs.mkdirSync(path.dirname(file), { recursive: true })
  await sharp(data, { raw: { width: info.width, height: info.height, channels: 3 } }).resize(info.width * 3, info.height * 3, { kernel: 'nearest' }).png().toFile(file)
}

export async function run(args: Args): Promise<void> {
  const broken = typeof args.break === 'string' ? args.break : null
  if (broken && !['number', 'bright'].includes(broken)) throw new Error('numbers can break the film with --break number or --break bright, on frames it draws itself: --frames a,b')
  const named = typeof args.frames === 'string' || typeof args.frames === 'number' ? String(args.frames).split(',').map(Number) : null
  const ranged = args.from !== undefined || args.to !== undefined
  const every = Math.max(1, num(args, 'every', 1))
  const from = Math.max(0, num(args, 'from', 0))
  const to = Math.min(FRAMES - 1, num(args, 'to', FRAMES - 1))
  const frames = named ?? (ranged ? Array.from({ length: Math.floor((to - from) / every) + 1 }, (_, i) => from + i * every) : null)
  if (broken && !frames) throw new Error('a broken film is drawn here, not read from play: name the frames with --frames a,b')
  const most = num(args, 'most', MOST)
  const dir = path.join(OUT, 'numbers', broken ? `broken-${broken}` : frames && ranged ? `film.${from}-${to}` : named ? `film.${named.join('.')}` : 'film')
  const rows: Row[] = []
  const findings: Finding[] = []
  let unread = 0
  let complete = false
  if (frames) {
    const tier = str(args, 'tier', 'draft')
    const who = args.who !== false && args['no-who'] === undefined
    const pair = tier === 'draft' && args.pair !== false && args['no-pair'] === undefined
    const times = num(args, 'times', TIMES)
    const reach = num(args, 'reach', REACH)
    fs.rmSync(dir, { recursive: true, force: true })
    const session = await openSession({ width: num(args, 'width', 320), height: num(args, 'height', 180) })
    try {
      await session.watch(most)
      const parts = ['plant', 'companion', 'field', 'ground', 'sky', ...session.info.parts]
      let asked = 0
      const read = async (f: number): Promise<{ held: Held; png: Buffer | null }> => {
        const d = await session.draw(f, tier)
        const held: Held = await session.numbers(most)
        if (pair) {
          await session.note()
          await session.plain(true)
          await session.draw(f, tier, false)
          const s = await session.sparks(times, reach)
          await session.plain(false)
          held.sparks = s.count
          held.ratio = s.worst
          held.spark = { at: s.at, value: s.value, near: s.near, mean: s.mean }
          held.where.push(...s.where)
        }
        return { held, png: (d.png as Buffer | undefined) ?? null }
      }
      for (const f of frames) {
        if (broken) await session.fault(broken, f)
        const { held, png } = await read(f)
        const bad = wrong(held) > 0
        let alone: string[] | null = null
        let picture: string | null = null
        if (bad) {
          picture = path.join(dir, `${f}.png`)
          if (png) await mark(png, held.where, picture)
          if (who && !broken && asked++ < WHO) {
            alone = []
            for (const part of [...new Set(parts)]) {
              await session.only([part])
              const by = (await read(f)).held
              if (wrong(by) > 0 && close(by.where, held.where)) alone.push(part)
            }
            await session.only([])
          }
        }
        rows.push({ frame: f, held, alone, picture })
        console.log(`numbers · frame ${f} · ${said(held, most)}, the largest in order ${held.most.toFixed(1)}${place(held)}${alone ? ` · alone: ${alone.join(', ') || 'no part by itself'}` : ''}`)
      }
    } finally {
      await session.close()
    }
  } else {
    const lines = readLines('film')
    for (const line of [...lines.values()].sort((a, b) => a.frame - b.frame)) {
      if (!line.numbers) {
        unread++
        continue
      }
      const bad = wrong(line.numbers) > 0
      let picture: string | null = null
      if (bad && rows.filter((r) => r.picture).length < SHOWN) {
        picture = path.join(dir, `${line.frame}.png`)
        await mark(fs.readFileSync(frameFile('film', line.frame)), line.numbers.where, picture)
      }
      rows.push({ frame: line.frame, held: line.numbers, alone: null, picture })
    }
    complete = rows.length === FRAMES
    const older = olderFilm('film')
    if (older) findings.push({ ok: true, expected: true, what: older })
    if (unread) findings.push({ ok: true, expected: true, what: `${unread} frames were drawn before play read the numbers of a frame: they are not judged; draw them again` })
    if (!complete) findings.push({ ok: true, expected: true, what: `${rows.length} of ${FRAMES} frames are read so far` })
  }
  const bad = rows.filter((r) => wrong(r.held) > 0)
  const paired = rows.some((r) => r.held.sparks !== undefined)
  const top = rows.reduce((a, r) => (r.held.most > a.held.most ? r : a), rows[0])
  if (rows.length === 0) findings.unshift({ ok: false, what: 'no frame is read: draw the film with "npm run checks -- play", or name frames with --frames a,b' })
  else if (bad.length === 0) findings.unshift({ ok: true, what: `${rows.length} frames: every pixel holds a number before the lens, none is over ${most}${paired ? ` and none is a spark (the most a pixel holds of what is near it: ${Math.max(...rows.map((r) => r.held.ratio ?? 0)).toFixed(1)} times, the limit ${num(args, 'times', TIMES)})` : ''}; the largest is ${top.held.most.toFixed(1)}, at frame ${top.frame}${place(top.held)}` })
  else {
    findings.unshift({ ok: false, what: `${bad.length} of ${rows.length} frames hold a pixel without a number, over ${most} or a spark before the lens: ${bad.slice(0, 40).map((r) => r.frame).join(', ')}${bad.length > 40 ? ' and more' : ''}` })
    for (const r of bad.slice(0, SHOWN)) {
      const owner = r.alone?.length ? ` Drawn alone, ${r.alone.join(', ')} ${r.alone.length === 1 ? 'gives' : 'give'} such pixels. Owner: ${[...new Set(r.alone.map((a) => FOLDER[a] ?? `the part ${a}`))].join(', ')}` : r.alone ? ' No part gives such a pixel when drawn alone: it takes two of them.' : ''
      findings.push({ ok: false, what: `frame ${r.frame} (${barText(secondsOf(r.frame))}): ${said(r.held, most)}, in ${box(r.held.where)}.${owner}` })
    }
  }
  finish({
    check: 'numbers',
    name: frames ? `numbers.${frames.length <= 4 ? frames.join('.') : `${frames[0]}-${frames[frames.length - 1]}`}` : 'numbers',
    sentence: 'nothing pops: every pixel of a frame holds a number before the lens, and none too bright for it',
    subject: broken ? `a film broken on purpose (${broken})` : 'the film',
    broken,
    complete: frames ? false : complete,
    findings,
    table: { head: ['frame', 'bar', 'without a number', `over ${most}`, 'sparks', 'times what is near', 'largest in order', 'where', 'alone'], rows: (bad.length ? bad.slice(0, 60) : rows.length ? [top] : []).map((r) => [r.frame, barText(secondsOf(r.frame)), r.held.none, r.held.over, r.held.sparks ?? '', r.held.ratio === undefined ? '' : r.held.ratio.toFixed(1), r.held.most.toFixed(1), box(r.held.where), r.alone ? r.alone.join(', ') || 'none' : '']) },
    pictures: bad.filter((r) => r.picture).slice(0, SHOWN).map((r) => ({ file: r.picture as string, caption: `frame ${r.frame}: the pixels without a number, over ${most} or a spark before the lens, in magenta` })),
    data: { most, frames: rows.map((r) => ({ frame: r.frame, none: r.held.none, over: r.held.over, sparks: r.held.sparks ?? null, ratio: r.held.ratio ?? null, spark: r.held.spark ?? null, most: r.held.most, at: r.held.at ?? null, alone: r.alone })) },
  })
}
