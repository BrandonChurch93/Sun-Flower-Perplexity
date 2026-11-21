import fs from 'node:fs'
import path from 'node:path'
import { config } from '../src/config.ts'
import { formatById, isTier } from '../src/core/tiers.ts'
import { clampFrame, judgedFrames } from '../src/director/timeline.ts'
import { parseArgs, str } from './lib/args.ts'
import { WORK } from './lib/paths.ts'
import { compare, rawOf, type Raw } from './lib/pixels.ts'
import { writeRecord } from './lib/record.ts'
import { openSession, recordBase } from './lib/render.ts'

const args = parseArgs()
const tier = str(args, 'tier', 'review')
if (!isTier(tier)) throw new Error(`unknown tier "${tier}"`)
const format = formatById(str(args, 'format', config.formats.master.id)).id
const judged = judgedFrames().map((j) => j.frame)
const fallback = [judged[1], judged[Math.floor(judged.length / 2)], judged[judged.length - 2]]
const frames = typeof args.frames === 'string' ? args.frames.split(',').map((f) => clampFrame(Number(f))) : fallback

async function pass(order: number[], what: string): Promise<{ shots: Map<number, Raw>; record: ReturnType<typeof recordBase> }> {
  const session = await openSession({ format, what })
  try {
    const shots = new Map<number, Raw>()
    for (const frame of order) shots.set(frame, await rawOf((await session.render(frame, tier)).png))
    return { shots, record: recordBase(session, await session.info(), 'determinism', 'beauty') }
  } finally {
    await session.close()
  }
}

const first = await pass(frames, 'determinism, first page load')
const second = await pass([...frames].reverse(), 'determinism, second page load, other order')
const again = await pass([frames[0], frames[0]], 'determinism, the same frame twice')

const lines: { frame: number; test: string; same: boolean; differingPixels: number; maxDifference: number }[] = []
for (const frame of frames) {
  const d = compare(first.shots.get(frame) as Raw, second.shots.get(frame) as Raw)
  lines.push({ frame, test: 'fresh page load, other order', same: d.same, differingPixels: d.differingPixels, maxDifference: d.maxDifference })
}
const repeat = compare(first.shots.get(frames[0]) as Raw, again.shots.get(frames[0]) as Raw)
lines.push({ frame: frames[0], test: 'rendered twice in a row on a third page load', same: repeat.same, differingPixels: repeat.differingPixels, maxDifference: repeat.maxDifference })

const ok = lines.every((l) => l.same)
const out = path.join(WORK, 'determinism', 'result.json')
fs.mkdirSync(path.dirname(out), { recursive: true })
fs.writeFileSync(out, JSON.stringify({ ok, format, tier, frames, lines }, null, 2) + '\n')
writeRecord(out, { ...first.record, frames, note: ok ? 'pixel identical' : 'pixels differ' })
for (const l of lines) console.log(`frame ${l.frame} · ${l.test} · ${l.same ? 'identical' : `${l.differingPixels} pixels differ, largest step ${l.maxDifference}`}`)
console.log(ok ? `determinism: pass (${frames.length} frames, ${format}, ${tier})` : 'determinism: FAIL')
process.exit(ok ? 0 : 1)
