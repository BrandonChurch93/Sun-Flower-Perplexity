import * as THREE from 'three'
import { config } from '../config.ts'
import type { Assets } from '../core/assets.ts'
import type { Caster } from '../core/shadow.ts'
import { endStandIn } from '../core/standins.ts'
import { makeSurface, shared, type Surface } from '../core/shading.ts'
import { smoothstep } from '../core/curves.ts'
import { segmentById } from '../director/timeline.ts'
import { companionPlace, right, toward } from '../field/layout.ts'
import { beadSizes, beadSizesKept, bladeFragment, bladeVertex, blades, clumps, clumpsDawn, clumpsKept } from './blades.ts'
import { grassCover, grassTimes } from './cover.ts'
import { clodScatter, clodScatterKept, crumbFragment, crumbScatter, crumbVertex, fineReachM, grainScatter, laneDir, lumpScatter, lumpScatterYoung, massScatter, massScatterYoung, scatter } from './crumbs.ts'
import { nearGeometry, nearGrowth, nearRadiusM, soilGeometry } from './geometry.ts'
import { fieldTufts, grassFragment, grassVertex, tufts } from './grass.ts'
import { fieldLight } from './light.ts'
import { litterPixels } from './litter.ts'
import { rippleBox } from './puddles/basin.ts'
import { clodReliefM, clodScale, detailScale, emergence, furrow, furrowKept, furrowShare, groundStates, hole, litterTileM, ridgeHeightM, soilFragment, soilHeight, soilMean, soilMeanLuma, soilReliefM, soilTileM, soilVertex, sunWayDir, waterLevelsM } from './soil.ts'

const WIDE = 8.3
const CROP_HEIGHT_M = 0.9 * Math.max(...config.plant.heightM.map((k) => k[1]))

export interface GroundState { wet: number; frost: number; dew?: number }

// After the rain the ground stays soaked into the night and dries over this long, while the dew settles on it.
const dryS = 4.5

export class Ground {
  // The soil beyond the near ground, the near ground itself, the loose soil on it, the grass, and the single blades close to the plant.
  readonly surface: Surface
  readonly near: Surface
  readonly grass: Surface
  readonly loose: Surface
  readonly blades: Surface
  readonly fine: Surface
  private readonly shown = { value: 1 }
  readonly mesh = new THREE.Group()
  // For what lies on the ground, puddles and frost: the height of the near ground in meters (soilHeight(p, soilLod(p)), flat beyond it), where water stands (pooled) and frost settles (frosted), and where grass grows (grassMask). Their uniforms are in `shared`.
  static readonly glsl = { height: soilHeight, states: groundStates, cover: grassCover }
  private readonly cast: Caster[] = []
  private readonly nightS = segmentById('night').start
  private readonly uniforms: Record<string, THREE.IUniform>

  constructor() {
    endStandIn('ground')
    const shore = furrowShare(waterLevelsM[1])
    const keptS = segmentById('bloom').start
    const fieldS = segmentById('field').start
    const companion = companionPlace()
    const shoreKept = furrowKept.flat + (1 - furrowKept.flat) * furrowShare(waterLevelsM[1], furrowKept.depthM)
    this.uniforms = {
      uWet: { value: 0 },
      uFrost: { value: 0 },
      uDew: { value: 0 },
      uCover: { value: 0 },
      uCast: { value: 0 },
      uFine: { value: 1 },
      uToward: { value: new THREE.Vector2(toward.x, toward.z) },
      uRight: { value: new THREE.Vector2(right.x, right.z) },
      uCrop: { value: new THREE.Vector3(config.field.plantAheadOfRowM, 0, 0) },
      tColor: { value: null },
      tData: { value: null },
      tLitter: { value: null },
      uColorSize: { value: new THREE.Vector2(1, 1) },
      uRows: { value: new THREE.Vector3(config.field.rowSpacingM, config.field.plantAheadOfRowM, ridgeHeightM) },
      uWaterBox: { value: new THREE.Vector3(rippleBox.acrossM, rippleBox.awayM, rippleBox.halfM) },
      uTiles: { value: new THREE.Vector3(1 / soilTileM, 1 / (soilTileM * WIDE), 1 / soilMeanLuma) },
      uLitter: { value: 1 / litterTileM },
      uNear: { value: new THREE.Vector4(0.55 * nearRadiusM, 0.95 * nearRadiusM, nearGrowth - 1, 1) },
      uRelief: { value: new THREE.Vector4(soilReliefM, clodReliefM, 1 / (soilTileM * clodScale), 1 / soilReliefM) },
      uGrassTimes: { value: new THREE.Vector4(grassTimes.firstS, grassTimes.lastS, grassTimes.growS, grassTimes.laneS) },
      uEmerge: { value: new THREE.Vector4(emergence.riseS, emergence.liftM, emergence.radiusM, emergence.cracks) },
      uHole: { value: new THREE.Vector4(hole.fromS, hole.toS, hole.radiusM, hole.depthM) },
      uDome: { value: new THREE.Vector3(hole.domeM, hole.flatM, hole.wayOpen) },
      uSunWay: { value: new THREE.Vector2(sunWayDir.x, sunWayDir.z) },
      uFurrow: { value: new THREE.Vector4(furrow.leftM, furrow.slope, furrow.fromM, furrow.toM) },
      uFurrowAxes: { value: new THREE.Vector4(right.x, right.z, toward.x, toward.z) },
      uFurrowAt: { value: new THREE.Vector4(...furrow.atM) },
      uFurrowHalf: { value: new THREE.Vector4(...furrow.halfM) },
      uFurrowShore: { value: new THREE.Vector4((furrow.easeM * shore) / (1 - shore), furrow.easeM, furrow.wanderM, furrow.easeM * 3) },
      uFurrowShape: { value: new THREE.Vector4(furrow.depthM, furrow.bankM, furrow.windM, furrow.clearM) },
      uFurrowTime: { value: new THREE.Vector3(furrow.fromS, furrow.toS, furrow.before) },
      uFurrowWas: { value: new THREE.Vector4(...furrow.halfM.map((half) => half / shoreKept)) },
      uFurrowKept: { value: new THREE.Vector3(keptS, furrowKept.depthM, furrowKept.bankM) },
      uKeptS: { value: keptS },
      uRainS: { value: new THREE.Vector2(segmentById('rain').start, segmentById('rain').end) },
      uField: { value: new THREE.Vector4(fieldS, fieldLight.rightM, fieldLight.aheadM, fieldLight.reachM) },
      uStems: { value: new THREE.Vector4(0, 0, companion.x, companion.z) },
      uLane: { value: new THREE.Vector2(laneDir.x, laneDir.z) },
      uScales: { value: new THREE.Vector2(detailScale, 1 / clodScale) },
      uWater: { value: new THREE.Vector2(waterLevelsM[0], waterLevelsM[1]) },
      uMeanInv: { value: new THREE.Vector3(1 / soilMean[0], 1 / soilMean[1], 1 / soilMean[2]) },
    }
    this.surface = makeSurface({ name: 'soil', vertex: soilVertex, fragment: soilFragment, castShadow: false, uniforms: this.uniforms })
    this.near = makeSurface({ name: 'soil near', vertex: `#define NEAR\n${soilVertex}`, fragment: `#define NEAR\n${soilFragment}`, castShadow: true, uniforms: this.uniforms })
    this.grass = makeSurface({ name: 'grass', vertex: grassVertex, fragment: grassFragment, side: THREE.DoubleSide, castShadow: true, uniforms: this.uniforms })
    this.loose = makeSurface({ name: 'soil crumbs', vertex: crumbVertex, fragment: crumbFragment, castShadow: true, uniforms: this.uniforms })
    this.blades = makeSurface({ name: 'grass blades', vertex: bladeVertex, fragment: bladeFragment, side: THREE.DoubleSide, castShadow: true, uniforms: this.uniforms })
    this.fine = makeSurface({ name: 'soil crumbs fine', vertex: crumbVertex, fragment: crumbFragment, castShadow: true, uniforms: { ...this.uniforms, uFine: this.shown } })
    const close = (mesh: THREE.Mesh, kept?: boolean): THREE.Mesh => {
      const all = mesh.geometry.getIndex()!.count
      mesh.onBeforeRender = () => {
        const away = shared.uCamPos.value.length()
        this.shown.value = 1 - Math.min(1, Math.max(0, (away - fineReachM[0]) / (fineReachM[1] - fineReachM[0])))
        mesh.geometry.setDrawRange(0, this.shown.value > 0 && (kept === undefined || shared.uTime.value >= keptS === kept) ? all : 0)
      }
      return mesh
    }
    const when = (mesh: THREE.Mesh, kept: boolean): THREE.Mesh => {
      const all = mesh.geometry.getIndex()!.count
      mesh.onBeforeRender = () => mesh.geometry.setDrawRange(0, shared.uTime.value >= keptS === kept ? all : 0)
      return mesh
    }
    const young = (mesh: THREE.Mesh): THREE.Mesh => {
      const all = mesh.geometry.getIndex()!.count
      const stay = mesh.geometry.userData.stay as number
      const rainS = segmentById('rain').start
      mesh.onBeforeRender = () => mesh.geometry.setDrawRange(0, shared.uTime.value >= keptS ? 0 : shared.uTime.value < rainS ? all : stay)
      return mesh
    }
    const from = (mesh: THREE.Mesh): THREE.Mesh => {
      const all = mesh.geometry.getIndex()!.count
      mesh.onBeforeRender = () => mesh.geometry.setDrawRange(0, shared.uTime.value >= fieldS ? all : 0)
      return mesh
    }
    const add = (mesh: THREE.Mesh, surface: Surface, casts: boolean): void => {
      mesh.material = surface.main
      this.mesh.add(mesh)
      if (casts) this.cast.push({ mesh, surface })
    }
    add(new THREE.Mesh(soilGeometry()), this.surface, false)
    add(new THREE.Mesh(nearGeometry()), this.near, true)
    add(scatter('ground crumbs', crumbScatter), this.loose, true)
    add(when(scatter('ground clods', clodScatter), false), this.loose, true)
    add(when(scatter('ground clods', clodScatterKept), true), this.loose, true)
    add(close(scatter('ground lumps', lumpScatterYoung), false), this.fine, true)
    add(close(scatter('ground lumps', lumpScatter), true), this.fine, true)
    add(close(scatter('ground grains', grainScatter)), this.fine, true)
    add(when(scatter('ground masses', massScatterYoung), false), this.loose, true)
    add(when(scatter('ground masses', massScatter), true), this.loose, true)
    add(young(blades(clumps, beadSizes, clumpsDawn)), this.blades, true)
    add(when(blades(clumpsKept, beadSizesKept), true), this.blades, true)
    for (const mesh of tufts()) add(mesh, this.grass, true)
    for (const mesh of fieldTufts()) add(from(mesh), this.grass, true)
  }

  // What throws shadows. The film adds these to the scene itself and to its shadow pass, and from then on the soil stops estimating its own shadows.
  get casters(): Caster[] {
    this.uniforms.uCast.value = 1
    return this.cast
  }

  get shared(): Record<string, THREE.IUniform> {
    return this.uniforms
  }

  show(visible: boolean): void {
    this.mesh.visible = visible
    for (const c of this.cast) c.mesh.visible = visible
  }

  async load(assets: Assets): Promise<void> {
    const width = config.assetSets[assets.set].groundMapWidth
    const size = width / 4
    const u = this.uniforms
    u.tLitter.value = assets.data('ground/litter', 'ground', litterPixels(size), size, size, { repeat: true, anisotropy: 1 })
    const [color, data] = await Promise.all([
      assets.texture('ground', 'soil-color.jpg', { color: true, repeat: true, anisotropy: 1 }),
      assets.texture('ground', 'soil-data.png', { color: false, repeat: true, anisotropy: 1 }),
    ])
    u.tColor.value = color
    u.tData.value = data
    u.uColorSize.value.set(width, width)
    u.uNear.value.w = soilTileM / (width / 2)
  }

  // `cover` is how much of the ground under the field its leaves shade, from 0 to 1.
  setState(state: GroundState, cover: number): void {
    const u = this.uniforms
    const t = shared.uTime.value
    const settled = t < this.nightS ? 1 : smoothstep(this.nightS, this.nightS + dryS, t)
    u.uWet.value = Math.max(state.wet, 1 - settled)
    u.uFrost.value = state.frost
    u.uDew.value = (state.dew ?? 0) * settled
    u.uCover.value = cover
    u.uCrop.value.set(config.field.plantAheadOfRowM, cover * CROP_HEIGHT_M, cover)
  }
}
