import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { config, frameCount } from '../src/config.ts'
import { formatById, isTier } from '../src/core/tiers.ts'
import { nothingMade, type Made } from '../src/v2/counter.ts'
import { barAt, barTime } from '../src/v2/clock.ts'
import { shots, type Shot } from '../src/v2/shots.ts'
import { flag, num, parseArgs, str } from './lib/args.ts'
import { canvas, scaled, strip, type Placed } from './lib/layout.ts'
import { WORK } from './lib/paths.ts'
import { openSession, type Session } from './lib/render.ts'

// The bench draws the film's own moments from fixed cameras with a chosen sky and a chosen set of things in the picture, through the film's own lens and grade.
//   npm run bench -- --sky sky-a                         every shot of the list, sky and ground only, 960 x 540, one sample
//   npm run bench -- --sky sky-a --shots 05,12 --format 16x9 --tier review
//   npm run bench -- --sky sky-a --only all              the whole scene
//   npm run bench -- --sky sky-a --clip 73,85 --view wide   a clip of film seconds 73 to 85 from one camera
//   npm run bench -- --sky sky-a --only all --bars 17,21,25 --name frost   the film's own camera at those bars, on one sheet
//   npm run bench -- --sky sky-a --only all --frames 1368-1376,1400 --name dawn   the film's own camera at those frames
//   npm run bench -- --sky sky-a --count                 plays 200 frames across the film and says what the graphics card was asked to make after loading
//   npm run bench -- --sky sky-0 --only ground,plant,field --still --view wide --shots 07   the world at rest: no weather, no wind, one fixed sun

const fps = config.film.fps
const frameAt = (seconds: number): number => Math.min(frameCount - 1, Math.max(0, Math.round(seconds * fps)))
const clock = (seconds: number): string => `${seconds.toFixed(2)} s · bar ${barAt(seconds).toFixed(2)}`

async function setView(session: Session, view: string): Promise<void> {
  await session.page.evaluate((v) => window.showcase.setView(v), view)
}

async function sheet(files: { file: string; label: string }[], out: string, cols: number): Promise<void> {
  const w = 632
  const h = Math.round((w * 9) / 16)
  const gap = 8
  const bar = 22
  const rows = Math.ceil(files.length / cols)
  const parts: Placed[] = []
  for (let i = 0; i < files.length; i++) {
    const left = gap + (i % cols) * (w + gap)
    const top = gap + Math.floor(i / cols) * (h + bar + gap)
    parts.push({ input: await scaled(files[i].file, w, h), left, top })
    parts.push({ input: strip(w, bar, files[i].label), left, top: top + h })
  }
  await canvas(cols * (w + gap) + gap, rows * (h + bar + gap) + gap, parts).jpeg({ quality: 90 }).toFile(out)
}

const args = parseArgs()
const sky = str(args, 'sky', 'sky')
const onlyArg = str(args, 'only', 'sky,ground')
const only = onlyArg === 'all' ? '' : onlyArg
const format = formatById(str(args, 'format', 'preview')).id
const tier = str(args, 'tier', 'draft')
if (!isTier(tier)) throw new Error(`unknown tier "${tier}"`)
const quality = str(args, 'quality', '')
const dir = path.join(WORK, 'bench', sky)
fs.mkdirSync(dir, { recursive: true })
const extra = new URLSearchParams({ sky, ...(only ? { only } : {}), ...(quality ? { quality } : {}) }).toString()
const session = await openSession({ format, extra, what: 'bench' })
try {
  const drawn = await session.page.evaluate(() => window.showcase.sky())
  if (drawn !== sky) throw new Error(`there is no sky in src/${sky}: the page drew "${drawn}"`)
  if (flag(args, 'still')) await session.page.evaluate(() => window.showcase.setStill(true))
  const info = await session.info()
  console.log(`bench · sky ${sky} · ${format} · ${tier} · ${only || 'everything'} · textures ${info.textureMb.toFixed(0)} MB · loaded in ${session.startSeconds.toFixed(1)} s`)
  if (flag(args, 'count')) {
    const frames = Array.from({ length: 200 }, (_, i) => Math.round((i * (frameCount - 1)) / 199))
    await session.page.evaluate((t) => window.showcase.warm(t), tier)
    const before = await session.page.evaluate(() => window.showcase.made())
    let slowest = 0
    let total = 0
    for (const f of frames) {
      const s = await session.time(f, tier)
      total += s
      slowest = Math.max(slowest, s)
    }
    const after = await session.page.evaluate(() => window.showcase.made())
    const made = { ...after } as Made
    for (const key of Object.keys(made) as (keyof Made)[]) made[key] -= before[key]
    console.log(`count · 200 frames after loading · mean ${(total / frames.length).toFixed(2)} s, slowest ${slowest.toFixed(2)} s a frame here (software rendering)`)
    console.log(`count · made after loading: ${JSON.stringify(made)}`)
    console.log(nothingMade(made) ? 'count · PASS: nothing was made after loading' : 'count · FAIL: the graphics card was asked to make something after loading')
    fs.writeFileSync(path.join(dir, 'count.json'), JSON.stringify({ sky, format, tier, frames: frames.length, made, meanSeconds: total / frames.length, slowestSeconds: slowest }, null, 2))
    if (!nothingMade(made)) process.exitCode = 1
  } else if (typeof args.clip === 'string') {
    const [from, to] = args.clip.split(',').map(Number)
    const view = str(args, 'view', 'wide')
    const step = num(args, 'step', 1)
    await setView(session, view)
    const frames: number[] = []
    for (let f = frameAt(from); f <= frameAt(to); f += step) frames.push(f)
    const tmp = path.join(dir, `clip-${view}-${from}-${to}`)
    fs.rmSync(tmp, { recursive: true, force: true })
    fs.mkdirSync(tmp, { recursive: true })
    let total = 0
    for (let i = 0; i < frames.length; i++) {
      const { png, seconds } = await session.render(frames[i], tier)
      total += seconds
      fs.writeFileSync(path.join(tmp, `${String(i).padStart(5, '0')}.png`), png)
      if (i % 30 === 0) console.log(`clip · frame ${frames[i]} (${i + 1} of ${frames.length}) · ${seconds.toFixed(1)} s`)
    }
    const file = path.join(dir, `clip-${view}-${from}-${to}.mp4`)
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(fps / step), '-i', path.join(tmp, '%05d.png'), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '16', '-movflags', '+faststart', file])
    fs.rmSync(tmp, { recursive: true, force: true })
    console.log(`clip · ${frames.length} frames · ${(total / frames.length).toFixed(1)} s a frame · ${path.relative(process.cwd(), file)}`)
  } else {
    const wanted = str(args, 'shots', 'all')
    const atBars = typeof args.bars === 'string' ? args.bars.split(',').map(Number) : null
    const atFrames = typeof args.frames === 'string' ? args.frames.split(',').flatMap((x) => {
      const [a, b] = x.split('-').map(Number)
      return Array.from({ length: (b ?? a) - a + 1 }, (_, i) => a + i)
    }) : null
    const list: Shot[] = atFrames ? atFrames.map((f) => ({ id: `frame-${String(f).padStart(5, '0')}`, seconds: f / fps, view: 'film', what: '' })) : atBars ? atBars.map((b) => ({ id: `bar-${b.toFixed(2)}`, seconds: Math.max(0, barTime(b)), view: 'film', what: '' })) : wanted === 'all' ? shots : wanted.split(',').map((id) => {
      const s = shots.find((x) => x.id === id || x.id.startsWith(`${id}-`) || x.id.slice(3) === id)
      if (!s) throw new Error(`unknown shot "${id}"`)
      return s
    })
    const viewOver = typeof args.view === 'string' ? args.view : null
    const files: { file: string; label: string }[] = []
    for (const s of list) {
      const view = viewOver ?? s.view
      await setView(session, view)
      const { png, seconds } = await session.render(frameAt(s.seconds), tier)
      const file = path.join(dir, `${s.id}${viewOver ? `-${viewOver}` : ''}-${format}-${tier}.png`)
      fs.writeFileSync(file, png)
      files.push({ file, label: `${s.id} · ${clock(s.seconds)} · ${view}` })
      console.log(`shot · ${s.id} · ${clock(s.seconds)} · ${view} · ${seconds.toFixed(1)} s · ${path.relative(process.cwd(), file)}`)
    }
    if (files.length > 1) {
      const out = path.join(dir, `${str(args, 'name', atFrames ? 'frames' : atBars ? 'bars' : 'sheet')}-${format}-${tier}.jpg`)
      await sheet(files, out, num(args, 'cols', 4))
      console.log(`sheet · ${path.relative(process.cwd(), out)}`)
    }
  }
} finally {
  await session.close()
}
