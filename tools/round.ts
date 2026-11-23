import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'
import { config, timeOf } from '../src/config.ts'
import { parseArgs, str } from './lib/args.ts'
import { canvas, cropped, longEdge, scaled, strip, type Placed } from './lib/layout.ts'
import { atMasterSize, pixelsOnly, wholeImage, wholeSize } from './lib/packimage.ts'
import { at, WORK } from './lib/paths.ts'
import { encodeAgain } from './lib/video.ts'

interface Spot { label: string; x: number; y: number }
interface Shot { id: string; frame: number; judged: boolean; key: string; control?: string; controlVotes?: string; spots: Spot[]; absent?: string; settled?: string[] }
interface Run { first: number; what: string; x?: number; y?: number; round?: string }
interface Plan {
  round: number
  shots: Shot[]
  sections: { id: string; from: number; to: number }[]
  motionA: Run[]
  motionB: Run[]
  cuts: number[]
  hook: number[]
  wholeSheets: number
  stress: { frame: number; spots: Spot[] }[]
  settledMotion: string[]
  settledWhole: string[]
}

const args = parseArgs()
const plan = JSON.parse(fs.readFileSync(at('kit', 'v2', 'round.json'), 'utf8')) as Plan
const framesDir = path.resolve(str(args, 'frames'))
const film = path.resolve(str(args, 'film'))
const only = typeof args.only === 'string' ? args.only.split(',') : null
const wants = (critic: string): boolean => !only || only.includes(critic)
const R = String(plan.round).padStart(3, '0')
const out = path.join(WORK, 'round', R)
const tmp = path.join(WORK, 'round', `${R}-tmp`)
const keyFile = path.join(WORK, 'round', `${R}-key.json`)
const master = config.formats.master
const GAP = 8
const STRIP = 20
const TW = 336
const TH = 252
const pad5 = (n: number): string => String(n).padStart(5, '0')
const pad2 = (n: number): string => String(n).padStart(2, '0')
const secs = (frame: number, digits = 2): string => `${timeOf(frame).toFixed(digits)} s`
const key: Record<string, Record<string, unknown>> = fs.existsSync(keyFile) ? JSON.parse(fs.readFileSync(keyFile, 'utf8')).critics : {}

function frameFile(frame: number): string {
  const file = path.join(framesDir, `${pad5(frame)}.png`)
  if (!fs.existsSync(file)) throw new Error(`frame ${frame} is not in ${framesDir}`)
  return file
}

function selectOf(frames: number[]): string {
  const sorted = [...new Set(frames)].sort((a, b) => a - b)
  const terms: string[] = []
  for (let i = 0; i < sorted.length; i++) {
    let j = i
    while (j + 1 < sorted.length && sorted[j + 1] === sorted[j] + 1) j++
    terms.push(j > i ? `between(n\\,${sorted[i]}\\,${sorted[j]})` : `eq(n\\,${sorted[i]})`)
    i = j
  }
  return terms.join('+')
}

function fromVideo(file: string, frames: number[], tag: string, half: boolean): Map<number, string> {
  const dir = path.join(tmp, tag)
  fs.mkdirSync(dir, { recursive: true })
  const ext = half ? 'jpg' : 'png'
  const sorted = [...new Set(frames)].sort((a, b) => a - b)
  const got = new Map(sorted.map((f) => [f, path.join(dir, `${pad5(f)}.${ext}`)] as [number, string]))
  const missing = sorted.filter((f) => !fs.existsSync(got.get(f) as string))
  if (missing.length) {
    const pattern = path.join(dir, `take-%05d.${ext}`)
    const filter = `select='${selectOf(missing)}'${half ? `,scale=${master.width / 2}:${master.height / 2}:flags=lanczos` : ''}`
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', file, '-vf', filter, '-fps_mode', 'passthrough', ...(half ? ['-q:v', '2'] : []), pattern], { stdio: 'inherit' })
    missing.forEach((f, i) => fs.renameSync(path.join(dir, `take-${pad5(i + 1)}.${ext}`), got.get(f) as string))
  }
  return got
}

async function save(group: string, name: string, image: Buffer): Promise<string> {
  const file = path.join(out, group, name)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const meta = await sharp(image).metadata()
  if (Math.max(meta.width ?? 0, meta.height ?? 0) > longEdge) throw new Error(`${name} is ${meta.width} x ${meta.height}, over ${longEdge}`)
  fs.writeFileSync(file, pixelsOnly(await sharp(image).removeAlpha().png({ compressionLevel: 9 }).toBuffer()))
  return file
}

function box(spot: Spot, w: number, h: number, fw = master.width, fh = master.height): { left: number; top: number } {
  return { left: Math.max(0, Math.min(fw - w, Math.round(spot.x * fw - w / 2))), top: Math.max(0, Math.min(fh - h, Math.round(spot.y * fh - h / 2))) }
}

async function grid(tiles: { input: Buffer; label: string }[], cols: number, tw: number, th: number): Promise<Buffer> {
  const rows = Math.ceil(tiles.length / cols)
  const parts: Placed[] = []
  tiles.forEach((t, i) => {
    const left = GAP + (i % cols) * (tw + GAP)
    const top = GAP + Math.floor(i / cols) * (th + STRIP + GAP)
    parts.push({ input: t.input, left, top })
    parts.push({ input: strip(tw, STRIP, t.label), left, top: top + th })
  })
  return canvas(cols * tw + (cols + 1) * GAP, rows * (th + STRIP) + (rows + 1) * GAP, parts).png().toBuffer()
}

const manifests: Record<string, string[]> = {}
const say = (group: string, line: string): void => { (manifests[group] ??= []).push(line) }
const note = (group: string, file: string, what: Record<string, unknown>): void => { (key[group] ??= {})[file] = what }

function chunks<T>(list: T[], size: number): T[][] {
  const outList: T[][] = []
  for (let i = 0; i < list.length; i += size) outList.push(list.slice(i, i + size))
  return outList
}

function spread<T>(list: T[], groups: number): T[][] {
  const base = Math.floor(list.length / groups)
  let extra = list.length % groups
  const outList: T[][] = []
  let atIndex = 0
  for (let g = 0; g < groups; g++) {
    const size = base + (extra-- > 0 ? 1 : 0)
    outList.push(list.slice(atIndex, atIndex + size))
    atIndex += size
  }
  return outList
}

async function match(): Promise<void> {
  const groups = spread(plan.shots, Math.ceil(plan.shots.length / 3))
  for (let g = 0; g < groups.length; g++) {
    const group = groups.length > 1 ? `R1-${g + 1}` : 'R1'
    delete key[group]
    say(group, 'A file whose name ends in -a and a file whose name ends in -b with the same number are one pair. In a tile label inside a grid, a and b mean the same as -a and -b in a file name.')
    if (groups.length > 1) say(group, `This is part ${g + 1} of ${groups.length}. The parts hold different pairs of the same film and are judged the same way, each on its own.`)
    let n = 1
    for (const shot of groups[g]) {
      const pair = `set-A-${pad2(n)}`
      const gridName = `set-A-${pad2(n + 1)}.png`
      n += 2
      const frame = frameFile(shot.frame)
      await save(group, `${pair}-a.png`, await wholeImage(at(shot.key)))
      await save(group, `${pair}-b.png`, await wholeImage(frame))
      const a = await atMasterSize(at(shot.key))
      const spots = shot.spots.slice(0, 6)
      const tiles: { input: Buffer; label: string }[] = []
      for (let i = 0; i < spots.length; i++) {
        const b = box(spots[i], TW, TH)
        tiles.push({ input: await cropped(a, b.left, b.top, TW, TH), label: `region ${i + 1} · a` })
        tiles.push({ input: await cropped(frame, b.left, b.top, TW, TH), label: `region ${i + 1} · b` })
      }
      await save(group, gridName, await grid(tiles, 4, TW, TH))
      say(group, '')
      say(group, `${pair}-a.png and ${pair}-b.png: one pair, the same moment (${secs(shot.frame, 1)}), both ${wholeSize.width} x ${wholeSize.height}.`)
      say(group, `${gridName}: crops of that pair at native size (the size of ${pair}-b.png before it was made smaller to fit; ${pair}-a.png was brought to that size first), regions 1 to ${spots.length}, two regions to a row. In every region the left tile, labeled a, is cut from ${pair}-a.png and the right tile, labeled b, is cut from ${pair}-b.png, at the same place in the picture. ${spots.map((s, i) => `Region ${i + 1}: ${s.label}.`).join(' ')}`)
      if (shot.settled?.length) {
        say(group, '')
        say(group, `Settled, for ${pair}-a.png and ${pair}-b.png:`)
        for (const line of shot.settled) say(group, `- ${line}`)
      }
      note(group, `${pair}-a.png`, { what: 'target', key: shot.key, id: shot.id })
      note(group, `${pair}-b.png`, { what: 'frame', frame: shot.frame, id: shot.id })
      note(group, gridName, { what: 'crops of the pair', frame: shot.frame, id: shot.id })
    }
  }
}

async function jury(): Promise<void> {
  delete key.R2
  say('R2', 'Each file is one image. Each call receives one file and the question, and nothing else. This list is not sent with it.')
  say('R2', '')
  let n = 1
  for (const shot of plan.shots.filter((s) => s.judged)) {
    const name = `set-B-${pad2(n++)}.png`
    await save('R2', name, await wholeImage(frameFile(shot.frame)))
    say('R2', `${name}: one image, ${wholeSize.width} x ${wholeSize.height}.`)
    note('R2', name, { controls: false, frame: shot.frame, id: shot.id, what: `judged frame ${shot.frame}` })
  }
  for (const shot of plan.shots.filter((s) => s.judged && s.control && !s.controlVotes)) {
    const name = `set-B-${pad2(n++)}.png`
    await save('R2', name, await wholeImage(at(shot.control as string)))
    say('R2', `${name}: one image, ${wholeSize.width} x ${wholeSize.height}.`)
    note('R2', name, { controls: true, key: shot.control, id: shot.id, what: `control ${shot.control}` })
  }
}

async function surface(): Promise<void> {
  const groups = spread(plan.shots, Math.ceil(plan.shots.length / 4))
  for (let g = 0; g < groups.length; g++) {
    const group = groups.length > 1 ? `R3-${g + 1}` : 'R3'
    delete key[group]
    if (groups.length > 1) {
      say(group, `This is part ${g + 1} of ${groups.length}. The parts hold different frames of the same film and are judged the same way, each on its own.`)
      say(group, '')
    }
    let n = 1
    for (const shot of groups[g]) {
      const whole = `set-C-${pad2(n)}.png`
      const crops = `set-C-${pad2(n + 1)}.png`
      n += 2
      const frame = frameFile(shot.frame)
      await save(group, whole, await wholeImage(frame))
      const tiles: { input: Buffer; label: string }[] = []
      for (let i = 0; i < shot.spots.length; i++) {
        const b = box(shot.spots[i], TW, TH)
        tiles.push({ input: await cropped(frame, b.left, b.top, TW, TH), label: `crop ${i + 1}` })
      }
      await save(group, crops, await grid(tiles, 4, TW, TH))
      say(group, `${whole}: the whole frame at ${secs(shot.frame, 1)}, made smaller to fit (${wholeSize.width} x ${wholeSize.height}).`)
      say(group, `${crops}: crops of the frame at ${secs(shot.frame, 1)} at native size, the size the frame is delivered at. ${shot.spots.map((s, i) => `Crop ${i + 1}: ${s.label}.`).join(' ')}`)
      if (shot.absent) say(group, `Not shown for the frame at ${secs(shot.frame, 1)}: ${shot.absent}`)
      say(group, '')
      note(group, whole, { what: 'frame', frame: shot.frame, id: shot.id })
      note(group, crops, { what: 'crops', frame: shot.frame, id: shot.id })
    }
  }
}

async function sheetOf(frames: number[], half: Map<number, string>, spot?: Spot): Promise<Buffer> {
  const tw = 340
  const th = 191
  const tiles: { input: Buffer; label: string }[] = []
  for (const f of frames) {
    const file = half.get(f) as string
    const b = spot ? box(spot, tw, th, master.width / 2, master.height / 2) : null
    tiles.push({ input: b ? await cropped(file, b.left, b.top, tw, th) : await scaled(file, tw, th), label: `frame ${f} · ${secs(f)}` })
  }
  return grid(tiles, 4, tw, th)
}

const evenly = (from: number, to: number, count: number): number[] => Array.from({ length: count }, (_, i) => Math.round(from + ((to - from) * i) / (count - 1)))
const runOf = (first: number, count = 12): number[] => Array.from({ length: count }, (_, i) => first + i)

async function motion(): Promise<void> {
  const sheets: { group: string; frames: number[]; spot?: Spot; line: string; what: Record<string, unknown> }[] = []
  for (const s of plan.sections) {
    const frames = evenly(s.from, s.to, 12)
    sheets.push({ group: 'R4-1', frames, line: `contact sheet across one part of the film, 12 frames spread evenly from ${secs(s.from, 1)} to ${secs(s.to, 1)}, in order, reading left to right, top to bottom.`, what: { what: 'section sheet', section: s.id, frames } })
  }
  const runLine = (r: Run): string => `12 consecutive frames starting at ${secs(r.first)}, ${r.what}.${r.round ? ` Each tile is the part of the frame round ${r.round}, the same place in every frame, at 0.5 of the size the frame is delivered at.` : ' Each tile is the whole frame, made smaller to fit.'}`
  const spotOf = (r: Run): Spot | undefined => (r.x !== undefined && r.y !== undefined ? { label: r.round ?? '', x: r.x, y: r.y } : undefined)
  for (const r of plan.motionA) sheets.push({ group: 'R4-1', frames: runOf(r.first), spot: spotOf(r), line: runLine(r), what: { what: 'consecutive frames', first: r.first } })
  plan.cuts.forEach((c, i) => {
    const frames = runOf(c - 6)
    sheets.push({ group: 'R4-2', frames, line: `12 consecutive frames across cut ${i + 1} of ${plan.cuts.length} of the film. The cut falls at ${secs(c)}: frame ${c} is the first frame after it.`, what: { what: 'cut sheet', cut: c, frames } })
  })
  for (const r of plan.motionB) sheets.push({ group: 'R4-2', frames: runOf(r.first), spot: spotOf(r), line: runLine(r), what: { what: 'consecutive frames', first: r.first } })
  const half = fromVideo(film, sheets.flatMap((s) => s.frames), 'half', true)
  for (const group of ['R4-1', 'R4-2']) {
    delete key[group]
    say(group, `This is part ${group === 'R4-1' ? 1 : 2} of 2. The parts hold different pictures of the same film and are judged the same way, each on its own.`)
    say(group, '')
    say(group, 'Every tile carries its frame number and its time. The frames are 1/30 s apart where they are consecutive.')
    say(group, '')
    let n = 1
    for (const s of sheets.filter((x) => x.group === group)) {
      const name = `set-D-${pad2(n++)}.png`
      await save(group, name, await sheetOf(s.frames, half, s.spot))
      say(group, `${name}: ${s.line}`)
      note(group, name, s.what)
    }
    if (plan.settledMotion.length) {
      say(group, '')
      say(group, 'Settled, for every file:')
      for (const line of plan.settledMotion) say(group, `- ${line}`)
    }
  }
}

async function whole(): Promise<void> {
  delete key.R5
  const last = Math.round(config.film.durationSeconds * config.film.fps) - 1
  const all = evenly(0, last, plan.wholeSheets * 12)
  const half = fromVideo(film, all, 'half', true)
  say('R5', 'Every tile carries its frame number and its time.')
  say('R5', '')
  let n = 1
  const parts = chunks(all, 12)
  for (let i = 0; i < parts.length; i++) {
    const name = `set-E-${pad2(n++)}.png`
    await save('R5', name, await sheetOf(parts[i], half))
    say('R5', `${name}: contact sheet ${i + 1} of ${parts.length} across the whole film, 12 frames spread evenly from ${secs(parts[i][0], 1)} to ${secs(parts[i][11], 1)}, in order, reading left to right, top to bottom.`)
    note('R5', name, { what: 'whole film sheet', frames: parts[i] })
  }
  const tw = 688
  const th = 387
  for (const four of chunks(plan.shots, 4)) {
    const name = `set-E-${pad2(n++)}.png`
    const tiles: { input: Buffer; label: string }[] = []
    for (const shot of four) tiles.push({ input: await scaled(frameFile(shot.frame), tw, th), label: `frame ${shot.frame} · ${secs(shot.frame, 1)}` })
    await save('R5', name, await grid(tiles, 2, tw, th))
    say('R5', `${name}: ${four.length} frames of the film in order, reading left to right, top to bottom, at ${four.map((s) => secs(s.frame, 1)).join(', ')}. Each is made smaller to fit.`)
    note('R5', name, { what: 'key frames', frames: four.map((s) => s.frame) })
  }
  if (plan.settledWhole.length) {
    say('R5', '')
    say('R5', 'Settled, for every file:')
    for (const line of plan.settledWhole) say('R5', `- ${line}`)
  }
}

async function hook(): Promise<void> {
  delete key.R6
  const w = config.critics.phonePreviewWidthPx
  const h = Math.round((w * master.height) / master.width)
  say('R6', `The files are frames of the first ${config.film.hookSeconds} seconds of the film, in order, each ${w} px wide. Nothing is drawn on them.`)
  say('R6', '')
  let n = 1
  for (const f of plan.hook) {
    const name = `set-F-${pad2(n++)}.png`
    await save('R6', name, await scaled(frameFile(f), w, h))
    say('R6', `${name}: the frame at ${secs(f)}, ${w} x ${h}.`)
    note('R6', name, { what: 'frame at phone size', frame: f })
  }
}

async function stress(): Promise<void> {
  delete key.R7
  const mbps = config.quality.compressionStressMbps
  const file = path.join(tmp, `stress-${mbps}.mp4`)
  if (!fs.existsSync(file)) encodeAgain(film, file, mbps)
  const after = fromVideo(file, plan.stress.map((s) => s.frame), 'stress', false)
  const tw = 688
  const th = 387
  const cw = 680
  const ch = 240
  let n = 1
  for (const s of plan.stress) {
    const pair = `set-G-${pad2(n)}.png`
    const crops = `set-G-${pad2(n + 1)}.png`
    n += 2
    const before = frameFile(s.frame)
    const coded = after.get(s.frame) as string
    await save('R7', pair, await grid([{ input: await scaled(before, tw, th), label: 'before encoding' }, { input: await scaled(coded, tw, th), label: `after encoding at ${mbps} Mbit/s` }], 2, tw, th))
    const tiles: { input: Buffer; label: string }[] = []
    for (let i = 0; i < s.spots.length; i++) {
      const b = box(s.spots[i], cw, ch)
      tiles.push({ input: await cropped(before, b.left, b.top, cw, ch), label: `place ${i + 1} · before encoding` })
      tiles.push({ input: await cropped(coded, b.left, b.top, cw, ch), label: `place ${i + 1} · after encoding` })
    }
    await save('R7', crops, await grid(tiles, 2, cw, ch))
    say('R7', `${pair}: one frame of the film at ${secs(s.frame)}, twice, side by side: left before encoding, right after encoding at ${mbps} Mbit/s. Both are made smaller to fit.`)
    say('R7', `${crops}: crops of that pair at native size, the size the frame is delivered at, one place to a row: left before encoding, right after encoding at ${mbps} Mbit/s, the same place in both. ${s.spots.map((p, i) => `Place ${i + 1}: ${p.label}.`).join(' ')}`)
    say('R7', '')
    note('R7', pair, { what: 'before and after', frame: s.frame })
    note('R7', crops, { what: 'crops before and after', frame: s.frame })
  }
}

const HEADS: Record<string, string> = { R1: '### R1 · Match', R3: '### R3 · Surface and detail', R4: '### R4 · Motion', R5: '### R5 · The whole film', R6: '### R6 · Scroll stop', R7: '### R7 · Compression' }
const WORDS = ['Zero', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten']

function sectionOf(head: string): string {
  const bar = fs.readFileSync(at('kit', '07-QUALITY-BAR.md'), 'utf8').split('\n')
  const start = bar.indexOf(head)
  if (start < 0) throw new Error(`no section ${head}`)
  let end = start + 1
  while (end < bar.length && !bar[end].startsWith('### ') && !bar[end].startsWith('## ')) end++
  return bar.slice(start, end).join('\n').replace(/\n+$/, '')
}

function returnFormat(): string {
  const text = fs.readFileSync(at('kit', '07-QUALITY-BAR.md'), 'utf8')
  const start = text.indexOf('```json')
  const end = text.indexOf('```', start + 7)
  return text.slice(start, end + 3)
}

function messages(): void {
  for (const group of Object.keys(manifests)) {
    const dir = path.join(out, group)
    const manifest = manifests[group].join('\n').replace(/\n+$/, '')
    fs.writeFileSync(path.join(WORK, 'round', `${R}-MANIFEST-${group}.md`), `${manifest}\n`)
    if (group === 'R2') continue
    const critic = group.split('-')[0]
    const names = fs.readdirSync(dir).filter((f) => f.endsWith('.png')).sort()
    if (names.length > config.critics.maxFilesPerMessage) throw new Error(`${group} has ${names.length} files`)
    const text = [
      `You are a critic. ${WORDS[names.length]} image files are attached: ${names.join(', ')}. Look at every one of them at full size before you answer.`,
      '',
      sectionOf(HEADS[critic]),
      '',
      sectionOf('### The severity scale'),
      '',
      '### The files',
      '',
      manifest,
      '',
      '### The return format',
      '',
      `Return one JSON object in this form. \`critic\` is "${critic}". \`score\` is 1 to 10. Issues are listed most severe first.`,
      '',
      returnFormat(),
      '',
      'Send that one JSON object, and nothing else, as a message to the agent `/root`. That message is your whole answer.',
      '',
    ].join('\n')
    fs.writeFileSync(path.join(WORK, 'round', `${R}-message-${group}.txt`), text)
    console.log(`round · ${group} · ${names.length} files · message ${text.length} chars`)
  }
}

if (wants('R1')) await match()
if (wants('R2')) await jury()
if (wants('R3')) await surface()
if (wants('R4')) await motion()
if (wants('R5')) await whole()
if (wants('R6')) await hook()
if (wants('R7')) await stress()
messages()
fs.writeFileSync(keyFile, `${JSON.stringify({ round: plan.round, film: path.relative(process.cwd(), film), critics: key }, null, 2)}\n`)
console.log(`round · packs in ${path.relative(process.cwd(), out)} · key ${path.relative(process.cwd(), keyFile)}`)
