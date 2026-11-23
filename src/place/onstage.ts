import { clamp, smoothstep } from '../core/curves.ts'
import type { Moment, Part } from '../v2/api.ts'
import { airUniforms } from './air.ts'
import { makeTerrain } from './terrain.ts'

// Per meter. Clear air lets the far range through, the frost mist takes the ranges one after another, the rain takes them all.
const AIR = { clear: 0.00006, lowSun: 0.00005, overcast: 0.00008, fog: 0.0009, rain: 0.0024 }
// Lightning on the land, in the scene's units, for a surface that faces it.
const FLASH = [2.0, 2.2, 2.6]

class Place implements Part {
  readonly objects = [makeTerrain()]

  prepare(now: Moment): void {
    const d = now.dials
    for (const o of this.objects) o.visible = true
    const low = 1 - smoothstep(4, 24, now.sunElevationDeg)
    airUniforms.uAir.value = AIR.clear + AIR.lowSun * low + AIR.overcast * d.overcast + AIR.fog * d.fog * d.fog + AIR.rain * d.rain
    airUniforms.uAirSun.value = clamp(1 - 0.5 * d.overcast)
    airUniforms.uTrueSun.value.copy(now.sun)
    airUniforms.uLandWet.value = d.wet
    airUniforms.uLandFrost.value = d.frost
    airUniforms.uFlashDir.value.copy(now.flashAt)
    airUniforms.uFlash.value.set(FLASH[0], FLASH[1], FLASH[2]).multiplyScalar(d.flash)
  }
}

export function make(): Part[] {
  return [new Place()]
}
