import { ArrayBufferTarget, Muxer } from 'mp4-muxer'
import { config, frameCount, type AssetSetId, type Format, type TierId } from '../config.ts'
import { samplesOf, tierIds } from '../core/tiers.ts'
import { breathe } from '../core/yield.ts'
import type { Film } from '../director/film.ts'
import type { Options } from '../director/modes.ts'
import { keys, segmentAt, segmentById, segments } from '../director/timeline.ts'
import css from './export.module.css'

export interface ExportResult { ok: boolean; frames: number; fileName: string; codec: string; seconds: number; error: string | null }
export interface ExportProgress { done: number; total: number; textureMb: number }

declare global {
  interface Window {
    exportResult?: ExportResult
    exportProgress?: ExportProgress
  }
}

type Container = 'avc' | 'vp9' | 'av1'
interface Picked { container: Container; codec: string; label: string; encoder: VideoEncoderConfig }
interface Level { id: number; name: string; frameSize: number; rate: number; kbps: number }

// H.264 levels: largest frame in macroblocks, macroblocks a second, and the bitrate ceiling of the Baseline and Main profiles.
const AVC_LEVELS: Level[] = [
  { id: 0x1e, name: '3', frameSize: 1620, rate: 40500, kbps: 10000 },
  { id: 0x1f, name: '3.1', frameSize: 3600, rate: 108000, kbps: 14000 },
  { id: 0x20, name: '3.2', frameSize: 5120, rate: 216000, kbps: 20000 },
  { id: 0x28, name: '4', frameSize: 8192, rate: 245760, kbps: 20000 },
  { id: 0x29, name: '4.1', frameSize: 8192, rate: 245760, kbps: 50000 },
  { id: 0x2a, name: '4.2', frameSize: 8704, rate: 522240, kbps: 50000 },
  { id: 0x32, name: '5', frameSize: 22080, rate: 589824, kbps: 135000 },
  { id: 0x33, name: '5.1', frameSize: 36864, rate: 983040, kbps: 240000 },
  { id: 0x34, name: '5.2', frameSize: 36864, rate: 2073600, kbps: 240000 },
  { id: 0x3c, name: '6', frameSize: 139264, rate: 4177920, kbps: 240000 },
  { id: 0x3d, name: '6.1', frameSize: 139264, rate: 8355840, kbps: 480000 },
  { id: 0x3e, name: '6.2', frameSize: 139264, rate: 16711680, kbps: 800000 },
]
const AVC_PROFILES = [
  { name: 'High', prefix: 'avc1.6400', bitrateFactor: 1.25 },
  { name: 'Main', prefix: 'avc1.4D40', bitrateFactor: 1 },
  { name: 'Baseline', prefix: 'avc1.42E0', bitrateFactor: 1 },
]
const VP9_LEVELS: [string, number][] = [['30', 552960], ['31', 983040], ['40', 2228224], ['41', 2228224], ['50', 8912896], ['51', 8912896], ['52', 8912896], ['60', 35651584], ['61', 35651584], ['62', 35651584]]
const AV1_LEVELS: [string, number][] = [['04', 665856], ['05', 1065024], ['08', 2359296], ['09', 2359296], ['12', 8912896], ['13', 8912896], ['14', 8912896], ['16', 35651584], ['17', 35651584], ['18', 35651584]]
const CODEC_NAMES: Record<string, string> = { h264: 'H.264', vp9: 'VP9', av1: 'AV1' }
const QUEUE_HIGH = 2
const HERO = 'bloom-hero'
const KEPT_URL = './kept/bloom-hero.jpg'

const fps = config.film.fps
const bitrate = config.export.bitrateMbps * 1e6

function encoderConfig(codec: string, format: Format): VideoEncoderConfig {
  const base: VideoEncoderConfig = { codec, width: format.width, height: format.height, bitrate, framerate: fps, latencyMode: 'quality', alpha: 'discard' }
  return codec.startsWith('avc1') ? { ...base, avc: { format: 'avc' } } : base
}

async function supported(codec: string, format: Format): Promise<VideoEncoderConfig | null> {
  const wanted = encoderConfig(codec, format)
  try {
    const answer = await VideoEncoder.isConfigSupported(wanted)
    return answer.supported ? wanted : null
  } catch {
    return null
  }
}

async function pickCodec(family: string, format: Format): Promise<Picked | null> {
  if (typeof VideoEncoder === 'undefined') return null
  if (family === 'h264') {
    const blocks = Math.ceil(format.width / 16) * Math.ceil(format.height / 16)
    for (const profile of AVC_PROFILES) {
      const fits = AVC_LEVELS.filter((l) => l.frameSize >= blocks && l.rate >= blocks * fps && l.kbps * profile.bitrateFactor * 1000 >= bitrate)
      for (const level of fits) {
        const codec = `${profile.prefix}${level.id.toString(16).toUpperCase().padStart(2, '0')}`
        const encoder = await supported(codec, format)
        if (encoder) return { container: 'avc', codec, label: `${CODEC_NAMES.h264}, ${profile.name} profile, level ${level.name}`, encoder }
      }
    }
    return null
  }
  const pixels = format.width * format.height
  const levels = family === 'vp9' ? VP9_LEVELS : family === 'av1' ? AV1_LEVELS : []
  for (const [level, most] of levels) {
    if (most < pixels) continue
    const codec = family === 'vp9' ? `vp09.00.${level}.08` : `av01.0.${level}M.08`
    const encoder = await supported(codec, format)
    if (encoder) return { container: family === 'vp9' ? 'vp9' : 'av1', codec, label: CODEC_NAMES[family], encoder }
  }
  return null
}

function make<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text !== undefined) node.textContent = text
  return node
}

function clock(seconds: number): string {
  const s = Math.max(0, Math.round(seconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const two = (n: number) => String(n).padStart(2, '0')
  return h > 0 ? `${h}:${two(m)}:${two(s % 60)}` : `${m}:${two(s % 60)}`
}

function about(seconds: number): string {
  if (seconds < 90) return `about ${Math.max(1, Math.round(seconds))} seconds`
  if (seconds < 5400) return `about ${Math.round(seconds / 60)} minutes`
  return `about ${(seconds / 3600).toFixed(1)} hours`
}

function words(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function capital(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1)
}

type CheckState = 'wait' | 'busy' | 'ok' | 'fail'

export function startExport(film: Film, options: Options, host: HTMLElement): void {
  const query = new URLSearchParams(location.search)
  const auto = query.get('auto') === '1'
  const family = query.get('codec') ?? config.export.videoCodec
  const familyName = CODEC_NAMES[family] ?? family
  const canvas = film.stage.canvas
  const hero = keys.find((k) => k.id === HERO) ?? keys[keys.length - 1]

  const formats: { format: Format; label: string }[] = [
    { format: config.formats.master, label: 'Master' },
    { format: config.formats.uhd, label: 'UHD' },
  ]
  if (options.format.id === config.formats.preview.id) formats.push({ format: config.formats.preview, label: 'Preview' })

  const limited = options.first > 0 || options.last < frameCount - 1
  const unit = options.unit ? segmentById(options.unit) : null
  const testFirst = unit ? Math.max(unit.firstFrame, options.first) : options.first
  const testLast = unit ? Math.min(unit.lastFrame, options.last) : options.last

  let format = formats.find((f) => f.format.id === options.format.id)?.format ?? config.formats.master
  let tier: TierId = options.tier
  let assetSet: AssetSetId = options.assets
  let rangeId = limited && testLast >= testFirst ? 'frames' : unit ? unit.id : 'film'
  let picked: Picked | null = null
  let ready = false
  let running = false
  let stopAsked = false
  let secondsPerSample = 0
  let queue: Promise<void> = Promise.resolve()
  let turn = 0
  let heroUrl = ''
  let fileUrl = ''
  let lock: WakeLockSentinel | null = null

  host.classList.add(css.page)
  const shell = make('div', css.shell)
  const header = make('header', css.header)
  header.append(make('p', css.eyebrow, `${config.name} · Export`), make('h1', css.title, 'Make the film file on this machine'), make('p', css.lead, 'Every frame is drawn here, encoded here and saved as one file. Nothing is uploaded.'))

  const left = make('div', css.column)
  const right = make('div', css.column)

  const previewPanel = make('section', `${css.panel} ${css.first}`)
  previewPanel.setAttribute('aria-label', 'Preview')
  const frameBox = make('div', css.frame)
  frameBox.append(canvas)
  canvas.setAttribute('aria-label', 'The film frame now being drawn')
  canvas.setAttribute('role', 'img')
  const previewNote = make('p', css.caption, 'The film canvas. Only this picture goes into the file.')
  previewPanel.append(make('h2', css.heading, 'Preview'), frameBox, previewNote)

  const comparePanel = make('section', `${css.panel} ${css.last}`)
  comparePanel.setAttribute('aria-label', 'Comparison')
  const compareNote = make('p', css.caption, 'The bloom frame is drawn on this machine before the export can start.')
  const pair = make('div', css.pair)
  const mineFigure = make('figure', css.figure)
  const mineImage = make('img', css.still)
  mineImage.alt = 'The bloom frame as this machine draws it'
  mineFigure.append(mineImage, make('figcaption', css.caption, 'This machine'))
  const keptFigure = make('figure', css.figure)
  const keptImage = make('img', css.still)
  keptImage.alt = 'The kept still of the bloom frame'
  keptFigure.append(keptImage, make('figcaption', css.caption, 'The kept still'))
  pair.append(mineFigure, keptFigure)
  mineFigure.hidden = true
  keptFigure.hidden = true
  comparePanel.append(make('h2', css.heading, 'Does this machine draw it the same'), pair, compareNote)

  const settings = make('section', css.panel)
  settings.setAttribute('aria-label', 'Settings')
  const fields = make('div', css.fields)
  const field = (role: string, label: string, choices: { value: string; text: string }[], value: string): HTMLSelectElement => {
    const wrap = make('label', css.field)
    const select = make('select', css.select)
    select.dataset.role = role
    select.id = `export-${role}`
    wrap.htmlFor = select.id
    for (const c of choices) {
      const option = make('option', undefined, c.text)
      option.value = c.value
      select.append(option)
    }
    select.value = value
    wrap.append(make('span', css.label, label), select)
    fields.append(wrap)
    return select
  }
  const spans = (first: number, last: number) => `${(first / fps).toFixed(0)} to ${((last + 1) / fps).toFixed(0)} s`
  const rangeChoices = [{ value: 'film', text: `The whole film · ${config.film.durationSeconds} s` }, ...segments.map((s) => ({ value: s.id, text: `${capital(s.id)} clip · ${spans(s.firstFrame, s.lastFrame)}` }))]
  if (rangeId === 'frames') rangeChoices.push({ value: 'frames', text: `Test range · frames ${testFirst} to ${testLast}` })
  const formatSelect = field('format', 'Format', formats.map((f) => ({ value: f.format.id, text: `${f.label} · ${f.format.width} x ${f.format.height}` })), format.id)
  const rangeSelect = field('range', 'Range', rangeChoices, rangeId)
  const tierSelect = field('tier', 'Quality tier', tierIds.map((id) => ({ value: id, text: `${capital(id)} · ${samplesOf(id)} ${samplesOf(id) === 1 ? 'sample' : 'samples'} a frame` })), tier)
  const summary = make('p', css.summary)
  settings.append(make('h2', css.heading, 'Settings'), fields, summary)

  const list = make('ul', css.checks)
  list.setAttribute('aria-label', 'Checks before the start')
  const checkRow = (title: string) => {
    const row = make('li', css.check)
    row.dataset.state = 'wait'
    const mark = make('span', css.mark)
    mark.setAttribute('aria-hidden', 'true')
    const body = make('div', css.checkBody)
    const text = make('p', css.checkText, 'Waiting')
    body.append(make('p', css.checkTitle, title), text)
    row.append(mark, body)
    list.append(row)
    return {
      set(state: CheckState, line: string) {
        row.dataset.state = state
        text.textContent = line
      },
      body,
    }
  }
  const codecCheck = checkRow('Video encoder')
  const assetCheck = checkRow('Asset set')
  const heroCheck = checkRow('Bloom frame')
  const offer = make('button', css.minor, `Use the web asset set instead`)
  offer.type = 'button'
  offer.dataset.role = 'use-web'
  offer.hidden = true
  assetCheck.body.append(offer)

  const runPanel = make('section', css.panel)
  runPanel.setAttribute('aria-label', 'Export')
  const actions = make('div', css.actions)
  const start = make('button', css.start, 'Start the export')
  start.type = 'button'
  start.dataset.role = 'start'
  start.disabled = true
  const stop = make('button', css.minor, 'Stop')
  stop.type = 'button'
  stop.dataset.role = 'stop'
  stop.hidden = true
  actions.append(start, stop)
  const status = make('p', css.status, 'Getting ready.')
  status.dataset.role = 'status'
  status.setAttribute('role', 'status')
  status.setAttribute('aria-live', 'polite')
  const bar = make('progress', css.bar)
  bar.max = 1
  bar.value = 0
  bar.setAttribute('aria-label', 'Frames done')
  const stats = make('dl', css.stats)
  const stat = (label: string) => {
    const wrap = make('div', css.stat)
    const value = make('dd', css.statValue, '·')
    wrap.append(make('dt', css.statLabel, label), value)
    stats.append(wrap)
    return value
  }
  const framesStat = stat('Frames done')
  const elapsedStat = stat('Elapsed')
  const remainingStat = stat('Remaining')
  const saved = make('p', css.saved)
  saved.hidden = true
  runPanel.append(make('h2', css.heading, 'Checks and export'), list, actions, status, bar, stats, saved)

  left.append(previewPanel, comparePanel)
  right.append(settings, runPanel)
  const grid = make('main', css.grid)
  grid.append(left, right)
  shell.append(header, grid)
  host.append(shell)

  const say = (text: string) => {
    status.textContent = text
  }

  const frameRange = (): { first: number; last: number } => {
    if (rangeId === 'frames') return { first: testFirst, last: testLast }
    if (rangeId === 'film') return { first: 0, last: frameCount - 1 }
    const s = segmentById(rangeId)
    return { first: s.firstFrame, last: s.lastFrame }
  }

  const fileName = (): string => {
    if (format.id === config.formats.preview.id) return config.export.files.preview
    const clip = rangeId === 'frames' ? unit?.id : rangeId === 'film' ? undefined : rangeId
    if (clip) return config.export.files.clip.replace('{unit}', clip)
    return format.id === config.formats.uhd.id ? config.export.files.uhd : config.export.files.master
  }

  const describe = () => {
    const { first, last } = frameRange()
    const total = last - first + 1
    const parts = [`${total} ${total === 1 ? 'frame' : 'frames'} at ${fps} frames a second`, `${config.export.bitrateMbps} Mbit a second`, `saved as ${fileName()}`]
    if (secondsPerSample > 0) parts.push(`${about(secondsPerSample * samplesOf(tier) * total)} on this machine`)
    summary.textContent = `${parts.join(' · ')}.`
  }

  const setControls = (enabled: boolean) => {
    formatSelect.disabled = !enabled
    rangeSelect.disabled = !enabled
    tierSelect.disabled = !enabled
    offer.disabled = !enabled
  }

  const refuse = (line: string) => {
    say(line)
    if (auto && !window.exportResult) window.exportResult = { ok: false, frames: 0, fileName: fileName(), codec: picked?.codec ?? '', seconds: 0, error: line }
  }

  const snapshot = (): Promise<string> =>
    new Promise((resolve, reject) => {
      canvas.toBlob((blob) => (blob ? resolve(URL.createObjectURL(blob)) : reject(new Error('the frame could not be copied'))), 'image/jpeg', 0.92)
    })

  const showKept = (): Promise<boolean> =>
    new Promise((resolve) => {
      if (keptImage.complete && keptImage.naturalWidth > 0) return resolve(true)
      keptImage.onload = () => resolve(true)
      keptImage.onerror = () => resolve(false)
      keptImage.src = KEPT_URL
    })

  const prepare = async (mine: number) => {
    if (mine !== turn) return
    ready = false
    start.disabled = true
    offer.hidden = true
    picked = null
    const size = `${format.width} x ${format.height}`
    codecCheck.set('busy', 'Asking the browser what it can encode.')
    assetCheck.set('wait', 'Waiting')
    heroCheck.set('wait', 'Waiting')
    say('Checking this machine.')

    picked = await pickCodec(family, format)
    if (mine !== turn) return
    if (!picked) {
      const line = typeof VideoEncoder === 'undefined' ? `This browser has no video encoder, so it cannot make the file. Open this page in a current Chrome or Edge, over https or on localhost.` : `This browser cannot encode ${familyName} video at ${size}. Try a current Chrome or Edge, or choose a smaller format.`
      codecCheck.set('fail', line)
      refuse(line)
      return
    }
    codecCheck.set('ok', `${picked.label}, at ${size}.`)

    assetCheck.set('busy', `Loading the ${assetSet} asset set.`)
    try {
      await film.setAssets(assetSet)
    } catch (error) {
      if (mine !== turn) return
      const other = assetSet === 'full'
      const line = `This machine could not load the ${assetSet} asset set (${words(error)}).${other ? ' The web set is smaller and can be used instead.' : ''}`
      assetCheck.set('fail', line)
      offer.hidden = !other
      refuse(line)
      return
    }
    if (mine !== turn) return
    assetCheck.set('ok', `The ${assetSet} set is loaded, ${film.textureMb().toFixed(0)} MB of textures.`)

    heroCheck.set('busy', `Drawing frame ${hero.frame} at the review tier.`)
    try {
      await film.setFormat(format)
      const t0 = performance.now()
      await film.renderFrame(hero.frame, 'review', true)
      secondsPerSample = (performance.now() - t0) / 1000 / samplesOf('review')
      const url = await snapshot()
      if (heroUrl) URL.revokeObjectURL(heroUrl)
      heroUrl = url
      mineImage.src = url
      mineFigure.hidden = false
    } catch (error) {
      if (mine !== turn) return
      const line = film.stage.lost ? 'The graphics context of this browser was lost while the bloom frame was drawn. Reload the page to try again.' : `The bloom frame could not be drawn (${words(error)}).`
      heroCheck.set('fail', line)
      refuse(line)
      return
    }
    const kept = await showKept()
    if (mine !== turn) return
    keptFigure.hidden = !kept
    pair.dataset.single = kept ? 'no' : 'yes'
    if (kept) {
      heroCheck.set('ok', 'Drawn. Compare it with the kept still.')
      compareNote.textContent = `Frame ${hero.frame} at the review tier, beside the still the critics saw. They should look the same.`
    } else {
      heroCheck.set('ok', 'Drawn. No kept still exists yet, so the comparison is skipped.')
      compareNote.textContent = `No kept still of this frame exists yet, so there is nothing to compare with. This is frame ${hero.frame} as this machine draws it.`
    }
    previewNote.textContent = `The film canvas, showing frame ${hero.frame}. Only this picture goes into the file.`
    ready = true
    start.disabled = false
    describe()
    say('Ready. Choose the format, the range and the tier, then start.')
    if (auto) void run()
  }

  const schedule = () => {
    const mine = ++turn
    queue = queue.then(() => prepare(mine)).catch((error: unknown) => refuse(`The checks could not finish (${words(error)}).`))
  }

  const holdAwake = async () => {
    try {
      lock = await navigator.wakeLock.request('screen')
    } catch {
      lock = null
    }
  }

  const onVisible = () => {
    if (running && document.visibilityState === 'visible') void holdAwake()
  }

  const run = async () => {
    if (running || !ready || !picked) return
    const choice = picked
    const { first, last } = frameRange()
    const total = last - first + 1
    const name = fileName()
    const size = { width: format.width, height: format.height }
    const started = performance.now()
    const seconds = () => (performance.now() - started) / 1000
    running = true
    stopAsked = false
    setControls(false)
    start.disabled = true
    stop.hidden = false
    saved.hidden = true
    delete window.exportResult
    window.exportProgress = { done: 0, total, textureMb: film.textureMb() }
    bar.value = 0
    framesStat.textContent = `0 of ${total}`
    elapsedStat.textContent = clock(0)
    remainingStat.textContent = '·'
    say(`Drawing and encoding ${total} ${total === 1 ? 'frame' : 'frames'}. Keep this tab open and in front.`)
    document.addEventListener('visibilitychange', onVisible)
    await holdAwake()

    let failure: unknown = null
    let chunks = 0
    let done = 0
    let wake: (() => void) | null = null
    const target = new ArrayBufferTarget()
    const muxer = new Muxer({ target, video: { codec: choice.container, width: size.width, height: size.height, frameRate: fps }, fastStart: 'in-memory', firstTimestampBehavior: 'strict' })
    const encoder = new VideoEncoder({
      output: (chunk, meta) => {
        try {
          muxer.addVideoChunk(chunk, meta)
          chunks++
        } catch (error) {
          failure ??= error
        }
      },
      error: (error) => {
        failure ??= error
        wake?.()
      },
    })
    const drained = () =>
      new Promise<void>((resolve) => {
        const onDequeue = () => {
          wake = null
          encoder.removeEventListener('dequeue', onDequeue)
          resolve()
        }
        wake = onDequeue
        encoder.addEventListener('dequeue', onDequeue)
      })
    const lost = () => film.stage.lost || film.stage.gl.isContextLost()

    let error: string | null = null
    try {
      encoder.configure(choice.encoder)
      for (let i = 0; i < total; i++) {
        const frame = first + i
        if (stopAsked) throw new Error('stopped')
        if (lost()) throw new Error('lost')
        await film.renderFrame(frame, tier, true)
        if (lost()) throw new Error('lost')
        const timestamp = Math.round((i * 1e6) / fps)
        const picture = new VideoFrame(canvas, { timestamp, duration: Math.round(((i + 1) * 1e6) / fps) - timestamp, alpha: 'discard' })
        try {
          encoder.encode(picture, { keyFrame: i === 0 || (frame - segmentAt(frame).firstFrame) % fps === 0 })
        } finally {
          picture.close()
        }
        done = i + 1
        const elapsed = seconds()
        window.exportProgress = { done, total, textureMb: film.textureMb() }
        bar.value = done / total
        framesStat.textContent = `${done} of ${total}`
        elapsedStat.textContent = clock(elapsed)
        remainingStat.textContent = done < total ? clock((elapsed / done) * (total - done)) : clock(0)
        previewNote.textContent = `The film canvas, showing frame ${frame}. Only this picture goes into the file.`
        await breathe()
        while (encoder.encodeQueueSize > QUEUE_HIGH && !failure) await drained()
        if (failure) throw failure
      }
      await encoder.flush()
      if (failure) throw failure
      if (lost()) throw new Error('lost')
      if (chunks !== total) throw new Error(`the encoder returned ${chunks} of ${total} frames`)
      muxer.finalize()
      const blob = new Blob([target.buffer], { type: 'video/mp4' })
      if (fileUrl) URL.revokeObjectURL(fileUrl)
      fileUrl = URL.createObjectURL(blob)
      const link = make('a', css.link, `Save ${name} again`)
      link.href = fileUrl
      link.download = name
      saved.replaceChildren(make('span', undefined, `${(blob.size / 1048576).toFixed(1)} MB · `), link)
      saved.hidden = false
      link.click()
      say(`Done. ${total} ${total === 1 ? 'frame' : 'frames'} are in ${name}, in your downloads folder.`)
    } catch (caught) {
      const message = words(caught)
      if (message === 'stopped') error = `Stopped at frame ${first + done}. No file was written.`
      else if (message === 'lost' || lost()) error = `The graphics context of this browser was lost at frame ${first + done}, so the export stopped. No file was written. Reload the page and start again.`
      else error = `The export stopped at frame ${first + done} (${message}). No file was written.`
      say(error)
    } finally {
      if (encoder.state !== 'closed') encoder.close()
      document.removeEventListener('visibilitychange', onVisible)
      await lock?.release().catch(() => undefined)
      lock = null
      running = false
      stop.hidden = true
      setControls(true)
      start.disabled = !ready || lost()
      window.exportResult = { ok: error === null, frames: error === null ? total : done, fileName: name, codec: choice.codec, seconds: seconds(), error }
    }
  }

  formatSelect.addEventListener('change', () => {
    format = formats.find((f) => f.format.id === formatSelect.value)?.format ?? format
    secondsPerSample = 0
    describe()
    schedule()
  })
  rangeSelect.addEventListener('change', () => {
    rangeId = rangeSelect.value
    describe()
  })
  tierSelect.addEventListener('change', () => {
    tier = tierSelect.value as TierId
    describe()
  })
  offer.addEventListener('click', () => {
    assetSet = 'web'
    schedule()
  })
  start.addEventListener('click', () => void run())
  stop.addEventListener('click', () => {
    stopAsked = true
    say('Stopping after this frame.')
  })
  canvas.addEventListener('webglcontextlost', () => {
    if (!running) {
      start.disabled = true
      say('The graphics context of this browser was lost. Reload the page to try again.')
    }
  })

  describe()
  schedule()
}
