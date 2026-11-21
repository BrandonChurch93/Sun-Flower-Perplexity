import { config } from '../config.ts'
import { lerp, smootherstep } from '../core/curves.ts'
import { sunDirection, type WorldDef } from '../core/world.ts'
import type { PlantInputs } from '../plant/growth.ts'
import { worldOf } from './registry.ts'
import { cuts, segments } from './timeline.ts'

export function plantInputsFor(def: WorldDef): PlantInputs {
  const s = sunDirection(def)
  const flat = Math.hypot(s.x, s.z) || 1
  return { leanX: (s.x / flat) * def.sun.lean, leanZ: (s.z / flat) * def.sun.lean, lift: def.sun.lift }
}

export function worldAtTime(time: number): string {
  for (const s of segments) if (time < s.end) return s.world
  return segments[segments.length - 1].world
}

// The plant answers the light of the world it is in, eased in after each cut so that nothing jumps on the cut itself.
export function plantInputsAt(time: number): PlantInputs {
  const now = plantInputsFor(worldOf(worldAtTime(time)))
  let cut = null
  for (const c of cuts) if (c.time <= time) cut = c
  if (!cut) return now
  const before = plantInputsFor(worldOf(cut.fromWorld))
  const k = smootherstep(0, config.plant.leanEaseSeconds, time - cut.time)
  return { leanX: lerp(before.leanX, now.leanX, k), leanZ: lerp(before.leanZ, now.leanZ, k), lift: lerp(before.lift, now.lift, k) }
}
