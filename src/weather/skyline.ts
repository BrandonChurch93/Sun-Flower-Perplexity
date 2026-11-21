import * as THREE from 'three'
import { hash01, streamSeed } from '../core/random.ts'

// The line where the land meets the sky: the ridges by bearing, the far tree lines and the row of trees that stands right behind the field's far edge. Every world draws the same line in its own colors.
const SEED = streamSeed('golden far')
const RAD = Math.PI / 180

export const FIELD_EDGE_M = 66
export const SKYLINE_LAND_FROM_M = 68
export const SKYLINE_LAND_TO_M = 5900

export interface SkylineLayer {
  name: string
  radiusM: number
  wander: number
  // The top of a far layer as the angle it stands above the horizon, seen from the plant.
  lowDeg: number
  highDeg: number
  cells: number
  segments: number
  trees: boolean
  // The width of one crown, in meters, and the share of the top that the canopy never falls under.
  crownM: number
  floor: number
  // Toward the sun the layer stands this high instead, as one dark ridge under the sun.
  sunward?: [number, number]
  // A near row is given by the height of its trees in meters, and by the height it has under the sun instead.
  rowM?: [number, number]
  bankM?: number
  bankDeg?: [number, number]
}

export const SKYLINE: SkylineLayer[] = [
  { name: 'far ridge', radiusM: 5400, wander: 0.04, lowDeg: 0.5, highDeg: 1.9, cells: 22, segments: 1440, trees: false, crownM: 15, floor: 0.45 },
  { name: 'middle ridge', radiusM: 3900, wander: 0.06, lowDeg: 0.35, highDeg: 1.7, cells: 27, segments: 1440, trees: false, crownM: 15, floor: 0.45 },
  { name: 'near ridge', radiusM: 2500, wander: 0.08, lowDeg: 0.3, highDeg: 1.5, cells: 33, segments: 1440, trees: false, crownM: 15, floor: 0.45, sunward: [1.1, 1.75] },
  { name: 'far trees', radiusM: 1500, wander: 0.1, lowDeg: 0.35, highDeg: 1.0, cells: 40, segments: 1800, trees: true, crownM: 15, floor: 0.45 },
  { name: 'tree line', radiusM: 700, wander: 0.12, lowDeg: 0.7, highDeg: 1.4, cells: 40, segments: 2880, trees: true, crownM: 15, floor: 0.45 },
  { name: 'tree row back', radiusM: 84, wander: 0.03, lowDeg: 0, highDeg: 0, cells: 70, segments: 2880, trees: true, crownM: 2.6, floor: 0.62, rowM: [3.8, 4.7], bankM: 1.5 },
  { name: 'tree row', radiusM: 79, wander: 0.03, lowDeg: 0, highDeg: 0, cells: 90, segments: 2880, trees: true, crownM: 2.1, floor: 0.62, rowM: [3.7, 4.6], bankM: 1.5 },
  { name: 'foot of the row', radiusM: 77, wander: 0.01, lowDeg: 0, highDeg: 0, cells: 40, segments: 1440, trees: false, crownM: 2, floor: 1, rowM: [0, 0], bankM: 2.85, bankDeg: [400, 399] },
  { name: 'bank under the sun', radiusM: 75, wander: 0.01, lowDeg: 0, highDeg: 0, cells: 40, segments: 1440, trees: false, crownM: 2, floor: 1, rowM: [0, 0], bankM: 2.95, bankDeg: [38, 25] },
]

const SUN_GAP_DEG = 9
const SUN_GAP_TOP_DEG = 1.1
const SUN_RIDGE_TOP_DEG = 1.5

function wrapNoise(az: number, cells: number, salt: number): number {
  const x = (az / (2 * Math.PI)) * cells
  const i = Math.floor(x)
  const f = x - i
  const s = f * f * (3 - 2 * f)
  const a = hash01(SEED + salt, ((i % cells) + cells) % cells)
  const b = hash01(SEED + salt, (((i + 1) % cells) + cells) % cells)
  return a + (b - a) * s
}

const smooth = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

function ridged(az: number, cells: number, salt: number): number {
  return 0.56 * wrapNoise(az, cells, salt) + 0.27 * wrapNoise(az, cells * 2, salt + 1) + 0.12 * wrapNoise(az, cells * 5, salt + 2) + 0.05 * wrapNoise(az, cells * 11, salt + 3)
}

// Where layer i stands at a bearing (radians, from +z toward +x) and how high its top is there, in meters.
export function skylineAt(i: number, az: number, sunAzimuthDeg: number): { radius: number; top: number } {
  const layer = SKYLINE[i]
  const sunAz = sunAzimuthDeg * RAD
  const radius = layer.radiusM * (1 + layer.wander * (2 * wrapNoise(az, 7, 40 + i * 10) - 1))
  const shape = layer.trees ? 0.6 * wrapNoise(az, layer.cells, 100 + i * 10) + 0.4 * wrapNoise(az, layer.cells * 3, 101 + i * 10) : ridged(az, layer.cells, 100 + i * 10)
  let off = Math.abs(az - sunAz) % (2 * Math.PI)
  if (off > Math.PI) off = 2 * Math.PI - off
  if (layer.rowM) {
    const near = smooth(layer.bankDeg?.[0] ?? 24, layer.bankDeg?.[1] ?? 11, off / RAD)
    const tall = layer.rowM[0] + (layer.rowM[1] - layer.rowM[0]) * shape
    return { radius, top: tall + ((layer.bankM ?? tall) - tall) * near }
  }
  let deg = layer.lowDeg + (layer.highDeg - layer.lowDeg) * shape
  const gap = Math.max(0, 1 - off / (SUN_GAP_DEG * RAD))
  const open = gap * gap * (3 - 2 * gap)
  if (!layer.trees) deg *= 1 - 0.55 * smooth(12, 30, off / RAD)
  if (layer.sunward) {
    const near = smooth(30, 12, off / RAD)
    deg = deg * (1 - near) + (layer.sunward[0] + (layer.sunward[1] - layer.sunward[0]) * shape) * near
  }
  deg = deg * (1 - open) + Math.min(deg, layer.sunward ? SUN_RIDGE_TOP_DEG : SUN_GAP_TOP_DEG * (0.55 + 0.45 * i / 4)) * open
  if (layer.trees) {
    // The far trees stand in stretches with open country between them, and the one sure opening lies just right of the sun, where the ridge shows.
    const right = ((((sunAz - az) / RAD + 180) % 360) + 360) % 360 - 180
    const stand = Math.min(layer.name === 'tree line' ? 1 : smooth(0.34, 0.56, wrapNoise(az, 10, 300 + i * 10)), smooth(5, 11, Math.abs(right - 8)))
    deg = 0.22 + (deg - 0.22) * stand
  }
  return { radius, top: radius * Math.tan(deg * RAD) }
}

// A standing strip round the plant. Its aInfo is the run along it in meters, the height above the ground and the height of its top there.
export function ringStrip(segments: number, at: (az: number) => { radius: number; top: number }): THREE.BufferGeometry {
  const position = new Float32Array((segments + 1) * 2 * 3)
  const info = new Float32Array((segments + 1) * 2 * 3)
  const index: number[] = []
  let run = 0
  let px = 0
  let pz = 0
  for (let s = 0; s <= segments; s++) {
    const az = (s / segments) * 2 * Math.PI
    const { radius, top } = at(s === segments ? 0 : az)
    const x = Math.sin(az) * radius
    const z = Math.cos(az) * radius
    if (s > 0) run += Math.hypot(x - px, z - pz)
    px = x
    pz = z
    for (let k = 0; k < 2; k++) {
      const v = (s * 2 + k) * 3
      position[v] = x
      position[v + 1] = k ? top : -4
      position[v + 2] = z
      info[v] = run
      info[v + 1] = k ? top : -4
      info[v + 2] = top
    }
    if (s < segments) {
      const a = s * 2
      index.push(a, a + 2, a + 1, a + 1, a + 2, a + 3)
    }
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(position, 3))
  geometry.setAttribute('aInfo', new THREE.BufferAttribute(info, 3))
  geometry.setIndex(index)
  return geometry
}

export const skylineLayerSalt = (i: number): number => i * 17.3 + 1.7

export function skylineStrip(i: number, sunAzimuthDeg: number): THREE.BufferGeometry {
  return ringStrip(SKYLINE[i].segments, (az) => skylineAt(i, az, sunAzimuthDeg))
}

// Through the film. Early on the near rows stand low and, where the dawn sun rises, the land lies under the sun's lower limb. Both ease to the golden hour's line in the frost, before the bloom. One curve of film time for every world, so no cut moves the line.
export const SKYLINE_DAWN_SUN_DEG = 175.007
const EARLY_ROW = 0.3
const DAWN_FULL_DEG = 14
const DAWN_CLEAR_DEG = 26
const UNDER_DAWN_SUN_DEG = [0.3, 0.34, 0.4, 0.42, 0.46, 0.4, 0.44, 0.3, 0.3]

// 1 until 30 s, 0 from 38 s.
export const skylineEarly = (time: number): number => 1 - smooth(30, 38, time)

function earlyTop(i: number, az: number, radius: number, top: number): number {
  const low = SKYLINE[i].rowM ? top * EARLY_ROW : top
  let off = Math.abs(az - SKYLINE_DAWN_SUN_DEG * RAD) % (2 * Math.PI)
  if (off > Math.PI) off = 2 * Math.PI - off
  const cap = radius * Math.tan(UNDER_DAWN_SUN_DEG[i] * RAD)
  return low + (Math.min(low, cap) - low) * smooth(DAWN_CLEAR_DEG, DAWN_FULL_DEG, off / RAD)
}

// Where layer i stands at a bearing and how high its top is there at a time of the film.
export function skylineAtTime(i: number, az: number, sunAzimuthDeg: number, time: number): { radius: number; top: number } {
  const at = skylineAt(i, az, sunAzimuthDeg)
  const early = skylineEarly(time)
  return early > 0 ? { radius: at.radius, top: at.top + (earlyTop(i, az, at.radius, at.top) - at.top) * early } : at
}

export interface SkylineRing {
  geometry: THREE.BufferGeometry
  // Call once a frame, before it is drawn, with the frame's time in seconds of the film.
  setTime(time: number): void
}

// The strip of layer i that follows the film's time. A world draws it in place of skylineStrip and calls setTime in prepare.
export function skylineRing(i: number, sunAzimuthDeg: number): SkylineRing {
  const segments = SKYLINE[i].segments
  const late = new Float32Array(segments + 1)
  const early = new Float32Array(segments + 1)
  for (let s = 0; s <= segments; s++) {
    const az = s === segments ? 0 : (s / segments) * 2 * Math.PI
    const at = skylineAt(i, az, sunAzimuthDeg)
    late[s] = at.top
    early[s] = earlyTop(i, az, at.radius, at.top)
  }
  const geometry = skylineStrip(i, sunAzimuthDeg)
  const position = geometry.getAttribute('position') as THREE.BufferAttribute
  const info = geometry.getAttribute('aInfo') as THREE.BufferAttribute
  let set = 0
  return {
    geometry,
    setTime(time: number): void {
      const w = skylineEarly(time)
      if (w === set) return
      set = w
      for (let s = 0; s <= segments; s++) {
        const top = late[s] + (early[s] - late[s]) * w
        const v = s * 6
        position.array[v + 4] = top
        info.array[v + 2] = top
        info.array[v + 4] = top
        info.array[v + 5] = top
      }
      position.needsUpdate = true
      info.needsUpdate = true
    },
  }
}

// For a layer of trees: the height of the canopy at a run along the strip, as a share of the strip's top. It needs valueNoise and hash21.
export const skylineCanopy = /* glsl */ `
float skylineCrown(float run, float widthM, float salt) {
  float c = run / widthM;
  float f = 2.0 * fract(c) - 1.0;
  return (0.35 + 0.65 * hash21(vec2(floor(c), salt))) * sqrt(max(0.0, 1.0 - f * f));
}
float skylineCanopy(float run, float crownM, float layer, float low) {
  float u = run / crownM;
  float stand = smoothstep(0.2, 0.8, 0.6 * valueNoise(vec2(u * 0.39, layer)) + 0.4 * valueNoise(vec2(u * 1.05, layer + 3.0)));
  float crowns = max(skylineCrown(run, crownM, layer), max(skylineCrown(run + 0.33 * crownM, 0.63 * crownM, layer + 2.0), skylineCrown(run + 0.13 * crownM, 0.37 * crownM, layer + 4.0)));
  return low + (1.0 - low) * (0.67 * stand + 0.33 * crowns);
}
`
