import { createHash } from 'node:crypto'
import path from 'node:path'
import { config, timeOf } from '../src/config.ts'
import { cuts, judgedFrames, keys, segmentById, type TimedKey } from '../src/director/timeline.ts'
import { renderChecked } from './lib/checked.ts'
import { canvas, cropped, strip, type Placed } from './lib/layout.ts'
import { at, ROOT } from './lib/paths.ts'
import { asPng, atMasterSize, wholeImage, wholeSize } from './lib/packimage.ts'
import { fastestRun, regionsOf, type Absent, type Region } from './lib/regions.ts'
import type { Pack, PackContext, PackFile } from './pack.ts'
import { sheetCommand, sheetNeed, stillCommand, stillNeed, type Need } from './filmpacks.ts'
import { cutSheet, cutSheetPlan, detailReady, detailSheet, detailSheetFile, detailSize, runSheet, runSheetPlan, unitSheet, unitSheetPlan, type SheetOptions } from './sheet.ts'

const master = config.formats.master
const most = config.critics.maxFilesPerMessage
const edge = config.critics.maxImageLongEdgePx
const ASSETS = 'full'
const GAP = 8
const STRIP = 22
const SHEET_TIER = 'review'
const source = (file: string): string => path.relative(ROOT, file)
const seconds = (frame: number): string => `${timeOf(frame).toFixed(1)} s`
const range = (a: number, b: number): string => (a === b ? `region ${a}` : `regions ${a} to ${b}`)

const PAIR_W = Math.floor((edge - 3 * GAP) / 2)
const PAIR_ROWS = 4
const PAIR_H = Math.floor((edge - (PAIR_ROWS + 1) * GAP) / PAIR_ROWS) - STRIP
const MATCH = ['head', 'stem', 'leaf-front', 'neighbors', 'sun', 'field', 'far', 'sky']
const CROP_W = PAIR_W
const CROP_H = Math.round((CROP_W * master.height) / master.width)
const CROP_ROWS = Math.floor((edge - GAP) / (CROP_H + STRIP + GAP))

async function stillOf(frame: number, tier: string): Promise<string> {
  const [still] = await renderChecked([{ frame, tier, format: master.id, assets: ASSETS }])
  return still.file
}

function parts<T>(items: T[][], limit: number): T[][][] {
  const out: T[][][] = [[]]
  let held = 0
  for (const item of items) {
    if (item.length > limit) throw new Error(`one group of ${item.length} files cannot fit a pack of ${limit}`)
    if (held + item.length > limit) {
      out.push([])
      held = 0
    }
    out[out.length - 1].push(item)
    held += item.length
  }
  return out
}

const named = (critic: string, count: number, part: number): string => (count > 1 ? `${critic}-${part + 1}` : critic)
const splitNote = (count: number, part: number): string[] => (count > 1 ? [`This is part ${part + 1} of ${count}. The parts hold different pictures of the same kind and are judged the same way, each on its own.`, ''] : [])

export interface Group { files: PackFile[]; lines: (names: string[]) => string[]; after?: (names: string[]) => string[] }

export function packsOf(critic: string, letter: string, groups: Group[], head: string[], tail: string[] = []): Pack[] {
  const split = parts(groups.map((g) => g.files), most)
  let next = 0
  let number = 1
  return split.map((share, part) => {
    const mine = groups.slice(next, next + share.length)
    next += share.length
    const files: PackFile[] = []
    const starts: number[] = []
    for (const g of mine) {
      starts.push(files.length)
      for (const f of g.files) {
        const n = String(number).padStart(2, '0')
        files.push({ ...f, name: `set-${letter}-${n}${f.suffix ?? ''}.png` })
        if (f.suffix !== '-a') number++
      }
    }
    return {
      critic: named(critic, split.length, part),
      files,
      manifestName: 'manifest.txt',
      manifest: (names: string[]) => {
        const lines = [...splitNote(split.length, part), ...head]
        mine.forEach((g, i) => lines.push(...g.lines(names.slice(starts[i], starts[i] + g.files.length))))
        mine.forEach((g, i) => lines.push(...(g.after?.(names.slice(starts[i], starts[i] + g.files.length)) ?? [])))
        return [...lines, ...tail]
      },
    }
  })
}

async function matchPacks(unit: string, tier: string): Promise<Pack[]> {
  const groups: Group[] = []
  for (const key of keys.filter((k) => k.unit === unit)) {
    const still = await stillOf(key.frame, tier)
    const found = regionsOf(key.frame, PAIR_W, PAIR_H)
    const regions = MATCH.map((id) => found.regions.find((r) => r.id === id)).filter((r): r is Region => r !== undefined)
    const wide = await atMasterSize(at(key.image))
    const files: PackFile[] = [
      { image: await wholeImage(at(key.image)), suffix: '-a', meaning: { what: 'the approved image of the key', key: key.id, source: key.image, size: wholeSize } },
      { image: await wholeImage(still), suffix: '-b', meaning: { what: 'the film frame of the key', key: key.id, frame: key.frame, time: key.time, tier, source: source(still), size: wholeSize } },
    ]
    const grids: Region[][] = []
    for (let i = 0; i < regions.length; i += PAIR_ROWS) grids.push(regions.slice(i, i + PAIR_ROWS))
    for (let g = 0; g < grids.length; g++) {
      const placed: Placed[] = []
      for (let row = 0; row < grids[g].length; row++) {
        const r = grids[g][row]
        const number = g * PAIR_ROWS + row + 1
        const top = GAP + row * (PAIR_H + STRIP + GAP)
        placed.push({ input: await cropped(wide, r.left, r.top, r.width, r.height), left: GAP, top })
        placed.push({ input: await cropped(still, r.left, r.top, r.width, r.height), left: 2 * GAP + PAIR_W, top })
        placed.push({ input: strip(PAIR_W, STRIP, `a · region ${number} · ${r.label}`), left: GAP, top: top + PAIR_H })
        placed.push({ input: strip(PAIR_W, STRIP, `b · region ${number} · ${r.label}`), left: 2 * GAP + PAIR_W, top: top + PAIR_H })
      }
      const image = await asPng(canvas(2 * PAIR_W + 3 * GAP, grids[g].length * (PAIR_H + STRIP) + (grids[g].length + 1) * GAP, placed))
      files.push({ image, meaning: { what: 'matching native size crops of the approved image (a, scaled once to the master format) and the film frame (b)', key: key.id, frame: key.frame, tier, regions: grids[g].map((r, i) => ({ region: g * PAIR_ROWS + i + 1, ...r })) } })
    }
    groups.push({
      files,
      lines: (names) => {
        const lines = [`${names[0]} and ${names[1]}: one pair, the same moment (${seconds(key.frame)}), both ${wholeSize.width} x ${wholeSize.height}.`]
        grids.forEach((grid, g) => {
          const first = g * PAIR_ROWS + 1
          lines.push(`${names[2 + g]}: crops of that pair at native size (the size of ${names[1]} before it was made smaller to fit; ${names[0]} was brought to that size first), ${range(first, first + grid.length - 1)}, one region to a row. In every row the left tile, labeled a, is cut from ${names[0]} and the right tile, labeled b, is cut from ${names[1]}, at the same place in the picture. ${grid.map((r, i) => `Region ${first + i}: ${r.label}.`).join(' ')}`)
        })
        return [...lines, '']
      },
      after: (names) => (key.settled.length ? ['', `Settled (${names[0]} and ${names[1]})`, ...key.settled.map((line) => `- ${line}`)] : []),
    })
  }
  return packsOf('R1', 'A', groups, ['A file whose name ends in -a and a file whose name ends in -b with the same number are one pair. In a tile label inside a grid, a and b mean the same as -a and -b in a file name.', ''])
}

async function surfacePacks(unit: string, tier: string): Promise<Pack[]> {
  const groups: Group[] = []
  const missing: { frame: number; absent: Absent[] }[] = []
  for (const judged of judgedFrames().filter((j) => j.unit === unit)) {
    const still = await stillOf(judged.frame, tier)
    const found = regionsOf(judged.frame, CROP_W, CROP_H)
    missing.push({ frame: judged.frame, absent: found.absent })
    const files: PackFile[] = [{ image: await wholeImage(still), meaning: { what: 'the judged frame, whole', frame: judged.frame, why: judged.why, tier, source: source(still), size: wholeSize } }]
    const per = 2 * CROP_ROWS
    const grids: Region[][] = []
    for (let i = 0; i < found.regions.length; i += per) grids.push(found.regions.slice(i, i + per))
    for (let g = 0; g < grids.length; g++) {
      const placed: Placed[] = []
      for (let i = 0; i < grids[g].length; i++) {
        const r = grids[g][i]
        const left = GAP + (i % 2) * (CROP_W + GAP)
        const top = GAP + Math.floor(i / 2) * (CROP_H + STRIP + GAP)
        placed.push({ input: await cropped(still, r.left, r.top, r.width, r.height), left, top })
        placed.push({ input: strip(CROP_W, STRIP, `crop ${g * per + i + 1} · ${r.label} · ${seconds(judged.frame)} · native size`), left, top: top + CROP_H })
      }
      const rows = Math.ceil(grids[g].length / 2)
      const cols = Math.min(2, grids[g].length)
      files.push({ image: await asPng(canvas(cols * CROP_W + (cols + 1) * GAP, rows * (CROP_H + STRIP) + (rows + 1) * GAP, placed)), meaning: { what: 'native size crops of the surfaces in the judged frame', frame: judged.frame, tier, source: source(still), crops: grids[g].map((r, i) => ({ crop: g * per + i + 1, ...r })) } })
    }
    groups.push({
      files,
      lines: (names) => [
        `${names[0]}: the whole frame at ${seconds(judged.frame)}, made smaller to fit (${wholeSize.width} x ${wholeSize.height}).`,
        ...grids.map((grid, g) => `${names[1 + g]}: crops of the frame at ${seconds(judged.frame)} at native size, the size the frame is delivered at. ${grid.map((r, i) => `Crop ${g * per + i + 1}: ${r.label}.`).join(' ')}`),
        ...(found.absent.length ? [`Not shown for the frame at ${seconds(judged.frame)}: ${found.absent.map((a) => `${a.label} (${a.why})`).join('; ')}.`] : []),
        '',
      ],
    })
  }
  return packsOf('R3', 'C', groups, [])
}

async function motionPacks(unit: string): Promise<Pack[]> {
  const segment = segmentById(unit)
  const o: SheetOptions = { tier: SHEET_TIER, format: config.formats.preview.id, assets: ASSETS, look: false }
  const big: SheetOptions = { ...o, format: master.id }
  const per = config.critics.contactSheetFrames
  const across = await unitSheet(unit, o)
  const run = fastestRun(unit, per)
  const fast = await runSheet(unit, run.first, big)
  const middle = run.first + Math.floor(per / 2)
  const found = regionsOf(middle, detailSize.width, detailSize.height)
  const box = found.regions.find((r) => r.id === 'head') ?? found.regions.find((r) => r.id === 'stem') ?? found.regions[0]
  const close = box ? await detailSheet(unit, run.first, box, big) : null
  const cut = cuts.find((c) => c.toSegment === unit)
  const acrossCut = cut ? await cutSheet(cut.index, o) : null
  const sheets: { file: string; meaning: Record<string, unknown>; line: string }[] = [
    { file: across.file, meaning: { what: `contact sheet across the unit ${unit}`, frames: across.frames }, line: `${per} frames spread evenly across this part of the film (${seconds(segment.firstFrame)} to ${seconds(segment.lastFrame)}), in order, reading left to right, top to bottom.` },
    { file: fast.file, meaning: { what: 'consecutive frames from the stretch where the plant changes fastest', frames: fast.frames, change: run.change }, line: `${per} consecutive frames starting at ${timeOf(fast.frames[0]).toFixed(2)} s, from the stretch where the plant changes fastest. Each tile is a whole frame made smaller.` },
  ]
  if (close && box) sheets.push({ file: close.file, meaning: { what: `the same consecutive frames, native size crops round ${box.label}`, frames: close.frames, box }, line: `the same ${per} consecutive frames as the sheet before, cut at native size round ${box.label}, the same place in every frame. Use it for fine things such as hairs and edges.` })
  if (acrossCut && cut) sheets.push({ file: acrossCut.file, meaning: { what: `consecutive frames across cut ${cut.index} (${cut.fromSegment} to ${cut.toSegment}, the cut falls on frame ${cut.frame})`, frames: acrossCut.frames }, line: `${per} consecutive frames across the cut that begins this part of the film. The cut falls at ${timeOf(cut.frame).toFixed(2)} s.` })
  const groups: Group[] = []
  for (const s of sheets) groups.push({ files: [{ image: await asPng(s.file), meaning: { ...s.meaning, tier: SHEET_TIER, source: source(s.file) } }], lines: (names) => [`${names[0]}: ${s.line}`] })
  return packsOf('R4', 'D', groups, ['Every tile carries its frame number and its time. The frames are 1/' + config.film.fps + ' s apart where they are consecutive.', ''])
}

async function juryPacks(context: PackContext, unit: string, tier: string): Promise<Pack[]> {
  const entries: { id: string; file: PackFile }[] = []
  for (const judged of judgedFrames().filter((j) => j.unit === unit)) {
    const still = await stillOf(judged.frame, tier)
    entries.push({ id: `frame ${judged.frame}`, file: { image: await wholeImage(still), meaning: { controls: false, what: 'judged frame', frame: judged.frame, key: judged.key, tier, source: source(still), size: wholeSize } } })
  }
  for (const key of keys.filter((k: TimedKey) => k.unit === unit)) {
    entries.push({ id: `control ${key.id}`, file: { image: await wholeImage(at(key.image)), meaning: { controls: true, what: 'control: the approved image of the key', key: key.id, source: key.image, size: wholeSize } } })
  }
  const order = (id: string): string => createHash('sha256').update(`${context.round}|${unit}|${id}`).digest('hex')
  entries.sort((a, b) => order(a.id).localeCompare(order(b.id)))
  const groups: Group[] = entries.map((e) => ({ files: [e.file], lines: (names) => [`${names[0]}: one image, ${wholeSize.width} x ${wholeSize.height}.`] }))
  return packsOf('R2', 'B', groups, ['Each file is one image. Each call receives one file and the question, and nothing else. This list is not sent with it.', ''])
}

export function unitNeeds(unit: string, tier: string, critics: string[]): Need[] {
  const out: Need[] = []
  const frames = new Set<number>()
  if (critics.includes('R1')) for (const key of keys.filter((k) => k.unit === unit)) frames.add(key.frame)
  if (critics.includes('R2') || critics.includes('R3')) for (const judged of judgedFrames().filter((j) => j.unit === unit)) frames.add(judged.frame)
  for (const frame of [...frames].sort((a, b) => a - b)) out.push(stillNeed(frame, tier))
  if (!critics.includes('R4')) return out
  const o: SheetOptions = { tier: SHEET_TIER, format: config.formats.preview.id, assets: ASSETS, look: false }
  const big: SheetOptions = { ...o, format: master.id }
  out.push(sheetNeed(unitSheetPlan(unit, o), o, sheetCommand(`--unit ${unit}`, o)))
  const run = runSheetPlan(unit, fastestRun(unit, config.critics.contactSheetFrames).first, big)
  const make = stillCommand(run.frames, big.tier, big.format, false)
  out.push(sheetNeed(run, big, make))
  const found = regionsOf(run.frames[0] + Math.floor(run.frames.length / 2), detailSize.width, detailSize.height)
  const box = found.regions.find((r) => r.id === 'head') ?? found.regions.find((r) => r.id === 'stem') ?? found.regions[0]
  if (box) out.push(sheetNeed(run, big, make, detailSheetFile(unit, run.frames[0], big), detailReady(unit, run.frames[0], box, big)))
  const cut = cuts.find((c) => c.toSegment === unit)
  if (cut) out.push(sheetNeed(cutSheetPlan(cut.index, o), o, sheetCommand(`--cut ${cut.index}`, o)))
  return out
}

export async function unitPacks(context: PackContext): Promise<Pack[]> {
  if (!context.unit) throw new Error('the packs of a unit round need --unit ID')
  const unit = segmentById(context.unit).id
  const tier = context.tier ?? 'final'
  const wanted = (critic: string): boolean => !context.only || context.only.includes(critic)
  const out: Pack[] = []
  if (wanted('R1')) out.push(...(await matchPacks(unit, tier)))
  if (wanted('R2')) out.push(...(await juryPacks(context, unit, tier)))
  if (wanted('R3')) out.push(...(await surfacePacks(unit, tier)))
  if (wanted('R4')) out.push(...(await motionPacks(unit)))
  return out
}
