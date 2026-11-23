import './main.css'
import { startExport } from './capture/export.ts'
import { installShowcase } from './capture/showcase.ts'
import { startAutopilot } from './director/autopilot.ts'
import { Film } from './director/film.ts'
import { startLive } from './director/live.ts'
import { readOptions } from './director/modes.ts'
import { showLoading } from './player/loading.ts'
import { installCounter } from './v2/counter.ts'

const options = readOptions(location.search)
const canvas = document.getElementById('film') as HTMLCanvasElement
const host = document.getElementById('ui') as HTMLElement
const note = document.getElementById('note') as HTMLElement
const played = options.mode === 'live' || options.mode === 'autopilot'

document.documentElement.dataset.mode = options.mode
if (options.count || played) installCounter()

function say(text: string): void {
  if (options.mode === 'autopilot') {
    console.error(text)
    return
  }
  note.textContent = text
}

const told = (error: unknown): string => (error instanceof Error ? error.message : String(error))

try {
  const quality = options.quality ?? (played ? 'high' : null)
  const film = new Film(canvas, options.format, options.assets, { sky: options.sky ?? undefined, only: options.only, view: options.view ?? undefined, quality })
  film.diag = options.diag
  film.view.azimuthDeg = options.az
  film.view.elevationDeg = options.el
  film.view.dolly = options.dolly
  const loading = options.mode === 'live' ? showLoading(host, film) : null
  const ready = film.load()
  installShowcase(film, ready)
  ready.then(
    async () => {
      if (options.mode === 'capture') return
      if (options.mode === 'export') startExport(film, options, host)
      else if (options.mode === 'autopilot') startAutopilot(film, options, host)
      else {
        try {
          await film.warm(options.tier, loading?.step)
          startLive(film, options, host, loading)
        } catch (error) {
          loading?.fail(`The film could not be made ready. ${told(error)}`)
        }
      }
    },
    (error: unknown) => {
      if (options.mode === 'export') startExport(film, options, host)
      else if (loading) loading.fail(`The scene could not load. ${told(error)}`)
      else say(`The scene could not load. ${told(error)}`)
    },
  )
} catch (error) {
  say(`This browser cannot draw the film. ${told(error)}`)
  window.showcase = { ready: Promise.reject(error) } as Window['showcase']
  window.showcase.ready.catch(() => undefined)
}
