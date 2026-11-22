import { config } from '../config.ts'
import { lerp, smootherstep } from '../core/curves.ts'
import { sunDirection, type WorldDef } from '../core/world.ts'
import type { PlantInputs } from '../plant/growth.ts'
import { worldOf } from './registry.ts'
import { cuts, segments } from './growthline.ts'

export function plantInputsFor(def: WorldDef): PlantInputs {
  const s = sunDirection(def)
  const flat = Math.hypot(s.x, s.z) || 1
  return { leanX: (s.x / flat) * def.sun.lean, leanZ: (s.z / flat) * def.sun.lean, lift: def.sun.lift, wind: def.wind }
}

export function worldAtTime(time: number): string {
  for (const s of segments) if (time < s.end) return s.world
  return segments[segments.length - 1].world
}

// The wind dies down toward every cut and picks up after it, so that the plant stands the same on both sides of a cut.
function windEase(time: number): number {
  let k = 1
  for (const c of cuts) k = Math.min(k, smootherstep(0, config.plant.leanEaseSeconds, Math.abs(time - c.time)))
  return k
}

// The leaves feel more of the air than the steady wind in two places: under the rain, where the drops beat on them, and in the open field of the last shot, where it comes on over two seconds. The stems keep the steady wind.
const RAIN_AIR = 2.5
const FIELD_AIR = 2.5
const FIELD_START = segments[segments.length - 1].start
function air(time: number, world: string): number {
  if (world === 'rain') return RAIN_AIR
  return 1 + (FIELD_AIR - 1) * smootherstep(FIELD_START, FIELD_START + 2, time)
}

// The plant answers the light of the world it is in, eased in after each cut so that nothing jumps on the cut itself.
export function plantInputsAt(time: number): PlantInputs {
  const world = worldAtTime(time)
  const now = plantInputsFor(worldOf(world))
  const calm = now.wind * windEase(time)
  const wind = calm * air(time, world)
  let cut = null
  for (const c of cuts) if (c.time <= time) cut = c
  if (!cut) return { ...now, wind, calm }
  const before = plantInputsFor(worldOf(cut.fromWorld))
  const k = smootherstep(0, config.plant.leanEaseSeconds, time - cut.time)
  return { leanX: lerp(before.leanX, now.leanX, k), leanZ: lerp(before.leanZ, now.leanZ, k), lift: lerp(before.lift, now.lift, k), wind, calm }
}
