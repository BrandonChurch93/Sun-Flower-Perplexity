import * as THREE from 'three'
import { config } from '../config.ts'
import type { Assets } from '../core/assets.ts'
import { declareStandIn, endStandIn } from '../core/standins.ts'
import { makeSurface, type Surface } from '../core/shading.ts'
import { right, toward } from '../field/layout.ts'
import { nearGeometry, soilGeometry } from './geometry.ts'
import { litterPixels } from './litter.ts'
import { litterTileM, ridgeHeightM, soilFragment, soilMeanLuma, soilTileM } from './soil.ts'
import { standInFragment, standInPixels, vertex } from './standin.ts'

const WIDE = 8.3
const CROP_HEIGHT_M = 0.9 * Math.max(...config.plant.heightM.map((k) => k[1]))

const state = (): Record<string, THREE.IUniform> => ({ uWet: { value: 0 }, uFrost: { value: 0 }, uCover: { value: 0 }, uToward: { value: new THREE.Vector2(toward.x, toward.z) }, uCrop: { value: new THREE.Vector3(config.field.plantAheadOfRowM, 0, 0) } })

export class Ground {
  // The soil under the crop and beyond the stand-in.
  readonly surface: Surface
  // What is still the placeholder: the meter round the plant and the camera's side.
  readonly nearSurface: Surface
  readonly mesh = new THREE.Group()

  constructor() {
    endStandIn('ground')
    declareStandIn('ground near', ['dawn', 'rain', 'night', 'frost', 'field'])
    this.surface = makeSurface({
      name: 'soil',
      vertex,
      fragment: soilFragment,
      castShadow: false,
      uniforms: {
        ...state(),
        tColor: { value: null },
        tData: { value: null },
        tLitter: { value: null },
        uColorSize: { value: new THREE.Vector2(1, 1) },
        uRight: { value: new THREE.Vector2(right.x, right.z) },
        uRows: { value: new THREE.Vector3(config.field.rowSpacingM, config.field.plantAheadOfRowM, ridgeHeightM) },
        uTiles: { value: new THREE.Vector3(1 / soilTileM, 1 / (soilTileM * WIDE), 1 / soilMeanLuma) },
        uLitter: { value: 1 / litterTileM },
      },
    })
    this.nearSurface = makeSurface({
      name: 'ground stand-in',
      vertex,
      fragment: standInFragment,
      standIn: true,
      castShadow: false,
      uniforms: { ...state(), tSoil: { value: null }, uSoilSize: { value: new THREE.Vector2(1, 1) } },
    })
    const add = (geometry: THREE.BufferGeometry, material: THREE.Material): void => {
      const mesh = new THREE.Mesh(geometry, material)
      mesh.frustumCulled = false
      this.mesh.add(mesh)
    }
    add(soilGeometry(), this.surface.main)
    for (const g of nearGeometry()) add(g, this.nearSurface.main)
  }

  async load(assets: Assets): Promise<void> {
    const width = config.assetSets[assets.set].groundMapWidth
    const size = width / 4
    const near = this.nearSurface.main.uniforms
    near.tSoil.value = assets.data('ground/soil-standin', 'ground', standInPixels(size), size, size, { repeat: true, anisotropy: 1 })
    near.uSoilSize.value.set(size, size)
    const u = this.surface.main.uniforms
    u.tLitter.value = assets.data('ground/litter', 'ground', litterPixels(size), size, size, { repeat: true, anisotropy: 1 })
    const [color, data] = await Promise.all([
      assets.texture('ground', 'soil-color.jpg', { color: true, repeat: true, anisotropy: 1 }),
      assets.texture('ground', 'soil-data.png', { color: false, repeat: true, anisotropy: 1 }),
    ])
    u.tColor.value = color
    u.tData.value = data
    u.uColorSize.value.set(width, width)
  }

  // `cover` is how much of the ground under the field its leaves shade, from 0 to 1.
  setState(state: { wet: number; frost: number }, cover: number): void {
    for (const s of [this.surface, this.nearSurface]) {
      const u = s.main.uniforms
      u.uWet.value = state.wet
      u.uFrost.value = state.frost
      u.uCover.value = cover
      u.uCrop.value.set(config.field.plantAheadOfRowM, cover * CROP_HEIGHT_M, cover)
    }
  }
}
