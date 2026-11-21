// The pose of the plant, as every part reads it. All of it follows the timing in `growth.ts`, so a part that starts from these frames stands where the film expects it.
// The stem, the head and the frames are kept in one place each and written over by the next call. Read what you need before you ask again.
import type { PlantInputs } from './growth.ts'
import { bractFrame, layHead, layStem, leafFrame, rayFrame, seedLeafFrame, stemLength, stemNode, type Frame, type Head, type Node } from './standin.ts'

export { blade, ellipsoid, gridNormals, roll, setFrame, NECK_FLARE, SEAT, type Frame, type Head, type Node, type Outline } from './standin.ts'

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
