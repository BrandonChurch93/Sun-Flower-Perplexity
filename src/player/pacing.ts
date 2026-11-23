import { config } from '../config.ts'
import type { Made } from '../v2/counter.ts'

export const GAP_MS = 50

export type RunKind = 'recording' | 'check' | 'play'

export interface Shown {
  frame: number
  // The film second of the frame on screen, the second of the run's clock it was due at, the audio clock when it was chosen and when it was drawn,
  // the time since the frame before it and the time it took to draw. In a recording `film` and `due` are the same second.
  film: number
  due: number
  audio: number
  audioDrawn: number
  gapMs: number
  drawMs: number
  // The page's clock at the animation frame that chose it, in milliseconds. Only for measuring: no pixel depends on it.
  atMs: number
  // What drawing this frame asked of the graphics card: things made (must be 0), and writes into storage that exists, with their megabytes.
  made: number
  writes: number
  writeMb: number
}

// What one frame asked of the graphics card.
export interface Asked { made: number; writes: number; writeBytes: number }

export function asked(m: Made): Asked {
  return { made: m.programs + m.shaders + m.textures + m.buffers + m.framebuffers + m.renderbuffers + m.uploads, writes: m.updates, writeBytes: m.updateBytes }
}

export interface Gap { frame: number; film: number; gapMs: number; skipped: number }

export interface RunFacts {
  kind: RunKind
  quality: string
  format: string
  tier: string
  track: { name: string; sha256: string; matches: boolean } | null
  avMs: number
  marks: boolean
  audio: { sampleRate: number; baseLatencyMs: number; outputLatencyMs: number; stepMs: number }
  screen: { width: number; height: number; pixelRatio: number; fullScreen: boolean; pictureWidth: number; pictureHeight: number }
  browser: string
}

export interface Report extends RunFacts {
  at: string
  complete: boolean
  stoppedAtFilm: number | null
  frames: { due: number; drawn: number; skipped: number }
  seconds: { film: number; audio: number }
  gapMs: { mean: number; p50: number; p99: number; longest: number; longestAtFilm: number }
  drawMs: { mean: number; p99: number; longest: number }
  // The audio clock minus the film second on screen, when each frame was drawn. Above one frame the picture is late.
  // `pickedMs`: the audio clock minus the frame's own second when the frame was chosen. `behindMs`: the same when it had been drawn.
  pickedMs: { mean: number; largest: number }
  behindMs: { mean: number; largest: number; largestAtFilm: number; first: number; last: number }
  gaps: Gap[]
  made: Made | null
  // Writes into existing storage for one frame, and the film seconds of the frames that made something new.
  writes: { mean: number; largest: number; mbMean: number; mbLargest: number }
  madeAtFilm: number[]
  holds: boolean
  verdict: string
  shown: Shown[]
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0
  return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))]
}

function mean(values: number[]): number {
  let sum = 0
  for (const v of values) sum += v
  return values.length ? sum / values.length : 0
}

const round = (v: number, digits = 2): number => Number(v.toFixed(digits))

export class Pacing {
  readonly shown: Shown[] = []
  private lastAt = NaN
  private lastPosition = -1
  private readonly gaps: Gap[] = []

  // `position` counts the frames of the run in the order they are due, so the frames between two that were shown are the ones skipped.
  // `atMs` is the page's clock at the animation frame that showed it, used only to measure the gaps.
  present(frame: number, position: number, due: number, audio: number, audioDrawn: number, atMs: number, drawMs: number, card: Asked = { made: 0, writes: 0, writeBytes: 0 }): void {
    const first = this.shown.length === 0
    const gapMs = first ? 0 : atMs - this.lastAt
    const skipped = first ? position : Math.max(0, position - this.lastPosition - 1)
    if (!first && gapMs > GAP_MS) this.gaps.push({ frame, film: frame / config.film.fps, gapMs: round(gapMs), skipped })
    this.shown.push({ frame, film: round(frame / config.film.fps, 4), due: round(due, 4), audio: round(audio, 4), audioDrawn: round(audioDrawn, 4), gapMs: round(gapMs), drawMs: round(drawMs), atMs: round(atMs, 1), made: card.made, writes: card.writes, writeMb: round(card.writeBytes / 1048576) })
    this.lastAt = atMs
    this.lastPosition = position
  }

  // `planned` is the number of frames the whole run would show. A run that was stopped is measured up to the frame it stopped on.
  report(facts: RunFacts, planned: number, complete: boolean, made: Made | null): Report {
    const due = complete ? planned : this.lastPosition + 1
    const shown = this.shown
    const gaps = shown.slice(1).map((s) => s.gapMs).sort((a, b) => a - b)
    const draws = shown.map((s) => s.drawMs).sort((a, b) => a - b)
    const behind = shown.map((s) => (s.audioDrawn - s.due) * 1000)
    const picked = shown.map((s) => (s.audio - s.due) * 1000)
    let longest = 0
    let longestAt = 0
    let largest = 0
    let largestAt = 0
    for (let i = 0; i < shown.length; i++) {
      if (i > 0 && shown[i].gapMs > longest) {
        longest = shown[i].gapMs
        longestAt = shown[i].film
      }
      if (behind[i] > largest) {
        largest = behind[i]
        largestAt = shown[i].film
      }
    }
    const drawn = shown.length
    const skipped = Math.max(0, due - drawn)
    const madeSomething = made !== null && made.programs + made.shaders + made.textures + made.buffers + made.framebuffers + made.renderbuffers + made.uploads > 0
    const holds = complete && drawn > 0 && skipped === 0 && longest <= GAP_MS && !madeSomething
    const nearly = complete && drawn > 0 && skipped <= Math.ceil(due * 0.002) && longest <= 2 * GAP_MS
    const film = drawn ? shown[drawn - 1].due - shown[0].due : 0
    let verdict: string
    if (drawn === 0) verdict = 'No frame was drawn.'
    else if (!complete) verdict = `Stopped at ${shown[drawn - 1].film.toFixed(2)} s. Until then ${drawn} of ${due} frames were drawn${skipped ? ` and ${skipped} skipped` : ''}.`
    else if (holds) verdict = `Clean. Every one of the ${due} frames was drawn, and the longest gap between two frames was ${longest.toFixed(1)} ms.`
    else if (skipped === 0) verdict = `Every frame was drawn, with ${this.gaps.length} ${this.gaps.length === 1 ? 'gap' : 'gaps'} over ${GAP_MS} ms. The longest was ${longest.toFixed(0)} ms at ${longestAt.toFixed(2)} s.`
    else if (nearly) verdict = `${skipped} of ${due} frames were skipped. The longest gap was ${longest.toFixed(0)} ms at ${longestAt.toFixed(2)} s. The picture stayed with the sound.`
    else verdict = `This machine did not hold ${config.film.fps} frames a second: ${drawn} of ${due} frames were drawn and ${skipped} skipped. Every frame was chosen from the audio clock, so no time was lost.`
    if (madeSomething) verdict += ' The graphics card was asked to make something during the run, which is a defect of the film.'
    return {
      ...facts,
      at: new Date().toISOString(),
      complete,
      stoppedAtFilm: complete || drawn === 0 ? null : shown[drawn - 1].film,
      frames: { due, drawn, skipped },
      seconds: { film: round(film, 3), audio: round(drawn ? shown[drawn - 1].audio - shown[0].audio : 0, 3) },
      gapMs: { mean: round(mean(gaps)), p50: round(percentile(gaps, 0.5)), p99: round(percentile(gaps, 0.99)), longest: round(longest), longestAtFilm: round(longestAt, 3) },
      drawMs: { mean: round(mean(draws)), p99: round(percentile(draws, 0.99)), longest: round(draws.length ? draws[draws.length - 1] : 0) },
      pickedMs: { mean: round(mean(picked)), largest: round(picked.reduce((a, b) => Math.max(a, Math.abs(b)), 0)) },
      behindMs: { mean: round(mean(behind)), largest: round(largest), largestAtFilm: round(largestAt, 3), first: round(behind[0] ?? 0), last: round(behind[behind.length - 1] ?? 0) },
      gaps: this.gaps,
      made,
      writes: {
        mean: round(mean(shown.map((s) => s.writes)), 1),
        largest: shown.reduce((a, s) => Math.max(a, s.writes), 0),
        mbMean: round(mean(shown.map((s) => s.writeMb))),
        mbLargest: shown.reduce((a, s) => Math.max(a, s.writeMb), 0),
      },
      madeAtFilm: shown.filter((s) => s.made > 0).map((s) => s.film),
      holds,
      verdict,
      shown,
    }
  }
}

// The report as a file: the summary, every gap, and one line for each frame that was shown.
export function reportFile(report: Report): Blob {
  return new Blob([JSON.stringify(report, null, 1)], { type: 'application/json' })
}

export function reportName(report: Report): string {
  return `${config.slug}-${report.kind}-${report.at.replace(/[:.]/g, '-')}.json`
}
