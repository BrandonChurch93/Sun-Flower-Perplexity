import { clamp, smoothstep } from '../core/curves.ts'
import type * as THREE from 'three'
import type { Moment, Part } from '../v2/api.ts'
import { airUniforms } from './air.ts'
import { makeTerrain } from './terrain.ts'
import { makeTrees } from './trees.ts'

// Per meter. Clear air lets the far range through, the frost mist takes the ranges one after another, the rain takes them all.
// What the far crop gives back over the film, by bar: measured against the last rows of the planted field's own far crop, so the two meet. It stands still in the two holds.
const CROP_AT: [number, number, number, number][] = [
  [5, 0.01585, 0.02895, 0.01017],
  [13, 0.02026, 0.0319, 0.0105],
  [17, 0.03, 0.052, 0.018],
  [25, 0.03, 0.052, 0.018],
  [29.7, 0.02433, 0.0375, 0.0081],
  [33, 0.01681, 0.03313, 0.008138],
  [41, 0.01681, 0.03313, 0.008138],
  [43.75, 0.0135, 0.0234, 0.0081],
  [52, 0.0135, 0.02342, 0.00847],
  [57, 0.01711, 0.02985, 0.01026],
  [58, 0.03226, 0.03333, 0.009444],
  [59, 0.06824, 0.05214, 0.01069],
  [60, 0.07686, 0.05494, 0.01035],
  [61, 0.0736, 0.05175, 0.01035],
  [65, 0.0684, 0.0495, 0.01035],
  [67, 0.1835, 0.07773, 0.004658],
  [69, 0.2011, 0.1069, 0.007809],
  [71, 0.2033, 0.1087, 0.01004],
  [73, 0.2217, 0.104, 0.01332],
  [74.5, 0.2431, 0.09077, 0.01455],
]
function cropAt(bar: number, out: THREE.Vector3): void {
  let i = 0
  while (i < CROP_AT.length - 2 && bar > CROP_AT[i + 1][0]) i++
  const a = CROP_AT[i]
  const b = CROP_AT[i + 1]
  const k = clamp((bar - a[0]) / (b[0] - a[0]))
  out.set(a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k, a[3] + (b[3] - a[3]) * k)
}
const AIR = { clear: 0.00006, lowSun: -0.00003, overcast: 0.00008, fog: 0.0001, rain: 0.0002 }
// The mist of the cold morning: per meter at the foot of the land, and how high it stands.
const MIST = { perM: 0.001, topM: 12 }
// Stand-in. The shared ground fog in rain is so dense that everything beyond 150 m becomes the fog color, hills and all. Away from the field the land takes this share of it until the shared fog is thinner.
const RAIN_FOG_SHARE = 0.12

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
    airUniforms.uAirToSun.value = clamp(1 - 0.5 * d.overcast) * (1 - 0.6 * d.fog)
    airUniforms.uAirRain.value = d.rain
    airUniforms.uMist.value = MIST.perM * d.fog * d.fog
    airUniforms.uMistTopM.value = MIST.topM
    airUniforms.uFogShare.value = 1 - (1 - RAIN_FOG_SHARE) * d.rain
    airUniforms.uFogNear.value = clamp(1.25 * d.fog + d.rain)
    airUniforms.uFogLow.value = 0.9 * clamp(d.fog)
    airUniforms.uVeil.value = clamp(d.fog)
    airUniforms.uThrough.value = 0.12 + 0.88 * smoothstep(-5, -1, now.sunElevationDeg)
    airUniforms.uTrueSun.value.copy(now.sun)
    airUniforms.uLandWet.value = d.wet
    airUniforms.uLandFrost.value = d.frost
    cropAt(now.bar, airUniforms.uLandCrop.value)
    airUniforms.uLandWind.value = d.wind
  }
}

export function make(): Part[] {
  return [new Place()]
}
