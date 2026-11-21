import type { WorldSettings, WorldStageMaker } from '../../core/world.ts'
import { makeMist, type MistSettings } from '../../weather/mist/index.ts'
import { makeFarLayers } from './layers.ts'
import { DawnSky } from './sky.ts'

export const world: WorldSettings = {
  standIn: true,
  sun: { azimuthDeg: 175.007, elevationDeg: 1.005, color: [7.5, 4.6, 2.2], softnessDeg: 1.2, lean: 1, lift: 1 },
  sky: { zenith: [0.2, 0.34, 0.62], horizon: [1.3, 0.92, 0.5], bounce: [0.07, 0.05, 0.035], ambient: 0.75, glow: [9, 5.2, 2], glowPower: 60, disc: 60 },
  backdrop: { file: null, key: 'dawn-seedling', sunAt: null, gain: 1, blur: 0.25 },
  fog: { color: [0.75, 0.62, 0.48], sunTint: [1.6, 0.9, 0.3], density: 0.012, falloff: 1.4 },
  grade: { exposure: 0.78, contrast: 1.28, white: 9, saturation: 1.04, gain: [1.03, 1, 0.96], lift: [0, 0, 0.004], bloom: 0.11, bloomKnee: 1.1, vignette: 0.3, grain: 0.012 },
  ground: { wet: 0.25, frost: 0, dew: 1 },
  wind: 0.1,
}

const SKY_GAIN = 1.25
const AIR_COOL: [number, number, number] = [0.5, 0.6, 0.66]
const AIR_WARM: [number, number, number] = [2.2, 1.3, 0.6]
const AIR_PER_M = 0.00025

export const mist: MistSettings = {
  fromM: 0.3,
  toM: 300,
  sheets: 20,
  heightM: 0.08,
  thickness: 0.2,
  lit: [0.11, 0.1, 0.09],
  shade: [0.8, 0.52, 0.32],
  forward: 1,
  drift: [0.05, 0.02],
  bankM: 0.9,
  broken: 0.5,
}

export const stage: WorldStageMaker = (def) => {
  const sky = new DawnSky(def, SKY_GAIN)
  const far = makeFarLayers(def.sun.azimuthDeg, AIR_COOL, AIR_WARM, AIR_PER_M)
  const air = makeMist('dawn', mist)
  let open = 0
  let close = 0
  return {
    objects: [...far.meshes, ...air.meshes],
    load: (assets) => sky.load(assets),
    prepare(frame) {
      open = frame.time
      close = frame.timeClose
      sky.prepare(frame.time, frame.samples)
    },
    sample(_camera, shutter) {
      air.sample(open + (close - open) * shutter)
    },
    sky(renderer, target, camera, _pixelX, _pixelY, across) {
      sky.render(renderer, target, camera, across)
    },
  }
}
