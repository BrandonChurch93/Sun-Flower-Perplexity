import * as THREE from 'three'
import { config, frameCount } from '../config.ts'
import { clamp } from '../core/curves.ts'
import type { Dials, Moment } from './api.ts'
import {
  barAt,
  burstAtBar,
  coldAtBar,
  coverAtBar,
  dewAtBar,
  dropAtBar,
  dropFallAtBar,
  eveningAtBar,
  flashAt,
  fogAtBar,
  frostAtBar,
  hitTime,
  lapseAt,
  overcastAtBar,
  puddleAtBar,
  rainAtBar,
  sunThroughAtBar,
  tauAtBar,
  wetAtBar,
  windAtBar,
  worldAtBar,
} from './clock.ts'
import { direction, moonDirection, sunAzimuthAt, sunElevationAt } from './sun.ts'
import { windWay } from './wind.ts'
import { plantFeels } from './inputs.ts'

const FPS = config.film.fps
export const shutterSeconds = config.film.shutterDegrees / 360 / FPS

const smooth = (x: number): number => {
  const t = clamp(x)
  return t * t * (3 - 2 * t)
}

// The clouds travel with the wind: toward the lens and to its right.
const DRIFT_X = windWay.x
const DRIFT_Z = windWay.z
// Kilometres a second at the cloud base: in real time, added by the wind dial, and added by the fastest time lapse.
const DRIFT_REAL = 0.012
const DRIFT_WIND = 0.03
const DRIFT_LAPSE = 0.75
const EVOLVE_REAL = 0.012
const EVOLVE_LAPSE = 0.42
const STEPS = 4
const STEP = 1 / (FPS * STEPS)

function driftSpeed(seconds: number): number {
  return DRIFT_REAL + DRIFT_WIND * windAtBar(barAt(seconds)) + DRIFT_LAPSE * lapseAt(seconds)
}

function evolveSpeed(seconds: number): number {
  return EVOLVE_REAL + EVOLVE_LAPSE * lapseAt(seconds)
}

const COUNT = (frameCount + 2) * STEPS + 1
const travelled = new Float64Array(COUNT)
const evolved = new Float64Array(COUNT)
for (let i = 1; i < COUNT; i++) {
  const mid = (i - 0.5) * STEP
  travelled[i] = travelled[i - 1] + driftSpeed(mid) * STEP
  evolved[i] = evolved[i - 1] + evolveSpeed(mid) * STEP
}

function tabled(table: Float64Array, seconds: number): number {
  const x = clamp(seconds / STEP, 0, COUNT - 1)
  const i = Math.min(COUNT - 2, Math.floor(x))
  return table[i] + (table[i + 1] - table[i]) * (x - i)
}

// Where the lightning sits: inside the film's frame in the storm hold, left of the plant and high, then right of it.
const FLASHES: { from: number; azimuthDeg: number; elevationDeg: number }[] = [
  { from: hitTime(33), azimuthDeg: 205, elevationDeg: 10.5 },
  { from: hitTime(37), azimuthDeg: 180, elevationDeg: 10.5 },
]

function blankDials(): Dials {
  return { cover: 0, overcast: 0, sunThrough: 1, fog: 0, cold: 0, frost: 0, dew: 0, drop: 0, dropFall: 0, rain: 0, wet: 0, puddle: 0, flash: 0, burst: 0, wind: 0, lapse: 0, evening: 0 }
}

export function blankMoment(): Moment {
  return {
    frame: 0,
    t: 0,
    bar: 0,
    tau: 0,
    world: 0,
    day: 0,
    phase: 0,
    sun: new THREE.Vector3(0, 1, 0),
    moon: moonDirection.clone(),
    sunElevationDeg: 0,
    sunAzimuthDeg: 0,
    light: new THREE.Vector3(0, 1, 0),
    lightKind: 'sun',
    night: 0,
    starTurn: 0,
    cloud: { shiftX: 0, shiftZ: 0, evolve: 0, speedX: 0, speedZ: 0 },
    flashAt: new THREE.Vector3(0, 1, 0),
    dials: blankDials(),
  }
}

// The sun is the light until it stands 5 degrees under the horizon, by then as the glow it leaves in the sky, and the moon is the light from there.
// The key is zero at the change, so nothing may jump with the kind of the light.
export const MOON_FROM_DEG = -5
const GLOW_DEG = 5

export function dialsAt(seconds: number, out: Dials): Dials {
  const b = barAt(seconds)
  out.cover = coverAtBar(b)
  out.overcast = overcastAtBar(b)
  out.sunThrough = sunThroughAtBar(b)
  out.fog = fogAtBar(b)
  out.cold = coldAtBar(b)
  out.frost = frostAtBar(b)
  out.dew = dewAtBar(b)
  out.drop = dropAtBar(b)
  out.dropFall = dropFallAtBar(b)
  out.rain = rainAtBar(b)
  out.wet = wetAtBar(b)
  out.puddle = puddleAtBar(b)
  out.flash = flashAt(seconds)
  out.burst = burstAtBar(b)
  out.wind = windAtBar(b)
  out.lapse = lapseAt(seconds)
  out.evening = eveningAtBar(b)
  return out
}

// The world at rest, for the checks: no weather, no wind, one fixed sun in a clear sky. The plant's clock and the film second run on, so whatever still changes from frame to frame is growth.
const REST = { world: 0.3, azimuthDeg: 205, elevationDeg: 38 }
let still = false

export function setStill(on: boolean): void {
  still = on
  plantFeels.nothing = on
}

function rest(out: Moment): Moment {
  out.world = REST.world
  out.day = 0
  out.phase = REST.world
  out.sunAzimuthDeg = REST.azimuthDeg
  out.sunElevationDeg = REST.elevationDeg
  direction(REST.azimuthDeg, REST.elevationDeg, out.sun)
  out.light.copy(out.sun)
  out.lightKind = 'sun'
  out.night = 0
  out.starTurn = 0
  out.cloud.shiftX = 0
  out.cloud.shiftZ = 0
  out.cloud.speedX = 0
  out.cloud.speedZ = 0
  out.cloud.evolve = 0
  Object.assign(out.dials, blankDials())
  return out
}

export function momentAt(seconds: number, out: Moment): Moment {
  const b = barAt(seconds)
  const world = worldAtBar(b)
  const day = Math.floor(world)
  out.frame = Math.floor(seconds * FPS + 1e-6)
  out.t = seconds
  out.bar = b
  out.tau = tauAtBar(b)
  out.world = world
  out.day = day
  out.phase = world - day
  out.sunElevationDeg = sunElevationAt(world)
  out.sunAzimuthDeg = sunAzimuthAt(world)
  direction(out.sunAzimuthDeg, out.sunElevationDeg, out.sun)
  out.moon.copy(moonDirection)
  if (out.sunElevationDeg > MOON_FROM_DEG) {
    out.lightKind = 'sun'
    const under = clamp(out.sunElevationDeg / MOON_FROM_DEG)
    direction(out.sunAzimuthDeg, Math.max(out.sunElevationDeg, 0.6 + (GLOW_DEG - 0.6) * under * under * (3 - 2 * under)), out.light)
  } else {
    out.lightKind = 'moon'
    out.light.copy(moonDirection)
  }
  out.night = smooth(-out.sunElevationDeg / 12)
  out.starTurn = world * 2 * Math.PI
  const travel = tabled(travelled, seconds)
  const speed = driftSpeed(seconds)
  out.cloud.shiftX = travel * DRIFT_X
  out.cloud.shiftZ = travel * DRIFT_Z
  out.cloud.speedX = speed * DRIFT_X
  out.cloud.speedZ = speed * DRIFT_Z
  out.cloud.evolve = tabled(evolved, seconds)
  let flash = FLASHES[0]
  for (const f of FLASHES) if (seconds >= f.from - 1e-6) flash = f
  direction(flash.azimuthDeg, flash.elevationDeg, out.flashAt)
  dialsAt(seconds, out.dials)
  return still ? rest(out) : out
}

export const now = blankMoment()
export const later = blankMoment()

export function setNow(frame: number): void {
  const seconds = frame / FPS
  momentAt(seconds, now)
  momentAt(seconds + shutterSeconds, later)
  now.frame = frame
  later.frame = frame
}
