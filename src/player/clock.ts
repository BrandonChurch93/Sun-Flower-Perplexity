import { createFilmClock, type FilmClock } from '../../tools/beat/sync-mark.js'
import { config } from '../config.ts'

export const LEAD_SECONDS = 2
export const TAIL_SECONDS = 2
// The browser shows its own notice for a few seconds after it goes full screen. The screen stays dark until it is gone.
export const SETTLE_SECONDS = 4
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

// The sound ends with the film: the track fades out over the last part of the dark tail and stops.
export const FADE_SECONDS = 0.5
const CUT_SECONDS = 0.03
const BLIP_HZ = 1000

export const markSeconds = (): [number, number] => [-LEAD_SECONDS + MARK_AT_SECONDS, config.film.durationSeconds + TAIL_SECONDS - MARK_AT_SECONDS]

interface Voice { stop(): void }

// The track from `offset` seconds in, starting at `at` on the audio clock, with the film's zero at `zero`. It is silent from the end of the tail on, whatever the file holds after it.
function voice(ctx: AudioContext, buffer: AudioBuffer, at: number, offset: number, zero: number): Voice {
  const end = zero + config.film.durationSeconds + TAIL_SECONDS
  const source = ctx.createBufferSource()
  const gain = ctx.createGain()
  source.buffer = buffer
  source.connect(gain).connect(ctx.destination)
  gain.gain.setValueAtTime(1, Math.max(at, end - FADE_SECONDS))
  gain.gain.linearRampToValueAtTime(0, end)
  source.start(at, Math.max(0, offset))
  source.stop(end)
  let live = true
  return {
    stop() {
      if (!live) return
      live = false
      const now = ctx.currentTime
      try {
        gain.gain.cancelScheduledValues(now)
        gain.gain.setTargetAtTime(0, now, CUT_SECONDS / 3)
        source.stop(now + CUT_SECONDS)
      } catch {}
    },
  }
}

function blip(ctx: AudioContext, when: number): void {
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.frequency.value = BLIP_HZ
  gain.gain.setValueAtTime(0, when)
  gain.gain.linearRampToValueAtTime(0.6, when + 0.001)
  gain.gain.exponentialRampToValueAtTime(0.0006, when + 0.04)
  osc.connect(gain).connect(ctx.destination)
  osc.start(when)
  osc.stop(when + 0.05)
}

// The film's clock: the audio clock of the page, kept by `sync-mark.js`, with the track on it when one was picked.
// The clock itself runs on silence. The track goes through a fader of its own so that it ends with the film, and the blips sound only with `marks`.
export async function makeClock(track: ArrayBuffer | null, options: ClockOptions): Promise<FilmClock> {
  const inner = await createFilmClock({
    arrayBuffer: silence(),
    duration: config.film.durationSeconds,
    lead: LEAD_SECONDS,
    tail: TAIL_SECONDS,
    markAt: MARK_AT_SECONDS,
    markHoldMs: MARK_HOLD_SECONDS * 1000,
    avMs: options.avMs,
    blips: false,
  })
  const { ctx } = inner
  let sound: AudioBuffer | null = null
  if (track) {
    try {
      sound = await ctx.decodeAudioData(track.slice(0))
    } catch (error) {
      await ctx.close().catch(() => undefined)
      throw error
    }
  }
  let playing: Voice | null = null
  return {
    ...inner,
    buffer: sound ?? inner.buffer,
    async start() {
      playing?.stop()
      playing = null
      await inner.start()
      let now = ctx.currentTime
      let zero = now - inner.time() + options.avMs / 1000
      while (ctx.currentTime !== now) {
        now = ctx.currentTime
        zero = now - inner.time() + options.avMs / 1000
      }
      if (sound) playing = voice(ctx, sound, zero, 0, zero)
      if (options.marks) for (const m of markSeconds()) blip(ctx, zero + m)
    },
    stop() {
      inner.stop()
      playing?.stop()
      playing = null
    },
  }
}

// Whether the white flash of a sync mark is on at this second of the film's clock. The same moments the blips of the clock sound at.
export function markAt(seconds: number): boolean {
  const [head, tail] = markSeconds()
  return (seconds >= head && seconds < head + MARK_HOLD_SECONDS) || (seconds >= tail && seconds < tail + MARK_HOLD_SECONDS)
}

export interface Run {
  time(): number
  stop(): void
}

// Plays from any film second on the same audio clock, with the track when there is one and `sound` is on. For looking, not for recording.
export async function runFrom(clock: FilmClock, seconds: number, sound: boolean, avMs: number): Promise<Run> {
  const { ctx } = clock
  await ctx.resume()
  const at = ctx.currentTime + START_AHEAD
  const zero = at - seconds
  const playing = sound && seconds < Math.min(clock.buffer.duration, config.film.durationSeconds) ? voice(ctx, clock.buffer, at, seconds, zero) : null
  return {
    time: () => ctx.currentTime - zero + avMs / 1000,
    stop: () => playing?.stop(),
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
  private told = -Infinity
  // The smallest step of the audio clock seen so far, in seconds. 0 until two readings differ.
  step = 0

  reset(): void {
    this.count = 0
    this.last = NaN
    this.told = -Infinity
    this.step = 0
  }

  read(raw: number, pageMs: number): number {
    const p = pageMs / 1000
    if (raw !== this.last) {
      const d = raw - this.last
      if (d > 0 && (this.step === 0 || d < this.step)) this.step = d
      if (d < 0) {
        this.count = 0
        this.told = -Infinity
      }
      this.last = raw
    }
    const i = this.count % WINDOW
    this.bound[i] = raw - p
    this.when[i] = p
    this.count++
    let offset = -Infinity
    for (let k = 0; k < Math.min(this.count, WINDOW); k++) if (p - this.when[k] <= KEEP_SECONDS && this.bound[k] > offset) offset = this.bound[k]
    // It never goes back while the audio clock goes on, so no frame is ever shown after a later one.
    this.told = Math.max(this.told, Math.min(p + offset, raw + (this.step || FIRST_CAP)))
    return this.told
  }
}
