import type { WorldSettings } from '../../core/world.ts'

export const world: WorldSettings = {
  standIn: true,
  sun: { azimuthDeg: 118, elevationDeg: 7, color: [7.5, 4.6, 2.2], softnessDeg: 1.2, lean: 1, lift: 1 },
  sky: { zenith: [0.2, 0.34, 0.62], horizon: [1.3, 0.92, 0.5], bounce: [0.07, 0.05, 0.035], ambient: 0.75, glow: [9, 5.2, 2], glowPower: 60, disc: 60 },
  backdrop: { file: 'backdrop.jpg', azimuthDeg: 180, elevationDeg: 4, spanDeg: 46, aspect: 1.7778, gain: 1.6 },
  fog: { color: [0.75, 0.62, 0.48], sunTint: [1.6, 0.9, 0.3], density: 0.012, falloff: 1.4 },
  grade: { exposure: 0.78, contrast: 1.28, white: 9, saturation: 1.04, gain: [1.03, 1, 0.96], lift: [0, 0, 0.004], bloom: 0.11, bloomKnee: 1.1, vignette: 0.3, grain: 0.012 },
  ground: { wet: 0.25, frost: 0, dew: 1 },
}
