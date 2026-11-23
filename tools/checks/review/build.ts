import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'
import { config, frameCount } from '../../../src/config.ts'
import { keys, segments } from '../../../src/director/timeline.ts'
import { barTime } from '../../../src/v2/clock.ts'
import type { Args } from '../../lib/args.ts'
import { flag, num, str } from '../../lib/args.ts'
import { at } from '../../lib/paths.ts'
import { barText, holds, secondsOf } from '../lib/film.ts'
import { frameFile, readLines, readStamp } from '../lib/play.ts'
import { engineHash, OUT, type Result } from '../lib/report.ts'
import { openSession } from '../lib/session.ts'
import { codeFilm, cutClip, FILM_SHARE, filmNote, frameOf, MOST_WIDE, pictureFile, probe, rateFor, SMALL_WIDE } from './film.ts'
import { shots } from './shot.ts'

// The review page: one static page, built from what is in out/ and from nothing else. What is missing is said to be missing.
//   npm run checks -- review                 builds out/work/checks/review/index.html
//   npm run checks -- review --draw          first draws the film's frame for every look at 960 x 540 (one sample)
//   npm run checks -- review --draw --tier review     the same with the samples of the export
//   npm run checks -- review --shot          also takes pictures of the page, wide and narrow
//   npm run checks -- review --film film.mp4 --looks-from frames --live live/index.html --out site
//       --tier-name review and --film-build <hash> go into the note under the film; --limit-mb 400 is the most the site may take
//       the whole film and every section's clip come from the drawn film file, the looks from its lossless frames (00236.png), with a link to the film played live, written to another folder
// No audio is read, copied or written. The page lets its viewer pick the track from their own disk and plays it in step.
const SITE = path.join(OUT, 'review')
const LOOKS = path.join(OUT, 'looks')
const CHECKS = ['holds', 'nights', 'cuts', 'made', 'script', 'cues', 'pure']
const FPS = config.film.fps

function ffmpeg(args: string[]): void {
  execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], { stdio: ['ignore', 'ignore', 'inherit'] })
}

// A silent film of the frames that exist between two frames. A frame that is not drawn yet is stood in for by the last one before it.
function filmOf(frames: number[], first: number, last: number, file: string): boolean {
  const mine = frames.filter((f) => f >= first && f <= last)
  if (mine.length < 2) return false
  const list = file + '.txt'
  const lines: string[] = []
  for (let i = 0; i < mine.length; i++) {
    const from = i === 0 ? first : mine[i]
    const to = i + 1 < mine.length ? mine[i + 1] : last + 1
    lines.push(`file '${frameFile('film', mine[i])}'`, `duration ${((to - from) / FPS).toFixed(6)}`)
  }
  lines.push(`file '${frameFile('film', mine[mine.length - 1])}'`)
  fs.writeFileSync(list, lines.join('\n') + '\n')
  ffmpeg(['-f', 'concat', '-safe', '0', '-i', list, '-vf', `fps=${FPS}`, '-frames:v', String(last - first + 1), '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '16', '-g', '15', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an', file])
  fs.rmSync(list)
  return true
}

async function jpeg(from: string, to: string, width: number): Promise<void> {
  await sharp(from).resize({ width, withoutEnlargement: true }).jpeg({ quality: 88 }).toFile(to)
}

async function drawLooks(args: Args): Promise<void> {
  const tier = str(args, 'tier', 'draft')
  const width = num(args, 'width', config.formats.preview.width)
  const height = num(args, 'height', config.formats.preview.height)
  fs.mkdirSync(LOOKS, { recursive: true })
  const session = await openSession({ width, height, sky: typeof args.sky === 'string' ? args.sky : undefined })
  try {
    for (const k of keys) {
      const file = path.join(LOOKS, `${k.id}.png`)
      const stamp = `${file}.json`
      const want = { hash: session.hash, frame: k.frame, width, height, tier, sky: session.info.sky }
      if (fs.existsSync(file) && fs.existsSync(stamp) && fs.readFileSync(stamp, 'utf8') === JSON.stringify(want)) continue
      const d = await session.draw(k.frame, tier)
      fs.writeFileSync(file, d.png as Buffer)
      fs.writeFileSync(stamp, JSON.stringify(want))
      console.log(`review · look ${k.id} · frame ${k.frame} drawn in ${d.seconds.toFixed(1)} s`)
    }
  } finally {
    await session.close()
  }
}

function bytesOf(dir: string): number {
  let bytes = 0
  for (const n of fs.readdirSync(dir)) {
    const p = path.join(dir, n)
    bytes += fs.statSync(p).isDirectory() ? bytesOf(p) : fs.statSync(p).size
  }
  return bytes
}

export async function run(args: Args): Promise<void> {
  if (flag(args, 'draw')) await drawLooks(args)
  const site = typeof args.out === 'string' ? path.resolve(args.out) : SITE
  const rel = (file: string): string => path.relative(site, file).split(path.sep).join('/')
  const source = typeof args.film === 'string' ? path.resolve(args.film) : null
  const looksFrom = typeof args['looks-from'] === 'string' ? path.resolve(args['looks-from']) : null
  const live = typeof args.live === 'string' ? args.live : null
  const LIMIT_MB = num(args, 'limit-mb', 400)
  if (source && !fs.existsSync(source)) throw new Error(`there is no film file at ${source}`)
  if (looksFrom && !fs.existsSync(looksFrom)) throw new Error(`there is no folder of frames at ${looksFrom}`)
  if (live && /^([a-z]+:)?\/\//i.test(live)) throw new Error('--live is a path beside the page, as in live/index.html')
  if (source && path.resolve(source).startsWith(site + path.sep)) throw new Error('the film file lies inside the folder the site is written to, which is emptied first: keep it elsewhere')
  fs.rmSync(site, { recursive: true, force: true })
  for (const d of ['looks', 'clips', 'checks']) fs.mkdirSync(path.join(site, d), { recursive: true })
  const hash = engineHash()
  const lines = readLines('film')
  const stamp = readStamp('film')
  const drawn = [...lines.keys()].sort((a, b) => a - b)
  const missing: string[] = []
  // The frames that are drawn, as stretches of neighbours: [first, last].
  const ranges: [number, number][] = []
  for (const f of drawn) {
    const last = ranges[ranges.length - 1]
    if (last && f === last[1] + 1) last[1] = f
    else ranges.push([f, f])
  }

  let film: { file: string; note: string } | null = null
  const held = source ? probe(source) : null
  const clipWide = { now: MOST_WIDE }
  if (source && held) {
    if (held.frames !== frameCount) missing.push(`the film file holds ${held.frames} frames and the film has ${frameCount}`)
    codeFilm(source, path.join(site, 'film.mp4'), MOST_WIDE)
    film = { file: 'film.mp4', note: filmNote(held, frameCount, str(args, 'tier-name', 'draft')) + (typeof args['film-build'] === 'string' ? `, build ${args['film-build']}` : '') }
    ranges.length = 0
    ranges.push([0, Math.min(held.frames, frameCount) - 1])
    // Clips coded as the film is come to about its size again: when that alone would pass the limit they are made narrow at once.
    if (2 * fs.statSync(path.join(site, 'film.mp4')).size > LIMIT_MB * 1048576 * 0.9) clipWide.now = SMALL_WIDE
  } else if (filmOf(drawn, 0, frameCount - 1, path.join(site, 'film.mp4'))) {
    film = { file: 'film.mp4', note: `${drawn.length} of ${frameCount} frames drawn at ${stamp?.width} x ${stamp?.height}, one sample a frame${drawn.length < frameCount ? '. A frame that is not drawn yet shows the last drawn one before it, and the line under the film names the frame you see' : ''}` }
  } else missing.push('the whole film: no frames drawn yet. Run "npm run checks -- play"')

  const sections = []
  for (const s of segments) {
    const file = path.join(site, 'clips', `${s.id}.mp4`)
    const lastHeld = held ? Math.min(s.lastFrame, held.frames - 1) : -1
    const have = held ? Math.max(0, lastHeld - s.firstFrame + 1) : drawn.filter((f) => f >= s.firstFrame && f <= s.lastFrame).length
    if (source && have > 0) cutClip(source, s.firstFrame, lastHeld, FPS, file, clipWide.now)
    const made = source ? have > 0 : filmOf(drawn, s.firstFrame, s.lastFrame, file)
    if (!made) missing.push(`the clip of ${s.name}`)
    sections.push({ id: s.id, name: s.name, kind: s.kind, fromBar: s.fromBar, toBar: s.toBar, start: s.start, end: s.end, firstFrame: s.firstFrame, lastFrame: s.lastFrame, clip: made ? rel(file) : null, drawn: have, frames: s.frames })
  }

  const looks = []
  for (const k of keys) {
    const own = path.join(LOOKS, `${k.id}.png`)
    const small = frameFile('film', k.frame)
    const whole = looksFrom ? path.join(looksFrom, `${String(k.frame).padStart(5, '0')}.png`) : ''
    // With a film file and no lossless frame, the look is the film file's own frame: coded, but the frame that was drawn.
    const cut = source && held && k.frame < held.frames && !(whole && fs.existsSync(whole)) ? path.join(site, 'looks', `${k.id}-cut.png`) : ''
    if (cut && source) frameOf(source, k.frame, cut)
    const from = whole && fs.existsSync(whole) ? whole : cut ? cut : fs.existsSync(own) ? own : fs.existsSync(small) ? small : null
    let filmFile: string | null = null
    let drawnAs = ''
    if (from) {
      filmFile = path.join(site, 'looks', `${k.id}-film.jpg`)
      await jpeg(from, filmFile, 1280)
      const meta = await sharp(from).metadata()
      drawnAs = `${meta.width} x ${meta.height}${from === small ? ', from the small drawing of the whole film' : from === whole ? ', the frame of the drawn film' : from === cut ? ', cut from the film file' : ''}`
      if (cut) fs.rmSync(cut, { force: true })
    } else missing.push(`the film's frame for the look "${k.id}"`)
    const refFrom = at(k.image)
    let refFile: string | null = null
    if (fs.existsSync(refFrom)) {
      refFile = path.join(site, 'looks', `${k.id}-reference.jpg`)
      await jpeg(refFrom, refFile, 1280)
    } else missing.push(`the reference ${k.image}`)
    looks.push({ id: k.id, section: segments.find((s) => s.id === k.unit)?.name ?? k.unit, frame: k.frame, seconds: k.time, bar: barText(k.time), film: filmFile ? rel(filmFile) : null, reference: refFile ? rel(refFile) : null, referencePath: k.image, source: drawnAs })
  }

  const checks = []
  for (const name of CHECKS) {
    const read = async (file: string): Promise<Result | null> => {
      if (!fs.existsSync(file)) return null
      const r = JSON.parse(fs.readFileSync(file, 'utf8')) as Result
      const pictures = []
      for (const p of r.pictures ?? []) {
        const there = pictureFile(p.file, file, OUT)
        if (!there) {
          missing.push(`a picture of the check "${path.basename(file, '.json')}": ${path.basename(p.file)}`)
          continue
        }
        const to = path.join(site, 'checks', `${path.basename(file, '.json')}-${path.basename(p.file).replace(/\.(png|svg)$/, '.jpg')}`)
        await jpeg(there, to, 2400)
        pictures.push({ file: rel(to), caption: p.caption })
      }
      return { ...r, pictures, data: undefined }
    }
    const result = await read(path.join(OUT, `${name}.json`))
    if (!result) missing.push(`the result of the check "${name}". Run "npm run checks -- ${name}"`)
    const coarse = []
    const broken = []
    // Other runs of the same check on the film of this page: a span read apart, a traced run that names what it found.
    const more = []
    for (const f of fs.readdirSync(OUT).sort()) {
      if (!f.startsWith(`${name}.`) || !f.endsWith('.json') || f === `${name}.json`) continue
      if (f.startsWith(`${name}.broken-`)) broken.push(await read(path.join(OUT, f)))
      else if (f.startsWith(`${name}.every-`)) {
        if (!f.includes('.broken-')) coarse.push(await read(path.join(OUT, f)))
      } else if (!f.includes('broken')) {
        const r = await read(path.join(OUT, f))
        if (r && r.engineHash === hash && r.check === name && Array.isArray(r.findings)) more.push({ ...r, run: f.slice(name.length + 1, -5) })
      }
    }
    checks.push({ name, result, coarse, broken, more, stale: result ? result.engineHash !== hash : false })
  }

  const bars = []
  for (let n = 1; barTime(n) < config.film.durationSeconds; n++) bars.push({ n, t: barTime(n) })
  const data = {
    name: config.name,
    built: new Date().toISOString(),
    engineHash: hash,
    fps: FPS,
    frames: frameCount,
    seconds: config.film.durationSeconds,
    bars,
    beatsPerBar: config.music.beatsPerBar,
    track: config.music.title,
    holds: holds.map((h) => ({ name: h.name, first: h.first, last: h.last, from: secondsOf(h.first), to: secondsOf(h.last + 1) })),
    film,
    live,
    drawn: ranges,
    sections,
    looks,
    checks,
    missing,
  }
  const here = at('tools', 'checks', 'review')
  const page = fs.readFileSync(path.join(here, 'page.html'), 'utf8')
    .replace('/*STYLE*/', () => fs.readFileSync(path.join(here, 'page.css'), 'utf8'))
    .replace('/*SCRIPT*/', () => fs.readFileSync(path.join(here, 'page.js'), 'utf8'))
    .replace('/*DATA*/', () => JSON.stringify(data).replace(/</g, '\\u003c'))
  fs.writeFileSync(path.join(site, 'index.html'), page)
  // The whole site stays under the limit: the clips are made narrow first, then the film is given what the rest leaves.
  const limit = LIMIT_MB * 1048576
  if (source && bytesOf(site) > limit && clipWide.now > SMALL_WIDE) {
    clipWide.now = SMALL_WIDE
    for (const s of sections) if (s.clip) cutClip(source, s.firstFrame, Math.min(s.lastFrame, (held as { frames: number }).frames - 1), FPS, path.join(site, s.clip), SMALL_WIDE)
    console.log(`review · over ${LIMIT_MB} MB: the clips are made ${SMALL_WIDE} wide`)
  }
  for (let turn = 0; source && held && bytesOf(site) > limit && turn < 6; turn++) {
    const filmFile = path.join(site, 'film.mp4')
    const clipBytes = bytesOf(path.join(site, 'clips'))
    const other = bytesOf(site) - fs.statSync(filmFile).size - clipBytes
    const room = limit - other
    const seconds = config.film.durationSeconds
    const less = 0.9 ** turn
    let forFilm = room - clipBytes
    if (forFilm < FILM_SHARE * room) {
      forFilm = FILM_SHARE * room
      const kbps = Math.floor(rateFor(room - forFilm, 0, seconds) * less)
      if (kbps < 200) throw new Error(`the site without the film and the clips already takes ${(other / 1048576).toFixed(0)} MB of ${LIMIT_MB}: there is no room for them`)
      for (const s of sections) if (s.clip) cutClip(source, s.firstFrame, Math.min(s.lastFrame, held.frames - 1), FPS, path.join(site, s.clip), SMALL_WIDE, kbps)
      console.log(`review · over ${LIMIT_MB} MB: the clips are coded at ${kbps} kilobits a second`)
    }
    const kbps = Math.floor(rateFor(forFilm, 0, seconds) * less)
    if (kbps < 300) throw new Error(`the site without the whole film already takes ${((other + clipBytes) / 1048576).toFixed(0)} MB of ${LIMIT_MB}: there is no room for the film`)
    codeFilm(source, filmFile, MOST_WIDE, kbps)
    console.log(`review · over ${LIMIT_MB} MB: the whole film is coded at ${kbps} kilobits a second`)
  }
  const bytes = bytesOf(site)
  if (bytes > limit) throw new Error(`the site takes ${(bytes / 1048576).toFixed(0)} MB, over ${LIMIT_MB}`)
  if (source) console.log(`review · the film file: ${(held as { frames: number }).frames} frames, ${held?.width} x ${held?.height}${held?.audio ? `, ${held.audio} audio streams left out` : ', no audio'} · clips ${clipWide.now} wide at most`)
  console.log(`review · ${path.relative(process.cwd(), path.join(site, 'index.html'))} · ${(bytes / 1048576).toFixed(1)} MB · ${looks.filter((l) => l.film).length} of ${looks.length} looks, ${sections.filter((s) => s.clip).length} of ${sections.length} clips, ${checks.filter((c) => c.result).length} of ${checks.length} checks${film ? ', the whole film' : ''}`)
  for (const m of missing) console.log(`review · missing: ${m}`)
  if (flag(args, 'shot')) for (const f of await shots(site)) console.log(`review · picture of the page: ${path.relative(process.cwd(), f)}`)
}
