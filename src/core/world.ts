import * as THREE from 'three'
import { shared } from './shading.ts'

export type RGB = [number, number, number]

export interface WorldSettings {
  standIn: boolean
  sun: { azimuthDeg: number; elevationDeg: number; color: RGB; softnessDeg: number; lean: number; lift: number }
  sky: { zenith: RGB; horizon: RGB; bounce: RGB; ambient: number; glow: RGB; glowPower: number; disc: number }
  // The backdrop is placed where the camera of `key` sees it. `sunAt` is where the sun sits in that picture (x from the left, y from the top) and sets the direction of the light.
  backdrop: { file: string | null; key: string; sunAt: [number, number] | null; gain: number; blur: number }
  fog: { color: RGB; sunTint: RGB; density: number; falloff: number }
  grade: { exposure: number; contrast: number; white: number; saturation: number; gain: RGB; lift: RGB; bloom: number; bloomKnee: number; vignette: number; grain: number }
  ground: { wet: number; frost: number; dew: number }
}

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
  shared.uFogColor.value.fromArray(def.fog.color)
  shared.uFogSunTint.value.fromArray(def.fog.sunTint)
  shared.uFogDensity.value = def.fog.density
  shared.uFogFalloff.value = def.fog.falloff
}
