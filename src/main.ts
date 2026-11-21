import './main.css'
import { installShowcase } from './capture/showcase.ts'
import { Film } from './director/film.ts'
import { startLive } from './director/live.ts'
import { readOptions } from './director/modes.ts'

const options = readOptions(location.search)
const canvas = document.getElementById('film') as HTMLCanvasElement
const host = document.getElementById('ui') as HTMLElement
const note = document.getElementById('note') as HTMLElement

function say(text: string): void {
  note.textContent = text
}

try {
  const film = new Film(canvas, options.format, options.assets)
  film.diag = options.diag
  const ready = film.load()
  installShowcase(film, ready)
  ready.then(
    () => {
      if (options.mode === 'capture') return
      startLive(film, options, host)
    },
    (error: unknown) => say(`The scene could not load. ${error instanceof Error ? error.message : String(error)}`),
  )
} catch (error) {
  say(`This browser cannot draw the film. ${error instanceof Error ? error.message : String(error)}`)
  window.showcase = { ready: Promise.reject(error) } as Window['showcase']
  window.showcase.ready.catch(() => undefined)
}
