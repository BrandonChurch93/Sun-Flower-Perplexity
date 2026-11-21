import * as THREE from 'three'
import { config } from '../config.ts'
import { clamp } from '../core/curves.ts'
import type { CameraPose } from '../core/lens.ts'
import type { RigPath } from './rig.ts'

export interface Rig extends RigPath { fNumber: number }
export interface Orbit { azimuthDeg: number; elevationDeg: number; dolly: number }

const UP = new THREE.Vector3(0, 1, 0)
const RAD = Math.PI / 180

export function nearPlane(rig: RigPath): number {
  return 0.003 + 0.02 * rig.distanceM
}

export const farPlane = 6000

// Turns the camera about the point it aims at: sideways, up or down, nearer or farther. The framing rule stays the same.
export function orbited<T extends RigPath>(rig: T, orbit: Orbit): T {
  const rise = rig.heightM - rig.aimHeightM
  const reach = Math.hypot(rig.distanceM, rise) * clamp(orbit.dolly, 0.25, 6)
  const angle = clamp(Math.atan2(rise, rig.distanceM) + orbit.elevationDeg * RAD, -80 * RAD, 85 * RAD)
  const heightM = Math.max(0.004, rig.aimHeightM + reach * Math.sin(angle))
  return { ...rig, distanceM: Math.max(0.01, reach * Math.cos(angle)), heightM, azimuthRad: rig.azimuthRad + orbit.azimuthDeg * RAD }
}

export function poseOf(r: Rig, focusPoint: THREE.Vector3): CameraPose {
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

// Where a point lands in the frame: x from the left, y from the top, as fractions, and its depth along the lens axis.
export function project(pose: CameraPose, point: THREE.Vector3, aspect: number): { x: number; y: number; depthM: number } {
  const v = point.clone().sub(pose.position)
  const depthM = v.dot(pose.forward)
  const scale = pose.focalMm / config.camera.gateWidthMm
  return { x: 0.5 + (v.dot(pose.right) / depthM) * scale, y: 0.5 - (v.dot(pose.up) / depthM) * scale * aspect, depthM }
}

// The height in the frame, from the top, of the horizon straight ahead of the lens.
export function horizonY(pose: CameraPose, aspect: number): number {
  const flat = Math.hypot(pose.forward.x, pose.forward.z)
  return 0.5 + (pose.forward.y / flat) * (pose.focalMm / config.camera.gateWidthMm) * aspect
}

export function cameraNumbers(pose: CameraPose): number[] {
  return [pose.position.x, pose.position.y, pose.position.z, pose.forward.x, pose.forward.y, pose.forward.z, pose.focalMm, pose.focusM, pose.fNumber]
}
