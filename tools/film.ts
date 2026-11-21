import fs from 'node:fs'
import path from 'node:path'
import { config, frameCount, timeOf } from '../src/config.ts'
import { formatById, isTier } from '../src/core/tiers.ts'
import type { FrameCheck } from '../src/director/film.ts'
import { segmentById, segments } from '../src/director/timeline.ts'
import { flag, num, parseArgs, str } from './lib/args.ts'
import { frameCheck } from './lib/checked.ts'
import { computeHashes } from './lib/hashes.ts'
import { ensureDir, rel, sameFrames } from './lib/layout.ts'
import { addLook } from './lib/looks.ts'
import { m1Of, type M1Result } from './lib/m1.ts'
import { isMain } from './lib/main.ts'
import { WORK } from './lib/paths.ts'
import { matches, readRecord, writeRecord, type Record_ } from './lib/record.ts'
import { openSession, recordBase, type Session } from './lib/render.ts'
import { bitrateFor, encodeAgain, encodeFrames, joinChunks, probe, probeLine } from './lib/video.ts'

export interface FilmOptions { tier: string; format: string; assets: string }
export interface M1Summary { checked: number; failed: number[] }
export interface Chunk { unit: string; file: string; frames: [number, number]; m1: M1Summary; m1Details: Record<string, M1Result>; reused: boolean }

const fps = config.film.fps
const FRAMES = path.join(WORK, 'frames')
const FILM = path.join(WORK, 'film')
const LOOK_MINUTES = Math.min(25, config.budget.statusMaxGapMinutes)
const PRINT_SECONDS = 25

export class Job {
  private session: Session | null = null
  private base: Omit<Record_, 'frames'> | null = null
  private timer: NodeJS.Timeout | null = null
  private unit = ''
  private done = 0
  private rendered = 0
  private renderSeconds = 0
  private lastLook = Date.now()
  constructor(readonly o: FilmOptions, private total: number, readonly what = 'film', private lookMinutes = LOOK_MINUTES) {}

  async open(): Promise<Session> {
    if (!this.session) {
      this.session = await openSession({ format: this.o.format, assets: this.o.assets, diag: 'beauty', what: this.what })
      this.base = recordBase(this.session, await this.session.info(), 'chunk', 'beauty')
    }
    return this.session
  }

  recordBase(): Omit<Record_, 'frames'> | null {
    return this.base
  }

  begin(unit: string): void {
    this.unit = unit
    if (!this.timer) {
      this.timer = setInterval(() => this.print(), PRINT_SECONDS * 1000)
      this.timer.unref()
    }
  }

  skip(count: number): void {
    this.done += count
  }

  frame(frame: number, seconds: number, file: string): void {
    this.done++
    this.rendered++
    this.renderSeconds += seconds
    if (Date.now() - this.lastLook >= this.lookMinutes * 60000) {
      this.lastLook = Date.now()
      addLook(file, `Film job: frame ${frame} (${timeOf(frame).toFixed(1)} s, ${this.unit}) at the ${this.o.tier} tier in the ${this.o.format} format`, 'film job', true)
    }
  }

  print(): void {
    const per = this.rendered ? this.renderSeconds / this.rendered : 0
    const minutes = (Math.max(0, this.total - this.done) * per) / 60
    console.log(`unit ${this.unit} · frame ${this.done} of ${this.total} · ${per.toFixed(2)} s per frame · about ${minutes < 1 ? 'under 1' : Math.round(minutes)} min left`)
  }

  async close(): Promise<void> {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
    if (this.session) await this.session.close()
    this.session = null
  }
}

export function chunkRange(unit: string, first = 0, last = frameCount - 1): [number, number] | null {
  const s = segmentById(unit)
  const a = Math.max(s.firstFrame, first)
  const b = Math.min(s.lastFrame, last)
  return a <= b ? [a, b] : null
}

export function chunkPath(unit: string, o: FilmOptions, range: [number, number]): string {
  const s = segmentById(unit)
  const whole = range[0] === s.firstFrame && range[1] === s.lastFrame
  return path.join(FILM, `chunk-${unit}-${o.format}-${o.tier}-${o.assets}${whole ? '' : `-${range[0]}-${range[1]}`}.mp4`)
}

export function chunkIsCurrent(unit: string, o: FilmOptions, range: [number, number]): Chunk | null {
  const file = chunkPath(unit, o, range)
  const record = readRecord(file)
  if (!matches(record, computeHashes(), { kind: 'chunk', format: o.format, tier: o.tier, assets: o.assets, diag: 'beauty', units: [unit] }) || !sameFrames(record?.frames, range)) return null
  return { unit, file, frames: range, m1: record?.m1 as M1Summary, m1Details: (record?.m1Details ?? {}) as Record<string, M1Result>, reused: true }
}

const frameName = (frame: number): string => `f${String(frame).padStart(6, '0')}.png`

function countFrames(dir: string): number {
  if (!fs.existsSync(dir)) return 0
  let n = 0
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name)
    if (fs.statSync(p).isDirectory()) n += countFrames(p)
    else if (name.endsWith('.png')) n++
  }
  return n
}

function makeRoom(own: string, needed: number): void {
  if (!fs.existsSync(FRAMES)) return
  const others = fs
    .readdirSync(FRAMES)
    .map((name) => path.join(FRAMES, name))
    .filter((p) => p !== own && fs.statSync(p).isDirectory())
    .sort((a, b) => fs.statSync(a).mtimeMs - fs.statSync(b).mtimeMs)
  for (const dir of others) {
    if (countFrames(FRAMES) + needed <= config.sandbox.maxFramesOnDisk) return
    fs.rmSync(dir, { recursive: true, force: true })
  }
}

interface SavedJob { identity: unknown; base: Omit<Record_, 'frames'> | null }

function readJob(file: string): SavedJob | null {
  if (!fs.existsSync(file)) return null
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as SavedJob
  } catch {
    return null
  }
}

export async function renderChunk(unit: string, job: Job, range: [number, number]): Promise<Chunk> {
  const o = job.o
  const count = range[1] - range[0] + 1
  const existing = chunkIsCurrent(unit, o, range)
  if (existing) {
    job.skip(count)
    console.log(`chunk · reused · ${rel(existing.file)}`)
    return existing
  }
  const file = chunkPath(unit, o, range)
  const hashes = computeHashes()
  const dir = path.join(FRAMES, path.basename(file, '.mp4'))
  const jobFile = path.join(dir, 'job.json')
  const checksFile = path.join(dir, 'checks.jsonl')
  const identity = { engineHash: hashes.engineHash, unitHash: hashes.unitHashes[unit], format: o.format, tier: o.tier, assets: o.assets, frames: range }
  let saved = readJob(jobFile)
  if (!saved || JSON.stringify(saved.identity) !== JSON.stringify(identity)) {
    fs.rmSync(dir, { recursive: true, force: true })
    saved = null
  }
  fs.mkdirSync(dir, { recursive: true })
  const checks = new Map<number, FrameCheck>()
  if (fs.existsSync(checksFile)) for (const line of fs.readFileSync(checksFile, 'utf8').split('\n').filter(Boolean)) {
    try {
      const c = JSON.parse(line) as FrameCheck
      checks.set(c.frame, c)
    } catch {}
  }
  const step = config.sandbox.maxFramesOnDisk >= fps ? Math.floor(config.sandbox.maxFramesOnDisk / fps) * fps : config.sandbox.maxFramesOnDisk
  const parts: { file: string; first: number; last: number }[] = []
  for (let a = range[0]; a <= range[1]; a += step) parts.push({ file: path.join(dir, `part-${String(parts.length).padStart(3, '0')}.mp4`), first: a, last: Math.min(range[1], a + step - 1) })
  const partDone = (p: (typeof parts)[number]): boolean => {
    if (!fs.existsSync(p.file)) return false
    for (let f = p.first; f <= p.last; f++) if (!checks.has(f)) return false
    return true
  }
  const have = (f: number): boolean => checks.has(f) && fs.existsSync(path.join(dir, frameName(f)))
  job.begin(unit)
  makeRoom(dir, Math.min(step, count))
  let base = saved?.base ?? null
  for (const p of parts) {
    const n = p.last - p.first + 1
    if (partDone(p)) {
      job.skip(n)
      continue
    }
    for (let f = p.first; f <= p.last; f++) {
      const png = path.join(dir, frameName(f))
      if (have(f)) {
        job.skip(1)
        continue
      }
      const session = await job.open()
      if (!base) {
        base = job.recordBase()
        fs.writeFileSync(jobFile, JSON.stringify({ identity, base }, null, 2) + '\n')
      }
      const began = Date.now()
      const { png: data } = await session.render(f, o.tier)
      const check = await frameCheck(session, f)
      fs.writeFileSync(`${png}.tmp`, data)
      fs.renameSync(`${png}.tmp`, png)
      fs.appendFileSync(checksFile, JSON.stringify(check) + '\n')
      checks.set(f, check)
      job.frame(f, (Date.now() - began) / 1000, png)
    }
    encodeFrames(path.join(dir, 'f%06d.png'), p.first, n, p.file, bitrateFor(o.format))
    for (let f = p.first; f <= p.last; f++) fs.rmSync(path.join(dir, frameName(f)), { force: true })
  }
  ensureDir(file)
  if (parts.length === 1) fs.copyFileSync(parts[0].file, file)
  else joinChunks(parts.map((p) => p.file), file)
  const p = probe(file)
  const size = formatById(o.format)
  if (p.frames !== count || Math.abs(p.fps - fps) > 1e-6 || p.width !== size.width || p.height !== size.height) throw new Error(`the chunk came out wrong: ${probeLine(file, p)} (wanted ${count} frames at ${fps} fps, ${size.width} x ${size.height})`)
  const failed: number[] = []
  const m1Details: Record<string, M1Result> = {}
  for (let f = range[0]; f <= range[1]; f++) {
    const r = m1Of(checks.get(f) as FrameCheck)
    if (!r.pass) {
      failed.push(f)
      m1Details[String(f)] = r
    }
  }
  if (!base) throw new Error('the chunk has no record base')
  writeRecord(file, { ...(base as Record_), kind: 'chunk', at: new Date().toISOString(), frames: range, unit, bitrateMbps: bitrateFor(o.format), m1: { checked: count, failed }, m1Details })
  fs.rmSync(dir, { recursive: true, force: true })
  console.log(`chunk · unit ${unit} · M1 failed on ${failed.length} of ${count} frames · ${probeLine(file, p)}`)
  return { unit, file, frames: range, m1: { checked: count, failed }, m1Details, reused: false }
}

export function filmPath(o: FilmOptions, first: number, last: number): string {
  const whole = first === 0 && last === frameCount - 1
  return path.join(WORK, `film-${o.format}-${o.tier}${whole ? '' : `-${first}-${last}`}.mp4`)
}

function joinFilm(chunks: Chunk[], o: FilmOptions): string {
  const first = chunks[0].frames[0]
  const last = chunks[chunks.length - 1].frames[1]
  const file = filmPath(o, first, last)
  const hashes = computeHashes()
  const units = chunks.map((c) => c.unit)
  let gaps = false
  for (let i = 1; i < chunks.length; i++) if (chunks[i].frames[0] !== chunks[i - 1].frames[1] + 1) gaps = true
  const checked = chunks.reduce((a, c) => a + c.m1.checked, 0)
  const existing = readRecord(file)
  if (chunks.every((c) => c.reused) && matches(existing, hashes, { kind: 'film', format: o.format, tier: o.tier, assets: o.assets, diag: 'beauty', units }) && sameFrames(existing?.frames, [first, last]) && (existing?.m1 as M1Summary | undefined)?.checked === checked) {
    console.log(`film · reused · ${probeLine(file)}`)
    return file
  }
  joinChunks(chunks.map((c) => c.file), file)
  const p = probe(file)
  const size = formatById(o.format)
  const source = readRecord(chunks[0].file) as Record_
  const m1Details: Record<string, M1Result> = {}
  for (const c of chunks) Object.assign(m1Details, c.m1Details)
  writeRecord(file, {
    ...source,
    kind: 'film',
    engineHash: hashes.engineHash,
    unitHashes: hashes.unitHashes,
    format: o.format,
    tier: o.tier,
    assets: o.assets,
    at: new Date().toISOString(),
    frames: [first, last],
    frameCount: p.frames,
    units,
    chunks: chunks.map((c) => path.basename(c.file)),
    gaps,
    unit: undefined,
    bitrateMbps: bitrateFor(o.format),
    m1: { checked, failed: chunks.flatMap((c) => c.m1.failed) },
    m1Details,
    probe: p,
  })
  const ok = p.frames === checked && Math.abs(p.fps - fps) < 1e-6 && p.width === size.width && p.height === size.height
  console.log(`film · ${ok ? 'verified' : 'NOT as wanted'} · ${probeLine(file, p)} · wanted ${checked} frames at ${fps} fps, ${size.width} x ${size.height}${gaps ? ' · the chunks leave gaps' : ''}`)
  console.log(`film · M1 checked ${checked} frames, ${chunks.reduce((a, c) => a + c.m1.failed.length, 0)} failed`)
  return file
}

function fromMaster(o: FilmOptions, first: number, last: number): string {
  const masterOptions = { ...o, format: config.formats.master.id }
  const source = filmPath(masterOptions, first, last)
  const record = readRecord(source)
  const units = segments.filter((s) => chunkRange(s.id, first, last)).map((s) => s.id)
  if (!matches(record, computeHashes(), { kind: 'film', format: masterOptions.format, tier: o.tier, assets: o.assets, diag: 'beauty', units })) throw new Error(`there is no ${rel(source)} from the current build to scale down`)
  const preview = config.formats.preview
  const file = filmPath({ ...o, format: preview.id }, first, last)
  encodeAgain(source, file, bitrateFor(preview.id), preview)
  const p = probe(file)
  writeRecord(file, { ...(record as Record_), format: preview.id, at: new Date().toISOString(), fromMaster: path.basename(source), bitrateMbps: bitrateFor(preview.id), frameCount: p.frames, probe: p })
  const ok = p.frames === last - first + 1 && Math.abs(p.fps - fps) < 1e-6 && p.width === preview.width && p.height === preview.height
  console.log(`film · scaled down from ${rel(source)} · ${ok ? 'verified' : 'NOT as wanted'} · ${probeLine(file, p)}`)
  return file
}

if (isMain(import.meta.url)) {
  const args = parseArgs()
  const tier = str(args, 'tier', 'draft')
  if (!isTier(tier)) throw new Error(`unknown tier "${tier}"`)
  const o: FilmOptions = { tier, format: formatById(str(args, 'format', config.formats.preview.id)).id, assets: str(args, 'assets', 'full') }
  const first = Math.max(0, num(args, 'first', 0))
  const last = Math.min(frameCount - 1, num(args, 'last', frameCount - 1))
  if (first > last) throw new Error('--first is after --last')
  if (flag(args, 'from-master')) {
    fromMaster(o, first, last)
  } else {
    const only = typeof args.unit === 'string' ? args.unit : null
    const wanted = segments.filter((s) => (only ? s.id === segmentById(only).id : true) && chunkRange(s.id, first, last)).map((s) => ({ unit: s.id, range: chunkRange(s.id, first, last) as [number, number] }))
    const chunks: Chunk[] = []
    if (flag(args, 'join')) {
      for (const w of wanted) {
        const c = chunkIsCurrent(w.unit, o, w.range)
        if (c) chunks.push(c)
        else console.log(`join · no chunk from the current build for unit ${w.unit} (${rel(chunkPath(w.unit, o, w.range))})`)
      }
    } else {
      const job = new Job(o, wanted.reduce((a, w) => a + w.range[1] - w.range[0] + 1, 0))
      try {
        for (const w of wanted) chunks.push(await renderChunk(w.unit, job, w.range))
      } finally {
        await job.close()
      }
    }
    if (chunks.length === 0) console.log('film · there is nothing to join')
    else if (only && !flag(args, 'join')) console.log(`film · one chunk · ${probeLine(chunks[0].file)}`)
    else joinFilm(chunks, o)
  }
}
