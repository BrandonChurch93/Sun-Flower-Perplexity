import * as THREE from 'three'

export interface CameraPose {
  position: THREE.Vector3
  forward: THREE.Vector3
  right: THREE.Vector3
  up: THREE.Vector3
  focalMm: number
  focusM: number
  fNumber: number
  // Where set, everything from this depth to `focusM` is sharp, as in a macro picture put together from several focus distances. The blur grows from those two ends.
  focusNearM?: number
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

// The blur circle in pixels of a thing at `depthM`, for a lens sharp from `focusNearM` to `focusM`. The same rule as `cocOf` in the shaders.
export function blurPx(cocScale: number, focusM: number, focusNearM: number, depthM: number): number {
  const inv = 1 / depthM
  return cocScale * Math.max(1 / focusM - inv, inv - 1 / focusNearM, 0)
}

export function cocPixels(pose: CameraPose, gateMm: number, width: number, depthM: number): number {
  return blurPx(cocScalePx(pose, gateMm, width), pose.focusM, pose.focusNearM ?? pose.focusM, depthM)
}

// Whether the pose is sharp over a range of depths. Such a picture cannot be made by moving the eye over the lens opening, so the lens pass blurs it at every tier.
export function ranged(pose: CameraPose): boolean {
  return pose.focusNearM !== undefined && pose.focusNearM < pose.focusM
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
