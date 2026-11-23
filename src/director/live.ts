import { config, frameCount, type TierId } from '../config.ts'
import type { DiagName } from '../core/shading.ts'
import { makeClock, runFrom, type FilmClock, type Run } from '../player/clock.ts'
import { createDesk, type Advice } from '../player/desk.ts'
import type { Loading } from '../player/loading.ts'
import { reportText, type Report, type RunFacts } from '../player/pacing.ts'
import { filmPlan, play, type Playing } from '../player/play.ts'
import { check, pictureSize, record, type Deck, type Session } from '../player/session.ts'
import { EXPORT_NOTE, readTrack, trackLine, type Track } from '../player/track.ts'
import type { Quality } from '../v2/api.ts'
import { barAt, hitFrame } from '../v2/clock.ts'
import type { Film } from './film.ts'
import css from './live.module.css'
import { createMenu, MENU_MODES, type MenuMode } from './menu.ts'
import { clampAv, clampAzimuth, clampDolly, clampElevation, optionsFor, VIEW, writeOptions, type Options } from './modes.ts'
import { clampFrame, keys, segmentAt, segments } from './timeline.ts'

export type Activity = 'ready' | 'playing' | 'recording' | 'check' | 'warming'

export interface PlayerState {
  activity: Activity
  frame: number
  shown: number
  quality: Quality
  track: { name: string; sha256: string; matches: boolean } | null
  picture: { width: number; height: number; exact: boolean }
  report: Report | null
  advice: string | null
  error: string | null
  sky: string
  // Plays the frames from `first` to `last` against the clock, without a track unless one is loaded, and gives the run's report.
  range(first: number, last: number): Promise<Report | null>
}

declare global {
  interface Window { player?: PlayerState }
}

const IDLE_MS = 3000
const URL_MS = 300
const ORBIT_DEG_PER_PX = 0.25
const WHEEL_PER_PX = 0.0015
const LINE_PX = 16
const THUMB_PX = 3
const NUMBERED_BARS = 8
const TALL_BARS = 4

function make<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text !== undefined) node.textContent = text
  return node
}

function cardName(gl: WebGL2RenderingContext): string {
  const told = gl.getExtension('WEBGL_debug_renderer_info')
  const name: unknown = gl.getParameter(told ? told.UNMASKED_RENDERER_WEBGL : gl.RENDERER)
  return typeof name === 'string' && name ? name : 'not told'
}

function between(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value))
}

const REVIEW_KEYS = new Set([' ', 'ArrowLeft', 'ArrowRight', '[', ']'])

function clockText(seconds: number): string {
  const m = Math.floor(seconds / 60)
  return `${m}:${(seconds - m * 60).toFixed(2).padStart(5, '0')}`
}

// What the check says about this machine at this quality, and whether the lower quality is worth a try.
export function advise(report: Report, quality: Quality): Advice {
  if (!report.complete) return { text: 'The check was stopped before its end. Run it again.', tryLow: false }
  if (report.holds) return { text: `Record at ${quality} quality.`, tryLow: false }
  if (quality !== 'low') return { text: report.frames.skipped === 0 ? 'It nearly keeps up. Try low quality.' : 'Try low quality.', tryLow: true }
  if (report.frames.skipped === 0) return { text: 'It nearly keeps up at low quality. Record, and look at the report after it.', tryLow: false }
  return { text: 'A recording stays with the music and skips frames. The picture is never drawn smaller to keep up. The export makes a file with every frame at any speed.', tryLow: false }
}

export function startLive(film: Film, options: Options, host: HTMLElement, loading: Loading | null): void {
  const root = document.documentElement
  const stage = document.getElementById('stage') as HTMLElement
  const canvas = document.getElementById('film') as HTMLCanvasElement
  const curtain = document.getElementById('curtain') as HTMLElement
  const note = document.getElementById('note') as HTMLElement
  const fps = config.film.fps
  const lastFrame = frameCount - 1
  const tier: TierId = options.tier
  const review = options.mode === 'review'

  let frame = options.frame
  const view = { az: options.az, el: options.el, dolly: options.dolly }
  let diag: DiagName = options.diag
  let quality: Quality = film.quality ?? 'high'
  let av = options.av
  let marks = options.marks
  let track: Track | null = null

  let activity: Activity = 'ready'
  let version = 0
  let drawnVersion = -1
  let drawing: Promise<void> = Promise.resolve()
  let pumping = false
  let dead = false
  let playing: Playing | null = null
  let until = lastFrame
  let session: Session | null = null
  let seekTo: number | null = null
  let again = false

  const state: PlayerState = { activity, frame, shown: -1, quality, track: null, picture: { width: 0, height: 0, exact: false }, report: null, advice: null, error: null, sky: film.skyName, range }
  window.player = state
  window.showcase.pacing = () => playing?.soFar() ?? state.report

  let clockKey = ''
  let clockReady: Promise<FilmClock> | null = null
  function clockFor(): Promise<FilmClock> {
    const key = `${track?.sha256 ?? ''}|${av}|${marks}`
    if (clockReady && key === clockKey) return clockReady
    const old = clockReady
    const bytes = track?.bytes ?? null
    clockKey = key
    clockReady = (async () => {
      if (old) await old.then((c) => c.ctx.close(), () => undefined)
      return makeClock(bytes, { avMs: av, marks })
    })()
    clockReady.catch(() => undefined)
    return clockReady
  }

  const deck: Deck = {
    film,
    tier,
    root,
    stage,
    curtain,
    facts(kind, ctx): RunFacts {
      const box = canvas.getBoundingClientRect()
      const ratio = window.devicePixelRatio
      return {
        kind,
        quality,
        format: `${film.format.width} x ${film.format.height}`,
        tier,
        track: track ? { name: track.name, sha256: track.sha256, matches: track.matches } : null,
        avMs: av,
        marks,
        audio: { sampleRate: ctx.sampleRate, baseLatencyMs: Number((ctx.baseLatency * 1000).toFixed(2)), outputLatencyMs: Number(((ctx.outputLatency || 0) * 1000).toFixed(2)), stepMs: 0 },
        screen: { width: window.innerWidth, height: window.innerHeight, pixelRatio: ratio, fullScreen: document.fullscreenElement !== null, pictureWidth: Math.round(box.width * ratio), pictureHeight: Math.round(box.height * ratio) },
        browser: navigator.userAgent,
      }
    },
  }

  const menu = createMenu(host, {
    jump: (to) => seek(to, true),
    diag: (name) => {
      diag = name
      touch()
    },
    go: (mode) => {
      location.assign(linkTo(mode))
    },
    pacing: () => {
      const report = playing?.soFar() ?? state.report
      if (!report) return null
      const canvas = film.stage.canvas
      let exported: string | null = null
      try {
        exported = localStorage.getItem(EXPORT_NOTE)
      } catch {}
      return reportText(report, [`picture: ${canvas.width} x ${canvas.height}, sky ${film.skyName}`, `browser: ${navigator.userAgent}`, `graphics: ${cardName(film.stage.gl)}`, ...(exported ? [exported] : [])])
    },
  })

  const desk = createDesk(host, { quality, av, marks }, {
    track: (file) => void pick(file),
    record: () => void startRecord(),
    check: () => void startCheck(),
    quality: (q) => void setQuality(q, false),
    checkLow: () => void setQuality('low', true),
    av: (ms) => {
      av = clampAv(ms)
      syncUrl()
    },
    marks: (on) => {
      marks = on
      syncUrl()
    },
  })

  const bar = make('div', css.bar)
  bar.setAttribute('role', 'group')
  bar.setAttribute('aria-label', 'Timeline')
  const stepper = (text: string, label: string, act: () => void): HTMLButtonElement => {
    const b = make('button', css.step, text)
    b.type = 'button'
    b.setAttribute('aria-label', label)
    b.title = label
    b.addEventListener('click', act)
    return b
  }
  const playButton = make('button', css.play)
  playButton.type = 'button'
  playButton.append(make('span', css.icon))
  const steps = make('div', css.steps)
  steps.append(
    stepper('|‹', 'Back one bar', () => stepBar(-1)),
    stepper('‹', 'Back one frame', () => seek(frame - 1)),
    stepper('›', 'Forward one frame', () => seek(frame + 1)),
    stepper('›|', 'Forward one bar', () => stepBar(1)),
  )
  const trackBox = make('div', css.track)
  trackBox.style.setProperty('--thumb', `${THUMB_PX}px`)
  const strip = make('div', css.segments)
  strip.setAttribute('aria-hidden', 'true')
  const segmentNodes = segments.map((s) => {
    const node = make('span', css.segment)
    node.style.flexGrow = String(s.frames)
    node.title = `${s.name}, bars ${s.fromBar} to ${s.toBar}`
    if (s.toBar - s.fromBar >= 4) node.append(make('span', css.name, s.name))
    strip.append(node)
    return node
  })
  const played = make('div', css.played)
  const marksBox = make('div', css.marks)
  marksBox.setAttribute('aria-hidden', 'true')
  const place = (node: HTMLElement, at: number): HTMLElement => {
    node.style.setProperty('--at', String(between(at / lastFrame, 0, 1)))
    marksBox.append(node)
    return node
  }
  for (const k of keys) place(make('i', css.keyMark), k.frame)
  const firstBar = Math.ceil(barAt(0) - 1e-6)
  const lastBar = Math.floor(barAt(lastFrame / fps) + 1e-6)
  for (let b = firstBar; b <= lastBar; b++) {
    const at = hitFrame(b)
    const tick = place(make('i', css.tick), at)
    if ((b - 1) % TALL_BARS === 0) tick.dataset.tall = 'yes'
    if ((b - 1) % NUMBERED_BARS === 0) place(make('span', css.barNumber, String(b)), at)
  }
  const scrub = make('input', css.scrub)
  scrub.type = 'range'
  scrub.min = '0'
  scrub.max = String(lastFrame)
  scrub.step = '1'
  scrub.setAttribute('aria-label', 'Time')
  trackBox.append(strip, played, marksBox, scrub)
  const readout = make('div', css.readout)
  const seconds = make('span', css.seconds)
  const frameText = make('span', css.dim)
  const barText = make('span', css.dim)
  const sectionName = make('span', css.unit)
  readout.append(seconds, frameText, barText, sectionName)
  bar.append(playButton, steps, trackBox, readout)
  host.append(bar)

  function current(): Options {
    return { ...options, mode: review ? 'review' : 'live', frame, diag, quality: quality === 'high' && !options.quality ? null : quality, av, marks, az: clampAzimuth(view.az), el: clampElevation(view.el), dolly: clampDolly(view.dolly), hold: false, loop: false }
  }

  function linkTo(mode: MenuMode): string {
    const now = current()
    return `${location.pathname}${writeOptions(mode === 'live' ? now : optionsFor(mode, { ...now, mode: 'live' }))}`
  }

  let urlTimer = 0
  function syncUrl(): void {
    window.clearTimeout(urlTimer)
    urlTimer = window.setTimeout(() => {
      if (activity !== 'ready') return
      history.replaceState(history.state, '', `${linkTo('live')}${location.hash}`)
      syncMenu()
    }, URL_MS)
  }

  function syncMenu(): void {
    const links = {} as Record<MenuMode, string>
    for (const m of MENU_MODES) links[m] = linkTo(m)
    menu.update({ frame, unit: segmentAt(frame).id, diag, links })
    desk.exportLink(links.export)
  }

  let shownUnit = ''
  function syncBar(): void {
    const segment = segmentAt(frame)
    const time = frame / fps
    const barNow = barAt(time)
    const whole = Math.floor(barNow + 1e-6)
    const beat = Math.floor((barNow - whole) * config.music.beatsPerBar + 1e-6) + 1
    scrub.value = String(frame)
    scrub.setAttribute('aria-valuetext', `${time.toFixed(2)} seconds, ${segment.name}`)
    seconds.textContent = clockText(time)
    frameText.textContent = `frame ${frame}`
    barText.textContent = barNow >= 1 ? `bar ${whole}.${beat}` : 'before bar 1'
    sectionName.textContent = segment.name
    played.style.setProperty('--at', String(frame / lastFrame))
    if (segment.id !== shownUnit) {
      shownUnit = segment.id
      for (const [i, node] of segmentNodes.entries()) node.dataset.current = segments[i].id === segment.id ? 'yes' : 'no'
      if (activity === 'ready') syncMenu()
    }
    const on = activity === 'playing'
    playButton.setAttribute('aria-label', on ? 'Pause' : 'Play')
    playButton.dataset.playing = on ? 'yes' : 'no'
    state.frame = frame
  }

  function become(next: Activity, status: string): void {
    activity = next
    state.activity = next
    desk.status(status)
    desk.busy(next !== 'ready' && next !== 'playing')
    syncBar()
  }

  function applyView(): void {
    film.diag = diag
    film.view.azimuthDeg = view.az
    film.view.elevationDeg = view.el
    film.view.dolly = view.dolly
  }

  // A recording and a check show the film as it is: its own camera and its finished picture.
  function filmView(): void {
    film.diag = 'beauty'
    film.view.azimuthDeg = 0
    film.view.elevationDeg = 0
    film.view.dolly = 1
  }

  function fail(error: unknown): void {
    dead = true
    const text = error instanceof Error ? error.message : String(error)
    state.error = text
    note.textContent = `The film stopped drawing: ${text}. Reload the page to start again.`
    idle(false)
  }

  // While nothing runs, the frame under the playhead is drawn again whenever something about it changed.
  function pump(): Promise<void> {
    if (pumping || dead) return drawing
    pumping = true
    drawing = (async () => {
      try {
        while (drawnVersion !== version && activity === 'ready') {
          const v = version
          const f = frame
          applyView()
          await film.renderFrame(f, tier, true)
          state.shown = f
          drawnVersion = v
        }
      } catch (error) {
        fail(error)
      }
      pumping = false
    })()
    return drawing
  }

  function touch(): void {
    version++
    syncBar()
    syncUrl()
    if (activity === 'ready') void pump()
  }

  function seek(to: number, keepPlaying = false): void {
    const target = clampFrame(to)
    if (activity === 'playing') {
      seekTo = target
      again = keepPlaying
      playing?.stop()
      return
    }
    if (activity !== 'ready') return
    frame = target
    touch()
  }

  function stepBar(direction: number): void {
    const now = Math.floor(barAt(frame / fps) + 1e-6)
    let to = hitFrame(direction > 0 ? now + 1 : now)
    if (direction < 0 && to >= frame) to = hitFrame(now - 1)
    seek(to)
  }

  function resetView(): void {
    view.az = 0
    view.el = 0
    view.dolly = 1
    touch()
  }

  function show(report: Report, advice: Advice | null = null): void {
    state.report = report
    state.advice = advice?.text ?? null
    desk.report(report, advice)
  }

  async function startPlay(): Promise<void> {
    if (activity !== 'ready' || dead) return
    if (frame >= until) frame = 0
    become('playing', 'Playing')
    if (review) note.textContent = ''
    let run: Run | null = null
    try {
      const clock = await clockFor()
      await drawing
      applyView()
      const facts = deck.facts('play', clock.ctx)
      run = await runFrom(clock, frame / fps, true, av)
      playing = play({
        film,
        tier,
        plan: filmPlan(frame, until),
        time: run.time,
        facts: (stepMs) => ({ ...facts, audio: { ...facts.audio, stepMs: Number(stepMs.toFixed(2)) } }),
        tick(_seconds, cue) {
          if (performance.now() - stirred > IDLE_MS) idle(true)
          applyView()
          if (cue && cue.frame !== frame) {
            frame = cue.frame
            syncBar()
          }
        },
      })
      const report = await playing.finished
      state.shown = frame
      if (report.frames.drawn > 0) show(report)
    } catch (error) {
      fail(error)
    } finally {
      run?.stop()
      playing = null
      if (seekTo !== null) frame = seekTo
      seekTo = null
      const resume = again
      again = false
      become('ready', 'Ready')
      idle(false)
      touch()
      if (resume) void startPlay()
    }
  }

  async function range(first: number, last: number): Promise<Report | null> {
    if (activity !== 'ready' || dead) return null
    frame = Math.max(0, Math.min(lastFrame, Math.round(first)))
    until = Math.max(frame, Math.min(lastFrame, Math.round(last)))
    state.report = null
    try {
      await startPlay()
    } finally {
      until = lastFrame
    }
    return state.report
  }

  function togglePlay(): void {
    if (activity === 'playing') playing?.stop()
    else void startPlay()
  }

  async function startRecord(): Promise<void> {
    if (activity === 'playing') return
    if (activity !== 'ready' || dead) return
    become('recording', 'Recording')
    menu.toggle(false)
    try {
      const clock = clockFor()
      const settled = drawing.then(() => {
        filmView()
        return clock
      })
      session = record(deck, settled, marks)
      show(await session.finished)
    } catch (error) {
      note.textContent = `The recording did not start. ${error instanceof Error ? error.message : String(error)}`
    } finally {
      session = null
      become('ready', 'Ready')
      fit()
      touch()
    }
  }

  async function startCheck(): Promise<void> {
    if (activity !== 'ready' || dead) return
    become('check', 'Checking')
    menu.toggle(false)
    try {
      const clock = await clockFor()
      await drawing
      filmView()
      session = check(deck, clock)
      const report = await session.finished
      show(report, advise(report, quality))
    } catch (error) {
      note.textContent = `The check did not run. ${error instanceof Error ? error.message : String(error)}`
    } finally {
      session = null
      become('ready', 'Ready')
      touch()
    }
  }

  // Another quality is another set of programs: the film is made ready again before anything plays, with the track kept.
  async function setQuality(next: Quality, thenCheck: boolean): Promise<void> {
    if (activity !== 'ready' || dead) return
    if (next === quality) {
      if (thenCheck) void startCheck()
      return
    }
    become('warming', `Getting ready at ${next} quality`)
    try {
      await drawing
      loading?.again(`Getting ready at ${next} quality`)
      film.quality = next
      await film.warm(tier, loading?.step)
      quality = next
      state.quality = next
      desk.quality(next)
      loading?.done()
    } catch (error) {
      loading?.fail(`The film could not be made ready. ${error instanceof Error ? error.message : String(error)}`)
      dead = true
      return
    }
    become('ready', 'Ready')
    touch()
    if (thenCheck) void startCheck()
  }

  async function pick(file: File): Promise<void> {
    if (activity !== 'ready') return
    desk.track(track, `Reading ${file.name}`)
    try {
      const next = await readTrack(file)
      const before = track
      track = next
      try {
        await clockFor()
      } catch {
        track = before
        void clockFor()
        desk.track(track)
        note.textContent = `${file.name} could not be read as sound. Nothing changed.`
        return
      }
      note.textContent = review ? trackLine(next) : ''
      state.track = { name: next.name, sha256: next.sha256, matches: next.matches }
      desk.track(track)
    } catch (error) {
      desk.track(track)
      note.textContent = `${file.name} could not be read. ${error instanceof Error ? error.message : String(error)}`
    }
  }

  function fit(): void {
    const ratio = window.devicePixelRatio || 1
    const width = stage.clientWidth
    const height = stage.clientHeight
    const size = pictureSize(film.format, width, height, ratio, options.fill)
    const snap = (v: number): number => Math.round(v * ratio) / ratio
    canvas.style.width = `${size.width}px`
    canvas.style.height = `${size.height}px`
    canvas.style.left = `${snap((width - size.width) / 2)}px`
    canvas.style.top = `${snap((height - size.height) / 2)}px`
    const shownWidth = Math.round(size.width * ratio)
    const shownHeight = Math.round(size.height * ratio)
    state.picture = { width: shownWidth, height: shownHeight, exact: size.exact }
    const f = film.format
    desk.picture(
      size.exact
        ? `Picture ${f.width} x ${f.height}, one film pixel on one screen pixel.`
        : `Picture ${f.width} x ${f.height}, shown at ${shownWidth} x ${shownHeight} here to fit this ${Math.round(width * ratio)} x ${Math.round(height * ratio)} window. Nothing is stretched or cut.`,
    )
  }
  window.addEventListener('resize', fit)
  document.addEventListener('fullscreenchange', fit)

  const pointers = new Map<number, { x: number; y: number }>()
  let spread = 0
  const spreadNow = (): number => {
    const [a, b] = [...pointers.values()]
    return Math.hypot(a.x - b.x, a.y - b.y)
  }
  const release = (event: PointerEvent) => {
    if (!pointers.delete(event.pointerId)) return
    if (pointers.size === 0) delete canvas.dataset.drag
  }
  canvas.addEventListener('pointerdown', (event) => {
    if (review || (event.pointerType === 'mouse' && event.button !== 0)) return
    if (activity !== 'ready' && activity !== 'playing') return
    try {
      canvas.setPointerCapture(event.pointerId)
    } catch {}
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY })
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
      if (review) return
      event.preventDefault()
      const pixels = event.deltaMode === 1 ? event.deltaY * LINE_PX : event.deltaY
      view.dolly = between(view.dolly * Math.exp(pixels * WHEEL_PER_PX), VIEW.dollyMin, VIEW.dollyMax)
      touch()
    },
    { passive: false },
  )

  scrub.addEventListener('input', () => seek(Number(scrub.value)))
  playButton.addEventListener('click', togglePlay)

  let idleTimer = 0
  let stirred = performance.now()
  function idle(on: boolean): void {
    if (on) host.dataset.idle = 'yes'
    else delete host.dataset.idle
  }
  function stir(): void {
    stirred = performance.now()
    idle(false)
    window.clearTimeout(idleTimer)
    idleTimer = window.setTimeout(() => {
      if (activity === 'playing') idle(true)
      else stir()
    }, IDLE_MS)
  }
  for (const name of ['pointermove', 'pointerdown', 'wheel', 'keydown', 'focusin'] as const) window.addEventListener(name, stir, { passive: true, capture: true })

  window.addEventListener('keydown', (event) => {
    if (event.ctrlKey || event.metaKey || event.altKey) return
    const target = event.target
    const typing = target instanceof HTMLInputElement && (target.type === 'number' || target.type === 'text')
    const inField = typing || target instanceof HTMLSelectElement || (target instanceof HTMLInputElement && target.type === 'radio')
    const onButton = target instanceof HTMLButtonElement || target instanceof HTMLAnchorElement
    if (activity === 'recording' || activity === 'check') {
      if (event.key === 'Escape') session?.stop()
      event.preventDefault()
      return
    }
    if (typing) return
    if (review && !REVIEW_KEYS.has(event.key)) return
    switch (event.key) {
      case 'm':
      case 'M':
        event.preventDefault()
        menu.toggle()
        break
      case 'Escape':
        if (root.dataset.bare) delete root.dataset.bare
        else if (menu.open) menu.toggle(false)
        break
      case 'h':
      case 'H':
        event.preventDefault()
        if (root.dataset.bare) delete root.dataset.bare
        else root.dataset.bare = 'yes'
        break
      case 'r':
      case 'R':
        event.preventDefault()
        void startRecord()
        break
      case 'c':
      case 'C':
        event.preventDefault()
        void startCheck()
        break
      case '0':
        event.preventDefault()
        resetView()
        break
      case ' ':
        if (inField || onButton) return
        event.preventDefault()
        togglePlay()
        break
      case '[':
      case ']':
        event.preventDefault()
        stepBar(event.key === '[' ? -1 : 1)
        break
      case 'ArrowLeft':
      case 'ArrowRight': {
        if (inField) return
        event.preventDefault()
        const direction = event.key === 'ArrowLeft' ? -1 : 1
        if (event.shiftKey) stepBar(direction)
        else seek(frame + direction)
        break
      }
    }
  })

  desk.track(null)
  if (review) note.textContent = 'Space plays and pauses. Drop the track on the page to hear it.'
  fit()
  loading?.done()
  become('ready', 'Ready')
  syncMenu()
  stir()
  touch()
  void clockFor()
}
