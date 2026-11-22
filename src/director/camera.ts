import type * as THREE from 'three'
import { Monotone } from '../core/curves.ts'
import type { CameraPose } from '../core/lens.ts'
import { poseOf, type Rig } from './pose.ts'
import { fNumberPoints, heldSharePoints } from './registry.ts'
import { rigPathAt } from './rig.ts'

export { cameraNumbers, farPlane, nearPlane, type Rig } from './pose.ts'

const stops = fNumberPoints()
const fNumber = stops.length >= 2 ? new Monotone(stops) : null
const shares = heldSharePoints()
const heldShare = shares.length >= 2 ? new Monotone(shares, [[shares[0][0], 0], [shares[shares.length - 1][0], 0]]) : null

export function rigAt(time: number): Rig {
  const rig: Rig = { ...rigPathAt(time), fNumber: fNumber ? fNumber.at(time) : (stops[0]?.[1] ?? 4) }
  if (heldShare) rig.heldShare = heldShare.at(time)
  return rig
}

export function poseAt(time: number, focusPoint: THREE.Vector3): CameraPose {
  return poseOf(rigAt(time), focusPoint)
}
