import * as THREE from 'three'
import { Monotone, clamp } from '../core/curves.ts'
import { DAY, sunElevationOfPhase } from './clock.ts'

const RAD = Math.PI / 180

// Where the sun comes up and goes down, in degrees of azimuth, day by day. The lens looks toward 182 to 203 degrees,
// and a larger azimuth lies further left in the frame: every sunrise stands right of the plant and every sunset left of it.
const RISE = [175, 175.5, 176, 176.5, 177, 178, 179, 180, 181, 182, 183, 184, 185, 186, 187, 187]
const SET = [198, 198, 198.5, 199, 200, 201, 202, 203, 206, 208, 210, 212, 214, 216, 226.33, 226.33]
const rise = new Monotone(RISE.map((v, i) => [i, v] as const))
const set = new Monotone(SET.map((v, i) => [i + DAY, v] as const))

export const MOON_AZIMUTH_DEG = 168
export const MOON_ELEVATION_DEG = 13

const smooth = (x: number): number => {
  const t = clamp(x)
  return t * t * (3 - 2 * t)
}

export function direction(azimuthDeg: number, elevationDeg: number, out: THREE.Vector3): THREE.Vector3 {
  const az = azimuthDeg * RAD
  const el = elevationDeg * RAD
  return out.set(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el))
}

export function sunAzimuthAt(world: number): number {
  const day = Math.floor(world)
  const phase = world - day
  if (phase < DAY) {
    const up = rise.at(day)
    return up + (set.at(day + DAY) - up) * (phase / DAY)
  }
  const down = set.at(day + DAY)
  return down + (rise.at(day + 1) - down) * smooth(((phase - DAY) / (1 - DAY) - 0.3) / 0.4)
}

export function sunElevationAt(world: number): number {
  return sunElevationOfPhase(world - Math.floor(world))
}

export function sunDirectionAt(world: number, out: THREE.Vector3): THREE.Vector3 {
  return direction(sunAzimuthAt(world), sunElevationAt(world), out)
}

export const moonDirection = direction(MOON_AZIMUTH_DEG, MOON_ELEVATION_DEG, new THREE.Vector3())
