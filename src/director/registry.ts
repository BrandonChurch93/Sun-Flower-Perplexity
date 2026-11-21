import * as THREE from 'three'
import { config } from '../config.ts'
import type { BackdropLock, WorldDef, WorldSettings, WorldStageMaker } from '../core/world.ts'
import { declareStandIn } from '../core/standins.ts'
import type { UnitFit } from './fit.ts'
import { poseOf } from './pose.ts'
import { rigPathAt } from './rig.ts'

const worldModules = import.meta.glob<{ world: WorldSettings; stage?: WorldStageMaker }>('../worlds/*/index.ts', { eager: true })
const unitModules = import.meta.glob<{ fit: UnitFit }>('../units/*/index.ts', { eager: true })

const folder = (path: string): string => path.split('/').slice(-2)[0]

const ASPECT = config.formats.master.width / config.formats.master.height
const MIN_SUN_ELEVATION_DEG = 2

// Where the camera of a key looks, so a backdrop made from that key's approved image can be laid exactly where the image has it.
export function lockOf(keyId: string): BackdropLock {
  const key = config.keys.find((k) => k.id === keyId)
  if (!key) throw new Error(`unknown key "${keyId}"`)
  const pose = poseOf({ ...rigPathAt(key.time), fNumber: 4 }, new THREE.Vector3())
  const scaleX = pose.focalMm / config.camera.gateWidthMm
  return { right: pose.right, up: pose.up, forward: pose.forward, scaleX, scaleY: scaleX * ASPECT }
}

export function directionAt(lock: BackdropLock, x: number, y: number): THREE.Vector3 {
  return lock.forward.clone().addScaledVector(lock.right, (x - 0.5) / lock.scaleX).addScaledVector(lock.up, (0.5 - y) / lock.scaleY).normalize()
}

export function resolveWorld(id: string, settings: WorldSettings): WorldDef {
  const lock = settings.backdrop.file ? lockOf(settings.backdrop.key) : null
  const def: WorldDef = { ...settings, sun: { ...settings.sun }, id, lock }
  if (lock && settings.backdrop.sunAt) {
    const d = directionAt(lock, settings.backdrop.sunAt[0], settings.backdrop.sunAt[1])
    def.sun.azimuthDeg = (Math.atan2(d.x, d.z) * 180) / Math.PI
    def.sun.elevationDeg = Math.max(MIN_SUN_ELEVATION_DEG, (Math.asin(d.y) * 180) / Math.PI)
  }
  return def
}

export const worlds: Record<string, WorldDef> = {}
// A world's own stage, where its folder exports one as `stage`.
export const stageMakers: Record<string, WorldStageMaker> = {}
for (const [path, module] of Object.entries(worldModules)) {
  worlds[folder(path)] = resolveWorld(folder(path), module.world)
  if (module.stage) stageMakers[folder(path)] = module.stage
}

export const fits: Record<string, UnitFit> = {}
for (const [path, module] of Object.entries(unitModules)) fits[folder(path)] = module.fit

for (const w of config.worlds) {
  const def = worlds[w.id]
  if (!def) throw new Error(`src/worlds/${w.id}/index.ts is missing`)
  if (def.standIn) declareStandIn(`world ${w.id}`, config.segments.filter((s) => s.world === w.id).map((s) => s.id))
}
for (const s of config.segments) if (!fits[s.id]) throw new Error(`src/units/${s.id}/index.ts is missing`)

export function worldOf(id: string): WorldDef {
  const def = worlds[id]
  if (!def) throw new Error(`unknown world "${id}"`)
  return def
}

export function fNumberPoints(): [number, number][] {
  const points: [number, number][] = []
  for (const s of config.segments) {
    const fit = fits[s.id].fNumber
    const keys = config.keys.filter((k) => k.unit === s.id)
    if (fit.keys.length !== keys.length) throw new Error(`src/units/${s.id} gives ${fit.keys.length} f-numbers for ${keys.length} keys`)
    if (fit.start !== undefined) points.push([s.start, fit.start])
    keys.forEach((k, i) => points.push([k.time, fit.keys[i]]))
    if (fit.end !== undefined) points.push([s.end - 1 / config.film.fps, fit.end])
  }
  points.sort((a, b) => a[0] - b[0])
  return points.filter((p, i) => i === 0 || p[0] > points[i - 1][0])
}
