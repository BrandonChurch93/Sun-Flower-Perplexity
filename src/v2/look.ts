import { clamp, lerp, smoothstep } from '../core/curves.ts'
import type { RGB, WorldDef } from '../core/world.ts'
import type { Moment, SkyLight } from './api.ts'

type Grade = WorldDef['grade']

// The grade of each kind of light. Every frame is a blend of these by what the sky is doing.
const DAY: Grade = { exposure: 1, contrast: 1.25, white: 8, saturation: 1.0, gain: [1, 1, 1], lift: [0.001, 0.002, 0.003], bloom: 0.08, bloomKnee: 1.1, vignette: 0.3, grain: 0.012 }
const WARM: Grade = { exposure: 1, contrast: 1.29, white: 9, saturation: 1.05, gain: [1.03, 1, 0.96], lift: [0.0012, 0.003, 0.0036], bloom: 0.12, bloomKnee: 1.1, vignette: 0.3, grain: 0.012 }
const STORM: Grade = { exposure: 1, contrast: 1.42, white: 4.5, saturation: 0.84, gain: [1.01, 1, 1], lift: [0.0003, 0.0006, 0.0015], bloom: 0.06, bloomKnee: 1.2, vignette: 0.34, grain: 0.014 }
const FROST: Grade = { exposure: 1, contrast: 1.24, white: 6, saturation: 1.0, gain: [0.98, 1, 1.04], lift: [0.0015, 0.003, 0.002], bloom: 0.1, bloomKnee: 1.0, vignette: 0.28, grain: 0.013 }
const NIGHT: Grade = { exposure: 1, contrast: 1.4, white: 5, saturation: 0.92, gain: [0.92, 1, 0.98], lift: [0.0012, 0.0028, 0.0028], bloom: 0.07, bloomKnee: 0.9, vignette: 0.36, grain: 0.016 }

// How bright the open sky lands on the screen in each kind of light, before the curve: the camera's exposure follows the light as a time-lapse camera does, and gives way in the dark.
const LEVEL = { day: 0.5, warm: 0.42, storm: 0.26, frost: 0.52, night: 0.05 }

const SOIL: RGB = [0.2, 0.15, 0.1]
const lum = (c: RGB): number => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]

type Knots = readonly (readonly [number, number])[]
function along(knots: Knots, x: number): number {
  if (x <= knots[0][0]) return knots[0][1]
  for (let i = 1; i < knots.length; i++) {
    if (x <= knots[i][0]) return lerp(knots[i - 1][1], knots[i][1], smoothstep(knots[i - 1][0], knots[i][0], x))
  }
  return knots[knots.length - 1][1]
}

// How bright the light lands on what it lights, on the screen and before the curve, by how high the sun stands. The sky gives the colour of the light and the look gives its level: a low sun is a weak lamp beside its own sky, and a camera that held the sky would lose the plant.
// Under the horizon the key is the glow the sun leaves in the sky: it fades to nothing at 5 degrees, where the moon takes over.
// The moon is a rim and no more: at the handover the fill alone lights the plant, and nothing the moon lights may stand brighter at midnight than it stood then.
const KEY: Knots = [[-5, 0], [-4, 0.14], [-2.5, 0.5], [-1, 1.05], [0, 1.7], [1, 2.9], [2.5, 4], [4, 4.2], [10, 4.2], [25, 3.4], [45, 2.9], [90, 2.7]]
const MOON_KEY = 0.55
// The moon's light as a camera set for daylight sees it beside the blue hour: cold, so that a leaf keeps the colour it had at dusk.
const MOON_CAST: RGB = [0.5, 0.86, 1.8]
const FILL_LOW: Knots = [[-14, 0.17], [-10, 0.19], [-6, 0.26], [-3, 0.34], [0, 0.42], [5, 0.5], [25, 0.55]]
const FILL_HIGH: Knots = [[-14, 0.095], [-10, 0.105], [-6, 0.14], [-3, 0.15], [0, 0.15], [5, 0.16], [25, 0.2]]
// How much of the sky near the sun colours the fill from the horizon: none in the blue hour, when the glow is a thin band and the dome lights the soil.
const FILL_WARMTH = 0.25
// How much of the dome's own colour the fill from above keeps: at full strength a shaded leaf reads blue grey under a clear sky.
const FILL_COLOUR = 0.45
const FILL_STORM = { low: 0.8, high: 0.24, key: 0.24 }
const FILL_FROST = { low: 0.3, high: 0.22 }
const FLASH = { key: 2.4, fill: 1.2, color: [0.86, 0.94, 1.22] as RGB }
// A sun that comes through a tear in a deck lights from behind and the lens holds the sky: this much of it is lost on the plant under a full deck.
const UNDER_DECK = 0.6
// The redder the sun, the less a green leaf has to give back: the key keeps at least this much green and blue beside its red.
const KEY_FLOOR = { green: 0.45, blue: 0.14 }

export interface LookWeights { day: number; warm: number; storm: number; frost: number; night: number }

export function weightsAt(now: Moment, out: LookWeights): LookWeights {
  const d = now.dials
  const night = now.night
  const storm = d.overcast * (1 - night)
  const frost = clamp(d.fog * 1.2) * (1 - night) * (1 - storm)
  const low = 1 - smoothstep(4, 24, now.sunElevationDeg)
  const warm = Math.max(low, d.evening) * (1 - night) * (1 - storm) * (1 - frost)
  out.night = night
  out.storm = storm
  out.frost = frost
  out.warm = warm
  out.day = Math.max(0, 1 - night - storm - frost - warm)
  return out
}

export function blankLook(): WorldDef {
  return {
    id: 'place',
    lock: null,
    standIn: false,
    sun: { azimuthDeg: 180, elevationDeg: 45, color: [1, 1, 1], softnessDeg: 1.2, lean: 1, lift: 1 },
    sky: { zenith: [0, 0, 0], horizon: [0, 0, 0], bounce: [0, 0, 0], ambient: 1, glow: [0, 0, 0], glowPower: 8, disc: 0, even: 0 },
    air: { sun: [0, 0, 0], zenith: [0, 0, 0], horizon: [0, 0, 0] },
    backdrop: { file: null, key: '', sunAt: null, gain: 1, blur: 0.25 },
    fog: { color: [0, 0, 0], sunTint: [0, 0, 0], density: 0, falloff: 1 },
    grade: { ...DAY, gain: [1, 1, 1], lift: [0, 0, 0] },
    ground: { wet: 0, frost: 0, dew: 0, plantWet: 0 },
    wind: 0,
  }
}

const w: LookWeights = { day: 1, warm: 0, storm: 0, frost: 0, night: 0 }
const tint: RGB = [0, 0, 0]
const round: RGB = [0, 0, 0]
const mix = (pick: (g: Grade) => number): number => w.day * pick(DAY) + w.warm * pick(WARM) + w.storm * pick(STORM) + w.frost * pick(FROST) + w.night * pick(NIGHT)

// The settings of one frame, from the instant and from what the sky says about its own light. The sky and the light on the plant are one thing.
export function lookAt(now: Moment, sky: SkyLight, out: WorldDef): WorldDef {
  const d = now.dials
  weightsAt(now, w)
  const total = w.day + w.warm + w.storm + w.frost + w.night
  w.day /= total
  w.warm /= total
  w.storm /= total
  w.frost /= total
  w.night /= total

  const level = w.day * LEVEL.day + w.warm * LEVEL.warm + w.storm * LEVEL.storm + w.frost * LEVEL.frost + w.night * LEVEL.night
  // What the meter reads: the open sky away from the sun, with a share of the sky near it and of the sun itself.
  const meter = 0.5 * lum(sky.horizon) + 0.2 * lum(sky.horizonSun) + 0.3 * lum(sky.zenith) + 0.02 * lum(sky.direct) * Math.max(now.light.y, 0) * (now.lightKind === 'sun' ? d.sunThrough : 0)
  const exposure = level / Math.max(meter, 1e-5)

  const el = now.sunElevationDeg
  const closed = d.overcast * (1 - d.sunThrough)
  const open = d.sunThrough * (1 - UNDER_DECK * d.overcast)
  const through = Math.max(open, FILL_STORM.key * closed)
  const key = now.lightKind === 'sun' ? along(KEY, el) * through : MOON_KEY * smoothstep(5, 9, -el) * (1 - 0.85 * d.overcast)
  const flash = d.flash
  out.sun.azimuthDeg = (Math.atan2(now.light.x, now.light.z) * 180) / Math.PI
  out.sun.elevationDeg = (Math.asin(clamp(now.light.y, -1, 1)) * 180) / Math.PI
  // The colour of the key: the sun with a share of the bright sky round it, and under a closed deck the bright gap alone.
  for (let i = 0; i < 3; i++) tint[i] = lerp(sky.direct[i] + 0.3 * sky.horizonSun[i], sky.horizonSun[i], now.lightKind === 'sun' ? closed : 0)
  if (now.lightKind === 'sun') {
    tint[1] = Math.max(tint[1], KEY_FLOOR.green * tint[0])
    tint[2] = Math.max(tint[2], KEY_FLOOR.blue * tint[0])
  } else {
    for (let i = 0; i < 3; i++) tint[i] *= MOON_CAST[i]
  }
  const tintLum = Math.max(lum(tint), 1e-6)
  for (let i = 0; i < 3; i++) out.sun.color[i] = ((tint[i] / tintLum) * key * (1 - flash) + FLASH.color[i] * FLASH.key * flash) / exposure
  const glow = now.lightKind === 'sun' ? smoothstep(0, 3, -el) : 0
  out.sun.softnessDeg = lerp(lerp(1.2, 20, clamp(Math.max(d.fog * 1.1, d.overcast, 1 - d.sunThrough, glow))), 5, flash)
  out.sun.lean = 1
  out.sun.lift = 1

  const day = w.day + w.warm + w.night
  const low = (day * along(FILL_LOW, el) + w.storm * FILL_STORM.low + w.frost * FILL_FROST.low) * (1 + FLASH.fill * flash)
  const high = (day * along(FILL_HIGH, el) + w.storm * FILL_STORM.high + w.frost * FILL_FROST.high) * (1 + FLASH.fill * flash)
  const warmth = FILL_WARMTH * smoothstep(-4, 0.5, el)
  for (let i = 0; i < 3; i++) round[i] = lerp(sky.horizon[i], sky.horizonSun[i], warmth)
  const roundLum = Math.max(lum(round), 1e-6)
  const zenithLum = Math.max(lum(sky.zenith), 1e-6)
  for (let i = 0; i < 3; i++) {
    out.sky.zenith[i] = (lerp(1, sky.zenith[i] / zenithLum, FILL_COLOUR) * high) / exposure
    out.sky.horizon[i] = ((round[i] / roundLum) * low) / exposure
    out.sky.bounce[i] = SOIL[i] * (0.5 * (out.sky.horizon[i] + out.sky.zenith[i]) + (out.sun.color[i] * Math.max(now.light.y, 0)) / Math.PI)
  }
  out.sky.ambient = 1
  // The air keeps the sky's own light, so that rain, mist and the glass sit in the sky's picture whatever the look does to the plant.
  const air = out.air as NonNullable<WorldDef['air']>
  const shows = now.lightKind === 'sun' ? open * smoothstep(-1, 0.6, el) : smoothstep(5, 9, -el) * (1 - 0.85 * d.overcast)
  for (let i = 0; i < 3; i++) {
    air.sun[i] = sky.direct[i] * shows
    air.zenith[i] = sky.zenith[i]
    air.horizon[i] = sky.horizon[i]
  }
  out.sky.even = clamp(Math.max(d.fog, 0.8 * d.overcast, 0.6 * now.night))

  const thick = d.fog * d.fog
  out.fog.density = 0.0016 + 0.0115 * thick + 0.006 * d.rain
  out.fog.falloff = lerp(lerp(0.6, 1.7, clamp(d.fog * 1.25)), 0.25, d.rain)
  const veil = lerp(0.42, 0.72, clamp(d.fog))
  const toLight = now.lightKind === 'sun' ? smoothstep(-5, -2, el) : 0.2 * smoothstep(5, 9, -el)
  for (let i = 0; i < 3; i++) {
    out.fog.color[i] = sky.horizon[i] * veil
    out.fog.sunTint[i] = Math.max(0, sky.horizonSun[i] - sky.horizon[i]) * veil * lerp(0.55, 0.3, d.overcast) * toLight
  }

  const g = out.grade
  g.contrast = mix((x) => x.contrast)
  g.white = mix((x) => x.white)
  g.saturation = mix((x) => x.saturation)
  g.bloom = mix((x) => x.bloom)
  g.bloomKnee = mix((x) => x.bloomKnee)
  g.vignette = mix((x) => x.vignette)
  g.grain = mix((x) => x.grain)
  for (let i = 0; i < 3; i++) {
    g.gain[i] = mix((x) => x.gain[i])
    g.lift[i] = mix((x) => x.lift[i])
  }
  g.exposure = exposure

  out.ground.wet = d.wet
  out.ground.frost = d.frost
  out.ground.dew = d.dew
  out.ground.plantWet = d.wet
  out.wind = d.wind
  return out
}
