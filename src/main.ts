import './main.css'
import { startExport } from './capture/export.ts'
import { installShowcase } from './capture/showcase.ts'
import { startAutopilot } from './director/autopilot.ts'
import { Film } from './director/film.ts'
import { startLive } from './director/live.ts'
import { readOptions } from './director/modes.ts'
import { installCounter } from './v2/counter.ts'

const options = readOptions(location.search)
const canvas = document.getElementById('film') as HTMLCanvasElement
const host = document.getElementById('ui') as HTMLElement
const note = document.getElementById('note') as HTMLElement

document.documentElement.dataset.mode = options.mode
if (options.count) installCounter()

function say(text: string): void {
  if (options.mode === 'autopilot') {
    console.error(text)
    return
  }
  note.textContent = text
}

try {
  const film = new Film(canvas, options.format, options.assets, { sky: options.sky ?? undefined, only: options.only, view: options.view ?? undefined, quality: options.quality })
  film.diag = options.diag
  film.view.azimuthDeg = options.az
  film.view.elevationDeg = options.el
  film.view.dolly = options.dolly
  const ready = film.load()
  installShowcase(film, ready)
  ready.then(
    () => {
      if (options.mode === 'capture') return
      if (options.mode === 'export') startExport(film, options, host)
      else if (options.mode === 'autopilot') startAutopilot(film, options, host)
      else startLive(film, options, host)
    },
    (error: unknown) => {
      if (options.mode === 'export') startExport(film, options, host)
      else say(`The scene could not load. ${error instanceof Error ? error.message : String(error)}`)
    },
  )
} catch (error) {
  say(`This browser cannot draw the film. ${error instanceof Error ? error.message : String(error)}`)
  window.showcase = { ready: Promise.reject(error) } as Window['showcase']
  window.showcase.ready.catch(() => undefined)
}
