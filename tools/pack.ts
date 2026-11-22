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
import { subPacks } from './lib/recordplan.ts'
import { forbidRenders } from './lib/render.ts'
import { recordNeeds, recordPacks, renderLines } from './recordpacks.ts'
import { unitPacks } from './unitpacks.ts'
import { cutSheet, filmSheets, type SheetOptions } from './sheet.ts'

export interface PackContext { phase: number; round: number; unit: string | null; tier?: string; only?: string[]; list?: boolean; noRender?: boolean; sheetTier?: string }
export interface PackFile { image: Buffer; meaning: Record<string, unknown>; name?: string; suffix?: string }
export interface Pack { critic: string; files: PackFile[]; manifest: (names: string[]) => string[]; manifestName?: string; group?: string }

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
  6: [recordPacks],
}

interface SubKey { unit: string | null; critics: Record<string, unknown> }
const baseOf = (critic: string): string => critic.replace(/-\d+$/, '')
const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b)

function ordered(packs: Record<string, SubKey>): Record<string, SubKey> {
  const out: Record<string, SubKey> = {}
  for (const sub of subPacks()) {
    const held = packs[sub.name]
    if (!held) continue
    const names = Object.keys(held.critics).sort((a, b) => sub.critics.indexOf(baseOf(a)) - sub.critics.indexOf(baseOf(b)) || a.localeCompare(b, 'en', { numeric: true }))
    out[sub.name] = { unit: sub.unit, critics: Object.fromEntries(names.map((n) => [n, held.critics[n]])) }
  }
  return out
}

export async function buildPacks(context: PackContext): Promise<string[]> {
  const builders = PHASES[context.phase]
  if (!builders) throw new Error(`the packs of phase ${context.phase} are not built yet; phases with packs: ${Object.keys(PHASES).join(', ')}`)
  const record = builders.includes(recordPacks)
  if (context.list || context.noRender) {
    if (!builders.includes(filmPacks) && !record) throw new Error('--list and --no-render are for the packs of the whole film round (phase 5) and of the record round (phase 6)')
    if (context.noRender) forbidRenders()
    if (context.list) {
      for (const line of record ? renderLines(recordNeeds(context)) : needLines(filmNeeds(context))) console.log(`pack · ${line}`)
      return []
    }
  }
  const round = roundName(context.round)
  const hashes = computeHashes()
  let commit = 'unknown'
  try {
    commit = execSync('git rev-parse HEAD', { cwd: ROOT, encoding: 'utf8' }).trim()
  } catch {}
  const perUnit = builders.includes(unitPacks) || builders.includes(filmPacks) || record
  const tier = context.tier ?? 'final'
  const sheets = (builders.includes(filmPacks) || record) && context.sheetTier !== undefined && context.sheetTier !== 'review' ? context.sheetTier : null
  const test = perUnit && (tier !== 'final' || sheets !== null)
  if (test) console.log(`pack · TEST PACK · judged stills at the ${tier} tier${tier === 'final' ? '' : ', not final'}${sheets ? `, sheets at the ${sheets} tier, not review` : ''} · DO NOT SEND THIS PACK TO A CRITIC`)
  const began = Date.now()
  const tiers = { stills: tier, sheets: sheets ?? 'review', stress: config.quality.stress.tier }
  const key: Record<string, unknown> = record
    ? { round: context.round, phase: context.phase, tier, test, tiers, commit, engineHash: hashes.engineHash, unitHashes: hashes.unitHashes, packs: {} }
    : { round: context.round, phase: context.phase, unit: context.unit, ...(perUnit ? { tier, test, ...(sheets ? { sheetTier: sheets } : {}) } : {}), commit, engineHash: hashes.engineHash, unitHashes: hashes.unitHashes, machine: machine(), critics: {} }
  const keyFile = path.join(PACKS, 'keys', `${round}.json`)
  const folders: string[] = []
  for (const build of builders) {
    const built = await build(context)
    const packs: Record<string, SubKey> = {}
    if (record) {
      let old: Record<string, unknown> | null = null
      try {
        old = JSON.parse(fs.readFileSync(keyFile, 'utf8')) as Record<string, unknown>
      } catch {}
      const kept = context.only !== undefined && old !== null && old.phase === context.phase && old.round === context.round && old.commit === commit && old.engineHash === hashes.engineHash && same(old.unitHashes, hashes.unitHashes) && same(old.tiers, tiers)
      if (kept) Object.assign(packs, old?.packs as Record<string, SubKey>)
      else {
        if (fs.existsSync(path.join(PACKS, round))) console.log(`pack · ${rel(path.join(PACKS, round))} is emptied first${context.only ? ': what it held was not of this build' : ''}`)
        fs.rmSync(path.join(PACKS, round), { recursive: true, force: true })
      }
      for (const pack of Array.isArray(built) ? built : [built]) {
        const sub = pack.group ?? ''
        for (const name of Object.keys(packs[sub]?.critics ?? {})) {
          if (baseOf(name) !== baseOf(pack.critic)) continue
          delete packs[sub].critics[name]
          fs.rmSync(path.join(PACKS, round, sub, name), { recursive: true, force: true })
        }
      }
    }
    for (const pack of Array.isArray(built) ? built : [built]) {
      if (pack.files.length > config.critics.maxFilesPerMessage) throw new Error(`the pack for ${pack.critic} holds ${pack.files.length} files, over critics.maxFilesPerMessage; split it across two critics`)
      const dir = pack.group ? path.join(PACKS, round, pack.group, pack.critic) : path.join(PACKS, round, pack.critic)
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
      if (record && pack.group) {
        packs[pack.group] ??= { unit: null, critics: {} }
        packs[pack.group].critics[pack.critic] = meanings
      } else (key.critics as Record<string, unknown>)[pack.critic] = meanings
      folders.push(dir)
      console.log(`pack · ${pack.group ? `${pack.group}/` : ''}${pack.critic} · ${names.length} files (${names[0]} to ${names[names.length - 1]}) and ${manifestName} · ${rel(dir)}`)
    }
    if (record) key.packs = ordered(packs)
  }
  if (perUnit) console.log(`pack · built in ${((Date.now() - began) / 60000).toFixed(1)} min${test ? ` · TEST PACK at the ${tier} tier` : ''}`)
  fs.mkdirSync(path.dirname(keyFile), { recursive: true })
  fs.writeFileSync(keyFile, JSON.stringify(key, null, 2) + '\n')
  console.log(`pack · key · ${rel(keyFile)}`)
  return folders
}

if (isMain(import.meta.url)) {
  const args = parseArgs()
  const tier = typeof args.tier === 'string' ? args.tier : undefined
  if (tier !== undefined && !isTier(tier)) throw new Error(`unknown tier "${tier}"`)
  const sheetTier = typeof args['sheet-tier'] === 'string' ? args['sheet-tier'] : undefined
  if (sheetTier !== undefined && !isTier(sheetTier)) throw new Error(`unknown tier "${sheetTier}"`)
  await buildPacks({ phase: num(args, 'phase'), round: num(args, 'round'), unit: typeof args.unit === 'string' ? args.unit : null, tier, only: typeof args.only === 'string' ? args.only.split(',').map((c) => c.trim().toUpperCase()) : undefined, list: flag(args, 'list'), noRender: flag(args, 'no-render'), sheetTier })
}
