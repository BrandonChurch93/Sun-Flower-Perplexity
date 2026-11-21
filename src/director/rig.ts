import { config, type CameraKey } from '../config.ts'
import { Monotone } from '../core/curves.ts'

const keys = config.camera.keys

// The path from the frost key on is the finished bloom's. Its slopes at that key were set with the night key where it stood then, and they are held, so a later fit of the night key moves nothing after 36 s.
const HELD_AT = 36
const NIGHT_THEN: Partial<CameraKey> = { heightM: 0.5112, aimHeightM: 0.639, frameX: 0.6028 }
const then = keys.map((k) => (k.time === 26 ? { ...k, ...NIGHT_THEN } : k))

const track = (pick: (k: CameraKey) => number): Monotone => {
  const held = new Monotone(then.map((k) => [k.time, pick(k)] as const)).slopeAt(HELD_AT)
  return new Monotone(keys.map((k) => [k.time, pick(k)] as const), [[HELD_AT, held]])
}

const distance = track((k) => k.distanceM)
const height = track((k) => k.heightM)
const aim = track((k) => k.aimHeightM)
const frameX = track((k) => k.frameX)
const azimuth = track((k) => k.azimuthDeg)
const focal = track((k) => k.focalMm)

export interface RigPath { distanceM: number; heightM: number; aimHeightM: number; frameX: number; azimuthRad: number; focalMm: number }

export function rigPathAt(time: number): RigPath {
  return {
    distanceM: distance.at(time),
    heightM: height.at(time),
    aimHeightM: aim.at(time),
    frameX: frameX.at(time),
    azimuthRad: (azimuth.at(time) * Math.PI) / 180,
    focalMm: focal.at(time),
  }
}
