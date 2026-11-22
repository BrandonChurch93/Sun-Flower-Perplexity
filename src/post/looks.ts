import { segmentStart } from '../config.ts'
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
  // Brightness of the hottest patch of an uncovered sun in the master format, which the shafts never fall below six tenths of and the bloom is measured against. 0 leaves both tied to what shows.
  sunClear: number
  // Color of the glass's bloom hard by the sun and out in its halo, and of the lit air.
  glowNear: readonly [number, number, number]
  glowFar: readonly [number, number, number]
  airTint: readonly [number, number, number]
  // Radius, in frame widths, of the flat burnt out disc a sun in mist shows. 0 draws none.
  disc: number
  // Above 0 the sun stands just over the land in mist: no rays, a gold bloom in the air that falls off over `bloomWide` frame widths, as strong as `rays`, and a warm flare in the glass of strength `lowFlare`.
  lowSun: number
  bloomWide: number
  lowFlare: number
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
  // Times the grade's grain.
  grain: number
  // Radius, in pixels of a frame as high as the master format, by which the air softens what stands beyond the field: the far land, the sky and the edge between them. Nothing nearer is touched.
  air: number
  // How far the lit air round the sun breaks into wide spokes, above the sun and below it.
  spokes: number
}

const fallback: LensLook = { veil: 1, veilTint: [1, 1, 1], flare: 0.5, halation: 0.3, keep: 0.25, core: 1, star: 0, glow: 0, shafts: 0, rays: 0, sunClear: 0, glowNear: [1, 0.9, 0.76], glowFar: [1, 0.5, 0.2], airTint: [1, 0.4, 0.12], disc: 0, lowSun: 0, bloomWide: 0.1, lowFlare: 1, punch: 0, pale: 0, greens: 1, knee: 0.88, top: 0.12, whiten: 0, soft: 0, black: [0, 0, 0], specks: 0, skyHold: 0, grain: 1, air: 0, spokes: 0 }

const table: Record<string, Partial<LensLook>> = {
  dawn: { grain: 1.35, star: 0.025, veil: 1.4, veilTint: [1.1, 0.72, 0.45], flare: 0, knee: 0.82, top: 0.07, whiten: 0.5, specks: 1, glow: 0.004, sunClear: 60, glowNear: [1, 0.97, 0.92], glowFar: [0.3, 0.2, 0.12], disc: 0.031, shafts: 0.008, rays: 0.8, lowSun: 1, bloomWide: 0.2, lowFlare: 0.08, airTint: [1, 0.56, 0.3] },
  rain: { flare: 0, halation: 0.2 },
  night: { veil: 0, flare: 0, halation: 0.2, skyHold: 1 },
  frost: { flare: 0.3, halation: 0.15, keep: 0.15 },
  golden: { veil: 1.2, veilTint: [1.15, 0.62, 0.3], flare: 0, halation: 0.5, keep: 0.3, core: 1.2, star: 0, glow: 0.004, shafts: 0.008, rays: 1.2, sunClear: 63.6, punch: 0.23, pale: 0.075, greens: 0.45, top: 0.05, whiten: 0.7, soft: 0.28, black: [1, 0.55, 1], specks: 1 },
}

// From the field's start the lens stands back over the whole field with the sun in the open: these come in over the two seconds after it, and every frame up to it is drawn as before.
const FIELD_FROM_S = segmentStart('field')
const FIELD_FULL_S = 54
const overField = { grain: 2.1, air: 3, spokes: 1, glow: 0.002, core: 1 }
const fieldBlack: readonly [number, number, number] = [0.5, 0.6, 0.5]
// The field's grade: softer, less saturated, its shade neutral and a little lifted.
const fieldGrade: WorldDef['grade'] = { exposure: 0.78, contrast: 1.22, white: 9, saturation: 0.98, gain: [1.06, 1, 0.91], lift: [0.0024, 0.0048, 0.0038], bloom: 0.13, bloomKnee: 1.1, vignette: 0.3, grain: 0.012 }

function fieldShare(def: WorldDef, timeS: number): number {
  if (def.id !== 'golden' || timeS <= FIELD_FROM_S) return 0
  const t = Math.min(1, (timeS - FIELD_FROM_S) / (FIELD_FULL_S - FIELD_FROM_S))
  return t * t * (3 - 2 * t)
}

const blend = (a: number, b: number, w: number): number => a + (b - a) * w
const blend3 = (a: readonly [number, number, number], b: readonly [number, number, number], w: number): [number, number, number] => [blend(a[0], b[0], w), blend(a[1], b[1], w), blend(a[2], b[2], w)]

export function gradeOf(def: WorldDef, timeS: number): WorldDef['grade'] {
  const w = fieldShare(def, timeS)
  if (w === 0) return def.grade
  const a = def.grade
  const b = fieldGrade
  return {
    exposure: blend(a.exposure, b.exposure, w),
    contrast: blend(a.contrast, b.contrast, w),
    white: blend(a.white, b.white, w),
    saturation: blend(a.saturation, b.saturation, w),
    gain: blend3(a.gain, b.gain, w),
    lift: blend3(a.lift, b.lift, w),
    bloom: blend(a.bloom, b.bloom, w),
    bloomKnee: blend(a.bloomKnee, b.bloomKnee, w),
    vignette: blend(a.vignette, b.vignette, w),
    grain: blend(a.grain, b.grain, w),
  }
}

export function lensLook(def: WorldDef, timeS = 0): LensLook {
  const look = { ...fallback, ...(table[def.id] ?? {}) }
  const w = fieldShare(def, timeS)
  if (w === 0) return look
  for (const key of Object.keys(overField) as (keyof typeof overField)[]) look[key] += (overField[key] - look[key]) * w
  look.black = blend3(look.black, fieldBlack, w)
  return look
}
