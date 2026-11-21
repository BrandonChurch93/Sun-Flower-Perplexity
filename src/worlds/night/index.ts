import type { WorldSettings, WorldStageMaker } from '../../core/world.ts'
import { makeMist, type MistSettings } from '../../weather/mist/index.ts'
import { world as golden } from '../golden/index.ts'
import { makeFarLayers } from './layers.ts'
import { NightSky } from './sky.ts'

export const world: WorldSettings = {
  standIn: true,
  sun: { azimuthDeg: 242, elevationDeg: 28, color: [2.0, 2.5, 3.3], softnessDeg: 1.5, lean: 0.25, lift: 0 },
  sky: { zenith: [0.012, 0.022, 0.06], horizon: [0.03, 0.05, 0.1], bounce: [0.004, 0.006, 0.012], ambient: 1.6, glow: [0, 0, 0], glowPower: 8, disc: 0 },
  backdrop: { file: null, key: 'night', sunAt: null, gain: 1, blur: 0.25 },
  fog: { color: [0.02, 0.034, 0.05], sunTint: [0.02, 0.03, 0.04], density: 0.006, falloff: 1.2 },
  grade: { exposure: 1.35, contrast: 1.22, white: 5, saturation: 0.95, gain: [0.92, 1, 0.98], lift: [0.002, 0.004, 0.012], bloom: 0.07, bloomKnee: 0.9, vignette: 0.36, grain: 0.016 },
  ground: { wet: 0.1, frost: 0, dew: 0.5 },
  wind: 0.1,
}

// Cold and low: it lies over the field under eye level and thickens toward the foot of the hills.
const MIST: MistSettings = { fromM: 12, toM: 900, sheets: 14, heightM: 0.36, thickness: 0.03, lit: [0.34, 0.32, 0.27], shade: [0.6, 0.7, 0.8], forward: 0.5, drift: [0.04, 0.015], bankM: 40, broken: 0.45 }

const SKY_GAIN = 0.9
const STAR_GAIN = 4

export const stage: WorldStageMaker = (def) => {
  const sky = new NightSky({ gain: SKY_GAIN, stars: STAR_GAIN, glow: def.sky.glow, glowPower: def.sky.glowPower, zenith: def.sky.zenith, horizon: def.sky.horizon })
  const far = makeFarLayers(golden.sun.azimuthDeg)
  const mist = makeMist('night', MIST)
  let open = 0
  let close = 0
  return {
    objects: [...far.meshes, ...mist.meshes],
    load: (assets) => sky.load(assets),
    prepare(frame) {
      open = frame.time
      close = frame.timeClose
    },
    sample(_camera, shutter) {
      const time = open + (close - open) * shutter
      sky.sample(time)
      mist.sample(time)
    },
    sky(renderer, target, camera, pixelX, pixelY, width, height) {
      sky.render(renderer, target, camera, pixelX, pixelY, width, height)
    },
  }
}
