import * as THREE from 'three'
import { eyeOf, poseOf, project } from '../../../src/director/pose.ts'
import { carrierAt, focusAt } from '../../../src/plant/model.ts'
import { tauAt } from '../../../src/v2/clock.ts'
import { plantInputsOf } from '../../../src/v2/inputs.ts'
import { blankMoment, momentAt, shutterSeconds } from '../../../src/v2/now.ts'
import { rigAtFilm } from '../../../src/v2/rig.ts'
import { secondsOf } from './film.ts'

const moment = blankMoment()
const eye = new THREE.Vector3()
const tip = new THREE.Vector3()
const carrier = new THREE.Vector3()
const far = new THREE.Vector3()

// Where the film's camera puts the moon in a frame, as fractions from the left and the top, at the middle of the open shutter. Worked out as the film works out its camera, with nothing drawn.
export function moonPlace(frame: number, aspect: number): { x: number; y: number; ahead: boolean } {
  const seconds = secondsOf(frame) + 0.5 * shutterSeconds
  const m = momentAt(seconds, moment)
  const rig = rigAtFilm(seconds)
  const inputs = plantInputsOf(m)
  const tau = tauAt(seconds)
  focusAt(tau, inputs, eyeOf(rig, eye), tip)
  const pose = poseOf(rig, tip, carrierAt(tau, inputs, tip, carrier))
  far.copy(m.moon).multiplyScalar(1e6).add(pose.position)
  const at = project(pose, far, aspect)
  return { x: at.x, y: at.y, ahead: at.depthM > 0 }
}
