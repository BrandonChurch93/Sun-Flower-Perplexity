import fs from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'
import { config } from '../src/config.ts'
import { tierIds } from '../src/core/tiers.ts'
import { judgedFrames, keys, segmentAt, segmentById, segments } from '../src/director/timeline.ts'
import { flag, parseArgs } from './lib/args.ts'
import { computeHashes, type Hashes } from './lib/hashes.ts'
import { pad4, rel } from './lib/layout.ts'
import { isMain } from './lib/main.ts'
import { at, WORK } from './lib/paths.ts'
import { readRecord, recordPath, type Record_ } from './lib/record.ts'
import { stillPath } from './still.ts'

const master = config.formats.master.id
const STILLS = at('out', 'stills')

function fresh(record: Record_ | null, hashes: Hashes, units: string[]): record is Record_ {
  if (!record || record.engineHash !== hashes.engineHash) return false
  return units.every((u) => record.unitHashes[u] === hashes.unitHashes[u])
}

function copyWithRecord(from: string, to: string): void {
  fs.mkdirSync(path.dirname(to), { recursive: true })
  fs.copyFileSync(from, to)
  fs.copyFileSync(recordPath(from), recordPath(to))
}

export async function keep(options: { unit: string | null; clips: boolean }): Promise<{ kept: string[]; missing: string[] }> {
  const hashes = computeHashes()
  const kept: string[] = []
  const missing: string[] = []
  const units = options.unit ? [segmentById(options.unit).id] : segments.map((s) => s.id)
  const got = (file: string, note = ''): void => {
    kept.push(`${rel(file)}${note}`)
  }

  for (const j of judgedFrames().filter((f) => units.includes(f.unit))) {
    let done = false
    for (const tier of ['final', 'review']) {
      const file = stillPath({ frame: j.frame, tier, format: master, assets: 'full', diag: 'beauty' })
      const record = readRecord(file)
      if (!fresh(record, hashes, [j.unit]) || record.kind !== 'still' || record.tier !== tier) continue
      const to = path.join(STILLS, `judged-f${pad4(j.frame)}.jpg`)
      fs.mkdirSync(STILLS, { recursive: true })
      await sharp(file).removeAlpha().jpeg({ quality: 92, chromaSubsampling: '4:4:4' }).toFile(to)
      fs.copyFileSync(recordPath(file), recordPath(to))
      got(to, ` (frame ${j.frame}, ${tier} tier)`)
      done = true
      break
    }
    if (!done) missing.push(`the judged still of frame ${j.frame} (${j.unit}) at the final or review tier from the current build`)
  }

  for (const key of keys.filter((k) => units.includes(k.unit))) {
    const file = path.join(WORK, 'compare', `compare-${key.id}.jpg`)
    if (fresh(readRecord(file), hashes, [key.unit])) {
      const to = path.join(STILLS, path.basename(file))
      copyWithRecord(file, to)
      got(to)
    } else missing.push(`compare-${key.id}.jpg from the current build`)
  }

  const sheetDir = path.join(WORK, 'sheets')
  const sheets = fs.existsSync(sheetDir) ? fs.readdirSync(sheetDir).filter((n) => /^(film|cut|unit)-.*\.jpg$/.test(n)).sort() : []
  const wantedSheet = (name: string, shown: string[]): boolean => {
    if (!options.unit) return true
    if (name.startsWith('film-')) return false
    return shown.includes(options.unit)
  }
  let sheetCount = 0
  for (const name of sheets) {
    const file = path.join(sheetDir, name)
    const record = readRecord(file)
    const shown = [...new Set((record?.frames ?? []).map((f) => segmentAt(f).id))]
    if (!wantedSheet(name, shown)) continue
    if (!fresh(record, hashes, shown)) {
      missing.push(`${name} is from another build`)
      continue
    }
    const to = path.join(STILLS, name)
    copyWithRecord(file, to)
    got(to)
    sheetCount++
  }
  if (sheetCount === 0) missing.push('a contact sheet from the current build')

  if (!options.unit) {
    const films = tierIds
      .map((tier) => path.join(WORK, `film-${config.formats.preview.id}-${tier}.mp4`))
      .filter((file) => {
        const record = readRecord(file)
        return fresh(record, hashes, segments.map((s) => s.id)) && record.kind === 'film' && record.format === config.formats.preview.id
      })
      .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)
    if (films.length) {
      const to = at('out', 'preview.mp4')
      copyWithRecord(films[0], to)
      got(to, ` (from ${rel(films[0])})`)
    } else missing.push(`a whole film in the ${config.formats.preview.id} format from the current build (out/work/film-${config.formats.preview.id}-<tier>.mp4)`)
  }

  if (options.clips) {
    for (const unit of units) {
      const file = path.join(WORK, 'clips', `${unit}.mp4`)
      if (fresh(readRecord(file), hashes, [unit])) {
        const to = at('out', 'clips', `${unit}.mp4`)
        copyWithRecord(file, to)
        got(to)
      } else missing.push(`the clip of unit ${unit} from the current build (out/work/clips/${unit}.mp4)`)
    }
  }

  console.log(kept.length ? `kept ${kept.length} files:` : 'kept nothing')
  for (const k of kept) console.log(`  ${k}`)
  if (missing.length) {
    console.log(`could not find ${missing.length}:`)
    for (const m of missing) console.log(`  ${m}`)
  }
  return { kept, missing }
}

if (isMain(import.meta.url)) {
  const args = parseArgs()
  await keep({ unit: typeof args.unit === 'string' ? args.unit : null, clips: flag(args, 'clips') })
}
