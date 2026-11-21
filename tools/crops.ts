import path from 'node:path'
import sharp from 'sharp'
import { config, timeOf } from '../src/config.ts'
import { formatById, isTier } from '../src/core/tiers.ts'
import { clampFrame, segmentAt } from '../src/director/timeline.ts'
import { num, parseArgs, str } from './lib/args.ts'
import { computeHashes } from './lib/hashes.ts'
import { canvas, composedRecord, cropped, ensureDir, longEdge, pad4, rel, strip, type Placed } from './lib/layout.ts'
import { addLook } from './lib/looks.ts'
import { isMain } from './lib/main.ts'
import { WORK } from './lib/paths.ts'
import { matches, readRecord, writeRecord } from './lib/record.ts'
import { renderStills } from './still.ts'

export interface CropOptions { frame: number; tier: string; format: string; assets: string; by?: string }

const TILE_W = 640
const TILE_H = 360
const PER_SIDE = 2
const GAP = 8
const STRIP = 22

export async function cropGrids(o: CropOptions): Promise<string[]> {
  const size = formatById(o.format)
  const cols = Math.ceil(size.width / TILE_W)
  const rows = Math.ceil(size.height / TILE_H)
  const tiles: { number: number; left: number; top: number; width: number; height: number }[] = []
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const left = c * TILE_W
    const top = r * TILE_H
    tiles.push({ number: tiles.length + 1, left, top, width: Math.min(TILE_W, size.width - left), height: Math.min(TILE_H, size.height - top) })
  }
  const perGrid = PER_SIDE * PER_SIDE
  const gridW = PER_SIDE * TILE_W + (PER_SIDE + 1) * GAP
  const gridH = PER_SIDE * (TILE_H + STRIP) + (PER_SIDE + 1) * GAP
  if (Math.max(gridW, gridH) > longEdge) throw new Error('a crop grid would be larger than critics.maxImageLongEdgePx')
  const dir = path.join(WORK, 'crops', `f${pad4(o.frame)}-${o.format}-${o.tier}`)
  const hashes = computeHashes()
  const unit = segmentAt(o.frame).id
  const grids = Math.ceil(tiles.length / perGrid)
  const files = Array.from({ length: grids }, (_, g) => path.join(dir, `grid-${String(g + 1).padStart(2, '0')}.jpg`))
  const wanted = { kind: 'crops', format: o.format, tier: o.tier, assets: o.assets, diag: 'beauty', units: [unit] }
  if (files.every((f) => matches(readRecord(f), hashes, wanted))) {
    console.log(`crops · reused · ${grids} grids in ${rel(dir)}`)
    return files
  }
  const [still] = await renderStills([{ frame: o.frame, tier: o.tier, format: o.format, assets: o.assets, diag: 'beauty' }], { look: false })
  const whole = await sharp(still).removeAlpha().png({ compressionLevel: 3 }).toBuffer()
  const fraction = (a: number, b: number): string => `${(a / b).toFixed(2)} to ${(Math.min(b, a + (b === size.width ? TILE_W : TILE_H)) / b).toFixed(2)}`
  for (let g = 0; g < grids; g++) {
    const group = tiles.slice(g * perGrid, (g + 1) * perGrid)
    const parts: Placed[] = []
    for (let i = 0; i < group.length; i++) {
      const t = group[i]
      const left = GAP + (i % PER_SIDE) * (TILE_W + GAP)
      const top = GAP + Math.floor(i / PER_SIDE) * (TILE_H + STRIP + GAP)
      parts.push({ input: await cropped(whole, t.left, t.top, t.width, t.height), left, top })
      parts.push({ input: strip(TILE_W, STRIP, `crop ${t.number} · x ${fraction(t.left, size.width)} · y ${fraction(t.top, size.height)} of the frame · native size`), left, top: top + TILE_H })
    }
    const usedRows = Math.ceil(group.length / PER_SIDE)
    const usedCols = Math.min(PER_SIDE, group.length)
    ensureDir(files[g])
    await canvas(usedCols * TILE_W + (usedCols + 1) * GAP, usedRows * (TILE_H + STRIP) + (usedRows + 1) * GAP, parts).jpeg({ quality: 90 }).toFile(files[g])
    writeRecord(files[g], composedRecord('crops', hashes, [still], { format: o.format, tier: o.tier, assets: o.assets, frames: [o.frame], tiles: group }))
    const caption = `Frame ${o.frame} (${timeOf(o.frame).toFixed(1)} s, ${unit}) at the ${o.tier} tier: native size crops ${group[0].number} to ${group[group.length - 1].number} of ${tiles.length}`
    console.log(`crops · ${caption} · ${rel(files[g])}`)
    addLook(files[g], caption, o.by ?? 'builder')
  }
  return files
}

if (isMain(import.meta.url)) {
  const args = parseArgs()
  const tier = str(args, 'tier', 'review')
  if (!isTier(tier)) throw new Error(`unknown tier "${tier}"`)
  await cropGrids({ frame: clampFrame(num(args, 'frame')), tier, format: formatById(str(args, 'format', config.formats.master.id)).id, assets: str(args, 'assets', 'full'), by: str(args, 'by', 'builder') })
}
