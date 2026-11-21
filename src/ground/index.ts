import * as THREE from 'three'
import { config } from '../config.ts'
import type { Assets } from '../core/assets.ts'
import type { Caster } from '../core/shadow.ts'
import { endStandIn } from '../core/standins.ts'
import { makeSurface, type Surface } from '../core/shading.ts'
import { right, toward } from '../field/layout.ts'
import { grassCover, grassTimes } from './cover.ts'
import { clodScatter, crumbFragment, crumbScatter, crumbVertex, laneDir, scatter } from './crumbs.ts'
import { nearGeometry, nearGrowth, nearRadiusM, soilGeometry } from './geometry.ts'
import { grassFragment, grassVertex, tufts } from './grass.ts'
import { litterPixels } from './litter.ts'
import { clodReliefM, clodScale, detailScale, emergence, groundStates, litterTileM, ridgeHeightM, soilFragment, soilHeight, soilMean, soilMeanLuma, soilReliefM, soilTileM, soilVertex, waterLevelsM } from './soil.ts'

const WIDE = 8.3
const CROP_HEIGHT_M = 0.9 * Math.max(...config.plant.heightM.map((k) => k[1]))

export interface GroundState { wet: number; frost: number; dew?: number }

export class Ground {
  // The soil beyond the near ground, the near ground itself, the loose soil on it, and the grass.
  readonly surface: Surface
  readonly near: Surface
  readonly grass: Surface
  readonly loose: Surface
  readonly mesh = new THREE.Group()
  // For what lies on the ground, puddles and frost: the height of the near ground in meters (soilHeight(p, soilLod(p)), flat beyond it), where water stands (pooled) and frost settles (frosted), and where grass grows (grassMask). Their uniforms are in `shared`.
  static readonly glsl = { height: soilHeight, states: groundStates, cover: grassCover }
  private readonly cast: Caster[] = []
  private readonly uniforms: Record<string, THREE.IUniform>

  constructor() {
    endStandIn('ground')
    this.uniforms = {
      uWet: { value: 0 },
      uFrost: { value: 0 },
      uDew: { value: 0 },
      uCover: { value: 0 },
      uCast: { value: 0 },
      uToward: { value: new THREE.Vector2(toward.x, toward.z) },
      uRight: { value: new THREE.Vector2(right.x, right.z) },
      uCrop: { value: new THREE.Vector3(config.field.plantAheadOfRowM, 0, 0) },
      tColor: { value: null },
      tData: { value: null },
      tLitter: { value: null },
      uColorSize: { value: new THREE.Vector2(1, 1) },
      uRows: { value: new THREE.Vector3(config.field.rowSpacingM, config.field.plantAheadOfRowM, ridgeHeightM) },
      uTiles: { value: new THREE.Vector3(1 / soilTileM, 1 / (soilTileM * WIDE), 1 / soilMeanLuma) },
      uLitter: { value: 1 / litterTileM },
      uNear: { value: new THREE.Vector4(0.55 * nearRadiusM, 0.95 * nearRadiusM, nearGrowth - 1, 1) },
      uRelief: { value: new THREE.Vector4(soilReliefM, clodReliefM, 1 / (soilTileM * clodScale), 1 / soilReliefM) },
      uGrassTimes: { value: new THREE.Vector4(grassTimes.firstS, grassTimes.lastS, grassTimes.growS, grassTimes.laneS) },
      uEmerge: { value: new THREE.Vector4(emergence.riseS, emergence.liftM, emergence.radiusM, emergence.cracks) },
      uLane: { value: new THREE.Vector2(laneDir.x, laneDir.z) },
      uScales: { value: new THREE.Vector2(detailScale, 1 / clodScale) },
      uWater: { value: new THREE.Vector2(waterLevelsM[0], waterLevelsM[1]) },
      uMeanInv: { value: new THREE.Vector3(1 / soilMean[0], 1 / soilMean[1], 1 / soilMean[2]) },
    }
    this.surface = makeSurface({ name: 'soil', vertex: soilVertex, fragment: soilFragment, castShadow: false, uniforms: this.uniforms })
    this.near = makeSurface({ name: 'soil near', vertex: `#define NEAR\n${soilVertex}`, fragment: `#define NEAR\n${soilFragment}`, castShadow: true, uniforms: this.uniforms })
    this.grass = makeSurface({ name: 'grass', vertex: grassVertex, fragment: grassFragment, side: THREE.DoubleSide, castShadow: true, uniforms: this.uniforms })
    this.loose = makeSurface({ name: 'soil crumbs', vertex: crumbVertex, fragment: crumbFragment, castShadow: true, uniforms: this.uniforms })
    const add = (mesh: THREE.Mesh, surface: Surface, casts: boolean): void => {
      mesh.material = surface.main
      this.mesh.add(mesh)
      if (casts) this.cast.push({ mesh, surface })
    }
    add(new THREE.Mesh(soilGeometry()), this.surface, false)
    add(new THREE.Mesh(nearGeometry()), this.near, true)
    add(scatter('ground crumbs', crumbScatter), this.loose, true)
    add(scatter('ground clods', clodScatter), this.loose, true)
    for (const mesh of tufts()) add(mesh, this.grass, true)
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
    u.uWet.value = state.wet
    u.uFrost.value = state.frost
    u.uDew.value = state.dew ?? 0
    u.uCover.value = cover
    u.uCrop.value.set(config.field.plantAheadOfRowM, cover * CROP_HEIGHT_M, cover)
  }
}
