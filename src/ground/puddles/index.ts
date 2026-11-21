import * as THREE from 'three'
import { makeSurface } from '../../core/shading.ts'
import type { WorldDef } from '../../core/world.ts'
import { right, toward } from '../../field/layout.ts'
import { nearRadiusM } from '../geometry.ts'
import { waterLevelsM } from '../soil.ts'
import { rainSkyUniforms } from '../../worlds/rain/sky.ts'
import { nearFurrow, rippleBox } from './basin.ts'
import { SPLASH_LIFE_S, crownFragment, crownGeometry, crownVertex } from './crowns.ts'
import { LANDING_FLOATS, fineLandings, landings } from './landings.ts'
import { FINE_RING_LIFE_S, RING_LIFE_S, Ripples } from './ripples.ts'
import { waterFragment, waterVertex } from './water.ts'

const MAX_DROPS = 2048
const MAX_RINGS = 6144
const FINE_REACH_M = 0.11
const SPLASH_AHEAD_M = -0.6
const SPLASH_HALF_M = 1.5

// The water standing on the ground: level surfaces in its low places that mirror the sky, and the rings of every drop that lands in them.
export class Puddles {
  readonly meshes: THREE.Object3D[]
  private readonly water: THREE.Mesh
  private readonly crowns: THREE.Mesh
  private readonly span = { value: new THREE.Vector2() }
  private readonly stands = { value: 0 }
  private readonly splashes = new Float32Array(MAX_DROPS * LANDING_FLOATS)
  private readonly splashDrop: THREE.InstancedBufferAttribute
  private readonly ripples: Ripples
  private readonly level = { value: new THREE.Vector2() }
  private readonly drops = new Float32Array(MAX_RINGS * LANDING_FLOATS)
  private readonly uniforms: Record<string, THREE.IUniform>

  constructor(ground: Record<string, THREE.IUniform>) {
    this.ripples = new Ripples(ground, this.level, this.drops)
    this.uniforms = {
      ...ground,
      uLevel: this.level,
      uBox: this.ripples.uniforms.uBox,
      tRipple: { value: this.ripples.target.texture },
      ...rainSkyUniforms,
    }
    const surface = makeSurface({ name: 'puddle water', vertex: waterVertex, fragment: waterFragment, uniforms: this.uniforms, transparent: true, castShadow: false })
    const plane = new THREE.PlaneGeometry(2 * nearRadiusM, 2 * nearRadiusM)
    plane.rotateX(-Math.PI / 2)
    this.water = new THREE.Mesh(plane, surface.main)
    this.water.frustumCulled = false
    this.water.renderOrder = -10
    this.water.visible = false
    this.water.onBeforeRender = (renderer) => this.ripples.render(renderer)
    const crown = makeSurface({ name: 'splash crowns', vertex: crownVertex, fragment: crownFragment, uniforms: { ...this.uniforms, uSpan: this.span, uStands: this.stands }, side: THREE.DoubleSide, transparent: true, castShadow: false })
    const made = crownGeometry(this.splashes, LANDING_FLOATS)
    this.splashDrop = made.drop
    this.crowns = new THREE.Mesh(made.geometry, crown.main)
    this.crowns.frustumCulled = false
    this.crowns.visible = false
    this.crowns.renderOrder = -9
    this.meshes = [this.water, this.crowns]
  }

  // Once a frame, with the film second at the open shutter and at its close.
  prepare(def: WorldDef, time: number, timeClose: number, shown = true, samples = 1): void {
    const wet = def.ground.wet
    this.water.visible = shown && wet > 0.5 && !!rainSkyUniforms.tRainSky.value
    this.crowns.visible = this.water.visible
    if (!this.water.visible) return
    const y = waterLevelsM[0] + (waterLevelsM[1] - waterLevelsM[0]) * wet
    this.level.value.set(y, 0)
    const cx = right.x * rippleBox.acrossM - toward.x * rippleBox.awayM
    const cz = right.z * rippleBox.acrossM - toward.z * rippleBox.awayM
    const reach = rippleBox.halfM * Math.SQRT2
    const heavy = landings(cx, cz, reach + 0.2, y, time - RING_LIFE_S, timeClose, this.drops)
    const count = fineLandings(cx - reach, cz - reach, cx + reach, cz + reach, (x, z) => nearFurrow(x, z, FINE_REACH_M), y, time - FINE_RING_LIFE_S, timeClose, this.drops, heavy)
    this.ripples.set(count, time, timeClose, cx, cz, rippleBox.halfM)
    const geometry = this.crowns.geometry as THREE.InstancedBufferGeometry
    geometry.instanceCount = landings(toward.x * SPLASH_AHEAD_M, toward.z * SPLASH_AHEAD_M, SPLASH_HALF_M, 0, time - SPLASH_LIFE_S, timeClose, this.splashes)
    this.splashDrop.needsUpdate = true
    this.span.value.set(time, timeClose)
    this.stands.value = (timeClose - time) / Math.max(1, samples)
  }
}
