import { clamp, smoothstep } from '../core/curves.ts'
import type * as THREE from 'three'
import type { Moment, Part, View } from '../v2/api.ts'
import { airUniforms } from './air.ts'
import { heightAt } from '../plant/growth.ts'
import { makeTerrain } from './terrain.ts'
import { makeTrees } from './trees.ts'

// What the far crop gives back over the film, by bar: measured against the last rows of the planted field's own far crop, so the two meet. It stands still in the two holds.
// From among the tops the lens sees the crop's side, from over them the open heads: one table for each, and the height of the lens over the tops chooses.
type Knot = [number, number, number, number]
const CROP_YOUNG: Knot[] = [
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
]
const CROP_AMONG: Knot[] = [
  ...CROP_YOUNG,
  [58, 0.03226, 0.03333, 0.009444],
  [59, 0.06824, 0.05214, 0.01069],
  [60, 0.07686, 0.05494, 0.01035],
  [61, 0.0736, 0.05175, 0.01035],
  [65, 0.0684, 0.0495, 0.01035],
]
const CROP_OVER: Knot[] = [
  ...CROP_YOUNG,
  [60, 0.1845, 0.0783, 0.002096],
  [67, 0.1845, 0.0783, 0.002096],
  [69, 0.186, 0.1033, 0.006511],
  [71, 0.1898, 0.1042, 0.008675],
  [73, 0.2405, 0.1075, 0.01215],
  [74.5, 0.3034, 0.08611, 0.0124],
]
// The lens's height over the tops, in heights of the tops, between which the far crop turns from its side to its heads.
const OVER = { from: -0.06, to: 0.09 }
function knotAt(table: Knot[], bar: number, out: Knot): Knot {
  let i = 0
  while (i < table.length - 2 && bar > table[i + 1][0]) i++
  const a = table[i]
  const b = table[i + 1]
  const k = clamp((bar - a[0]) / (b[0] - a[0]))
  for (let c = 1; c < 4; c++) out[c] = a[c] + (b[c] - a[c]) * k
  return out
}
const among: Knot = [0, 0, 0, 0]
const over: Knot = [0, 0, 0, 0]
function cropAt(bar: number, tau: number, eyeM: number, out: THREE.Vector3): void {
  const top = Math.max(heightAt(tau), 0.05)
  const k = smoothstep(OVER.from, OVER.to, (eyeM - top) / top)
  knotAt(CROP_AMONG, bar, among)
  knotAt(CROP_OVER, bar, over)
  out.set(among[1] + (over[1] - among[1]) * k, among[2] + (over[2] - among[2]) * k, among[3] + (over[3] - among[3]) * k)
}
// Per meter. Clear air lets the far range through, the frost mist takes the ranges one after another, the rain takes them all.
const AIR = { clear: 0.00006, lowSun: -0.00003, dusk: 0.00002, overcast: 0.00008, fog: 0.0001, rain: 0.0002 }
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

  prepare(now: Moment, _later: Moment, view: View): void {
    const d = now.dials
    for (const o of this.objects) o.visible = true
    const low = 1 - smoothstep(4, 24, now.sunElevationDeg)
    const dusk = (1 - smoothstep(0.3, 1.5, now.sunElevationDeg)) * smoothstep(0.5, 0.8, now.phase) * (1 - smoothstep(0.89, 0.93, now.phase))
    airUniforms.uAir.value = AIR.clear + AIR.lowSun * low + AIR.dusk * dusk + AIR.overcast * d.overcast + AIR.fog * d.fog * d.fog + AIR.rain * d.rain
    airUniforms.uAirToSun.value = clamp(1 - 0.5 * d.overcast) * (1 - 0.6 * d.fog)
    airUniforms.uAirRain.value = d.rain
    airUniforms.uMist.value = MIST.perM * d.fog * d.fog
    airUniforms.uMistTopM.value = MIST.topM
    airUniforms.uFogShare.value = 1 - (1 - RAIN_FOG_SHARE) * d.rain
    airUniforms.uFogNear.value = clamp(1.25 * d.fog + d.rain)
    airUniforms.uFogLow.value = 0.9 * clamp(d.fog)
    airUniforms.uVeil.value = clamp(d.fog)
    airUniforms.uDusk.value = dusk
    airUniforms.uThrough.value = 0.12 + 0.88 * smoothstep(-5, -1, now.sunElevationDeg)
    airUniforms.uTrueSun.value.copy(now.sun)
    airUniforms.uLandWet.value = d.wet
    airUniforms.uLandFrost.value = d.frost
    cropAt(now.bar, now.tau, view.pose.position.y, airUniforms.uLandCrop.value)
    airUniforms.uLandWind.value = d.wind
  }
}

export function make(): Part[] {
  return [new Place()]
}
