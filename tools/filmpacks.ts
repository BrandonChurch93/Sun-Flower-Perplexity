import { createHash } from 'node:crypto'
import path from 'node:path'
import sharp from 'sharp'
import { config, timeOf } from '../src/config.ts'
import { formatById } from '../src/core/tiers.ts'
import { cuts, judgedFrames, segmentAt } from '../src/director/timeline.ts'
import { renderChecked } from './lib/checked.ts'
import { hookFrames, juryFrames, keysInOrder, KEYS_PER_FILE } from './lib/filmplan.ts'
import { growthRuns, type GrowthRun } from './lib/growthruns.ts'
import { computeHashes } from './lib/hashes.ts'
import { canvas, cropped, rel, scaled, strip, type Placed } from './lib/layout.ts'
import { ROOT } from './lib/paths.ts'
import { asPng, pixelsOnly, wholeImage, wholeSize } from './lib/packimage.ts'
import { matches, readRecord } from './lib/record.ts'
import { regionsOf, type Region } from './lib/regions.ts'
import type { Pack, PackContext, PackFile } from './pack.ts'
import { cutSheet, cutSheetPlan, detailReady, detailSheet, detailSheetFile, detailSize, filmSheetPlans, filmSheets, frameLabel, runSheetPlan, sheetReady, type SheetOptions, type SheetPlan } from './sheet.ts'
import { stillPath } from './still.ts'
import { stress, stressFiles, stressRange, stressReady } from './stress.ts'
import { packsOf, type Group } from './unitpacks.ts'

const master = config.formats.master
const edge = config.critics.maxImageLongEdgePx
const per = config.critics.contactSheetFrames
const low = config.quality.compressionStressMbps
const ASSETS = 'full'
const GAP = 8
const STRIP = 22
const SHEET_TIER = 'review'
const sheetsOf = (context: PackContext): SheetOptions => ({ tier: context.sheetTier ?? SHEET_TIER, format: config.formats.preview.id, assets: ASSETS, look: false })
const TILE_W = Math.floor((edge - 3 * GAP) / 2)
const TILE_H = Math.round((TILE_W * master.height) / master.width)
const PLACES = [
  { ids: ['sky', 'sun'], label: 'the sky', x: 0.5, y: 0 },
  { ids: ['head', 'stem'], label: 'the plant round its growing tip', x: 0.5, y: 0.5 },
  { ids: ['far', 'field'], label: 'the far ground', x: 0.5, y: 1 },
]
const CROP_H = Math.floor((edge - (PLACES.length + 1) * GAP) / PLACES.length) - STRIP
const source = (file: string): string => path.relative(ROOT, file)
const seconds = (frame: number, digits = 2): string => `${timeOf(frame).toFixed(digits)} s`
const wanted = (context: PackContext, critic: string): boolean => !context.only || context.only.includes(critic)

export interface Need { what: 'still' | 'sheet' | 'stress'; label: string; tier: string; format: string; file: string; have: boolean; stills?: string; frames: number[]; make: string }

export const stillCommand = (frames: number[], tier: string, format: string, check: boolean): string => `npm run -s still -- --frames ${frames.join(',')} --tier ${tier} --format ${format} --no-look${check ? ' --check' : ''}`
export const sheetCommand = (which: string, o: SheetOptions): string => `npm run -s sheet -- ${which} --tier ${o.tier} --format ${o.format}`

export function stillHave(frame: number, tier: string, format: string, checked: boolean): boolean {
  const record = readRecord(stillPath({ frame, tier, format, assets: ASSETS, diag: 'beauty' }))
  return matches(record, computeHashes(), { kind: 'still', format, tier, assets: ASSETS, diag: 'beauty', units: [segmentAt(frame).id] }) && (!checked || record?.check !== undefined)
}

const GROWS = { height: 'gains height', opening: 'opens' }

interface CloseRun { run: GrowthRun; unit: string; plan: SheetPlan; file: string; box: Region; at: { left: number; top: number }; share: number }

function closeRuns(o: SheetOptions): CloseRun[] {
  const share = formatById(o.format).width / master.width
  const out: CloseRun[] = []
  for (const run of growthRuns()) {
    const unit = segmentAt(run.first).id
    const found = regionsOf(run.first + Math.floor(per / 2), detailSize.width / share, detailSize.height / share)
    const box = found.regions.find((r) => r.id === 'head') ?? found.regions.find((r) => r.id === 'stem') ?? found.regions[0]
    if (!box) continue
    out.push({ run, unit, plan: runSheetPlan(unit, run.first, o), file: detailSheetFile(unit, run.first, o), box, at: { left: box.left * share, top: box.top * share }, share })
  }
  return out
}

function sheetPlans(context: PackContext): { plan: SheetPlan; make: string }[] {
  const SHEETS = sheetsOf(context)
  const film = wanted(context, 'R5') || wanted(context, 'R4') ? filmSheetPlans(SHEETS).map((plan) => ({ plan, make: sheetCommand('--film', SHEETS) })) : []
  const across = wanted(context, 'R4') ? cuts.map((c) => ({ plan: cutSheetPlan(c.index, SHEETS), make: sheetCommand(`--cut ${c.index}`, SHEETS) })) : []
  return [...across, ...film]
}

export function stillNeed(frame: number, tier: string): Need {
  const have = stillHave(frame, tier, master.id, true)
  return { what: 'still', label: `frame ${frame}`, tier, format: master.id, file: stillPath({ frame, tier, format: master.id, assets: ASSETS, diag: 'beauty' }), have, frames: have ? [] : [frame], make: stillCommand([frame], tier, master.id, true) }
}

export function sheetNeed(plan: SheetPlan, o: SheetOptions, make: string, file = plan.file, ready?: boolean): Need {
  const have = ready ?? sheetReady({ ...plan, file }, o)
  const lacking = have ? [] : plan.frames.filter((f) => !stillHave(f, o.tier, o.format, false))
  const held = plan.frames.length - lacking.length
  return { what: 'sheet', label: `frames ${plan.frames[0]} to ${plan.frames[plan.frames.length - 1]}`, tier: o.tier, format: o.format, file, have: have || lacking.length === 0, ...(have ? {} : { stills: `the sheet is not made; ${held} of ${plan.frames.length} of its stills are here` }), frames: lacking, make }
}

function stillFrames(context: PackContext): number[] {
  const frames = new Set<number>()
  if (wanted(context, 'R5')) for (const k of keysInOrder()) frames.add(k.frame)
  if (wanted(context, 'R6')) for (const f of hookFrames()) frames.add(f)
  if (wanted(context, 'R2')) for (const f of juryFrames()) frames.add(f)
  return [...frames].sort((a, b) => a - b)
}

export function filmNeeds(context: PackContext): Need[] {
  const tier = context.tier ?? 'final'
  const out: Need[] = []
  for (const frame of stillFrames(context)) out.push(stillNeed(frame, tier))
  const SHEETS = sheetsOf(context)
  for (const { plan, make } of sheetPlans(context)) out.push(sheetNeed(plan, SHEETS, make))
  if (wanted(context, 'R4')) for (const c of closeRuns(SHEETS)) out.push(sheetNeed(c.plan, SHEETS, stillCommand(c.plan.frames, SHEETS.tier, SHEETS.format, false), c.file, detailReady(c.unit, c.run.first, c.at, SHEETS)))
  if (wanted(context, 'R7')) {
    for (const unit of config.quality.stress.units) {
      const files = stressFiles(unit)
      const ready = stressReady(unit)
      const [first, last] = stressRange(unit)
      const frames = ready.source && ready.after ? [] : Array.from({ length: last - first + 1 }, (_, i) => first + i)
      const make = `npm run -s stress -- --unit ${unit}`
      out.push({ what: 'stress', label: `unit ${unit} frame ${files.frame} before encoding`, tier: config.quality.stress.tier, format: master.id, file: files.source, have: ready.source, frames, make })
      out.push({ what: 'stress', label: `unit ${unit} frame ${files.frame} after encoding at ${low} Mbit/s`, tier: config.quality.stress.tier, format: master.id, file: files.after, have: ready.after, frames, make })
    }
  }
  return out
}

export function needLines(needs: Need[]): string[] {
  const lines = needs.map((n) => `${n.have ? 'have   ' : 'missing'} · ${n.what} · ${n.label} · ${n.tier} · ${n.format} · ${rel(n.file)}${n.stills ? ` · ${n.stills}` : ''}`)
  const missing = needs.filter((n) => !n.have).length
  return [...lines, `${needs.length} needed · ${needs.length - missing} have · ${missing} missing`]
}

async function stillOf(frame: number, tier: string): Promise<string> {
  const [still] = await renderChecked([{ frame, tier, format: master.id, assets: ASSETS }])
  return still.file
}

async function filmGroups(SHEETS: SheetOptions): Promise<Group[]> {
  const sheets = await filmSheets(SHEETS)
  const groups: Group[] = []
  for (let i = 0; i < sheets.length; i++) {
    const s = sheets[i]
    groups.push({
      files: [{ image: await asPng(s.file), meaning: { what: `whole film contact sheet ${i + 1} of ${sheets.length}`, frames: s.frames, tier: SHEETS.tier, source: source(s.file) } }],
      lines: (names) => [`${names[0]}: contact sheet ${i + 1} of ${sheets.length} across the whole film, ${per} frames spread evenly from ${seconds(s.frames[0], 1)} to ${seconds(s.frames[s.frames.length - 1], 1)}, in order, reading left to right, top to bottom.`],
    })
  }
  return groups
}

async function wholePacks(tier: string, SHEETS: SheetOptions): Promise<Pack[]> {
  const groups = await filmGroups(SHEETS)
  const keys = keysInOrder()
  for (let i = 0; i < keys.length; i += KEYS_PER_FILE) {
    const mine = keys.slice(i, i + KEYS_PER_FILE)
    const placed: Placed[] = []
    const stills: string[] = []
    for (let k = 0; k < mine.length; k++) {
      const still = await stillOf(mine[k].frame, tier)
      stills.push(still)
      const left = GAP + (k % 2) * (TILE_W + GAP)
      const top = GAP + Math.floor(k / 2) * (TILE_H + STRIP + GAP)
      placed.push({ input: await scaled(still, TILE_W, TILE_H), left, top })
      placed.push({ input: strip(TILE_W, STRIP, frameLabel(mine[k].frame, 1)), left, top: top + TILE_H })
    }
    const rows = Math.ceil(mine.length / 2)
    const cols = Math.min(2, mine.length)
    const image = await asPng(canvas(cols * TILE_W + (cols + 1) * GAP, rows * (TILE_H + STRIP) + (rows + 1) * GAP, placed))
    groups.push({
      files: [{ image, meaning: { what: `key frames ${i + 1} to ${i + mine.length} of ${keys.length}, in film order`, tier, keys: mine.map((key, k) => ({ key: key.id, frame: key.frame, time: key.time, source: source(stills[k]) })) } }],
      lines: (names) => [`${names[0]}: ${mine.length} frames of the film in order, reading left to right, top to bottom, at ${mine.map((key) => seconds(key.frame, 1)).join(', ')}. Each is made smaller to fit.`],
    })
  }
  return packsOf('R5', 'E', groups, ['Every tile carries its frame number and its time.', ''])
}

async function hookPacks(tier: string): Promise<Pack[]> {
  const width = config.critics.phonePreviewWidthPx
  const groups: Group[] = []
  for (const frame of hookFrames()) {
    const still = await stillOf(frame, tier)
    const flat = await sharp(still).removeAlpha().toColourspace('srgb').resize({ width, kernel: 'lanczos3' }).png({ compressionLevel: 9 }).toBuffer()
    const size = await sharp(flat).metadata()
    groups.push({
      files: [{ image: pixelsOnly(flat), meaning: { what: 'a frame of the opening, at the width of a phone preview', frame, time: timeOf(frame), tier, source: source(still), size: { width: size.width, height: size.height } } }],
      lines: (names) => [`${names[0]}: the frame at ${seconds(frame)}, ${size.width} x ${size.height}.`],
    })
  }
  return packsOf('R6', 'F', groups, [`The files are frames of the first ${config.film.hookSeconds} seconds of the film, in order, each ${width} px wide. Nothing is drawn on them.`, ''])
}

async function compressionPacks(context: PackContext): Promise<Pack[]> {
  const labels = ['before encoding', `after encoding at ${low} Mbit/s`]
  const groups: Group[] = []
  for (const unit of config.quality.stress.units) {
    const ready = stressReady(unit)
    if (!ready.source || !ready.after) {
      if (context.noRender) throw new Error(`the stress files of unit ${unit} are not here`)
      await stress([unit], 'pack')
    }
    const files = stressFiles(unit)
    const pair = [files.source, await sharp(files.after).removeAlpha().resize(master.width, master.height, { fit: 'fill' }).png({ compressionLevel: 3 }).toBuffer()]
    const side: Placed[] = []
    for (let i = 0; i < pair.length; i++) {
      const left = GAP + i * (TILE_W + GAP)
      side.push({ input: await scaled(pair[i], TILE_W, TILE_H), left, top: GAP })
      side.push({ input: strip(TILE_W, STRIP, labels[i]), left, top: GAP + TILE_H })
    }
    const found = regionsOf(files.frame, TILE_W, CROP_H).regions
    const boxes = PLACES.map((place) => {
      const region = place.ids.map((id) => found.find((r) => r.id === id)).find((r) => r !== undefined)
      const left = region ? region.left : Math.round((master.width - TILE_W) * place.x)
      const top = region ? region.top : Math.round((master.height - CROP_H) * place.y)
      return { label: place.label, left, top, width: TILE_W, height: CROP_H }
    })
    const grid: Placed[] = []
    for (let row = 0; row < boxes.length; row++) {
      const b = boxes[row]
      const top = GAP + row * (CROP_H + STRIP + GAP)
      for (let i = 0; i < pair.length; i++) {
        const left = GAP + i * (TILE_W + GAP)
        grid.push({ input: await cropped(pair[i], b.left, b.top, b.width, b.height), left, top })
        grid.push({ input: strip(TILE_W, STRIP, `${labels[i]} · place ${row + 1} · ${b.label} · native size`), left, top: top + CROP_H })
      }
    }
    const width = 2 * TILE_W + 3 * GAP
    const shared = { unit, frame: files.frame, time: timeOf(files.frame), tier: config.quality.stress.tier, bitrateMbps: low, before: source(files.source), after: source(files.after) }
    const list: PackFile[] = [
      { image: await asPng(canvas(width, TILE_H + STRIP + 2 * GAP, side)), meaning: { what: 'one frame before encoding (left) and the same frame taken from the encode (right), both made smaller', ...shared } },
      { image: await asPng(canvas(width, boxes.length * (CROP_H + STRIP) + (boxes.length + 1) * GAP, grid)), meaning: { what: 'native size crops of that frame before encoding (left) and after (right), the same box in both', ...shared, places: boxes.map((b, i) => ({ place: i + 1, ...b })) } },
    ]
    groups.push({
      files: list,
      lines: (names) => [
        `${names[0]}: one frame of the film at ${seconds(files.frame)}, twice, side by side: left ${labels[0]}, right ${labels[1]}. Both are made smaller to fit.`,
        `${names[1]}: crops of that pair at native size, the size the frame is delivered at, one place to a row: left ${labels[0]}, right ${labels[1]}, the same place in both. ${boxes.map((b, i) => `Place ${i + 1}: ${b.label}.`).join(' ')}`,
        '',
      ],
    })
  }
  return packsOf('R7', 'G', groups, [])
}

async function motionPacks(SHEETS: SheetOptions): Promise<Pack[]> {
  const close: { first: number; group: Group }[] = []
  for (const cut of cuts) {
    const s = await cutSheet(cut.index, SHEETS)
    close.push({
      first: s.frames[0],
      group: {
        files: [{ image: await asPng(s.file), meaning: { what: `consecutive frames across cut ${cut.index} (${cut.fromSegment} to ${cut.toSegment}, the cut falls on frame ${cut.frame})`, frames: s.frames, tier: SHEETS.tier, source: source(s.file) } }],
        lines: (names) => [`${names[0]}: ${per} consecutive frames across cut ${cut.index} of ${cuts.length} of the film. The cut falls at ${seconds(cut.frame)}.`],
      },
    })
  }
  for (const c of closeRuns(SHEETS)) {
    const size = c.share === 1 ? 'the size the frame is delivered at' : `${c.share} of the size the frame is delivered at`
    const s = await detailSheet(c.unit, c.run.first, c.at, SHEETS, c.share === 1 ? 'native size' : `${c.share} of native size`)
    close.push({
      first: s.frames[0],
      group: {
        files: [{ image: await asPng(s.file), meaning: { what: `consecutive frames from a stretch where the plant ${GROWS[c.run.measure]} fastest, crops round ${c.box.label}`, frames: s.frames, measure: c.run.measure, change: c.run.change, box: c.box, share: c.share, tier: SHEETS.tier, source: source(s.file) } }],
        lines: (names) => [`${names[0]}: ${per} consecutive frames starting at ${seconds(s.frames[0])}, from a stretch where the plant ${GROWS[c.run.measure]} fastest. Each tile is the part of the frame round ${c.box.label}, the same place in every frame, at ${size}.`],
      },
    })
  }
  const groups = [...close.sort((a, b) => a.first - b.first).map((c) => c.group), ...(await filmGroups(SHEETS))]
  return packsOf('R4', 'D', groups, ['Every tile carries its frame number and its time. The frames are 1/' + config.film.fps + ' s apart where they are consecutive.', ''])
}

async function juryPacks(context: PackContext, tier: string): Promise<Pack[]> {
  const entries: { id: string; file: PackFile }[] = []
  for (const judged of judgedFrames()) {
    const still = await stillOf(judged.frame, tier)
    entries.push({ id: `frame ${judged.frame}`, file: { image: await wholeImage(still), meaning: { controls: false, what: 'judged frame', frame: judged.frame, key: judged.key, tier, source: source(still), size: wholeSize } } })
  }
  const order = (id: string): string => createHash('sha256').update(`${context.round}|film|${id}`).digest('hex')
  entries.sort((a, b) => order(a.id).localeCompare(order(b.id)))
  const groups: Group[] = entries.map((e) => ({ files: [e.file], lines: (names) => [`${names[0]}: one image, ${wholeSize.width} x ${wholeSize.height}.`] }))
  return packsOf('R2', 'B', groups, ['Each file is one image. Each call receives one file and the question, and nothing else. This list is not sent with it.', ''])
}

export async function filmPacks(context: PackContext): Promise<Pack[]> {
  const tier = context.tier ?? 'final'
  if (context.noRender) {
    const needs = filmNeeds(context)
    if (needs.some((n) => !n.have)) {
      for (const line of needLines(needs)) console.log(`pack · ${line}`)
      throw new Error('the pack is not built: something it needs is missing and --no-render forbids making it')
    }
  }
  const out: Pack[] = []
  if (wanted(context, 'R5')) out.push(...(await wholePacks(tier, sheetsOf(context))))
  if (wanted(context, 'R6')) out.push(...(await hookPacks(tier)))
  if (wanted(context, 'R7')) out.push(...(await compressionPacks(context)))
  if (wanted(context, 'R4')) out.push(...(await motionPacks(sheetsOf(context))))
  if (wanted(context, 'R2')) out.push(...(await juryPacks(context, tier)))
  return out
}
