import { timeOf } from '../config.ts'
import type { CameraPose } from '../core/lens.ts'
import { plantNumbers, tipAt } from '../plant/model.ts'
import { poseAt } from './camera.ts'
import { cameraNumbers } from './pose.ts'
import { plantInputsAt } from './inputs.ts'
import { clampFrame, worldAt } from './timeline.ts'
import * as THREE from 'three'

export interface FrameState { camera: number[]; plant: number[]; world: string }

export function poseAtTime(time: number, tip = new THREE.Vector3()): CameraPose {
  tipAt(time, plantInputsAt(time), tip)
  return poseAt(time, tip)
}

export function stateAt(frameIndex: number): FrameState {
  const frame = clampFrame(frameIndex)
  const time = timeOf(frame)
  return { camera: cameraNumbers(poseAtTime(time)), plant: plantNumbers(time, plantInputsAt(time)), world: worldAt(frame) }
}
