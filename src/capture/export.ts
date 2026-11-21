import type { Film } from '../director/film.ts'
import type { Options } from '../director/modes.ts'

export function startExport(_film: Film, _options: Options, host: HTMLElement): void {
  const note = document.createElement('p')
  note.textContent = 'Export is being built.'
  host.append(note)
}
