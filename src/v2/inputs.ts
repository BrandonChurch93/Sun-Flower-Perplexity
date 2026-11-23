import { clamp, lerp, smoothstep } from '../core/curves.ts'
import type { PlantInputs } from '../plant/growth.ts'
import type { Dials, Moment } from './api.ts'
import { DAY, barAt, coldAtBar, coverAtBar, hitTime, overcastAtBar, tauAt, worldAt } from './clock.ts'
import { blankMoment, momentAt } from './now.ts'
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

// The two holds, where the plant's clock stands, in film seconds, and how long before and after them the air is handed over.
const HOLDS = [[hitTime(17), hitTime(25)], [hitTime(33), hitTime(41)]]

// The plant's clock where it stands in the rain.
export const RAIN_STANDS = tauAt(HOLDS[1][0])
const HAND_S = 1

function heldAt(seconds: number): number {
  let held = 0
  for (const [from, to] of HOLDS) held = Math.max(held, smoothstep(from - HAND_S, from, seconds) * (1 - smoothstep(to, to + HAND_S, seconds)))
  return held
}

type Feel = { leanX: number; leanZ: number; lift: number; liftLow: number; cold: number }

// Where the plant leans and how it carries its leaves at one film second, under these dials.
function feel(seconds: number, d: Dials): Feel {
  let leanX = 0
  let leanZ = 0
  for (let k = 0; k < LAGS.length; k++) {
    const world = worldAt(Math.max(0, seconds - LAGS[k]))
    const elevation = sunElevationAt(world)
    const noon = noonAzimuth(world)
    const azimuth = (noon + SWING * (sunAzimuthAt(world) - noon)) * RAD
    const reach = lerp(NIGHT_REST, 1, smoothstep(-8, 5, elevation)) * Math.cos(Math.max(0, elevation) * RAD)
    leanX += WEIGHTS[k] * Math.sin(azimuth) * reach
    leanZ += WEIGHTS[k] * Math.cos(azimuth) * reach
  }
  const follow = lerp(1, 0.35, d.overcast) * lerp(1, 0.4, clamp(d.fog * 1.25))
  return { leanX: leanX * follow, leanZ: leanZ * follow, lift: mean(LIFT_TOP, seconds), liftLow: mean(LIFT_LOW, seconds), cold: d.cold * d.cold * (3 - 2 * d.cold) }
}

// In a hold the hour hardly moves and nothing grows: the plant keeps the pose of the hold's first instant, the air moves it where it is drawn, and it catches up with the hour as its clock starts again.
const stood: (Feel | null)[] = HOLDS.map(() => null)

// The film second at which the plant's clock stopped, inside a hold.
function stoodAt(seconds: number): number | undefined {
  for (const [from, to] of HOLDS) if (seconds >= from && seconds <= to) return from
  return undefined
}

function standing(seconds: number): Feel | null {
  for (let i = 0; i < HOLDS.length; i++) {
    const from = HOLDS[i][0]
    if (seconds > from - HAND_S && seconds < HOLDS[i][1] + HAND_S) return (stood[i] ??= feel(from, momentAt(from, blankMoment()).dials))
  }
  return null
}

// For a proof that nothing grows in a hold: with this on the plant feels nothing, so two frames of one hold are the same picture.
export const plantFeels = { nothing: false }

// What the plant feels at one instant. It leans after the sun and follows it across the day with a lag, lifts its leaves in the light and lets them hang in the dark and the cold, stiffens in frost, and gives to the wind, the gusts and the drops.
export function plantInputsOf(m: Moment): PlantInputs {
  if (plantFeels.nothing) return { leanX: 0, leanZ: 0, lift: 1, wind: 0, real: m.t, steady: true }
  const d = m.dials
  const held = heldAt(m.t)
  const live = feel(m.t, d)
  const still = held > 0 ? standing(m.t) : null
  const mix = (a: number, b: number): number => (still ? (held >= 1 ? b : lerp(a, b, held)) : a)
  const air = d.wind * (1 - 0.85 * d.cold)
  const storm = d.overcast * smoothstep(0.25, 0.5, d.wind)
  const calm = air * lerp(1, STORM_AIR, storm)
  return {
    leanX: mix(live.leanX, still?.leanX ?? 0),
    leanZ: mix(live.leanZ, still?.leanZ ?? 0),
    lift: mix(live.lift, still?.lift ?? 0),
    liftLow: mix(live.liftLow, still?.liftLow ?? 0),
    wind: calm * lerp(FREE_AIR, RAIN_AIR, d.rain),
    calm,
    real: m.t,
    lapse: d.lapse,
    cold: mix(live.cold, still?.cold ?? 0),
    rain: d.rain,
    gust: storm,
    steady: true,
    held,
    stood: stoodAt(m.t),
  }
}
