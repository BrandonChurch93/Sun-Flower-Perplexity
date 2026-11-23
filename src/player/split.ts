import type { Film } from '../director/film.ts'

// How long the page itself worked on the last frame before it asked the graphics card for the finished picture, and how long that answer took.
// Only for measuring: no pixel depends on it.
export interface Split { scriptMs: number; waitMs: number }

const watched = new WeakMap<Film, Split>()

export function splitOf(film: Film): Split {
  const known = watched.get(film)
  if (known) return known
  const split: Split = { scriptMs: 0, waitMs: 0 }
  watched.set(film, split)
  const { stage } = film
  const render = film.renderFrame.bind(film)
  const finish = stage.finish.bind(stage)
  let started = 0
  film.renderFrame = (frame, tier, pause) => {
    started = performance.now()
    return render(frame, tier, pause)
  }
  stage.finish = () => {
    const before = performance.now()
    finish()
    split.scriptMs = before - started
    split.waitMs = performance.now() - before
  }
  return split
}
