import * as THREE from 'three'
import { config } from '../config.ts'
import type { Assets } from '../core/assets.ts'
import type { Caster } from '../core/shadow.ts'
import type { Quality } from '../v2/api.ts'
import { endStandIn } from '../core/standins.ts'
import { makeSurface, shared, type Surface } from '../core/shading.ts'
import { smoothstep } from '../core/curves.ts'
import { now } from '../v2/now.ts'
import { companionPlace, right, toward } from '../field/layout.ts'
import { beadSizes, bladeFragment, bladeVertex, blades, clumps, clumpsDawn } from './blades.ts'
import { clodHeightM, clodPixels, clodTileM } from './clods.ts'
import { grassCover, grassTimes } from './cover.ts'
import { clodScatter, crumbFragment, crumbScatter, crumbVertex, fineReachM, grainScatter, laneDir, lumpScatter, massScatter, scatter } from './crumbs.ts'
import { coarseGrowth, nearGeometry, nearGrowth, reliefRadiusM, soilGeometry } from './geometry.ts'
import { fieldTufts, grassFragment, grassVertex, tufts } from './grass.ts'
import { fieldLight } from './light.ts'
import { litterPixels } from './litter.ts'
import { rippleBox } from './puddles/basin.ts'
import { clodReliefM, clodScale, crack, detailScale, emergence, furrow, furrowShare, groundStates, hole, litterTileM, ridgeHeightM, soilFragment, soilHeight, soilMean, soilMeanLuma, soilClock, soilReliefM, soilTileM, soilVertex, sunWayDir, waterLevelsM } from './soil.ts'

const WIDE = 8.3
// The steps of the walk toward the light that finds the clods' shadows, for each quality, and how far the walk goes.
const MARCH: Record<Quality, number> = { film: 14, high: 10, low: 5 }
const MARCH_REACH = 150
const reach = (steps: number): number => Math.pow(MARCH_REACH, 1 / (steps - 1))
const CLOD_MAP = 1024
const CROP_HEIGHT_M = 0.9 * Math.max(...config.plant.heightM.map((k) => k[1]))

export interface GroundState { wet: number; frost: number; dew?: number }

// The ground's own uniforms, for whatever lies on it and is drawn by someone else.
export const groundShared: Record<string, THREE.IUniform> = {}

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
  private readonly uniforms: Record<string, THREE.IUniform>
  private readonly fineNear: THREE.Mesh
  private readonly coarseNear: THREE.Mesh
  private quality: Quality = 'high'

  constructor() {
    endStandIn('ground')
    const shore = furrowShare(waterLevelsM[1])
    const companion = companionPlace()
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
      uNear: { value: new THREE.Vector4(0.72 * reliefRadiusM, 0.97 * reliefRadiusM, nearGrowth - 1, 1) },
      tClods: { value: null },
      uClods: { value: new THREE.Vector4(1 / clodTileM, clodHeightM, 1, 0.5) },
      uClodLod: { value: 0 },
      uMarch: { value: new THREE.Vector2(MARCH.high, reach(MARCH.high)) },
      uFlashAt: { value: new THREE.Vector3(0, 1, 0) },
      uRelief: { value: new THREE.Vector4(soilReliefM, clodReliefM, 1 / (soilTileM * clodScale), 1 / soilReliefM) },
      uGrassTimes: { value: new THREE.Vector4(grassTimes.firstS, grassTimes.lastS, grassTimes.growS, grassTimes.laneS) },
      uEmerge: { value: new THREE.Vector4(emergence.riseS, emergence.liftM, emergence.radiusM, emergence.cracks) },
      uHole: { value: new THREE.Vector4(hole.fromS, hole.toS, hole.radiusM, hole.depthM) },
      uCrack: { value: new THREE.Vector4(crack.halfLenM, crack.fromM, crack.toM, crack.openS) },
      uCrackCut: { value: new THREE.Vector4(crack.footM, crack.windM, crack.shutS, crack.lipM) },
      uCrackWay: { value: new THREE.Vector4(crack.aheadM, crack.turn, crack.footS, crack.fillS) },
      uCrackBay: { value: new THREE.Vector4(crack.bayM, crack.bayLenM, crack.bayFromS, crack.bayToS) },
      uDome: { value: new THREE.Vector3(hole.domeM, hole.flatM, hole.wayOpen) },
      uSunWay: { value: new THREE.Vector2(sunWayDir.x, sunWayDir.z) },
      uFurrow: { value: new THREE.Vector4(furrow.leftM, furrow.slope, furrow.fromM, furrow.toM) },
      uFurrowAxes: { value: new THREE.Vector4(right.x, right.z, toward.x, toward.z) },
      uFurrowAt: { value: new THREE.Vector4(...furrow.atM) },
      uFurrowHalf: { value: new THREE.Vector4(...furrow.halfM) },
      uFurrowShore: { value: new THREE.Vector4((furrow.easeM * shore) / (1 - shore), furrow.easeM, furrow.wanderM, furrow.easeM * 3) },
      uFurrowShape: { value: new THREE.Vector4(furrow.depthM, furrow.bankM, furrow.windM, furrow.clearM) },
      uField: { value: new THREE.Vector2(soilClock.turf[0], soilClock.turf[1]) },
      uFieldLight: { value: new THREE.Vector3(fieldLight.rightM, fieldLight.aheadM, fieldLight.reachM) },
      uLowSun: { value: new THREE.Vector3(0, 1, 0) },
      uAir: { value: new THREE.Vector4(0, 0, 0, 0) },
      uDusk: { value: 0 },
      uDay: { value: 0 },
      uBlueHour: { value: 0 },
      uMirror: { value: 1 },
      uStems: { value: new THREE.Vector4(0, 0, companion.x, companion.z) },
      uLane: { value: new THREE.Vector2(laneDir.x, laneDir.z) },
      uScales: { value: new THREE.Vector2(detailScale, 1 / clodScale) },
      uWater: { value: new THREE.Vector2(waterLevelsM[0], waterLevelsM[1]) },
      uMeanInv: { value: new THREE.Vector3(1 / soilMean[0], 1 / soilMean[1], 1 / soilMean[2]) },
    }
    this.surface = makeSurface({ name: 'soil', vertex: soilVertex, fragment: soilFragment, castShadow: false, uniforms: this.uniforms })
    Object.assign(groundShared, this.uniforms)
    this.near = makeSurface({ name: 'soil near', vertex: `#define NEAR\n${soilVertex}`, fragment: `#define NEAR\n${soilFragment}`, castShadow: true, uniforms: this.uniforms })
    this.grass = makeSurface({ name: 'grass', vertex: grassVertex, fragment: grassFragment, side: THREE.DoubleSide, castShadow: true, uniforms: this.uniforms })
    this.loose = makeSurface({ name: 'soil crumbs', vertex: crumbVertex, fragment: crumbFragment, castShadow: true, uniforms: this.uniforms })
    this.blades = makeSurface({ name: 'grass blades', vertex: bladeVertex, fragment: bladeFragment, side: THREE.DoubleSide, castShadow: true, uniforms: this.uniforms })
    this.fine = makeSurface({ name: 'soil crumbs fine', vertex: crumbVertex, fragment: crumbFragment, castShadow: true, uniforms: { ...this.uniforms, uFine: this.shown } })
    const close = (mesh: THREE.Mesh): THREE.Mesh => {
      const all = mesh.geometry.getIndex()!.count
      mesh.onBeforeRender = () => {
        const away = shared.uCamPos.value.length()
        this.shown.value = 1 - Math.min(1, Math.max(0, (away - fineReachM[0]) / (fineReachM[1] - fineReachM[0])))
        mesh.geometry.setDrawRange(0, this.shown.value > 0 ? all : 0)
      }
      return mesh
    }
    const add = (mesh: THREE.Mesh, surface: Surface, casts: boolean): void => {
      mesh.material = surface.main
      mesh.frustumCulled = false
      this.mesh.add(mesh)
      if (casts) this.cast.push({ mesh, surface })
    }
    add(new THREE.Mesh(soilGeometry()), this.surface, false)
    this.fineNear = new THREE.Mesh(nearGeometry())
    this.coarseNear = new THREE.Mesh(nearGeometry(true))
    add(this.fineNear, this.near, true)
    add(this.coarseNear, this.near, true)
    const asked = typeof location === 'undefined' ? null : new URLSearchParams(location.search).get('quality')
    this.setQuality(asked === 'film' || asked === 'low' ? asked : 'high')
    add(scatter('ground crumbs', crumbScatter), this.loose, true)
    add(scatter('ground clods', clodScatter), this.loose, true)
    add(close(scatter('ground lumps', lumpScatter)), this.fine, true)
    add(close(scatter('ground grains', grainScatter)), this.fine, true)
    add(scatter('ground masses', massScatter), this.loose, true)
    add(blades([...clumps, ...clumpsDawn], beadSizes), this.blades, true)
    for (const mesh of tufts()) add(mesh, this.grass, true)
    for (const mesh of fieldTufts()) add(mesh, this.grass, true)
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
    this.fineNear.visible = visible && this.quality !== 'low'
    this.coarseNear.visible = visible && this.quality === 'low'
  }

  // What the low quality saves: a near ground of a quarter of the triangles, and half the steps of the walk that finds the clods' shadows.
  setQuality(quality: Quality): void {
    this.quality = quality
    ;(this.uniforms.uMarch.value as THREE.Vector2).set(MARCH[quality], reach(MARCH[quality]))
    ;(this.uniforms.uNear.value as THREE.Vector4).z = (quality === 'low' ? coarseGrowth : nearGrowth) - 1
    this.show(this.mesh.visible)
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
    const clods = clodPixels(CLOD_MAP)
    u.tClods.value = assets.data('ground/clods', 'ground', clods.pixels, CLOD_MAP, CLOD_MAP, { color: false, repeat: true, anisotropy: 4 })
    ;(u.uClods.value as THREE.Vector4).set(1 / clodTileM, clodHeightM, CLOD_MAP / clodTileM, clods.mean)
    u.uColorSize.value.set(width, width)
    u.uNear.value.w = soilTileM / (width / 2)
    u.uClodLod.value = Math.log2((u.uNear.value.w * CLOD_MAP) / clodTileM)
  }

  // `cover` is how much of the ground under the field its leaves shade, from 0 to 1.
  setState(state: GroundState, cover: number): void {
    const u = this.uniforms
    u.uWet.value = state.wet
    u.uFrost.value = state.frost
    u.uDew.value = state.dew ?? 0
    const flat = Math.hypot(now.sun.x, now.sun.z)
    const low = 1 - smoothstep(0.1, 0.45, now.sun.y)
    ;(u.uLowSun.value as THREE.Vector3).set(now.sun.x / Math.max(flat, 1e-5), now.sun.z / Math.max(flat, 1e-5), low * (1 - now.night))
    ;(u.uFlashAt.value as THREE.Vector3).copy(now.flashAt)
    u.uDusk.value = 1 - smoothstep(-0.05, 0.02, now.sun.y)
    u.uDay.value = smoothstep(0.08, 0.4, now.sun.y)
    u.uBlueHour.value = u.uDusk.value * u.uDew.value
    u.uMirror.value = 1 - (6 / 7) * smoothstep(0.052, 0.087, -now.sun.y)
    ;(u.uAir.value as THREE.Vector4).set(now.dials.wind, now.dials.flash, now.dials.burst, now.dials.cold)
    u.uCover.value = cover
    u.uCrop.value.set(config.field.plantAheadOfRowM, cover * CROP_HEIGHT_M, cover)
  }
}
