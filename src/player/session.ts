import { config, frameCount, type Format, type TierId } from '../config.ts'
import type { Film } from '../director/film.ts'
import { keys, segments } from '../director/timeline.ts'
import { markAt, runFrom, SETTLE_SECONDS, TAIL_SECONDS, type FilmClock } from './clock.ts'
import type { Report, RunFacts } from './pacing.ts'
import { filmPlan, play, stretchPlan, type Playing } from './play.ts'

const CHECK_SECONDS = 10
const CHECK_STRETCHES = 3

export interface Deck {
  film: Film
  tier: TierId
  root: HTMLElement
  stage: HTMLElement
  curtain: HTMLElement
  facts(kind: RunFacts['kind'], ctx: AudioContext): RunFacts
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

// Recording mode: full screen, nothing but the film. A dark lead, every frame from the first to the last, a dark tail, and back.
export function record(deck: Deck, clockReady: Promise<FilmClock>, marks: boolean): Session {
  const { film, root, stage, curtain } = deck
  let stopped = false
  let playing: Playing | null = null
  let lock: WakeLockSentinel | null = null
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
      let flash = false
      playing = play({
        film,
        tier: deck.tier,
        plan: filmPlan(0, frameCount - 1, TAIL_SECONDS),
        time: () => running.time(),
        facts: (stepMs) => stepped(facts, stepMs),
        tick(seconds, cue) {
          if ((cue === null) !== dark) {
            dark = cue === null
            curtain.dataset.on = dark ? 'yes' : 'no'
          }
          const mark = marks && markAt(seconds)
          if (mark !== flash) {
            flash = mark
            curtain.dataset.flash = flash ? 'yes' : 'no'
          }
        },
      })
      if (stopped) playing.stop()
      return await playing.finished
    } finally {
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

// The check before recording: ten seconds over the film's hardest moments, on the audio clock with the sound off.
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
      playing = play({ film: deck.film, tier: deck.tier, plan: stretchPlan(starts, each), time: clockRun.time, facts: (stepMs) => stepped(facts, stepMs) })
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
