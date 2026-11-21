import { config, frameCount, type AssetSetId, type Format, type TierId } from '../config.ts'
import { isDiag, type DiagName } from '../core/shading.ts'
import { formatById, isAssetSet, isTier } from '../core/tiers.ts'
import { clampFrame, segments } from './timeline.ts'

export type Mode = 'live' | 'autopilot' | 'capture' | 'export'
const MODES: Mode[] = ['live', 'autopilot', 'capture', 'export']

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
}

export function readOptions(search: string): Options {
  const p = new URLSearchParams(search)
  const wanted = p.get('mode') ?? 'live'
  const mode: Mode = (MODES as string[]).includes(wanted) ? (wanted as Mode) : 'live'
  const heavy = mode === 'capture' || mode === 'export'
  const formatId = p.get('format')
  const tier = p.get('tier')
  const assets = p.get('assets')
  const diag = p.get('diag')
  const unit = p.get('unit')
  const whole = (name: string, fallback: number): number => {
    const v = p.get(name)
    return v !== null && v.trim() !== '' && Number.isFinite(Number(v)) ? clampFrame(Number(v)) : fallback
  }
  return {
    mode,
    format: formatId ? formatById(formatId) : heavy ? config.formats.master : config.formats.preview,
    tier: tier && isTier(tier) ? tier : mode === 'export' ? 'final' : 'draft',
    assets: assets && isAssetSet(assets) ? assets : heavy ? 'full' : 'web',
    frame: whole('frame', 0),
    first: whole('first', 0),
    last: whole('last', frameCount - 1),
    unit: unit && segments.some((s) => s.id === unit) ? unit : null,
    diag: diag && isDiag(diag) ? diag : 'beauty',
  }
}
