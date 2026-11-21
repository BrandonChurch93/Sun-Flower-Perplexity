import { config, frameCount } from '../config.ts'
import type { Film } from './film.ts'
import styles from './live.module.css'
import type { Options } from './modes.ts'
import { segmentAt } from './timeline.ts'

export function startLive(film: Film, options: Options, host: HTMLElement): void {
  const bar = document.createElement('div')
  bar.className = styles.bar
  const scrub = document.createElement('input')
  scrub.className = styles.scrub
  scrub.type = 'range'
  scrub.min = '0'
  scrub.max = String(frameCount - 1)
  scrub.value = String(options.frame)
  scrub.setAttribute('aria-label', 'Time')
  const readout = document.createElement('span')
  readout.className = styles.readout
  bar.append(scrub, readout)
  host.append(bar)
  let wanted = options.frame
  let drawing = false
  let settle = 0
  const show = (frame: number) => {
    readout.textContent = `${(frame / config.film.fps).toFixed(2)} s · ${segmentAt(frame).id}`
  }
  const draw = async () => {
    if (drawing) return
    drawing = true
    while (true) {
      const frame = wanted
      show(frame)
      await film.renderFrame(frame, 'draft', true)
      if (frame === wanted) break
    }
    drawing = false
    clearTimeout(settle)
    settle = window.setTimeout(() => {
      if (!drawing) void film.renderFrame(wanted, options.tier === 'draft' ? 'review' : options.tier, true)
    }, 400)
  }
  scrub.addEventListener('input', () => {
    wanted = Number(scrub.value)
    void draw()
  })
  void draw()
}
