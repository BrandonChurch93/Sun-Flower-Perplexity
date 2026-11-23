import { config } from '../config.ts'

// Where the export page leaves one line about its last file, for the pacing report of the player.
export const EXPORT_NOTE = `${config.slug}.export.last`

export interface Track {
  name: string
  megabytes: number
  sha256: string
  matches: boolean
  // The file as it was read. It stays in memory and goes nowhere else.
  bytes: ArrayBuffer
}

export function hex(bytes: ArrayBuffer): string {
  let out = ''
  for (const b of new Uint8Array(bytes)) out += b.toString(16).padStart(2, '0')
  return out
}

export async function readTrack(file: File): Promise<Track> {
  const bytes = await file.arrayBuffer()
  const sha256 = hex(await crypto.subtle.digest('SHA-256', bytes))
  return { name: file.name, megabytes: bytes.byteLength / 1048576, sha256, matches: sha256 === config.music.sha256, bytes }
}

export function trackLine(track: Track | null): string {
  if (!track) return 'No track. The film plays silent, on the same clock.'
  if (track.matches) return `${track.name} is the track the film was timed to.`
  return `${track.name} is not the file the film was timed to. It will play, and the picture may not sit on its beats.`
}

// The first audio file of a drop or a file choice.
export function fileOf(list: FileList | null | undefined): File | null {
  if (!list) return null
  for (const f of list) if (f.type.startsWith('audio/') || /\.(flac|wav|mp3|m4a|aac|ogg|opus|aif|aiff)$/i.test(f.name)) return f
  return list.length ? list[0] : null
}
