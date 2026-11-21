import { config, type AssetSetId, type FormatKey, type TierId } from '../config.ts'
import { diagNames, isDiag, type DiagName } from '../core/shading.ts'
import { isAssetSet, isTier, samplesOf, tierIds } from '../core/tiers.ts'
import css from './menu.module.css'
import type { Mode } from './modes.ts'
import { keys, segments } from './timeline.ts'

export type MenuMode = Extract<Mode, 'live' | 'autopilot' | 'export'>
export const MENU_MODES: MenuMode[] = ['live', 'autopilot', 'export']

export interface MenuState {
  frame: number
  unit: string
  world: string | null
  format: string
  tier: TierId
  assets: AssetSetId
  diag: DiagName
  links: Record<MenuMode, string>
}

export interface MenuActions {
  jump(frame: number): void
  hold(world: string | null): void
  format(id: string): void
  tier(tier: TierId): void
  assets(set: AssetSetId): void
  diag(name: DiagName): void
  go(mode: MenuMode): void
}

export interface Menu {
  readonly open: boolean
  toggle(open?: boolean): void
  update(state: MenuState): void
}

const FILM = 'film'
const FORMAT_NAMES: Record<FormatKey, string> = { preview: 'Preview', master: 'Master', uhd: 'UHD' }
const DIAG_NAMES: Record<DiagName, string> = { beauty: 'Beauty', ungraded: 'Ungraded', plant: 'Plant alone', backlight: 'Backlight', texels: 'Texels', depth: 'Depth', focus: 'Focus', standins: 'Stand-ins' }
const HELP: [string, string][] = [['Drag', 'orbit'], ['Wheel', 'zoom'], ['0', 'reset'], ['Space', 'play'], ['Arrows', 'step'], ['Shift', 'ten'], ['M', 'menu']]

function make<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text !== undefined) node.textContent = text
  return node
}

function capital(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1)
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
  const group = (title: string, columns: number): { wrap: HTMLElement; grid: HTMLElement } => {
    const wrap = make('div', css.group)
    const heading = make('h2', css.heading, title)
    heading.id = `live-menu-group-${groups++}`
    const grid = make('div', css.grid)
    grid.style.setProperty('--columns', String(columns))
    grid.setAttribute('role', 'group')
    grid.setAttribute('aria-labelledby', heading.id)
    wrap.append(heading, grid)
    panel.append(wrap)
    return { wrap, grid }
  }

  const unitButtons = new Map<string, HTMLButtonElement>()
  const units = group('Units', 6)
  for (const s of segments) {
    const b = make('button', css.chip, s.id)
    b.type = 'button'
    b.title = `${s.start} s`
    b.addEventListener('click', () => actions.jump(s.firstFrame))
    unitButtons.set(s.id, b)
    units.grid.append(b)
  }

  const keyButtons: { frame: number; node: HTMLButtonElement }[] = []
  const keyGroup = group('Keys', 2)
  for (const k of keys) {
    const b = make('button', css.chip, k.id)
    b.type = 'button'
    b.title = `${k.time} s`
    b.addEventListener('click', () => actions.jump(k.frame))
    keyButtons.push({ frame: k.frame, node: b })
    keyGroup.grid.append(b)
  }

  const worldInputs = new Map<string, HTMLInputElement>()
  const worlds = group('Hold a world', 6)
  worlds.grid.setAttribute('role', 'radiogroup')
  const world = (value: string, text: string, title: string) => {
    const label = make('label', css.choice)
    label.title = title
    const input = make('input', css.radio)
    input.type = 'radio'
    input.name = 'live-menu-world'
    input.value = value
    input.addEventListener('change', () => {
      if (input.checked) actions.hold(value === FILM ? null : value)
    })
    label.append(input, make('span', css.chip, text))
    worldInputs.set(value, input)
    worlds.grid.append(label)
  }
  world(FILM, 'Film', 'The world the film shows at this time')
  for (const w of config.worlds) world(w.id, w.id, w.name)

  const modeLinks = new Map<MenuMode, HTMLAnchorElement>()
  const modes = group('Mode', 3)
  for (const m of MENU_MODES) {
    const a = make('a', css.chip, capital(m))
    a.href = '#'
    if (m === 'live') a.setAttribute('aria-current', 'page')
    a.addEventListener('click', (event) => {
      if (event.ctrlKey || event.metaKey || event.shiftKey || event.button !== 0) return
      event.preventDefault()
      actions.go(m)
    })
    modeLinks.set(m, a)
    modes.grid.append(a)
  }

  const fields = make('div', css.fields)
  panel.append(fields)
  const field = (label: string, choices: { value: string; text: string }[], onChange: (value: string) => void): HTMLSelectElement => {
    const wrap = make('label', css.field)
    const select = make('select', css.select)
    for (const c of choices) {
      const option = make('option', undefined, c.text)
      option.value = c.value
      select.append(option)
    }
    select.addEventListener('change', () => onChange(select.value))
    wrap.append(make('span', css.label, label), select)
    fields.append(wrap)
    return select
  }
  const formatSelect = field(
    'Format',
    (Object.keys(config.formats) as FormatKey[]).map((key) => ({ value: config.formats[key].id, text: `${FORMAT_NAMES[key]} · ${config.formats[key].width} x ${config.formats[key].height}` })),
    (value) => actions.format(value),
  )
  const tierSelect = field(
    'Tier',
    tierIds.map((t) => ({ value: t, text: `${capital(t)} · ${samplesOf(t)} ${samplesOf(t) === 1 ? 'sample' : 'samples'}` })),
    (value) => {
      if (isTier(value)) actions.tier(value)
    },
  )
  const assetSelect = field(
    'Assets',
    Object.keys(config.assetSets).map((id) => ({ value: id, text: capital(id) })),
    (value) => {
      if (isAssetSet(value)) actions.assets(value)
    },
  )
  const diagSelect = field(
    'Diagnostic',
    diagNames.map((d) => ({ value: d, text: DIAG_NAMES[d] })),
    (value) => {
      if (isDiag(value)) actions.diag(value)
    },
  )

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
      for (const [id, b] of unitButtons) mark(b, id === state.unit)
      for (const k of keyButtons) mark(k.node, k.frame === state.frame)
      const held = state.world ?? FILM
      for (const [id, input] of worldInputs) input.checked = id === held
      for (const [m, a] of modeLinks) a.href = state.links[m]
      if (formatSelect.value !== state.format) formatSelect.value = state.format
      if (tierSelect.value !== state.tier) tierSelect.value = state.tier
      if (assetSelect.value !== state.assets) assetSelect.value = state.assets
      if (diagSelect.value !== state.diag) diagSelect.value = state.diag
    },
  }
}
