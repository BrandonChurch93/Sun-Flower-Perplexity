import type * as THREE from 'three'
import { Monotone } from '../core/curves.ts'
import type { CameraPose } from '../core/lens.ts'
import { poseOf, type Rig } from './pose.ts'
import { fNumberPoints } from './registry.ts'
import { rigPathAt } from './rig.ts'

export { cameraNumbers, farPlane, nearPlane, type Rig } from './pose.ts'

const stops = fNumberPoints()
const fNumber = stops.length >= 2 ? new Monotone(stops) : null

export function rigAt(time: number): Rig {
  return { ...rigPathAt(time), fNumber: fNumber ? fNumber.at(time) : (stops[0]?.[1] ?? 4) }
}

export function poseAt(time: number, focusPoint: THREE.Vector3): CameraPose {
  return poseOf(rigAt(time), focusPoint)
}
