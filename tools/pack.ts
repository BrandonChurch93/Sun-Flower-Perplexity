import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'
import { config } from '../src/config.ts'
import { cuts, keys } from '../src/director/timeline.ts'
import { isTier } from '../src/core/tiers.ts'
import { flag, num, parseArgs } from './lib/args.ts'
import { machine } from './lib/browser.ts'
import { comparePair } from './compare.ts'
import { computeHashes } from './lib/hashes.ts'
import { canvas, longEdge, rel, strip, type Placed } from './lib/layout.ts'
import { isMain } from './lib/main.ts'
import { ROOT, WORK } from './lib/paths.ts'
import { asPng, pixelsOnly } from './lib/packimage.ts'
import { filmNeeds, filmPacks, needLines } from './filmpacks.ts'
import { unitPacks } from './unitpacks.ts'
import { cutSheet, filmSheets, type SheetOptions } from './sheet.ts'

export interface PackContext { phase: number; round: number; unit: string | null; tier?: string; only?: string[]; list?: boolean; noRender?: boolean }
export interface PackFile { image: Buffer; meaning: Record<string, unknown>; name?: string; suffix?: string }
export interface Pack { critic: string; files: PackFile[]; manifest: (names: string[]) => string[]; manifestName?: string }

export { pixelsOnly }

const PACKS = path.join(WORK, 'packs')
const roundName = (round: number): string => `round-${String(round).padStart(3, '0')}`
const source = (file: string): string => path.relative(ROOT, file)

function list(numbers: number[]): string {
  if (numbers.length === 1) return String(numbers[0])
  return `${numbers.slice(0, -1).join(', ')} and ${numbers[numbers.length - 1]}`
}

async function blockoutPack(): Promise<Pack> {
  const o: SheetOptions = { tier: 'review', format: config.formats.preview.id, assets: 'full' }
  const files: PackFile[] = []
  const film = await filmSheets(o)
  for (let i = 0; i < film.length; i++) files.push({ image: await asPng(film[i].file), meaning: { what: `whole film contact sheet ${i + 1} of ${film.length}`, frames: film[i].frames, source: source(film[i].file) } })
  const cutFiles: number[] = []
  for (const cut of cuts) {
    const sheet = await cutSheet(cut.index, o)
    cutFiles.push(files.length)
    files.push({ image: await asPng(sheet.file), meaning: { what: `consecutive frames across cut ${cut.index} (${cut.fromSegment} to ${cut.toSegment}, the cut falls on frame ${cut.frame})`, frames: sheet.frames, source: source(sheet.file) } })
  }
  const pairs: { number: number; key: (typeof keys)[number]; file: string }[] = []
  for (let i = 0; i < keys.length; i++) pairs.push({ number: i + 1, key: keys[i], file: await comparePair(keys[i].id, 'review') })
  const STRIP = 24
  const GAP = 10
  const first = await sharp(pairs[0].file).metadata()
  const rowW = first.width
  const rowH = first.height
  const room = config.critics.maxFilesPerMessage - files.length
  const mostPerImage = Math.floor((longEdge + GAP) / (rowH + STRIP + GAP))
  let perImage = 2
  while (perImage < mostPerImage && Math.ceil(pairs.length / perImage) > room) perImage++
  const pairImages: { at: number; pairs: typeof pairs }[] = []
  for (let i = 0; i < pairs.length; i += perImage) {
    const group = pairs.slice(i, i + perImage)
    const parts: Placed[] = []
    let top = 0
    for (const p of group) {
      if (top > 0) top += GAP
      parts.push({ input: await sharp(p.file).png().toBuffer(), left: 0, top })
      top += rowH
      parts.push({ input: strip(rowW / 2, STRIP, `${p.number}-a`, 'center'), left: 0, top })
      parts.push({ input: strip(rowW / 2, STRIP, `${p.number}-b`, 'center'), left: rowW / 2, top })
      top += STRIP
    }
    pairImages.push({ at: files.length, pairs: group })
    files.push({
      image: await asPng(canvas(rowW, top, parts)),
      meaning: {
        what: `key pairs ${list(group.map((p) => p.number))}`,
        pairs: group.map((p) => ({ pair: p.number, key: p.key.id, frame: p.key.frame, time: p.key.time, a: p.key.image, b: `film frame ${p.key.frame} at the review tier`, source: source(p.file) })),
      },
    })
  }
  const manifest = (names: string[]): string[] => {
    const lines: string[] = []
    lines.push(`${names[0]} to ${names[film.length - 1]}: contact sheets across the whole film, in order, ${config.critics.contactSheetFrames} frames each, reading left to right, top to bottom`)
    cuts.forEach((cut, i) => lines.push(`${names[cutFiles[i]]}: consecutive frames across cut ${cut.index}`))
    for (const image of pairImages) {
      const numbers = image.pairs.map((p) => p.number)
      const how = numbers.length === 1 ? `pair ${numbers[0]}` : `pairs ${list(numbers)}, one above the other`
      lines.push(`${names[image.at]}: ${how}. In every pair the left picture (N-a) is the target image and the right picture (N-b) is the blockout frame at the same moment.`)
    }
    for (const image of pairImages) for (const p of image.pairs) {
      if (p.key.settled.length === 0) continue
      lines.push('')
      lines.push(`Settled (${names[image.at]}, pair ${p.number}: ${p.number}-a and ${p.number}-b)`)
      for (const line of p.key.settled) lines.push(`- ${line}`)
    }
    return lines
  }
  return { critic: 'R4-blockout', files, manifest }
}

const PHASES: Record<number, ((context: PackContext) => Promise<Pack | Pack[]>)[]> = {
  2: [blockoutPack],
  3: [unitPacks],
  4: [unitPacks],
  5: [filmPacks],
}

export async function buildPacks(context: PackContext): Promise<string[]> {
  const builders = PHASES[context.phase]
  if (!builders) throw new Error(`the packs of phase ${context.phase} are not built yet; phases with packs: ${Object.keys(PHASES).join(', ')}`)
  if (context.list || context.noRender) {
    if (!builders.includes(filmPacks)) throw new Error('--list and --no-render are for the packs of the whole film round (phase 5)')
    if (context.list) {
      for (const line of needLines(filmNeeds(context))) console.log(`pack · ${line}`)
      return []
    }
  }
  const round = roundName(context.round)
  const hashes = computeHashes()
  let commit = 'unknown'
  try {
    commit = execSync('git rev-parse HEAD', { cwd: ROOT, encoding: 'utf8' }).trim()
  } catch {}
  const perUnit = builders.includes(unitPacks) || builders.includes(filmPacks)
  const tier = context.tier ?? 'final'
  const test = perUnit && tier !== 'final'
  if (test) console.log(`pack · TEST PACK · judged stills at the ${tier} tier, not final · DO NOT SEND THIS PACK TO A CRITIC`)
  const began = Date.now()
  const key: Record<string, unknown> = { round: context.round, phase: context.phase, unit: context.unit, ...(perUnit ? { tier, test } : {}), commit, engineHash: hashes.engineHash, unitHashes: hashes.unitHashes, machine: machine(), critics: {} }
  const folders: string[] = []
  for (const build of builders) {
    const built = await build(context)
    for (const pack of Array.isArray(built) ? built : [built]) {
      if (pack.files.length > config.critics.maxFilesPerMessage) throw new Error(`the pack for ${pack.critic} holds ${pack.files.length} files, over critics.maxFilesPerMessage; split it across two critics`)
      const dir = path.join(PACKS, round, pack.critic)
      fs.rmSync(dir, { recursive: true, force: true })
      fs.mkdirSync(dir, { recursive: true })
      const names = pack.files.map((f, i) => f.name ?? `set-A-${String(i + 1).padStart(2, '0')}.png`)
      const meanings: Record<string, unknown> = {}
      pack.files.forEach((f, i) => {
        fs.writeFileSync(path.join(dir, names[i]), f.image)
        meanings[names[i]] = f.meaning
      })
      const manifestName = pack.manifestName ?? 'MANIFEST.md'
      fs.writeFileSync(path.join(dir, manifestName), pack.manifest(names).join('\n').replace(/\n+$/, '') + '\n')
      ;(key.critics as Record<string, unknown>)[pack.critic] = meanings
      folders.push(dir)
      console.log(`pack · ${pack.critic} · ${names.length} files (${names[0]} to ${names[names.length - 1]}) and ${manifestName} · ${rel(dir)}`)
    }
  }
  if (perUnit) console.log(`pack · built in ${((Date.now() - began) / 60000).toFixed(1)} min${test ? ` · TEST PACK at the ${tier} tier` : ''}`)
  const keyFile = path.join(PACKS, 'keys', `${round}.json`)
  fs.mkdirSync(path.dirname(keyFile), { recursive: true })
  fs.writeFileSync(keyFile, JSON.stringify(key, null, 2) + '\n')
  console.log(`pack · key · ${rel(keyFile)}`)
  return folders
}

if (isMain(import.meta.url)) {
  const args = parseArgs()
  const tier = typeof args.tier === 'string' ? args.tier : undefined
  if (tier !== undefined && !isTier(tier)) throw new Error(`unknown tier "${tier}"`)
  await buildPacks({ phase: num(args, 'phase'), round: num(args, 'round'), unit: typeof args.unit === 'string' ? args.unit : null, tier, only: typeof args.only === 'string' ? args.only.split(',').map((c) => c.trim().toUpperCase()) : undefined, list: flag(args, 'list'), noRender: flag(args, 'no-render') })
}
