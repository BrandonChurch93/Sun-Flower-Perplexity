import fs from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'
import { config } from '../../src/config.ts'
import { WORK } from './paths.ts'

export interface InlinePicture { label: string; w: number; h: number; src: string }

export async function inlinePicture(file: string, label: string, longEdge = config.status.pictureLongEdgePx): Promise<InlinePicture> {
  const { data, info } = await sharp(file)
    .rotate()
    .resize({ width: longEdge, height: longEdge, fit: 'inside', withoutEnlargement: true })
    .flatten({ background: '#101010' })
    .jpeg({ quality: 84, mozjpeg: true })
    .toBuffer({ resolveWithObject: true })
  return { label, w: info.width, h: info.height, src: `data:image/jpeg;base64,${data.toString('base64')}` }
}

export async function writeInline(name: string, pictures: { file: string; label: string }[], longEdge?: number): Promise<string> {
  const dir = path.join(WORK, 'status')
  fs.mkdirSync(dir, { recursive: true })
  const pics: InlinePicture[] = []
  for (const p of pictures) pics.push(await inlinePicture(p.file, p.label, longEdge))
  const out = path.join(dir, `${name}.json`)
  fs.writeFileSync(out, JSON.stringify({ pics }))
  return out
}
