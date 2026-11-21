import fs from 'node:fs'
import path from 'node:path'
import { config } from '../../src/config.ts'
import { samplesOf } from '../../src/core/tiers.ts'
import type { FrameCheck } from '../../src/director/film.ts'
import { segmentAt } from '../../src/director/timeline.ts'
import { stillPath } from '../still.ts'
import { computeHashes } from './hashes.ts'
import { addLook } from './looks.ts'
import { matches, readRecord, writeRecord } from './record.ts'
import { openSession, recordBase, type Session } from './render.ts'

export interface CheckedRequest { frame: number; tier: string; format: string; assets: string }
export interface CheckedStill { file: string; frame: number; check: FrameCheck }

export function frameCheck(session: Session, frame: number): Promise<FrameCheck> {
  return session.page.evaluate((f) => window.showcase.check(f), frame)
}

export async function renderChecked(requests: CheckedRequest[], options: { look?: boolean; by?: string; session?: Session } = {}): Promise<CheckedStill[]> {
  const hashes = computeHashes()
  const out: CheckedStill[] = []
  const todo: { r: CheckedRequest; at: number }[] = []
  for (const r of requests) {
    const file = stillPath({ ...r, diag: 'beauty' })
    const record = readRecord(file)
    const ok = matches(record, hashes, { kind: 'still', format: r.format, tier: r.tier, assets: r.assets, diag: 'beauty', units: [segmentAt(r.frame).id] }) && record?.check !== undefined
    out.push({ file, frame: r.frame, check: (ok ? record?.check : undefined) as FrameCheck })
    if (!ok) todo.push({ r, at: out.length - 1 })
  }
  const groups = new Map<string, { r: CheckedRequest; at: number }[]>()
  for (const t of todo) {
    const key = `${t.r.format}|${t.r.assets}`
    groups.set(key, [...(groups.get(key) ?? []), t])
  }
  for (const group of groups.values()) {
    const first = group[0].r
    const session = options.session ?? (await openSession({ format: first.format, assets: first.assets, diag: 'beauty', what: 'checked still' }))
    try {
      for (const { r, at } of group) {
        const file = out[at].file
        fs.mkdirSync(path.dirname(file), { recursive: true })
        const { png, seconds } = await session.render(r.frame, r.tier)
        const check = await frameCheck(session, r.frame)
        fs.writeFileSync(file, png)
        const info = await session.info()
        writeRecord(file, { ...recordBase(session, info, 'still', 'beauty'), frames: [r.frame], samples: samplesOf(r.tier as never), seconds, check })
        out[at].check = check
        const unit = segmentAt(r.frame).id
        console.log(`still · frame ${r.frame} (${unit}) · ${r.format} · ${r.tier} · ${r.assets} · beauty · ${seconds.toFixed(1)} s · ${path.relative(process.cwd(), file)}`)
        if (options.look) addLook(file, `Frame ${r.frame} (${(r.frame / config.film.fps).toFixed(1)} s, ${unit}) at the ${r.tier} tier`, options.by ?? 'builder')
      }
    } finally {
      if (!options.session) await session.close()
    }
  }
  return out
}
