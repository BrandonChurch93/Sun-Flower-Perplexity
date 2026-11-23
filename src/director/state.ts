import { timeOf } from '../config.ts'
import { tauAt } from '../v2/clock.ts'
import type { CameraPose } from '../core/lens.ts'
import { carrierAt, focusAt, plantNumbers } from '../plant/model.ts'
import { rigAt } from './camera.ts'
import { cameraNumbers, eyeOf, poseOf } from './pose.ts'
import { plantInputsAt } from './inputs.ts'
import { clampFrame, worldAt } from './timeline.ts'
import * as THREE from 'three'

export interface FrameState { camera: number[]; plant: number[]; world: string }

const eye = new THREE.Vector3()
const carrier = new THREE.Vector3()

// The camera at one moment. `held` receives the point the lens holds.
export function poseAtTime(time: number, held = new THREE.Vector3()): CameraPose {
  const rig = rigAt(time)
  const inputs = plantInputsAt(time)
  focusAt(time, inputs, eyeOf(rig, eye), held)
  return poseOf(rig, held, carrierAt(time, inputs, held, carrier))
}

export function stateAt(frameIndex: number): FrameState {
  const frame = clampFrame(frameIndex)
  const time = tauAt(timeOf(frame))
  return { camera: cameraNumbers(poseAtTime(time)), plant: plantNumbers(time, plantInputsAt(time)), world: worldAt(frame) }
}
