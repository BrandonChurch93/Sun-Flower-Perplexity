import { clamp, lerp, smoothstep } from '../core/curves.ts'
import type { PlantInputs } from '../plant/growth.ts'
import type { Moment } from './api.ts'

// How much more of the air the leaves feel than the stems: under the rain, where the drops beat on them.
const RAIN_AIR = 2.5

// What the plant answers: it leans toward the sun and follows it across the day, lifts its leaves in the light and lets them hang in the dark and the cold, and gives to the wind.
export function plantInputsOf(m: Moment): PlantInputs {
  const d = m.dials
  const up = smoothstep(-6, 8, m.sunElevationDeg)
  const flat = Math.hypot(m.sun.x, m.sun.z) || 1
  const lean = up * lerp(1, 0.35, d.overcast) * lerp(1, 0.4, clamp(d.fog * 1.25))
  const lift = lerp(lerp(lerp(0.12, 1, up), 0.8, d.overcast * up), 0.45, d.cold)
  const calm = d.wind
  return { leanX: (m.sun.x / flat) * lean, leanZ: (m.sun.z / flat) * lean, lift, wind: calm * lerp(1, RAIN_AIR, d.rain), calm }
}
