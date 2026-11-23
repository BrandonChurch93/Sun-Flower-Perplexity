import type * as THREE from 'three'
import type { Assets } from '../core/assets.ts'
import type { CameraPose } from '../core/lens.ts'
import type { RGB } from '../core/world.ts'

// Every dial is 0 to 1 and a pure function of the film second.
export interface Dials {
  // How much of the sky the clouds take. 0.1 is a fair day, 1 a closed deck.
  cover: number
  // How heavy and dark that deck is. 0 fair weather cloud, 1 a storm.
  overcast: number
  // The share of the direct sun that reaches the plant.
  sunThrough: number
  fog: number
  cold: number
  frost: number
  dew: number
  rain: number
  wet: number
  puddle: number
  flash: number
  // The sun breaking through the torn deck: shafts, a blaze round the gap, glints on the wet.
  burst: number
  wind: number
  // How fast the day runs. 0 is real time, 1 the fastest time lapse of the film.
  lapse: number
  evening: number
}

export type LightKind = 'sun' | 'moon'

export interface CloudDrift {
  // How far the cloud field has travelled, in kilometres at the cloud base.
  shiftX: number
  shiftZ: number
  // How far the cloud shapes have changed. One unit is one whole change of shape.
  evolve: number
  // The speed of that travel in kilometres a second, for the streak a frame's exposure smears.
  speedX: number
  speedZ: number
}

// One instant of the film. `now` is the open shutter and `later` its close.
export interface Moment {
  frame: number
  // Film seconds, and real seconds: rain, wind, ripples and glints run on this.
  t: number
  // Where the music is: 1 at the downbeat of bar 1, 2.5 on beat 3 of bar 2.
  bar: number
  // The plant's own clock, 0 to config.growth.seconds. It stands still in a hold.
  tau: number
  // The world clock in days. The whole part is the day, the fraction its phase, 0 at sunrise.
  world: number
  day: number
  phase: number
  // Unit vectors toward the sun and the moon, below the horizon too.
  sun: THREE.Vector3
  moon: THREE.Vector3
  sunElevationDeg: number
  sunAzimuthDeg: number
  // The one directional light of the scene: the sun by day, the moon in the dark, nothing in between.
  light: THREE.Vector3
  lightKind: LightKind
  // 0 by day, 1 with the sun 12 degrees under the horizon.
  night: number
  // How far the stars have turned about the pole, in radians.
  starTurn: number
  cloud: CloudDrift
  // Where the lightning sits in the sky.
  flashAt: THREE.Vector3
  dials: Dials
}

export type Quality = 'film' | 'high' | 'low'

// What the sky says about the light it gives, in the scene's linear units. Read from tables made at load: no reading back from the graphics card.
export interface SkyLight {
  // The direct sun or moon at the ground, before `sunThrough`.
  direct: RGB
  zenith: RGB
  // The sky just above the horizon, away from the sun and toward it.
  horizon: RGB
  horizonSun: RGB
}

export interface View {
  // The camera at the open shutter.
  pose: CameraPose
  width: number
  height: number
  quality: Quality
  // Samples that will be drawn for this frame.
  samples: number
  // What the sky says about its light at the open shutter.
  light: SkyLight
}

export interface Sky {
  // Makes every table, texture, target and program. Nothing is made after this returns.
  load(renderer: THREE.WebGLRenderer, assets: Assets): Promise<void>
  // Draws once with every program and target so the first film frame costs what the others cost.
  warm(renderer: THREE.WebGLRenderer): void
  // Once a frame, before its first sample: the work that does not depend on the sample.
  prepare(renderer: THREE.WebGLRenderer, now: Moment, later: Moment, view: View): void
  // Once a sample, behind everything. Writes the colour and, in alpha, the blur circle in pixels.
  render(renderer: THREE.WebGLRenderer, target: THREE.WebGLRenderTarget, camera: THREE.PerspectiveCamera, pixelX: number, pixelY: number, width: number, height: number): void
  light(moment: Moment, out: SkyLight): SkyLight
  // Where the sun's disc is drawn when the air lifts a low sun above where it stands. The lens puts its glow there; the light of the scene does not move.
  face?(now: Moment, later: Moment, out: THREE.Vector3): THREE.Vector3
  megabytes(): number
}

// A part of the place: far layers, rain, frost, mist. Always in the scene, driven by the dials.
export interface Part {
  readonly objects: THREE.Object3D[]
  load?(renderer: THREE.WebGLRenderer, assets: Assets): Promise<void>
  warm?(renderer: THREE.WebGLRenderer): void
  // Once a frame. Sets `visible` on its objects and its uniforms from `now` and `later`.
  prepare(now: Moment, later: Moment, view: View): void
  // Once a sample, after the camera is placed for it.
  sample?(camera: THREE.PerspectiveCamera, shutter: number): void
}
