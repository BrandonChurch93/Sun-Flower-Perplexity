import type { WorldDef } from '../core/world.ts'

// What the lens needs per world beyond WorldSettings.grade. Kept here by world id until the Builder moves it into the settings.
export interface LensLook {
  // How much more of the scattered light goes into the frame-wide levels than into the tight ones.
  veil: number
  // Color of those frame-wide levels: the air between the lens and a low sun is not white.
  veilTint: readonly [number, number, number]
  // Strength of the streak and the ghosts.
  flare: number
  // Warm glow of the film base round the hottest edges.
  halation: number
  // How much of its own color a blown highlight keeps on its way to white.
  keep: number
  // How much more of the scattered light stays close round its source.
  core: number
  // Strength of the star the aperture blades draw round the sun.
  star: number
  // Bloom of the glass round a sun in the frame, and the lit air round it: soft shafts and a warm spill.
  glow: number
  shafts: number
  // Strength of the thin rays out of the sun against the wide shafts.
  rays: number
  // Brightness of the hottest patch of an uncovered sun at 16x9, which the shafts never fall below six tenths of and the bloom is measured against. 0 leaves both tied to what shows.
  sunClear: number
  // Extra slope through the upper half of the tones.
  punch: number
  // White a burning color takes on at the very top.
  pale: number
  // Slope left to bright greens above their shade: 1 leaves them alone.
  greens: number
  // Height of the last bend above 0.88: the brightest value the frame can hold is 0.88 plus this.
  top: number
  // How far the brightest light loses its hue toward white.
  whiten: number
  // Least reach of the out of focus fill as a share of the blur circle: above 0 it softens the disc's edge at high sample counts.
  soft: number
  // Share of the grade's lift taken back out of true black, per channel. It fades as the picture brightens, so only the deepest shade moves.
  black: readonly [number, number, number]
  // 1 where the world has small lights in the air that the blur should draw as discs; 0 holds every lone bright pixel down as noise.
  specks: number
}

const fallback: LensLook = { veil: 1, veilTint: [1, 1, 1], flare: 0.5, halation: 0.3, keep: 0.25, core: 1, star: 0, glow: 0, shafts: 0, rays: 0, sunClear: 0, punch: 0, pale: 0, greens: 1, top: 0.12, whiten: 0, soft: 0, black: [0, 0, 0], specks: 0 }

const table: Record<string, Partial<LensLook>> = {
  dawn: { veil: 1.4, flare: 0.7 },
  rain: { flare: 0, halation: 0.2 },
  night: { flare: 0.35, halation: 0.2 },
  frost: { flare: 0.3, halation: 0.15, keep: 0.15 },
  golden: { veil: 1.6, veilTint: [1.15, 0.62, 0.3], flare: 0, halation: 0.5, keep: 0.3, core: 3.2, star: 0, glow: 0.065, shafts: 0.008, rays: 3.5, sunClear: 63.6, punch: 0.23, pale: 0.075, greens: 0.45, top: 0.05, whiten: 0.7, soft: 0.28, black: [0.6, 0.36, 0.95], specks: 1 },
}

export function lensLook(def: WorldDef): LensLook {
  return { ...fallback, ...(table[def.id] ?? {}) }
}
