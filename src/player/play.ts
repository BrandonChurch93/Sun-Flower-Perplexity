import { config, frameCount, type TierId } from '../config.ts'
import type { Film } from '../director/film.ts'
import { madeSince, madeSoFar } from '../v2/counter.ts'
import { Steady } from './clock.ts'
import { asked, Pacing, type Report, type RunFacts } from './pacing.ts'
import { splitOf } from './split.ts'

const FPS = config.film.fps

// What a run shows at one moment of its clock: a film frame and its place in the run, or nothing, which is the dark screen.
// `due` is the second of the run's clock the frame belongs to.
export interface Cue { frame: number; position: number; due: number }

export interface Plan {
  // Frames the run would show on a machine that holds the rate.
  due: number
  cue(seconds: number): Cue | null
  done(seconds: number): boolean
}

// The whole film, or a part of it, at film time: frame n is on screen from n / 30 s.
export function filmPlan(first = 0, last = frameCount - 1, tail = 0): Plan {
  return {
    due: last - first + 1,
    cue(seconds) {
      const frame = Math.floor(seconds * FPS + 1e-9)
      return frame < first || frame > last ? null : { frame, position: frame - first, due: frame / FPS }
    },
    done: (seconds) => seconds >= (last + 1) / FPS + tail,
  }
}

// Several stretches of the film played one after another on one clock that starts at zero.
export function stretchPlan(starts: number[], framesEach: number): Plan {
  return {
    due: starts.length * framesEach,
    cue(seconds) {
      const position = Math.floor(seconds * FPS + 1e-9)
      if (position < 0 || position >= starts.length * framesEach) return null
      const stretch = Math.floor(position / framesEach)
      return { frame: Math.min(frameCount - 1, starts[stretch] + (position - stretch * framesEach)), position, due: position / FPS }
    },
    done: (seconds) => seconds >= (starts.length * framesEach) / FPS,
  }
}

export interface PlayOptions {
  film: Film
  tier: TierId
  plan: Plan
  // The audio clock, in the seconds of the plan.
  time(): number
  facts(stepMs: number): RunFacts
  // Called at every animation frame with the time and what the plan shows at it, before anything is drawn.
  tick?(seconds: number, cue: Cue | null): void
  // Reads the audio clock as it is, without moving between its steps.
  raw?: boolean
}

export interface Playing {
  stop(): void
  readonly finished: Promise<Report>
}

// Plays a plan against the audio clock. Each animation frame draws the frame the clock is in, if it is not on screen already.
// A machine that is late skips frames and never falls behind the clock.
export function play(options: PlayOptions): Playing {
  const { film, plan } = options
  const pacing = new Pacing()
  const steady = new Steady()
  const split = splitOf(film)
  const before = madeSoFar()
  let stopped = false
  let onScreen = -1
  let settle: (report: Report) => void = () => undefined
  let refuse: (error: unknown) => void = () => undefined
  const finished = new Promise<Report>((resolve, reject) => {
    settle = resolve
    refuse = reject
  })

  const read = (): number => {
    const raw = options.time()
    return options.raw ? raw : steady.read(raw, performance.now())
  }

  const end = (complete: boolean) => {
    settle(pacing.report(options.facts(steady.step * 1000), plan.due, complete, madeSince(before)))
  }

  const turn = async (stamp: number): Promise<void> => {
    try {
      const seconds = read()
      if (stopped || plan.done(seconds)) {
        end(!stopped)
        return
      }
      const cue = plan.cue(seconds)
      options.tick?.(seconds, cue)
      if (cue && cue.frame !== onScreen) {
        const had = madeSoFar()
        const t0 = performance.now()
        await film.renderFrame(cue.frame, options.tier)
        const t1 = performance.now()
        onScreen = cue.frame
        pacing.present(cue.frame, cue.position, cue.due, seconds, read(), stamp, t1 - t0, asked(madeSince(had)), split.scriptMs)
      }
      requestAnimationFrame(turn)
    } catch (error) {
      refuse(error)
    }
  }
  requestAnimationFrame(turn)

  return {
    stop() {
      stopped = true
    },
    finished,
  }
}
