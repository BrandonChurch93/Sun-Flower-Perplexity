import type { WorldSettings } from '../../core/world.ts'

export const world: WorldSettings = {
  standIn: true,
  sun: { azimuthDeg: 236, elevationDeg: 8, color: [8.5, 5.0, 2.0], softnessDeg: 1.2, lean: 0.8, lift: 1 },
  sky: { zenith: [0.2, 0.24, 0.34], horizon: [1.5, 0.95, 0.42], bounce: [0.09, 0.06, 0.03], ambient: 0.8, glow: [10, 5.5, 1.8], glowPower: 40, disc: 70 },
  backdrop: { file: 'backdrop.jpg', azimuthDeg: 200, elevationDeg: 0, spanDeg: 70, aspect: 1.7778, gain: 1.5 },
  fog: { color: [0.95, 0.62, 0.3], sunTint: [1.8, 0.9, 0.25], density: 0.006, falloff: 0.5 },
  grade: { exposure: 0.74, contrast: 1.3, white: 9, saturation: 1.06, gain: [1.04, 1, 0.94], lift: [0.002, 0.001, 0.004], bloom: 0.13, bloomKnee: 1.1, vignette: 0.3, grain: 0.012 },
  ground: { wet: 0, frost: 0, dew: 0 },
}
