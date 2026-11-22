import { clamp, lerp, smoothstep } from '../core/curves.ts'
import type { RGB, WorldDef } from '../core/world.ts'
import type { Moment, SkyLight } from './api.ts'

type Grade = WorldDef['grade']

// The grade of each kind of light. Every frame is a blend of these by what the sky is doing.
const DAY: Grade = { exposure: 1, contrast: 1.25, white: 8, saturation: 1.0, gain: [1, 1, 1], lift: [0.001, 0.002, 0.003], bloom: 0.08, bloomKnee: 1.1, vignette: 0.3, grain: 0.012 }
const WARM: Grade = { exposure: 1, contrast: 1.29, white: 9, saturation: 1.05, gain: [1.03, 1, 0.96], lift: [0.0012, 0.003, 0.0036], bloom: 0.12, bloomKnee: 1.1, vignette: 0.3, grain: 0.012 }
const STORM: Grade = { exposure: 1, contrast: 1.42, white: 4.5, saturation: 0.84, gain: [1.01, 1, 1], lift: [0.0003, 0.0006, 0.0015], bloom: 0.06, bloomKnee: 1.2, vignette: 0.34, grain: 0.014 }
const FROST: Grade = { exposure: 1, contrast: 1.16, white: 6, saturation: 0.95, gain: [1, 1, 1.02], lift: [0.0015, 0.003, 0.002], bloom: 0.1, bloomKnee: 1.0, vignette: 0.28, grain: 0.013 }
const NIGHT: Grade = { exposure: 1, contrast: 1.4, white: 5, saturation: 0.92, gain: [0.92, 1, 0.98], lift: [0.0012, 0.0028, 0.0028], bloom: 0.07, bloomKnee: 0.9, vignette: 0.36, grain: 0.016 }

// How bright the open sky lands on the screen in each kind of light, before the curve: the camera's exposure follows the light as a time-lapse camera does, and gives way in the dark.
const LEVEL = { day: 0.5, warm: 0.42, storm: 0.26, frost: 0.52, night: 0.05 }

const SOIL: RGB = [0.2, 0.15, 0.1]
const lum = (c: RGB): number => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]

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
    backdrop: { file: null, key: '', sunAt: null, gain: 1, blur: 0.25 },
    fog: { color: [0, 0, 0], sunTint: [0, 0, 0], density: 0, falloff: 1 },
    grade: { ...DAY, gain: [1, 1, 1], lift: [0, 0, 0] },
    ground: { wet: 0, frost: 0, dew: 0, plantWet: 0 },
    wind: 0,
  }
}

const w: LookWeights = { day: 1, warm: 0, storm: 0, frost: 0, night: 0 }
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

  const lit = now.lightKind === 'none' ? 0 : now.lightKind === 'sun' ? d.sunThrough * smoothstep(-1, 0.6, now.sunElevationDeg) : smoothstep(5, 9, -now.sunElevationDeg) * (1 - 0.85 * d.overcast)
  out.sun.azimuthDeg = (Math.atan2(now.light.x, now.light.z) * 180) / Math.PI
  out.sun.elevationDeg = (Math.asin(clamp(now.light.y, -1, 1)) * 180) / Math.PI
  for (let i = 0; i < 3; i++) out.sun.color[i] = sky.direct[i] * lit
  out.sun.softnessDeg = lerp(1.2, 20, clamp(Math.max(d.fog * 1.1, d.overcast, 1 - d.sunThrough)))
  out.sun.lean = 1
  out.sun.lift = 1

  const sunLum = lum(out.sun.color) * Math.max(now.light.y, 0)
  for (let i = 0; i < 3; i++) {
    out.sky.zenith[i] = sky.zenith[i]
    out.sky.horizon[i] = sky.horizon[i]
    out.sky.bounce[i] = SOIL[i] * (0.5 * (sky.horizon[i] + sky.zenith[i]) + (out.sun.color[i] * Math.max(now.light.y, 0)) / Math.PI)
  }
  out.sky.ambient = 1
  out.sky.even = clamp(Math.max(d.fog, 0.8 * d.overcast, 0.6 * now.night))

  const thick = d.fog * d.fog
  out.fog.density = 0.0016 + 0.0115 * thick + 0.03 * d.rain
  out.fog.falloff = lerp(lerp(0.6, 1.7, clamp(d.fog * 1.25)), 0.25, d.rain)
  const veil = lerp(0.42, 0.72, clamp(d.fog))
  for (let i = 0; i < 3; i++) {
    out.fog.color[i] = sky.horizon[i] * veil
    out.fog.sunTint[i] = Math.max(0, sky.horizonSun[i] - sky.horizon[i]) * veil * lerp(0.55, 0.3, d.overcast) * (now.lightKind === 'sun' ? 1 : 0.2)
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
  const level = w.day * LEVEL.day + w.warm * LEVEL.warm + w.storm * LEVEL.storm + w.frost * LEVEL.frost + w.night * LEVEL.night
  // What the meter reads: the open sky away from the sun, with a share of the sky near it and of the sunlit ground.
  const meter = 0.5 * lum(sky.horizon) + 0.2 * lum(sky.horizonSun) + 0.3 * lum(sky.zenith) + 0.02 * sunLum
  g.exposure = level / Math.max(meter, 1e-5)

  out.ground.wet = d.wet
  out.ground.frost = d.frost
  out.ground.dew = d.dew
  out.ground.plantWet = d.wet
  out.wind = d.wind
  return out
}
