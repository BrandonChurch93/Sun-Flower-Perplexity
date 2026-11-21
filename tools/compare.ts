import path from 'node:path'
import { config } from '../src/config.ts'
import { isTier } from '../src/core/tiers.ts'
import { keys, type TimedKey } from '../src/director/timeline.ts'
import { parseArgs, str } from './lib/args.ts'
import { renderChecked, type CheckedStill } from './lib/checked.ts'
import { computeHashes } from './lib/hashes.ts'
import { canvas, composedRecord, cropped, ensureDir, longEdge, rel, scaled, strip, type Placed } from './lib/layout.ts'
import { addLook } from './lib/looks.ts'
import { isMain } from './lib/main.ts'
import { at, WORK } from './lib/paths.ts'
import { matches, readRecord, writeRecord } from './lib/record.ts'

const master = config.formats.master
const HALF = 700
const HALF_H = Math.round((HALF * master.height) / master.width)
const ASSETS = 'full'
const dir = path.join(WORK, 'compare')

export function keyById(id: string): TimedKey {
  const key = keys.find((k) => k.id === id)
  if (!key) throw new Error(`unknown key "${id}"; the keys are ${keys.map((k) => k.id).join(', ')}`)
  return key
}

function current(file: string, kind: string, key: TimedKey, tier: string): boolean {
  const record = readRecord(file)
  return matches(record, computeHashes(), { kind, format: master.id, tier, assets: ASSETS, diag: 'beauty', units: [key.unit] }) && record?.key === key.id
}

async function keyStill(key: TimedKey, tier: string): Promise<CheckedStill> {
  const [still] = await renderChecked([{ frame: key.frame, tier, format: master.id, assets: ASSETS }])
  return still
}

export const pairPath = (keyId: string, tier: string): string => path.join(dir, `pair-${keyId}-${tier}.jpg`)

export function pairIsCurrent(keyId: string, tier: string): boolean {
  return current(pairPath(keyId, tier), 'pair', keyById(keyId), tier)
}

export async function comparePair(keyId: string, tier: string): Promise<string> {
  const key = keyById(keyId)
  const file = pairPath(keyId, tier)
  if (current(file, 'pair', key, tier)) return file
  const still = await keyStill(key, tier)
  const parts: Placed[] = [
    { input: await scaled(at(key.image), HALF, HALF_H), left: 0, top: 0 },
    { input: await scaled(still.file, HALF, HALF_H), left: HALF, top: 0 },
  ]
  ensureDir(file)
  await canvas(HALF * 2, HALF_H, parts).jpeg({ quality: 90 }).toFile(file)
  writeRecord(file, composedRecord('pair', computeHashes(), [still.file], { format: master.id, tier, assets: ASSETS, frames: [key.frame], key: key.id, left: key.image, right: `frame ${key.frame}` }))
  console.log(`pair · key ${key.id} · ${rel(file)}`)
  return file
}

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v))

export async function compareKey(keyId: string, tier: string, by = 'builder'): Promise<string> {
  const key = keyById(keyId)
  const file = path.join(dir, `compare-${keyId}.jpg`)
  if (current(file, 'compare', key, tier)) {
    console.log(`compare · reused · ${rel(file)}`)
    return file
  }
  const still = await keyStill(key, tier)
  const STRIP = 18
  const GAP = 6
  const rows = 3
  const cropH = Math.min(HALF_H, Math.floor((longEdge - HALF_H - (rows + 1) * STRIP - rows * GAP) / rows))
  const approved = await scaled(at(key.image), master.width, master.height)
  const tip = still.check.tip
  const tipOk = Number.isFinite(tip.x) && Number.isFinite(tip.y)
  const centers = [
    { name: 'at the growing tip', x: tipOk ? clamp(tip.x, 0, 1) : 0.5, y: tipOk ? clamp(tip.y, 0, 1) : 0.5 },
    { name: 'lower left third', x: 1 / 3, y: 2 / 3 },
    { name: 'upper right third', x: 2 / 3, y: 1 / 3 },
  ]
  const parts: Placed[] = []
  let top = 0
  parts.push({ input: strip(HALF, STRIP, `approved image · key ${key.id}`), left: 0, top })
  parts.push({ input: strip(HALF, STRIP, `film frame f${String(key.frame).padStart(4, '0')} · ${key.time.toFixed(1)} s · ${tier} tier`), left: HALF, top })
  top += STRIP
  parts.push({ input: await scaled(approved, HALF, HALF_H), left: 0, top })
  parts.push({ input: await scaled(still.file, HALF, HALF_H), left: HALF, top })
  top += HALF_H
  const crops: { name: string; left: number; top: number; width: number; height: number }[] = []
  for (const c of centers) {
    const left = Math.round(clamp(c.x * master.width - HALF / 2, 0, master.width - HALF))
    const cropTop = Math.round(clamp(c.y * master.height - cropH / 2, 0, master.height - cropH))
    crops.push({ name: c.name, left, top: cropTop, width: HALF, height: cropH })
    top += GAP
    const label = `native size crop ${c.name} · from x ${(left / master.width).toFixed(2)}, y ${(cropTop / master.height).toFixed(2)}`
    parts.push({ input: strip(HALF, STRIP, `${label} · approved image`), left: 0, top })
    parts.push({ input: strip(HALF, STRIP, `${label} · film frame`), left: HALF, top })
    top += STRIP
    parts.push({ input: await cropped(approved, left, cropTop, HALF, cropH), left: 0, top })
    parts.push({ input: await cropped(still.file, left, cropTop, HALF, cropH), left: HALF, top })
    top += cropH
  }
  ensureDir(file)
  await canvas(HALF * 2, top, parts).jpeg({ quality: 90 }).toFile(file)
  writeRecord(file, composedRecord('compare', computeHashes(), [still.file], { format: master.id, tier, assets: ASSETS, frames: [key.frame], key: key.id, approved: key.image, crops, check: still.check }))
  console.log(`compare · key ${key.id} · ${rel(file)}`)
  addLook(file, `Key ${key.id}: the approved image (left) beside the film frame at ${key.time} s (right) at the ${tier} tier, with three matching crops at native size under them`, by)
  return file
}

if (isMain(import.meta.url)) {
  const args = parseArgs()
  const tier = str(args, 'tier', 'final')
  if (!isTier(tier)) throw new Error(`unknown tier "${tier}"`)
  await compareKey(str(args, 'key'), tier, str(args, 'by', 'builder'))
}
