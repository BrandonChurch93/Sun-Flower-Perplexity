import { config } from '../config.ts'
import type { Made } from '../v2/counter.ts'

export const GAP_MS = 50

export type RunKind = 'recording' | 'check' | 'play' | 'measure' | 'timing'

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
  // `drawMs` in its two parts: what the page itself worked on the processor, and the wait for the graphics card to finish the picture.
  scriptMs: number
  cardMs: number
  // On screen only after the film clock had left the frame.
  late: boolean
  // The page's clock at the animation frame that chose it, in milliseconds. Only for measuring: no pixel depends on it.
  atMs: number
  // What drawing this frame asked of the graphics card: things made (must be 0), and writes into storage that exists, with their megabytes.
  made: number
  writes: number
  writeMb: number
}

// What one frame asked of the graphics card.
export interface Asked { made: number; writes: number; writeBytes: number }

// The film's own table of one frame: milliseconds by part, `script` their sum, `wait` the graphics card.
export type Cost = Record<string, number>

const FRAME_MS = 1000 / config.film.fps

export function asked(m: Made): Asked {
  return { made: m.programs + m.shaders + m.textures + m.buffers + m.framebuffers + m.renderbuffers + m.vertexArrays + m.uploads, writes: m.updates, writeBytes: m.updateBytes }
}

// One second of film as it went in the run: the frames due in it, those shown and skipped, and what a shown frame cost. `parts` are its dearest owners, mean ms.
export interface Stretch { from: number; to: number; due: number; shown: number; skipped: number; longestGapMs: number; drawMs: number; scriptMs: number; worstScriptMs: number; worstScriptAtFrame: number; writeMb: number; parts: [string, number][] }

export const STRETCH_FRAMES = config.film.fps
const WORST_STRETCHES = 3
const SHOWN_RUNS = 30

// `atEnd` marks the time the last frame drawn stood in place of the frames that were due after it.
export interface Gap { frame: number; film: number; gapMs: number; skipped: number; atEnd?: boolean }

export interface Slow { frames: number; longest: { from: number; to: number; shown: number } | null }

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
  frames: { due: number; drawn: number; skipped: number; late: number }
  seconds: { film: number; audio: number }
  gapMs: { mean: number; p50: number; p99: number; longest: number; longestAtFilm: number }
  drawMs: { mean: number; p99: number; longest: number; longestAtFrame: number }
  // Of that, the page's own work on the processor, and the wait for the graphics card.
  scriptMs: { mean: number; p99: number; longest: number; longestAtFilm: number; longestAtFrame: number }
  cardMs: { mean: number; p99: number; longest: number }
  // The script time by part of the film, mean of the frames shown, and each part's dearest frame.
  partsMs: Cost
  partsWorst: Record<string, { ms: number; frame: number }>
  // The frames that were due and never shown, as runs of film frames, and the three seconds of film that went worst.
  skippedRuns: { from: number; to: number }[]
  stretches: Stretch[]
  // The frames shown that took longer than one frame of time, and the longest row of them: `to` is the last frame that row stood in for.
  slow: Slow
  // The audio clock minus the film second on screen, when each frame was drawn. Above one frame the picture is late.
  // `pickedMs`: the audio clock minus the frame's own second when the frame was chosen. `behindMs`: the same when it had been drawn.
  pickedMs: { mean: number; largest: number }
  behindMs: { mean: number; largest: number; largestAtFilm: number; first: number; last: number }
  gaps: Gap[]
  made: Made | null
  // Writes into existing storage for one frame, and the film seconds of the frames that made something new.
  writes: { mean: number; largest: number; mbMean: number; mbLargest: number; mbLargestAtFrame: number; mbTotal: number }
  madeAtFilm: number[]
  holds: boolean
  // A few frames skipped at most and no long gap: the eye does not see it.
  nearly: boolean
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
  private readonly parts: Cost = {}
  private readonly worst: Record<string, { ms: number; frame: number }> = {}
  private readonly costs: Cost[] = []
  private readonly runs: { from: number; to: number }[] = []
  private readonly before: number[] = []

  // `position` counts the frames of the run in the order they are due, so the frames between two that were shown are the ones skipped.
  // `atMs` is the page's clock at the animation frame that showed it, used only to measure the gaps.
  present(frame: number, position: number, due: number, audio: number, audioDrawn: number, atMs: number, drawMs: number, card: Asked = { made: 0, writes: 0, writeBytes: 0 }, cost: Cost = {}): void {
    const first = this.shown.length === 0
    const gapMs = first ? 0 : atMs - this.lastAt
    const skipped = first ? position : Math.max(0, position - this.lastPosition - 1)
    if (!first && gapMs > GAP_MS) this.gaps.push({ frame, film: frame / config.film.fps, gapMs: round(gapMs), skipped })
    this.shown.push({ frame, film: round(frame / config.film.fps, 4), due: round(due, 4), audio: round(audio, 4), audioDrawn: round(audioDrawn, 4), gapMs: round(gapMs), drawMs: round(drawMs), scriptMs: round(cost.script ?? 0), cardMs: round(cost.wait ?? 0), late: (audioDrawn - due) * 1000 > FRAME_MS, atMs: round(atMs, 1), made: card.made, writes: card.writes, writeMb: round(card.writeBytes / 1048576) })
    if (skipped > 0) this.runs.push({ from: frame - skipped, to: frame - 1 })
    this.before.push(first ? 0 : skipped)
    const kept: Cost = {}
    for (const key of Object.keys(cost)) {
      if (key === 'script' || key === 'wait') continue
      kept[key] = cost[key]
      this.parts[key] = (this.parts[key] ?? 0) + cost[key]
      const w = this.worst[key]
      if (!w) this.worst[key] = { ms: round(cost[key]), frame }
      else if (cost[key] > w.ms) {
        w.ms = round(cost[key])
        w.frame = frame
      }
    }
    this.costs.push(kept)
    this.lastAt = atMs
    this.lastPosition = position
  }

  private stretches(runs: { from: number; to: number }[]): Stretch[] {
    return worstStretches(this.shown, this.costs, runs)
  }

  // `planned` is the number of frames the whole run would show. A run that was stopped is measured up to the frame it stopped on.
  report(facts: RunFacts, planned: number, complete: boolean, made: Made | null): Report {
    const due = complete ? planned : this.lastPosition + 1
    const shown = this.shown
    const gaps = shown.slice(1).map((s) => s.gapMs).sort((a, b) => a - b)
    const draws = shown.map((s) => s.drawMs).sort((a, b) => a - b)
    const scripts = shown.map((s) => s.scriptMs).sort((a, b) => a - b)
    const cards = shown.map((s) => s.cardMs).sort((a, b) => a - b)
    const dearest = shown.reduce((a, s) => (s.scriptMs > a.scriptMs ? s : a), shown[0] ?? { scriptMs: 0, film: 0, frame: -1 })
    const slowest = shown.reduce((a, s) => (s.drawMs > a.drawMs ? s : a), shown[0] ?? { drawMs: 0, frame: -1 })
    const heaviest = shown.reduce((a, s) => (s.writeMb > a.writeMb ? s : a), shown[0] ?? { writeMb: 0, frame: -1 })
    const partsMs: Cost = {}
    for (const key of Object.keys(this.parts)) partsMs[key] = round(this.parts[key] / Math.max(1, shown.length))
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
    const after = complete && drawn > 0 ? planned - 1 - this.lastPosition : 0
    const closing = ((after + 1) * 1000) / config.film.fps
    const all = after > 0 ? [...this.gaps, { frame: shown[drawn - 1].frame, film: shown[drawn - 1].film, gapMs: round(closing), skipped: after, atEnd: true }] : this.gaps
    const skippedRuns = after > 0 ? [...this.runs, { from: shown[drawn - 1].frame + 1, to: shown[drawn - 1].frame + after }] : this.runs
    if (after > 0) {
      gaps.push(closing)
      gaps.sort((a, b) => a - b)
      if (closing > longest) {
        longest = closing
        longestAt = shown[drawn - 1].film
      }
    }
    const madeSomething = made !== null && made.programs + made.shaders + made.textures + made.buffers + made.framebuffers + made.renderbuffers + made.vertexArrays + made.uploads > 0
    const holds = complete && drawn > 0 && skipped === 0 && longest <= GAP_MS && !madeSomething
    const nearly = complete && drawn > 0 && skipped <= Math.ceil(due * 0.002) && longest <= 2 * GAP_MS
    const film = drawn ? shown[drawn - 1].due - shown[0].due : 0
    const rate = `${config.film.fps} frames a second`
    const were = (n: number): string => (n === 1 ? 'was' : 'were')
    let verdict: string
    if (drawn === 0) verdict = 'No frame was drawn, so this run says nothing about the machine.'
    else if (!complete && skipped === 0 && longest <= GAP_MS) verdict = `This machine held ${rate} until the run was stopped at ${shown[drawn - 1].film.toFixed(2)} s: every one of the ${due} frames until then was drawn.`
    else if (!complete) verdict = `This machine did not hold ${rate} until the run was stopped at ${shown[drawn - 1].film.toFixed(2)} s: ${drawn} of ${due} frames ${were(drawn)} drawn and ${skipped} skipped, and the longest gap was ${longest.toFixed(0)} ms.`
    else if (complete && skipped === 0 && longest <= GAP_MS) verdict = `This machine held ${rate}: every one of the ${due} frames was drawn, and the longest gap between two frames was ${longest.toFixed(1)} ms.`
    else if (skipped === 0) verdict = `This machine nearly held ${rate}: every frame was drawn, but ${all.length} ${all.length === 1 ? 'gap was' : 'gaps were'} longer than ${GAP_MS} ms, the longest ${longest.toFixed(0)} ms at ${longestAt.toFixed(2)} s.`
    else if (nearly) verdict = `This machine nearly held ${rate}: ${skipped} of ${due} frames ${were(skipped)} skipped, and the longest gap was ${longest.toFixed(0)} ms at ${longestAt.toFixed(2)} s. The picture stayed with the sound.`
    else verdict = `This machine did not hold ${rate}: ${drawn} of ${due} frames ${were(drawn)} drawn and ${skipped} skipped. Every frame was chosen from the audio clock, so no time was lost.`
    if (madeSomething) verdict += ' The graphics card was asked to make something during the run, which is a defect of the film.'
    return {
      ...facts,
      at: new Date().toISOString(),
      complete,
      stoppedAtFilm: complete || drawn === 0 ? null : shown[drawn - 1].film,
      frames: { due, drawn, skipped, late: shown.filter((s) => s.late).length },
      seconds: { film: round(film, 3), audio: round(drawn ? shown[drawn - 1].audio - shown[0].audio : 0, 3) },
      gapMs: { mean: round(mean(gaps)), p50: round(percentile(gaps, 0.5)), p99: round(percentile(gaps, 0.99)), longest: round(longest), longestAtFilm: round(longestAt, 3) },
      drawMs: { mean: round(mean(draws)), p99: round(percentile(draws, 0.99)), longest: round(draws.length ? draws[draws.length - 1] : 0), longestAtFrame: slowest.frame },
      scriptMs: { mean: round(mean(scripts)), p99: round(percentile(scripts, 0.99)), longest: round(scripts.length ? scripts[scripts.length - 1] : 0), longestAtFilm: dearest.film, longestAtFrame: dearest.frame },
      cardMs: { mean: round(mean(cards)), p99: round(percentile(cards, 0.99)), longest: round(cards.length ? cards[cards.length - 1] : 0) },
      partsMs,
      partsWorst: { ...this.worst },
      skippedRuns,
      stretches: this.stretches(skippedRuns),
      slow: slowFrames(shown, this.before, after),
      pickedMs: { mean: round(mean(picked)), largest: round(picked.reduce((a, b) => Math.max(a, Math.abs(b)), 0)) },
      behindMs: { mean: round(mean(behind)), largest: round(largest), largestAtFilm: round(largestAt, 3), first: round(behind[0] ?? 0), last: round(behind[behind.length - 1] ?? 0) },
      gaps: all,
      made,
      writes: {
        mean: round(mean(shown.map((s) => s.writes)), 1),
        largest: shown.reduce((a, s) => Math.max(a, s.writes), 0),
        mbMean: round(mean(shown.map((s) => s.writeMb))),
        mbLargest: heaviest.writeMb,
        mbLargestAtFrame: heaviest.frame,
        mbTotal: round(shown.reduce((a, s) => a + s.writeMb, 0)),
      },
      madeAtFilm: shown.filter((s) => s.made > 0).map((s) => s.film),
      holds,
      nearly: holds || nearly,
      verdict,
      shown,
    }
  }
}

// `before[i]` is the number of frames skipped just before the i-th frame shown, `after` the number skipped after the last one.
export function slowFrames(shown: { frame: number; drawMs: number }[], before: number[], after: number): Slow {
  let frames = 0
  let longest: Slow['longest'] = null
  let run: { from: number; to: number; shown: number } | null = null
  const close = (): void => {
    if (run && (!longest || run.to - run.from > longest.to - longest.from)) longest = run
    run = null
  }
  for (let i = 0; i < shown.length; i++) {
    if (shown[i].drawMs <= FRAME_MS) {
      close()
      continue
    }
    frames++
    const stoodFor = i + 1 < shown.length ? before[i + 1] ?? 0 : after
    if (run) {
      run.to = shown[i].frame + stoodFor
      run.shown++
    } else run = { from: shown[i].frame, to: shown[i].frame + stoodFor, shown: 1 }
  }
  close()
  return { frames, longest }
}

// One plain line: how many frames took longer than one frame of time, and the longest row of them.
export function slowLine(report: Report): string {
  const one = `one frame of time (${FRAME_MS.toFixed(1)} ms)`
  const f = report.frames
  if (f.drawn === 0) return 'slow frames: nothing measured'
  if (report.slow.frames === 0 || !report.slow.longest) return `slow frames: none, each of the ${f.drawn} frames shown took less than ${one}`
  const w = report.slow.longest
  const span = w.to - w.from + 1
  const row = w.shown === 1 ? `one frame, ${w.from}, which stood for ${span === 1 ? 'itself only' : `frames ${w.from} to ${w.to}`}` : `${w.shown} in a row, frames ${w.from} to ${w.to}`
  return `slow frames: ${report.slow.frames} of the ${f.drawn} shown took longer than ${one}; the longest run of them was ${row}, ${(span / config.film.fps).toFixed(1)} s of film`
}

// The seconds of film that went worst: most frames skipped, then the longest gap, then the dearest to draw.
function worstStretches(shown: Shown[], costs: Cost[], runs: { from: number; to: number }[]): Stretch[] {
  interface Sum extends Stretch { draw: number; script: number; write: number; cost: Cost }
  const byWindow = new Map<number, Sum>()
  const at = (frame: number): Sum => {
    const key = Math.floor(frame / STRETCH_FRAMES)
    let w = byWindow.get(key)
    if (!w) byWindow.set(key, (w = { from: key * STRETCH_FRAMES, to: key * STRETCH_FRAMES + STRETCH_FRAMES - 1, due: 0, shown: 0, skipped: 0, longestGapMs: 0, drawMs: 0, scriptMs: 0, worstScriptMs: 0, worstScriptAtFrame: -1, writeMb: 0, parts: [], draw: 0, script: 0, write: 0, cost: {} }))
    return w
  }
  shown.forEach((s, i) => {
    const w = at(s.frame)
    w.shown++
    w.draw += s.drawMs
    w.script += s.scriptMs
    w.write += s.writeMb
    if (i > 0 && s.gapMs > w.longestGapMs) w.longestGapMs = s.gapMs
    if (s.scriptMs > w.worstScriptMs) {
      w.worstScriptMs = s.scriptMs
      w.worstScriptAtFrame = s.frame
    }
    const cost = costs[i] ?? {}
    for (const key of Object.keys(cost)) w.cost[key] = (w.cost[key] ?? 0) + cost[key]
  })
  for (const run of runs) for (let f = run.from; f <= run.to; f++) at(f).skipped++
  const list = [...byWindow.values()].filter((w) => w.shown > 0 || w.skipped > 0)
  list.sort((a, b) => b.skipped - a.skipped || b.longestGapMs - a.longestGapMs || b.draw / Math.max(1, b.shown) - a.draw / Math.max(1, a.shown))
  return list.slice(0, WORST_STRETCHES).map((w) => {
    const n = Math.max(1, w.shown)
    const parts = Object.entries(w.cost)
      .map(([name, v]): [string, number] => [name, round(v / n)])
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
    return { from: w.from, to: w.to, due: w.shown + w.skipped, shown: w.shown, skipped: w.skipped, longestGapMs: round(w.longestGapMs), drawMs: round(w.draw / n), scriptMs: round(w.script / n), worstScriptMs: w.worstScriptMs, worstScriptAtFrame: w.worstScriptAtFrame, writeMb: round(w.write / n), parts }
  })
}

// The report as a few lines of plain text, to paste into a message.
export function reportText(report: Report, machine: string[] = []): string {
  const f = report.frames
  const things = report.made ? asked(report.made).made : null
  const owners = Object.entries(report.partsMs)
    .filter(([name, v]) => name !== 'script' && name !== 'wait' && typeof v === 'number' && (v >= 0.05 || (report.partsWorst[name]?.ms ?? 0) >= 1))
    .sort((a, b) => b[1] - a[1])
    .map(([name, v]) => `  ${name.padEnd(10)} mean ${v.toFixed(1).padStart(6)}   worst ${(report.partsWorst[name]?.ms ?? 0).toFixed(1).padStart(7)} at frame ${report.partsWorst[name]?.frame ?? -1}`)
  const faults: string[] = []
  if (f.skipped > 0) faults.push(`${f.skipped} ${f.skipped === 1 ? 'frame' : 'frames'} skipped`)
  if (f.late > 0) faults.push(`${f.late} shown late`)
  if (f.skipped > 0 || f.late > 0 || report.gaps.length > 0) faults.push(`longest gap ${(report.gapMs.longest / 1000).toFixed(2)} s at ${report.gapMs.longestAtFilm.toFixed(1)} s`)
  if (things !== null && things > 0) faults.push(`${things} ${things === 1 ? 'thing' : 'things'} made on the graphics card`)
  const stopped = report.complete ? '' : `, stopped at ${(report.stoppedAtFilm ?? 0).toFixed(1)} s`
  const first = f.drawn === 0 ? 'Nothing measured: no frame was shown' : faults.length === 0 ? `Smooth: ${f.drawn} of ${f.due} frames shown, none late${stopped}` : `Not smooth: ${faults.join(', ')}${stopped}`
  const rate = `${config.film.fps} frames a second`
  const held = f.drawn === 0 ? `${rate}: nothing measured` : report.holds ? `${rate} held: YES` : `${rate} held: NO`
  const runs = report.skippedRuns
  const named = runs.slice(0, SHOWN_RUNS).map((r) => (r.from === r.to ? `${r.from}` : `${r.from} to ${r.to}`))
  const stretches = report.stretches.map((w) => w.shown === 0 ? `  frames ${w.from} to ${w.to}: none of ${w.due} shown, ${w.skipped} skipped` : `  frames ${w.from} to ${w.to}: ${w.shown} of ${w.due} shown, ${w.skipped} skipped, longest gap ${w.longestGapMs.toFixed(0)} ms, frame time mean ${w.drawMs.toFixed(1)} ms, script mean ${w.scriptMs.toFixed(1)} ms and worst ${w.worstScriptMs.toFixed(1)} ms at frame ${w.worstScriptAtFrame}, ${w.writeMb.toFixed(2)} MB written a frame${w.parts.length ? ` (${w.parts.map(([name, v]) => `${name} ${v.toFixed(1)}`).join(', ')})` : ''}`)
  return [
    first,
    `${config.name}, pacing report, ${report.at}`,
    held,
    slowLine(report),
    report.verdict,
    `run: ${report.kind}, ${report.format}, ${report.quality} quality, ${report.track ? report.track.name : 'no track'}, ${report.complete ? 'to the end' : `stopped at ${(report.stoppedAtFilm ?? 0).toFixed(2)} s`}`,
    ...machine,
    `frames: ${f.due} due, ${f.drawn} shown, ${f.skipped} skipped, ${f.late} shown late`,
    `time: ${report.seconds.film.toFixed(3)} s of film in ${report.seconds.audio.toFixed(3)} s of the audio clock`,
    `frame time: mean ${report.drawMs.mean} ms, 99th ${report.drawMs.p99} ms, worst ${report.drawMs.longest} ms at frame ${report.drawMs.longestAtFrame}`,
    `  of it script: mean ${report.scriptMs.mean} ms, 99th ${report.scriptMs.p99} ms, worst ${report.scriptMs.longest} ms at frame ${report.scriptMs.longestAtFrame}`,
    `  of it the wait for the picture: mean ${report.cardMs.mean} ms, 99th ${report.cardMs.p99} ms, worst ${report.cardMs.longest} ms`,
    `shown frame to shown frame: mean ${report.gapMs.mean} ms, 99th ${report.gapMs.p99} ms, longest ${report.gapMs.longest} ms at ${report.gapMs.longestAtFilm} s, ${report.gaps.length} over ${GAP_MS} ms`,
    `written into storage that exists: mean ${report.writes.mbMean.toFixed(2)} MB a frame in ${report.writes.mean.toFixed(0)} writes, worst ${report.writes.mbLargest.toFixed(2)} MB at frame ${report.writes.mbLargestAtFrame}, ${report.writes.mbTotal.toFixed(0)} MB in all`,
    `made after loading: ${things === null ? 'not counted' : things}${report.madeAtFilm.length ? `, first at ${report.madeAtFilm[0]} s` : ''}`,
    `script by the film's own laps, ms a frame (shadow and scene hold the renderer's walk and what the owners do inside it; the table of the script alone splits those by owner):${owners.length ? '' : ' not measured'}`,
    ...owners,
    `skipped: ${f.skipped === 0 ? 'none' : `${f.skipped} ${f.skipped === 1 ? 'frame' : 'frames'} in ${runs.length} ${runs.length === 1 ? 'run' : 'runs'}, frames ${named.join(', ')}${runs.length > SHOWN_RUNS ? `, and ${runs.length - SHOWN_RUNS} more runs in the file` : ''}`}`,
    `the ${stretches.length === 1 ? 'worst second' : `${stretches.length} worst seconds`} of film:`,
    ...stretches,
  ].join('\n')
}

// The report as a file: the summary, every gap, and one line for each frame that was shown.
export function reportFile(report: Report): Blob {
  return new Blob([JSON.stringify(report, null, 1)], { type: 'application/json' })
}

export function reportName(report: Report): string {
  return `${config.slug}-${report.kind}-${report.at.replace(/[:.]/g, '-')}.json`
}

// What the timing at the end of loading found at one quality.
export interface Timed { quality: string; held: boolean; due: number; shown: number; skipped: number; longestGapMs: number; slow: number }

export const timedText = (t: Timed): string => `${t.quality} ${t.held ? 'held' : 'did not hold'} ${config.film.fps} frames a second (${t.shown} of ${t.due} frames shown, longest gap ${t.longestGapMs.toFixed(0)} ms, ${t.slow} slow)`

// What the timing at the end of loading says, and the quality the film now plays at. `found` holds the qualities in the order they were timed.
export function timedAdvice(found: Timed[], seconds: number): string {
  const last = found[found.length - 1]
  const rate = `${config.film.fps} frames a second`
  const lost = (t: Timed): string => `${t.skipped} of ${t.due} frames skipped, the longest gap ${t.longestGapMs.toFixed(0)} ms`
  const skips = 'A recording stays with the music and skips frames. The export makes a file with every frame at any speed.'
  if (!last) return ''
  if (found.length === 1 && last.held) return `Timed at loading: this machine held ${rate} at ${last.quality} quality over ${seconds} seconds of the film's hardest parts. Record at ${last.quality} quality.`
  if (found.length === 1) return `Timed at loading: ${last.quality} quality did not hold ${rate} (${lost(last)}). ${skips}`
  const first = found[0]
  if (last.held) return `Timed at loading: ${first.quality} quality did not hold ${rate} on this machine (${lost(first)}), ${last.quality} quality held. The film now plays at ${last.quality} quality. Record at ${last.quality} quality.`
  return `Timed at loading: neither quality held ${rate} on this machine (${first.quality}: ${lost(first)}; ${last.quality}: ${lost(last)}). The film now plays at ${last.quality} quality. ${skips}`
}
