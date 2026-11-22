import path from 'node:path'
import { config, frameCount, timeOf } from '../src/config.ts'
import { cuts, segmentAt, segmentById } from '../src/director/timeline.ts'
import { formatById, isTier } from '../src/core/tiers.ts'
import { parseArgs, flag, num, str } from './lib/args.ts'
import { FILM_SHEETS } from './lib/filmplan.ts'
import { computeHashes } from './lib/hashes.ts'
import { canvas, composedRecord, cropped, ensureDir, longEdge, pad4, rel, sameFrames, scaled, strip, type Placed } from './lib/layout.ts'
import { addLook } from './lib/looks.ts'
import { isMain } from './lib/main.ts'
import { WORK } from './lib/paths.ts'
import { matches, readRecord, writeRecord } from './lib/record.ts'
import { renderStills } from './still.ts'

export interface SheetOptions { tier: string; format: string; assets: string; by?: string; look?: boolean }
export interface Sheet { file: string; frames: number[]; caption: string; made: boolean }

const COLS = 3
const GAP = 8
const STRIP = 22
const per = config.critics.contactSheetFrames
const ROWS = Math.ceil(per / COLS)

export function spread(first: number, last: number, count: number): number[] {
  return Array.from({ length: count }, (_, i) => Math.round(first + (i * (last - first)) / Math.max(1, count - 1)))
}

function cellSize(format: string): { w: number; h: number } {
  const f = formatById(format)
  const step = 16
  let w = Math.floor((longEdge - (COLS + 1) * GAP) / COLS / step) * step
  let h = Math.round((w * f.height) / f.width)
  while (ROWS * (h + STRIP) + (ROWS + 1) * GAP > longEdge) {
    w -= step
    h = Math.round((w * f.height) / f.width)
  }
  return { w, h }
}

export function frameLabel(frame: number, digits = 1): string {
  return `f${pad4(frame)} · ${timeOf(frame).toFixed(digits)} s · ${segmentAt(frame).id}`
}

async function makeSheet(file: string, frames: number[], caption: string, o: SheetOptions): Promise<Sheet> {
  const hashes = computeHashes()
  const units = [...new Set(frames.map((f) => segmentAt(f).id))]
  const existing = readRecord(file)
  if (matches(existing, hashes, { kind: 'sheet', format: o.format, tier: o.tier, assets: o.assets, diag: 'beauty', units }) && sameFrames(existing?.frames, frames)) {
    console.log(`sheet · reused · ${rel(file)}`)
    return { file, frames, caption, made: false }
  }
  const stills = await renderStills(frames.map((frame) => ({ frame, tier: o.tier, format: o.format, assets: o.assets, diag: 'beauty' })), { look: false })
  const { w, h } = cellSize(o.format)
  const parts: Placed[] = []
  const digits = new Set(frames.map((f) => timeOf(f).toFixed(1))).size < frames.length ? 2 : 1
  for (let i = 0; i < frames.length; i++) {
    const left = GAP + (i % COLS) * (w + GAP)
    const top = GAP + Math.floor(i / COLS) * (h + STRIP + GAP)
    parts.push({ input: await scaled(stills[i], w, h), left, top })
    parts.push({ input: strip(w, STRIP, frameLabel(frames[i], digits)), left, top: top + h })
  }
  const rows = Math.ceil(frames.length / COLS)
  ensureDir(file)
  await canvas(COLS * w + (COLS + 1) * GAP, rows * (h + STRIP) + (rows + 1) * GAP, parts).jpeg({ quality: 90 }).toFile(file)
  writeRecord(file, composedRecord('sheet', hashes, stills, { format: o.format, tier: o.tier, assets: o.assets, frames, units, caption }))
  console.log(`sheet · ${caption} · ${rel(file)}`)
  if (o.look !== false) addLook(file, caption, o.by ?? 'builder')
  return { file, frames, caption, made: true }
}

const dir = path.join(WORK, 'sheets')

export function unitSheet(id: string, o: SheetOptions): Promise<Sheet> {
  const plan = unitSheetPlan(id, o)
  return makeSheet(plan.file, plan.frames, plan.caption, o)
}

export interface SheetPlan { file: string; frames: number[]; caption: string }

export function filmSheetPlans(o: SheetOptions): SheetPlan[] {
  const all = spread(0, frameCount - 1, FILM_SHEETS * per)
  return Array.from({ length: FILM_SHEETS }, (_, i) => {
    const frames = all.slice(i * per, (i + 1) * per)
    return { file: path.join(dir, `film-${i + 1}-${o.format}-${o.tier}.jpg`), frames, caption: `Whole film sheet ${i + 1} of ${FILM_SHEETS} (frames ${frames[0]} to ${frames[frames.length - 1]})` }
  })
}

export function cutSheetPlan(index: number, o: SheetOptions): SheetPlan {
  const cut = cuts.find((c) => c.index === index)
  if (!cut) throw new Error(`there is no cut ${index}; the film has cuts 1 to ${cuts.length}`)
  const half = Math.floor(per / 2)
  const frames = Array.from({ length: per }, (_, i) => cut.frame - half + i)
  return { file: path.join(dir, `cut-${index}-${o.format}-${o.tier}.jpg`), frames, caption: `Cut ${index} (${cut.fromSegment} to ${cut.toSegment}): frames ${frames[0]} to ${frames[frames.length - 1]}, the cut falls on frame ${cut.frame}` }
}

export function sheetReady(plan: SheetPlan, o: SheetOptions): boolean {
  const existing = readRecord(plan.file)
  const units = [...new Set(plan.frames.map((f) => segmentAt(f).id))]
  return matches(existing, computeHashes(), { kind: 'sheet', format: o.format, tier: o.tier, assets: o.assets, diag: 'beauty', units }) && sameFrames(existing?.frames, plan.frames)
}

export async function filmSheets(o: SheetOptions): Promise<Sheet[]> {
  const out: Sheet[] = []
  for (const plan of filmSheetPlans(o)) out.push(await makeSheet(plan.file, plan.frames, plan.caption, o))
  return out
}

export function cutSheet(index: number, o: SheetOptions): Promise<Sheet> {
  const plan = cutSheetPlan(index, o)
  return makeSheet(plan.file, plan.frames, plan.caption, o)
}

export function unitSheetPlan(id: string, o: SheetOptions): SheetPlan {
  const s = segmentById(id)
  const frames = spread(s.firstFrame, s.lastFrame, per)
  return { file: path.join(dir, `unit-${id}-${o.format}-${o.tier}.jpg`), frames, caption: `Unit ${id}: ${per} frames across its segment (frames ${s.firstFrame} to ${s.lastFrame})` }
}

export function runSheetPlan(unit: string, first: number, o: SheetOptions): SheetPlan {
  const frames = Array.from({ length: per }, (_, i) => first + i)
  return { file: path.join(dir, `run-${unit}-f${pad4(first)}-${o.format}-${o.tier}.jpg`), frames, caption: `Unit ${unit}: consecutive frames ${frames[0]} to ${frames[frames.length - 1]}` }
}

export function detailSheetFile(unit: string, first: number, o: SheetOptions): string {
  return path.join(dir, `detail-${unit}-f${pad4(first)}-${o.format}-${o.tier}.jpg`)
}

export function runSheet(unit: string, first: number, o: SheetOptions): Promise<Sheet> {
  const plan = runSheetPlan(unit, first, o)
  return makeSheet(plan.file, plan.frames, plan.caption, o)
}

function detailBox(box: { left: number; top: number }, o: SheetOptions): { left: number; top: number; w: number; h: number } {
  const w = Math.floor((longEdge - (COLS + 1) * GAP) / COLS)
  const h = Math.floor((longEdge - (ROWS + 1) * GAP) / ROWS) - STRIP
  const size = formatById(o.format)
  return { left: Math.round(Math.min(size.width - w, Math.max(0, box.left))), top: Math.round(Math.min(size.height - h, Math.max(0, box.top))), w, h }
}

export function detailReady(unit: string, first: number, box: { left: number; top: number }, o: SheetOptions): boolean {
  const frames = Array.from({ length: per }, (_, i) => first + i)
  const existing = readRecord(detailSheetFile(unit, first, o))
  const { left, top } = detailBox(box, o)
  return matches(existing, computeHashes(), { kind: 'sheet', format: o.format, tier: o.tier, assets: o.assets, diag: 'beauty', units: [unit] }) && sameFrames(existing?.frames, frames) && existing?.left === left && existing?.top === top
}

export async function detailSheet(unit: string, first: number, box: { left: number; top: number }, o: SheetOptions): Promise<Sheet> {
  const frames = Array.from({ length: per }, (_, i) => first + i)
  const file = detailSheetFile(unit, first, o)
  const caption = `Unit ${unit}: consecutive frames ${frames[0]} to ${frames[frames.length - 1]}, native size crops`
  const hashes = computeHashes()
  const { left, top, w, h } = detailBox(box, o)
  const existing = readRecord(file)
  if (matches(existing, hashes, { kind: 'sheet', format: o.format, tier: o.tier, assets: o.assets, diag: 'beauty', units: [unit] }) && sameFrames(existing?.frames, frames) && existing?.left === left && existing?.top === top) {
    console.log(`sheet · reused · ${rel(file)}`)
    return { file, frames, caption, made: false }
  }
  const stills = await renderStills(frames.map((frame) => ({ frame, tier: o.tier, format: o.format, assets: o.assets, diag: 'beauty' })), { look: false })
  const parts: Placed[] = []
  for (let i = 0; i < frames.length; i++) {
    const x = GAP + (i % COLS) * (w + GAP)
    const y = GAP + Math.floor(i / COLS) * (h + STRIP + GAP)
    parts.push({ input: await cropped(stills[i], left, top, w, h), left: x, top: y })
    parts.push({ input: strip(w, STRIP, `${frameLabel(frames[i], 2)} · native size`), left: x, top: y + h })
  }
  ensureDir(file)
  await canvas(COLS * w + (COLS + 1) * GAP, ROWS * (h + STRIP) + (ROWS + 1) * GAP, parts).jpeg({ quality: 95, chromaSubsampling: '4:4:4' }).toFile(file)
  writeRecord(file, composedRecord('sheet', hashes, stills, { format: o.format, tier: o.tier, assets: o.assets, frames, units: [unit], caption, left, top, width: w, height: h }))
  console.log(`sheet · ${caption} · ${rel(file)}`)
  return { file, frames, caption, made: true }
}

export const detailSize = { width: Math.floor((longEdge - (COLS + 1) * GAP) / COLS), height: Math.floor((longEdge - (ROWS + 1) * GAP) / ROWS) - STRIP }

if (isMain(import.meta.url)) {
  const args = parseArgs()
  const tier = str(args, 'tier', 'review')
  if (!isTier(tier)) throw new Error(`unknown tier "${tier}"`)
  const o: SheetOptions = { tier, format: formatById(str(args, 'format', config.formats.preview.id)).id, assets: str(args, 'assets', 'full'), by: str(args, 'by', 'builder') }
  if (flag(args, 'film')) await filmSheets(o)
  else if (args.cut !== undefined) await cutSheet(num(args, 'cut'), o)
  else await unitSheet(str(args, 'unit'), o)
}
