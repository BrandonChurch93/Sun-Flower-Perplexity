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
const page = options.mode === 'live' || options.mode === 'review'
const played = page || options.mode === 'autopilot'

document.documentElement.dataset.mode = page ? 'live' : options.mode
if (options.mode === 'review') document.documentElement.dataset.review = 'yes'
if (options.count || played) installCounter()

function say(text: string): void {
  if (options.mode === 'autopilot') {
    console.error(text)
    return
  }
  note.textContent = text
}

const told = (error: unknown): string => (error instanceof Error ? error.message : String(error))

// The first parts are made in one long step. A page a person watches is painted once before that step, so it never sits blank.
function painted(): Promise<void> {
  return new Promise<void>((resolve) => {
    let open = true
    const go = (): void => {
      if (!open) return
      open = false
      resolve()
    }
    window.setTimeout(go, 200)
    requestAnimationFrame(() => requestAnimationFrame(go))
  })
}

function start(): void {
  try {
    const quality = options.quality ?? (played ? 'high' : null)
    const film = new Film(canvas, options.format, options.assets, { sky: options.sky ?? undefined, only: options.only, view: options.view ?? undefined, quality })
    film.diag = options.diag
    film.view.azimuthDeg = options.az
    film.view.elevationDeg = options.el
    film.view.dolly = options.dolly
    const loading = page ? showLoading(host, film) : null
    document.getElementById('boot')?.remove()
    const ready = loading ? loading.loaded : film.load()
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
    document.getElementById('boot')?.remove()
    say(`This browser cannot draw the film. ${told(error)}`)
    window.showcase = { ready: Promise.reject(error) } as Window['showcase']
    window.showcase.ready.catch(() => undefined)
  }
}

if (page || options.mode === 'export') void painted().then(start)
else start()
