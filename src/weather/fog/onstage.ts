import * as THREE from 'three'
import { lerp } from '../../core/curves.ts'
import type { Moment, Part, View } from '../../v2/api.ts'
import { blankAir, fogAt, makeSheet, sheetsFor, type Sheet } from '../mist/veil.ts'

// The fog banks: the white that lies in the low ground beyond the seedlings, from where the veils of ground mist end to the far land. They stand round the plant and do not follow the lens.
const MOST = 8
const NEAR_M = 14
const FAR_M = 260
// Drawn before everything see-through that stands nearer.
const ORDER = 2

class Banks implements Part {
  readonly objects: THREE.Object3D[]
  private readonly sheets: Sheet[] = []
  private readonly glowDir = new THREE.Vector3(0, 1, 0)
  private readonly air = blankAir()

  constructor() {
    for (let i = 0; i < MOST; i++) this.sheets.push(makeSheet('fog bank', this.glowDir))
    this.objects = this.sheets.map((s) => s.mesh)
  }

  prepare(now: Moment, _later: Moment, view: View): void {
    const air = fogAt(now, this.air)
    const on = air.amount > 0.002
    const count = on ? sheetsFor(view.quality, MOST) : 0
    for (let i = 0; i < MOST; i++) this.sheets[i].mesh.visible = i < count
    if (!on) return
    this.glowDir.copy(now.sun)
    const step = Math.log(FAR_M / NEAR_M) / (count - 1)
    for (let i = 0; i < count; i++) {
      const s = this.sheets[i]
      const r = NEAR_M * Math.exp(step * i)
      const far = i / (count - 1)
      // A bank is deeper the farther off it lies: seen from the soil it hides the first degree over the horizon, and what stands taller than that stands out of it.
      const height = (0.07 + 0.0042 * r) * lerp(1, 1.9, air.lifted)
      const last = i === count - 1
      s.place.set(r, last ? r * 0.6 : height * 6, -1, 0)
      s.high.set(last ? 0.1 * air.amount * lerp(1, 0.4, air.lifted) : 0, 0.06)
      s.center.set(0, 0)
      s.air.set(r * (Math.exp(step) - 1), height, lerp(0.6, 0.16, far) * air.amount * lerp(1, 0.75, air.lifted), lerp(5, 40, far))
      s.look.set(lerp(0.6, 0.35, far), air.glow, last ? 0 : air.shafts, 1.1 * air.amount * air.glow)
      s.mesh.renderOrder = ORDER + (count - i) * 0.1
    }
  }
}

export function make(): Part[] {
  return [new Banks()]
}
