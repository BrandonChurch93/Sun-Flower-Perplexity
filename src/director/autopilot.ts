import { config } from '../config.ts'
import { makeClock, runFrom } from '../player/clock.ts'
import type { Report } from '../player/pacing.ts'
import { filmPlan, play } from '../player/play.ts'
import type { Film } from './film.ts'
import type { Options } from './modes.ts'
import { segments } from './timeline.ts'

export interface AutopilotState { frame: number; playing: boolean; done: boolean; error: string | null; report: Report | null }

declare global {
  interface Window { autopilot?: AutopilotState }
}

// Plays without a hand on it and without an interface: one frame held, a stretch once, or a stretch over and over.
// It runs silent on the same audio clock as the player, so a late machine skips frames here too.
export function startAutopilot(film: Film, options: Options, _host: HTMLElement): void {
  const unit = options.unit ? segments.find((s) => s.id === options.unit) : null
  const first = unit ? unit.firstFrame : Math.min(options.first, options.last)
  const last = unit ? unit.lastFrame : Math.max(options.first, options.last)
  const fps = config.film.fps
  const state: AutopilotState = { frame: -1, playing: false, done: false, error: null, report: null }
  window.autopilot = state

  const run = async (): Promise<void> => {
    if (options.hold) {
      await film.renderFrame(options.frame, options.tier)
      state.frame = options.frame
      state.done = true
      return
    }
    await film.warm(options.tier)
    const clock = await makeClock(null, { avMs: 0, marks: false })
    // A browser that keeps sound off until somebody touches the page starts the clock at the first key or click.
    const wake = () => void clock.ctx.resume()
    window.addEventListener('pointerdown', wake)
    window.addEventListener('keydown', wake)
    state.playing = true
    do {
      const from = await runFrom(clock, first / fps, false, options.av)
      const playing = play({
        film,
        tier: options.tier,
        plan: filmPlan(first, last),
        time: from.time,
        facts: (stepMs) => ({
          kind: 'play',
          quality: film.quality ?? 'high',
          format: `${film.format.width} x ${film.format.height}`,
          tier: options.tier,
          track: null,
          avMs: options.av,
          marks: false,
          audio: { sampleRate: clock.ctx.sampleRate, baseLatencyMs: clock.ctx.baseLatency * 1000, outputLatencyMs: (clock.ctx.outputLatency || 0) * 1000, stepMs },
          screen: { width: window.innerWidth, height: window.innerHeight, pixelRatio: window.devicePixelRatio, fullScreen: document.fullscreenElement !== null, pictureWidth: film.format.width, pictureHeight: film.format.height },
          browser: navigator.userAgent,
        }),
        tick(_seconds, cue) {
          if (cue) state.frame = cue.frame
        },
      })
      state.report = await playing.finished
    } while (options.loop)
    state.playing = false
    state.done = true
  }

  run().catch((error: unknown) => {
    state.playing = false
    state.error = error instanceof Error ? error.message : String(error)
    document.title = `${config.name}, stopped`
    console.error(`The film stopped drawing: ${state.error}`)
  })
}
