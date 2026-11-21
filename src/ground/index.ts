import * as THREE from 'three'
import { config } from '../config.ts'
import type { Assets } from '../core/assets.ts'
import type { Caster } from '../core/shadow.ts'
import { declareStandIn, endStandIn } from '../core/standins.ts'
import { makeSurface, type Surface } from '../core/shading.ts'
import { right, toward } from '../field/layout.ts'
import { grassGeometry, nearGeometry, nearGrowth, nearRadiusM, soilGeometry } from './geometry.ts'
import { litterPixels } from './litter.ts'
import { clodReliefM, clodScale, detailScale, litterTileM, ridgeHeightM, soilFragment, soilMean, soilMeanLuma, soilReliefM, soilTileM, soilVertex } from './soil.ts'
import { standInFragment, standInPixels, vertex } from './standin.ts'

const WIDE = 8.3
const CROP_HEIGHT_M = 0.9 * Math.max(...config.plant.heightM.map((k) => k[1]))

export interface GroundState { wet: number; frost: number; dew?: number }

export class Ground {
  // The soil beyond the near ground, the near ground itself, and what is still the placeholder: the grass strip on the camera's side.
  readonly surface: Surface
  readonly near: Surface
  readonly strip: Surface
  readonly mesh = new THREE.Group()
  private readonly nearMesh: THREE.Mesh
  private readonly uniforms: Record<string, THREE.IUniform>

  constructor() {
    endStandIn('ground')
    declareStandIn('ground near', ['dawn', 'rain', 'night', 'frost', 'field'])
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
      tSoil: { value: null },
      uSoilSize: { value: new THREE.Vector2(1, 1) },
      uColorSize: { value: new THREE.Vector2(1, 1) },
      uRows: { value: new THREE.Vector3(config.field.rowSpacingM, config.field.plantAheadOfRowM, ridgeHeightM) },
      uTiles: { value: new THREE.Vector3(1 / soilTileM, 1 / (soilTileM * WIDE), 1 / soilMeanLuma) },
      uLitter: { value: 1 / litterTileM },
      uNear: { value: new THREE.Vector4(0.55 * nearRadiusM, 0.95 * nearRadiusM, nearGrowth - 1, 1) },
      uRelief: { value: new THREE.Vector4(soilReliefM, clodReliefM, 1 / (soilTileM * clodScale), 1 / soilReliefM) },
      uScales: { value: new THREE.Vector2(detailScale, 1 / clodScale) },
      uMeanInv: { value: new THREE.Vector3(1 / soilMean[0], 1 / soilMean[1], 1 / soilMean[2]) },
    }
    this.surface = makeSurface({ name: 'soil', vertex: soilVertex, fragment: soilFragment, castShadow: false, uniforms: this.uniforms })
    this.near = makeSurface({ name: 'soil near', vertex: `#define NEAR\n${soilVertex}`, fragment: `#define NEAR\n${soilFragment}`, castShadow: true, uniforms: this.uniforms })
    this.strip = makeSurface({ name: 'ground stand-in', vertex, fragment: standInFragment, standIn: true, castShadow: false, uniforms: this.uniforms })
    const add = (geometry: THREE.BufferGeometry, material: THREE.Material): THREE.Mesh => {
      const mesh = new THREE.Mesh(geometry, material)
      mesh.frustumCulled = false
      this.mesh.add(mesh)
      return mesh
    }
    add(soilGeometry(), this.surface.main)
    this.nearMesh = add(nearGeometry(), this.near.main)
    add(grassGeometry(), this.strip.main)
  }

  // Asking for these says the film draws them into the shadow map, so the soil stops estimating its own shadows.
  get casters(): Caster[] {
    this.uniforms.uCast.value = 1
    return [{ mesh: this.nearMesh, surface: this.near }]
  }

  async load(assets: Assets): Promise<void> {
    const width = config.assetSets[assets.set].groundMapWidth
    const size = width / 4
    const u = this.uniforms
    u.tSoil.value = assets.data('ground/soil-standin', 'ground', standInPixels(size), size, size, { repeat: true, anisotropy: 1 })
    u.uSoilSize.value.set(size, size)
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
