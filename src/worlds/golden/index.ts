import type { WorldSettings, WorldStageMaker } from '../../core/world.ts'
import { makeAir } from './air.ts'
import { makeFarLayers } from './layers.ts'
import { GoldenSky } from './sky.ts'

export const world: WorldSettings = {
  standIn: false,
  sun: { azimuthDeg: -133.67, elevationDeg: 2.18, color: [8.5, 5.0, 2.0], softnessDeg: 1.2, lean: 0.8, lift: 1 },
  sky: { zenith: [0.055, 0.075, 0.115], horizon: [0.26, 0.2, 0.135], bounce: [0.04, 0.028, 0.014], ambient: 0.8, glow: [1, 0.62, 0.27], glowPower: 40, disc: 90 },
  backdrop: { file: null, key: 'bloom-hero', sunAt: null, gain: 1, blur: 0.25 },
  fog: { color: [0.1, 0.105, 0.11], sunTint: [0.4, 0.23, 0.09], density: 0.0004, falloff: 0.05 },
  grade: { exposure: 0.74, contrast: 1.3, white: 9, saturation: 1.06, gain: [1.03, 1, 0.96], lift: [0.003, 0.004, 0.008], bloom: 0.13, bloomKnee: 1.1, vignette: 0.3, grain: 0.012 },
  ground: { wet: 0, frost: 0, dew: 0 },
  wind: 0.5,
}

const SKY_GAIN = 1.4

export const stage: WorldStageMaker = (def) => {
  const sky = new GoldenSky(def)
  const far = makeFarLayers(def.sun.azimuthDeg, def.sky.glow)
  const air = makeAir()
  let open = 0
  let close = 0
  let width = 1
  let samples = 1
  return {
    objects: [...far.meshes, ...air.meshes],
    load: (assets) => sky.load(assets),
    prepare(frame) {
      open = frame.time
      close = frame.timeClose
      width = frame.width
      samples = frame.samples
      sky.prepare(frame.time, SKY_GAIN)
    },
    sample(camera, shutter) {
      const e = camera.projectionMatrix.elements
      air.sample(open + (close - open) * shutter, def.wind, 2 / (e[0] * width), samples)
    },
    sky(renderer, target, camera, _pixelX, _pixelY, across) {
      sky.render(renderer, target, camera, across)
    },
  }
}
