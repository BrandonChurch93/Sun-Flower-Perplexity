import { createFilmClock, type FilmClock } from '../../tools/beat/sync-mark.js'
import { config } from '../config.ts'

export const LEAD_SECONDS = 2
export const TAIL_SECONDS = 2
const START_AHEAD = 0.08
// The sync mark sits this long after the start of the lead and before the end of the tail, and its flash stays this long.
export const MARK_AT_SECONDS = 1
export const MARK_HOLD_SECONDS = 0.05

export type { FilmClock }

// One second of silence as a WAV file, so that a film without a track runs on the same audio clock as one with it.
function silence(): ArrayBuffer {
  const rate = 8000
  const bytes = new ArrayBuffer(44 + rate * 2)
  const v = new DataView(bytes)
  const text = (at: number, s: string) => {
    for (let i = 0; i < s.length; i++) v.setUint8(at + i, s.charCodeAt(i))
  }
  text(0, 'RIFF')
  v.setUint32(4, 36 + rate * 2, true)
  text(8, 'WAVEfmt ')
  v.setUint32(16, 16, true)
  v.setUint16(20, 1, true)
  v.setUint16(22, 1, true)
  v.setUint32(24, rate, true)
  v.setUint32(28, rate * 2, true)
  v.setUint16(32, 2, true)
  v.setUint16(34, 16, true)
  text(36, 'data')
  v.setUint32(40, rate * 2, true)
  return bytes
}

export interface ClockOptions { avMs: number; marks: boolean }

// The film's clock: the audio clock of the page, with the track on it when one was picked.
// Without `marks` the blip of the sync mark is set to 0 Hz, which is silence: the lead and the tail stay dark and quiet.
export function makeClock(track: ArrayBuffer | null, options: ClockOptions): Promise<FilmClock> {
  return createFilmClock({
    arrayBuffer: track ? track.slice(0) : silence(),
    duration: config.film.durationSeconds,
    lead: LEAD_SECONDS,
    tail: TAIL_SECONDS,
    markAt: MARK_AT_SECONDS,
    markHoldMs: MARK_HOLD_SECONDS * 1000,
    avMs: options.avMs,
    blipHz: options.marks ? 1000 : 0,
  })
}

// Whether the white flash of a sync mark is on at this second of the film's clock. The same moments the blips of the clock sound at.
export function markAt(seconds: number): boolean {
  const head = -LEAD_SECONDS + MARK_AT_SECONDS
  const tail = config.film.durationSeconds + TAIL_SECONDS - MARK_AT_SECONDS
  return (seconds >= head && seconds < head + MARK_HOLD_SECONDS) || (seconds >= tail && seconds < tail + MARK_HOLD_SECONDS)
}

export interface Run {
  time(): number
  stop(): void
}

// Plays from any film second on the same audio clock, with the track when there is one and `sound` is on. For looking, not for recording.
export async function runFrom(clock: FilmClock, seconds: number, sound: boolean, avMs: number): Promise<Run> {
  const { ctx, buffer } = clock
  await ctx.resume()
  const at = ctx.currentTime + START_AHEAD
  const zero = at - seconds
  let source: AudioBufferSourceNode | null = null
  if (sound && seconds < buffer.duration) {
    source = ctx.createBufferSource()
    source.buffer = buffer
    source.connect(ctx.destination)
    source.start(at, Math.max(0, seconds))
  }
  return {
    time: () => ctx.currentTime - zero + avMs / 1000,
    stop() {
      try {
        source?.stop()
      } catch {}
      source = null
    },
  }
}

const WINDOW = 64
const KEEP_SECONDS = 2
const FIRST_CAP = 0.03

// The audio clock moves in steps of one audio buffer, 23 ms with the playback hint, and a film frame lasts 33 ms.
// Read raw at each animation frame it would show the film in an uneven cadence. This follows the audio clock and moves between its steps on the page's clock:
// every reading bounds the true time from below, the tightest bound of the last readings is the time, and it never leaves the step the audio clock is in.
export class Steady {
  private readonly bound = new Float64Array(WINDOW)
  private readonly when = new Float64Array(WINDOW)
  private count = 0
  private last = NaN
  // The smallest step of the audio clock seen so far, in seconds. 0 until two readings differ.
  step = 0

  reset(): void {
    this.count = 0
    this.last = NaN
    this.step = 0
  }

  read(raw: number, pageMs: number): number {
    const p = pageMs / 1000
    if (raw !== this.last) {
      const d = raw - this.last
      if (d > 0 && (this.step === 0 || d < this.step)) this.step = d
      if (d < 0) this.count = 0
      this.last = raw
    }
    const i = this.count % WINDOW
    this.bound[i] = raw - p
    this.when[i] = p
    this.count++
    let offset = -Infinity
    for (let k = 0; k < Math.min(this.count, WINDOW); k++) if (p - this.when[k] <= KEEP_SECONDS && this.bound[k] > offset) offset = this.bound[k]
    return Math.min(p + offset, raw + (this.step || FIRST_CAP))
  }
}
