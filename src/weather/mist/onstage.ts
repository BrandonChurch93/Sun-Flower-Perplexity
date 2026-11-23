import * as THREE from 'three'
import { clamp, lerp, smoothstep } from '../../core/curves.ts'
import type { Moment, Part, View } from '../../v2/api.ts'
import { airAt, blankAir, DAWN_DEPTH, makeSheet, sheetsFor, type Sheet } from './veil.ts'

// Thin veils close to the soil, from just before the lens to where the fog banks take over. The sheets stand round the lens, and one of them stands just behind the plant, so what is drawn before the plant is the mist behind it and nothing else.
const MOST = 12
const NEAR_M = 0.24
const FAR_M = 14
const BEHIND_M = 0.12
const HEIGHT_M = 0.1
const HEIGHT_LIFTED_M = 0.34
const PER_M = 0.3
const PER_M_LIFTED = 0.2
const BANK_M = 1.5
const CLEAR_TO_M = 1.6
// The thickest rolls of fog stand up out of the layer as tongues, so a breath of it is seen crossing the soil.
const TONGUES = 1.5
// Before the hairs and crystals of the plant (18 to 21), and after them.
const ORDER_BEHIND = 12
const ORDER_BEFORE = 64

class GroundMist implements Part {
  readonly objects: THREE.Object3D[]
  private readonly sheets: Sheet[] = []
  private readonly glowDir = new THREE.Vector3(0, 1, 0)
  private readonly air = blankAir()

  constructor() {
    for (let i = 0; i < MOST; i++) this.sheets.push(makeSheet('ground mist', this.glowDir))
    this.objects = this.sheets.map((s) => s.mesh)
  }

  prepare(now: Moment, _later: Moment, view: View): void {
    const air = airAt(now, this.air)
    const on = air.amount > 0.002
    const count = on ? sheetsFor(view.quality, MOST) : 0
    for (let i = 0; i < MOST; i++) this.sheets[i].mesh.visible = i < count
    if (!on) return
    this.glowDir.copy(now.sun)
    const eye = view.pose.position
    const plantM = clamp(Math.hypot(eye.x, eye.z), 0.3, 6) + BEHIND_M
    const step = Math.log(FAR_M / NEAR_M) / (count - 1)
    // The sheet nearest to the plant's far side is moved onto it, and the others keep their even spacing in between.
    const nearest = Math.round(Math.log(plantM / NEAR_M) / step)
    const shift = Math.log(plantM / NEAR_M) - nearest * step
    const height = lerp(HEIGHT_M, HEIGHT_LIFTED_M, air.lifted)
    const perM = lerp(PER_M, PER_M_LIFTED, air.lifted) * air.amount
    const tongues = TONGUES * (1 - air.dawn) * (1 - 0.6 * air.lifted)
    const radius = (i: number): number => NEAR_M * Math.exp(step * i + shift * (i <= nearest ? i / Math.max(nearest, 1) : (count - 1 - i) / Math.max(count - 1 - nearest, 1)))
    for (let i = 0; i < count; i++) {
      const s = this.sheets[i]
      const r = radius(i)
      const slab = i + 1 < count ? radius(i + 1) - r : r * (Math.exp(step) - 1)
      s.place.set(r, height * (7 + 3 * tongues), -0.3, tongues)
      s.center.set(eye.x, eye.z)
      // The air just before the lens is clear: the veils lie out on the soil, beyond the plant.
      s.air.set(slab, height, perM * smoothstep(NEAR_M, CLEAR_TO_M, r), BANK_M)
      s.look.set(0.85, air.glow, air.shafts, 0.8 * air.amount * air.glow)
      s.dawn.set(air.dawn, DAWN_DEPTH / count)
      s.mesh.renderOrder = i >= nearest ? ORDER_BEHIND + (count - i) * 0.1 : ORDER_BEFORE + (count - i) * 0.1
    }
  }

  sample(camera: THREE.PerspectiveCamera): void {
    for (const s of this.sheets) if (s.mesh.visible) s.center.set(camera.position.x, camera.position.z)
  }
}

export function make(): Part[] {
  return [new GroundMist()]
}
