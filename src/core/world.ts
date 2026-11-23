import * as THREE from 'three'
import type { Assets } from './assets.ts'
import type { CameraPose } from './lens.ts'
import { shared } from './shading.ts'

export type RGB = [number, number, number]

export interface WorldSettings {
  standIn: boolean
  sun: { azimuthDeg: number; elevationDeg: number; color: RGB; softnessDeg: number; lean: number; lift: number }
  // `even` is how far thick air evens the sky's light on the plant, 0 to 1. Left out, it follows the fog's density as it did.
  sky: { zenith: RGB; horizon: RGB; bounce: RGB; ambient: number; glow: RGB; glowPower: number; disc: number; even?: number }
  // The sky's own light, for what floats in the air. Left out, the air is lit as the surfaces are.
  air?: { sun: RGB; zenith: RGB; horizon: RGB }
  // The backdrop is placed where the camera of `key` sees it. `sunAt` is where the sun sits in that picture (x from the left, y from the top) and sets the direction of the light.
  backdrop: { file: string | null; key: string; sunAt: [number, number] | null; gain: number; blur: number }
  fog: { color: RGB; sunTint: RGB; density: number; falloff: number }
  grade: { exposure: number; contrast: number; white: number; saturation: number; gain: RGB; lift: RGB; bloom: number; bloomKnee: number; vignette: number; grain: number }
  // `plantWet` is how wet the plants are where that differs from the ground. Left out, they are as wet as the ground.
  ground: { wet: number; frost: number; dew: number; plantWet?: number }
  // How hard the wind blows on the plants, 0 to 1.
  wind: number
}

// What a world's own code is told about the frame it is about to draw.
export interface WorldFrame {
  frame: number
  // The time at the open shutter and at its close, in seconds of the film.
  time: number
  timeClose: number
  // The camera at the open shutter.
  pose: CameraPose
  width: number
  height: number
  samples: number
}

// What a world adds to the picture beyond its settings: its own sky, its far layers, its air and its weather.
export interface WorldStage {
  // Drawn with the scene, in this world's frames only.
  readonly objects: THREE.Object3D[]
  load?(assets: Assets): Promise<void>
  // Once a frame, before its first sample.
  prepare(frame: WorldFrame): void
  // Once a sample, after the camera is placed for it.
  sample?(camera: THREE.PerspectiveCamera, shutter: number): void
  // Draws this world's sky behind everything, in place of the shared one.
  sky?(renderer: THREE.WebGLRenderer, target: THREE.WebGLRenderTarget, camera: THREE.PerspectiveCamera, pixelX: number, pixelY: number, width: number, height: number): void
}

export type WorldStageMaker = (def: WorldDef) => WorldStage

export interface BackdropLock { right: THREE.Vector3; up: THREE.Vector3; forward: THREE.Vector3; scaleX: number; scaleY: number }

export interface WorldDef extends WorldSettings { id: string; lock: BackdropLock | null }

const RAD = Math.PI / 180

export function sunDirection(def: WorldDef, out = new THREE.Vector3()): THREE.Vector3 {
  const az = def.sun.azimuthDeg * RAD
  const el = def.sun.elevationDeg * RAD
  return out.set(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el))
}

export function applyWorld(def: WorldDef): void {
  shared.uSunColor.value.fromArray(def.sun.color)
  shared.uSkyZenith.value.fromArray(def.sky.zenith).multiplyScalar(def.sky.ambient)
  shared.uSkyHorizon.value.fromArray(def.sky.horizon).multiplyScalar(def.sky.ambient)
  shared.uGroundBounce.value.fromArray(def.sky.bounce).multiplyScalar(def.sky.ambient)
  if (def.air) {
    shared.uAirSun.value.fromArray(def.air.sun)
    shared.uAirZenith.value.fromArray(def.air.zenith)
    shared.uAirHorizon.value.fromArray(def.air.horizon)
  } else {
    shared.uAirSun.value.copy(shared.uSunColor.value)
    shared.uAirZenith.value.copy(shared.uSkyZenith.value)
    shared.uAirHorizon.value.copy(shared.uSkyHorizon.value)
  }
  shared.uFogColor.value.fromArray(def.fog.color)
  shared.uFogSunTint.value.fromArray(def.fog.sunTint)
  shared.uFogDensity.value = def.fog.density
  shared.uFogFalloff.value = def.fog.falloff
  shared.uSkyEven.value = def.sky.even ?? Math.min(1, Math.max(0, 26 * def.fog.density - 0.15))
}
