// The track, put into the exported file. It is read from memory, encoded here and written into the file the browser saves. It goes nowhere else.
export interface SoundKind { container: 'aac' | 'opus'; label: string; config: AudioEncoderConfig }

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
      if ((await AudioEncoder.isConfigSupported(config)).supported) return { container: k.container, label: k.label, config }
    } catch {}
  }
  return null
}

// Encodes the stretch of the track that starts at `from` seconds and lasts `seconds`, as the film's sound from its own second zero.
// A stretch that runs past the end of the track ends in silence.
export async function encodeSound(track: ArrayBuffer, kind: SoundKind, from: number, seconds: number, add: (chunk: EncodedAudioChunk, meta?: EncodedAudioChunkMetadata) => void): Promise<number> {
  const decoded = await new OfflineAudioContext(CHANNELS, 1, SOUND_RATE).decodeAudioData(track.slice(0))
  const first = Math.round(from * SOUND_RATE)
  const total = Math.round(seconds * SOUND_RATE)
  const channels: Float32Array[] = []
  for (let c = 0; c < CHANNELS; c++) channels.push(decoded.getChannelData(Math.min(c, decoded.numberOfChannels - 1)))
  let failure: unknown = null
  let chunks = 0
  const encoder = new AudioEncoder({
    output: (chunk, meta) => {
      try {
        add(chunk, meta)
        chunks++
      } catch (error) {
        failure ??= error
      }
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
        const have = Math.max(0, Math.min(frames, source.length - begin))
        if (have > 0) data.set(source.subarray(begin, begin + have), c * frames)
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
  return chunks
}
