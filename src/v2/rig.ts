import * as THREE from 'three'
import type { CameraPose } from '../core/lens.ts'
import { rigAt, type Rig } from '../director/camera.ts'
import { tauAt } from './clock.ts'
import type { FixedView } from './shots.ts'

const RAD = Math.PI / 180

// The camera of the film at one film second.
export function rigAtFilm(seconds: number): Rig {
  return rigAt(tauAt(seconds))
}

export function fixedPose(v: FixedView): CameraPose {
  const az = v.azimuthDeg * RAD
  const heading = v.headingDeg * RAD
  const pitch = v.pitchDeg * RAD
  const level = new THREE.Vector3(Math.sin(heading), 0, Math.cos(heading))
  const right = new THREE.Vector3(-Math.cos(heading), 0, Math.sin(heading))
  const forward = level.clone().multiplyScalar(Math.cos(pitch)).setY(Math.sin(pitch))
  const up = new THREE.Vector3().crossVectors(right, forward).normalize()
  return { position: new THREE.Vector3(v.distanceM * Math.sin(az), v.heightM, v.distanceM * Math.cos(az)), forward, right, up, focalMm: v.focalMm, focusM: v.focusM, fNumber: v.fNumber }
}
