import { config, type CameraKey } from '../config.ts'
import { Monotone } from '../core/curves.ts'

const keys = config.camera.keys
const track = (pick: (k: CameraKey) => number): Monotone => new Monotone(keys.map((k) => [k.time, pick(k)] as const))

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
