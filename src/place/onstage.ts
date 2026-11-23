import { clamp, smoothstep } from '../core/curves.ts'
import type * as THREE from 'three'
import type { Moment, Part } from '../v2/api.ts'
import { airUniforms } from './air.ts'
import { makeTerrain } from './terrain.ts'
import { makeTrees } from './trees.ts'

// Per meter. Clear air lets the far range through, the frost mist takes the ranges one after another, the rain takes them all.
const AIR = { clear: 0.00006, lowSun: 0.00005, overcast: 0.00008, fog: 0.00025, rain: 0.00045 }
// The mist of the cold morning: per meter at the foot of the land, and how high it stands.
const MIST = { perM: 0.004, topM: 12 }
// Stand-in. The shared ground fog in rain is so dense that everything beyond 150 m becomes the fog color, hills and all. Away from the field the land takes this share of it until the shared fog is thinner.
const RAIN_FOG_SHARE = 0.12
// Lightning on the land, in the scene's units, for a surface that faces it.
const FLASH = [4.5, 5.0, 6.0]

class Place implements Part {
  private readonly terrain = makeTerrain()
  private readonly trees = makeTrees()
  readonly objects: THREE.Object3D[] = [this.terrain.mesh, this.trees.mesh]

  async load(renderer: THREE.WebGLRenderer): Promise<void> {
    renderer.initTexture(this.terrain.woods)
    renderer.initTexture(this.trees.atlas)
  }

  prepare(now: Moment): void {
    const d = now.dials
    for (const o of this.objects) o.visible = true
    const low = 1 - smoothstep(4, 24, now.sunElevationDeg)
    airUniforms.uAir.value = AIR.clear + AIR.lowSun * low + AIR.overcast * d.overcast + AIR.fog * d.fog * d.fog + AIR.rain * d.rain
    airUniforms.uAirSun.value = clamp(1 - 0.5 * d.overcast) * (1 - 0.6 * d.fog)
    airUniforms.uAirRain.value = d.rain
    airUniforms.uMist.value = MIST.perM * d.fog * d.fog
    airUniforms.uMistTopM.value = MIST.topM
    airUniforms.uFogShare.value = 1 - (1 - RAIN_FOG_SHARE) * d.rain
    airUniforms.uTrueSun.value.copy(now.sun)
    airUniforms.uLandWet.value = d.wet
    airUniforms.uLandFrost.value = d.frost
    airUniforms.uLandWind.value = d.wind
    airUniforms.uFlashDir.value.copy(now.flashAt)
    airUniforms.uFlash.value.set(FLASH[0], FLASH[1], FLASH[2]).multiplyScalar(d.flash)
  }
}

export function make(): Part[] {
  return [new Place()]
}
