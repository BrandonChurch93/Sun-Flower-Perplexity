import fs from 'node:fs'
import path from 'node:path'
import { config, timeOf } from '../src/config.ts'
import { isTier } from '../src/core/tiers.ts'
import { segmentById } from '../src/director/timeline.ts'
import { parseArgs } from './lib/args.ts'
import { computeHashes } from './lib/hashes.ts'
import { canvas, cropped, ensureDir, longEdge, rel, sameFrames, scaled, strip, type Placed } from './lib/layout.ts'
import { addLook } from './lib/looks.ts'
import { isMain } from './lib/main.ts'
import { WORK } from './lib/paths.ts'
import { matches, readRecord, writeRecord, type Record_ } from './lib/record.ts'
import { openSession, recordBase, type Session } from './lib/render.ts'
import { encodeAgain, encodeFrames, frameFromVideo, probe, probeLine } from './lib/video.ts'

const master = config.formats.master
const DIR = path.join(WORK, 'stress')
const FRAMES = path.join(WORK, 'frames', 'stress')
const tier = config.quality.stress.tier
const high = config.export.bitrateMbps
const low = config.quality.compressionStressMbps

export function stressRange(unit: string): [number, number] {
  const s = segmentById(unit)
  const count = Math.max(1, Math.min(s.frames, config.sandbox.maxFramesOnDisk, Math.round(config.quality.stress.seconds * config.film.fps)))
  const first = s.firstFrame + Math.floor((s.frames - count) / 2)
  return [first, first + count - 1]
}

export function stressFiles(unit: string): { frame: number; source: string; after: string; picture: string } {
  const range = stressRange(unit)
  const frame = range[0] + Math.floor((range[1] - range[0] + 1) / 2)
  return { frame, source: path.join(DIR, `${unit}-source.png`), after: path.join(DIR, `${unit}-${low}mbps.png`), picture: path.join(DIR, `${unit}.jpg`) }
}

export function stressReady(unit: string): { source: boolean; after: boolean } {
  const hashes = computeHashes()
  const files = stressFiles(unit)
  const wanted = { format: master.id, tier, assets: 'full', diag: 'beauty', units: [unit] }
  const ok = (file: string, kind: string): boolean => matches(readRecord(file), hashes, { kind, ...wanted }) && sameFrames(readRecord(file)?.frames, [files.frame])
  return { source: ok(files.source, 'stress source'), after: ok(files.after, 'stress still') }
}

async function stressUnit(unit: string, open: () => Promise<Session>, by: string): Promise<string> {
  const range = stressRange(unit)
  const count = range[1] - range[0] + 1
  const hashes = computeHashes()
  const picture = ensureDir(path.join(DIR, `${unit}.jpg`))
  const wanted = { format: master.id, tier, assets: 'full', diag: 'beauty', units: [unit] }
  const existing = readRecord(picture)
  const shown = stressFiles(unit)
  const kept = (): boolean => matches(readRecord(shown.source), hashes, { kind: 'stress source', ...wanted }) && sameFrames(readRecord(shown.source)?.frames, [shown.frame])
  if (matches(existing, hashes, { kind: 'stress', ...wanted }) && sameFrames(existing?.frames, range) && kept()) {
    console.log(`stress · reused · ${rel(picture)}`)
    return picture
  }
  const first = path.join(DIR, `${unit}-${high}mbps.mp4`)
  const second = path.join(DIR, `${unit}-${low}mbps.mp4`)
  const firstRecord = readRecord(first)
  let base: Record_
  if (matches(firstRecord, hashes, { kind: 'stress film', ...wanted }) && sameFrames(firstRecord?.frames, range) && kept()) base = firstRecord as Record_
  else {
    const session = await open()
    fs.rmSync(FRAMES, { recursive: true, force: true })
    fs.mkdirSync(FRAMES, { recursive: true })
    let spent = 0
    for (let f = range[0]; f <= range[1]; f++) {
      const { png, seconds } = await session.render(f, tier)
      fs.writeFileSync(path.join(FRAMES, `f${String(f).padStart(6, '0')}.png`), png)
      spent += seconds
      console.log(`stress · unit ${unit} · frame ${f - range[0] + 1} of ${count} · ${(spent / (f - range[0] + 1)).toFixed(1)} s per frame`)
    }
    encodeFrames(path.join(FRAMES, 'f%06d.png'), range[0], count, first, high, 2)
    fs.copyFileSync(path.join(FRAMES, `f${String(shown.frame).padStart(6, '0')}.png`), shown.source)
    fs.rmSync(FRAMES, { recursive: true, force: true })
    base = { ...recordBase(session, await session.info(), 'stress film', 'beauty'), frames: range, unit, bitrateMbps: high }
    writeRecord(shown.source, { ...base, kind: 'stress source', frames: [shown.frame] })
    writeRecord(first, { ...base, probe: probe(first) })
  }
  encodeAgain(first, second, low, undefined, 2)
  writeRecord(second, { ...base, at: new Date().toISOString(), bitrateMbps: low, encodedFrom: path.basename(first), probe: probe(second) })
  const middle = Math.floor(count / 2)
  const frame = range[0] + middle
  const stills = [first, second].map((video) => {
    const png = video.replace(/\.mp4$/, '.png')
    frameFromVideo(video, middle, png)
    writeRecord(png, { ...base, kind: 'stress still', at: new Date().toISOString(), frames: [frame], from: path.basename(video) })
    return png
  })
  const HALF = longEdge / 2
  const halfH = Math.round((HALF * master.height) / master.width)
  const STRIP = 18
  const GAP = 6
  const cropLeft = Math.round((master.width - HALF) / 2)
  const cropTop = Math.round((master.height - halfH) / 2)
  const parts: Placed[] = []
  const labels = [`encoded at ${high} Mbit/s`, `encoded again at ${low} Mbit/s`]
  for (let i = 0; i < 2; i++) {
    const left = i * HALF
    parts.push({ input: strip(HALF, STRIP, `unit ${unit} · frame ${frame} · ${labels[i]} · whole frame`), left, top: 0 })
    parts.push({ input: await scaled(stills[i], HALF, halfH), left, top: STRIP })
    parts.push({ input: strip(HALF, STRIP, `${labels[i]} · the middle of the frame at native size`), left, top: STRIP + halfH + GAP })
    parts.push({ input: await cropped(stills[i], cropLeft, cropTop, HALF, halfH), left, top: 2 * STRIP + halfH + GAP })
  }
  await canvas(HALF * 2, 2 * (STRIP + halfH) + GAP, parts).jpeg({ quality: 92 }).toFile(picture)
  writeRecord(picture, { ...base, kind: 'stress', at: new Date().toISOString(), frames: range, shown: frame, bitratesMbps: [high, low], films: [path.basename(first), path.basename(second)] })
  console.log(`stress · ${probeLine(first)}`)
  console.log(`stress · ${probeLine(second)}`)
  console.log(`stress · unit ${unit} · ${rel(picture)}`)
  addLook(picture, `Compression stress, unit ${unit}, frame ${frame} (${timeOf(frame).toFixed(1)} s): encoded at ${high} Mbit/s (left) and again at ${low} Mbit/s (right)`, by)
  return picture
}

export async function stress(units: string[] = config.quality.stress.units, by = 'builder'): Promise<string[]> {
  if (!isTier(tier)) throw new Error(`unknown tier "${tier}" in quality.stress.tier`)
  let session: Session | null = null
  const open = async (): Promise<Session> => {
    if (!session) session = await openSession({ format: master.id, assets: 'full', diag: 'beauty', what: 'stress' })
    return session
  }
  const out: string[] = []
  try {
    for (const unit of units) out.push(await stressUnit(unit, open, by))
  } finally {
    if (session) await (session as Session).close()
  }
  return out
}

if (isMain(import.meta.url)) {
  const args = parseArgs()
  await stress(typeof args.unit === 'string' ? [args.unit] : config.quality.stress.units, typeof args.by === 'string' ? args.by : 'builder')
}
