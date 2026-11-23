import { config } from '../config.ts'
import type { Film } from '../director/film.ts'
import { madeSoFar } from '../v2/counter.ts'
import css from './loading.module.css'

export interface Loading {
  // One of the film's own moments was drawn: `done` of `of`.
  step(done: number, of: number): void
  // Shows the screen again for a second preparation, at another quality.
  again(title: string): void
  done(): void
  fail(text: string): void
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
  const sceneCount = make('span', css.count, 'starting')
  sceneLine.append(sceneName, sceneCount)
  const sceneBar = make('div', css.bar)
  sceneBar.dataset.state = 'busy'
  sceneBar.append(make('i', css.fill))
  const warmLine = make('p', css.line)
  const warmName = make('span', css.what, 'Moments drawn once')
  const warmCount = make('span', css.count, 'waiting')
  warmLine.append(warmName, warmCount)
  const warmBar = make('div', css.bar)
  const warmFill = make('i', css.fill)
  warmBar.append(warmFill)
  const state = make('p', css.state, 'Loading')
  box.append(title, size, sceneLine, sceneBar, warmLine, warmBar, state)
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
  const sceneText = (): string => {
    const made = madeSoFar()
    return `${files} ${files === 1 ? 'file' : 'files'}, ${(bytes / 1048576).toFixed(1)} MB fetched, ${made.textures} textures${made.programs > 0 ? ` and ${made.programs} programs` : ''} made`
  }
  const timer = window.setInterval(() => {
    if (!sceneDone) sceneCount.textContent = sceneText()
  }, 100)
  const finishScene = () => {
    if (sceneDone) return
    sceneDone = true
    if (observer) seen(observer.takeRecords())
    sceneCount.textContent = `${sceneText()}, ${film.textureMb().toFixed(0)} MB on the graphics card`
    sceneBar.dataset.state = 'done'
  }
  void film.load().then(finishScene, () => undefined)

  return {
    step(done, of) {
      finishScene()
      warmCount.textContent = `${done} of ${of}`
      warmFill.style.setProperty('--at', String(done / of))
      state.textContent = done >= of ? 'Ready' : 'Getting ready'
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
      observer?.disconnect()
      finishScene()
      state.textContent = 'Ready'
      root.hidden = true
    },
    fail(text) {
      window.clearInterval(timer)
      observer?.disconnect()
      root.dataset.failed = 'yes'
      sceneBar.dataset.state = 'done'
      state.textContent = text
      root.hidden = false
    },
  }
}
