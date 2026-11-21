import type { WorldSettings, WorldStageMaker } from '../../core/world.ts'
import { makeMist, type MistSettings } from '../../weather/mist/index.ts'
import { SKYLINE_DAWN_SUN_DEG } from '../../weather/skyline.ts'
import { world as golden } from '../golden/index.ts'
import { makeFarLayers } from './layers.ts'
import { DawnSky } from './sky.ts'

export const world: WorldSettings = {
  standIn: false,
  sun: { azimuthDeg: SKYLINE_DAWN_SUN_DEG, elevationDeg: 1.005, color: [12.8, 7.8, 3.7], softnessDeg: 1.2, lean: 1, lift: 1 },
  sky: { zenith: [0.2, 0.3, 0.42], horizon: [0.9, 0.85, 0.8], bounce: [0.07, 0.05, 0.035], ambient: 1, glow: [9, 4.7, 2.3], glowPower: 60, disc: 35 },
  backdrop: { file: null, key: 'dawn-seedling', sunAt: null, gain: 1, blur: 0.25 },
  fog: { color: [0.28, 0.32, 0.34], sunTint: [1.4, 0.75, 0.3], density: 0.003, falloff: 1.4 },
  grade: { exposure: 0.78, contrast: 1.28, white: 9, saturation: 1.04, gain: [1.03, 1, 0.96], lift: [0.0015, 0.003, 0.003], bloom: 0.11, bloomKnee: 1.1, vignette: 0.3, grain: 0.012 },
  ground: { wet: 0.25, frost: 0, dew: 1 },
  wind: 0.1,
}

const SKY_GAIN = 1.6
const AIR_COOL: [number, number, number] = [0.3, 0.46, 0.54]
const AIR_WARM: [number, number, number] = [1.7, 0.9, 0.36]
const AIR_PER_M = 0.00025

export const mist: MistSettings = {
  fromM: 0.35,
  toM: 2,
  sheets: 7,
  heightM: 0.013,
  thickness: 0.955,
  lit: [0.07, 0.038, 0.024],
  shade: [0.33, 0.44, 0.38],
  forward: 1,
  drift: [0.05, 0.02],
  bankM: 0.4,
  broken: 0.9,
  rise: 0.7,
  lobeRad: 0.2,
}

export const stage: WorldStageMaker = (def) => {
  const sky = new DawnSky(def, SKY_GAIN)
  const far = makeFarLayers(golden.sun.azimuthDeg, AIR_COOL, AIR_WARM, AIR_PER_M)
  const air = makeMist('dawn', mist)
  let open = 0
  let close = 0
  return {
    objects: [...far.meshes, ...air.meshes],
    load: (assets) => sky.load(assets),
    prepare(frame) {
      open = frame.time
      close = frame.timeClose
      far.setTime(frame.time)
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
