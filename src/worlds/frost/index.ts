import type { RGB, WorldSettings, WorldStageMaker } from '../../core/world.ts'
import { makeFog } from '../../weather/fog/index.ts'
import { world as golden } from '../golden/index.ts'
import { makeFarLayers } from './layers.ts'
import { FrostSky } from './sky.ts'

export const world: WorldSettings = {
  standIn: true,
  sun: { azimuthDeg: 178.82, elevationDeg: 8.47, color: [0.3, 0.27, 0.24], softnessDeg: 20, lean: 0.4, lift: 0.45 },
  sky: { zenith: [0.58, 0.6, 0.6], horizon: [0.6, 0.62, 0.62], bounce: [0.3, 0.31, 0.3], ambient: 0.42, glow: [1.97, 0.6, 0.15], glowPower: 22, disc: 4.4 },
  backdrop: { file: null, key: 'frost', sunAt: null, gain: 1, blur: 0.25 },
  fog: { color: [0.26, 0.325, 0.45], sunTint: [0.36, 0.31, 0.2], density: 0.046, falloff: 1.7 },
  grade: { exposure: 0.8, contrast: 1.16, white: 6, saturation: 0.95, gain: [1, 1, 1.02], lift: [0.006, 0.007, 0.009], bloom: 0.1, bloomKnee: 1.0, vignette: 0.28, grain: 0.013 },
  ground: { wet: 0, frost: 1, dew: 0 },
  wind: 0,
}

const FOG_HIGH: RGB = [0.54, 0.69, 0.91]

export const stage: WorldStageMaker = (def) => {
  const fog = makeFog(def, FOG_HIGH)
  const sky = new FrostSky(def, fog.uniforms)
  const far = makeFarLayers(golden.sun.azimuthDeg, fog.uniforms)
  let open = 0
  let close = 0
  return {
    objects: [...far.meshes, ...fog.meshes],
    prepare(frame) {
      open = frame.time
      close = frame.timeClose
    },
    sample(_camera, shutter) {
      const now = open + (close - open) * shutter
      fog.at(now)
      sky.at(now)
    },
    sky(renderer, target, camera, _pixelX, _pixelY, across) {
      sky.render(renderer, target, camera, across)
    },
  }
}
