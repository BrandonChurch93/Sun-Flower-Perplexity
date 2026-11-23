import { ArrayBufferTarget, Muxer } from 'mp4-muxer'

// The track, put into the exported file. It is read from memory, encoded here and written into the file the browser saves. It goes nowhere else.
export interface SoundKind { container: 'aac' | 'opus'; label: string; kbps: number; config: AudioEncoderConfig }

export const SOUND_RATE = 48000
const CHANNELS = 2
const BLOCK = 4800
const KINDS: { container: 'aac' | 'opus'; codec: string; label: string; bitrate: number }[] = [
  { container: 'aac', codec: 'mp4a.40.2', label: 'AAC', bitrate: 256000 },
  { container: 'opus', codec: 'opus', label: 'Opus', bitrate: 192000 },
]

export async function pickSound(): Promise<SoundKind | null> {
  if (typeof AudioEncoder === 'undefined') return null
  for (const k of KINDS) {
    const config: AudioEncoderConfig = { codec: k.codec, sampleRate: SOUND_RATE, numberOfChannels: CHANNELS, bitrate: k.bitrate }
    try {
      if ((await AudioEncoder.isConfigSupported(config)).supported) return { container: k.container, label: k.label, kbps: k.bitrate / 1000, config }
    } catch {}
  }
  return null
}

export interface SoundChunk { data: Uint8Array; key: boolean; timestamp: number; duration: number }
export interface Encoded { chunks: SoundChunk[]; meta: EncodedAudioChunkMetadata | undefined }
// Where the sound of a file sits against the track, in milliseconds. Above zero the sound is late. `match` is 1 for the same sound and near 0 for none.
export interface SoundCheck { ms: number; match: number; pass: boolean; mendedMs: number }

export const SOUND_PASS_MS = 10
const SEARCH_MS = 120
const WINDOW_SECONDS = 1
const MEND_FROM_MS = 0.5
const HEARD = 0.2

export function decodeSound(bytes: ArrayBuffer): Promise<AudioBuffer> {
  return new OfflineAudioContext(CHANNELS, 1, SOUND_RATE).decodeAudioData(bytes.slice(0))
}

// Encodes the stretch of the track that starts at sample `first` and lasts `total` samples, as the film's sound from its own second zero.
// A stretch that starts before the track or runs past its end is silent there.
export async function encodeSound(decoded: AudioBuffer, kind: SoundKind, first: number, total: number): Promise<Encoded> {
  const channels: Float32Array[] = []
  for (let c = 0; c < CHANNELS; c++) channels.push(decoded.getChannelData(Math.min(c, decoded.numberOfChannels - 1)))
  let failure: unknown = null
  const out: Encoded = { chunks: [], meta: undefined }
  const encoder = new AudioEncoder({
    output: (chunk, meta) => {
      const data = new Uint8Array(chunk.byteLength)
      chunk.copyTo(data)
      if (out.chunks.length === 0) out.meta = meta
      out.chunks.push({ data, key: chunk.type === 'key', timestamp: chunk.timestamp, duration: chunk.duration ?? 0 })
    },
    error: (error) => {
      failure ??= error
    },
  })
  try {
    encoder.configure(kind.config)
    for (let at = 0; at < total; at += BLOCK) {
      const frames = Math.min(BLOCK, total - at)
      const data = new Float32Array(frames * CHANNELS)
      for (let c = 0; c < CHANNELS; c++) {
        const source = channels[c]
        const begin = first + at
        const skip = Math.max(0, -begin)
        const have = Math.max(0, Math.min(frames, source.length - begin) - skip)
        if (have > 0) data.set(source.subarray(begin + skip, begin + skip + have), c * frames + skip)
      }
      const block = new AudioData({ format: 'f32-planar', sampleRate: SOUND_RATE, numberOfFrames: frames, numberOfChannels: CHANNELS, timestamp: Math.round((at / SOUND_RATE) * 1e6), data })
      encoder.encode(block)
      block.close()
      if (failure) throw failure
    }
    await encoder.flush()
    if (failure) throw failure
  } finally {
    if (encoder.state !== 'closed') encoder.close()
  }
  return out
}

// Writes the sound into a file from its second zero, and ends it with the picture: what starts after `seconds` is left out and the last piece is cut to fit.
export function addSound(muxer: Muxer<ArrayBufferTarget>, sound: Encoded, seconds: number): number {
  const end = Math.round(seconds * 1e6)
  const zero = sound.chunks.length ? sound.chunks[0].timestamp : 0
  let added = 0
  for (const c of sound.chunks) {
    const at = c.timestamp - zero
    if (at >= end) break
    muxer.addAudioChunkRaw(c.data, c.key ? 'key' : 'delta', at, Math.min(c.duration, end - at), added === 0 ? sound.meta : undefined)
    added++
  }
  return added
}

function soundAlone(kind: SoundKind, sound: Encoded, seconds: number): ArrayBuffer {
  const target = new ArrayBufferTarget()
  const muxer = new Muxer({ target, audio: { codec: kind.container, numberOfChannels: CHANNELS, sampleRate: SOUND_RATE }, fastStart: 'in-memory', firstTimestampBehavior: 'strict' })
  addSound(muxer, sound, seconds)
  muxer.finalize()
  return target.buffer
}

// The lag in samples at which `heard` best matches `source` from sample `first` on, looked for in the loudest second of the stretch.
// Above zero `heard` is late. `match` is 1 for the same sound and near 0 for none.
export function lagOf(source: Float32Array, heard: Float32Array, first: number, rate = SOUND_RATE): { lag: number; match: number } | null {
  const span = Math.round(WINDOW_SECONDS * rate)
  const reach = Math.round((SEARCH_MS / 1000) * rate)
  const room = Math.min(heard.length, source.length - first) - span - 2 * reach
  if (room <= 0) return null
  let from = reach
  let most = -1
  for (let at = reach; at <= reach + room; at += span >> 1) {
    let power = 0
    for (let i = 0; i < span; i += 16) power += source[first + at + i] ** 2
    if (power > most) {
      most = power
      from = at
    }
  }
  let own = 0
  for (let i = 0; i < span; i++) own += source[first + from + i] ** 2
  if (own <= 0) return null
  let best = -Infinity
  let lag = 0
  for (let l = -reach; l <= reach; l++) {
    let sum = 0
    const a = first + from
    const b = from + l
    for (let i = 0; i < span; i++) sum += source[a + i] * heard[b + i]
    if (sum > best) {
      best = sum
      lag = l
    }
  }
  let other = 0
  for (let i = 0; i < span; i++) other += heard[from + lag + i] ** 2
  return { lag, match: other > 0 ? best / Math.sqrt(own * other) : 0 }
}

export async function soundOffset(file: ArrayBuffer, track: AudioBuffer, first: number): Promise<{ ms: number; match: number } | null> {
  const found = lagOf(track.getChannelData(0), (await decodeSound(file)).getChannelData(0), first)
  return found ? { ms: (found.lag / SOUND_RATE) * 1000, match: found.match } : null
}

// Encodes the stretch, listens to where it sits, and when the encoder has moved it, encodes it again moved back by as much.
export async function makeSound(track: AudioBuffer, kind: SoundKind, from: number, seconds: number): Promise<{ sound: Encoded; mendedMs: number }> {
  const first = Math.round(from * SOUND_RATE)
  const total = Math.round(seconds * SOUND_RATE)
  const plain = await encodeSound(track, kind, first, total)
  const sits = await soundOffset(soundAlone(kind, plain, seconds), track, first).catch(() => null)
  if (!sits || sits.match < HEARD || Math.abs(sits.ms) < MEND_FROM_MS) return { sound: plain, mendedMs: 0 }
  const moved = Math.round((sits.ms / 1000) * SOUND_RATE)
  const mended = await encodeSound(track, kind, first + moved, total)
  const now = await soundOffset(soundAlone(kind, mended, seconds), track, first).catch(() => null)
  if (now && Math.abs(now.ms) < Math.abs(sits.ms)) return { sound: mended, mendedMs: sits.ms }
  return { sound: plain, mendedMs: 0 }
}

export async function checkSound(file: ArrayBuffer, track: AudioBuffer, from: number, mendedMs: number): Promise<SoundCheck | null> {
  const sits = await soundOffset(file, track, Math.round(from * SOUND_RATE)).catch(() => null)
  if (!sits || sits.match < HEARD) return null
  return { ms: sits.ms, match: sits.match, pass: Math.abs(sits.ms) <= SOUND_PASS_MS, mendedMs }
}
