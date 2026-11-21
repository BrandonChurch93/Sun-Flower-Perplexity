import fs from 'node:fs'
import path from 'node:path'
import { config } from '../src/config.ts'
import { clampFrame, segmentAt } from '../src/director/timeline.ts'
import { samplesOf, isTier, formatById } from '../src/core/tiers.ts'
import { flag, parseArgs, str } from './lib/args.ts'
import { computeHashes } from './lib/hashes.ts'
import { addLook } from './lib/looks.ts'
import { WORK } from './lib/paths.ts'
import { matches, readRecord, writeRecord } from './lib/record.ts'
import { openSession, recordBase } from './lib/render.ts'

export interface StillRequest { frame: number; tier: string; format: string; assets: string; diag: string }

export function stillPath(r: StillRequest): string {
  return path.join(WORK, 'stills', `f${String(r.frame).padStart(4, '0')}-${r.format}-${r.tier}-${r.assets}-${r.diag}.png`)
}

export async function renderStills(requests: StillRequest[], options: { fresh?: boolean; look?: boolean; by?: string } = {}): Promise<string[]> {
  const hashes = computeHashes()
  const out: string[] = []
  const groups = new Map<string, StillRequest[]>()
  for (const r of requests) {
    const file = stillPath(r)
    out.push(file)
    const unit = segmentAt(r.frame).id
    if (!options.fresh && matches(readRecord(file), hashes, { kind: 'still', format: r.format, tier: r.tier, assets: r.assets, diag: r.diag, units: [unit] })) continue
    const key = `${r.format}|${r.assets}|${r.diag}`
    groups.set(key, [...(groups.get(key) ?? []), r])
  }
  for (const group of groups.values()) {
    const first = group[0]
    const session = await openSession({ format: first.format, assets: first.assets, diag: first.diag, what: 'still' })
    try {
      for (const r of group) {
        const file = stillPath(r)
        fs.mkdirSync(path.dirname(file), { recursive: true })
        const { png, seconds } = await session.render(r.frame, r.tier)
        fs.writeFileSync(file, png)
        const info = await session.info()
        writeRecord(file, { ...recordBase(session, info, 'still', r.diag), frames: [r.frame], samples: samplesOf(r.tier as never), seconds })
        const unit = segmentAt(r.frame).id
        console.log(`still · frame ${r.frame} (${unit}) · ${r.format} · ${r.tier} · ${r.assets} · ${r.diag} · ${seconds.toFixed(1)} s · ${path.relative(process.cwd(), file)}`)
        if (options.look !== false) addLook(file, `Frame ${r.frame} (${(r.frame / config.film.fps).toFixed(1)} s, ${unit}) at the ${r.tier} tier${r.diag === 'beauty' ? '' : `, ${r.diag} view`}`, options.by ?? 'builder')
      }
    } finally {
      await session.close()
    }
  }
  return out
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  const args = parseArgs()
  const tier = str(args, 'tier', 'review')
  if (!isTier(tier)) throw new Error(`unknown tier "${tier}"`)
  const format = formatById(str(args, 'format', config.formats.master.id)).id
  const frames = str(args, 'frame', str(args, 'frames', '0'))
    .split(',')
    .map((f) => clampFrame(Number(f)))
  const requests = frames.map((frame) => ({ frame, tier, format, assets: str(args, 'assets', 'full'), diag: str(args, 'diag', 'beauty') }))
  await renderStills(requests, { fresh: flag(args, 'fresh'), look: !flag(args, 'no-look') })
}
