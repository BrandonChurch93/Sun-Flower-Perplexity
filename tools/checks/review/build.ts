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

// The review page: one static page, built from what is in out/ and from nothing else. What is missing is said to be missing.
//   npm run checks -- review                 builds out/work/checks/review/index.html
//   npm run checks -- review --draw          first draws the film's frame for every look at 960 x 540 (one sample)
//   npm run checks -- review --draw --tier review     the same with the samples of the export
// No audio is read, copied or written. The page lets its viewer pick the track from their own disk and plays it in step.
const SITE = path.join(OUT, 'review')
const LOOKS = path.join(OUT, 'looks')
const CHECKS = ['holds', 'nights', 'cuts', 'made', 'cues', 'pure']
const FPS = config.film.fps

const rel = (file: string): string => path.relative(SITE, file).split(path.sep).join('/')

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

export async function run(args: Args): Promise<void> {
  if (flag(args, 'draw')) await drawLooks(args)
  fs.rmSync(SITE, { recursive: true, force: true })
  for (const d of ['looks', 'clips', 'checks']) fs.mkdirSync(path.join(SITE, d), { recursive: true })
  const hash = engineHash()
  const lines = readLines('film')
  const stamp = readStamp('film')
  const drawn = [...lines.keys()].sort((a, b) => a - b)
  const missing: string[] = []

  let film: { file: string; note: string } | null = null
  if (filmOf(drawn, 0, frameCount - 1, path.join(SITE, 'film.mp4'))) {
    film = { file: 'film.mp4', note: `${drawn.length} of ${frameCount} frames drawn at ${stamp?.width} x ${stamp?.height}, one sample a frame${drawn.length < frameCount ? '. A frame that is not drawn yet shows the last one before it' : ''}` }
  } else missing.push('the whole film: no frames drawn yet. Run "npm run checks -- play"')

  const sections = []
  for (const s of segments) {
    const file = path.join(SITE, 'clips', `${s.id}.mp4`)
    const have = drawn.filter((f) => f >= s.firstFrame && f <= s.lastFrame).length
    const made = filmOf(drawn, s.firstFrame, s.lastFrame, file)
    if (!made) missing.push(`the clip of ${s.name}`)
    sections.push({ id: s.id, name: s.name, kind: s.kind, fromBar: s.fromBar, toBar: s.toBar, start: s.start, end: s.end, firstFrame: s.firstFrame, lastFrame: s.lastFrame, clip: made ? rel(file) : null, drawn: have, frames: s.frames })
  }

  const looks = []
  for (const k of keys) {
    const own = path.join(LOOKS, `${k.id}.png`)
    const small = frameFile('film', k.frame)
    const from = fs.existsSync(own) ? own : fs.existsSync(small) ? small : null
    let filmFile: string | null = null
    let source = ''
    if (from) {
      filmFile = path.join(SITE, 'looks', `${k.id}-film.jpg`)
      await jpeg(from, filmFile, 1280)
      const meta = await sharp(from).metadata()
      source = `${meta.width} x ${meta.height}${from === small ? ', from the small drawing of the whole film' : ''}`
    } else missing.push(`the film's frame for the look "${k.id}"`)
    const refFrom = at(k.image)
    let refFile: string | null = null
    if (fs.existsSync(refFrom)) {
      refFile = path.join(SITE, 'looks', `${k.id}-reference.jpg`)
      await jpeg(refFrom, refFile, 1280)
    } else missing.push(`the reference ${k.image}`)
    looks.push({ id: k.id, section: segments.find((s) => s.id === k.unit)?.name ?? k.unit, frame: k.frame, seconds: k.time, bar: barText(k.time), film: filmFile ? rel(filmFile) : null, reference: refFile ? rel(refFile) : null, referencePath: k.image, source })
  }

  const checks = []
  for (const name of CHECKS) {
    const read = async (file: string): Promise<Result | null> => {
      if (!fs.existsSync(file)) return null
      const r = JSON.parse(fs.readFileSync(file, 'utf8')) as Result
      const pictures = []
      for (const p of r.pictures ?? []) {
        if (!fs.existsSync(p.file)) continue
        const to = path.join(SITE, 'checks', `${path.basename(file, '.json')}-${path.basename(p.file).replace(/\.png$/, '.jpg')}`)
        await jpeg(p.file, to, 2400)
        pictures.push({ file: rel(to), caption: p.caption })
      }
      return { ...r, pictures, data: undefined }
    }
    const result = await read(path.join(OUT, `${name}.json`))
    if (!result) missing.push(`the result of the check "${name}". Run "npm run checks -- ${name}"`)
    const coarse = []
    const broken = []
    for (const f of fs.readdirSync(OUT).sort()) {
      if (f.startsWith(`${name}.broken-`) && f.endsWith('.json')) broken.push(await read(path.join(OUT, f)))
      if (f.startsWith(`${name}.every-`) && f.endsWith('.json') && !f.includes('.broken-')) coarse.push(await read(path.join(OUT, f)))
    }
    checks.push({ name, result, coarse, broken, stale: result ? result.engineHash !== hash : false })
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
  fs.writeFileSync(path.join(SITE, 'index.html'), page)
  let bytes = 0
  const walk = (dir: string): void => {
    for (const n of fs.readdirSync(dir)) {
      const p = path.join(dir, n)
      if (fs.statSync(p).isDirectory()) walk(p)
      else bytes += fs.statSync(p).size
    }
  }
  walk(SITE)
  console.log(`review · ${path.relative(process.cwd(), path.join(SITE, 'index.html'))} · ${(bytes / 1048576).toFixed(1)} MB · ${looks.filter((l) => l.film).length} of ${looks.length} looks, ${sections.filter((s) => s.clip).length} of ${sections.length} clips, ${checks.filter((c) => c.result).length} of ${checks.length} checks${film ? ', the whole film' : ''}`)
  for (const m of missing) console.log(`review · missing: ${m}`)
}
