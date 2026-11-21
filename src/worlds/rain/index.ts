import type { WorldSettings } from '../../core/world.ts'

export const world: WorldSettings = {
  standIn: true,
  sun: { azimuthDeg: 180, elevationDeg: 62, color: [0.75, 0.82, 0.92], softnessDeg: 14, lean: 0.35, lift: 0.8 },
  sky: { zenith: [0.16, 0.19, 0.24], horizon: [0.7, 0.78, 0.86], bounce: [0.03, 0.035, 0.04], ambient: 1.25, glow: [0, 0, 0], glowPower: 8, disc: 0 },
  backdrop: { file: 'backdrop.jpg', key: 'rain', sunAt: null, gain: 1.3, blur: 0.25 },
  fog: { color: [0.36, 0.41, 0.46], sunTint: [0, 0, 0], density: 0.035, falloff: 0.25 },
  grade: { exposure: 0.9, contrast: 1.3, white: 7, saturation: 0.82, gain: [0.95, 1, 1.06], lift: [0, 0.002, 0.006], bloom: 0.06, bloomKnee: 1.2, vignette: 0.34, grain: 0.014 },
  ground: { wet: 1, frost: 0, dew: 0 },
}
