import * as THREE from 'three'
import { lerp } from '../../core/curves.ts'
import type { Moment, Part, View } from '../../v2/api.ts'
import { airAt, blankAir, makeSheet, sheetsFor, type Sheet } from '../mist/veil.ts'

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
    const air = airAt(now, this.air)
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
      // A bank is deeper the farther off it lies: seen from the soil its top stands a degree or two over the horizon.
      const height = (0.14 + 0.017 * r) * lerp(1, 1.9, air.lifted)
      const last = i === count - 1
      s.place.set(r, last ? r * 0.6 : height * 6, -1, 0)
      s.high.set(last ? 0.9 * air.amount * lerp(1, 0.6, air.lifted) : 0, 0.3)
      s.center.set(0, 0)
      s.air.set(r * (Math.exp(step) - 1), height, lerp(0.3, 0.08, far) * air.amount * lerp(1, 0.45, air.lifted), lerp(5, 40, far))
      s.look.set(lerp(0.75, 0.5, far), air.glow, last ? 0 : air.shafts, (last ? 4 : 0.2) * air.glow)
      s.mesh.renderOrder = ORDER + (count - i) * 0.1
    }
  }
}

export function make(): Part[] {
  return [new Banks()]
}
