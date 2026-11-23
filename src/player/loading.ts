import { config } from '../config.ts'
import { warmFrames, type Film } from '../director/film.ts'
import { madeSoFar } from '../v2/counter.ts'
import css from './loading.module.css'

export interface Loading {
  // The scene's own loading. It starts once the screen has been painted, so the page never sits blank while the first part is built.
  loaded: Promise<void>
  // One of the film's own moments was drawn: `done` of `of`.
  step(done: number, of: number): void
  // Shows the screen again for a second preparation, at another quality.
  again(title: string): void
  done(): void
  fail(text: string): void
}

// What loading did and when, on the page's clock in milliseconds: every step, and every stretch longer than FREEZE_MS in which the page could not paint a frame.
// Only for measuring: no pixel depends on it.
export interface LoadingLog {
  // `scriptMs` is the page's own work in drawing a moment, apart from the graphics card.
  steps: { atMs: number; what: string; scriptMs?: number }[]
  freezes: { fromMs: number; ms: number }[]
  readyMs: number | null
}

const FREEZE_MS = 250
const warming = `Warming the film, 1 of ${warmFrames().length}`
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
  warmLine.append(warmName, warmCount)
  const warmBar = make('div', css.bar)
  const warmFill = make('i', css.fill)
  warmBar.append(warmFill)
  const state = make('p', css.state, building(film.steps()[0]))
  state.dataset.role = 'loading-now'
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
  box.append(title, size, steps, sceneLine, sceneBar, warmLine, warmBar, state, pulse)
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
    return `${part}${files} ${files === 1 ? 'file' : 'files'}, ${(bytes / 1048576).toFixed(1)} MB fetched, ${made.textures} textures${made.programs > 0 ? ` and ${made.programs} programs` : ''} made`
  }
  let watching = true
  const watch = (now: number) => {
    if (now - beat > FREEZE_MS) log.freezes.push({ fromMs: Math.round(beat), ms: Math.round(now - beat) })
    beat = now
    if (watching) requestAnimationFrame(watch)
  }
  requestAnimationFrame(watch)
  const timer = window.setInterval(() => {
    if (!sceneDone) sceneCount.textContent = sceneText()
  }, 100)
  const finishScene = () => {
    if (sceneDone) return
    sceneDone = true
    if (observer) seen(observer.takeRecords())
    sceneCount.textContent = `${sceneText()}, ${film.textureMb().toFixed(0)} MB on the graphics card`
    sceneFill.style.setProperty('--at', '1')
    if (state.textContent?.startsWith('Building')) state.textContent = warming
  }
  const painted = new Promise<void>((resolve) => {
    let open = true
    const go = (): void => {
      if (!open) return
      open = false
      resolve()
    }
    window.setTimeout(go, 200)
    requestAnimationFrame(() => requestAnimationFrame(go))
  })
  const loaded = painted.then(() =>
    film.load((done, of, what, next) => {
      part = done < of ? `Part ${done} of ${of}, ${what}. ` : ''
      log.steps.push({ atMs: Math.round(performance.now()), what: `part ${done} of ${of}, ${what}` })
      sceneFill.style.setProperty('--at', String(done / of))
      state.textContent = next === null ? warming : building(next)
      sceneCount.textContent = sceneText()
    }),
  )
  loaded.then(finishScene, () => undefined)

  return {
    loaded,
    step(done, of) {
      finishScene()
      log.steps.push({ atMs: Math.round(performance.now()), what: `moment ${done} of ${of}`, scriptMs: Math.round(film.cost.script ?? 0) })
      warmCount.textContent = `${done} of ${of}`
      warmFill.style.setProperty('--at', String(done / of))
      state.textContent = done >= of ? 'Ready' : `Warming the film, ${done + 1} of ${of}`
    },
    again(text) {
      warmCount.textContent = 'waiting'
      warmFill.style.setProperty('--at', '0')
      state.textContent = text
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
      state.textContent = text
      root.hidden = false
    },
  }
}
