import { clamp, lerp, smoothstep } from '../core/curves.ts'
import type { PlantInputs } from '../plant/growth.ts'
import type { Moment } from './api.ts'
import { DAY, barAt, coldAtBar, coverAtBar, overcastAtBar, worldAt } from './clock.ts'
import { sunAzimuthAt, sunElevationAt } from './sun.ts'

const RAD = Math.PI / 180
// How much more of the air the leaves feel than the stems: under the rain, where the drops beat on them.
const RAIN_AIR = 2.5
// And in dry air, where a ray or a blade is lighter than the stem that carries it.
const FREE_AIR = 1.5
// How much harder a storm's air leans on a stem than a fair day's.
const STORM_AIR = 1.6
// The sun rises and sets close together in front of the lens, so a true follow would show as a nod in depth alone. The tip swings this many times wider about the day's noon than the sun does.
const SWING = 2.4
// The tip follows where the sun was: these film seconds ago, with these weights. Several, so a turn of the sun is rounded off and never a jerk.
const LAGS = [0.1, 0.24, 0.42, 0.66]
const WEIGHTS = [0.34, 0.3, 0.22, 0.14]
// The top leaves answer the light after this many film seconds and the lowest after this many: a wave from the top down.
const LIFT_TOP = [0.08, 0.2]
const LIFT_LOW = [0.5, 0.72]
// How far the tip leans at night, as a share of its lean toward a low sun: it rests, and it is turned to the dawn before the dawn comes.
const NIGHT_REST = 0.45

function noonAzimuth(world: number): number {
  const day = Math.floor(world)
  const phase = world - day
  const here = sunAzimuthAt(day + 0.5 * DAY)
  return phase < DAY ? here : lerp(here, sunAzimuthAt(day + 1 + 0.5 * DAY), smoothstep(DAY, 1, phase))
}

// The light the leaves stand in at one film second, 0 to 1.
function lightAt(seconds: number): number {
  const b = barAt(seconds)
  const up = smoothstep(-6, 8, sunElevationAt(worldAt(seconds)))
  const over = overcastAtBar(b)
  const cloud = 1 - 0.3 * clamp(coverAtBar(b) - 0.1) * (1 - over)
  return lerp(lerp(lerp(0.1, 1, up * cloud), 0.75, over * up), 0.45, coldAtBar(b))
}

const mean = (lags: number[], seconds: number): number => {
  let sum = 0
  for (const lag of lags) sum += lightAt(Math.max(0, seconds - lag))
  return sum / lags.length
}

// For a proof that nothing grows in a hold: with this on the plant feels nothing, so two frames of one hold are the same picture.
export const plantFeels = { nothing: false }

// What the plant feels at one instant. It leans after the sun and follows it across the day with a lag, lifts its leaves in the light and lets them hang in the dark and the cold, stiffens in frost, and gives to the wind, the gusts and the drops.
export function plantInputsOf(m: Moment): PlantInputs {
  if (plantFeels.nothing) return { leanX: 0, leanZ: 0, lift: 1, wind: 0, real: m.t, steady: true }
  const d = m.dials
  let leanX = 0
  let leanZ = 0
  for (let k = 0; k < LAGS.length; k++) {
    const world = worldAt(Math.max(0, m.t - LAGS[k]))
    const elevation = sunElevationAt(world)
    const noon = noonAzimuth(world)
    const azimuth = (noon + SWING * (sunAzimuthAt(world) - noon)) * RAD
    const reach = lerp(NIGHT_REST, 1, smoothstep(-8, 5, elevation)) * Math.cos(Math.max(0, elevation) * RAD)
    leanX += WEIGHTS[k] * Math.sin(azimuth) * reach
    leanZ += WEIGHTS[k] * Math.cos(azimuth) * reach
  }
  const follow = lerp(1, 0.35, d.overcast) * lerp(1, 0.4, clamp(d.fog * 1.25))
  const air = d.wind * (1 - 0.85 * d.cold)
  const storm = d.overcast * smoothstep(0.25, 0.5, d.wind)
  const calm = air * lerp(1, STORM_AIR, storm)
  return {
    leanX: leanX * follow,
    leanZ: leanZ * follow,
    lift: mean(LIFT_TOP, m.t),
    liftLow: mean(LIFT_LOW, m.t),
    wind: calm * lerp(FREE_AIR, RAIN_AIR, d.rain),
    calm,
    real: m.t,
    lapse: d.lapse,
    cold: d.cold * d.cold * (3 - 2 * d.cold),
    rain: d.rain,
    gust: storm,
    steady: true,
  }
}
