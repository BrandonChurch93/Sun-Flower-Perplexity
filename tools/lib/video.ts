import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { config } from '../../src/config.ts'

const fps = config.film.fps

export interface Probe { width: number; height: number; frames: number; fps: number; codec: string; pixFmt: string; mbps: number }

function run(tool: string, args: string[]): string {
  const r = spawnSync(tool, args, { encoding: 'utf8', maxBuffer: 1 << 26 })
  if (r.status !== 0) throw new Error(`${tool} ended with code ${r.status}: ${(r.stderr || '').trim().split('\n').slice(-6).join('\n')}`)
  return r.stdout
}

export function probe(file: string): Probe {
  const out = run('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-count_frames', '-show_entries', 'stream=width,height,nb_read_frames,r_frame_rate,codec_name,pix_fmt:format=bit_rate', '-of', 'json', file])
  const j = JSON.parse(out) as { streams: { width: number; height: number; nb_read_frames: string; r_frame_rate: string; codec_name: string; pix_fmt: string }[]; format?: { bit_rate?: string } }
  const s = j.streams[0]
  if (!s) throw new Error(`ffprobe found no video in ${file}`)
  const [n, d] = s.r_frame_rate.split('/').map(Number)
  return { width: s.width, height: s.height, frames: Number(s.nb_read_frames), fps: n / (d || 1), codec: s.codec_name, pixFmt: s.pix_fmt, mbps: Number(j.format?.bit_rate ?? 0) / 1e6 }
}

export function probeLine(file: string, p: Probe = probe(file)): string {
  return `${path.relative(process.cwd(), file)}: ${p.frames} frames · ${p.fps} fps · ${p.width} x ${p.height} · ${p.codec} ${p.pixFmt} · ${p.mbps.toFixed(2)} Mbit/s · ${(fs.statSync(file).size / 1048576).toFixed(1)} MB`
}

export function bitrateFor(format: string): number {
  return format === config.formats.preview.id ? config.previewFilm.bitrateMbps : config.export.bitrateMbps
}

function codecArgs(mbps: number): string[] {
  return [
    '-c:v', 'libx264', '-preset', 'medium', '-profile:v', 'high', '-b:v', `${mbps}M`, '-maxrate', `${mbps}M`, '-bufsize', `${mbps * 2}M`,
    '-g', String(fps), '-keyint_min', String(fps), '-sc_threshold', '0', '-flags', '+cgop', '-r', String(fps), '-video_track_timescale', String(fps * 512),
    '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv', '-movflags', '+faststart', '-an',
  ]
}

function finish(tmp: string, file: string): void {
  fs.renameSync(tmp, file)
}

export function encodeFrames(pattern: string, start: number, count: number, file: string, mbps: number): void {
  const tmp = `${file}.tmp.mp4`
  run('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(fps), '-start_number', String(start), '-i', pattern, '-frames:v', String(count), '-vf', 'scale=in_range=pc:out_range=tv:out_color_matrix=bt709,format=yuv420p', ...codecArgs(mbps), tmp])
  finish(tmp, file)
}

export function encodeAgain(source: string, file: string, mbps: number, size?: { width: number; height: number }): void {
  const tmp = `${file}.tmp.mp4`
  const filter = size ? `scale=${size.width}:${size.height}:flags=lanczos,format=yuv420p` : 'format=yuv420p'
  run('ffmpeg', ['-y', '-loglevel', 'error', '-i', source, '-vf', filter, ...codecArgs(mbps), tmp])
  finish(tmp, file)
}

export function joinChunks(chunks: string[], file: string): void {
  const list = `${file}.list.txt`
  fs.writeFileSync(list, chunks.map((c) => `file '${path.resolve(c).replace(/'/g, "'\\''")}'\n`).join(''))
  const tmp = `${file}.tmp.mp4`
  try {
    run('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', '-movflags', '+faststart', tmp])
  } finally {
    fs.rmSync(list, { force: true })
  }
  finish(tmp, file)
}

export function frameFromVideo(file: string, index: number, png: string): void {
  run('ffmpeg', ['-y', '-loglevel', 'error', '-i', file, '-vf', `select='eq(n\\,${index})'`, '-frames:v', '1', png])
}
