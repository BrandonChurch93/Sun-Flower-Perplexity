import type { WorldSettings, WorldStageMaker } from '../../core/world.ts'
import { shared } from '../../core/shading.ts'
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
  grade: { exposure: 0.78, contrast: 1.28, white: 9, saturation: 1.04, gain: [1.03, 1, 0.96], lift: [0.0008, 0.0015, 0.003], bloom: 0.11, bloomKnee: 1.1, vignette: 0.3, grain: 0.012 },
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
  thickness: 0.4,
  lit: [0.04, 0.026, 0.02],
  shade: [0.56, 0.58, 0.46],
  forward: 1,
  drift: [0.05, 0.02],
  bankM: 0.4,
  broken: 0.9,
  rise: 0.7,
  lobeRad: 0.2,
}

export const bank: MistSettings = {
  fromM: 35,
  toM: 300,
  sheets: 8,
  heightM: 1.1,
  thickness: 0.05,
  lit: [0.072, 0.08, 0.112],
  shade: [1.2, 1.0, 0.78],
  forward: 1,
  drift: [0.22, 0.05],
  bankM: 6,
  broken: 0.85,
  rise: 0.5,
  lobeRad: 0.3,
}
// The mist over the field between the plant's ground and the far bank: shin high, in slow banks that roll across the view, and lit where one looks through it toward the sun.
export const rolling: MistSettings = {
  fromM: 2,
  toM: 40,
  sheets: 7,
  heightM: 0.07,
  thickness: 0.22,
  lit: [0.12, 0.09, 0.06],
  shade: [0.8, 0.82, 0.72],
  forward: 1,
  drift: [0.3, 0.05],
  bankM: 1.6,
  broken: 1,
  rise: 0.6,
  lobeRad: 0.2,
  rollZ: 8,
  swell: 1,
}
const BANK_LOW_M = 0.18
const BANK_SETTLES_FROM_S = 1
const BANK_SETTLES_TO_S = 6
const bankHeightAt = (time: number): number => {
  const t = Math.min(1, Math.max(0, (time - BANK_SETTLES_FROM_S) / (BANK_SETTLES_TO_S - BANK_SETTLES_FROM_S)))
  return bank.heightM + (BANK_LOW_M - bank.heightM) * t * t * (3 - 2 * t)
}

// In the film's first half second a gap in the low cloud lets the warm glow round the rising sun down onto the near ground; the gap closes before one second.
const GLOW_HOLDS_TO_S = 0.5
const GLOW_GONE_AT_S = 0.95
const GLOW_ON_GROUND: [number, number, number] = [0.72, 0.41, 0.2]
const glowAt = (time: number): number => {
  const t = Math.min(1, Math.max(0, (time - GLOW_HOLDS_TO_S) / (GLOW_GONE_AT_S - GLOW_HOLDS_TO_S)))
  return 1 - t * t * (3 - 2 * t)
}

export const stage: WorldStageMaker = (def) => {
  const sky = new DawnSky(def, SKY_GAIN)
  const far = makeFarLayers(golden.sun.azimuthDeg, AIR_COOL, AIR_WARM, AIR_PER_M)
  const air = makeMist('dawn', mist)
  const banks = makeMist('dawn bank', bank, 40)
  const over = makeMist('dawn field', rolling, 50)
  let open = 0
  let close = 0
  return {
    objects: [...far.meshes, ...banks.meshes, ...over.meshes, ...air.meshes],
    load: (assets) => sky.load(assets),
    prepare(frame) {
      open = frame.time
      close = frame.timeClose
      far.setTime(frame.time)
      sky.prepare(frame.time, frame.samples)
    },
    sample(_camera, shutter) {
      const time = open + (close - open) * shutter
      air.sample(time)
      banks.sample(time)
      over.sample(time)
      banks.settle(bankHeightAt(time))
      const glow = glowAt(time)
      if (glow > 0) {
        shared.uSkyZenith.value.x += GLOW_ON_GROUND[0] * glow
        shared.uSkyZenith.value.y += GLOW_ON_GROUND[1] * glow
        shared.uSkyZenith.value.z += GLOW_ON_GROUND[2] * glow
        shared.uSkyHorizon.value.x += GLOW_ON_GROUND[0] * glow
        shared.uSkyHorizon.value.y += GLOW_ON_GROUND[1] * glow
        shared.uSkyHorizon.value.z += GLOW_ON_GROUND[2] * glow
      }
    },
    sky(renderer, target, camera, _pixelX, _pixelY, across) {
      sky.render(renderer, target, camera, across)
    },
  }
}
