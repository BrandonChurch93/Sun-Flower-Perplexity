import { config } from '../config.ts'
import type { Quality } from '../v2/api.ts'
import css from './desk.module.css'
import { LEAD_SECONDS, SETTLE_SECONDS, TAIL_SECONDS } from './clock.ts'
import { GAP_MS, reportFile, reportName, type Report } from './pacing.ts'
import { fileOf, trackLine, type Track } from './track.ts'

export interface DeskActions {
  track(file: File): void
  record(): void
  check(): void
  measure(): void
  quality(quality: Quality): void
  checkLow(): void
  av(ms: number): void
  marks(on: boolean): void
}

export interface Desk {
  status(text: string): void
  track(track: Track | null, reading?: string): void
  picture(text: string): void
  quality(quality: Quality): void
  report(report: Report | null, advice?: Advice | null): void
  busy(on: boolean): void
  exportLink(href: string): void
}

export interface Advice { text: string; tryLow: boolean }

const KIND = { recording: 'Recording', check: 'Check', play: 'Playback', measure: 'Pacing report', timing: 'Timed at loading' } as const
const SHOWN_GAPS = 4

function make<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text !== undefined) node.textContent = text
  return node
}

const ms = (v: number): string => (v >= 1000 ? `${(v / 1000).toFixed(2)} s` : `${v.toFixed(1)} ms`)
const at = (seconds: number): string => `${seconds.toFixed(2)} s`

export function createDesk(host: HTMLElement, start: { quality: Quality; av: number; marks: boolean }, actions: DeskActions): Desk {
  const panel = make('section', css.panel)
  panel.setAttribute('aria-label', 'Player')
  const head = make('div', css.head)
  head.append(make('h1', css.title, config.name))
  const status = make('p', css.status, 'Ready')
  status.setAttribute('role', 'status')
  head.append(status)
  panel.append(head)

  const group = (title: string): HTMLElement => {
    const wrap = make('div', css.group)
    wrap.append(make('h2', css.heading, title))
    panel.append(wrap)
    return wrap
  }
  type StepState = 'wait' | 'now' | 'done' | 'warn'
  interface Step { body: HTMLElement; set(state: StepState, text: string): void }
  const step = (number: number, title: string): Step => {
    const wrap = make('div', css.step)
    const top = make('div', css.stepHead)
    const chip = make('span', css.stepState)
    top.append(make('span', css.num, String(number)), make('h2', css.stepTitle, title), chip)
    wrap.append(top)
    panel.append(wrap)
    return {
      body: wrap,
      set(state, text) {
        wrap.dataset.state = state
        chip.textContent = text
      },
    }
  }
  const button = (text: string, key: string | null, primary = false): HTMLButtonElement => {
    const b = make('button', css.button)
    b.type = 'button'
    if (primary) b.dataset.primary = 'yes'
    b.append(make('span', undefined, text))
    if (key) b.append(make('kbd', css.key, key))
    return b
  }

  const loadStep = step(1, 'Load the film')
  loadStep.set('done', 'Done')
  const pictureText = make('p', css.small)
  loadStep.body.append(pictureText)

  const trackStep = step(2, 'Drop the track')
  trackStep.set('now', 'Waiting for the file')
  const drop = make('div', css.drop)
  const choose = button('Choose the track', null)
  const input = make('input', css.file)
  input.type = 'file'
  input.accept = 'audio/*,.mp3,.wav,.flac,.m4a,.ogg'
  input.setAttribute('aria-label', 'Track file')
  const dropHint = make('span', css.hint, 'or drop it anywhere on the page')
  drop.append(choose, dropHint, input)
  const trackText = make('p', css.text)
  trackStep.body.append(drop, trackText)
  choose.addEventListener('click', () => input.click())
  input.addEventListener('change', () => {
    const file = fileOf(input.files)
    if (file) actions.track(file)
    input.value = ''
  })

  const goStep = step(3, 'Check, then record')
  goStep.set('wait', 'Not checked yet')
  const check = button('Check this machine', 'C')
  check.addEventListener('click', () => actions.check())
  const checkText = make('p', css.small, 'Twenty seconds of the hardest parts of the film, without sound. It says whether this machine keeps up.')
  const adviceText = make('p', css.advice)
  adviceText.hidden = true
  const tryLow = button('Check at low quality', null)
  tryLow.hidden = true
  tryLow.addEventListener('click', () => actions.checkLow())
  const record = button('Record', 'R', true)
  record.addEventListener('click', () => actions.record())
  const recordText = make('p', css.small, `Start the screen recorder first, then press Record. The page goes full screen: ${SETTLE_SECONDS + LEAD_SECONDS} seconds of dark, the film, ${TAIL_SECONDS} seconds of dark. Esc stops it.`)
  const measure = button('Pacing report', 'P')
  measure.dataset.role = 'measure'
  measure.addEventListener('click', () => actions.measure())
  const measureText = make('p', css.small, 'Once on this machine: the whole film plays without sound, then every frame is set with nothing drawn. A few minutes. The result opens as one page to copy and send. Esc stops it.')
  goStep.body.append(check, checkText, adviceText, tryLow, record, recordText, measure, measureText)

  const more = make('details', css.more)
  more.append(make('summary', css.summary, 'More settings'))
  const qualityRow = make('div', css.row)
  qualityRow.setAttribute('role', 'radiogroup')
  qualityRow.setAttribute('aria-label', 'Quality')
  qualityRow.append(make('span', css.label, 'Quality'))
  const qualities = new Map<Quality, HTMLInputElement>()
  for (const q of ['high', 'low'] as const) {
    const label = make('label', css.choice)
    const radio = make('input', css.radio)
    radio.type = 'radio'
    radio.name = 'desk-quality'
    radio.value = q
    radio.checked = q === start.quality
    radio.addEventListener('change', () => {
      if (radio.checked) actions.quality(q)
    })
    label.append(radio, make('span', css.chip, q === 'high' ? 'High' : 'Low'))
    qualities.set(q, radio)
    qualityRow.append(label)
  }
  const marksLabel = make('label', css.check)
  const marks = make('input')
  marks.type = 'checkbox'
  marks.checked = start.marks
  marks.addEventListener('change', () => actions.marks(marks.checked))
  marksLabel.append(marks, make('span', undefined, 'Test take: a white flash and a beep in the dark before and after the film'))
  const avLabel = make('label', css.number)
  const av = make('input', css.input)
  av.type = 'number'
  av.step = '1'
  av.value = String(start.av)
  av.addEventListener('change', () => actions.av(Number(av.value)))
  avLabel.append(make('span', undefined, 'Show the picture later by'), av, make('span', undefined, 'ms'))
  more.append(qualityRow, marksLabel, avLabel)
  if (start.marks || start.av !== 0 || start.quality !== 'high') more.open = true
  panel.append(more)

  const reportGroup = group('Report')
  const reportBody = make('div', css.report)
  reportBody.append(make('p', css.small, 'Every run leaves its report here.'))
  reportGroup.append(reportBody)

  const foot = make('div', css.foot)
  const exportLink = make('a', css.link, 'Export the film to a file')
  exportLink.href = '?mode=export'
  foot.append(exportLink)
  panel.append(foot)
  host.append(panel)

  const veil = make('div', css.veil, 'Drop the track')
  veil.hidden = true
  host.append(veil)
  let depth = 0
  const hasFiles = (event: DragEvent): boolean => Array.from(event.dataTransfer?.types ?? []).includes('Files')
  window.addEventListener('dragenter', (event) => {
    if (!hasFiles(event)) return
    event.preventDefault()
    depth++
    veil.hidden = false
  })
  window.addEventListener('dragover', (event) => {
    if (hasFiles(event)) event.preventDefault()
  })
  window.addEventListener('dragleave', () => {
    depth = Math.max(0, depth - 1)
    if (depth === 0) veil.hidden = true
  })
  window.addEventListener('drop', (event) => {
    event.preventDefault()
    depth = 0
    veil.hidden = true
    const file = fileOf(event.dataTransfer?.files)
    if (file) actions.track(file)
  })

  let url = ''
  let checkedAt: string | null = null
  const line = (name: string, value: string): HTMLElement => {
    const p = make('p', css.fact)
    p.append(make('span', css.label, name), make('span', css.value, value))
    return p
  }

  return {
    status(text) {
      status.textContent = text
    },
    track(track, reading) {
      trackText.textContent = reading ?? trackLine(track)
      trackText.dataset.state = reading ? 'reading' : !track ? 'none' : track.matches ? 'match' : 'other'
      trackText.title = track && !reading ? `${track.megabytes.toFixed(1)} MB, kept in this page only` : ''
      choose.firstElementChild!.textContent = track ? 'Choose another file' : 'Choose the track'
      if (reading) trackStep.set('now', 'Reading')
      else if (!track) trackStep.set('now', 'Waiting for the file')
      else if (track.matches) trackStep.set('done', 'Done')
      else trackStep.set('warn', 'Another file')
      if (track && !reading && goStep.body.dataset.state === 'wait') goStep.set('now', 'Not checked yet')
    },
    picture(text) {
      pictureText.textContent = text
    },
    quality(quality) {
      for (const [q, radio] of qualities) radio.checked = q === quality
      if (quality !== checkedAt) goStep.set('now', `Not checked at ${quality} quality`)
    },
    report(report, advice) {
      if (url) URL.revokeObjectURL(url)
      url = ''
      adviceText.hidden = !advice
      checkText.hidden = !!advice
      adviceText.textContent = advice?.text ?? ''
      tryLow.hidden = !advice?.tryLow
      reportBody.replaceChildren()
      if (!report) {
        reportBody.append(make('p', css.small, 'Every run leaves its report here.'))
        return
      }
      const f = report.frames
      reportBody.dataset.holds = report.holds ? 'yes' : 'no'
      url = URL.createObjectURL(reportFile(report))
      const link = make('a', css.link, 'Download the report')
      link.href = url
      link.download = reportName(report)
      link.dataset.report = 'yes'
      const top = make('div', css.top)
      top.append(make('p', css.kind, `${KIND[report.kind]}, ${report.quality} quality, ${report.track ? report.track.name : 'no track'}`), link)
      reportBody.append(top)
      reportBody.append(make('p', css.verdict, report.verdict))
      if ((report.kind === 'check' || report.kind === 'timing') && report.complete) {
        checkedAt = report.quality
        if (report.holds) goStep.set('done', 'Checked: ready to record')
        else goStep.set('warn', 'Checked: does not keep up')
      }
      reportBody.append(
        line('Frames', `${f.due} due, ${f.drawn} drawn, ${f.skipped} skipped, ${f.late} shown late`),
        line('Time', `${report.seconds.film.toFixed(2)} s of picture in ${report.seconds.audio.toFixed(2)} s of the audio clock`),
        line('Between frames', `longest ${ms(report.gapMs.longest)} at ${at(report.gapMs.longestAtFilm)}, 99th percentile ${ms(report.gapMs.p99)}, mean ${ms(report.gapMs.mean)}`),
        line('Picture behind sound', `when chosen mean ${ms(report.pickedMs.mean)}, largest ${ms(report.pickedMs.largest)}. When drawn mean ${ms(report.behindMs.mean)}, largest ${ms(report.behindMs.largest)} at ${at(report.behindMs.largestAtFilm)}`),
        line('Drawing a frame', `mean ${ms(report.drawMs.mean)}, 99th percentile ${ms(report.drawMs.p99)}. Of that the page's own work mean ${ms(report.scriptMs.mean)}, longest ${ms(report.scriptMs.longest)}, and the wait for the picture mean ${ms(report.cardMs.mean)}`),
        line('Graphics card', `${report.madeAtFilm.length ? `made something new in ${report.madeAtFilm.length} ${report.madeAtFilm.length === 1 ? 'frame' : 'frames'}, first at ${at(report.madeAtFilm[0])}` : 'nothing new made'}. A frame writes ${report.writes.mean.toFixed(0)} times into storage that exists, ${report.writes.mbMean.toFixed(1)} MB`),
      )
      const gaps = report.gaps
      const list = make('p', css.fact)
      list.append(make('span', css.label, `Gaps over ${GAP_MS} ms`))
      const shown = gaps.slice(0, SHOWN_GAPS).map((g) => `${ms(g.gapMs)} at ${at(g.film)}${g.atEnd ? ' to the end' : ''}`)
      const more = gaps.length > SHOWN_GAPS ? `, and ${gaps.length - SHOWN_GAPS} more in the file` : ''
      list.append(make('span', css.value, gaps.length ? `${gaps.length}: ${shown.join(', ')}${more}` : 'none'))
      reportBody.append(list)
      reportGroup.scrollIntoView({ block: 'start' })
    },
    busy(on) {
      for (const b of [choose, record, check, tryLow, measure]) b.disabled = on
      for (const radio of qualities.values()) radio.disabled = on
      marks.disabled = on
      av.disabled = on
    },
    exportLink(href) {
      exportLink.href = href
    },
  }
}
