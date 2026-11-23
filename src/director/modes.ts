import { config, frameCount, type AssetSetId, type Format, type TierId } from '../config.ts'
import { isDiag, type DiagName } from '../core/shading.ts'
import { formatById, isAssetSet, isTier } from '../core/tiers.ts'
import type { Quality } from '../v2/api.ts'
import { views, type ViewName } from '../v2/shots.ts'
import { clampFrame, segments } from './timeline.ts'

// `review` is the player without its desk: the film, the timeline, play and pause.
export type Mode = 'live' | 'review' | 'autopilot' | 'capture' | 'export'
const MODES: Mode[] = ['live', 'review', 'autopilot', 'capture', 'export']

export const VIEW = { azimuthStepDeg: 0.1, elevationMinDeg: -20, elevationMaxDeg: 60, dollyMin: 0.25, dollyMax: 6 }
export const AV_MAX_MS = 2000

export interface Options {
  mode: Mode
  format: Format
  tier: TierId
  assets: AssetSetId
  frame: number
  first: number
  last: number
  unit: string | null
  diag: DiagName
  hold: boolean
  loop: boolean
  az: number
  el: number
  dolly: number
  // A sky under trial, by its folder. What is drawn, by name. A fixed camera. The quality level of live playback.
  sky: string | null
  only: string[]
  view: ViewName | null
  quality: Quality | null
  // Counts what the graphics card is asked to make, from the first call on.
  count: boolean
  // Milliseconds the picture is moved against the sound, for a recorder that delays one of them. Above zero shows the picture later.
  av: number
  // The dark lead and tail carry the sync mark: a white flash and a blip.
  marks: boolean
  // On a screen larger than the film the picture fills it instead of sitting pixel for pixel in the middle.
  fill: boolean
  // Which of these the address named itself. A value nobody chose does not follow a change of mode.
  chosen: { format: boolean; tier: boolean; assets: boolean }
}

function round(value: number, step: number): number {
  const v = Math.round(value / step) * step
  return Number(v.toFixed(4)) + 0
}

export function clampAzimuth(deg: number): number {
  if (!Number.isFinite(deg)) return 0
  const turned = ((((deg + 180) % 360) + 360) % 360) - 180
  return round(turned, VIEW.azimuthStepDeg)
}

export function clampElevation(deg: number): number {
  if (!Number.isFinite(deg)) return 0
  return round(Math.min(VIEW.elevationMaxDeg, Math.max(VIEW.elevationMinDeg, deg)), VIEW.azimuthStepDeg)
}

export function clampDolly(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 1
  return round(Math.min(VIEW.dollyMax, Math.max(VIEW.dollyMin, value)), 0.001)
}

export function clampAv(ms: number): number {
  if (!Number.isFinite(ms)) return 0
  return Math.round(Math.min(AV_MAX_MS, Math.max(-AV_MAX_MS, ms))) + 0
}

export function isQuality(value: string | null): value is Quality {
  return value === 'film' || value === 'high' || value === 'low'
}

function isOn(value: string | null): boolean {
  return value === '1' || value === 'true' || value === 'yes'
}

export function readOptions(search: string): Options {
  const p = new URLSearchParams(search)
  const wanted = p.get('mode') ?? 'live'
  const mode: Mode = (MODES as string[]).includes(wanted) ? (wanted as Mode) : 'live'
  const formatId = p.get('format')
  const tier = p.get('tier')
  const assets = p.get('assets')
  const diag = p.get('diag')
  const unit = p.get('unit')
  const quality = p.get('quality')
  const number = (name: string): number | null => {
    const v = p.get(name)
    return v !== null && v.trim() !== '' && Number.isFinite(Number(v)) ? Number(v) : null
  }
  const whole = (name: string, fallback: number): number => {
    const v = number(name)
    return v !== null ? clampFrame(v) : fallback
  }
  let format = config.formats.master
  let formatChosen = false
  if (formatId) {
    try {
      format = formatById(formatId)
      formatChosen = true
    } catch {}
  }
  // A picture of any size, for measuring the page's own time where drawing is slow.
  const w = number('w')
  const h = number('h')
  if (w !== null && h !== null && w >= 16 && h >= 16) {
    format = { ...format, id: 'measure', width: Math.round(w), height: Math.round(h) }
    formatChosen = true
  }
  return {
    mode,
    format,
    tier: tier && isTier(tier) ? tier : mode === 'export' ? 'final' : 'draft',
    assets: assets && isAssetSet(assets) ? assets : 'full',
    frame: whole('frame', 0),
    first: whole('first', 0),
    last: whole('last', frameCount - 1),
    unit: unit && segments.some((s) => s.id === unit) ? unit : null,
    diag: diag && isDiag(diag) ? diag : 'beauty',
    hold: isOn(p.get('hold')),
    loop: isOn(p.get('loop')),
    az: clampAzimuth(number('az') ?? 0),
    el: clampElevation(number('el') ?? 0),
    dolly: clampDolly(number('dolly') ?? 1),
    sky: p.get('sky'),
    only: (p.get('only') ?? '').split(',').map((x) => x.trim()).filter(Boolean),
    view: p.get('view') === 'film' || (p.get('view') ?? '') in views ? (p.get('view') as ViewName) : null,
    quality: isQuality(quality) ? quality : null,
    count: isOn(p.get('count')) || mode === 'capture' || mode === 'export',
    av: clampAv(number('av') ?? 0),
    marks: isOn(p.get('marks')),
    fill: isOn(p.get('fill')),
    chosen: { format: formatChosen, tier: Boolean(tier && isTier(tier)), assets: Boolean(assets && isAssetSet(assets)) },
  }
}

// The shortest query that reads back as the same options: what the mode gives by itself is left out.
export function writeOptions(options: Options): string {
  const base = readOptions(options.mode === 'live' ? '' : `?mode=${options.mode}`)
  const p = new URLSearchParams()
  if (options.mode !== 'live') p.set('mode', options.mode)
  if (options.format.id === 'measure') {
    p.set('w', String(options.format.width))
    p.set('h', String(options.format.height))
  } else if (options.chosen.format || options.format.id !== base.format.id) p.set('format', options.format.id)
  if (options.chosen.tier || options.tier !== base.tier) p.set('tier', options.tier)
  if (options.chosen.assets || options.assets !== base.assets) p.set('assets', options.assets)
  if (options.unit) p.set('unit', options.unit)
  if (options.frame !== base.frame) p.set('frame', String(options.frame))
  if (options.first !== base.first) p.set('first', String(options.first))
  if (options.last !== base.last) p.set('last', String(options.last))
  if (options.diag !== base.diag) p.set('diag', options.diag)
  if (options.az !== 0) p.set('az', String(options.az))
  if (options.el !== 0) p.set('el', String(options.el))
  if (options.dolly !== 1) p.set('dolly', String(options.dolly))
  if (options.sky) p.set('sky', options.sky)
  if (options.only.length) p.set('only', options.only.join(','))
  if (options.view) p.set('view', options.view)
  if (options.quality) p.set('quality', options.quality)
  if (options.count !== base.count) p.set('count', options.count ? '1' : '0')
  if (options.av !== 0) p.set('av', String(options.av))
  if (options.marks) p.set('marks', '1')
  if (options.fill) p.set('fill', '1')
  if (options.hold) p.set('hold', '1')
  if (options.loop) p.set('loop', '1')
  const text = p.toString()
  return text ? `?${text}` : ''
}

// The options another mode opens with: the picture choices somebody made, the frame, the section and what the recorder needs. The live view stays behind.
export function optionsFor(mode: Mode, from: Options): Options {
  const base = readOptions(mode === 'live' ? '' : `?mode=${mode}`)
  return {
    ...base,
    format: from.chosen.format ? from.format : base.format,
    tier: from.chosen.tier ? from.tier : base.tier,
    assets: from.chosen.assets ? from.assets : base.assets,
    frame: from.frame,
    unit: from.unit,
    diag: from.diag,
    av: from.av,
    marks: from.marks,
    fill: from.fill,
    chosen: { ...from.chosen },
  }
}
