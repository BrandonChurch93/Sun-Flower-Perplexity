import * as THREE from 'three'
import { config } from '../config.ts'
import { lerp, smootherstep } from '../core/curves.ts'
import type { CameraPose } from '../core/lens.ts'
import { companionPlace, companionVariant, right, toward } from '../field/layout.ts'
import { bodyRadius, leafCount, leafDroop, leafLength, rayLength, stemRadius, usePlant, type PlantInputs } from '../plant/growth.ts'
import { leafFrameAt, poseAt, stemAt } from '../plant/skeleton.ts'

const full = config.field.companion.heightRatio
// The companion is the smaller of the two until the storm has passed: when the lens stands back to take in the storm, the plant is the tallest thing in its frame.
// It outgrows the plant before the bloom, where its upper leaf reaches into the frame.
const YOUNG = { ratio: 0.86, until: 29, grown: 42 }

export function companionRatio(tau: number): number {
  return lerp(YOUNG.ratio, full, smootherstep(YOUNG.until, YOUNG.grown, tau))
}

// How the companion leans from upright, as a slope: meters sideways for each meter of height, to the right and toward the camera
// that stands at `field.companion.fromAzimuthDeg`. It leans 3 degrees toward the plant: its foot stays wide of every frame
// before the bloom, its upper leaves reach the left edge of the two bloom frames, and its head stays out of both.
const LEAN = { right: 0.055, toward: -0.021 }
export const COMPANION_LEAN = { x: right.x * LEAN.right + toward.x * LEAN.toward, z: right.z * LEAN.right + toward.z * LEAN.toward }

// How the companion stands: its size, its lean and its place. Its top stays at the plant's height times `ratio`, which is `field.companion.heightRatio` once it is grown.
export function companionMatrix(out: THREE.Matrix4 = new THREE.Matrix4(), place: { x: number; z: number } = companionPlace(), ratio: number = full): THREE.Matrix4 {
  const slope = Math.hypot(COMPANION_LEAN.x, COMPANION_LEAN.z)
  out.identity()
  if (slope > 0) {
    // Turned about a level line through its foot, at a right angle to the way it leans.
    const axis = new THREE.Vector3(COMPANION_LEAN.z / slope, 0, -COMPANION_LEAN.x / slope)
    out.makeRotationAxis(axis, Math.atan(slope))
  }
  const size = ratio * Math.hypot(1, slope)
  out.scale(new THREE.Vector3(size, size, size))
  return out.setPosition(place.x, 0, place.z)
}

const matrix = new THREE.Matrix4()
const point = new THREE.Vector3()
const STEM_STEPS = 10
const LEAF_STEPS = [0.3, 0.65, 1]

// Whether any part of the companion could be in the frame. It errs on the side of yes: every piece is taken as a ball that holds it with room to spare.
// tanX and tanY are half the frame's width and height at one meter. near is the nearest depth the lens draws.
export function companionInView(time: number, inputs: PlantInputs, pose: CameraPose, tanX: number, tanY: number, near: number, ratio: number = full): boolean {
  companionMatrix(matrix, companionPlace(), ratio)
  const size = matrix.getMaxScaleOnAxis()
  const slackX = Math.hypot(1, tanX)
  const slackY = Math.hypot(1, tanY)
  const inside = (x: number, y: number, z: number, radius: number): boolean => {
    point.set(x, y, z).applyMatrix4(matrix).sub(pose.position)
    const r = radius * size + 0.012
    const depth = point.dot(pose.forward)
    if (depth < near - r) return false
    if (Math.abs(point.dot(pose.right)) - depth * tanX > r * slackX) return false
    return Math.abs(point.dot(pose.up)) - depth * tanY <= r * slackY
  }
  usePlant(companionVariant, companionPlace())
  let seen = false
  const p = poseAt(time, inputs)
  for (let a = 0; a <= STEM_STEPS && !seen; a++) {
    const u = a / STEM_STEPS
    const n = stemAt(p, u)
    seen = inside(n.x, n.y, n.z, stemRadius(time, u) + 0.035)
  }
  const h = p.head
  const head = Math.max(h.radius, bodyRadius(time)) + rayLength(0, time) * 1.1 + 0.09
  if (!seen && h.radius > 0) seen = inside(h.cx, h.cy, h.cz, head)
  for (let i = 0; i < leafCount && !seen; i++) {
    const length = leafLength(i, time)
    if (length <= 0) continue
    const f = leafFrameAt(p, i)
    const reach = length * 1.25
    const sag = leafDroop(i, inputs, time) * reach
    for (const s of LEAF_STEPS) {
      if (inside(f.ox + f.mx * reach * s - f.nx * sag * s * s, f.oy + f.my * reach * s - f.ny * sag * s * s, f.oz + f.mz * reach * s - f.nz * sag * s * s, 0.55 * length)) {
        seen = true
        break
      }
    }
  }
  usePlant(0)
  return seen
}
