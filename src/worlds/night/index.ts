import type { WorldSettings } from '../../core/world.ts'

export const world: WorldSettings = {
  standIn: true,
  sun: { azimuthDeg: 242, elevationDeg: 28, color: [0.24, 0.34, 0.56], softnessDeg: 1.5, lean: 0.25, lift: 0 },
  sky: { zenith: [0.012, 0.022, 0.06], horizon: [0.03, 0.05, 0.1], bounce: [0.004, 0.006, 0.012], ambient: 1.6, glow: [0, 0, 0], glowPower: 8, disc: 0 },
  backdrop: { file: 'backdrop.jpg', key: 'night', sunAt: null, gain: 0.5, blur: 0.25 },
  fog: { color: [0.03, 0.05, 0.1], sunTint: [0.02, 0.03, 0.05], density: 0.02, falloff: 1.2 },
  grade: { exposure: 1.35, contrast: 1.22, white: 5, saturation: 0.95, gain: [0.94, 1, 1.12], lift: [0.002, 0.004, 0.012], bloom: 0.07, bloomKnee: 0.9, vignette: 0.36, grain: 0.016 },
  ground: { wet: 0.1, frost: 0, dew: 0.5 },
}
