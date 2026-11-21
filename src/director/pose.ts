import * as THREE from 'three'
import { config } from '../config.ts'
import { clamp } from '../core/curves.ts'
import { cocScalePx, type CameraPose } from '../core/lens.ts'
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

// Where the lens is. It depends on the rig alone, so the point the lens holds can be worked out from it.
export function eyeOf(r: RigPath, out: THREE.Vector3): THREE.Vector3 {
  return out.set(r.distanceM * Math.sin(r.azimuthRad), r.heightM, r.distanceM * Math.cos(r.azimuthRad))
}

// How much of the sharp zone's blur limit the held point may take when the focus is shared with the stem behind it.
const HELD_SHARE = 0.55

// `focusPoint` is the point the lens holds. With a `carrier`, the stem that carries the head, the focus lies between the two, so both are inside the sharp zone:
// the blur is shared evenly, and the held point never takes more than `HELD_SHARE` of the limit, counted at the master's width.
export function poseOf(r: Rig, focusPoint: THREE.Vector3, carrier: THREE.Vector3 | null = null): CameraPose {
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
  const heldM = Math.max(0.02, focusPoint.clone().sub(position).dot(forward))
  const pose = { position, forward, right, up, focalMm: r.focalMm, focusM: heldM, fNumber: r.fNumber }
  if (!carrier) return pose
  const behind = 1 / heldM - 1 / Math.max(heldM, carrier.clone().sub(position).dot(forward))
  const most = (HELD_SHARE * config.detail.focusCocPx) / cocScalePx(pose, config.camera.gateWidthMm, config.formats.master.width)
  pose.focusM = 1 / (1 / heldM - Math.min(0.5 * behind, most))
  return pose
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
