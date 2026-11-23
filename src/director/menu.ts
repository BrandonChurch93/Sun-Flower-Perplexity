import { diagNames, isDiag, type DiagName } from '../core/shading.ts'
import css from './menu.module.css'
import type { Mode } from './modes.ts'
import { keys, segments } from './timeline.ts'

export type MenuMode = Extract<Mode, 'live' | 'autopilot' | 'export'>
export const MENU_MODES: MenuMode[] = ['live', 'autopilot', 'export']

export interface MenuState {
  frame: number
  unit: string
  diag: DiagName
  links: Record<MenuMode, string>
}

export interface MenuActions {
  jump(frame: number): void
  diag(name: DiagName): void
  go(mode: MenuMode): void
  pacing(): string | null
}

export interface Menu {
  readonly open: boolean
  toggle(open?: boolean): void
  update(state: MenuState): void
}

const MODE_NAMES: Record<MenuMode, string> = { live: 'Player', autopilot: 'Hands free', export: 'Export' }
const DIAG_NAMES: Record<DiagName, string> = { beauty: 'The film', ungraded: 'Before the colour grade', plant: 'Plant alone', backlight: 'Backlight', texels: 'Texture detail', depth: 'Depth', focus: 'Focus', standins: 'Stand-ins' }
const HELP: [string, string][] = [
  ['Space', 'play'],
  ['R', 'record'],
  ['C', 'check'],
  ['Arrows', 'frame'],
  ['Shift Arrows', 'bar'],
  ['Drag', 'orbit'],
  ['Wheel', 'zoom'],
  ['0', 'reset'],
  ['H', 'hide'],
  ['M', 'menu'],
]

function make<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text !== undefined) node.textContent = text
  return node
}

export function createMenu(host: HTMLElement, actions: MenuActions): Menu {
  const toggle = make('button', css.toggle)
  toggle.type = 'button'
  toggle.setAttribute('aria-expanded', 'false')
  toggle.setAttribute('aria-controls', 'live-menu')
  toggle.append(make('span', undefined, 'Menu'), make('kbd', css.key, 'M'))

  const panel = make('section', css.panel)
  panel.id = 'live-menu'
  panel.setAttribute('aria-label', 'Menu')
  panel.hidden = true

  let groups = 0
  const group = (title: string, columns: number): HTMLElement => {
    const wrap = make('div', css.group)
    const heading = make('h2', css.heading, title)
    heading.id = `live-menu-group-${groups++}`
    const grid = make('div', css.grid)
    grid.style.setProperty('--columns', String(columns))
    grid.setAttribute('role', 'group')
    grid.setAttribute('aria-labelledby', heading.id)
    wrap.append(heading, grid)
    panel.append(wrap)
    return grid
  }

  const sectionButtons = new Map<string, HTMLButtonElement>()
  const sections = group('Sections', 2)
  for (const s of segments) {
    const b = make('button', css.chip, `${s.name}, bar ${s.fromBar}`)
    b.type = 'button'
    b.addEventListener('click', () => actions.jump(s.firstFrame))
    sectionButtons.set(s.id, b)
    sections.append(b)
  }

  const lookButtons: { frame: number; node: HTMLButtonElement }[] = []
  const looks = group('Moments', 3)
  for (const k of keys) {
    const said = k.id.replace(/-/g, ' ')
    const b = make('button', css.chip, said.charAt(0).toUpperCase() + said.slice(1))
    b.type = 'button'
    b.title = `${k.time.toFixed(2)} s`
    b.addEventListener('click', () => actions.jump(k.frame))
    lookButtons.push({ frame: k.frame, node: b })
    looks.append(b)
  }

  const modeLinks = new Map<MenuMode, HTMLAnchorElement>()
  const modes = group('Page', 3)
  for (const m of MENU_MODES) {
    const a = make('a', css.chip, MODE_NAMES[m])
    a.href = '#'
    if (m === 'live') a.setAttribute('aria-current', 'page')
    a.addEventListener('click', (event) => {
      if (event.ctrlKey || event.metaKey || event.shiftKey || event.button !== 0) return
      event.preventDefault()
      actions.go(m)
    })
    modeLinks.set(m, a)
    modes.append(a)
  }

  const run = group('Last run', 1)
  const copy = make('button', css.chip, 'Copy the pacing report')
  copy.type = 'button'
  copy.dataset.role = 'copy-pacing'
  const copied = make('p', css.note, 'After a run, this copies its numbers as text.')
  copied.dataset.role = 'copy-pacing-line'
  copied.setAttribute('role', 'status')
  const text = make('textarea', css.report)
  text.readOnly = true
  text.hidden = true
  text.rows = 6
  text.dataset.role = 'pacing-text'
  text.setAttribute('aria-label', 'The pacing report')
  copy.addEventListener('click', () => {
    const report = actions.pacing()
    if (report === null) {
      copied.textContent = 'No run yet. Play, check or record once, then copy.'
      return
    }
    text.value = report
    const shown = () => {
      text.hidden = false
      text.focus()
      text.select()
      copied.textContent = 'The browser did not allow the copy. The report is selected below: copy it by hand.'
    }
    if (!navigator.clipboard) return shown()
    navigator.clipboard.writeText(report).then(() => {
      copied.textContent = 'Copied. Paste it into a message.'
    }, shown)
  })
  run.append(copy, copied, text)

  const fields = make('div', css.fields)
  panel.append(fields)
  const wrap = make('label', css.field)
  const diagSelect = make('select', css.select)
  for (const d of diagNames) {
    const option = make('option', undefined, DIAG_NAMES[d])
    option.value = d
    diagSelect.append(option)
  }
  diagSelect.addEventListener('change', () => {
    if (isDiag(diagSelect.value)) actions.diag(diagSelect.value)
  })
  wrap.append(make('span', css.label, 'Picture shows'), diagSelect)
  fields.append(wrap)

  const help = make('p', css.help)
  for (const [key, what] of HELP) {
    const item = make('span', css.helpItem)
    item.append(make('kbd', css.key, key), document.createTextNode(` ${what}`))
    help.append(item)
  }
  panel.append(help)

  host.append(toggle, panel)

  let open = false
  const set = (next: boolean) => {
    if (next === open) return
    const inside = panel.contains(document.activeElement)
    open = next
    panel.hidden = !open
    toggle.setAttribute('aria-expanded', open ? 'true' : 'false')
    if (!open && inside) toggle.focus()
  }
  toggle.addEventListener('click', () => set(!open))

  const mark = (node: HTMLElement, on: boolean) => {
    if (on) node.setAttribute('aria-current', 'true')
    else node.removeAttribute('aria-current')
  }

  return {
    get open() {
      return open
    },
    toggle(next) {
      set(next ?? !open)
    },
    update(state) {
      for (const [id, b] of sectionButtons) mark(b, id === state.unit)
      for (const k of lookButtons) mark(k.node, k.frame === state.frame)
      for (const [m, a] of modeLinks) a.href = state.links[m]
      if (diagSelect.value !== state.diag) diagSelect.value = state.diag
    },
  }
}
