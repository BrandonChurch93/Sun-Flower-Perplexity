import * as THREE from 'three'
import { config } from '../../config.ts'
import { shared } from '../../core/shading.ts'
import type { WorldSettings, WorldStageMaker } from '../../core/world.ts'
import { makeStreaks } from '../../weather/rain/streaks.ts'
import { world as golden } from '../golden/index.ts'
import { makeFarLayers } from './layers.ts'
import { RainSky } from './sky.ts'

export const world: WorldSettings = {
  standIn: false,
  sun: { azimuthDeg: 180, elevationDeg: 62, color: [0.75, 0.82, 0.92], softnessDeg: 14, lean: 0.35, lift: 0.8 },
  sky: { zenith: [0.16, 0.19, 0.24], horizon: [0.7, 0.78, 0.86], bounce: [0.03, 0.035, 0.04], ambient: 1.25, glow: [0, 0, 0], glowPower: 8, disc: 0 },
  backdrop: { file: null, key: 'rain', sunAt: null, gain: 1.3, blur: 0.25 },
  fog: { color: [0.11, 0.2, 0.19], sunTint: [0, 0, 0], density: 0.04, falloff: 0.25 },
  grade: { exposure: 0.9, contrast: 1.3, white: 7, saturation: 0.82, gain: [0.95, 1, 1.06], lift: [0, 0.002, 0.006], bloom: 0.06, bloomKnee: 1.2, vignette: 0.34, grain: 0.014 },
  ground: { wet: 1, frost: 0, dew: 0 },
  wind: 0.3,
}

const SKY_GAIN = 1.24
const DROP_LIGHT: [number, number, number] = [0.95, 1.0, 1.05]
const DROP_SHADE: [number, number, number] = [0.25, 0.3, 0.34]
const AIR_TONE: [number, number, number] = [0.1, 0.16, 0.19]
const MIST: [number, number, number] = [0.07, 0.115, 0.13]

// One stroke of lightning inside the cloud, as two swells of glow that are gone within ten frames.
const FLASH_AT_S = 17.2

const FLASH_LIGHT = new THREE.Vector3(1.0, 1.15, 1.45)

export function flashAt(time: number): number {
  const t = time - FLASH_AT_S
  const swell = (from: number, rise: number, fall: number): number => (t < from ? 0 : (1 - Math.exp(-(t - from) / rise)) * Math.exp(-(t - from) / fall))
  return 2.6 * swell(0, 0.03, 0.05) + 1.8 * swell(0.11, 0.03, 0.06)
}

export const stage: WorldStageMaker = () => {
  const sky = new RainSky()
  const far = makeFarLayers(golden.sun.azimuthDeg, AIR_TONE, MIST)
  const streaks = makeStreaks(DROP_LIGHT, DROP_SHADE)
  let open = 0
  let close = 0
  return {
    objects: [...far.meshes, streaks.mesh],
    load: (assets) => sky.load(assets),
    prepare(frame) {
      open = frame.time
      close = frame.timeClose
      const flash = flashAt(0.5 * (frame.time + frame.timeClose))
      const tanX = config.camera.gateWidthMm / (2 * frame.pose.focalMm)
      sky.prepare(frame.time, SKY_GAIN, flash, frame.samples)
      far.flash(flash)
      far.setTime(frame.time)
      streaks.prepare(frame.time, frame.timeClose, frame.pose, tanX, (tanX * frame.height) / frame.width, frame.samples, frame.width, flash)
    },
    sample(_camera, shutter) {
      // The stroke lights the plant and the ground through the light of the sky they already read.
      const flash = flashAt(open + (close - open) * shutter)
      if (flash <= 0) return
      shared.uSkyZenith.value.multiply(FLASH_LIGHT.clone().multiplyScalar(flash).addScalar(1))
      shared.uSkyHorizon.value.multiply(FLASH_LIGHT.clone().multiplyScalar(flash).addScalar(1))
      shared.uGroundBounce.value.multiply(FLASH_LIGHT.clone().multiplyScalar(flash).addScalar(1))
    },
    sky(renderer, target, camera, _pixelX, _pixelY, across) {
      sky.render(renderer, target, camera, across)
    },
  }
}
