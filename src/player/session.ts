import { config, frameCount, type Format, type TierId } from '../config.ts'
import type { Film } from '../director/film.ts'
import { keys, segments } from '../director/timeline.ts'
import { MARK_HOLD_SECONDS, markSeconds, runFrom, SETTLE_SECONDS, TAIL_SECONDS, type FilmClock } from './clock.ts'
import type { Report, RunFacts, ScriptAlone } from './pacing.ts'
import { filmPlan, play, stretchPlan, type Plan, type Playing } from './play.ts'
import { stateRun, type StateReport } from './state.ts'

export const CHECK_SECONDS = 20
const CHECK_STRETCHES = 3

export interface Deck {
  film: Film
  tier: TierId
  root: HTMLElement
  stage: HTMLElement
  curtain: HTMLElement
  facts(kind: RunFacts['kind'], ctx: AudioContext | null): RunFacts
}

const stepped = (facts: RunFacts, stepMs: number): RunFacts => ({ ...facts, audio: { ...facts.audio, stepMs: Number(stepMs.toFixed(2)) } })

// The check plays the film's hardest stretches one after another: the storm round its lightning, the open flower, the crane over the field.
export function checkStarts(framesEach: number): number[] {
  const middle = (id: string): number => {
    const s = segments.find((x) => x.id === id) ?? segments[segments.length - 1]
    return s.firstFrame + Math.floor(s.frames / 2)
  }
  const flash = keys.find((k) => k.id === 'storm-flash')
  const centres = [flash ? flash.frame : middle('storm'), middle('flower'), middle('crane')]
  return centres.map((c) => Math.max(0, Math.min(frameCount - framesEach, c - Math.floor(framesEach / 2))))
}

export interface Session {
  stop(): void
  readonly finished: Promise<Report>
}

const wait = (ms: number): Promise<void> => new Promise((resolve) => window.setTimeout(resolve, ms))

// The size the picture has on screen: one film pixel on one screen pixel when the window is large enough, fitted otherwise. Never stretched.
export function pictureSize(format: Format, windowWidth: number, windowHeight: number, pixelRatio: number, fill: boolean): { width: number; height: number; exact: boolean } {
  const exactWidth = format.width / pixelRatio
  const exactHeight = format.height / pixelRatio
  if (!fill && exactWidth <= windowWidth + 0.01 && exactHeight <= windowHeight + 0.01) return { width: exactWidth, height: exactHeight, exact: true }
  const scale = Math.min(windowWidth / format.width, windowHeight / format.height)
  return { width: format.width * scale, height: format.height * scale, exact: Math.abs(scale * pixelRatio - 1) < 1e-6 }
}

const MARK_REFRESHES = 2

// The white flash of the two sync marks, on a loop of its own beside the film's. Each mark goes on at its second of the clock, or at the first refresh after it,
// and stays for its whole length from then on and for at least two refreshes. The run does not end before the second one has been shown.
export function flasher(time: () => number, set: (on: boolean) => void): { shown(): boolean; stop(): void } {
  const marks = markSeconds().map((at) => ({ at, since: NaN, refreshes: 0, over: false }))
  let on = false
  let live = true
  const turn = (): void => {
    if (!live) return
    const seconds = time()
    let next = false
    for (const m of marks) {
      if (m.over || seconds < m.at) continue
      if (m.refreshes === 0) m.since = seconds
      if (m.refreshes >= MARK_REFRESHES && seconds >= m.since + MARK_HOLD_SECONDS - 1e-9) m.over = true
      else {
        m.refreshes++
        next = true
      }
    }
    if (next !== on) {
      on = next
      set(on)
    }
    requestAnimationFrame(turn)
  }
  requestAnimationFrame(turn)
  return {
    shown: () => marks.every((m) => m.over),
    stop() {
      live = false
      if (on) set(false)
    },
  }
}

// Recording mode: full screen, nothing but the film. A dark lead, every frame from the first to the last, a dark tail, and back.
export function record(deck: Deck, clockReady: Promise<FilmClock>, marks: boolean): Session {
  const { film, root, stage, curtain } = deck
  let stopped = false
  let playing: Playing | null = null
  let lock: WakeLockSentinel | null = null
  let flash: ReturnType<typeof flasher> | null = null
  const stop = () => {
    stopped = true
    playing?.stop()
  }
  const onLeave = () => {
    if (!document.fullscreenElement) stop()
  }
  const run = async (): Promise<Report> => {
    root.dataset.run = 'recording'
    curtain.dataset.on = 'yes'
    let clock: FilmClock | null = null
    try {
      try {
        await stage.requestFullscreen({ navigationUI: 'hide' })
      } catch {}
      const full = document.fullscreenElement !== null
      if (full) document.addEventListener('fullscreenchange', onLeave)
      try {
        lock = await navigator.wakeLock.request('screen')
      } catch {}
      clock = await clockReady
      const running = clock
      await film.renderFrame(0, deck.tier)
      if (full) await wait(SETTLE_SECONDS * 1000)
      const facts = deck.facts('recording', running.ctx)
      if (!stopped) await running.start()
      let dark = true
      const film0 = filmPlan(0, frameCount - 1, TAIL_SECONDS)
      if (marks && !stopped) {
        flash = flasher(() => running.time(), (on) => {
          curtain.dataset.flash = on ? 'yes' : 'no'
        })
      }
      const held = flash
      const plan: Plan = held ? { ...film0, done: (seconds) => film0.done(seconds) && held.shown() } : film0
      playing = play({
        film,
        tier: deck.tier,
        plan,
        time: () => running.time(),
        facts: (stepMs) => stepped(facts, stepMs),
        tick(_seconds, cue) {
          if ((cue === null) !== dark) {
            dark = cue === null
            curtain.dataset.on = dark ? 'yes' : 'no'
          }
        },
      })
      if (stopped) playing.stop()
      return await playing.finished
    } finally {
      flash?.stop()
      clock?.stop()
      document.removeEventListener('fullscreenchange', onLeave)
      await lock?.release().catch(() => undefined)
      if (document.fullscreenElement) await document.exitFullscreen().catch(() => undefined)
      delete curtain.dataset.on
      delete curtain.dataset.flash
      delete root.dataset.run
    }
  }
  return { stop, finished: run() }
}

// The check before recording: twenty seconds over the film's hardest moments, on the audio clock with the sound off.
export function check(deck: Deck, clock: FilmClock): Session {
  const fps = config.film.fps
  const each = Math.round((CHECK_SECONDS * fps) / CHECK_STRETCHES)
  const starts = checkStarts(each)
  let stopped = false
  let playing: Playing | null = null
  const run = async (): Promise<Report> => {
    deck.root.dataset.run = 'check'
    try {
      await deck.film.renderFrame(starts[0], deck.tier)
      const clockRun = await runFrom(clock, 0, false, 0)
      const facts = deck.facts('check', clock.ctx)
      playing = play({ film: deck.film, tier: deck.tier, plan: stretchPlan(starts, each), time: clockRun.time, seat: true, facts: (stepMs) => stepped(facts, stepMs) })
      if (stopped) playing.stop()
      return await playing.finished
    } finally {
      delete deck.root.dataset.run
    }
  }
  return {
    stop() {
      stopped = true
      playing?.stop()
    },
    finished: run(),
  }
}

// The timing at the end of loading: the same twenty seconds on the page's own clock, since no sound may start before a click.
// A page that is not in view draws nothing, so the timing waits until it is, and starts again if the page was hidden while it ran.
// `say` is told the seconds timed so far, or null while it waits for the page to be in view.
export function timing(deck: Deck, say: (seconds: number | null) => void): Session {
  const fps = config.film.fps
  const each = Math.round((CHECK_SECONDS * fps) / CHECK_STRETCHES)
  const starts = checkStarts(each)
  let stopped = false
  let playing: Playing | null = null
  const inView = (): boolean => document.visibilityState === 'visible'
  const seen = (): Promise<void> =>
    new Promise<void>((resolve) => {
      if (inView()) {
        resolve()
        return
      }
      say(null)
      const look = (): void => {
        if (!inView() && !stopped) return
        document.removeEventListener('visibilitychange', look)
        resolve()
      }
      document.addEventListener('visibilitychange', look)
    })
  const once = async (): Promise<{ report: Report; hidden: boolean }> => {
    let hidden = false
    const hide = (): void => {
      if (inView()) return
      hidden = true
      playing?.stop()
    }
    document.addEventListener('visibilitychange', hide)
    try {
      await deck.film.renderFrame(starts[0], deck.tier)
      const zero = performance.now()
      const facts = deck.facts('timing', null)
      playing = play({ film: deck.film, tier: deck.tier, plan: stretchPlan(starts, each), time: () => (performance.now() - zero) / 1000, raw: true, seat: true, facts: () => facts, tick: (seconds) => say(Math.min(CHECK_SECONDS, Math.max(0, seconds))) })
      if (stopped) playing.stop()
      return { report: await playing.finished, hidden }
    } finally {
      document.removeEventListener('visibilitychange', hide)
    }
  }
  const run = async (): Promise<Report> => {
    for (;;) {
      await seen()
      const { report, hidden } = await once()
      if (!hidden || stopped) return report
    }
  }
  return {
    stop() {
      stopped = true
      playing?.stop()
      document.dispatchEvent(new Event('visibilitychange'))
    },
    finished: run(),
  }
}

// The page's own work on the frames of the timing, set in a row with every draw call left out.
// A frame that is skipped makes the next one dearer, so only frames set in a row say whether the script alone is over the frame.
export function timingScript(deck: Deck, say: (done: number, of: number) => void): { stop(): void; finished: Promise<ScriptAlone | null> } {
  const each = Math.round((CHECK_SECONDS * config.film.fps) / CHECK_STRETCHES)
  const starts = checkStarts(each)
  const of = each * starts.length
  let stopped = false
  const run = async (): Promise<ScriptAlone | null> => {
    const found: ScriptAlone = { frames: 0, over: 0, meanMs: 0, worstMs: 0 }
    let sum = 0
    for (const [i, start] of starts.entries()) {
      const part = await stateRun(deck.film, start, start + each - 1, deck.tier, {
        stopped: () => stopped,
        onFrame(frame) {
          const done = i * each + frame - start + 1
          if (done % 10 === 0 || done === of) say(done, of)
        },
      })
      if (!part.complete) return null
      found.frames += part.frames
      found.over += part.overFrame
      sum += part.script.meanMs * part.frames
      found.worstMs = Math.max(found.worstMs, part.script.worstMs)
    }
    found.meanMs = found.frames ? sum / found.frames : 0
    return found
  }
  return {
    stop() {
      stopped = true
    },
    finished: run(),
  }
}

export interface Measured { live: Report; script: StateReport | null }

export interface Measuring {
  stop(): void
  readonly finished: Promise<Measured>
}

// The pacing report: the film from `first` to `last` once against the audio clock with the sound off, then the same frames set in a row with every draw call left out.
// `say` is told what runs now. A run that is stopped gives what it has measured until then.
export function measure(deck: Deck, clock: FilmClock, first: number, last: number, say: (text: string) => void): Measuring {
  const fps = config.film.fps
  let stopped = false
  let playing: Playing | null = null
  const run = async (): Promise<Measured> => {
    deck.root.dataset.run = 'measure'
    let live: Report
    try {
      await deck.film.renderFrame(first, deck.tier)
      const clockRun = await runFrom(clock, first / fps, false, 0)
      try {
        const facts = deck.facts('measure', clock.ctx)
        playing = play({ film: deck.film, tier: deck.tier, plan: filmPlan(first, last), time: clockRun.time, facts: (stepMs) => stepped(facts, stepMs) })
        if (stopped) playing.stop()
        live = await playing.finished
      } finally {
        clockRun.stop()
      }
    } finally {
      delete deck.root.dataset.run
    }
    if (stopped) return { live, script: null }
    const of = last - first + 1
    say(`Measuring the script, frame 1 of ${of}`)
    const script = await stateRun(deck.film, first, last, deck.tier, {
      stopped: () => stopped,
      onFrame(frame) {
        const done = frame - first + 1
        if (done % fps === 0 || done === of) say(`Measuring the script, frame ${done} of ${of}`)
      },
    })
    return { live, script }
  }
  return {
    stop() {
      stopped = true
      playing?.stop()
    },
    finished: run(),
  }
}
