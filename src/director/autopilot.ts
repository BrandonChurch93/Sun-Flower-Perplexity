import { config } from '../config.ts'
import type { Film } from './film.ts'
import type { Options } from './modes.ts'
import { segmentById } from './timeline.ts'

export interface AutopilotState { frame: number; playing: boolean; done: boolean; error: string | null }

declare global {
  interface Window { autopilot?: AutopilotState }
}

const WAIT_MS = 100

// Schedules the next look at the clock. Nothing is drawn inside the callback.
function nextTurn(): Promise<void> {
  return new Promise((resolve) => {
    let settled = false
    const done = () => {
      if (settled) return
      settled = true
      resolve()
    }
    requestAnimationFrame(done)
    window.setTimeout(done, WAIT_MS)
  })
}

export function startAutopilot(film: Film, options: Options, _host: HTMLElement): void {
  const unit = options.unit ? segmentById(options.unit) : null
  const first = unit ? unit.firstFrame : Math.min(options.first, options.last)
  const last = unit ? unit.lastFrame : Math.max(options.first, options.last)
  const fps = config.film.fps
  const state: AutopilotState = { frame: -1, playing: false, done: false, error: null }
  window.autopilot = state

  const show = async (frame: number): Promise<void> => {
    await film.renderFrame(frame, options.tier, false)
    state.frame = frame
  }

  const run = async (): Promise<void> => {
    if (options.hold) {
      await show(options.frame)
      state.done = true
      return
    }
    state.playing = true
    await show(first)
    let origin = performance.now()
    for (;;) {
      await nextTurn()
      // Time spent waiting for a world to load does not count: the timeline waits on the last complete frame.
      const before = performance.now()
      await film.load()
      origin += performance.now() - before
      let due = first + Math.floor(((performance.now() - origin) / 1000) * fps)
      if (due > last) {
        if (!options.loop) {
          if (state.frame !== last) await show(last)
          break
        }
        origin = performance.now()
        due = first
      }
      if (due !== state.frame) await show(due)
    }
    state.playing = false
    state.done = true
  }

  run().catch((error: unknown) => {
    state.playing = false
    state.error = error instanceof Error ? error.message : String(error)
    document.title = 'Sunflower, stopped'
    console.error(`The film stopped drawing: ${state.error}`)
  })
}
