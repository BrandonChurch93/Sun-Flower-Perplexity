import type * as THREE from 'three'
import { cocScalePx, type CameraPose } from '../core/lens.ts'

// Where the main light sits in the picture: x from the left and y from the bottom as shares of the frame (it may lie outside it), and how much it counts, 0 when it is behind the camera or far off frame. With it comes the blur circle of things at infinity, in pixels, which is what the sky carries.
export interface SunInFrame { x: number; y: number; weight: number; farCircle: number }

export function sunInFrame(pose: CameraPose, toSun: THREE.Vector3, gateMm: number, width: number, height: number): SunInFrame {
  const aspect = width / height
  const farCircle = Math.min(cocScalePx(pose, gateMm, width) / pose.focusM, 2048)
  const depth = toSun.dot(pose.forward)
  if (depth < 0.05) return { x: 0.5, y: 0.5, weight: 0, farCircle }
  const scale = pose.focalMm / gateMm
  const x = 0.5 + (toSun.dot(pose.right) / depth) * scale
  const y = 0.5 + (toSun.dot(pose.up) / depth) * scale * aspect
  const off = Math.hypot((x - 0.5) * aspect, y - 0.5) / Math.hypot(0.5 * aspect, 0.5)
  const t = Math.min(1, Math.max(0, (2.2 - off) / 1.0))
  return { x, y, weight: t * t * (3 - 2 * t), farCircle }
}
