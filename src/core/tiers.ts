import { config, type TierId, type FormatKey, type Format, type AssetSetId } from '../config.ts'

export const tierIds = Object.keys(config.tiers) as TierId[]

export function isTier(id: string): id is TierId {
  return (tierIds as string[]).includes(id)
}

export function samplesOf(tier: TierId): number {
  return config.tiers[tier].samplesPerFrame
}

export function formatById(id: string): Format {
  for (const key of Object.keys(config.formats) as FormatKey[]) {
    const f = config.formats[key]
    if (f.id === id || key === id) return f
  }
  throw new Error(`unknown format "${id}"`)
}

export function isAssetSet(id: string): id is AssetSetId {
  return id in config.assetSets
}
