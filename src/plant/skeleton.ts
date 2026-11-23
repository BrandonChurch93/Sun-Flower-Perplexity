// The pose of the plant, as every part reads it. All of it follows the timing in `growth.ts`, so a part that starts from these frames stands where the film expects it.
// The stem, the head and the frames are kept in one place each and written over by the next call. Read what you need before you ask again.
import type { PlantInputs } from './growth.ts'
import { FLOOR_DOME, FLOOR_RIM, bractFrame, layHead, layStem, leafFrame, rayFrame, seedLeafFrame, stemLength, stemNode, type Frame, type Head, type Node } from './standin.ts'
import { norm } from './norm.ts'

export { blade, ellipsoid, gridNormals, roll, setFrame, FLOOR_DOME, FLOOR_RIM, NECK_FLARE, SEAT, type Frame, type Head, type Node, type Outline } from './standin.ts'

export interface Pose {
  time: number
  inputs: PlantInputs
  // The length of the stem along its curve, in meters.
  length: number
  // The middle of the head, its axis a (out of the face), two directions p and q across it, its radius and its half depth.
  head: Head
}

const pose: Pose = { time: 0, inputs: { leanX: 0, leanZ: 0, lift: 1, wind: 0 }, length: 0, head: layHead(0, 0) }

// Lays the stem and the head for one moment, for the plant chosen by `usePlant`.
export function poseAt(time: number, inputs: PlantInputs): Pose {
  pose.time = time
  pose.inputs = inputs
  pose.length = stemLength(time, inputs)
  layStem(time, inputs)
  pose.head = layHead(time, pose.length)
  return pose
}

// A place on the stem at a share u of its length: the point, the stem's direction t and two directions r and b across it, carried along without twist.
export function stemAt(p: Pose, u: number): Node {
  return stemNode(u, p.length)
}

// Where a leaf leaves the stem: the point o, the direction m it runs along, the direction w across it and its upper side n.
export function leafFrameAt(p: Pose, i: number): Frame {
  return leafFrame(i, p.time, p.inputs, p.length)
}

export function seedLeafFrameAt(p: Pose, side: number): Frame {
  return seedLeafFrame(side, p.time, p.length)
}

export function bractFrameAt(p: Pose, j: number): Frame {
  return bractFrame(j, p.time, p.head)
}

export function rayFrameAt(p: Pose, k: number): Frame {
  return rayFrame(k, p.time, p.head)
}

// The floor of the head: the gently domed front of the receptacle, where the florets stand and the petals leave the rim.
// The bud draws it, the disc stands on it and the petals start from its rim, so all three read it from here.
export interface FloorPoint { x: number; y: number; z: number; nx: number; ny: number; nz: number; ox: number; oy: number; oz: number }
const floor: FloorPoint = { x: 0, y: 0, z: 0, nx: 0, ny: 1, nz: 0, ox: 1, oy: 0, oz: 0 }

// A point of the floor at a share rho of the head's radius (0 on the axis, 1 at the rim) and an angle theta round the axis, from p toward q:
// the point, the floor's normal n there and the direction o that points outward from the axis.
export function floorAt(p: Pose, rho: number, theta: number, out: FloorPoint = floor): FloorPoint {
  const h = p.head
  const c = Math.cos(theta)
  const s = Math.sin(theta)
  out.ox = h.px * c + h.qx * s
  out.oy = h.py * c + h.qy * s
  out.oz = h.pz * c + h.qz * s
  const r = rho * h.radius
  const up = h.depth * (FLOOR_RIM + FLOOR_DOME * (1 - rho * rho))
  out.x = h.cx + out.ox * r + h.ax * up
  out.y = h.cy + out.oy * r + h.ay * up
  out.z = h.cz + out.oz * r + h.az * up
  const slope = h.radius > 0 ? (2 * h.depth * FLOOR_DOME * rho) / h.radius : 0
  const l = norm(1, slope)
  out.nx = (h.ax + out.ox * slope) / l
  out.ny = (h.ay + out.oy * slope) / l
  out.nz = (h.az + out.oz * slope) / l
  return out
}
