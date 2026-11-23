import { config } from '../config.ts'
import { warmFrames, type Film } from '../director/film.ts'
import { madeSoFar } from '../v2/counter.ts'
import css from './loading.module.css'

export interface Loading {
  // The scene's own loading. It starts once the screen has been painted, so the page never sits blank while the first part is built.
  loaded: Promise<void>
  // The film's programs are about to be built, which is the first thing `warm` does and can take a card a minute.
  // The line that says so is on the screen before the promise resolves, since a browser that builds programs in the page cannot paint until they are done.
  programs(): Promise<void>
  // A step of the film's warming is done: `done` of `of`. `next` is what runs now: a moment of the film, or the last pass over every shape.
  step(done: number, of: number, next: 'moment' | 'every shape' | null): void
  // Shows the screen again for a second preparation, at another quality.
  again(title: string): void
  // The machine is being timed at `quality`: `seconds` of `of` done, or null while the timing waits for the page to be in view.
  timing(quality: string, seconds: number | null, of: number): void
  script(quality: string, done: number, of: number): void
  done(): void
  fail(text: string): void
}

// What loading did and when, on the page's clock in milliseconds: every step, and every stretch longer than FREEZE_MS in which the page could not paint a frame.
// Only for measuring: no pixel depends on it.
export interface LoadingLog {
  // `scriptMs` is the page's own work in drawing a moment, apart from the graphics card.
  // `cost` is the film's own table of that moment, milliseconds by part, `wait` the graphics card.
  steps: { atMs: number; what: string; frame?: number; scriptMs?: number; cost?: Record<string, number>; programs?: number; beside?: boolean }[]
  freezes: { fromMs: number; ms: number }[]
  readyMs: number | null
}

const FREEZE_MS = 250
const frames = warmFrames()
// How far into the film a moment is, as a person reads it on a player.
const filmTime = (frame: number): string => {
  const seconds = Math.floor(frame / config.film.fps)
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}
const took = (ms: number): string => {
  const seconds = Math.round(ms / 1000)
  if (ms < 1000) return 'under a second'
  return seconds < 60 ? `${seconds} s` : `${Math.floor(seconds / 60)} min ${seconds % 60} s`
}
const momentText = (index: number): string => `Warming the film, ${index + 1} of ${frames.length}: the picture at ${filmTime(frames[index])}`
const warming = momentText(0)
const building = (name: string | undefined): string => (name ? `Building the ${name}` : 'Building the scene')

declare global {
  interface Window { loadingLog?: LoadingLog }
}

function make<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text !== undefined) node.textContent = text
  return node
}

// The loading screen. The scene's files are counted as the browser fetches them, then every moment the film is drawn at once counts as a step.
export function showLoading(host: HTMLElement, film: Film): Loading {
  const root = make('div', css.screen)
  root.setAttribute('role', 'status')
  const box = make('div', css.box)
  const title = make('h1', css.title, config.name)
  const size = make('p', css.size, `${film.format.width} x ${film.format.height}, ${config.film.fps} frames a second`)
  const sceneLine = make('p', css.line)
  const sceneName = make('span', css.what, 'Scene')
  const sceneFill = make('i', css.fill)
  const sceneCount = make('span', css.count, 'starting')
  sceneLine.append(sceneName, sceneCount)
  const sceneBar = make('div', css.bar)
  sceneBar.append(sceneFill)
  const warmLine = make('p', css.line)
  const warmName = make('span', css.what, 'Moments drawn once')
  const warmCount = make('span', css.count, 'waiting')
  warmCount.dataset.role = 'loading-warm'
  warmLine.append(warmName, warmCount)
  const warmBar = make('div', css.bar)
  const warmFill = make('i', css.fill)
  warmBar.append(warmFill)
  const timedLine = make('p', css.line)
  const timedCount = make('span', css.count, 'after that')
  timedCount.dataset.role = 'loading-timed'
  timedLine.append(make('span', css.what, 'This machine timed'), timedCount)
  const timedBar = make('div', css.bar)
  const timedFill = make('i', css.fill)
  timedBar.append(timedFill)
  const state = make('p', css.state, building(film.steps()[0]))
  state.dataset.role = 'loading-now'
  // Nothing here has a time limit: a slow machine takes longer and still gets there. The line says how long it has been and how long the last step took.
  const pace = make('p', css.pace, 'Just started')
  pace.dataset.role = 'loading-pace'
  const pulse = make('div', css.pulse)
  pulse.setAttribute('aria-hidden', 'true')
  pulse.append(make('i', css.runner))
  const steps = make('ol', css.steps)
  for (const [i, text] of ['Load the film', 'Drop the track', 'Check, then record'].entries()) {
    const item = make('li', css.step)
    item.dataset.state = i === 0 ? 'now' : 'wait'
    item.append(make('span', css.num, String(i + 1)), make('span', undefined, text), make('span', css.stepState, i === 0 ? 'Loading' : 'Next'))
    steps.append(item)
  }
  box.append(title, size, steps, sceneLine, sceneBar, warmLine, warmBar, timedLine, timedBar, state, pace, pulse)
  root.append(box)
  host.append(root)

  let files = 0
  let bytes = 0
  let sceneDone = false
  const seen = (list: PerformanceEntryList) => {
    for (const e of list) {
      const r = e as PerformanceResourceTiming
      if (!r.name.includes('/assets/')) continue
      files++
      bytes += r.encodedBodySize || r.transferSize || 0
    }
  }
  let observer: PerformanceObserver | null = null
  try {
    observer = new PerformanceObserver((list) => seen(list.getEntries()))
    observer.observe({ type: 'resource', buffered: true })
  } catch {}
  let part = ''
  const log: LoadingLog = { steps: [], freezes: [], readyMs: null }
  window.loadingLog = log
  if (!film.clock) film.clock = () => performance.now()
  let beat = performance.now()
  const sceneText = (): string => {
    const made = madeSoFar()
    return `${part}${files} ${files === 1 ? 'file' : 'files'}, ${(bytes / 1048576).toFixed(1)} MB fetched, ${made.textures} textures made`
  }
  let watching = true
  const watch = (now: number) => {
    if (now - beat > FREEZE_MS) log.freezes.push({ fromMs: Math.round(beat), ms: Math.round(now - beat) })
    beat = now
    if (watching) requestAnimationFrame(watch)
  }
  requestAnimationFrame(watch)
  let opened = performance.now()
  let stepAt = opened
  let lastStep = ''
  const paceText = (): string => `${took(performance.now() - opened)} so far${lastStep ? `, ${lastStep}` : ''}. No step has a time limit.`
  const stepped = (what: string): void => {
    const now = performance.now()
    lastStep = `${what} took ${took(now - stepAt)}`
    stepAt = now
    pace.textContent = paceText()
  }
  // The build of the programs, from the call until the film says it is done. `was` is what the film held before, since a second warming builds again.
  let build: { from: number; was: Film['built'] } | null = null
  let reason = ''
  const built = (): void => {
    if (!build || film.built === build.was || !film.built) return
    build = null
    log.steps.push({ atMs: Math.round(performance.now()), what: 'programs built', programs: film.built.programs, beside: film.built.beside })
    warmCount.textContent = `${film.built.programs} programs built`
    stepped('the programs')
  }
  const timer = window.setInterval(() => {
    if (!sceneDone) sceneCount.textContent = sceneText()
    built()
    if (build) warmCount.textContent = `building the programs, ${took(performance.now() - build.from)}`
    pace.textContent = paceText()
  }, 100)
  const finishScene = () => {
    if (sceneDone) return
    sceneDone = true
    if (observer) seen(observer.takeRecords())
    sceneCount.textContent = `${sceneText()}, ${film.textureMb().toFixed(0)} MB on the graphics card`
    sceneFill.style.setProperty('--at', '1')
    if (state.textContent?.startsWith('Building')) state.textContent = warming
  }
  const paint = (): Promise<void> =>
    new Promise<void>((resolve) => {
      let open = true
      const go = (): void => {
        if (!open) return
        open = false
        resolve()
      }
      window.setTimeout(go, 200)
      requestAnimationFrame(() => requestAnimationFrame(go))
    })
  const loaded = paint().then(() =>
    film.load((done, of, what, next) => {
      part = done < of ? `Part ${done} of ${of}, ${what}. ` : ''
      log.steps.push({ atMs: Math.round(performance.now()), what: `part ${done} of ${of}, ${what}` })
      sceneFill.style.setProperty('--at', String(done / of))
      state.textContent = next === null ? warming : building(next)
      sceneCount.textContent = sceneText()
      stepped(`the ${what}`)
    }),
  )
  loaded.then(finishScene, () => undefined)

  return {
    loaded,
    programs() {
      finishScene()
      const beside = film.stage.gl.getExtension('KHR_parallel_shader_compile') !== null
      const how = beside ? 'A graphics card takes from a few seconds to a minute over it' : 'This browser builds them in the page, so the page stands still until they are done, from a few seconds to a minute'
      state.textContent = `${reason ? `${reason}. Building its programs` : 'Building the programs of the film'}. ${how}`
      build = { from: performance.now(), was: film.built }
      stepAt = build.from
      warmCount.textContent = 'building the programs'
      log.steps.push({ atMs: Math.round(build.from), what: 'programs asked for', beside })
      return paint()
    },
    step(done, of, next) {
      finishScene()
      built()
      const moments = of - 1
      if (done === 0) log.steps.push({ atMs: Math.round(performance.now()), what: 'parts warmed' })
      else if (done <= moments) {
        const cost: Record<string, number> = {}
        for (const [key, ms] of Object.entries(film.cost)) cost[key] = Math.round(ms * 10) / 10
        log.steps.push({ atMs: Math.round(performance.now()), what: `moment ${done} of ${moments}`, frame: frames[done - 1], scriptMs: Math.round(film.cost.script ?? 0), cost })
      } else log.steps.push({ atMs: Math.round(performance.now()), what: 'every shape drawn once' })
      warmCount.textContent = `${Math.min(done, moments)} of ${moments}`
      warmFill.style.setProperty('--at', String(done / of))
      state.textContent = next === 'moment' ? momentText(done) : next === null ? 'Ready' : 'One last pass over the whole scene'
      if (done > 0) stepped(done <= moments ? `the picture at ${filmTime(frames[done - 1])}` : 'the last pass')
    },
    timing(quality, seconds, of) {
      const waits = seconds === null
      timedCount.textContent = waits ? 'waiting for the page to be in view' : `${Math.floor(seconds)} of ${of} s at ${quality} quality`
      timedFill.style.setProperty('--at', String(waits ? 0 : seconds / of))
      const text = waits ? 'The timing starts when this page is in view' : `Timing this machine at ${quality} quality: ${of} seconds of the film's hardest parts`
      if (state.textContent !== text) state.textContent = text
    },
    script(quality, done, of) {
      timedCount.textContent = `${done} of ${of} frames with nothing drawn`
      timedFill.style.setProperty('--at', String(done / of))
      const text = `${quality === 'high' ? 'High' : 'Low'} quality did not hold ${config.film.fps} frames a second here. Timing the page's own work alone, to see which half is slow`
      if (state.textContent !== text) state.textContent = text
    },
    again(text) {
      warmCount.textContent = 'waiting'
      warmFill.style.setProperty('--at', '0')
      timedCount.textContent = 'after that'
      timedFill.style.setProperty('--at', '0')
      state.textContent = text
      reason = text
      lastStep = ''
      opened = performance.now()
      stepAt = opened
      pace.textContent = paceText()
      delete root.dataset.failed
      root.hidden = false
    },
    done() {
      window.clearInterval(timer)
      watching = false
      log.readyMs = Math.round(performance.now())
      observer?.disconnect()
      finishScene()
      state.textContent = 'Ready'
      root.hidden = true
    },
    fail(text) {
      window.clearInterval(timer)
      watching = false
      observer?.disconnect()
      root.dataset.failed = 'yes'
      state.textContent = /context was lost/.test(text) ? `${text}. The browser took the graphics card away from the page. Reload the page to try again.` : text
      pace.textContent = `Stopped after ${took(performance.now() - opened)}${lastStep ? `, ${lastStep}` : ''}.`
      root.hidden = false
    },
  }
}
