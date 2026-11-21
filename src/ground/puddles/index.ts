import * as THREE from 'three'
import type { Assets } from '../../core/assets.ts'
import { makeSurface } from '../../core/shading.ts'
import { declareStandIn } from '../../core/standins.ts'
import type { WorldDef } from '../../core/world.ts'
import { toward } from '../../field/layout.ts'
import { nearRadiusM } from '../geometry.ts'
import { waterLevelsM } from '../soil.ts'
import { rippleBox } from './basin.ts'
import { SPLASH_LIFE_S, crownFragment, crownGeometry, crownVertex } from './crowns.ts'
import { LANDING_FLOATS, landings } from './landings.ts'
import { RING_LIFE_S, Ripples } from './ripples.ts'
import { standInLevelM, standInRiseM } from './scratch.ts'
import { waterFragment, waterVertex } from './water.ts'

const MAX_DROPS = 2048
const SPLASH_AHEAD_M = -0.6
const SPLASH_HALF_M = 1.5
const RAIN_STARTS_S = 8
const RAIN_LASTS_S = 12

// The water standing on the ground: level surfaces in its low places that mirror the sky, and the rings of every drop that lands in them.
export class Puddles {
  readonly meshes: THREE.Object3D[]
  private readonly water: THREE.Mesh
  private readonly crowns: THREE.Mesh
  private readonly splashes = new Float32Array(MAX_DROPS * LANDING_FLOATS)
  private readonly splashDrop: THREE.InstancedBufferAttribute
  private readonly ripples: Ripples
  private readonly level = { value: new THREE.Vector2() }
  private readonly drops = new Float32Array(MAX_DROPS * LANDING_FLOATS)
  private readonly mirrors = new Map<string, THREE.Texture>()
  private readonly uniforms: Record<string, THREE.IUniform>

  constructor(ground: Record<string, THREE.IUniform>) {
    declareStandIn('puddle furrow', ['rain'])
    this.ripples = new Ripples(ground, this.level, this.drops)
    this.uniforms = {
      ...ground,
      uLevel: this.level,
      uBox: this.ripples.uniforms.uBox,
      tRipple: { value: this.ripples.target.texture },
      tMirror: { value: null },
      uMirrorBasis: { value: new THREE.Matrix3() },
      uMirrorScale: { value: new THREE.Vector3(1, 1, 1) },
    }
    const surface = makeSurface({ name: 'puddle water', vertex: waterVertex, fragment: waterFragment, uniforms: this.uniforms, transparent: true, castShadow: false, standIn: true })
    const plane = new THREE.PlaneGeometry(2 * nearRadiusM, 2 * nearRadiusM)
    plane.rotateX(-Math.PI / 2)
    this.water = new THREE.Mesh(plane, surface.main)
    this.water.frustumCulled = false
    this.water.renderOrder = -10
    this.water.visible = false
    this.water.onBeforeRender = (renderer) => this.ripples.render(renderer)
    const crown = makeSurface({ name: 'splash crowns', vertex: crownVertex, fragment: crownFragment, uniforms: { ...this.uniforms, uSpan: { value: new THREE.Vector2() } }, side: THREE.DoubleSide, transparent: true, castShadow: false })
    const made = crownGeometry(this.splashes, LANDING_FLOATS)
    this.splashDrop = made.drop
    this.crowns = new THREE.Mesh(made.geometry, crown.main)
    this.crowns.frustumCulled = false
    this.crowns.visible = false
    this.crowns.renderOrder = -9
    this.meshes = [this.water, this.crowns]
  }

  async load(assets: Assets, worlds: WorldDef[]): Promise<void> {
    for (const def of worlds) if (def.backdrop.file && def.lock) this.mirrors.set(def.id, await assets.texture(`worlds/${def.id}`, def.backdrop.file))
  }

  // Once a frame, with the film second at the open shutter and at its close.
  prepare(def: WorldDef, time: number, timeClose: number, shown = true): void {
    const mirror = this.mirrors.get(def.id)
    const wet = def.ground.wet
    this.water.visible = shown && wet > 0.5 && !!mirror && !!def.lock
    this.crowns.visible = this.water.visible
    if (!this.water.visible || !mirror || !def.lock) return
    const spread = Math.min(1, Math.max(0, (time - RAIN_STARTS_S) / RAIN_LASTS_S))
    const eased = spread * spread * (3 - 2 * spread)
    const ground = waterLevelsM[0] + (waterLevelsM[1] - waterLevelsM[0]) * wet
    const y = ground - waterLevelsM[1] + standInLevelM + standInRiseM * (eased - 1)
    this.level.value.set(y, eased)
    const { right, up, forward, scaleX, scaleY } = def.lock
    this.uniforms.tMirror.value = mirror
    this.uniforms.uMirrorBasis.value.set(right.x, up.x, forward.x, right.y, up.y, forward.y, right.z, up.z, forward.z)
    this.uniforms.uMirrorScale.value.set(scaleX, scaleY, def.backdrop.gain)
    const cx = toward.x * rippleBox.aheadM
    const cz = toward.z * rippleBox.aheadM
    const count = landings(cx, cz, rippleBox.halfM + 0.3, y, time - RING_LIFE_S, timeClose, this.drops)
    this.ripples.set(count, time, timeClose, cx, cz, rippleBox.halfM)
    const geometry = this.crowns.geometry as THREE.InstancedBufferGeometry
    geometry.instanceCount = landings(toward.x * SPLASH_AHEAD_M, toward.z * SPLASH_AHEAD_M, SPLASH_HALF_M, 0, time - SPLASH_LIFE_S, timeClose, this.splashes)
    this.splashDrop.needsUpdate = true
    ;(this.crowns.material as THREE.RawShaderMaterial).uniforms.uSpan.value.set(time, timeClose)
  }
}
