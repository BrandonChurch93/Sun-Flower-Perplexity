import type { WorldDef } from '../core/world.ts'

// What the lens needs per world beyond WorldSettings.grade. Kept here by world id until the Builder moves it into the settings.
export interface LensLook {
  // How much more of the scattered light goes into the frame-wide levels than into the tight ones.
  veil: number
  // Strength of the streak and the ghosts.
  flare: number
  // Warm glow of the film base round the hottest edges.
  halation: number
  // How much of its own color a blown highlight keeps on its way to white.
  keep: number
}

const fallback: LensLook = { veil: 1, flare: 0.5, halation: 0.3, keep: 0.25 }

const table: Record<string, Partial<LensLook>> = {
  dawn: { veil: 1.4, flare: 0.7 },
  rain: { flare: 0, halation: 0.2 },
  night: { flare: 0.35, halation: 0.2 },
  frost: { flare: 0.3, halation: 0.15, keep: 0.15 },
  golden: { veil: 2.4, flare: 1, halation: 0.5, keep: 0.3 },
}

export function lensLook(def: WorldDef): LensLook {
  return { ...fallback, ...(table[def.id] ?? {}) }
}
