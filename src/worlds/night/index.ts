import type { WorldSettings, WorldStageMaker } from '../../core/world.ts'
import { makeMist, type MistSettings } from '../../weather/mist/index.ts'
import { world as golden } from '../golden/index.ts'
import { makeFarLayers } from './layers.ts'
import { NightSky } from './sky.ts'

export const world: WorldSettings = {
  standIn: false,
  sun: { azimuthDeg: 225, elevationDeg: 25, color: [1.3, 1.42, 1.6], softnessDeg: 1.5, lean: 0, lift: 0 },
  sky: { zenith: [0.014, 0.026, 0.046], horizon: [0.03, 0.05, 0.085], bounce: [0.004, 0.006, 0.012], ambient: 1.3, glow: [0, 0, 0], glowPower: 8, disc: 0, even: 0.6 },
  backdrop: { file: null, key: 'night', sunAt: null, gain: 1, blur: 0.25 },
  fog: { color: [0.02, 0.034, 0.05], sunTint: [0.02, 0.03, 0.04], density: 0.006, falloff: 1.2 },
  grade: { exposure: 1.35, contrast: 1.4, white: 5, saturation: 0.92, gain: [0.92, 1, 0.98], lift: [0.0012, 0.0028, 0.0028], bloom: 0.07, bloomKnee: 0.9, vignette: 0.36, grain: 0.016 },
  ground: { wet: 0, frost: 0, dew: 1 },
  wind: 0.1,
}

// Cold and low: a thin layer in the crop under eye level, and a broken bank over the far field to the foot of the hills.
const MIST: MistSettings = { fromM: 6.5, toM: 60, sheets: 10, heightM: 0.14, thickness: 0.92, lit: [0.4, 0.4, 0.36], shade: [7.4, 5.4, 3.7], forward: 1, drift: [0.55, 0.2], bankM: 6, broken: 0.9, lobeRad: 0.34, rise: 0.6 }
const BANK: MistSettings = { fromM: 50, toM: 75, sheets: 3, heightM: 0.34, thickness: 0.6, lit: [0.55, 0.55, 0.5], shade: [5.4, 4.0, 2.7], forward: 1, drift: [0.9, 0.35], bankM: 16, broken: 1, lobeRad: 0.34 }

// The sky is painted for the grade below: its curve undoes the grade's contrast and its saturation the grade's, so the sky keeps the approved's tones while the plant gets the harder light.
const SKY_GAIN = 0.84
const SKY_CURVE = 0.86
const SKY_SATURATION = 0.96
const STAR_GAIN = 3.2

export const stage: WorldStageMaker = (def) => {
  const sky = new NightSky({ gain: SKY_GAIN, curve: SKY_CURVE, saturation: SKY_SATURATION, stars: STAR_GAIN, glow: def.sky.glow, glowPower: def.sky.glowPower, zenith: def.sky.zenith, horizon: def.sky.horizon })
  const far = makeFarLayers(golden.sun.azimuthDeg)
  const mist = makeMist('night', MIST)
  const bank = makeMist('night bank', BANK, 40)
  let open = 0
  let close = 0
  return {
    objects: [...far.meshes, ...bank.meshes, ...mist.meshes],
    load: (assets) => sky.load(assets),
    prepare(frame) {
      open = frame.time
      close = frame.timeClose
      far.setTime(frame.time)
    },
    sample(_camera, shutter) {
      const time = open + (close - open) * shutter
      sky.sample(time)
      mist.sample(time)
      bank.sample(time)
    },
    sky(renderer, target, camera, pixelX, pixelY, width, height) {
      sky.render(renderer, target, camera, pixelX, pixelY, width, height)
    },
  }
}
