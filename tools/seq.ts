import fs from 'node:fs'
import path from 'node:path'
import { config, frameCount, timeOf } from '../src/config.ts'
import { formatById, isTier, samplesOf } from '../src/core/tiers.ts'
import { clampFrame, segmentAt } from '../src/director/timeline.ts'
import { num, parseArgs, str } from './lib/args.ts'
import { computeHashes } from './lib/hashes.ts'
import { rel } from './lib/layout.ts'
import { addLook } from './lib/looks.ts'
import { isMain } from './lib/main.ts'
import { WORK } from './lib/paths.ts'
import { matches, readRecord, recordPath, writeRecord } from './lib/record.ts'
import { openSession, recordBase } from './lib/render.ts'

export interface SeqOptions { first: number; last: number; tier: string; format: string; assets: string; by?: string }

const DIR = path.join(WORK, 'seq')

export function seqPath(frame: number, o: { tier: string; format: string; assets: string }): string {
  return path.join(DIR, `f${String(frame).padStart(4, '0')}-${o.format}-${o.tier}-${o.assets}.png`)
}

export async function renderSeq(o: SeqOptions): Promise<string[]> {
  const count = o.last - o.first + 1
  const most = config.sandbox.maxFramesOnDisk
  if (count < 1) throw new Error('--first is after --last')
  if (count > most) throw new Error(`${count} frames were asked for; a sequence holds at most sandbox.maxFramesOnDisk (${most}) frames. Use npm run film for longer stretches`)
  const hashes = computeHashes()
  const files = Array.from({ length: count }, (_, i) => seqPath(o.first + i, o))
  fs.mkdirSync(DIR, { recursive: true })
  const wanted = new Set(files)
  const others = fs
    .readdirSync(DIR)
    .filter((n) => n.endsWith('.png'))
    .map((n) => path.join(DIR, n))
    .filter((p) => !wanted.has(p))
    .sort((a, b) => fs.statSync(a).mtimeMs - fs.statSync(b).mtimeMs)
  let removed = 0
  while (others.length + count > most) {
    const old = others.shift() as string
    fs.rmSync(old, { force: true })
    fs.rmSync(recordPath(old), { force: true })
    removed++
  }
  if (removed) console.log(`seq · removed ${removed} older frames to stay under ${most} frames on disk`)
  const todo: number[] = []
  for (let i = 0; i < count; i++) {
    const frame = o.first + i
    if (!matches(readRecord(files[i]), hashes, { kind: 'seq', format: o.format, tier: o.tier, assets: o.assets, diag: 'beauty', units: [segmentAt(frame).id] })) todo.push(frame)
  }
  if (todo.length) {
    const session = await openSession({ format: o.format, assets: o.assets, diag: 'beauty', what: 'seq' })
    try {
      let spent = 0
      let last = Date.now()
      for (let i = 0; i < todo.length; i++) {
        const frame = todo[i]
        const file = seqPath(frame, o)
        const { png, seconds } = await session.render(frame, o.tier)
        fs.writeFileSync(file, png)
        writeRecord(file, { ...recordBase(session, await session.info(), 'seq', 'beauty'), frames: [frame], samples: samplesOf(o.tier as never), seconds })
        spent += seconds
        if (Date.now() - last > 20000 || i === todo.length - 1) {
          last = Date.now()
          console.log(`seq · frame ${frame} · ${i + 1} of ${todo.length} · ${(spent / (i + 1)).toFixed(2)} s per frame`)
        }
      }
    } finally {
      await session.close()
    }
  }
  console.log(`seq · frames ${o.first} to ${o.last} · ${count - todo.length} reused, ${todo.length} new · ${rel(DIR)}`)
  if (todo.length) addLook(files[files.length - 1], `Sequence of frames ${o.first} to ${o.last} at the ${o.tier} tier: its last frame, ${o.last} (${timeOf(o.last).toFixed(1)} s, ${segmentAt(o.last).id})`, o.by ?? 'builder')
  return files
}

if (isMain(import.meta.url)) {
  const args = parseArgs()
  const tier = str(args, 'tier', 'review')
  if (!isTier(tier)) throw new Error(`unknown tier "${tier}"`)
  const first = clampFrame(num(args, 'first'))
  const last = Math.min(frameCount - 1, Math.max(0, Math.round(num(args, 'last'))))
  await renderSeq({ first, last, tier, format: formatById(str(args, 'format', config.formats.master.id)).id, assets: str(args, 'assets', 'full'), by: str(args, 'by', 'builder') })
}
