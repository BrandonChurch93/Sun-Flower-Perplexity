import fs from 'node:fs'
import path from 'node:path'
import { config } from '../src/config.ts'
import { isTier } from '../src/core/tiers.ts'
import { segmentById } from '../src/director/timeline.ts'
import { parseArgs, str } from './lib/args.ts'
import { computeHashes } from './lib/hashes.ts'
import { ensureDir, rel, sameFrames } from './lib/layout.ts'
import { isMain } from './lib/main.ts'
import { WORK } from './lib/paths.ts'
import { matches, readRecord, writeRecord, type Record_ } from './lib/record.ts'
import { probeLine } from './lib/video.ts'
import { chunkIsCurrent, chunkRange, Job, renderChunk, type FilmOptions } from './film.ts'

export async function clip(unit: string, tier: string, assets = 'full'): Promise<string> {
  const s = segmentById(unit)
  const o: FilmOptions = { tier, format: config.formats.master.id, assets }
  const range = chunkRange(unit) as [number, number]
  const file = ensureDir(path.join(WORK, 'clips', `${unit}.mp4`))
  const existing = readRecord(file)
  if (matches(existing, computeHashes(), { kind: 'clip', format: o.format, tier, assets, diag: 'beauty', units: [unit] }) && sameFrames(existing?.frames, range)) {
    console.log(`clip · reused · ${probeLine(file)}`)
    return file
  }
  let chunk = chunkIsCurrent(unit, o, range)
  if (!chunk) {
    const job = new Job(o, s.frames, 'clip')
    try {
      chunk = await renderChunk(unit, job, range)
    } finally {
      await job.close()
    }
  }
  fs.copyFileSync(chunk.file, file)
  writeRecord(file, { ...(readRecord(chunk.file) as Record_), kind: 'clip', at: new Date().toISOString(), chunk: path.basename(chunk.file) })
  console.log(`clip · unit ${unit} · ${chunk.reused ? 'copied from its chunk' : 'rendered'} · M1 failed on ${chunk.m1.failed.length} of ${chunk.m1.checked} frames · ${probeLine(file)}`)
  return file
}

if (isMain(import.meta.url)) {
  const args = parseArgs()
  const tier = str(args, 'tier', 'review')
  if (!isTier(tier)) throw new Error(`unknown tier "${tier}"`)
  console.log(`clip · ${rel(await clip(str(args, 'unit'), tier, str(args, 'assets', 'full')))}`)
}
