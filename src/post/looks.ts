import { clamp, smoothstep } from '../core/curves.ts'
import { shared } from '../core/shading.ts'
import type { RGB, WorldDef } from '../core/world.ts'
import type { Moment } from '../v2/api.ts'
import { weightsAt, type LookWeights } from '../v2/look.ts'
import { outside, type SunInFrame } from './sun.ts'

// What the glass and the film stock do in one kind of light. A frame is a blend of these by the weights of the kinds, so nothing here can jump.
interface Stock {
  // How much more of the scattered light goes into the frame-wide levels than into the tight ones, and into the tightest.
  veil: number
  core: number
  // Warm glow of the film base round the hottest edges.
  halation: number
  // How much of its own colour a blown highlight keeps on its way to white.
  keep: number
  // Extra slope through the upper half of the tones.
  punch: number
  // White a burning colour takes on at the very top.
  pale: number
  // Slope left to bright greens above their shade: 1 leaves them alone.
  greens: number
  // Where the last bend begins and its height above that: the brightest value the frame can hold is `knee` plus `top`.
  knee: number
  top: number
  // How far the brightest light loses its hue toward white.
  whiten: number
  // Share of the grade's lift taken back out of true black.
  black: RGB
  // Times the grade's grain.
  grain: number
  // How much of small lights out of focus is drawn as discs, against held down as noise.
  specks: number
}

const DAY: Stock = { veil: 1, core: 1, halation: 0.3, keep: 0.25, punch: 0.1, pale: 0.03, greens: 0.8, knee: 0.88, top: 0.09, whiten: 0.35, black: [0.5, 0.5, 0.5], grain: 1, specks: 0.5 }
const WARM: Stock = { veil: 1.2, core: 1.2, halation: 0.5, keep: 0.3, punch: 0.16, pale: 0.05, greens: 0.5, knee: 0.88, top: 0.07, whiten: 0.45, black: [1, 0.55, 1], grain: 1.2, specks: 1 }
const STORM: Stock = { veil: 0.9, core: 1, halation: 0.2, keep: 0.25, punch: 0.1, pale: 0, greens: 0.8, knee: 0.88, top: 0.1, whiten: 0.3, black: [0.6, 0.6, 0.6], grain: 1.2, specks: 0.5 }
const FROST: Stock = { veil: 1.4, core: 1, halation: 0.15, keep: 0.15, punch: 0.06, pale: 0.02, greens: 0.8, knee: 0.82, top: 0.07, whiten: 0.5, black: [0.4, 0.4, 0.4], grain: 1.3, specks: 1 }
const NIGHT: Stock = { veil: 0.3, core: 1, halation: 0.2, keep: 0.25, punch: 0.04, pale: 0, greens: 1, knee: 0.88, top: 0.1, whiten: 0.2, black: [0.3, 0.3, 0.3], grain: 1.3, specks: 0.5 }

export interface LensLook extends Stock {
  // Times the grade's bloom: the lightning opens it for a few frames.
  bloom: number
  // The sun's light at the lens, in the frame's exposed units, as the air has coloured it: zero when cloud, mist or the land has taken it.
  sun: RGB
  // The colour of the lit air toward the sun, brightest channel 1.
  air: RGB
  // How thick the air is between the lens and the sun, 0 clear to 1.
  haze: number
  // The light the mist has taken out of the sun's beam and holds close round the disc, and the warm bloom of a low evening sun, both as times the glow.
  mist: number
  warm: number
  // The glass round the sun: the core and its glow, the veil over the whole frame, and the light standing in the air.
  glare: number
  veilSun: number
  shafts: number
  // How far the shafts lean to the air under the sun: 1 under a deck that has just torn.
  fan: number
  // How hard the scattered light is held under white: only the lightning asks for it.
  cap: number
}

const lum = (c: readonly number[]): number => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
const weights: LookWeights = { day: 1, warm: 0, storm: 0, frost: 0, night: 0 }
const kinds: [keyof LookWeights, Stock][] = [['day', DAY], ['warm', WARM], ['storm', STORM], ['frost', FROST], ['night', NIGHT]]
const scalars = ['veil', 'core', 'halation', 'keep', 'punch', 'pale', 'greens', 'knee', 'top', 'whiten', 'grain', 'specks'] as const

export function blankLens(): LensLook {
  return { ...DAY, black: [0, 0, 0], bloom: 1, sun: [0, 0, 0], air: [1, 1, 1], haze: 0, mist: 0, warm: 0, glare: 0, veilSun: 0, shafts: 0, fan: 0, cap: 0 }
}

// The lens of one instant: the stock from the kinds of light, the sun from the frame's own light and from where it stands.
export function lensAt(now: Moment, def: WorldDef, sun: SunInFrame | null, aspect: number, out: LensLook): LensLook {
  weightsAt(now, weights)
  const total = weights.day + weights.warm + weights.storm + weights.frost + weights.night
  for (const key of scalars) out[key] = 0
  out.black[0] = out.black[1] = out.black[2] = 0
  for (const [name, stock] of kinds) {
    const w = weights[name] / total
    for (const key of scalars) out[key] += w * stock[key]
    for (let i = 0; i < 3; i++) out.black[i] += w * stock.black[i]
  }
  const d = now.dials
  out.bloom = 1 + 1.6 * d.flash
  out.veil *= 1 + 0.6 * d.flash

  const e = def.grade.exposure
  const counts = sun && now.lightKind === 'sun' ? sun.weight : 0
  const sky = def.air ? def.air.sun : def.sun.color
  for (let i = 0; i < 3; i++) out.sun[i] = sky[i] * e * counts
  const toSun = shared.uSkyHorizonSun.value
  const top = Math.max(toSun.x, toSun.y, toSun.z, 1e-6)
  out.air[0] = toSun.x / top
  out.air[1] = toSun.y / top
  out.air[2] = toSun.z / top
  // A low sun shines through many times the air of a high one, and the evening of the bloom is hazier than the mornings.
  const low = 1 - smoothstep(2, 16, now.sunElevationDeg)
  out.haze = clamp(Math.max(d.fog, 0.7 * d.rain, low * (0.3 + 0.7 * d.evening)))
  out.mist = (d.fog * (1 - d.sunThrough)) / Math.max(d.sunThrough, 0.15)
  out.warm = low * (0.3 + 0.7 * d.evening) * (1 - d.fog)
  // Once the disc has left the frame the veil and the shafts thin out over half a frame height, so a sun that crosses the edge in one frame of the time lapse takes ten to leave the glass.
  const out01 = sun ? outside(sun.x, sun.y, aspect) : 0
  const edge = 1 - smoothstep(0, 0.6, out01)
  out.glare = 1
  out.veilSun = edge * edge
  // The shafts stand in the frame only with the sun: they open over the first tenth of a frame height inside the edge and are gone at it.
  const near = sun ? smoothstep(0, 0.1, Math.min(sun.x * aspect, (1 - sun.x) * aspect, sun.y, 1 - sun.y)) : 0
  out.shafts = near * clamp(Math.max(d.burst, 0.6 * d.fog, 0.7 * low * (0.3 + 0.7 * d.evening)))
  out.fan = d.burst
  out.cap = 0.7 * d.flash
  return out
}

export { lum }
