import * as THREE from 'three'

export interface CameraPose {
  position: THREE.Vector3
  forward: THREE.Vector3
  right: THREE.Vector3
  up: THREE.Vector3
  focalMm: number
  focusM: number
  fNumber: number
}

export interface LensSetup {
  gateMm: number
  width: number
  height: number
  near: number
  far: number
  pixelX: number
  pixelY: number
  lensX: number
  lensY: number
}

export function apertureRadiusM(pose: CameraPose): number {
  return pose.focalMm / 1000 / (2 * pose.fNumber)
}

export function cocScalePx(pose: CameraPose, gateMm: number, width: number): number {
  return ((2 * apertureRadiusM(pose) * pose.focalMm) / gateMm) * width
}

export function cocPixels(pose: CameraPose, gateMm: number, width: number, depthM: number): number {
  return cocScalePx(pose, gateMm, width) * Math.abs(1 / depthM - 1 / pose.focusM)
}

const basis = new THREE.Matrix4()
const back = new THREE.Vector3()

export function applyLens(camera: THREE.PerspectiveCamera, pose: CameraPose, s: LensSetup): void {
  const a = apertureRadiusM(pose)
  const lx = s.lensX * a
  const ly = s.lensY * a
  const eye = camera.position.copy(pose.position).addScaledVector(pose.right, lx).addScaledVector(pose.up, ly)
  back.copy(pose.forward).negate()
  basis.makeBasis(pose.right, pose.up, back)
  camera.quaternion.setFromRotationMatrix(basis)
  camera.matrixAutoUpdate = false
  camera.matrix.compose(eye, camera.quaternion, camera.scale)
  camera.matrixWorld.copy(camera.matrix)
  camera.matrixWorldInverse.copy(camera.matrixWorld).invert()
  const halfW = (s.near * (s.gateMm / 2)) / pose.focalMm
  const halfH = (halfW * s.height) / s.width
  const shiftX = (-lx * s.near) / pose.focusM + (s.pixelX * 2 * halfW) / s.width
  const shiftY = (-ly * s.near) / pose.focusM + (s.pixelY * 2 * halfH) / s.height
  camera.projectionMatrix.makePerspective(-halfW + shiftX, halfW + shiftX, halfH + shiftY, -halfH + shiftY, s.near, s.far)
  camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert()
  camera.near = s.near
  camera.far = s.far
}
