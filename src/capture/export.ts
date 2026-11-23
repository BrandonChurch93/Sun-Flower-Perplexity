import { ArrayBufferTarget, Muxer } from 'mp4-muxer'
import { config, frameCount, type AssetSetId, type Format, type TierId } from '../config.ts'
import { samplesOf, tierIds } from '../core/tiers.ts'
import { breathe } from '../core/yield.ts'
import type { Film } from '../director/film.ts'
import type { Options } from '../director/modes.ts'
import { clampFrame, keys, segments } from '../director/timeline.ts'
import { EXPORT_NOTE, fileOf, readTrack, trackLine, type Track } from '../player/track.ts'
import css from './export.module.css'
import { addSound, checkSound, decodeSound, makeSound, pickSound, SOUND_NEEDS_SECONDS, SOUND_PASS_MS, SOUND_RATE, type SoundCheck, type SoundKind } from './sound.ts'
import { describe as describeBytes, Store, storeId, undescribe, type StoredChunk } from './store.ts'

declare const __ENGINE_HASH__: string

export interface ExportResult { ok: boolean; frames: number; fileName: string; codec: string; seconds: number; error: string | null; resumedFrames: number; sound: string | null; soundCheck: SoundCheck | null }
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
const TEST_SECTION = 'flower'

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
  const test = keys.find((k) => k.unit === TEST_SECTION) ?? keys[keys.length - 1]
  const group = fps

  const formats: { format: Format; label: string }[] = [
    { format: config.formats.master, label: 'Master' },
    { format: config.formats.uhd, label: 'UHD' },
  ]
  if (options.format.id === config.formats.preview.id) formats.push({ format: config.formats.preview, label: 'Preview' })
  else if (!formats.some((f) => f.format.id === options.format.id)) formats.push({ format: options.format, label: 'Test size' })

  const limited = options.first > 0 || options.last < frameCount - 1
  const unit = options.unit ? (segments.find((s) => s.id === options.unit) ?? null) : null

  let format = formats.find((f) => f.format.id === options.format.id)?.format ?? config.formats.master
  let tier: TierId = options.tier
  let assetSet: AssetSetId = options.assets
  let first = limited ? Math.min(options.first, options.last) : unit ? unit.firstFrame : 0
  let last = limited ? Math.max(options.first, options.last) : unit ? unit.lastFrame : frameCount - 1
  let picked: Picked | null = null
  let sound: SoundKind | null = null
  let track: Track | null = null
  let ready = false
  let running = false
  let stopAsked = false
  let secondsPerSample = 0
  let queue: Promise<void> = Promise.resolve()
  let turn = 0
  let fileUrl = ''
  let lock: WakeLockSentinel | null = null
  let lostTold = false
  let kept = 0

  host.classList.add(css.page)
  const shell = make('div', css.shell)
  const header = make('header', css.header)
  header.append(make('p', css.eyebrow, `${config.name} · Export`), make('h1', css.title, 'Make the film file on this machine'), make('p', css.lead, 'Every frame is drawn here, encoded here and saved as one file. Nothing is uploaded.'))

  const left = make('div', css.column)
  const middle = make('div', css.column)
  const right = make('div', css.column)

  const previewPanel = make('section', css.panel)
  previewPanel.setAttribute('aria-label', 'Preview')
  const frameBox = make('div', css.frame)
  frameBox.append(canvas)
  canvas.setAttribute('aria-label', 'The film frame now being drawn')
  canvas.setAttribute('role', 'img')
  const previewNote = make('p', css.caption, 'The film canvas. Only this picture goes into the file.')
  previewPanel.append(make('h2', css.heading, 'Preview'), frameBox, previewNote)

  const trackPanel = make('section', css.panel)
  trackPanel.setAttribute('aria-label', 'Track')
  const choose = make('button', css.minor, 'Choose the track')
  choose.type = 'button'
  choose.dataset.role = 'track'
  const fileInput = make('input')
  fileInput.type = 'file'
  fileInput.accept = 'audio/*,.mp3,.wav,.flac,.m4a,.ogg'
  fileInput.hidden = true
  fileInput.dataset.role = 'track-file'
  const trackText = make('p', css.caption, 'No track. The file is made without sound.')
  trackText.dataset.role = 'track-line'
  const withLabel = make('label', css.option)
  const withSound = make('input')
  withSound.type = 'checkbox'
  withSound.dataset.role = 'with-sound'
  withLabel.append(withSound, make('span', undefined, 'Put the track into the file'))
  withLabel.hidden = true
  const trackNote = make('p', css.caption, 'The track is read from your disk and stays on this machine. It can go into the file you save, and nowhere else.')
  trackPanel.append(make('h2', css.heading, 'Track'), choose, fileInput, trackText, withLabel, trackNote)

  const settings = make('section', css.panel)
  settings.setAttribute('aria-label', 'Settings')
  const fields = make('div', css.fields)
  const wrapField = (label: string, control: HTMLElement, id: string): void => {
    const wrap = make('label', css.field)
    control.id = id
    wrap.htmlFor = id
    wrap.append(make('span', css.label, label), control)
    fields.append(wrap)
  }
  const field = (role: string, label: string, choices: { value: string; text: string }[], value: string): HTMLSelectElement => {
    const select = make('select', css.select)
    select.dataset.role = role
    for (const c of choices) {
      const option = make('option', undefined, c.text)
      option.value = c.value
      select.append(option)
    }
    select.value = value
    wrapField(label, select, `export-${role}`)
    return select
  }
  const numberField = (role: string, label: string, value: number): HTMLInputElement => {
    const input = make('input', css.number)
    input.type = 'number'
    input.min = '0'
    input.max = String(frameCount - 1)
    input.step = '1'
    input.value = String(value)
    input.dataset.role = role
    wrapField(label, input, `export-${role}`)
    return input
  }
  const drawnTimes = (n: number): string => (n === 1 ? 'drawn once' : `drawn ${n} times and blended`)
  const spans = (a: number, b: number) => `${(a / fps).toFixed(0)} to ${((b + 1) / fps).toFixed(0)} s`
  const rangeOf = (): string => {
    if (first === 0 && last === frameCount - 1) return 'film'
    return segments.find((s) => s.firstFrame === first && s.lastFrame === last)?.id ?? 'frames'
  }
  const rangeChoices = [
    { value: 'film', text: `The whole film · ${config.film.durationSeconds} s` },
    ...segments.map((s) => ({ value: s.id, text: `${s.name} · bars ${s.fromBar} to ${s.toBar} · ${spans(s.firstFrame, s.lastFrame)}` })),
    { value: 'frames', text: 'The frames below' },
  ]
  const formatSelect = field('format', 'Format', formats.map((f) => ({ value: f.format.id, text: `${f.label} · ${f.format.width} x ${f.format.height}` })), format.id)
  const rangeSelect = field('range', 'Range', rangeChoices, rangeOf())
  const firstInput = numberField('first', 'First frame', first)
  const lastInput = numberField('last', 'Last frame', last)
  const tierSelect = field('tier', 'Quality', tierIds.map((id) => ({ value: id, text: `${capital(id)} · each frame ${drawnTimes(samplesOf(id))}` })), tier)
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
  const assetCheck = checkRow('Textures')
  const testCheck = checkRow('Test frame')
  const keptCheck = checkRow('Stopped export')
  const offer = make('button', css.minor, 'Use the smaller set instead')
  offer.type = 'button'
  offer.dataset.role = 'use-web'
  offer.hidden = true
  assetCheck.body.append(offer)
  const forget = make('button', css.minor, 'Start over from the first frame')
  forget.type = 'button'
  forget.dataset.role = 'forget'
  forget.hidden = true
  keptCheck.body.append(forget)

  const checksPanel = make('section', css.panel)
  checksPanel.setAttribute('aria-label', 'Checks')
  const runPanel = make('section', `${css.panel} ${css.last}`)
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
  const soundLine = make('p', css.caption)
  soundLine.dataset.role = 'sound-check'
  soundLine.hidden = true
  checksPanel.append(make('h2', css.heading, 'Checks'), list)
  runPanel.append(make('h2', css.heading, 'Export'), actions, status, bar, stats, saved, soundLine)

  left.append(previewPanel, runPanel)
  middle.append(settings, trackPanel)
  right.append(checksPanel)
  const grid = make('main', css.grid)
  grid.append(left, middle, right)
  shell.append(header, grid)
  host.append(shell)

  const say = (text: string) => {
    status.textContent = text
  }

  const total = (): number => last - first + 1
  const groups = (): number => Math.ceil(total() / group)
  const framesIn = (g: number): number => Math.min(group, total() - g * group)
  const wantsSound = (): boolean => track !== null && withSound.checked && sound !== null

  const fileName = (): string => {
    if (format.id === config.formats.preview.id || !Object.values(config.formats).some((f) => f.id === format.id)) return config.export.files.preview
    const range = rangeOf()
    if (range === 'frames') return config.export.files.clip.replace('{unit}', `frames-${first}-${last}`)
    if (range !== 'film') return config.export.files.clip.replace('{unit}', range)
    return format.id === config.formats.uhd.id ? config.export.files.uhd : config.export.files.master
  }

  const describe = () => {
    const n = total()
    const parts = [`${n} ${n === 1 ? 'frame' : 'frames'} at ${fps} frames a second`, `each ${drawnTimes(samplesOf(tier))}`, `${config.export.bitrateMbps} Mbit a second`, wantsSound() ? `with the track as ${sound?.label}` : 'without sound', `saved as ${fileName()}`]
    if (secondsPerSample > 0) parts.push(`${about(secondsPerSample * samplesOf(tier) * (n - kept))} on this machine, a guess from one test frame`)
    summary.textContent = `${parts.join(' · ')}.`
  }

  const setControls = (enabled: boolean) => {
    for (const control of [formatSelect, rangeSelect, tierSelect, firstInput, lastInput, offer, forget, choose, withSound]) control.disabled = !enabled
  }

  const refuse = (line: string) => {
    say(line)
    if (auto && !window.exportResult) window.exportResult = { ok: false, frames: 0, fileName: fileName(), codec: picked?.codec ?? '', seconds: 0, error: line, resumedFrames: 0, sound: null, soundCheck: null }
  }

  const openStore = async (): Promise<Store | null> => {
    if (!picked) return null
    return Store.open(await storeId([__ENGINE_HASH__, format.id, format.width, format.height, tier, assetSet, options.sky ?? '', options.only.join('+'), first, last, picked.codec, bitrate, group]))
  }

  // How many frames a stopped export of exactly these settings left behind: whole groups from the first one on.
  const keptFrames = async (store: Store | null): Promise<number> => {
    if (!store) return 0
    const meta = await store.meta()
    if (!meta || meta.frames !== total() || meta.group !== group || meta.codec !== picked?.codec) return 0
    let frames = 0
    for (let g = 0; g < groups(); g++) {
      if (!(await store.group(g, framesIn(g)))) break
      frames += framesIn(g)
    }
    return frames
  }

  const lookForKept = async () => {
    const mine = turn
    const store = await openStore()
    const frames = await keptFrames(store)
    if (mine !== turn) return
    kept = frames
    forget.hidden = frames === 0
    if (!store) keptCheck.set('ok', 'This browser cannot keep a stopped export, so a stopped export starts again from its first frame.')
    else if (frames === 0) keptCheck.set('ok', 'Nothing kept for these settings. If the export stops, what is drawn is kept and the next start goes on from there.')
    else if (frames >= total()) keptCheck.set('ok', `All ${frames} frames of these settings are kept. Start writes the file without drawing again.`)
    else keptCheck.set('ok', `Frames ${first} to ${first + frames - 1} are kept from a stopped export of these settings. Start goes on from frame ${first + frames}.`)
    describe()
  }

  const prepare = async (mine: number) => {
    if (mine !== turn) return
    ready = false
    start.disabled = true
    offer.hidden = true
    picked = null
    const size = `${format.width} x ${format.height}`
    codecCheck.set('busy', 'Asking the browser what it can encode.')
    assetCheck.set('wait', 'Waiting')
    testCheck.set('wait', 'Waiting')
    keptCheck.set('wait', 'Waiting')
    say('Checking this machine.')

    picked = await pickCodec(family, format)
    sound = await pickSound()
    if (mine !== turn) return
    if (!picked) {
      const line = typeof VideoEncoder === 'undefined' ? `This browser has no video encoder, so it cannot make the file. Open this page in a current Chrome or Edge, over https or on localhost.` : `This browser cannot encode ${familyName} video at ${size}. Try a current Chrome or Edge, or choose a smaller format.`
      codecCheck.set('fail', line)
      refuse(line)
      return
    }
    codecCheck.set('ok', `${picked.label}, ${picked.codec}, at ${size}, ${config.export.bitrateMbps} Mbit a second, ${fps} frames a second, a key frame every second. ${sound ? `Sound: ${sound.label}, ${sound.kbps} kbit a second, ${SOUND_RATE / 1000} kHz stereo.${sound.container === 'opus' ? ' This browser has no AAC encoder. Opus plays in browsers and may not play in QuickTime.' : ''}` : 'This browser cannot encode sound, so the file is made without it.'}`)

    assetCheck.set('busy', `Loading the ${assetSet} set of textures.`)
    try {
      await film.setAssets(assetSet)
    } catch (error) {
      if (mine !== turn) return
      const other = assetSet === 'full'
      const line = `This machine could not load the ${assetSet} set of textures (${words(error)}).${other ? ' There is a smaller set that can be used instead.' : ''}`
      assetCheck.set('fail', line)
      offer.hidden = !other
      refuse(line)
      return
    }
    if (mine !== turn) return
    assetCheck.set('ok', `The ${assetSet} set of textures is loaded, ${film.textureMb().toFixed(0)} MB.`)

    testCheck.set('busy', `Drawing one frame of the film, frame ${test.frame}, to see how long it takes.`)
    try {
      await film.setFormat(format)
      const t0 = performance.now()
      await film.renderFrame(test.frame, 'review', true)
      secondsPerSample = (performance.now() - t0) / 1000 / samplesOf('review')
    } catch (error) {
      if (mine !== turn) return
      const line = film.stage.lost ? 'The graphics context of this browser was lost while the test frame was drawn. Reload the page to try again.' : `The test frame could not be drawn (${words(error)}).`
      testCheck.set('fail', line)
      refuse(line)
      return
    }
    if (mine !== turn) return
    testCheck.set('ok', `Frame ${test.frame} of the film took ${(secondsPerSample * samplesOf('review')).toFixed(1)} s to draw, ${drawnTimes(samplesOf('review'))}. It is in the preview.`)
    previewNote.textContent = `The film canvas, showing frame ${test.frame}. Only this picture goes into the file.`
    await lookForKept()
    if (mine !== turn) return
    ready = true
    start.disabled = false
    describe()
    say('Ready. Choose the format, the range and the quality, then start.')
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

  const run = async (): Promise<void> => {
    if (running || !ready || !picked) return
    const choice = picked
    const n = total()
    const from = first
    const name = fileName()
    const size = { width: format.width, height: format.height }
    const voice = wantsSound() && track && sound ? { kind: sound, bytes: track.bytes } : null
    const started = performance.now()
    const seconds = () => (performance.now() - started) / 1000
    running = true
    stopAsked = false
    setControls(false)
    start.disabled = true
    start.textContent = 'Export running'
    stop.hidden = false
    saved.hidden = true
    soundLine.hidden = true
    delete window.exportResult
    window.exportProgress = { done: 0, total: n, textureMb: film.textureMb() }
    bar.value = 0
    framesStat.textContent = `0 of ${n}`
    elapsedStat.textContent = clock(0)
    remainingStat.textContent = '·'
    document.addEventListener('visibilitychange', onVisible)
    await holdAwake()

    let failure: unknown = null
    let done = 0
    let reached = 0
    let resumed = 0
    let again = false
    let wake: (() => void) | null = null
    let pending: StoredChunk[] = []
    let description: string | null | undefined
    let wanted: string | null | undefined
    let soundCheck: SoundCheck | null = null
    let colour: VideoColorSpaceInit | null = null
    const target = new ArrayBufferTarget()
    const muxer = new Muxer({
      target,
      video: { codec: choice.container, width: size.width, height: size.height, frameRate: fps },
      audio: voice ? { codec: voice.kind.container, numberOfChannels: voice.kind.config.numberOfChannels, sampleRate: SOUND_RATE } : undefined,
      fastStart: 'in-memory',
      firstTimestampBehavior: 'strict',
    })
    let muxed = 0
    const encoder = new VideoEncoder({
      output: (chunk, meta) => {
        try {
          const told = meta?.decoderConfig
          if (told && description === undefined) {
            description = describeBytes(told.description)
            colour = told.colorSpace ?? null
            if (wanted !== undefined && wanted !== description) throw new Error('changed')
          }
          muxer.addVideoChunk(chunk, muxed === 0 ? meta : undefined)
          muxed++
          const data = new Uint8Array(chunk.byteLength)
          chunk.copyTo(data)
          pending.push({ key: chunk.type === 'key', timestamp: chunk.timestamp, duration: chunk.duration ?? 0, data })
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
    const tell = (frame: number) => {
      const elapsed = seconds()
      const drawn = reached - resumed
      window.exportProgress = { done: reached, total: n, textureMb: film.textureMb() }
      bar.value = reached / n
      framesStat.textContent = `${reached} of ${n}`
      elapsedStat.textContent = clock(elapsed)
      remainingStat.textContent = reached < n && drawn > 0 ? clock((elapsed / drawn) * (n - reached)) : reached < n ? '·' : clock(0)
      previewNote.textContent = `The film canvas, showing frame ${frame}. Only this picture goes into the file.`
    }

    let error: string | null = null
    let store: Store | null = null
    try {
      store = await openStore()
      const have = await keptFrames(store)
      const meta = have > 0 && store ? await store.meta() : null
      if (store && meta && have > 0) {
        say(`Taking frames ${from} to ${from + have - 1} from the stopped export.`)
        wanted = meta.description
        for (let g = 0; done < have; g++) {
          const chunks = await store.group(g, framesIn(g))
          if (!chunks) throw new Error('the kept frames could not be read')
          for (const c of chunks) {
            const chunk = new EncodedVideoChunk({ type: c.key ? 'key' : 'delta', timestamp: c.timestamp, duration: c.duration, data: c.data })
            muxer.addVideoChunk(chunk, muxed === 0 ? { decoderConfig: { codec: meta.codec, codedWidth: size.width, codedHeight: size.height, description: undescribe(meta.description), colorSpace: meta.colour ?? undefined } } : undefined)
            muxed++
          }
          done += chunks.length
        }
        resumed = done
        reached = done
        tell(from + done - 1)
      }
      if (done < n) say(`Drawing and encoding ${n - done} ${n - done === 1 ? 'frame' : 'frames'}. Keep this tab open and in front.`)
      for (let g = done / group; g < groups(); g++) {
        const count = framesIn(g)
        encoder.reset()
        encoder.configure(choice.encoder)
        for (let k = 0; k < count; k++) {
          const i = g * group + k
          const frame = from + i
          if (stopAsked) throw new Error('stopped')
          if (lost()) throw new Error('lost')
          await film.renderFrame(frame, tier, true)
          if (lost()) throw new Error('lost')
          const timestamp = Math.round((i * 1e6) / fps)
          const picture = new VideoFrame(canvas, { timestamp, duration: Math.round(((i + 1) * 1e6) / fps) - timestamp, alpha: 'discard' })
          try {
            encoder.encode(picture, { keyFrame: k === 0 })
          } finally {
            picture.close()
          }
          await breathe()
          while (encoder.encodeQueueSize > QUEUE_HIGH && !failure) await drained()
          if (failure) throw failure
          reached = i + 1
          tell(frame)
        }
        await encoder.flush()
        if (failure) throw failure
        if (pending.length !== count) throw new Error(`the encoder returned ${pending.length} of ${count} frames`)
        if (store) {
          if (g === 0 || wanted === undefined) await store.writeMeta({ codec: choice.codec, description: description ?? null, frames: n, group, colour: colour ?? meta?.colour ?? null })
          await store.writeGroup(g, pending)
        }
        pending = []
        done = Math.min(n, (g + 1) * group)
        reached = done
        tell(from + done - 1)
      }
      if (lost()) throw new Error('lost')
      if (muxed !== n) throw new Error(`the file holds ${muxed} of ${n} frames`)
      let soundChunks = 0
      if (voice) {
        say('Encoding the track.')
        const heard = await decodeSound(voice.bytes)
        const made = await makeSound(heard, voice.kind, from / fps, n / fps, Number(new URLSearchParams(location.search).get('soundlate')) || 0)
        soundChunks = addSound(muxer, made.sound, n / fps)
        muxer.finalize()
        say('Listening to the file: where its sound sits against the track.')
        await breathe()
        soundCheck = await checkSound(target.buffer, heard, from / fps, made.mendedMs)
        const mended = made.mendedMs !== 0 ? ` The encoder had moved the sound by ${made.mendedMs.toFixed(1)} ms. It was encoded again, moved back.` : ''
        soundLine.textContent = soundCheck
          ? `Sound against the track: ${soundCheck.ms >= 0 ? '+' : ''}${soundCheck.ms.toFixed(1)} ms. ${soundCheck.pass ? 'PASS' : 'FAIL'}: ${soundCheck.pass ? 'within' : 'more than'} ${SOUND_PASS_MS} ms.${mended}`
          : n / fps < SOUND_NEEDS_SECONDS
            ? `Sound against the track: not measured. The file is shorter than ${SOUND_NEEDS_SECONDS} seconds, too short to measure.`
            : 'Sound against the track: could not be measured. This stretch of the track is silent or the browser could not read the file back.'
        soundLine.dataset.pass = soundCheck ? (soundCheck.pass ? 'yes' : 'no') : 'unknown'
        soundLine.hidden = false
      } else muxer.finalize()
      const blob = new Blob([target.buffer], { type: 'video/mp4' })
      if (fileUrl) URL.revokeObjectURL(fileUrl)
      fileUrl = URL.createObjectURL(blob)
      const link = make('a', css.link, `Save ${name} again`)
      link.href = fileUrl
      link.download = name
      saved.replaceChildren(make('span', undefined, `${blob.size < 1048576 ? `${Math.ceil(blob.size / 1024)} kB` : `${(blob.size / 1048576).toFixed(1)} MB`} · `), link)
      saved.hidden = false
      link.click()
      await store?.clear()
      try {
        const heardLine = !voice ? 'no sound' : soundCheck ? `sound ${voice.kind.label}, ${soundCheck.ms >= 0 ? '+' : ''}${soundCheck.ms.toFixed(1)} ms against the track, ${soundCheck.pass ? 'PASS' : 'FAIL'}` : `sound ${voice.kind.label}, not measured against the track`
        localStorage.setItem(EXPORT_NOTE, `last export: ${name}, ${n} frames at ${size.width} x ${size.height}, ${choice.codec}, ${heardLine}, ${new Date().toISOString()}`)
      } catch {}
      say(`Done. ${n} ${n === 1 ? 'frame' : 'frames'} are in ${name}, in your downloads folder${soundChunks > 0 ? ', with the track' : ''}.`)
    } catch (caught) {
      const message = words(caught)
      const keeps = store && done > 0 ? ` Frames ${from} to ${from + done - 1} are kept: the next start goes on from there.` : ''
      if (message === 'changed') {
        await store?.clear()
        again = true
        error = 'The encoder of this browser is not the one the stopped export used, so the kept frames cannot be joined. Starting again from the first frame.'
      } else if (message === 'stopped') error = `Stopped at frame ${from + reached}. No file was written.${keeps}`
      else if (message === 'lost' || lost()) {
        lostTold = true
        error = `The graphics context of this browser was lost at frame ${from + reached}, so the export stopped. No file was written.${keeps} Reload the page and start again.`
      } else error = `The export stopped at frame ${from + reached} (${message}). No file was written.${keeps}`
      say(error)
    } finally {
      if (encoder.state !== 'closed') encoder.close()
      document.removeEventListener('visibilitychange', onVisible)
      await lock?.release().catch(() => undefined)
      lock = null
      running = false
      stop.hidden = true
      start.textContent = 'Start the export'
      setControls(true)
      start.disabled = !ready || lost()
      if (!again) window.exportResult = { ok: error === null, frames: error === null ? n : done, fileName: name, codec: choice.codec, seconds: seconds(), error, resumedFrames: resumed, sound: error === null && voice ? voice.kind.label : null, soundCheck }
      await lookForKept()
    }
    if (again) await run()
  }

  const setRange = (a: number, b: number) => {
    first = clampFrame(Math.min(a, b))
    last = clampFrame(Math.max(a, b))
    firstInput.value = String(first)
    lastInput.value = String(last)
    rangeSelect.value = rangeOf()
    turn++
    void lookForKept()
  }
  const showTrack = () => {
    trackText.textContent = track ? trackLine(track) : 'No track. The file is made without sound.'
    const can = track !== null && sound !== null
    withLabel.hidden = !can
    withSound.checked = can
    if (track && !sound) trackText.textContent += ' This browser cannot encode sound, so the file is made without it.'
    else if (track) trackText.textContent += ` It goes into the file as ${sound?.label}, its start on the first frame of the film.`
    describe()
  }

  formatSelect.addEventListener('change', () => {
    format = formats.find((f) => f.format.id === formatSelect.value)?.format ?? format
    secondsPerSample = 0
    describe()
    schedule()
  })
  rangeSelect.addEventListener('change', () => {
    const section = segments.find((s) => s.id === rangeSelect.value)
    if (rangeSelect.value === 'film') setRange(0, frameCount - 1)
    else if (section) setRange(section.firstFrame, section.lastFrame)
  })
  const typed = () => setRange(Number(firstInput.value) || 0, Number(lastInput.value) || 0)
  firstInput.addEventListener('change', typed)
  lastInput.addEventListener('change', typed)
  tierSelect.addEventListener('change', () => {
    tier = tierSelect.value as TierId
    turn++
    void lookForKept()
  })
  offer.addEventListener('click', () => {
    assetSet = 'web'
    schedule()
  })
  forget.addEventListener('click', () => {
    void (async () => {
      await (await openStore())?.clear()
      await lookForKept()
    })()
  })
  choose.addEventListener('click', () => fileInput.click())
  fileInput.addEventListener('change', () => {
    const file = fileOf(fileInput.files)
    fileInput.value = ''
    if (!file) return
    trackText.textContent = `Reading ${file.name}.`
    readTrack(file).then(
      (read) => {
        track = read
        showTrack()
      },
      (error: unknown) => {
        trackText.textContent = `${file.name} could not be read (${words(error)}).`
      },
    )
  })
  withSound.addEventListener('change', describe)
  start.addEventListener('click', () => void run())
  stop.addEventListener('click', () => {
    stopAsked = true
    say('Stopping after this frame.')
  })
  canvas.addEventListener('webglcontextlost', () => {
    start.disabled = true
    if (!running && !lostTold) say('The graphics context of this browser was lost. Reload the page to try again.')
  })

  describe()
  schedule()
}
