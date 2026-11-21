import { config, frameCount, type AssetSetId, type TierId } from '../config.ts'
import type { DiagName } from '../core/shading.ts'
import { formatById } from '../core/tiers.ts'
import type { Film } from './film.ts'
import css from './live.module.css'
import { createMenu, MENU_MODES, type MenuMode } from './menu.ts'
import { clampAzimuth, clampDolly, clampElevation, optionsFor, VIEW, writeOptions, type Options } from './modes.ts'
import { clampFrame, cuts, keys, segmentAt, segments } from './timeline.ts'

export interface LiveState { frame: number; shown: number; tier: TierId | null; playing: boolean; busy: boolean; error: string | null }

declare global {
  interface Window { live?: LiveState }
}

const REST_MS = 400
const IDLE_MS = 3000
const URL_MS = 300
const TURN_MS = 100
const ORBIT_DEG_PER_PX = 0.25
const WHEEL_PER_PX = 0.0015
const LINE_PX = 16
const THUMB_PX = 3
const SHIFT_STEP = 10

function make<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text !== undefined) node.textContent = text
  return node
}

function between(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value))
}

export function startLive(film: Film, options: Options, host: HTMLElement): void {
  const canvas = document.getElementById('film') as HTMLCanvasElement
  const note = document.getElementById('note') as HTMLElement
  const fps = config.film.fps
  const lastFrame = frameCount - 1

  let frame = options.frame
  const view = { az: options.az, el: options.el, dolly: options.dolly, world: options.world }
  let formatId = options.format.id
  let assets: AssetSetId = options.assets
  let diag: DiagName = options.diag
  let tier: TierId = options.chosen.tier ? options.tier : 'review'
  const chosen = { ...options.chosen }

  let version = 0
  let drawnVersion = -1
  let refined = false
  let running = false
  let dead = false
  let playing = false
  let playFrom = 0
  let playOrigin = 0
  let holding = 0
  let restAt = 0
  let wake: (() => void) | null = null

  const state: LiveState = { frame, shown: -1, tier: null, playing: false, busy: true, error: null }
  window.live = state

  const menu = createMenu(host, {
    jump: (to) => seek(to, true),
    hold: (world) => {
      view.world = world
      touch()
    },
    format: (id) => {
      formatId = formatById(id).id
      chosen.format = true
      touch()
    },
    tier: (next) => {
      tier = next
      chosen.tier = true
      refined = false
      touch()
    },
    assets: (set) => {
      assets = set
      chosen.assets = true
      touch()
    },
    diag: (name) => {
      diag = name
      touch()
    },
    go: (mode) => {
      location.assign(linkTo(mode))
    },
  })

  const bar = make('div', css.bar)
  bar.setAttribute('role', 'group')
  bar.setAttribute('aria-label', 'Timeline')
  const play = make('button', css.play)
  play.type = 'button'
  play.append(make('span', css.icon))
  const track = make('div', css.track)
  track.style.setProperty('--thumb', `${THUMB_PX}px`)
  const strip = make('div', css.segments)
  strip.setAttribute('aria-hidden', 'true')
  const segmentNodes = segments.map((s) => {
    const node = make('span', css.segment)
    node.style.flexGrow = String(s.frames)
    node.append(make('span', css.name, s.id))
    strip.append(node)
    return node
  })
  const played = make('div', css.played)
  const marks = make('div', css.marks)
  marks.setAttribute('aria-hidden', 'true')
  const place = (node: HTMLElement, at: number) => {
    node.style.setProperty('--at', String(at / lastFrame))
    marks.append(node)
  }
  for (const c of cuts) place(make('i', css.cut), c.frame)
  for (const k of keys) place(make('i', css.keyMark), k.frame)
  const scrub = make('input', css.scrub)
  scrub.type = 'range'
  scrub.min = '0'
  scrub.max = String(lastFrame)
  scrub.step = '1'
  scrub.setAttribute('aria-label', 'Time')
  track.append(strip, played, marks, scrub)
  const readout = make('div', css.readout)
  const seconds = make('span', css.seconds)
  const unitName = make('span', css.unit)
  const dot = make('span', css.dot)
  dot.setAttribute('aria-hidden', 'true')
  readout.append(seconds, unitName, dot)
  bar.append(play, track, readout)
  host.append(bar)

  function current(): Options {
    return {
      ...options,
      mode: 'live',
      format: formatById(formatId),
      tier: chosen.tier ? tier : options.tier,
      assets,
      frame,
      diag,
      world: view.world,
      az: clampAzimuth(view.az),
      el: clampElevation(view.el),
      dolly: clampDolly(view.dolly),
      hold: false,
      loop: false,
      chosen: { ...chosen },
    }
  }

  function linkTo(mode: MenuMode): string {
    const now = current()
    return `${location.pathname}${writeOptions(mode === 'live' ? now : optionsFor(mode, now))}`
  }

  let urlTimer = 0
  function syncUrl(): void {
    window.clearTimeout(urlTimer)
    urlTimer = window.setTimeout(() => {
      if (playing) return
      history.replaceState(history.state, '', `${linkTo('live')}${location.hash}`)
      syncMenu()
    }, URL_MS)
  }

  function syncMenu(): void {
    const links = {} as Record<MenuMode, string>
    for (const m of MENU_MODES) links[m] = linkTo(m)
    menu.update({ frame, unit: segmentAt(frame).id, world: view.world, format: formatId, tier, assets, diag, links })
  }

  let shownUnit = ''
  function syncBar(): void {
    const segment = segmentAt(frame)
    const time = `${(frame / fps).toFixed(2)} s`
    scrub.value = String(frame)
    scrub.setAttribute('aria-valuetext', `${time}, ${segment.id}`)
    seconds.textContent = time
    unitName.textContent = segment.id
    played.style.setProperty('--at', String(frame / lastFrame))
    if (segment.id !== shownUnit) {
      shownUnit = segment.id
      for (const [i, node] of segmentNodes.entries()) node.dataset.current = segments[i].id === segment.id ? 'yes' : 'no'
      syncMenu()
    }
    play.setAttribute('aria-label', playing ? 'Pause' : 'Play')
    play.dataset.playing = playing ? 'yes' : 'no'
    state.frame = frame
    state.playing = playing
  }

  function setBusy(busy: boolean): void {
    state.busy = busy
    bar.dataset.busy = busy ? 'yes' : 'no'
  }

  function rest(): void {
    restAt = performance.now() + REST_MS
  }

  // Something about the picture changed: draw it again, and let the address follow.
  function touch(): void {
    version++
    rest()
    setBusy(true)
    syncBar()
    syncMenu()
    syncUrl()
    const w = wake
    wake = null
    if (w) w()
    void pump()
  }

  function seek(to: number, keepPlaying = false): void {
    frame = clampFrame(to)
    if (playing) {
      if (keepPlaying) {
        playFrom = frame
        playOrigin = performance.now()
      } else setPlaying(false)
    }
    touch()
  }

  function setPlaying(on: boolean): void {
    if (on === playing) return
    playing = on
    if (on) {
      if (frame >= lastFrame) frame = 0
      playFrom = frame
      playOrigin = performance.now()
    }
    idle(false)
    touch()
  }

  function resetView(): void {
    view.az = 0
    view.el = 0
    view.dolly = 1
    touch()
  }

  function pause(ms: number): Promise<void> {
    return new Promise((resolve) => {
      let settled = false
      const done = () => {
        if (settled) return
        settled = true
        if (wake === done) wake = null
        resolve()
      }
      wake = done
      window.setTimeout(done, ms)
    })
  }

  // The next look at the clock while playing. Nothing is drawn inside the callback.
  function turn(): Promise<void> {
    return new Promise((resolve) => {
      let settled = false
      const done = () => {
        if (settled) return
        settled = true
        resolve()
      }
      requestAnimationFrame(done)
      window.setTimeout(done, TURN_MS)
    })
  }

  function fail(error: unknown): void {
    dead = true
    playing = false
    const text = error instanceof Error ? error.message : String(error)
    state.error = text
    note.textContent = `The film stopped drawing: ${text}. Reload the page to start again.`
    setBusy(false)
    syncBar()
    idle(false)
  }

  async function settle(): Promise<void> {
    if (film.format.id !== formatId) await film.setFormat(formatById(formatId))
    if (film.assets.set !== assets) {
      const before = film.assets.set
      try {
        await film.setAssets(assets)
      } catch (error) {
        note.textContent = `The ${assets} asset set could not load: ${error instanceof Error ? error.message : String(error)}. The ${before} set is back.`
        assets = before
        await film.setAssets(before)
        syncMenu()
        syncUrl()
      }
    }
    film.diag = diag
    film.view.azimuthDeg = view.az
    film.view.elevationDeg = view.el
    film.view.dolly = view.dolly
    film.view.world = view.world
  }

  async function draw(wanted: TierId): Promise<boolean> {
    const v = version
    const f = frame
    await settle()
    await film.renderFrame(f, wanted, true)
    state.shown = f
    state.tier = wanted
    if (v !== version) return false
    drawnVersion = v
    return true
  }

  // One frame at a time, always to the end: a frame that started is finished, then the newest one wanted is drawn.
  async function pump(): Promise<void> {
    if (running || dead) return
    running = true
    try {
      for (;;) {
        if (playing) {
          const due = playFrom + Math.floor(((performance.now() - playOrigin) / 1000) * fps)
          const next = Math.min(lastFrame, due)
          if (next >= lastFrame) {
            playing = false
            rest()
            idle(false)
            syncUrl()
          }
          if (next !== frame) {
            frame = next
            version++
          }
          syncBar()
        }
        if (drawnVersion !== version) {
          await draw('draft')
          refined = tier === 'draft'
          continue
        }
        if (playing) {
          await turn()
          continue
        }
        if (!refined) {
          const wait = restAt - performance.now()
          if (holding > 0 || wait > 0) {
            await pause(holding > 0 ? REST_MS : wait)
            continue
          }
          if (await draw(tier)) refined = true
          continue
        }
        break
      }
      setBusy(false)
    } catch (error) {
      fail(error)
    }
    running = false
    if (!dead && (drawnVersion !== version || !refined)) void pump()
  }

  const pointers = new Map<number, { x: number; y: number }>()
  let spread = 0
  const spreadNow = (): number => {
    const [a, b] = [...pointers.values()]
    return Math.hypot(a.x - b.x, a.y - b.y)
  }
  const release = (event: PointerEvent) => {
    if (!pointers.delete(event.pointerId)) return
    holding = Math.max(0, holding - 1)
    if (pointers.size === 0) delete canvas.dataset.drag
    rest()
  }
  canvas.addEventListener('pointerdown', (event) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return
    try {
      canvas.setPointerCapture(event.pointerId)
    } catch {}
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY })
    holding++
    canvas.dataset.drag = 'yes'
    if (pointers.size === 2) spread = spreadNow()
  })
  canvas.addEventListener('pointermove', (event) => {
    const p = pointers.get(event.pointerId)
    if (!p) return
    const dx = event.clientX - p.x
    const dy = event.clientY - p.y
    p.x = event.clientX
    p.y = event.clientY
    if (pointers.size === 1) {
      if (dx === 0 && dy === 0) return
      view.az -= dx * ORBIT_DEG_PER_PX
      view.el = between(view.el + dy * ORBIT_DEG_PER_PX, VIEW.elevationMinDeg, VIEW.elevationMaxDeg)
      touch()
    } else if (pointers.size === 2) {
      const now = spreadNow()
      if (spread > 0 && now > 0) {
        view.dolly = between((view.dolly * spread) / now, VIEW.dollyMin, VIEW.dollyMax)
        touch()
      }
      spread = now
    }
  })
  canvas.addEventListener('pointerup', release)
  canvas.addEventListener('pointercancel', release)
  canvas.addEventListener('lostpointercapture', release)
  canvas.addEventListener('dblclick', resetView)
  canvas.addEventListener(
    'wheel',
    (event) => {
      event.preventDefault()
      const pixels = event.deltaMode === 1 ? event.deltaY * LINE_PX : event.deltaY
      view.dolly = between(view.dolly * Math.exp(pixels * WHEEL_PER_PX), VIEW.dollyMin, VIEW.dollyMax)
      touch()
    },
    { passive: false },
  )

  let scrubbing = false
  const scrubEnd = () => {
    if (!scrubbing) return
    scrubbing = false
    holding = Math.max(0, holding - 1)
    rest()
  }
  scrub.addEventListener('pointerdown', () => {
    if (scrubbing) return
    scrubbing = true
    holding++
  })
  window.addEventListener('pointerup', scrubEnd, true)
  window.addEventListener('pointercancel', scrubEnd, true)
  scrub.addEventListener('change', scrubEnd)
  scrub.addEventListener('input', () => seek(Number(scrub.value)))
  play.addEventListener('click', () => setPlaying(!playing))

  let idleTimer = 0
  function idle(on: boolean): void {
    if (on) host.dataset.idle = 'yes'
    else delete host.dataset.idle
  }
  function stir(): void {
    idle(false)
    window.clearTimeout(idleTimer)
    idleTimer = window.setTimeout(() => {
      if (playing) idle(true)
      else stir()
    }, IDLE_MS)
  }
  for (const name of ['pointermove', 'pointerdown', 'wheel', 'keydown', 'focusin'] as const) window.addEventListener(name, stir, { passive: true, capture: true })

  window.addEventListener('keydown', (event) => {
    if (event.ctrlKey || event.metaKey || event.altKey) return
    const target = event.target
    const inField = target instanceof HTMLSelectElement || (target instanceof HTMLInputElement && target.type === 'radio')
    const onButton = target instanceof HTMLButtonElement || target instanceof HTMLAnchorElement
    switch (event.key) {
      case 'm':
      case 'M':
        event.preventDefault()
        menu.toggle()
        break
      case 'Escape':
        if (menu.open) menu.toggle(false)
        break
      case '0':
        event.preventDefault()
        resetView()
        break
      case ' ':
        if (inField || onButton) return
        event.preventDefault()
        setPlaying(!playing)
        break
      case 'ArrowLeft':
      case 'ArrowRight': {
        if (inField) return
        event.preventDefault()
        const step = (event.key === 'ArrowLeft' ? -1 : 1) * (event.shiftKey ? SHIFT_STEP : 1)
        seek(frame + step)
        break
      }
    }
  })

  film.view.azimuthDeg = view.az
  film.view.elevationDeg = view.el
  film.view.dolly = view.dolly
  film.view.world = view.world
  syncBar()
  syncMenu()
  stir()
  void pump()
}
