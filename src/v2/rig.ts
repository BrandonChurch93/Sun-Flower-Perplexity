import * as THREE from 'three'
import { config } from '../config.ts'
import { Monotone, clamp, lerp, smootherstep, smoothstep } from '../core/curves.ts'
import type { CameraPose } from '../core/lens.ts'
import type { Rig } from '../director/pose.ts'
import { rigPathAt, type RigPath } from '../director/rig.ts'
import { heightAt } from '../plant/model.ts'
import { barAt, tauAtBar, trapezoid } from './clock.ts'
import type { FixedView } from './shots.ts'

const RAD = Math.PI / 180
const GATE = config.camera.gateWidthMm
const ASPECT = config.formats.master.width / config.formats.master.height

// The lens stop along the plant's clock: far down for the seed, a hand's width from the glass, and open for the flower.
const stop = new Monotone([
  [1.5, 22],
  [6.5, 11],
  [14, 9],
  [26, 11],
  [36, 5.6],
  [39.96666666666667, 4.5695],
  [45, 4],
  [50.5, 4],
  [58.5, 8],
])
// How the focus is shared between the head and the stem that carries it, while the bud turns to the lens.
const share = new Monotone(
  [
    [40, 0.55],
    [42, 0.3],
    [43.5, 0.1],
    [44.5, -0.12],
    [44.75, -0.12],
    [45, 0.4],
    [46.5, 0.4],
    [48, 0.55],
  ],
  [
    [40, 0],
    [48, 0],
  ],
)

// The frost hold: the plant stands still and the lens creeps in and a little to the left, in real time, with the top of the plant held where it was. What it gained is given back in the climb.
const FROST = { from: 16.5, to: 26, back: 31.5, closer: 0.09, turnDeg: 2.4, riseM: 0.006 }
// The storm hold: the lens stands low and a body's length back, so the whole young plant, the wet soil and the sky are in the frame, and creeps in.
const STORM = { in: 28.5, from: 33, to: 41, out: 46.5 }
const STORM_F_NUMBER = 5.6
// The top of the stem never comes nearer to the top of the frame than this, as a fraction of its height: the youngest leaves stand around it.
const HEADROOM = { least: 0.05, soft: 0.02, from: 0.2, until: 0.3 }
// The crane stays lower and nearer than the path it was drawn on: from just over the tops the field closes into one sea of heads and the plant stands large against it.
// The horizon is held near a third from the top, the pair a little right of the middle with the sun on the left third, and the lens goes on rising, slowly, into the dusk.
const CRANE = { overM: 1.9, rise: 0.5, kneeM: 0.25, pastM: 4.2, back: 0.4, kneeBackM: 0.3, from: 69, to: 75, riseM: 0.1, backM: 0.1, holdFrom: 66, holdBy: 67.5, frameX: 0.57, asideFrom: 66.5, asideBy: 70.5 }
const craneHorizon = new Monotone([
  [67, 0.287],
  [69, 0.275],
  [71, 0.285],
  [73, 0.3],
  [75, 0.31],
])
// `x` as it is up to `from`, and past it only `share` of the way on, bending over `knee` with no corner.
const eased = (x: number, from: number, share: number, knee: number): number => (x <= from ? x : from + share * (x - from) + (1 - share) * knee * (1 - Math.exp(-(x - from) / knee)))

const panOf = (d: number, rise: number, at: number, focalMm: number): number => {
  const t = ((at - 0.5) * GATE) / focalMm
  return Math.asin(clamp(t * Math.sqrt((d * d + rise * rise) / (d * d * (1 + t * t))), -1, 1))
}

const reachOf = (r: RigPath, rise: number): number => r.distanceM * Math.cos(panOf(r.distanceM, rise, r.frameX, r.focalMm))
const zoomOf = (r: RigPath): number => (r.focalMm / GATE) * ASPECT

// Where the top of the stem lands in the frame, from the top, as a fraction.
function topOf(r: RigPath, topM: number): number {
  const rise = r.aimHeightM - r.heightM
  const reach = reachOf(r, rise)
  return 0.5 - Math.tan(Math.atan2(topM - r.heightM, reach) - Math.atan2(rise, reach)) * zoomOf(r)
}

// Where the horizon lands in the frame, from the top, as a fraction.
function horizonOf(r: RigPath): number {
  const rise = r.aimHeightM - r.heightM
  return 0.5 + (rise / reachOf(r, rise)) * zoomOf(r)
}

// The height the lens must aim at so that the top of the stem lands at `y`.
function aimForTop(r: RigPath, topM: number, y: number): number {
  const lift = Math.atan((0.5 - y) / zoomOf(r))
  let rise = r.aimHeightM - r.heightM
  for (let i = 0; i < 6; i++) {
    const reach = reachOf(r, rise)
    rise = reach * Math.tan(Math.atan2(topM - r.heightM, reach) - lift)
  }
  return r.heightM + rise
}

// The height the lens must aim at so that the horizon lands at `y`.
function aimForHorizon(r: RigPath, y: number): number {
  let rise = r.aimHeightM - r.heightM
  for (let i = 0; i < 6; i++) rise = ((y - 0.5) / zoomOf(r)) * reachOf(r, rise)
  return r.heightM + rise
}

function stormWeight(b: number): number {
  if (b <= STORM.in || b >= STORM.out) return 0
  if (b < STORM.from) return smootherstep(STORM.in, STORM.from, b)
  if (b <= STORM.to) return 1
  return 1 - smoothstep(STORM.to, STORM.out, b)
}

// The storm's own camera. It is a line in bars, so the creep of the hold is already under way when the lens arrives and still going when it leaves.
function stormRig(b: number): RigPath {
  const u = (b - STORM.from) / (STORM.to - STORM.from)
  const r: RigPath = { distanceM: 1.66 - 0.18 * u, heightM: 0.27 + 0.03 * u, aimHeightM: 0.42, frameX: 0.6 - 0.015 * u, azimuthRad: (7.5 + 2 * u) * RAD, focalMm: 38 }
  r.aimHeightM = aimForHorizon(r, 0.505 + 0.019 * u)
  return r
}

// The camera of the film at one film second: one move from the soil to the sky over the field.
// It follows the plant along the plant's clock, and the two holds and the last light have moves of their own in real time.
export function rigAtFilm(seconds: number): Rig {
  const b = barAt(seconds)
  const tau = tauAtBar(b)
  const topM = heightAt(tau)
  const rig: Rig = { ...rigPathAt(tau), fNumber: stop.at(tau), heldShare: share.at(tau) }

  const crept = trapezoid((b - FROST.from) / (FROST.to - FROST.from), 0.12, 0.12) * (1 - smoothstep(FROST.to, FROST.back, b))
  if (crept > 0) {
    const y = topOf(rig, topM)
    rig.distanceM *= 1 - FROST.closer * crept
    rig.azimuthRad += FROST.turnDeg * RAD * crept
    rig.heightM += FROST.riseM * crept
    rig.aimHeightM = aimForTop(rig, topM, y)
  }

  const w = stormWeight(b)
  if (w > 0) {
    const storm = stormRig(b)
    const y = lerp(topOf(rig, topM), topOf(storm, topM), w)
    const horizon = lerp(horizonOf(rig), horizonOf(storm), w)
    rig.distanceM = lerp(rig.distanceM, storm.distanceM, w)
    rig.heightM = lerp(rig.heightM, storm.heightM, w)
    rig.frameX = lerp(rig.frameX, storm.frameX, w)
    rig.azimuthRad = lerp(rig.azimuthRad, storm.azimuthRad, w)
    rig.focalMm = lerp(rig.focalMm, storm.focalMm, w)
    rig.fNumber = lerp(rig.fNumber, STORM_F_NUMBER, w)
    // Between the two cameras the aim follows the top of the plant and the horizon in equal parts, so the tilt changes direction once and not twice.
    rig.aimHeightM = 0.5 * (aimForTop(rig, topM, y) + aimForHorizon(rig, horizon))
  }

  const y = topOf(rig, topM)
  const room = 1 - smoothstep(HEADROOM.from, HEADROOM.until, y)
  if (room > 0) rig.aimHeightM = aimForTop(rig, topM, lerp(y, 0.5 * (y + HEADROOM.least + Math.sqrt((y - HEADROOM.least) * (y - HEADROOM.least) + HEADROOM.soft * HEADROOM.soft)), room))

  const held = smoothstep(CRANE.holdFrom, CRANE.holdBy, b)
  if (held > 0) {
    const up = smoothstep(CRANE.from, CRANE.to, b)
    rig.heightM = eased(rig.heightM, CRANE.overM, CRANE.rise, CRANE.kneeM) + CRANE.riseM * up
    rig.distanceM = eased(rig.distanceM, CRANE.pastM, CRANE.back, CRANE.kneeBackM) + CRANE.backM * up
    rig.frameX = lerp(rig.frameX, CRANE.frameX, smoothstep(CRANE.asideFrom, CRANE.asideBy, b))
    rig.aimHeightM = lerp(rig.aimHeightM, aimForHorizon(rig, craneHorizon.at(Math.max(b, 67))), held)
  }
  return rig
}

export function fixedPose(v: FixedView): CameraPose {
  const az = v.azimuthDeg * RAD
  const heading = v.headingDeg * RAD
  const pitch = v.pitchDeg * RAD
  const level = new THREE.Vector3(Math.sin(heading), 0, Math.cos(heading))
  const right = new THREE.Vector3(-Math.cos(heading), 0, Math.sin(heading))
  const forward = level.clone().multiplyScalar(Math.cos(pitch)).setY(Math.sin(pitch))
  const up = new THREE.Vector3().crossVectors(right, forward).normalize()
  return { position: new THREE.Vector3(v.distanceM * Math.sin(az), v.heightM, v.distanceM * Math.cos(az)), forward, right, up, focalMm: v.focalMm, focusM: v.focusM, fNumber: v.fNumber }
}
