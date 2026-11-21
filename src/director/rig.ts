import { config, type CameraKey } from '../config.ts'
import { clamp, Monotone } from '../core/curves.ts'

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

// Up to the rain key the tilt has a track of its own, through the tilt each key gives, and the aim height follows from it.
// Distance, height and aim height each run evenly between two keys, but the tilt they give together does not: the horizon rocked up and down between the dawn keys.
const TILT_UNTIL = 14
const STEP = 1e-4
const gate = config.camera.gateWidthMm

interface Framing { distanceM: number; heightM: number; aimHeightM: number; frameX: number; focalMm: number }

// The turn `poseOf` gives the lens so the plant stands at `frameX`.
const panOf = (d: number, rise: number, at: number, focalMm: number): number => {
  const t = ((at - 0.5) * gate) / focalMm
  return Math.asin(clamp(t * Math.sqrt((d * d + rise * rise) / (d * d * (1 + t * t))), -1, 1))
}

// The tilt, as the lift of the horizon on the gate in millimeters.
const liftOf = (r: Framing): number => {
  const rise = r.aimHeightM - r.heightM
  return (rise / (r.distanceM * Math.cos(panOf(r.distanceM, rise, r.frameX, r.focalMm)))) * r.focalMm
}

const evenAt = (time: number): RigPath => ({
  distanceM: distance.at(time),
  heightM: height.at(time),
  aimHeightM: aim.at(time),
  frameX: frameX.at(time),
  azimuthRad: (azimuth.at(time) * Math.PI) / 180,
  focalMm: focal.at(time),
})

const lift = new Monotone(
  keys.filter((k) => k.time <= TILT_UNTIL).map((k) => [k.time, liftOf(k)] as const),
  [[TILT_UNTIL, (liftOf(evenAt(TILT_UNTIL + STEP)) - liftOf(evenAt(TILT_UNTIL))) / STEP]],
)

export function rigPathAt(time: number): RigPath {
  const r = evenAt(time)
  if (time >= TILT_UNTIL) return r
  const tan = lift.at(time) / r.focalMm
  let rise = r.distanceM * tan
  for (let i = 0; i < 4; i++) rise = r.distanceM * Math.cos(panOf(r.distanceM, rise, r.frameX, r.focalMm)) * tan
  r.aimHeightM = r.heightM + rise
  return r
}
