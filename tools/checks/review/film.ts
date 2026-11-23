import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

// The drawn film on the review page: one silent file of the whole film, read with ffprobe, coded again so that the timeline scrubs, and cut into the sections by frame numbers.
export interface Probe { width: number; height: number; frames: number; audio: number }
export const MOST_WIDE = 1920
export const SMALL_WIDE = 960
export const KEY_EVERY = 15

export function probe(file: string): Probe {
  const read = (args: string[]): { streams?: { codec_type?: string; width?: number; height?: number; nb_read_packets?: string }[] } => JSON.parse(execFileSync('ffprobe', ['-v', 'error', ...args, '-of', 'json', file], { encoding: 'utf8' }))
  const video = read(['-select_streams', 'v:0', '-count_packets', '-show_entries', 'stream=width,height,nb_read_packets']).streams?.[0]
  if (!video || !video.width || !video.height) throw new Error(`no picture in ${file}`)
  const audio = (read(['-show_entries', 'stream=codec_type']).streams ?? []).filter((s) => s.codec_type === 'audio').length
  return { width: video.width, height: video.height, frames: Number(video.nb_read_packets), audio }
}

const count = (n: number): string => n.toLocaleString('en-US')
export function filmNote(p: Probe, total: number, tier: string): string {
  const short = p.frames < total ? `. The last ${count(total - p.frames)} frames are not in the file` : p.frames > total ? `. The file holds ${count(p.frames - total)} frames more than the film has` : ''
  return `${count(Math.min(p.frames, total))} of ${count(total)} frames, drawn at ${p.width} x ${p.height}, ${tier} tier${short}`
}

// The frames first to last of the source and no others, counted and not timed, so a clip starts and ends on the frame its section does.
export function clipFilter(first: number, last: number, fps: number, wide: number): string {
  return `select='between(n\\,${first}\\,${last})',setpts=N/(${fps}*TB),scale='min(${wide},iw)':-2`
}
export const filmFilter = (wide: number): string => `scale='min(${wide},iw)':-2`

// How much a film of that length may take when the rest of the site is known: kilobits a second, or 0 when nothing is left for it.
export function rateFor(limitBytes: number, otherBytes: number, seconds: number): number {
  return Math.max(0, Math.floor(((limitBytes - otherBytes) * 8 * 0.96) / seconds / 1000))
}
// The clips together run as long as the film: when narrow clips alone leave the film under half of the room, the room is shared, three parts to the film and two to the clips.
export const FILM_SHARE = 0.6

// Where a picture named by a result is on this machine: as named, under the repo, under the folder of results whatever stood before it, or by its file name beside the result.
export function pictureFile(named: string, result: string, out: string, exists: (file: string) => boolean = fs.existsSync): string | null {
  const plain = named.split(path.sep).join('/')
  const mark = 'out/work/checks/'
  const i = plain.lastIndexOf(mark)
  const tries = [named, ...(i >= 0 ? [path.join(out, plain.slice(i + mark.length))] : []), path.join(path.dirname(result), path.basename(named))]
  return tries.find((f) => exists(f)) ?? null
}

function ffmpeg(args: string[]): void {
  execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], { stdio: ['ignore', 'ignore', 'inherit'] })
}
const coded = (kbps: number): string[] => [
  '-c:v', 'libx264', '-preset', 'fast',
  ...(kbps > 0 ? ['-b:v', `${kbps}k`, '-maxrate', `${Math.round(kbps * 1.5)}k`, '-bufsize', `${kbps * 2}k`] : ['-crf', '20']),
  '-g', String(KEY_EVERY), '-keyint_min', String(KEY_EVERY), '-sc_threshold', '0', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an',
]

export function codeFilm(from: string, to: string, wide: number, kbps = 0): void {
  ffmpeg(['-i', from, '-map', '0:v:0', '-vf', filmFilter(wide), '-fps_mode', 'passthrough', ...coded(kbps), to])
}
export function cutClip(from: string, first: number, last: number, fps: number, to: string, wide: number, kbps = 0): void {
  ffmpeg(['-i', from, '-map', '0:v:0', '-vf', clipFilter(first, last, fps, wide), '-r', String(fps), '-frames:v', String(last - first + 1), ...coded(kbps), to])
}
export function frameOf(from: string, frame: number, to: string): void {
  ffmpeg(['-i', from, '-map', '0:v:0', '-vf', `select='eq(n\\,${frame})'`, '-frames:v', '1', to])
}
