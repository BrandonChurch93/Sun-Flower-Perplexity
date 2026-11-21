import { config } from '../config.ts'
import { Monotone, smoothstep } from '../core/curves.ts'
import { hash01, streamSeed } from '../core/random.ts'

// What the world asks of the plant. The plant never knows which world it is in.
export interface PlantInputs {
  leanX: number
  leanZ: number
  lift: number
}

export interface Vec3 { x: number; y: number; z: number }

const SEED = streamSeed('plant')
const TAU = Math.PI * 2
const heightCurve = new Monotone(config.plant.heightM)

export const leafCount = config.plant.leafCount
const [leavesStart, leavesEnd] = config.plant.stages.leaves
const goldenRad = (config.plant.goldenAngleDeg * Math.PI) / 180
const NUTATION_SECONDS = 3.7
const INTERNODE_SECONDS = 4
const OPPOSITE_LEAVES = 6

export function heightAt(time: number): number {
  return heightCurve.at(time)
}

export function stemBaseRadius(time: number): number {
  return 0.0011 + 0.0155 * Math.pow(smoothstep(0.02, 1.7, heightAt(time)), 0.8)
}

export function stemRadius(time: number, u: number): number {
  return stemBaseRadius(time) * (1 - 0.55 * Math.pow(u, 1.5))
}

export function stemAxis(time: number, inputs: PlantInputs, u: number, out: Vec3): Vec3 {
  const h = heightAt(time)
  const young = 1 - smoothstep(0.25, 1.3, h)
  const lean = h * (0.03 + 0.09 * young)
  const circle = h * (0.006 + 0.03 * young)
  const phase = TAU * (time / NUTATION_SECONDS + hash01(SEED, 1))
  const u2 = u * u
  out.x = (inputs.leanX * lean + Math.cos(phase) * circle) * u2
  out.y = h * u
  out.z = (inputs.leanZ * lean + Math.sin(phase) * circle) * u2
  return out
}

export function stemTangent(time: number, inputs: PlantInputs, u: number, out: Vec3): Vec3 {
  const a = stemAxis(time, inputs, 1, out)
  const dx = 2 * u * a.x
  const dz = 2 * u * a.z
  const dy = heightAt(time)
  const l = Math.hypot(dx, dy, dz) || 1
  out.x = dx / l
  out.y = dy / l
  out.z = dz / l
  return out
}

export function tipAt(time: number, inputs: PlantInputs, out: Vec3): Vec3 {
  return stemAxis(time, inputs, 1, out)
}

export function leafBirth(i: number): number {
  return leavesStart + (leavesEnd - leavesStart) * Math.pow(i / (leafCount - 1), 1.6)
}

export function leafAzimuth(i: number): number {
  const turn = hash01(SEED, 2) * TAU
  if (i < OPPOSITE_LEAVES) return turn + Math.floor(i / 2) * (Math.PI / 2) + (i % 2) * Math.PI
  return turn + (i - OPPOSITE_LEAVES + 1) * goldenRad
}

export function leafAge(i: number, time: number): number {
  return time - leafBirth(i)
}

export function leafStemFraction(i: number, time: number): number {
  const age = leafAge(i, time)
  const h = heightAt(time)
  if (age <= 0 || h <= 0) return 1
  const settled = heightAt(leafBirth(i) + INTERNODE_SECONDS * (1 - Math.exp(-age / INTERNODE_SECONDS)))
  return Math.min(1, (0.93 * settled) / h)
}

export function leafLength(i: number, time: number): number {
  const age = leafAge(i, time)
  if (age <= 0) return 0
  const rank = i / (leafCount - 1)
  const full = (i < 2 ? 0.14 : 0.3 * (1 - 0.55 * Math.pow(rank, 1.2))) * (0.88 + 0.24 * hash01(SEED, 10, i))
  return full * (1 - Math.exp(-age / 4.5))
}

export function leafElevation(i: number, time: number, inputs: PlantInputs): number {
  const age = Math.max(0, leafAge(i, time))
  const open = smoothstep(0, 7, age)
  const settled = 28 - 30 * smoothstep(5, 30, age) + (hash01(SEED, 11, i) - 0.5) * 16 - (1 - inputs.lift) * 14
  return ((78 + (settled - 78) * open) * Math.PI) / 180
}

export function leafFold(i: number, time: number): number {
  const age = Math.max(0, leafAge(i, time))
  return ((80 - 70 * smoothstep(0, 6, age) + (hash01(SEED, 12, i) - 0.5) * 8) * Math.PI) / 180
}

export function plantReach(time: number): number {
  let reach = stemBaseRadius(time) + heightAt(time) * 0.16
  for (let i = 0; i < leafCount; i++) reach = Math.max(reach, leafLength(i, time) * 1.25 + stemBaseRadius(time))
  return reach
}

export function leafSeed(i: number, j: number): number {
  return hash01(SEED, 20 + j, i)
}

export function plantNumbers(time: number, inputs: PlantInputs): number[] {
  const tip = tipAt(time, inputs, { x: 0, y: 0, z: 0 })
  let leafSum = 0
  for (let i = 0; i < leafCount; i++) leafSum += leafLength(i, time)
  return [heightAt(time), tip.x, tip.y, tip.z, stemBaseRadius(time), leafSum, inputs.leanX, inputs.leanZ, inputs.lift]
}
