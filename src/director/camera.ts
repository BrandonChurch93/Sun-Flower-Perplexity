import * as THREE from 'three'
import { config, type CameraKey } from '../config.ts'
import { Monotone, clamp } from '../core/curves.ts'
import type { CameraPose } from '../core/lens.ts'
import { fNumberPoints } from './registry.ts'

const keys = config.camera.keys
const track = (pick: (k: CameraKey) => number): Monotone => new Monotone(keys.map((k) => [k.time, pick(k)] as const))

const distance = track((k) => k.distanceM)
const height = track((k) => k.heightM)
const aim = track((k) => k.aimHeightM)
const frameX = track((k) => k.frameX)
const azimuth = track((k) => k.azimuthDeg)
const focal = track((k) => k.focalMm)

const stops = fNumberPoints()
const fNumber = stops.length >= 2 ? new Monotone(stops) : null

export interface Rig { distanceM: number; heightM: number; aimHeightM: number; frameX: number; azimuthRad: number; focalMm: number; fNumber: number }

export function rigAt(time: number): Rig {
  return {
    distanceM: distance.at(time),
    heightM: height.at(time),
    aimHeightM: aim.at(time),
    frameX: frameX.at(time),
    azimuthRad: (azimuth.at(time) * Math.PI) / 180,
    focalMm: focal.at(time),
    fNumber: fNumber ? fNumber.at(time) : (stops[0]?.[1] ?? 4),
  }
}

export function nearPlane(rig: Rig): number {
  return 0.003 + 0.02 * rig.distanceM
}

export const farPlane = 6000

const UP = new THREE.Vector3(0, 1, 0)

export function poseAt(time: number, focusPoint: THREE.Vector3): CameraPose {
  const r = rigAt(time)
  const sa = Math.sin(r.azimuthRad)
  const ca = Math.cos(r.azimuthRad)
  const d = r.distanceM
  const position = new THREE.Vector3(d * sa, r.heightM, d * ca)
  const toPlant = new THREE.Vector3(-sa, 0, -ca)
  const side = new THREE.Vector3(ca, 0, -sa)
  const t = ((r.frameX - 0.5) * config.camera.gateWidthMm) / r.focalMm
  const rise = r.aimHeightM - r.heightM
  const pan = Math.asin(clamp(t * Math.sqrt((d * d + rise * rise) / (d * d * (1 + t * t))), -1, 1))
  const level = toPlant.clone().multiplyScalar(Math.cos(pan)).addScaledVector(side, -Math.sin(pan))
  const right = side.clone().multiplyScalar(Math.cos(pan)).addScaledVector(toPlant, Math.sin(pan))
  const pitch = Math.atan2(rise, d * Math.cos(pan))
  const forward = level.clone().multiplyScalar(Math.cos(pitch)).addScaledVector(UP, Math.sin(pitch))
  const up = UP.clone().multiplyScalar(Math.cos(pitch)).addScaledVector(level, -Math.sin(pitch))
  const focusM = Math.max(0.02, focusPoint.clone().sub(position).dot(forward))
  return { position, forward, right, up, focalMm: r.focalMm, focusM, fNumber: r.fNumber }
}

export function cameraNumbers(pose: CameraPose): number[] {
  return [pose.position.x, pose.position.y, pose.position.z, pose.forward.x, pose.forward.y, pose.forward.z, pose.focalMm, pose.focusM, pose.fNumber]
}
