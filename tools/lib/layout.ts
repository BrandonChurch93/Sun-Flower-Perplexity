import fs from 'node:fs'
import path from 'node:path'
import sharp, { type Sharp } from 'sharp'
import { config } from '../../src/config.ts'
import type { Hashes } from './hashes.ts'
import { machine } from './browser.ts'
import { readRecord, type Record_ } from './record.ts'

export const GAP_COLOR = { r: 27, g: 28, b: 30 }
export const STRIP_COLOR = '#25272a'
export const TEXT_COLOR = '#d6d5cf'

export interface Placed { input: Buffer; left: number; top: number }

function escape(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export function strip(width: number, height: number, text: string, align: 'left' | 'center' = 'left'): Buffer {
  const size = Math.max(10, Math.round(height * 0.62))
  const x = align === 'center' ? width / 2 : Math.round(height * 0.4)
  const anchor = align === 'center' ? 'middle' : 'start'
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="${width}" height="${height}" fill="${STRIP_COLOR}"/><text x="${x}" y="${height / 2}" dy="0.36em" text-anchor="${anchor}" font-family="DejaVu Sans, Noto Sans, sans-serif" font-size="${size}" fill="${TEXT_COLOR}">${escape(text)}</text></svg>`,
  )
}

export function canvas(width: number, height: number, parts: Placed[]): Sharp {
  return sharp({ create: { width, height, channels: 3, background: GAP_COLOR } }).composite(parts)
}

export async function scaled(input: Buffer | string, width: number, height: number): Promise<Buffer> {
  return sharp(input).removeAlpha().resize(width, height, { fit: 'fill', kernel: 'lanczos3' }).png({ compressionLevel: 3 }).toBuffer()
}

export async function cropped(input: Buffer | string, left: number, top: number, width: number, height: number): Promise<Buffer> {
  return sharp(input).removeAlpha().extract({ left, top, width, height }).png({ compressionLevel: 3 }).toBuffer()
}

export const longEdge = config.critics.maxImageLongEdgePx

export function composedRecord(kind: string, hashes: Hashes, from: string[], fields: { format: string; tier: string; assets: string; diag?: string; frames: number[] } & Record<string, unknown>): Record_ {
  const source = from.map((f) => readRecord(f)).find((r) => r !== null) ?? null
  return {
    kind,
    engineHash: hashes.engineHash,
    unitHashes: hashes.unitHashes,
    diag: 'beauty',
    browser: source?.browser ?? 'unknown',
    machine: source?.machine ?? machine(),
    standIns: source?.standIns,
    at: new Date().toISOString(),
    ...fields,
  } as Record_
}

export function sameFrames(a: number[] | undefined, b: number[]): boolean {
  return Array.isArray(a) && a.length === b.length && a.every((v, i) => v === b[i])
}

export function ensureDir(file: string): string {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  return file
}

export const pad4 = (n: number): string => String(n).padStart(4, '0')
export const rel = (file: string): string => path.relative(process.cwd(), file)
