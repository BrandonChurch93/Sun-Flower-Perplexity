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
  // Color of the glass's bloom hard by the sun and out in its halo, and of the lit air.
  glowNear: readonly [number, number, number]
  glowFar: readonly [number, number, number]
  airTint: readonly [number, number, number]
  // Radius, in frame widths, of the flat burnt out disc a sun in mist shows. 0 draws none.
  disc: number
  // Above 0 the thin rays are those of a sun just over the land: this many round the circle, drawn only below and beside it, `rayLen` frame widths long at most and `rayWide` times the usual width.
  lowRays: number
  rayLen: number
  rayWide: number
  // Extra slope through the upper half of the tones.
  punch: number
  // White a burning color takes on at the very top.
  pale: number
  // Slope left to bright greens above their shade: 1 leaves them alone.
  greens: number
  // Where the last bend begins and its height above that: the brightest value the frame can hold is `knee` plus `top`.
  knee: number
  top: number
  // How far the brightest light loses its hue toward white.
  whiten: number
  // Least reach of the out of focus fill as a share of the blur circle: above 0 it softens the disc's edge at high sample counts.
  soft: number
  // Share of the grade's lift taken back out of true black, per channel. It fades as the picture brightens, so only the deepest shade moves.
  black: readonly [number, number, number]
  // 1 where the world has small lights in the air that the blur should draw as discs; 0 holds every lone bright pixel down as noise.
  specks: number
  // 1 where the sky holds points of light: a sky pixel is then never spread itself and only takes the copies of blurred things in front of it.
  skyHold: number
}

const fallback: LensLook = { veil: 1, veilTint: [1, 1, 1], flare: 0.5, halation: 0.3, keep: 0.25, core: 1, star: 0, glow: 0, shafts: 0, rays: 0, sunClear: 0, glowNear: [1, 0.9, 0.76], glowFar: [1, 0.5, 0.2], airTint: [1, 0.4, 0.12], disc: 0, lowRays: 0, rayLen: 0.1, rayWide: 1, punch: 0, pale: 0, greens: 1, knee: 0.88, top: 0.12, whiten: 0, soft: 0, black: [0, 0, 0], specks: 0, skyHold: 0 }

const table: Record<string, Partial<LensLook>> = {
  dawn: { veil: 1.4, flare: 0, knee: 0.82, top: 0.07, whiten: 0.5, specks: 1, glow: 0.004, sunClear: 60, glowNear: [1, 0.97, 0.92], glowFar: [0.3, 0.2, 0.12], disc: 0.031, shafts: 0.008, rays: 3, lowRays: 36, rayLen: 0.11, rayWide: 1, airTint: [1, 0.62, 0.36] },
  rain: { flare: 0, halation: 0.2 },
  night: { veil: 0, flare: 0, halation: 0.2, skyHold: 1 },
  frost: { flare: 0.3, halation: 0.15, keep: 0.15 },
  golden: { veil: 1.6, veilTint: [1.15, 0.62, 0.3], flare: 0, halation: 0.5, keep: 0.3, core: 3.2, star: 0, glow: 0.065, shafts: 0.008, rays: 1.2, sunClear: 63.6, punch: 0.23, pale: 0.075, greens: 0.45, top: 0.05, whiten: 0.7, soft: 0.28, black: [1, 0.55, 1], specks: 1 },
}

export function lensLook(def: WorldDef): LensLook {
  return { ...fallback, ...(table[def.id] ?? {}) }
}
