import * as THREE from 'three'
import { makeSurface } from '../../core/shading.ts'
import { right, toward } from '../../field/layout.ts'
import { heightAt, stemBaseRadius } from '../../plant/growth.ts'
import type { Moment, Part, View } from '../../v2/api.ts'
import { rainAt } from '../../weather/rain/drops.ts'
import { nearRadiusM } from '../geometry.ts'
import { furrow, waterLevelsM } from '../soil.ts'
import { nearFurrow, rippleBox } from './basin.ts'
import { SPLASH_LIFE_S, crownFragment, crownGeometry, crownVertex } from './crowns.ts'
import { DOT_LIFE_S, dotFragment, dotGeometry, dotVertex } from './dots.ts'
import { hazeFragment, hazeGeometry, hazeVertex } from './haze.ts'
import { LANDING_FLOATS, fineLandings, landings } from './landings.ts'
import { FINE_RING_LIFE_S, RING_LIFE_S, Ripples } from './ripples.ts'
import { waterFragment, waterVertex } from './water.ts'

const MAX_DROPS = 2048
const MAX_RINGS = 6144
const MAX_DOTS = 4096
const FINE_REACH_M = 0.11
// The largest of the fine drops raise a small crown where they land in the water.
const FINE_CROWN_M = 0.00025
// The square of ground whose landings are drawn, as half its side at each quality, and how far toward the lens from the plant its middle lies.
const SPLASH_HALF_M = [1.5, 1.5, 1.0]
const SPLASH_TOWARD = 0.3
const HAZE_HALF_M = 2.2
const BED_M = -furrow.depthM - 0.003
const FLASH_TINT = [1.0, 1.15, 1.45]
const QUALITY = { film: 0, high: 1, low: 2 } as const
const lum = (c: readonly number[]): number => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]

// A stand-in until the ground hands its uniforms to the parts that lie on it: they are read off the material of the near soil, once, at load.
function groundUniforms(scene: THREE.Object3D | null): Record<string, THREE.IUniform> | null {
  let found: Record<string, THREE.IUniform> | null = null
  scene?.traverse((o) => {
    const material = (o as THREE.Mesh).material as THREE.ShaderMaterial | undefined
    if (!found && material && material.name === 'soil near') found = material.uniforms
  })
  return found
}

// The water standing on the ground and everything a drop does where it lands: the mirror in the furrow, the rings and crowns on it, the dark spots and the grit on soil, and the spray that hangs over it all.
class Puddles implements Part {
  readonly objects: THREE.Object3D[]
  private readonly water: THREE.Mesh
  private readonly crowns: THREE.Mesh
  private readonly dots: THREE.Mesh
  private readonly haze: THREE.Mesh
  private readonly span = { value: new THREE.Vector2() }
  private readonly stands = { value: 0 }
  private readonly level = { value: new THREE.Vector2() }
  private readonly dry = { value: 0 }
  private readonly lit = {
    uMirrorFlash: { value: new THREE.Vector3() },
    uMirrorFlashAt: { value: new THREE.Vector3(0, 1, 0) },
    uBlaze: { value: 0 },
    uStalk: { value: new THREE.Vector4() },
    uChop: { value: 1 },
    uHaze: { value: 0 },
    uHazeAt: { value: new THREE.Vector3() },
    uHazeFlash: { value: new THREE.Vector3() },
  }
  private readonly splashes = new Float32Array(MAX_DROPS * LANDING_FLOATS)
  private readonly drops = new Float32Array(MAX_RINGS * LANDING_FLOATS)
  private readonly spots = new Float32Array(MAX_DOTS * LANDING_FLOATS)
  private splashDrop: THREE.InstancedBufferAttribute | null = null
  private spotDrop: THREE.InstancedBufferAttribute | null = null
  private ripples: Ripples | null = null

  constructor() {
    const plane = new THREE.PlaneGeometry(2 * nearRadiusM, 2 * nearRadiusM)
    plane.rotateX(-Math.PI / 2)
    this.water = new THREE.Mesh(plane)
    this.crowns = new THREE.Mesh()
    this.dots = new THREE.Mesh()
    this.haze = new THREE.Mesh(hazeGeometry())
    this.water.renderOrder = -10
    this.dots.renderOrder = -9.5
    this.crowns.renderOrder = -9
    this.haze.renderOrder = 40
    this.objects = [this.water, this.dots, this.crowns, this.haze]
    for (const o of this.objects) {
      o.frustumCulled = false
      o.matrixAutoUpdate = false
      o.visible = false
    }
  }

  async load(): Promise<void> {
    const haze = makeSurface({ name: 'spray haze', vertex: hazeVertex, fragment: hazeFragment, uniforms: this.lit, side: THREE.DoubleSide, transparent: true, depthWrite: false, castShadow: false })
    this.haze.material = haze.main
    const ground = groundUniforms(this.water.parent)
    if (!ground) return
    const ripples = new Ripples(ground, this.level, this.drops)
    const uniforms = { ...ground, ...this.lit, uLevel: this.level, uBox: ripples.uniforms.uBox, uSpan: this.span, uStands: this.stands, uDry: this.dry, tRipple: { value: ripples.target.texture } }
    this.water.material = makeSurface({ name: 'puddle water', vertex: waterVertex, fragment: waterFragment, uniforms, transparent: true, castShadow: false }).main
    this.water.onBeforeRender = (renderer) => ripples.render(renderer)
    const crown = crownGeometry(this.splashes, LANDING_FLOATS)
    this.crowns.geometry = crown.geometry
    this.crowns.material = makeSurface({ name: 'splash crowns', vertex: crownVertex, fragment: crownFragment, uniforms, side: THREE.DoubleSide, transparent: true, castShadow: false }).main
    this.splashDrop = crown.drop
    const dot = dotGeometry(this.spots, LANDING_FLOATS)
    this.dots.geometry = dot.geometry
    this.dots.material = makeSurface({ name: 'drop marks', vertex: dotVertex, fragment: dotFragment, uniforms, side: THREE.DoubleSide, transparent: true, depthWrite: false, castShadow: false }).main
    this.spotDrop = dot.drop
    this.ripples = ripples
  }

  prepare(now: Moment, later: Moment, view: View): void {
    const d = now.dials
    const rain = rainAt(now.t)
    const quality = QUALITY[view.quality]
    const eye = view.pose.position
    const flash = 0.5 * (d.flash + later.dials.flash) * Math.max(lum(view.light.horizon), lum(view.light.zenith), 1e-4)
    const lit = this.lit
    lit.uMirrorFlash.value.fromArray(FLASH_TINT).multiplyScalar(flash * 6)
    lit.uMirrorFlashAt.value.copy(now.flashAt)
    lit.uBlaze.value = d.burst
    lit.uStalk.value.set(heightAt(now.tau), Math.max(stemBaseRadius(now.tau), 0.004), 0.3 * heightAt(now.tau), 0.85)
    // The rain keeps the water chopped; once it has passed the face stills and mirrors whole.
    lit.uChop.value = 0.15 + 0.85 * Math.sqrt(rain)
    lit.uHaze.value = 0.16 * rain * rain
    lit.uHazeAt.value.set(eye.x * 0.45, eye.z * 0.45, HAZE_HALF_M)
    lit.uHazeFlash.value.fromArray(FLASH_TINT).multiplyScalar(flash * 2)
    this.haze.visible = rain > 0.2 && quality < 2

    const time = now.t
    const close = later.t
    const stands = d.puddle > 0 && !!this.ripples
    const lands = rain > 0 && !!this.ripples
    this.water.visible = stands
    this.crowns.visible = lands
    const dry = lands ? 1 - Math.min(1, d.wet / 0.6) : 0
    this.dots.visible = dry > 0
    this.dry.value = dry
    if (!stands && !lands) return
    // The water rises from the bed of the furrow to its banks: a film on the mud first, a mirror after.
    const y = BED_M + (waterLevelsM[1] - BED_M) * Math.sqrt(d.puddle)
    this.level.value.set(y, Math.min(1, d.puddle / 0.08))
    this.span.value.set(time, close)
    this.stands.value = (close - time) / Math.max(1, view.samples)
    const cx = right.x * rippleBox.acrossM - toward.x * rippleBox.awayM
    const cz = right.z * rippleBox.acrossM - toward.z * rippleBox.awayM
    const reach = rippleBox.halfM * Math.SQRT2
    const near = (x: number, z: number): boolean => nearFurrow(x, z, FINE_REACH_M)
    if (stands && this.ripples) {
      let count = lands ? landings(cx, cz, reach + 0.2, y, time - RING_LIFE_S, close, this.drops) : 0
      if (lands && quality < 2) count = fineLandings(cx - reach, cz - reach, cx + reach, cz + reach, near, y, time - FINE_RING_LIFE_S, close, this.drops, count)
      this.ripples.set(count, time, close, cx, cz, rippleBox.halfM)
    }
    if (!lands || !this.splashDrop || !this.spotDrop) return
    const half = SPLASH_HALF_M[quality]
    const mx = eye.x * SPLASH_TOWARD
    const mz = eye.z * SPLASH_TOWARD
    let struck = landings(mx, mz, half, 0, time - SPLASH_LIFE_S, close, this.splashes)
    if (stands && quality < 2) struck = fineLandings(cx - reach, cz - reach, cx + reach, cz + reach, near, y, time - SPLASH_LIFE_S, close, this.splashes, struck, FINE_CROWN_M)
    ;(this.crowns.geometry as THREE.InstancedBufferGeometry).instanceCount = struck
    this.splashDrop.needsUpdate = true
    if (dry > 0) {
      ;(this.dots.geometry as THREE.InstancedBufferGeometry).instanceCount = landings(0, 0, nearRadiusM, 0, time - DOT_LIFE_S, close, this.spots)
      this.spotDrop.needsUpdate = true
    }
  }
}

export function make(): Part[] {
  return [new Puddles()]
}
