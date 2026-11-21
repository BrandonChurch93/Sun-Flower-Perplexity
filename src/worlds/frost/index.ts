import type { WorldSettings } from '../../core/world.ts'

export const world: WorldSettings = {
  standIn: true,
  sun: { azimuthDeg: 128, elevationDeg: 9, color: [1.5, 1.35, 1.2], softnessDeg: 6, lean: 0.4, lift: 0.45 },
  sky: { zenith: [0.72, 0.76, 0.8], horizon: [0.95, 0.94, 0.92], bounce: [0.2, 0.21, 0.22], ambient: 1.0, glow: [2.6, 2.2, 1.8], glowPower: 22, disc: 6 },
  backdrop: { file: 'backdrop.jpg', azimuthDeg: 192, elevationDeg: 0, spanDeg: 66, aspect: 1.7778, gain: 1.2 },
  fog: { color: [0.82, 0.84, 0.86], sunTint: [0.5, 0.4, 0.3], density: 0.16, falloff: 0.12 },
  grade: { exposure: 0.8, contrast: 1.16, white: 6, saturation: 0.7, gain: [1, 1, 1.02], lift: [0.006, 0.007, 0.009], bloom: 0.1, bloomKnee: 1.0, vignette: 0.28, grain: 0.013 },
  ground: { wet: 0, frost: 1, dew: 0 },
}
